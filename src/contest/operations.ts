import { HttpError, prisma } from "wasp/server";
import type {
  CancelContest,
  CloseContest,
  CreateContest,
  GetContestDetails,
  GetContests,
  SelectContestWinners,
  SetContestAwardBlocked,
  SubmitContest,
  SubmitContestEntry,
} from "wasp/server/operations";
import * as z from "zod";
import { splitEscrow } from "../bounty/core";
import { buildContestPrizeSelections, calculateContestPrizeTotal } from "./core";

const serializable = { isolationLevel: "Serializable" as const };

function input<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  return parsed.data;
}

function user(context: { user?: { id: string; isBanned: boolean } | null }) {
  if (!context.user) throw new HttpError(401);
  if (context.user.isBanned) throw new HttpError(403, "该账号已被封禁，当前仅可查看");
  return context.user;
}

function admin(context: { user?: { id: string; isAdmin: boolean; isBanned: boolean } | null }) {
  if (!context.user?.isAdmin) throw new HttpError(403);
  if (context.user.isBanned) throw new HttpError(403, "该管理员账号已被封禁");
  return context.user;
}

const contestInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(20_000),
  firstPrizeCents: z.number().int().positive().max(100_000_000),
  secondPrizeCents: z.number().int().positive().max(100_000_000),
  thirdPrizeCents: z.number().int().positive().max(100_000_000),
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
      publisher: { select: { id: true, username: true } },
      prizes: { include: { winner: { include: { entrant: { select: { id: true, username: true } } } }, award: true }, orderBy: { amountCents: "desc" } },
      entries: { include: { entrant: { select: { id: true, username: true } } }, orderBy: { submittedAt: "asc" } },
    },
  });
  if (!contest) throw new HttpError(404);
  const isAdmin = Boolean(context.user?.isAdmin);
  const isPublisher = context.user?.id === contest.publisherId;
  const deadlinePassed = contest.submissionDeadline <= new Date();
  const ownEntry = contest.entries.find((entry) => entry.entrantId === context.user?.id);
  return { ...contest, entries: isAdmin || isPublisher || deadlinePassed ? contest.entries : ownEntry ? [ownEntry] : [] };
};

