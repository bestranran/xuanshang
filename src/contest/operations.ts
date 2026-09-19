import { HttpError, prisma } from "wasp/server";
import type {
  AnswerContestQuestion, AskContestQuestion, CancelContest,
  CloseContest,
  CreateContest,
  GetContestDetails,
  GetContests,
  SelectContestWinners,
  SetContestAwardBlocked,
  SetContestEntryFeedback,
  SubmitContest,
  SubmitContestEntry,
} from "wasp/server/operations";
import * as z from "zod";
import { splitEscrow } from "../bounty/core";
import { sendUserEmail } from "../server/userEmailNotifications";
import { calculateContestPrizeTotal } from "./core";
import { parseInput as input, requireAdmin as admin, requireUser as user, serializable } from "../server/operationUtils";
import { applyWalletMutation } from "../server/walletService";

const contestInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(20_000),
  firstPrizeCents: z.number().int().positive().max(100_000_000),
  secondPrizeCents: z.number().int().positive().max(100_000_000).optional(),
  thirdPrizeCents: z.number().int().positive().max(100_000_000).optional(),
  submissionDeadline: z.coerce.date(),
});

export const getContests: GetContests<{ search?: string }, any> = async (raw, context) => {
  const args = input(z.object({ search: z.string().max(100).optional() }), raw ?? {});
  const publicStatuses = ["OPEN", "JUDGING", "COOLING", "COMPLETED"] as const;
  const visibility = context.user
    ? { OR: [{ status: { in: [...publicStatuses] } }, { publisherId: context.user.id }] }
    : { status: { in: [...publicStatuses] } };
  return prisma.contest.findMany({
    where: { ...visibility, ...(args.search ? { title: { contains: args.search, mode: "insensitive" as const } } : {}) },
    include: { publisher: { select: { id: true, username: true } }, prizes: { orderBy: { amountCents: "desc" } }, _count: { select: { entries: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
};

export const getContestDetails: GetContestDetails<{ id: string }, any> = async (raw, context) => {
  const { id } = input(z.object({ id: z.string().uuid() }), raw);
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      publisher: { select: { id: true, username: true, avatarUrl: true, bio: true } },
      prizes: { include: { winner: { include: { entrant: { select: { id: true, username: true } } } }, award: true }, orderBy: { amountCents: "desc" } },
      entries: { include: { entrant: { select: { id: true, username: true } }, versions: { include: { files: { where: { status: "ATTACHED" } } }, orderBy: { version: "asc" } } }, orderBy: { submittedAt: "asc" } },
      questions: { include: { asker: { select: { id: true, username: true, avatarUrl: true } }, answerer: { select: { id: true, username: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!contest) throw new HttpError(404);
  const isAdmin = Boolean(context.user?.isAdmin);
  const isPublisher = context.user?.id === contest.publisherId;
  if (!isAdmin && !isPublisher && !["OPEN", "JUDGING", "COOLING", "COMPLETED"].includes(contest.status)) throw new HttpError(404);
  const ownEntry = contest.entries.find((entry) => entry.entrantId === context.user?.id);
  const publicGallery = ["COOLING", "COMPLETED"].includes(contest.status);
  const visibleEntries = isAdmin || isPublisher || publicGallery ? contest.entries : ownEntry ? [ownEntry] : [];
  return { ...contest, entries: visibleEntries.map((entry) => {
    const versions = isAdmin || isPublisher || entry.entrantId === context.user?.id ? entry.versions : entry.versions.slice(-1);
    return { ...entry, content: entry.versions.at(-1)?.content ?? "", versions };
  }) };
};

export const createContest: CreateContest<z.infer<typeof contestInput>, any> = async (raw, context) => {
  const current = user(context);
  const args = input(contestInput, raw);
  if (args.submissionDeadline <= new Date()) throw new HttpError(400, "投稿截止时间必须晚于当前时间");
  if (args.thirdPrizeCents && !args.secondPrizeCents) throw new HttpError(400, "设置三等奖前需要先设置二等奖");
  const prizeInputs = [["FIRST", args.firstPrizeCents], ["SECOND", args.secondPrizeCents], ["THIRD", args.thirdPrizeCents]].filter((item): item is ["FIRST" | "SECOND" | "THIRD", number] => typeof item[1] === "number");
  const totalPrizeCents = calculateContestPrizeTotal(prizeInputs.map(([, amount]) => amount));
  if (totalPrizeCents > 100_000_000) throw new HttpError(400, "奖金总额不能超过 100 万元");
  return prisma.$transaction(async (tx) => {
    const contest = await tx.contest.create({
      data: {
        publisherId: current.id,
        title: args.title,
        description: args.description,
        totalPrizeCents,
        submissionDeadline: args.submissionDeadline,
        prizes: { create: prizeInputs.map(([rank, amountCents]) => ({ rank, amountCents })) },
      },
      include: { prizes: true },
    });
    const wallet = await tx.walletAccount.upsert({ where: { userId: current.id }, update: {}, create: { userId: current.id } });
    let parts;
    try { parts = splitEscrow(totalPrizeCents, wallet.rechargeAvailableCents, wallet.earningsAvailableCents); }
    catch {
      const pending = await tx.contest.update({ where: { id: contest.id }, data: { status: "PENDING_PAYMENT" }, include: { prizes: true } });
      const availableCents = wallet.rechargeAvailableCents + wallet.earningsAvailableCents;
      return { ...pending, paymentShortfall: { requiredCents: totalPrizeCents, availableCents, shortfallCents: totalPrizeCents - availableCents } };
    }
    await applyWalletMutation(tx, { userId: current.id, delta: { rechargeCents: -parts.rechargeCents, earningsCents: -parts.earningsCents }, type: "CONTEST_ESCROW_HELD", referenceType: "CONTEST", referenceId: contest.id, idempotencyKey: `contest:${contest.id}:hold` });
    await tx.contestEscrow.create({ data: { contestId: contest.id, publisherId: current.id, ...parts } });
    return tx.contest.update({ where: { id: contest.id }, data: { status: "OPEN" }, include: { prizes: true } });
  }, serializable);
};

export const submitContest: SubmitContest<{ contestId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { contestId } = input(z.object({ contestId: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const contest = await tx.contest.findUnique({ where: { id: contestId }, include: { escrow: true } });
    if (!contest || contest.publisherId !== current.id) throw new HttpError(404);
    if (contest.status !== "PENDING_PAYMENT" || contest.escrow) throw new HttpError(409, "比赛当前不可提交");
    if (contest.submissionDeadline <= new Date()) throw new HttpError(409, "投稿截止时间已过");
    const wallet = await tx.walletAccount.upsert({ where: { userId: current.id }, update: {}, create: { userId: current.id } });
    let parts;
    try { parts = splitEscrow(contest.totalPrizeCents, wallet.rechargeAvailableCents, wallet.earningsAvailableCents); }
    catch { throw new HttpError(409, "余额不足，请先充值"); }
    await applyWalletMutation(tx, { userId: current.id, delta: { rechargeCents: -parts.rechargeCents, earningsCents: -parts.earningsCents }, type: "CONTEST_ESCROW_HELD", referenceType: "CONTEST", referenceId: contest.id, idempotencyKey: `contest:${contest.id}:hold` });
    await tx.contestEscrow.create({ data: { contestId, publisherId: current.id, ...parts } });
    return tx.contest.update({ where: { id: contest.id }, data: { status: "OPEN" } });
  }, serializable);
};

export const cancelContest: CancelContest<{ contestId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { contestId } = input(z.object({ contestId: z.string().uuid() }), raw);
  const contest = await prisma.contest.findUnique({ where: { id: contestId } });
  if (!contest || contest.publisherId !== current.id) throw new HttpError(404);
  if (contest.status !== "PENDING_PAYMENT") throw new HttpError(409, "比赛当前不可取消");
  return prisma.contest.update({ where: { id: contest.id }, data: { status: "CANCELLED" } });
};

export const submitContestEntry: SubmitContestEntry<{ contestId: string; content: string; fileIds?: string[] }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ contestId: z.string().uuid(), content: z.string().trim().min(10).max(20_000), fileIds: z.array(z.string().uuid()).max(6).default([]) }), raw);
  const contest = await prisma.contest.findUnique({ where: { id: args.contestId } });
  if (!contest || contest.status !== "OPEN" || contest.submissionDeadline <= new Date()) throw new HttpError(409, "当前不可投稿");
  if (contest.publisherId === current.id) throw new HttpError(403, "不能参加自己发布的比赛");
  const entry = await prisma.$transaction(async (tx) => {
    const files = args.fileIds.length ? await tx.file.findMany({ where: { id: { in: args.fileIds }, userId: current.id, targetType: "CONTEST", targetId: contest.id, status: "READY" } }) : [];
    if (files.length !== new Set(args.fileIds).size) throw new HttpError(400, "附件不存在、尚未上传完成或不属于当前比赛");
    if (files.filter((file) => file.kind === "VIDEO").length > 1 || files.filter((file) => file.kind === "ATTACHMENT").length > 5) throw new HttpError(400, "每版最多上传 1 个视频和 5 个普通附件");
    const saved = await tx.contestEntry.upsert({ where: { contestId_entrantId: { contestId: contest.id, entrantId: current.id } }, update: { updatedAt: new Date() }, create: { contestId: contest.id, entrantId: current.id } });
    const versionCount = await tx.contestEntryVersion.count({ where: { contestEntryId: saved.id } });
    const version = await tx.contestEntryVersion.create({ data: { contestEntryId: saved.id, content: args.content, version: versionCount + 1 } });
    if (files.length) {
      const attached = await tx.file.updateMany({ where: { id: { in: files.map((file) => file.id) }, status: "READY" }, data: { status: "ATTACHED", contestEntryVersionId: version.id, attachedAt: new Date(), deleteAfter: null } });
      if (attached.count !== files.length) throw new HttpError(409, "附件状态已变化，请重新提交");
    }
    return saved;
  }, serializable);
  void sendUserEmail(prisma, contest.publisherId, "contestEmails", "比赛收到新投稿", `“${contest.title}”收到了一份投稿，请在投稿截止后进行评选。`);
  return entry;
};

export const selectContestWinners: SelectContestWinners<{ contestId: string; firstEntryId: string; secondEntryId?: string; thirdEntryId?: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ contestId: z.string().uuid(), firstEntryId: z.string().uuid(), secondEntryId: z.string().uuid().optional(), thirdEntryId: z.string().uuid().optional() }), raw);
  const selections = [["FIRST", args.firstEntryId], ["SECOND", args.secondEntryId], ["THIRD", args.thirdEntryId]].filter((item): item is ["FIRST" | "SECOND" | "THIRD", string] => Boolean(item[1]));
  const winnerIds = selections.map(([, entryId]) => entryId);
  if (new Set(winnerIds).size !== winnerIds.length) throw new HttpError(400, "每个奖项必须由不同参赛者获得");
  const result = await prisma.$transaction(async (tx) => {
    const contest = await tx.contest.findUnique({ where: { id: args.contestId }, include: { prizes: true, escrow: true, awards: true } });
    if (!contest || contest.publisherId !== current.id) throw new HttpError(404);
    if (contest.submissionDeadline > new Date()) throw new HttpError(409, "投稿截止后才能评奖");
    if (!["OPEN", "JUDGING"].includes(contest.status) || !contest.escrow || contest.escrow.status !== "HELD" || contest.awards.length) throw new HttpError(409, "比赛当前不可评奖");
    const entries = await tx.contestEntry.findMany({ where: { contestId: contest.id, id: { in: winnerIds } } });
    if (selections.length !== contest.prizes.length || entries.length !== selections.length) throw new HttpError(400, "请为每个奖项选择一位本场参赛者");
    const prizeByRank = new Map(contest.prizes.map((prize) => [prize.rank, prize]));
    const availableAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    for (const [rank, entryId] of selections) {
      const prize = prizeByRank.get(rank);
      const entry = entries.find((item) => item.id === entryId);
      if (!prize || !entry) throw new HttpError(409, "比赛奖项配置不完整");
      await tx.contestPrize.update({ where: { id: prize.id }, data: { winnerEntryId: entry.id } });
      await tx.contestAward.create({ data: { contestId: contest.id, prizeId: prize.id, recipientId: entry.entrantId, amountCents: prize.amountCents, availableAt } });
    }
    await tx.contest.update({ where: { id: contest.id }, data: { status: "COOLING" } });
    return { contestId: contest.id, status: "COOLING", availableAt };
  }, serializable);
  const winners = await prisma.contestEntry.findMany({ where: { id: { in: winnerIds } }, select: { entrantId: true, contest: { select: { title: true } } } });
  for (const winner of winners) void sendUserEmail(prisma, winner.entrantId, "contestEmails", "恭喜你在比赛中获奖", `你在“${winner.contest.title}”中获奖，奖金将在冷却期结束后到账。`);
  return result;
};

export const setContestEntryFeedback: SetContestEntryFeedback<{ entryId: string; shortlisted: boolean; feedback?: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ entryId: z.string().uuid(), shortlisted: z.boolean(), feedback: z.string().trim().max(2_000).optional() }), raw);
  const entry = await prisma.contestEntry.findUnique({ where: { id: args.entryId }, include: { contest: true } });
  if (!entry || entry.contest.publisherId !== current.id) throw new HttpError(404);
  if (entry.contest.submissionDeadline > new Date() || !["OPEN", "JUDGING"].includes(entry.contest.status)) throw new HttpError(409, "投稿截止后才能评审");
  return prisma.contestEntry.update({ where: { id: entry.id }, data: { shortlisted: args.shortlisted, privateFeedback: args.feedback || null } });
};

