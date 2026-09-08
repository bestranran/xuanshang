import crypto from "node:crypto";
import { env, HttpError, prisma } from "wasp/server";
import type {
  ApplyToTask, CancelBountyTask, CancelWithdrawal, ConfirmDelivery, ConfirmWithdrawal, CreateBountyTask,
  CloseBountyTask, CreateRechargeOrder, CreateWithdrawal, FinalizeWithdrawal, GetAdminOverview,
  GetTaskDetails, GetTasks, GetWallet, IssueWithdrawalToken, ReviewBountyTask,
  SelectApplication, SetAwardBlocked, SubmitBountyTask, SubmitDelivery,
} from "wasp/server/operations";
import * as z from "zod";
import { calculateFeeCents, decryptPayoutToken, encryptPayoutToken, formatCents, signEpayParams, splitEscrow } from "./core";

const taskInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(20_000),
  budgetCents: z.number().int().positive().max(100_000_000),
  applicationDeadline: z.coerce.date(),
  deliveryDeadline: z.coerce.date(),
});

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

function configured(...values: Array<string | undefined>) {
  return values.every((value) => {
    const normalized = value?.trim().toLowerCase();
    return Boolean(normalized && normalized !== "development-placeholder" && !normalized.startsWith("replace-with-"));
  });
}

const serializable = { isolationLevel: "Serializable" as const };