export const createContest: CreateContest<z.infer<typeof contestInput>, any> = async (raw, context) => {
  const current = user(context);
  const args = input(contestInput, raw);
  if (args.submissionDeadline <= new Date()) throw new HttpError(400, "投稿截止时间必须晚于当前时间");
  const totalPrizeCents = calculateContestPrizeTotal([args.firstPrizeCents, args.secondPrizeCents, args.thirdPrizeCents]);
  if (totalPrizeCents > 100_000_000) throw new HttpError(400, "奖金总额不能超过 100 万元");
  return prisma.$transaction(async (tx) => {
    const contest = await tx.contest.create({
      data: {
        publisherId: current.id,
        title: args.title,
        description: args.description,
        totalPrizeCents,
        submissionDeadline: args.submissionDeadline,
        prizes: { create: [
          { rank: "FIRST", amountCents: args.firstPrizeCents },
          { rank: "SECOND", amountCents: args.secondPrizeCents },
          { rank: "THIRD", amountCents: args.thirdPrizeCents },
        ] },
      },
      include: { prizes: true },
    });
    const wallet = await tx.walletAccount.upsert({ where: { userId: current.id }, update: {}, create: { userId: current.id } });
    let parts;
    try { parts = splitEscrow(totalPrizeCents, wallet.rechargeAvailableCents, wallet.earningsAvailableCents); }
    catch { return tx.contest.update({ where: { id: contest.id }, data: { status: "PENDING_PAYMENT" }, include: { prizes: true } }); }
    const changed = await tx.walletAccount.updateMany({
      where: { userId: current.id, version: wallet.version, rechargeAvailableCents: { gte: parts.rechargeCents }, earningsAvailableCents: { gte: parts.earningsCents } },
      data: { rechargeAvailableCents: { decrement: parts.rechargeCents }, earningsAvailableCents: { decrement: parts.earningsCents }, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new HttpError(409, "余额已变化，请重试");
    await tx.contestEscrow.create({ data: { contestId: contest.id, publisherId: current.id, ...parts } });
    await tx.walletEntry.create({ data: { userId: current.id, type: "CONTEST_ESCROW_HELD", rechargeDeltaCents: -parts.rechargeCents, earningsDeltaCents: -parts.earningsCents, referenceType: "CONTEST", referenceId: contest.id, idempotencyKey: `contest:${contest.id}:hold`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents - parts.rechargeCents, earningsAvailableCents: wallet.earningsAvailableCents - parts.earningsCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
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
    const changed = await tx.walletAccount.updateMany({ where: { userId: current.id, version: wallet.version, rechargeAvailableCents: { gte: parts.rechargeCents }, earningsAvailableCents: { gte: parts.earningsCents } }, data: { rechargeAvailableCents: { decrement: parts.rechargeCents }, earningsAvailableCents: { decrement: parts.earningsCents }, version: { increment: 1 } } });
    if (changed.count !== 1) throw new HttpError(409, "余额已变化，请重试");
    await tx.contestEscrow.create({ data: { contestId, publisherId: current.id, ...parts } });
    await tx.walletEntry.create({ data: { userId: current.id, type: "CONTEST_ESCROW_HELD", rechargeDeltaCents: -parts.rechargeCents, earningsDeltaCents: -parts.earningsCents, referenceType: "CONTEST", referenceId: contest.id, idempotencyKey: `contest:${contest.id}:hold`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents - parts.rechargeCents, earningsAvailableCents: wallet.earningsAvailableCents - parts.earningsCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
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

export const submitContestEntry: SubmitContestEntry<{ contestId: string; content: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ contestId: z.string().uuid(), content: z.string().trim().min(10).max(20_000) }), raw);
  const contest = await prisma.contest.findUnique({ where: { id: args.contestId } });
  if (!contest || contest.status !== "OPEN" || contest.submissionDeadline <= new Date()) throw new HttpError(409, "当前不可投稿");
  if (contest.publisherId === current.id) throw new HttpError(403, "不能参加自己发布的比赛");
  return prisma.contestEntry.upsert({ where: { contestId_entrantId: { contestId: contest.id, entrantId: current.id } }, update: { content: args.content }, create: { contestId: contest.id, entrantId: current.id, content: args.content } });
};

export const selectContestWinners: SelectContestWinners<{ contestId: string; firstEntryId: string; secondEntryId: string; thirdEntryId: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ contestId: z.string().uuid(), firstEntryId: z.string().uuid(), secondEntryId: z.string().uuid(), thirdEntryId: z.string().uuid() }), raw);
  let selections;
  try {
    selections = buildContestPrizeSelections(args.firstEntryId, args.secondEntryId, args.thirdEntryId);
  } catch {
    throw new HttpError(400, "一、二、三等奖必须由三位不同参赛者获得");
  }
  const winnerIds = selections.map(([, entryId]) => entryId);
  return prisma.$transaction(async (tx) => {
    const contest = await tx.contest.findUnique({ where: { id: args.contestId }, include: { prizes: true, escrow: true, awards: true } });
    if (!contest || contest.publisherId !== current.id) throw new HttpError(404);
    if (contest.submissionDeadline > new Date()) throw new HttpError(409, "投稿截止后才能评奖");
    if (!["OPEN", "JUDGING"].includes(contest.status) || !contest.escrow || contest.escrow.status !== "HELD" || contest.awards.length) throw new HttpError(409, "比赛当前不可评奖");
    const entries = await tx.contestEntry.findMany({ where: { contestId: contest.id, id: { in: winnerIds } } });
    if (entries.length !== 3) throw new HttpError(400, "获奖者必须来自本场比赛");
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
      const wallet = await tx.walletAccount.update({ where: { userId: contest.publisherId }, data: { rechargeAvailableCents: { increment: contest.escrow.rechargeCents }, earningsAvailableCents: { increment: contest.escrow.earningsCents }, version: { increment: 1 } } });
      await tx.walletEntry.create({ data: { userId: contest.publisherId, type: "CONTEST_ESCROW_REFUNDED", rechargeDeltaCents: contest.escrow.rechargeCents, earningsDeltaCents: contest.escrow.earningsCents, referenceType: "CONTEST", referenceId: contest.id, idempotencyKey: `contest:${contest.id}:admin-close-refund`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents, earningsAvailableCents: wallet.earningsAvailableCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
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