export const askContestQuestion: AskContestQuestion<{ contestId: string; question: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ contestId: z.string().uuid(), question: z.string().trim().min(3).max(1_000) }), raw);
  const contest = await prisma.contest.findUnique({ where: { id: args.contestId } });
  if (!contest || contest.status !== "OPEN" || contest.submissionDeadline <= new Date()) throw new HttpError(409, "当前不可提问");
  return prisma.contestQuestion.create({ data: { contestId: contest.id, askerId: current.id, question: args.question } });
};

export const answerContestQuestion: AnswerContestQuestion<{ questionId: string; answer: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ questionId: z.string().uuid(), answer: z.string().trim().min(2).max(2_000) }), raw);
  const question = await prisma.contestQuestion.findUnique({ where: { id: args.questionId }, include: { contest: true } });
  if (!question || question.contest.publisherId !== current.id) throw new HttpError(404);
  return prisma.contestQuestion.update({ where: { id: question.id }, data: { answer: args.answer, answererId: current.id, answeredAt: new Date() } });
};

export const closeContest: CloseContest<{ contestId: string; reason: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ contestId: z.string().uuid(), reason: z.string().trim().min(3).max(2_000) }), raw);
  return prisma.$transaction(async (tx) => {
    const contest = await tx.contest.findUnique({ where: { id: args.contestId }, include: { escrow: true, awards: true } });
    if (!contest || ["COMPLETED", "REFUNDED", "CLOSED", "CANCELLED"].includes(contest.status)) throw new HttpError(409, "比赛当前不可关闭");
    if (contest.awards.length) throw new HttpError(409, "比赛已经评奖，请先在奖励页面处理");
    const afterStatus = contest.escrow?.status === "HELD" ? "REFUNDED" : "CLOSED";
    if (contest.escrow?.status === "HELD") {
      await applyWalletMutation(tx, { userId: contest.publisherId, delta: { rechargeCents: contest.escrow.rechargeCents, earningsCents: contest.escrow.earningsCents }, type: "CONTEST_ESCROW_REFUNDED", referenceType: "CONTEST", referenceId: contest.id, idempotencyKey: `contest:${contest.id}:admin-close-refund` });
      await tx.contestEscrow.update({ where: { contestId: contest.id }, data: { status: "RELEASED", releasedAt: new Date() } });
    }
    await tx.contest.update({ where: { id: contest.id }, data: { status: afterStatus } });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: afterStatus === "REFUNDED" ? "CONTEST_CLOSED_AND_REFUNDED" : "CONTEST_CLOSED", targetType: "CONTEST", targetId: contest.id, metadata: { reason: args.reason } } });
    return { id: contest.id, status: afterStatus };
  }, serializable);
};

export const setContestAwardBlocked: SetContestAwardBlocked<{ awardId: string; blocked: boolean; reason?: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ awardId: z.string().uuid(), blocked: z.boolean(), reason: z.string().trim().min(3).max(2_000).optional() }), raw);
  if (args.blocked && !args.reason) throw new HttpError(400, "拦截原因必填");
  const award = await prisma.contestAward.findUnique({ where: { id: args.awardId } });
  if (!award || !["COOLING", "BLOCKED"].includes(award.status)) throw new HttpError(409, "该奖励当前不可操作");
  const updated = await prisma.contestAward.update({ where: { id: award.id }, data: args.blocked ? { status: "BLOCKED", blockedReason: args.reason } : { status: "COOLING", blockedReason: null, availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  await prisma.adminAuditLog.create({ data: { adminId: current.id, action: args.blocked ? "CONTEST_AWARD_BLOCKED" : "CONTEST_AWARD_UNBLOCKED", targetType: "CONTEST_AWARD", targetId: award.id, metadata: { reason: args.reason ?? null } } });
  return updated;
};
