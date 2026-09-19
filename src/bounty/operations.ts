import crypto from "node:crypto";
import type { TaskStatus } from "@prisma/client";
import { env, HttpError, prisma } from "wasp/server";
import type {
  AnswerTaskQuestion, AppealTaskRejection, AskTaskQuestion, CancelBountyTask, CancelWithdrawal, ConfirmDelivery, ConfirmWithdrawal, CreateBountyTask, CreateWorkReview,
  CloseBountyTask, CreateRechargeOrder, CreateWithdrawal, FinalizeWithdrawal, GetAdminOverview, GetAdminWalletEntries, GetPublicSiteSettings,
  GetMyWork, GetPublicProfile, GetTaskDetails, GetTasks, GetWallet, IssueWithdrawalToken, ReleaseTaskClaim, ClaimBountyTask, ResolveTaskAppeal, ReviewBountyTask, ReviewTaskSubmission,
  SetAwardBlocked, SubmitBountyTask, SubmitDelivery, UpdateProfile, GetSystemSettingsForAdmin, UpdateSystemSettings,
} from "wasp/server/operations";
import * as z from "zod";
import { calculateFeeCents, decryptPayoutToken, encryptPayoutToken, formatCents, signEpayParams, splitEscrow } from "./core";
import { getSystemSettings, saveSystemSettings, secretSettingKeys, systemSettingKeys } from "../server/systemSettings";
import { sendUserEmail } from "../server/userEmailNotifications";
import { assertTaskTransition, publicTaskStatuses } from "./taskState";
import { parseInput as input, requireAdmin as admin, requireUser as user, serializable } from "../server/operationUtils";
import { applyWalletMutation } from "../server/walletService";

const taskInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(20_000),
  category: z.string().trim().min(1).max(40).default("其他"),
  privateInstructions: z.string().trim().max(10_000).optional(),
  proofRequirements: z.string().trim().min(3).max(4_000),
  workDurationHours: z.number().int().min(1).max(24 * 30),
  budgetCents: z.number().int().positive().max(100_000_000),
  claimDeadline: z.coerce.date(),
});

function configured(...values: Array<string | undefined>) {
  return values.every((value) => {
    const normalized = value?.trim().toLowerCase();
    return Boolean(normalized && normalized !== "development-placeholder" && !normalized.startsWith("replace-with-"));
  });
}

const httpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "仅支持 http 或 https 链接");

export const getTasks: GetTasks<{ search?: string; status?: string; category?: string; sort?: string }, any> = async (raw, context) => {
  const args = input(z.object({ search: z.string().max(100).optional(), status: z.string().optional(), category: z.string().max(40).optional(), sort: z.enum(["recommended", "newest", "ending", "reward"]).optional() }), raw ?? {});
  const publicStatuses: TaskStatus[] = [...publicTaskStatuses];
  const visibility = context.user
    ? { OR: [{ status: { in: publicStatuses } }, { publisherId: context.user.id }] }
    : { status: { in: publicStatuses } };
  const filters = [
    visibility,
    ...(args.status ? [{ status: args.status as never }] : []),
    ...(args.category ? [{ category: args.category }] : []),
    ...(args.search ? [{ OR: [{ title: { contains: args.search, mode: "insensitive" as const } }, { description: { contains: args.search, mode: "insensitive" as const } }] }] : []),
  ];
  return prisma.userTask.findMany({
    where: { AND: filters },
    include: { publisher: { select: { id: true, username: true, avatarUrl: true } }, assignedClaim: { select: { id: true, dueAt: true } }, award: true, _count: { select: { questions: true } } },
    orderBy: args.sort === "reward" ? { budgetCents: "desc" } : args.sort === "ending" ? { claimDeadline: "asc" } : { createdAt: "desc" },
    take: 50,
  });
};

export const getTaskDetails: GetTaskDetails<{ id: string }, any> = async (raw, context) => {
  const { id } = input(z.object({ id: z.string().uuid() }), raw);
  const task = await prisma.userTask.findUnique({
    where: { id },
    include: {
      publisher: { select: { id: true, username: true, avatarUrl: true, bio: true, skills: true } },
      assignedClaim: { include: {
        worker: { select: { id: true, username: true, avatarUrl: true } },
        submission: { include: { versions: { include: { files: { where: { status: "ATTACHED" } } }, orderBy: { version: "asc" } } } },
        reviews: { include: { reviewer: { select: { id: true, username: true, avatarUrl: true } }, reviewee: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } },
      } },
      claims: { include: { worker: { select: { id: true, username: true, avatarUrl: true } } }, orderBy: { claimedAt: "desc" } },
      questions: { include: { asker: { select: { id: true, username: true, avatarUrl: true } }, answerer: { select: { id: true, username: true } } }, orderBy: { createdAt: "asc" } },
      award: true,
    },
  });
  if (!task) throw new HttpError(404);
  const isAdmin = Boolean(context.user?.isAdmin);
  const isPublisher = context.user?.id === task.publisherId;
  const publicStatuses: TaskStatus[] = [...publicTaskStatuses];
  if (!isAdmin && !isPublisher && !publicStatuses.includes(task.status)) throw new HttpError(404);
  const isWorker = task.assignedClaim?.workerId === context.user?.id;
  const canSeeSubmission = Boolean(isAdmin || isPublisher || isWorker);
  const { assignedClaim, ...taskData } = task;
  const safeAssignedClaim = assignedClaim ? (({ submission: _submission, reviews: _reviews, ...claim }) => claim)(assignedClaim) : null;
  return {
    ...taskData,
    assignedClaim: safeAssignedClaim,
    privateInstructions: isAdmin || isPublisher || isWorker ? task.privateInstructions : null,
    claims: isAdmin || isPublisher || isWorker ? task.claims : [],
    submission: canSeeSubmission ? assignedClaim?.submission ?? null : null,
    reviews: assignedClaim?.reviews ?? [],
  };
};