export const getTasks: GetTasks<{ search?: string; status?: string }, any> = async (raw, context) => {
  const args = input(z.object({ search: z.string().max(100).optional(), status: z.string().optional() }), raw ?? {});
  const publicStatuses: Array<"OPEN" | "IN_PROGRESS" | "JUDGING" | "COMPLETED"> = ["OPEN", "IN_PROGRESS", "JUDGING", "COMPLETED"];
  const visibility = context.user
    ? { OR: [{ status: { in: publicStatuses } }, { publisherId: context.user.id }] }
    : { status: { in: publicStatuses } };
  return prisma.userTask.findMany({
    where: {
      ...visibility,
      ...(args.status ? { status: args.status as never } : {}),
      ...(args.search ? { title: { contains: args.search, mode: "insensitive" } } : {}),
    },
    include: { publisher: { select: { id: true, username: true } }, award: true, _count: { select: { applications: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
};

export const getTaskDetails: GetTaskDetails<{ id: string }, any> = async (raw, context) => {
  const { id } = input(z.object({ id: z.string().uuid() }), raw);
  const task = await prisma.userTask.findUnique({
    where: { id },
    include: {
      publisher: { select: { id: true, username: true } },
      applications: { include: { applicant: { select: { id: true, username: true } } }, orderBy: { createdAt: "asc" } },
      submission: true,
      award: true,
    },
  });
  if (!task) throw new HttpError(404);
  const isAdmin = Boolean(context.user?.isAdmin);
  const isPublisher = context.user?.id === task.publisherId;
  const ownApplication = task.applications.find((application) => application.applicantId === context.user?.id);
  const canSeeSubmission = Boolean(isAdmin || isPublisher || task.submission?.submitterId === context.user?.id);
  return {
    ...task,
    applications: isAdmin || isPublisher ? task.applications : ownApplication ? [ownApplication] : [],
    submission: canSeeSubmission ? task.submission : null,
  };
};

export const getWallet: GetWallet<void, any> = async (_raw, context) => {
  const current = user(context);
  const wallet = await prisma.walletAccount.upsert({ where: { userId: current.id }, update: {}, create: { userId: current.id } });
  const [entries, orders, withdrawals] = await Promise.all([
    prisma.walletEntry.findMany({ where: { userId: current.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.rechargeOrder.findMany({ where: { userId: current.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.withdrawalRequest.findMany({ where: { userId: current.id }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return {
    wallet,
    entries,
    orders,
    withdrawals: withdrawals.map(({ tokenCiphertext, ...request }) => ({
      ...request,
      payoutToken:
        request.status === "TOKEN_ISSUED" && tokenCiphertext && env.PAYOUT_TOKEN_ENCRYPTION_KEY
          ? decryptPayoutToken(tokenCiphertext, env.PAYOUT_TOKEN_ENCRYPTION_KEY)
          : null,
    })),
  };
};

export const getAdminOverview: GetAdminOverview<void, any> = async (_raw, context) => {
  admin(context);
  const [tasks, adminTasks, withdrawals, awards, orders, totalUsers, totalTasks, completedTasks, paidRecharge, audits] = await Promise.all([
    prisma.userTask.findMany({ where: { status: "PENDING_REVIEW" }, include: { publisher: { select: { email: true, username: true } }, escrow: true }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.userTask.findMany({ include: { publisher: { select: { email: true, username: true } }, escrow: true, award: true, _count: { select: { applications: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.withdrawalRequest.findMany({ where: { status: { in: ["REQUESTED", "TOKEN_ISSUED"] } }, include: { user: { select: { email: true, username: true } } }, orderBy: { createdAt: "asc" }, take: 100 }),
    prisma.award.findMany({ where: { status: { in: ["COOLING", "BLOCKED"] } }, include: { task: { select: { title: true } } }, orderBy: { availableAt: "asc" }, take: 100 }),
    prisma.rechargeOrder.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.user.count(),
    prisma.userTask.count(),
    prisma.userTask.count({ where: { status: "COMPLETED" } }),
    prisma.rechargeOrder.aggregate({ where: { status: "PAID" }, _sum: { creditCents: true } }),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const [adminContests, contestAwards, totalContests] = await Promise.all([
    prisma.contest.findMany({ include: { publisher: { select: { email: true, username: true } }, escrow: true, prizes: true, awards: true, _count: { select: { entries: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.contestAward.findMany({ where: { status: { in: ["COOLING", "BLOCKED"] } }, include: { contest: { select: { title: true } }, prize: { select: { rank: true } } }, orderBy: { availableAt: "asc" }, take: 100 }),
    prisma.contest.count(),
  ]);
  return {
    tasks,
    adminTasks,
    withdrawals,
    awards,
    orders,
    audits,
    adminContests,
    contestAwards,
    stats: {
      totalUsers,
      totalTasks,
      completedTasks,
      paidRechargeCents: paidRecharge._sum.creditCents ?? 0,
      pendingTasks: tasks.length,
      pendingWithdrawals: withdrawals.length,
      coolingAwards: awards.length,
      coolingContestAwards: contestAwards.length,
      totalContests,
    },
    readiness: {
      payment: configured(env.EPAY_API_URL, env.EPAY_PID, env.EPAY_KEY, env.EPAY_NOTIFY_URL, env.EPAY_RETURN_URL),
      payoutEncryption: configured(env.PAYOUT_TOKEN_ENCRYPTION_KEY),
      fileStorage: configured(env.AWS_S3_REGION, env.AWS_S3_IAM_ACCESS_KEY, env.AWS_S3_IAM_SECRET_KEY, env.AWS_S3_FILES_BUCKET),
      email: Boolean(env.SENDGRID_API_KEY?.startsWith("SG.")),
    },
  };
};

export const createBountyTask: CreateBountyTask<z.infer<typeof taskInput>, any> = async (raw, context) => {
  const current = user(context);
  const args = input(taskInput, raw);
  if (args.applicationDeadline <= new Date() || args.deliveryDeadline <= args.applicationDeadline) {
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
    catch { return tx.userTask.update({ where: { id: taskId }, data: { status: "PENDING_PAYMENT" } }); }
    const updated = await tx.walletAccount.updateMany({
      where: { userId: current.id, version: wallet.version, rechargeAvailableCents: { gte: parts.rechargeCents }, earningsAvailableCents: { gte: parts.earningsCents } },
      data: { rechargeAvailableCents: { decrement: parts.rechargeCents }, earningsAvailableCents: { decrement: parts.earningsCents }, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new HttpError(409, "余额已变化，请重试");
    const snapshot = { rechargeAvailableCents: wallet.rechargeAvailableCents - parts.rechargeCents, earningsAvailableCents: wallet.earningsAvailableCents - parts.earningsCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents };
    await tx.walletEntry.create({ data: { userId: current.id, type: "ESCROW_HELD", rechargeDeltaCents: -parts.rechargeCents, earningsDeltaCents: -parts.earningsCents, referenceType: "TASK", referenceId: task.id, idempotencyKey: `task:${task.id}:hold`, balanceSnapshot: snapshot } });
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
    const changed = await tx.userTask.updateMany({ where: { id: task.id, status: task.status }, data: { status: "CANCELLED" } });
    if (changed.count !== 1) throw new HttpError(409, "任务状态已变化，请刷新后重试");
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "USER", eventType: "CANCELLED", beforeStatus: task.status, afterStatus: "CANCELLED", metadata: {} } });
    return { id: task.id, status: "CANCELLED" };
  }, serializable);
};

export const applyToTask: ApplyToTask<{ taskId: string; message: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ taskId: z.string().uuid(), message: z.string().trim().min(5).max(4_000) }), raw);
  const task = await prisma.userTask.findUnique({ where: { id: args.taskId } });
  if (!task || task.status !== "OPEN" || task.applicationDeadline <= new Date()) throw new HttpError(409, "当前不可报名");
  if (task.publisherId === current.id) throw new HttpError(403, "不能报名自己的任务");
  return prisma.application.upsert({
    where: { taskId_applicantId: { taskId: task.id, applicantId: current.id } },
    update: { message: args.message, status: "PENDING" },
    create: { taskId: task.id, applicantId: current.id, message: args.message },
  });
};

export const selectApplication: SelectApplication<{ applicationId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { applicationId } = input(z.object({ applicationId: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const application = await tx.application.findUnique({ where: { id: applicationId }, include: { task: true } });
    if (!application || application.task.publisherId !== current.id) throw new HttpError(404);
    if (application.task.status !== "OPEN" || application.task.applicationDeadline <= new Date() || application.status !== "PENDING") throw new HttpError(409, "当前不可选人");
    const claimed = await tx.userTask.updateMany({ where: { id: application.taskId, status: "OPEN", selectedApplicationId: null }, data: { status: "IN_PROGRESS", selectedApplicationId: application.id } });
    if (claimed.count !== 1) throw new HttpError(409, "该任务已选定接单者");
    await tx.application.update({ where: { id: application.id }, data: { status: "SELECTED" } });
    await tx.application.updateMany({ where: { taskId: application.taskId, id: { not: application.id }, status: "PENDING" }, data: { status: "REJECTED" } });
    return application;
  }, serializable);
};

export const submitDelivery: SubmitDelivery<{ taskId: string; content: string }, any> = async (raw, context) => {
  const current = user(context);
  const args = input(z.object({ taskId: z.string().uuid(), content: z.string().trim().min(10).max(20_000) }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { selectedApplication: true, award: true } });
    if (!task?.selectedApplication || task.selectedApplication.applicantId !== current.id) throw new HttpError(403);
    if (!["IN_PROGRESS", "JUDGING"].includes(task.status) || task.deliveryDeadline <= new Date() || task.award) throw new HttpError(409, "当前不可交付");
    const submission = await tx.submission.upsert({ where: { taskId: task.id }, update: { content: args.content }, create: { taskId: task.id, applicationId: task.selectedApplication.id, submitterId: current.id, content: args.content } });
    if (task.status === "IN_PROGRESS") await tx.userTask.update({ where: { id: task.id }, data: { status: "JUDGING" } });
    return submission;
  }, serializable);
};

export const confirmDelivery: ConfirmDelivery<{ taskId: string }, any> = async (raw, context) => {
  const current = user(context);
  const { taskId } = input(z.object({ taskId: z.string().uuid() }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: taskId }, include: { selectedApplication: true, submission: true, award: true } });
    if (!task || task.publisherId !== current.id) throw new HttpError(404);
    if (task.status !== "JUDGING" || !task.submission || !task.selectedApplication || task.award) throw new HttpError(409, "当前不可确认");
    const award = await tx.award.create({ data: { taskId, recipientId: task.selectedApplication.applicantId, amountCents: task.budgetCents, availableAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    await tx.taskEvent.create({ data: { taskId, actorId: current.id, actorSource: "USER", eventType: "DELIVERY_CONFIRMED", beforeStatus: "JUDGING", afterStatus: "JUDGING", metadata: { awardId: award.id, availableAt: award.availableAt } } });
    return award;
  }, serializable);
};

export const createRechargeOrder: CreateRechargeOrder<{ creditCents: number }, any> = async (raw, context) => {
  const current = user(context);
  const { creditCents } = input(z.object({ creditCents: z.number().int().positive().max(100_000_000) }), raw);
  if (!env.EPAY_API_URL || !env.EPAY_PID || !env.EPAY_KEY || !env.EPAY_NOTIFY_URL || !env.EPAY_RETURN_URL) throw new HttpError(503, "支付渠道尚未配置");
  const fee = await prisma.feeConfig.findFirst({ orderBy: { version: "desc" } });
  const rate = fee?.rechargeRateBps ?? 0;
  const fixed = fee?.rechargeFixedCents ?? 0;
  const feeCents = calculateFeeCents(creditCents, rate, fixed);
  const payableCents = creditCents + feeCents;
  const orderNo = `XS${Date.now()}${crypto.randomInt(1000, 9999)}`;
  const order = await prisma.rechargeOrder.create({ data: { orderNo, userId: current.id, creditCents, feeCents, payableCents, feeRateBpsSnapshot: rate, fixedFeeCentsSnapshot: fixed } });
  const params = { pid: env.EPAY_PID, out_trade_no: orderNo, notify_url: env.EPAY_NOTIFY_URL, return_url: env.EPAY_RETURN_URL, name: "悬赏余额充值", money: formatCents(payableCents) };
  const signed = { ...params, sign: signEpayParams(params, env.EPAY_KEY), sign_type: "MD5" };
  return { order, checkoutUrl: `${env.EPAY_API_URL.replace(/\/$/, "")}/submit.php?${new URLSearchParams(signed)}` };
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
    const wallet = await tx.walletAccount.findUnique({ where: { userId: current.id } });
    if (!wallet) throw new HttpError(409, "收益余额不足");
    const changed = await tx.walletAccount.updateMany({ where: { userId: current.id, version: wallet.version, earningsAvailableCents: { gte: amountCents } }, data: { earningsAvailableCents: { decrement: amountCents }, withdrawalFrozenCents: { increment: amountCents }, version: { increment: 1 } } });
    if (changed.count !== 1) throw new HttpError(409, "收益余额不足或已变化");
    const withdrawal = await tx.withdrawalRequest.create({ data: { userId: current.id, amountCents, feeCents, payoutCents: amountCents - feeCents, feeRateBpsSnapshot: rate, fixedFeeCentsSnapshot: fixed } });
    await tx.walletEntry.create({ data: { userId: current.id, type: "WITHDRAWAL_FROZEN", earningsDeltaCents: -amountCents, frozenDeltaCents: amountCents, referenceType: "WITHDRAWAL", referenceId: withdrawal.id, idempotencyKey: `withdrawal:${withdrawal.id}:freeze`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents, earningsAvailableCents: wallet.earningsAvailableCents - amountCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents + amountCents } } });
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
    const wallet = await tx.walletAccount.update({ where: { userId: current.id }, data: { earningsAvailableCents: { increment: request.amountCents }, withdrawalFrozenCents: { decrement: request.amountCents }, version: { increment: 1 } } });
    await tx.walletEntry.create({ data: { userId: current.id, type: "WITHDRAWAL_CANCELLED", earningsDeltaCents: request.amountCents, frozenDeltaCents: -request.amountCents, referenceType: "WITHDRAWAL", referenceId: request.id, idempotencyKey: `withdrawal:${request.id}:cancel`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents, earningsAvailableCents: wallet.earningsAvailableCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
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
    const wallet = await tx.walletAccount.update({ where: { userId: current.id }, data: { withdrawalFrozenCents: { decrement: request.amountCents }, version: { increment: 1 } } });
    await tx.walletEntry.create({ data: { userId: current.id, type: "WITHDRAWAL_COMPLETED", frozenDeltaCents: -request.amountCents, referenceType: "WITHDRAWAL", referenceId: request.id, idempotencyKey: `withdrawal:${request.id}:user-confirm`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents, earningsAvailableCents: wallet.earningsAvailableCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
    return { id, status: "COMPLETED" };
  }, serializable);
};

export const reviewBountyTask: ReviewBountyTask<{ taskId: string; approved: boolean; note?: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ taskId: z.string().uuid(), approved: z.boolean(), note: z.string().max(2_000).optional() }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { escrow: true } });
    if (!task || task.status !== "PENDING_REVIEW" || !task.escrow || task.escrow.status !== "HELD") throw new HttpError(409, "任务当前不可审核");
    if (args.approved) {
      const updated = await tx.userTask.update({ where: { id: task.id }, data: { status: "OPEN" } });
      await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "ADMIN", eventType: "REVIEW_APPROVED", beforeStatus: "PENDING_REVIEW", afterStatus: "OPEN", metadata: { note: args.note ?? null } } });
      return updated;
    }
    const wallet = await tx.walletAccount.update({ where: { userId: task.publisherId }, data: { rechargeAvailableCents: { increment: task.escrow.rechargeCents }, earningsAvailableCents: { increment: task.escrow.earningsCents }, version: { increment: 1 } } });
    await tx.walletEntry.create({ data: { userId: task.publisherId, type: "ESCROW_REFUNDED", rechargeDeltaCents: task.escrow.rechargeCents, earningsDeltaCents: task.escrow.earningsCents, referenceType: "TASK", referenceId: task.id, idempotencyKey: `task:${task.id}:review-refund`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents, earningsAvailableCents: wallet.earningsAvailableCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
    await tx.taskEscrow.update({ where: { taskId: task.id }, data: { status: "RELEASED", releasedAt: new Date() } });
    const updated = await tx.userTask.update({ where: { id: task.id }, data: { status: "REFUNDED" } });
    await tx.taskEvent.create({ data: { taskId: task.id, actorId: current.id, actorSource: "ADMIN", eventType: "REVIEW_REJECTED", beforeStatus: "PENDING_REVIEW", afterStatus: "REFUNDED", metadata: { note: args.note ?? null } } });
    return updated;
  }, serializable);
};

export const closeBountyTask: CloseBountyTask<{ taskId: string; reason: string }, any> = async (raw, context) => {
  const current = admin(context);
  const args = input(z.object({ taskId: z.string().uuid(), reason: z.string().trim().min(3).max(2_000) }), raw);
  return prisma.$transaction(async (tx) => {
    const task = await tx.userTask.findUnique({ where: { id: args.taskId }, include: { escrow: true, award: true } });
    if (!task || ["COMPLETED", "REFUNDED", "CLOSED", "CANCELLED"].includes(task.status)) throw new HttpError(409, "该任务当前不可关闭");
    if (task.award?.status === "CREDITED" || task.escrow?.status === "AWARDED") throw new HttpError(409, "奖励已经入账，不能关闭退款");
    const afterStatus = task.escrow?.status === "HELD" ? "REFUNDED" : "CLOSED";
    const claimed = await tx.userTask.updateMany({ where: { id: task.id, status: task.status }, data: { status: afterStatus } });
    if (claimed.count !== 1) throw new HttpError(409, "任务状态已变化，请刷新后重试");
    if (task.escrow?.status === "HELD") {
      const wallet = await tx.walletAccount.update({ where: { userId: task.publisherId }, data: { rechargeAvailableCents: { increment: task.escrow.rechargeCents }, earningsAvailableCents: { increment: task.escrow.earningsCents }, version: { increment: 1 } } });
      await tx.walletEntry.create({ data: { userId: task.publisherId, type: "ESCROW_REFUNDED", rechargeDeltaCents: task.escrow.rechargeCents, earningsDeltaCents: task.escrow.earningsCents, referenceType: "TASK", referenceId: task.id, idempotencyKey: `task:${task.id}:admin-close-refund`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents, earningsAvailableCents: wallet.earningsAvailableCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
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
  if (!env.PAYOUT_TOKEN_ENCRYPTION_KEY) throw new HttpError(503, "红包口令加密密钥尚未配置");
  const changed = await prisma.withdrawalRequest.updateMany({ where: { id: args.id, status: "REQUESTED" }, data: { status: "TOKEN_ISSUED", tokenCiphertext: encryptPayoutToken(args.token, env.PAYOUT_TOKEN_ENCRYPTION_KEY), tokenIssuedAt: new Date(), adminId: current.id, adminNote: args.note } });
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
    const wallet = await tx.walletAccount.update({ where: { userId: request.userId }, data: { withdrawalFrozenCents: { decrement: request.amountCents }, ...(args.completed ? {} : { earningsAvailableCents: { increment: request.amountCents } }), version: { increment: 1 } } });
    await tx.walletEntry.create({ data: { userId: request.userId, type: args.completed ? "WITHDRAWAL_COMPLETED" : "WITHDRAWAL_REJECTED", earningsDeltaCents: args.completed ? 0 : request.amountCents, frozenDeltaCents: -request.amountCents, referenceType: "WITHDRAWAL", referenceId: request.id, idempotencyKey: `withdrawal:${request.id}:${args.completed ? "complete" : "reject"}`, balanceSnapshot: { rechargeAvailableCents: wallet.rechargeAvailableCents, earningsAvailableCents: wallet.earningsAvailableCents, withdrawalFrozenCents: wallet.withdrawalFrozenCents } } });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: args.completed ? "WITHDRAWAL_COMPLETED" : "WITHDRAWAL_REJECTED", targetType: "WITHDRAWAL", targetId: request.id, metadata: { note: args.note ?? null } } });
    return { id: request.id, status: args.completed ? "COMPLETED" : "REJECTED" };
  }, serializable);
};