export const getMyWork: GetMyWork<void, any> = async (_raw, context) => {
  const current = user(context);
  const [published, claims, contests] = await Promise.all([
    prisma.userTask.findMany({ where: { publisherId: current.id }, include: { assignedClaim: { include: { worker: { select: { id: true, username: true } } } }, award: true }, orderBy: { updatedAt: "desc" } }),
    prisma.taskClaim.findMany({ where: { workerId: current.id }, include: { task: { include: { publisher: { select: { id: true, username: true } }, award: true } } }, orderBy: { claimedAt: "desc" } }),
    prisma.contestEntry.findMany({ where: { entrantId: current.id }, include: { contest: { include: { prizes: true } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  return { published, claims, contests };
};

export const getPublicProfile: GetPublicProfile<{ username: string }, any> = async (raw) => {
  const { username } = input(z.object({ username: z.string().trim().min(1).max(80) }), raw);
  const profile = await prisma.user.findUnique({
    where: { username },
    select: { id: true, publicNo: true, username: true, createdAt: true, bio: true, skills: true, portfolioLinks: true, avatarUrl: true, reviewsReceived: { include: { reviewer: { select: { username: true, avatarUrl: true } }, claim: { include: { task: { select: { id: true, publicNo: true, title: true } } } } }, orderBy: { createdAt: "desc" }, take: 30 }, taskClaims: { select: { outcome: true, dueAt: true, resolvedAt: true } }, contestEntries: { select: { wonPrize: { select: { id: true } } } } },
  });
  if (!profile) throw new HttpError(404);
  const completed = profile.taskClaims.filter((item) => item.outcome === "APPROVED");
  const onTime = completed.filter((item) => item.resolvedAt && item.resolvedAt <= item.dueAt).length;
  return {
    ...profile,
    reviewsReceived: profile.reviewsReceived.map(({ claim, ...review }) => ({ ...review, task: claim.task })),
    stats: { completed: completed.length, onTimeRate: completed.length ? Math.round(onTime / completed.length * 100) : 100, approvalRate: profile.taskClaims.length ? Math.round(completed.length / profile.taskClaims.length * 100) : 100, contestWins: profile.contestEntries.filter((entry) => entry.wonPrize).length },
  };
};

export const updateProfile: UpdateProfile<{ bio?: string; skills: string[]; portfolioLinks: string[]; avatarUrl?: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ bio: z.string().trim().max(1_000).optional(), skills: z.array(z.string().trim().min(1).max(40)).max(12), portfolioLinks: z.array(httpUrl).max(6), avatarUrl: httpUrl.optional() }), raw);
  return prisma.user.update({
    where: { id: current.id },
    data: {
      bio: args.bio || null,
      avatarUrl: args.avatarUrl || null,
      skills: args.skills,
      portfolioLinks: args.portfolioLinks,
    },
  });
};

export const getWallet: GetWallet<void, any> = async (_raw, context) => {
  const current = user(context);
  const wallet = await prisma.walletAccount.upsert({ where: { userId: current.id }, update: {}, create: { userId: current.id } });
  const [entries, orders, withdrawals] = await Promise.all([
    prisma.walletEntry.findMany({ where: { userId: current.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.rechargeOrder.findMany({ where: { userId: current.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.withdrawalRequest.findMany({ where: { userId: current.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const masterKey = env.APP_MASTER_KEY;
  return {
    wallet,
    entries,
    orders,
    withdrawals: withdrawals.map(({ tokenCiphertext, ...request }) => ({
      ...request,
      payoutToken:
        request.status === "TOKEN_ISSUED" && tokenCiphertext
          ? decryptPayoutToken(tokenCiphertext, masterKey)
          : null,
    })),
  };
};

export const getAdminOverview: GetAdminOverview<void, any> = async (_raw, context) => {
  admin(context);
  const settings = await getSystemSettings();
  const [tasks, adminTasks, withdrawals, awards, orders, totalUsers, totalTasks, completedTasks, paidRecharge, audits] = await Promise.all([
    prisma.userTask.findMany({ where: { status: "PENDING_REVIEW" }, include: { publisher: { select: { email: true, username: true } }, escrow: true }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.userTask.findMany({ include: { publisher: { select: { email: true, username: true } }, assignedClaim: { include: { worker: { select: { email: true, username: true } } } }, escrow: true, award: true, _count: { select: { claims: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.withdrawalRequest.findMany({ where: { status: { in: ["REQUESTED", "TOKEN_ISSUED"] } }, include: { user: { select: { email: true, username: true } } }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.award.findMany({ where: { status: { in: ["COOLING", "BLOCKED"] } }, include: { task: { select: { id: true, publicNo: true, title: true } } }, orderBy: { availableAt: "asc" }, take: 100 }),
    prisma.rechargeOrder.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.user.count(),
    prisma.userTask.count(),
    prisma.userTask.count({ where: { status: "COMPLETED" } }),
    prisma.rechargeOrder.aggregate({ where: { status: "PAID" }, _sum: { creditCents: true } }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const [adminContests, contestAwards, totalContests] = await Promise.all([
    prisma.contest.findMany({ include: { publisher: { select: { email: true, username: true } }, escrow: true, prizes: true, awards: true, _count: { select: { entries: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.contestAward.findMany({ where: { status: { in: ["COOLING", "BLOCKED"] } }, include: { contest: { select: { id: true, publicNo: true, title: true } }, prize: { select: { rank: true } } }, orderBy: { availableAt: "asc" }, take: 100 }),
    prisma.contest.count(),
  ]);
  const pendingReviews = adminTasks.filter((task) => task.status === "PENDING_REVIEW");
  const pendingAppeals = adminTasks.filter((task) => task.status === "APPEALED");
  const blockedAwards = awards.filter((award) => award.status === "BLOCKED");
  const blockedContestAwards = contestAwards.filter((award) => award.status === "BLOCKED");
  const todos = [
    ...pendingReviews.map((task) => ({ type: "TASK_REVIEW", id: task.id, publicNo: task.publicNo, title: task.title, user: task.publisher.username ?? task.publisher.email, amountCents: task.budgetCents, createdAt: task.createdAt })),
    ...pendingAppeals.map((task) => ({ type: "TASK_APPEAL", id: task.id, publicNo: task.publicNo, title: task.title, user: task.publisher.username ?? task.publisher.email, amountCents: task.budgetCents, createdAt: task.updatedAt })),
    ...withdrawals.map((item) => ({ type: "WITHDRAWAL", id: item.id, publicNo: item.publicNo, title: item.status === "REQUESTED" ? "待录入提现口令" : "待确认提现结果", user: item.user.username ?? item.user.email, amountCents: item.amountCents, createdAt: item.createdAt })),
    ...blockedAwards.map((award) => ({ type: "TASK_AWARD", id: award.id, publicNo: award.task.publicNo, title: award.task.title, user: null, amountCents: award.amountCents, createdAt: award.availableAt })),
    ...blockedContestAwards.map((award) => ({ type: "CONTEST_AWARD", id: award.id, publicNo: award.contest.publicNo, title: award.contest.title, user: null, amountCents: award.amountCents, createdAt: award.availableAt })),
  ].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  return {
    tasks,
    adminTasks,
    withdrawals,
    awards,
    orders,
    audits,
    adminContests,
    contestAwards,
    todos,
    stats: {
      totalUsers,
      totalTasks,
      completedTasks,
      paidRechargeCents: paidRecharge._sum.creditCents ?? 0,
      pendingTasks: tasks.length,
      pendingAppeals: pendingAppeals.length,
      pendingWithdrawals: withdrawals.length,
      blockedAwards: blockedAwards.length + blockedContestAwards.length,
      coolingAwards: awards.length,
      coolingContestAwards: contestAwards.length,
      totalContests,
    },
    readiness: {
      payment: configured(settings["payment.epayApiUrl"], settings["payment.epayPid"], settings["payment.epayKey"], settings["payment.notifyUrl"], settings["payment.returnUrl"]),
      payoutEncryption: true,
      fileStorage: configured(settings["storage.region"], settings["storage.accessKey"], settings["storage.secretKey"], settings["storage.bucket"]),
      email: configured(settings["email.smtpHost"], settings["email.smtpPort"], settings["email.fromAddress"]),
    },
  };
};

export const getPublicSiteSettings: GetPublicSiteSettings<void, { title: string; logoUrl: string }> = async () => {
  const settings = await getSystemSettings(["site.title", "site.logoUrl"]);
  return { title: settings["site.title"] || "悬赏", logoUrl: settings["site.logoUrl"] || "" };
};

export const getAdminWalletEntries: GetAdminWalletEntries<{
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  from?: string;
  to?: string;
  exportAll?: boolean;
}, any> = async (raw = {}, context) => {
  admin(context);
  const args = input(z.object({
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(1_000).default(50),
    search: z.string().trim().max(200).optional(),
    type: z.string().trim().max(100).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    exportAll: z.boolean().default(false),
  }), raw);
  const pageSize = args.exportAll ? Math.min(args.pageSize, 1_000) : Math.min(args.pageSize, 100);
  const where: any = {};
  if (args.type) where.type = args.type;
  if (args.from || args.to) where.createdAt = { ...(args.from ? { gte: new Date(args.from) } : {}), ...(args.to ? { lte: new Date(args.to) } : {}) };
  if (args.search) {
    where.OR = [
      { referenceId: { contains: args.search, mode: "insensitive" } },
      { user: { email: { contains: args.search, mode: "insensitive" } } },
      { user: { username: { contains: args.search, mode: "insensitive" } } },
    ];
  }
  const [entries, total, typeRows] = await Promise.all([
    prisma.walletEntry.findMany({ where, include: { user: { select: { email: true, username: true } } }, orderBy: { createdAt: "desc" }, skip: args.exportAll ? 0 : (args.page - 1) * pageSize, take: pageSize }),
    prisma.walletEntry.count({ where }),
    prisma.walletEntry.findMany({ distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } }),
  ]);
  return { entries, total, page: args.exportAll ? 1 : args.page, pageSize, types: typeRows.map((row) => row.type), truncated: args.exportAll && total > pageSize };
};

export const getSystemSettingsForAdmin: GetSystemSettingsForAdmin<void, any> = async (_raw, context) => {
  admin(context);
  const [values, fees] = await Promise.all([getSystemSettings(), prisma.feeConfig.findFirst({ orderBy: { version: "desc" } })]);
  const result: Record<string, string | boolean> = {};
  for (const key of systemSettingKeys) {
    result[key] = secretSettingKeys.has(key) ? "" : values[key] ?? "";
    if (secretSettingKeys.has(key)) result[`${key}Configured`] = Boolean(values[key]);
  }
  result["platform.rechargeRateBps"] = String(fees?.rechargeRateBps ?? 0);
  result["platform.rechargeFixedCents"] = String(fees?.rechargeFixedCents ?? 0);
  result["platform.withdrawalRateBps"] = String(fees?.withdrawalRateBps ?? 0);
  result["platform.withdrawalFixedCents"] = String(fees?.withdrawalFixedCents ?? 0);
  return result;
};

export const updateSystemSettings: UpdateSystemSettings<{ values: Record<string, string>; fees?: Record<string, string> }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ values: z.record(z.string(), z.string().max(4_000)), fees: z.record(z.string(), z.string()).optional() }), raw);
  const allowed = Object.fromEntries(Object.entries(args.values).filter(([key]) => systemSettingKeys.includes(key as any)));
  if (allowed["site.title"] && (allowed["site.title"].trim().length < 1 || allowed["site.title"].trim().length > 40)) throw new HttpError(400, "网站标题需要 1–40 个字");
  if (allowed["site.logoUrl"]) {
    const logoUrl = allowed["site.logoUrl"].trim();
    if (!logoUrl.startsWith("/") && !httpUrl.safeParse(logoUrl).success) throw new HttpError(400, "Logo 地址必须是站内路径或 http/https 地址");
  }
  const existing = await getSystemSettings();
  for (const key of secretSettingKeys) if (!allowed[key] && existing[key]) delete allowed[key];
  await saveSystemSettings(allowed, current.id);
  if (args.fees) {
    const read = (key: string, max: number) => input(z.coerce.number().int().min(0).max(max), args.fees?.[key] ?? "0");
    const latest = await prisma.feeConfig.findFirst({ orderBy: { version: "desc" } });
    await prisma.feeConfig.create({ data: { version: (latest?.version ?? 0) + 1, rechargeRateBps: read("platform.rechargeRateBps", 10_000), rechargeFixedCents: read("platform.rechargeFixedCents", 1_000_000), withdrawalRateBps: read("platform.withdrawalRateBps", 10_000), withdrawalFixedCents: read("platform.withdrawalFixedCents", 1_000_000), updatedByAdminId: current.id } });
  }
  await prisma.adminAuditLog.create({ data: { adminId: current.id, action: "SYSTEM_SETTINGS_UPDATED", targetType: "SYSTEM", targetId: "runtime", metadata: { keys: Object.keys(allowed) } } });
  return { ok: true };
};

export const createBountyTask: CreateBountyTask<z.infer<typeof taskInput>, any> = async (raw, context) => {
  const current = user(context);
  const args = input(taskInput, raw);
  if (args.claimDeadline <= new Date()) {
    throw new HttpError(400, "截止时间无效");
  }
  return prisma.userTask.create({ data: { ...args, publisherId: current.id } });
};

export const submitBountyTask: SubmitBountyTask<{ taskId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { taskId } = input(z.object({ taskId: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: taskId }, include: { escrow: true } });
    if (!task || task.publisherId !== current.id) throw new HttpError(404);
    if (!["DRAFT", "PENDING_PAYMENT"].includes(task.status)) throw new HttpError(409, "任务当前不可提交");
    const wallet = await tx.walletAccount.upsert({ where: { userId: current.id }, update: {}, create: { userId: current.id } });
    let parts;
    try { parts = splitEscrow(task.budgetCents, wallet.rechargeAvailableCents, wallet.earningsAvailableCents); }
    catch {
      const pending = await tx.userTask.update({ where: { id: taskId }, data: { status: "PENDING_PAYMENT" } });
      const availableCents = wallet.rechargeAvailableCents + wallet.earningsAvailableCents;
      return { ...pending, paymentShortfall: { requiredCents: task.budgetCents, availableCents, shortfallCents: task.budgetCents - availableCents } };
    }
    assertTaskTransition(task.status, "PENDING_REVIEW");
    await applyWalletMutation(tx, { userId: current.id, delta: { rechargeCents: -parts.rechargeCents, earningsCents: -parts.earningsCents }, type: "ESCROW_HELD", referenceType: "TASK", referenceId: task.id, idempotencyKey: `task:${task.id}:hold` });
    await tx.taskEscrow.create({ data: { taskId: task.id, publisherId: current.id, ...parts } });
    await tx.taskEvent.create({ data: { taskId, actorId: current.id, actorSource: "USER", eventType: "SUBMITTED_FOR_REVIEW", beforeStatus: task.status, afterStatus: "PENDING_REVIEW", metadata: {} } });
    return tx.userTask.update({ where: { id: taskId }, data: { status: "PENDING_REVIEW" } });
  }, serializable);
};

export const cancelBountyTask: CancelBountyTask<{ taskId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { taskId } = input(z.object({ taskId: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: taskId } });
    if (!task || task.publisherId !== current.id) throw new HttpError(404);
    if (!["DRAFT", "PENDING_PAYMENT"].includes(task.status)) throw new HttpError(409, "该任务当前不能取消");
    assertTaskTransition(task.status, "CANCELLED");
    const changed = await tx.userTask.updateMany({ where: { id: task.id, status: task.status }, data: { status: "CANCELLED" } });
    if (changed.count !== 1) throw new HttpError(409, "任务状态已变化，请刷新后重试");
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "USER", eventType: "CANCELLED", beforeStatus: task.status, afterStatus: "CANCELLED", metadata: {} } });
    return { id: task.id, status: "CANCELLED" };
  }, serializable);
};

export const claimBountyTask: ClaimBountyTask<{ taskId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { taskId } = input(z.object({ taskId: z.string().uuid() }), raw);
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: taskId } });
    if (!task || task.status !== "OPEN" || task.assignedClaimId || task.claimDeadline <= new Date()) throw new HttpError(409, "该悬赏已被接取或已经截止");
    if (task.publisherId === current.id) throw new HttpError(403, "不能接取自己发布的悬赏");
    assertTaskTransition(task.status, "CLAIMED");
    const dueAt = new Date(Date.now() + task.workDurationHours * 60 * 60 * 1000);
    const claim = await tx.taskClaim.create({ data: { taskId: task.id, workerId: current.id, dueAt } });
    const claimed = await tx.userTask.updateMany({ where: { id: task.id, status: "OPEN", assignedClaimId: null }, data: { status: "CLAIMED", assignedClaimId: claim.id } });
    if (claimed.count !== 1) {
      await tx.taskClaim.delete({ where: { id: claim.id } });
      throw new HttpError(409, "刚刚已有其他人接取，请选择其他悬赏");
    }
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "USER", eventType: "CLAIMED", beforeStatus: "OPEN", afterStatus: "CLAIMED", metadata: { claimId: claim.id, dueAt } } });
    return claim;
  }, serializable);
  const task = await prisma.userTask.findUnique({ where: { id: taskId }, select: { title: true, publisherId: true } });
  if (task) void sendUserEmail(prisma, task.publisherId, "taskEmails", "你的悬赏已被接取", `“${task.title}”已有用户接取，请留意后续交付。`);
  return result;
};

export const releaseTaskClaim: ReleaseTaskClaim<{ taskId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { taskId } = input(z.object({ taskId: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: taskId }, include: { assignedClaim: true } });
    if (!task?.assignedClaim || task.assignedClaim.workerId !== current.id) throw new HttpError(404);
    if (task.status !== "CLAIMED" || task.assignedClaim.outcome !== null) throw new HttpError(409, "提交成果后不能主动放回");
    assertTaskTransition(task.status, "OPEN");
    await tx.taskClaim.update({ where: { id: task.assignedClaim.id }, data: { outcome: "RELEASED", resolvedAt: new Date() } });
    await tx.userTask.update({ where: { id: task.id }, data: { status: "OPEN", assignedClaimId: null } });
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "USER", eventType: "CLAIM_RELEASED", beforeStatus: "CLAIMED", afterStatus: "OPEN", metadata: {} } });
    return { id: task.id, status: "OPEN" };
  }, serializable);
};

export const submitDelivery: SubmitDelivery<{ taskId: string; content: string; fileIds?: string[] }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ taskId: z.string().uuid(), content: z.string().trim().min(10).max(20_000), fileIds: z.array(z.string().uuid()).max(6).default([]) }), raw);
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { assignedClaim: { include: { submission: { include: { versions: true } } } }, award: true } });
    const isWorker = task?.assignedClaim?.workerId === current.id;
    if (!task || !isWorker || !task.assignedClaim) throw new HttpError(403);
    if (task.award) throw new HttpError(409, "奖励流程已经开始");
    if (task.assignedClaim.dueAt <= new Date() || !["CLAIMED", "REVISION_REQUESTED"].includes(task.status)) throw new HttpError(409, "当前不可交付");
    assertTaskTransition(task.status, "SUBMITTED");
    const files = args.fileIds.length ? await tx.file.findMany({ where: { id: { in: args.fileIds }, userId: current.id, targetType: "TASK", targetId: task.id, status: "READY" } }) : [];
    if (files.length !== new Set(args.fileIds).size) throw new HttpError(400, "附件不存在、尚未上传完成或不属于当前悬赏");
    if (files.filter((file) => file.kind === "VIDEO").length > 1 || files.filter((file) => file.kind === "ATTACHMENT").length > 5) throw new HttpError(400, "每版最多上传 1 个视频和 5 个普通附件");
    const submission = await tx.submission.upsert({ where: { claimId: task.assignedClaim.id }, update: {}, create: { claimId: task.assignedClaim.id, submitterId: current.id } });
    const version = await tx.submissionVersion.create({ data: { submissionId: submission.id, content: args.content, version: (task.assignedClaim.submission?.versions.length ?? 0) + 1 } });
    if (files.length) {
      const attached = await tx.file.updateMany({ where: { id: { in: files.map((file) => file.id) }, status: "READY" }, data: { status: "ATTACHED", submissionVersionId: version.id, attachedAt: new Date(), deleteAfter: null } });
      if (attached.count !== files.length) throw new HttpError(409, "附件状态已变化，请重新提交");
    }
    const reviewDueAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await tx.taskClaim.update({ where: { id: task.assignedClaim.id }, data: { reviewDueAt } });
    await tx.userTask.update({ where: { id: task.id }, data: { status: "SUBMITTED" } });
    return submission;
  }, serializable);
  const task = await prisma.userTask.findUnique({ where: { id: args.taskId }, select: { title: true, publisherId: true } });
  if (task) void sendUserEmail(prisma, task.publisherId, "taskEmails", "悬赏成果已提交", `“${task.title}”收到了成果，请及时查看并验收。`);
  return result;
};

export const confirmDelivery: ConfirmDelivery<{ taskId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { taskId } = input(z.object({ taskId: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: taskId }, include: { assignedClaim: { include: { submission: true } }, award: true } });
    if (!task || task.publisherId !== current.id) throw new HttpError(404);
    const recipientId = task.assignedClaim?.workerId;
    if (!recipientId || task.status !== "SUBMITTED" || !task.assignedClaim?.submission || task.award) throw new HttpError(409, "当前不可确认");
    assertTaskTransition(task.status, "COOLING");
    const award = await tx.award.create({ data: { taskId, recipientId, amountCents: task.budgetCents, availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    await tx.taskClaim.update({ where: { id: task.assignedClaim.id }, data: { outcome: "APPROVED", resolvedAt: new Date(), reviewDueAt: null } });
    const afterStatus = "COOLING";
    await tx.userTask.update({ where: { id: task.id }, data: { status: afterStatus } });
    await tx.taskEvent.create({ data: { taskId, actorId: current.id, actorSource: "USER", eventType: "DELIVERY_CONFIRMED", beforeStatus: task.status, afterStatus, metadata: { awardId: award.id, availableAt: award.availableAt } } });
    return award;
  }, serializable);
};

export const reviewTaskSubmission: ReviewTaskSubmission<{ taskId: string; decision: "APPROVE" | "REVISION" | "REJECT"; reason?: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ taskId: z.string().uuid(), decision: z.enum(["APPROVE", "REVISION", "REJECT"]), reason: z.string().trim().min(3).max(2_000).optional() }), raw);
  if (args.decision !== "APPROVE" && !args.reason) throw new HttpError(400, "请填写具体原因");
  if (args.decision === "APPROVE") return confirmDelivery({ taskId: args.taskId }, context as never);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { assignedClaim: { include: { submission: true } } } });
    if (!task || task.publisherId !== current.id) throw new HttpError(404);
    if (task.status !== "SUBMITTED" || !task.assignedClaim?.submission) throw new HttpError(409, "当前不可审核");
    if (args.decision === "REVISION") {
      if (task.assignedClaim.revisionCount >= 1) throw new HttpError(409, "每个悬赏只允许一次修改请求");
      assertTaskTransition(task.status, "REVISION_REQUESTED");
      await tx.taskClaim.update({ where: { id: task.assignedClaim.id }, data: { revisionCount: { increment: 1 }, revisionReason: args.reason, reviewDueAt: null } });
      await tx.userTask.update({ where: { id: task.id }, data: { status: "REVISION_REQUESTED" } });
      await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "USER", eventType: "REVISION_REQUESTED", beforeStatus: "SUBMITTED", afterStatus: "REVISION_REQUESTED", metadata: { reason: args.reason } } });
      return { status: "REVISION_REQUESTED" };
    }
    const appealDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    assertTaskTransition(task.status, "REJECTED_PENDING_APPEAL");
    await tx.taskClaim.update({ where: { id: task.assignedClaim.id }, data: { rejectionReason: args.reason, appealDeadline, reviewDueAt: null } });
    await tx.userTask.update({ where: { id: task.id }, data: { status: "REJECTED_PENDING_APPEAL" } });
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "USER", eventType: "SUBMISSION_REJECTED", beforeStatus: "SUBMITTED", afterStatus: "REJECTED_PENDING_APPEAL", metadata: { reason: args.reason, appealDeadline } } });
    return { status: "REJECTED_PENDING_APPEAL", appealDeadline };
  }, serializable);
};

export const appealTaskRejection: AppealTaskRejection<{ taskId: string; reason: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ taskId: z.string().uuid(), reason: z.string().trim().min(10).max(2_000) }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { assignedClaim: true } });
    if (!task?.assignedClaim || task.assignedClaim.workerId !== current.id) throw new HttpError(404);
    if (task.status !== "REJECTED_PENDING_APPEAL" || !task.assignedClaim.appealDeadline || task.assignedClaim.appealDeadline <= new Date()) throw new HttpError(409, "申诉窗口已经关闭");
    assertTaskTransition(task.status, "APPEALED");
    await tx.taskClaim.update({ where: { id: task.assignedClaim.id }, data: { appealReason: args.reason } });
    await tx.userTask.update({ where: { id: task.id }, data: { status: "APPEALED" } });
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "USER", eventType: "REJECTION_APPEALED", beforeStatus: "REJECTED_PENDING_APPEAL", afterStatus: "APPEALED", metadata: { reason: args.reason } } });
    return { status: "APPEALED" };
  }, serializable);
};

export const resolveTaskAppeal: ResolveTaskAppeal<{ taskId: string; decision: "PAY" | "REOPEN"; reason: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ taskId: z.string().uuid(), decision: z.enum(["PAY", "REOPEN"]), reason: z.string().trim().min(3).max(2_000) }), raw);
  if (args.decision === "PAY") {
    const task = await prisma.userTask.findUnique({ where: { id: args.taskId }, include: { assignedClaim: true } });
    if (!task?.assignedClaim || task.status !== "APPEALED") throw new HttpError(409, "当前没有待处理申诉");
    assertTaskTransition(task.status, "COOLING");
    return prisma.$transaction(async (tx) => {
      const award = await tx.award.create({ data: { taskId: task.id, recipientId: task.assignedClaim!.workerId, amountCents: task.budgetCents, availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
      await tx.taskClaim.update({ where: { id: task.assignedClaim!.id }, data: { outcome: "APPROVED", resolvedAt: new Date() } });
      await tx.userTask.update({ where: { id: task.id }, data: { status: "COOLING" } });
      await tx.adminAuditLog.create({ data: { adminId: current.id, action: "TASK_APPEAL_PAID", targetType: "TASK", targetId: task.id, metadata: { reason: args.reason } } });
      return award;
    }, serializable);
  }
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { assignedClaim: true } });
    if (!task?.assignedClaim || task.status !== "APPEALED") throw new HttpError(409, "当前没有待处理申诉");
    assertTaskTransition(task.status, "OPEN");
    await tx.taskClaim.update({ where: { id: task.assignedClaim.id }, data: { outcome: "REJECTED", resolvedAt: new Date() } });
    await tx.userTask.update({ where: { id: task.id }, data: { status: "OPEN", assignedClaimId: null } });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: "TASK_APPEAL_REOPENED", targetType: "TASK", targetId: task.id, metadata: { reason: args.reason } } });
    return { status: "OPEN" };
  }, serializable);
};

export const askTaskQuestion: AskTaskQuestion<{ taskId: string; question: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ taskId: z.string().uuid(), question: z.string().trim().min(3).max(1_000) }), raw);
  const task = await prisma.userTask.findUnique({ where: { id: args.taskId } });
  if (!task || !["OPEN", "CLAIMED"].includes(task.status)) throw new HttpError(409, "当前不可提问");
  return prisma.taskQuestion.create({ data: { taskId: task.id, askerId: current.id, question: args.question } });
};

export const answerTaskQuestion: AnswerTaskQuestion<{ questionId: string; answer: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ questionId: z.string().uuid(), answer: z.string().trim().min(2).max(2_000) }), raw);
  const question = await prisma.taskQuestion.findUnique({ where: { id: args.questionId }, include: { task: true } });
  if (!question || question.task.publisherId !== current.id) throw new HttpError(404);
  return prisma.taskQuestion.update({ where: { id: question.id }, data: { answer: args.answer, answererId: current.id, answeredAt: new Date() } });
};

export const createWorkReview: CreateWorkReview<{ taskId: string; content: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ taskId: z.string().uuid(), content: z.string().trim().min(3).max(1_000) }), raw);
  const task = await prisma.userTask.findUnique({ where: { id: args.taskId }, include: { assignedClaim: true } });
  if (!task?.assignedClaim || task.status !== "COMPLETED") throw new HttpError(409, "任务完成后才能评价");
  const isPublisher = task.publisherId === current.id;
  const isWorker = task.assignedClaim.workerId === current.id;
  if (!isPublisher && !isWorker) throw new HttpError(403);
  return prisma.workReview.create({ data: { claimId: task.assignedClaim.id, reviewerId: current.id, revieweeId: isPublisher ? task.assignedClaim.workerId : task.publisherId, reviewerRole: isPublisher ? "PUBLISHER" : "WORKER", content: args.content } });
};

export const createRechargeOrder: CreateRechargeOrder<{ creditCents: number }, any> = async (raw, context) => {
  const current = user(context);
  const { creditCents } = input(z.object({ creditCents: z.number().int().positive().max(100_000_000) }), raw);
  const settings = await getSystemSettings(["payment.epayApiUrl", "payment.epayPid", "payment.epayKey", "payment.notifyUrl", "payment.returnUrl"]);
  const apiUrl = settings["payment.epayApiUrl"], pid = settings["payment.epayPid"], key = settings["payment.epayKey"], notifyUrl = settings["payment.notifyUrl"], returnUrl = settings["payment.returnUrl"];
  if (!apiUrl || !pid || !key || !notifyUrl || !returnUrl) throw new HttpError(503, "支付渠道尚未配置");
  const fee = await prisma.feeConfig.findFirst({ orderBy: { version: "desc" } });
  const rate = fee?.rechargeRateBps ?? 0;
  const fixed = fee?.rechargeFixedCents ?? 0;
  const feeCents = calculateFeeCents(creditCents, rate, fixed);
  const payableCents = creditCents + feeCents;
  const orderNo = `XS${Date.now()}${crypto.randomInt(1000, 9999)}`;
  const order = await prisma.rechargeOrder.create({ data: { orderNo, userId: current.id, creditCents, feeCents, payableCents, feeRateBpsSnapshot: rate, fixedFeeCentsSnapshot: fixed } });
  const params = { pid, out_trade_no: orderNo, notify_url: notifyUrl, return_url: returnUrl, name: "悬赏余额充值", money: formatCents(payableCents) };
  const signed = { ...params, sign: signEpayParams(params, key), sign_type: "MD5" };
  return { order, checkoutUrl: `${apiUrl.replace(/\/$/, "")}/submit.php?${new URLSearchParams(signed)}` };
};

export const createWithdrawal: CreateWithdrawal<{ amountCents: number }, any> = async (raw, context) => {
  const current = user(context);
  const { amountCents } = input(z.object({ amountCents: z.number().int().positive() }), raw);
  return prisma.$transaction(async (tx) => {
    const fee = await tx.feeConfig.findFirst({ orderBy: { version: "desc" } });
    const rate = fee?.withdrawalRateBps ?? 0;
    const fixed = fee?.withdrawalFixedCents ?? 0;
    const feeCents = calculateFeeCents(amountCents, rate, fixed);
    if (amountCents <= feeCents) throw new HttpError(400, "提现金额必须大于手续费");
    const withdrawal = await tx.withdrawalRequest.create({ data: { userId: current.id, amountCents, feeCents, payoutCents: amountCents - feeCents, feeRateBpsSnapshot: rate, fixedFeeCentsSnapshot: fixed } });
    await applyWalletMutation(tx, { userId: current.id, delta: { earningsCents: -amountCents, frozenCents: amountCents }, type: "WITHDRAWAL_FROZEN", referenceType: "WITHDRAWAL", referenceId: withdrawal.id, idempotencyKey: `withdrawal:${withdrawal.id}:freeze` });
    return withdrawal;
  }, serializable);
};

export const cancelWithdrawal: CancelWithdrawal<{ id: string }, any> = async (raw, context) => {
  const current = user(context);
  const { id } = input(z.object({ id: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id } });
    if (!request || request.userId !== current.id) throw new HttpError(404);
    if (request.status !== "REQUESTED") throw new HttpError(409, "该提现申请不可取消");
    const changed = await tx.withdrawalRequest.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "CANCELLED" } });
    if (changed.count !== 1) throw new HttpError(409);
    await applyWalletMutation(tx, { userId: current.id, delta: { earningsCents: request.amountCents, frozenCents: -request.amountCents }, type: "WITHDRAWAL_CANCELLED", referenceType: "WITHDRAWAL", referenceId: request.id, idempotencyKey: `withdrawal:${request.id}:cancel` });
    return request;
  }, serializable);
};

export const confirmWithdrawal: ConfirmWithdrawal<{ id: string }, any> = async (raw, context) => {
  const current = user(context);
  const { id } = input(z.object({ id: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id } });
    if (!request || request.userId !== current.id) throw new HttpError(404);
    if (request.status !== "TOKEN_ISSUED") throw new HttpError(409, "该提现单当前不可确认");
    const claimed = await tx.withdrawalRequest.updateMany({ where: { id, status: "TOKEN_ISSUED" }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (claimed.count !== 1) throw new HttpError(409);
    await applyWalletMutation(tx, { userId: current.id, delta: { frozenCents: -request.amountCents }, type: "WITHDRAWAL_COMPLETED", referenceType: "WITHDRAWAL", referenceId: request.id, idempotencyKey: `withdrawal:${request.id}:user-confirm` });
    return { id, status: "COMPLETED" };
  }, serializable);
};

export const reviewBountyTask: ReviewBountyTask<{ taskId: string; approved: boolean; note?: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ taskId: z.string().uuid(), approved: z.boolean(), note: z.string().max(2_000).optional() }), raw);
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { escrow: true } });
    if (!task || task.status !== "PENDING_REVIEW" || !task.escrow || task.escrow.status !== "HELD") throw new HttpError(409, "任务当前不可审核");
    if (args.approved) {
      assertTaskTransition(task.status, "OPEN");
      const updated = await tx.userTask.update({ where: { id: task.id }, data: { status: "OPEN" } });
      await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "ADMIN", eventType: "REVIEW_APPROVED", beforeStatus: "PENDING_REVIEW", afterStatus: "OPEN", metadata: { note: args.note ?? null } } });
      return updated;
    }
    assertTaskTransition(task.status, "REFUNDED");
    await applyWalletMutation(tx, { userId: task.publisherId, delta: { rechargeCents: task.escrow.rechargeCents, earningsCents: task.escrow.earningsCents }, type: "ESCROW_REFUNDED", referenceType: "TASK", referenceId: task.id, idempotencyKey: `task:${task.id}:review-refund` });
    await tx.taskEscrow.update({ where: { taskId: task.id }, data: { status: "RELEASED", releasedAt: new Date() } });
    const updated = await tx.userTask.update({ where: { id: task.id }, data: { status: "REFUNDED" } });
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "ADMIN", eventType: "REVIEW_REJECTED", beforeStatus: "PENDING_REVIEW", afterStatus: "REFUNDED", metadata: { note: args.note ?? null } } });
    return updated;
  }, serializable);
  const task = await prisma.userTask.findUnique({ where: { id: args.taskId }, select: { title: true, publisherId: true } });
  if (task) void sendUserEmail(prisma, task.publisherId, "taskEmails", args.approved ? "悬赏审核通过" : "悬赏审核未通过", args.approved ? `“${task.title}”已经开放接取。` : `“${task.title}”未通过审核，托管资金已退回余额。`);
  return result;
};

export const closeBountyTask: CloseBountyTask<{ taskId: string; reason: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ taskId: z.string().uuid(), reason: z.string().trim().min(3).max(2_000) }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { escrow: true, award: true } });
    if (!task || ["COMPLETED", "REFUNDED", "CLOSED", "CANCELLED"].includes(task.status)) throw new HttpError(409, "该任务当前不可关闭");
    if (task.award?.status === "CREDITED" || task.escrow?.status === "AWARDED") throw new HttpError(409, "奖励已经入账，不能关闭退款");
    const afterStatus = task.escrow?.status === "HELD" ? "REFUNDED" : "CLOSED";
    assertTaskTransition(task.status, afterStatus);
    const claimed = await tx.userTask.updateMany({ where: { id: task.id, status: task.status }, data: { status: afterStatus } });
    if (claimed.count !== 1) throw new HttpError(409, "任务状态已变化，请刷新后重试");
    if (task.escrow?.status === "HELD") {
      await applyWalletMutation(tx, { userId: task.publisherId, delta: { rechargeCents: task.escrow.rechargeCents, earningsCents: task.escrow.earningsCents }, type: "ESCROW_REFUNDED", referenceType: "TASK", referenceId: task.id, idempotencyKey: `task:${task.id}:admin-close-refund` });
      await tx.taskEscrow.update({ where: { taskId: task.id }, data: { status: "RELEASED", releasedAt: new Date() } });
      await tx.refundRecord.create({ data: { taskId: task.id, recipientUserId: task.publisherId, originalReference: task.escrow.id, amountCents: task.escrow.totalCents, channel: "INTERNAL_BALANCE", reason: args.reason, adminId: current.id } });
    }
    if (task.award && ["COOLING", "BLOCKED"].includes(task.award.status)) {
      await tx.award.update({ where: { id: task.award.id }, data: { status: "BLOCKED", blockedReason: `任务已关闭：${args.reason}` } });
    }
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "ADMIN", eventType: "ADMIN_CLOSED", beforeStatus: task.status, afterStatus, metadata: { reason: args.reason } } });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: afterStatus === "REFUNDED" ? "TASK_CLOSED_AND_REFUNDED" : "TASK_CLOSED", targetType: "TASK", targetId: task.id, metadata: { reason: args.reason } } });
    return { id: task.id, status: afterStatus };
  }, serializable);
};

export const setAwardBlocked: SetAwardBlocked<{ awardId: string; blocked: boolean; reason?: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ awardId: z.string().uuid(), blocked: z.boolean(), reason: z.string().min(3).max(2_000).optional() }), raw);
  if (args.blocked && !args.reason) throw new HttpError(400, "拦截原因必填");
  const award = await prisma.award.findUnique({ where: { id: args.awardId } });
  if (!award || !["COOLING", "BLOCKED"].includes(award.status)) throw new HttpError(409);
  const updated = await prisma.award.update({ where: { id: award.id }, data: args.blocked ? { status: "BLOCKED", blockedReason: args.reason } : { status: "COOLING", blockedReason: null, availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  await prisma.adminAuditLog.create({ data: { adminId: current.id, action: args.blocked ? "AWARD_BLOCKED" : "AWARD_UNBLOCKED", targetType: "AWARD", targetId: award.id, metadata: { reason: args.reason ?? null } } });
  return updated;
};

export const issueWithdrawalToken: IssueWithdrawalToken<{ id: string; token: string; note?: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ id: z.string().uuid(), token: z.string().trim().min(4).max(500), note: z.string().max(2_000).optional() }), raw);
  const changed = await prisma.withdrawalRequest.updateMany({ where: { id: args.id, status: "REQUESTED" }, data: { status: "TOKEN_ISSUED", tokenCiphertext: encryptPayoutToken(args.token, env.APP_MASTER_KEY), tokenIssuedAt: new Date(), adminId: current.id, adminNote: args.note } });
  if (changed.count !== 1) throw new HttpError(409, "提现单当前不可发放口令");
  await prisma.adminAuditLog.create({ data: { adminId: current.id, action: "WITHDRAWAL_TOKEN_ISSUED", targetType: "WITHDRAWAL", targetId: args.id, metadata: {} } });
  return { id: args.id, status: "TOKEN_ISSUED" };
};

export const finalizeWithdrawal: FinalizeWithdrawal<{ id: string; completed: boolean; note?: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ id: z.string().uuid(), completed: z.boolean(), note: z.string().max(2_000).optional() }), raw);
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: args.id } });
    if (!request || (args.completed ? request.status !== "TOKEN_ISSUED" : !["REQUESTED", "TOKEN_ISSUED"].includes(request.status))) throw new HttpError(409, "提现单当前不可处理");
    const claimed = await tx.withdrawalRequest.updateMany({ where: { id: request.id, status: request.status }, data: { status: args.completed ? "COMPLETED" : "REJECTED", completedAt: args.completed ? new Date() : null, adminId: current.id, adminNote: args.note } });
    if (claimed.count !== 1) throw new HttpError(409);
    await applyWalletMutation(tx, { userId: request.userId, delta: { earningsCents: args.completed ? 0 : request.amountCents, frozenCents: -request.amountCents }, type: args.completed ? "WITHDRAWAL_COMPLETED" : "WITHDRAWAL_REJECTED", referenceType: "WITHDRAWAL", referenceId: request.id, idempotencyKey: `withdrawal:${request.id}:${args.completed ? "complete" : "reject"}` });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: args.completed ? "WITHDRAWAL_COMPLETED" : "WITHDRAWAL_REJECTED", targetType: "WITHDRAWAL", targetId: request.id, metadata: { note: args.note ?? null } } });
    return { id: request.id, status: args.completed ? "COMPLETED" : "REJECTED" };
  }, serializable);
};
