import { HttpError } from "wasp/server";
import { prisma } from "wasp/server";
import type { AdjustUserWalletByAdmin, GetAdminUserDetails, GetPaginatedUsers, SetRechargeOrderStatusByAdmin, SetUserBan, UpdateIsUserAdminById } from "wasp/server/operations";
import * as z from "zod";
import { sendUserEmail } from "../server/userEmailNotifications";
import { parseInput as parse, requireAdmin, serializable } from "../server/operationUtils";
import { applyWalletMutation } from "../server/walletService";

type ListArgs = { page?: number; pageSize?: number; emailContains?: string };
export const getPaginatedUsers: GetPaginatedUsers<ListArgs, any> = async (args = {}, context) => {
  requireAdmin(context);
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 20));
  const search = args.emailContains?.trim();
  const publicNo = search?.match(/^U0*(\d+)$/i)?.[1];
  const where = search ? { OR: [
    { email: { contains: search, mode: "insensitive" as const } },
    { username: { contains: search, mode: "insensitive" as const } },
    ...(publicNo ? [{ publicNo: Number(publicNo) }] : []),
  ] } : {};
  const [users, total] = await Promise.all([
    context.entities.User.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    context.entities.User.count({ where }),
  ]);
  return { users, total, page, pageSize };
};

export const getAdminUserDetails: GetAdminUserDetails<{ id: string }, any> = async (raw, context) => {
  requireAdmin(context);
  const { id } = parse(z.object({ id: z.string().uuid() }), raw);
  const details = await prisma.user.findUnique({
    where: { id },
    include: {
      wallet: true,
      walletEntries: { orderBy: { createdAt: "desc" }, take: 100 },
      rechargeOrders: { orderBy: { createdAt: "desc" }, take: 100 },
      withdrawalRequests: { orderBy: { createdAt: "desc" }, take: 100 },
      publishedTasks: { orderBy: { createdAt: "desc" }, take: 100 },
      taskClaims: { include: { task: { select: { id: true, publicNo: true, title: true, status: true, budgetCents: true } } }, orderBy: { claimedAt: "desc" }, take: 100 },
      publishedContests: { orderBy: { createdAt: "desc" }, take: 100 },
      contestEntries: { include: { contest: { select: { id: true, publicNo: true, title: true, status: true, totalPrizeCents: true } } }, orderBy: { submittedAt: "desc" }, take: 100 },
      _count: { select: { walletEntries: true, rechargeOrders: true, withdrawalRequests: true, publishedTasks: true, taskClaims: true, publishedContests: true, contestEntries: true } },
    },
  });
  if (!details) throw new HttpError(404, "用户不存在");
  return {
    ...details,
    withdrawalRequests: details.withdrawalRequests.map(({ tokenCiphertext: _tokenCiphertext, ...request }) => request),
  };
};

export const adjustUserWalletByAdmin: AdjustUserWalletByAdmin<{
  userId: string;
  bucket: "RECHARGE" | "EARNINGS";
  direction: "CREDIT" | "DEBIT";
  amountCents: number;
  reason: string;
  requestId: string;
}, any> = async (raw, context) => {
  const current = requireAdmin(context);
  const args = parse(z.object({
    userId: z.string().uuid(),
    bucket: z.enum(["RECHARGE", "EARNINGS"]),
    direction: z.enum(["CREDIT", "DEBIT"]),
    amountCents: z.number().int().positive().max(100_000_000),
    reason: z.string().trim().min(3).max(2_000),
    requestId: z.string().uuid(),
  }), raw);
  const idempotencyKey = `admin-adjust:${args.requestId}`;
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.walletEntry.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.userId !== args.userId) throw new HttpError(409, "该请求编号已被使用");
      return { entry: existing, applied: false };
    }
    const target = await tx.user.findUnique({ where: { id: args.userId }, select: { id: true, publicNo: true } });
    if (!target) throw new HttpError(404, "用户不存在");
    const isCredit = args.direction === "CREDIT";
    const delta = isCredit ? args.amountCents : -args.amountCents;
    const wallet = await tx.walletAccount.upsert({ where: { userId: target.id }, update: {}, create: { userId: target.id } });
    const mutation = await applyWalletMutation(tx, {
      userId: target.id,
      delta: args.bucket === "RECHARGE" ? { rechargeCents: delta } : { earningsCents: delta },
      type: `ADMIN_${args.bucket}_${args.direction}`,
      referenceType: "ADMIN_USER_ADJUSTMENT",
      referenceId: target.id,
      idempotencyKey,
      note: args.reason,
    });
    if (mutation.applied) await tx.adminAuditLog.create({ data: { adminId: current.id, action: isCredit ? "USER_BALANCE_CREDITED" : "USER_BALANCE_DEBITED", targetType: "USER", targetId: target.id, metadata: { publicNo: target.publicNo, bucket: args.bucket, amountCents: args.amountCents, reason: args.reason, before: wallet, after: mutation.wallet, requestId: args.requestId } } });
    return { entry: mutation.entry, applied: mutation.applied };
  }, serializable);
  if (result.applied) void sendUserEmail(prisma, args.userId, "walletEmails", "账户余额已由管理员调整", `${args.reason}：${args.direction === "CREDIT" ? "增加" : "扣减"} ¥${(args.amountCents / 100).toFixed(2)}。`);
  return result.entry;
};

export const setRechargeOrderStatusByAdmin: SetRechargeOrderStatusByAdmin<{
  id: string;
  action: "CONFIRM_PAID" | "CLOSE" | "REFUND";
  reason: string;
}, any> = async (raw, context) => {
  const current = requireAdmin(context);
  const args = parse(z.object({ id: z.string().uuid(), action: z.enum(["CONFIRM_PAID", "CLOSE", "REFUND"]), reason: z.string().trim().min(3).max(2_000) }), raw);
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.rechargeOrder.findUnique({ where: { id: args.id }, include: { user: { select: { publicNo: true } } } });
    if (!order) throw new HttpError(404, "充值订单不存在");
    if (args.action === "CLOSE") {
      if (order.status === "CLOSED") return { order, applied: false };
      if (order.status !== "CREATED") throw new HttpError(409, "只有未支付订单可以关闭");
      const updatedOrder = await tx.rechargeOrder.update({ where: { id: order.id }, data: { status: "CLOSED" } });
      await tx.adminAuditLog.create({ data: { adminId: current.id, action: "RECHARGE_ORDER_CLOSED", targetType: "RECHARGE_ORDER", targetId: order.id, metadata: { publicNo: order.publicNo, reason: args.reason } } });
      return { order: updatedOrder, applied: true };
    }
    if (args.action === "CONFIRM_PAID") {
      if (order.status === "PAID" && await tx.walletEntry.findUnique({ where: { idempotencyKey: `recharge:${order.id}:admin-paid` } })) return { order, applied: false };
      if (order.status !== "CREATED") throw new HttpError(409, "只有未支付订单可以补记支付");
      const claimed = await tx.rechargeOrder.updateMany({ where: { id: order.id, status: "CREATED" }, data: { status: "PAID", paidAt: new Date() } });
      if (claimed.count !== 1) throw new HttpError(409, "订单状态已变化");
      await applyWalletMutation(tx, { userId: order.userId, delta: { rechargeCents: order.creditCents }, type: "ADMIN_RECHARGE_PAID", referenceType: "RECHARGE_ORDER", referenceId: order.id, idempotencyKey: `recharge:${order.id}:admin-paid`, note: args.reason });
      await tx.adminAuditLog.create({ data: { adminId: current.id, action: "RECHARGE_ORDER_CONFIRMED", targetType: "RECHARGE_ORDER", targetId: order.id, metadata: { publicNo: order.publicNo, creditCents: order.creditCents, reason: args.reason } } });
      return { order: { ...order, status: "PAID" as const }, applied: true };
    }
    if (order.status === "REFUNDED" && await tx.walletEntry.findUnique({ where: { idempotencyKey: `recharge:${order.id}:admin-refund` } })) return { order, applied: false };
    if (order.status !== "PAID") throw new HttpError(409, "只有已支付订单可以退款");
    await applyWalletMutation(tx, { userId: order.userId, delta: { rechargeCents: -order.creditCents }, type: "ADMIN_RECHARGE_REFUNDED", referenceType: "RECHARGE_ORDER", referenceId: order.id, idempotencyKey: `recharge:${order.id}:admin-refund`, note: args.reason });
    await tx.rechargeOrder.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: "RECHARGE_ORDER_REFUNDED", targetType: "RECHARGE_ORDER", targetId: order.id, metadata: { publicNo: order.publicNo, creditCents: order.creditCents, reason: args.reason } } });
    return { order: { ...order, status: "REFUNDED" as const }, applied: true };
  }, serializable);
  if (result.applied) void sendUserEmail(prisma, result.order.userId, "walletEmails", "充值订单状态已由管理员调整", `充值订单 R${String(result.order.publicNo).padStart(6, "0")}：${args.reason}。`);
  return result.order;
};

export const updateIsUserAdminById: UpdateIsUserAdminById<{ id: string; isAdmin: boolean }, any> = async (args, context) => {
  if (!context.user?.isAdmin) throw new HttpError(403);
  if (context.user.isBanned) throw new HttpError(403, "该管理员账号已被封禁");
  if (args.id === context.user.id && !args.isAdmin) throw new HttpError(409, "不能移除自己的管理员权限");
  const updated = await context.entities.User.update({ where: { id: args.id }, data: { isAdmin: args.isAdmin } });
  await context.entities.AdminAuditLog.create({ data: { adminId: context.user.id, action: args.isAdmin ? "USER_ADMIN_GRANTED" : "USER_ADMIN_REVOKED", targetType: "USER", targetId: args.id, metadata: {} } });
  return updated;
};

export const setUserBan: SetUserBan<{ id: string; banned: boolean; reason?: string }, any> = async (args, context) => {
  if (!context.user?.isAdmin) throw new HttpError(403);
  if (context.user.isBanned) throw new HttpError(403, "该管理员账号已被封禁");
  if (!args.id || typeof args.banned !== "boolean") throw new HttpError(400);
  if (args.id === context.user.id && args.banned) throw new HttpError(409, "不能封禁自己的账号");
  const reason = args.reason?.trim();
  if (args.banned && (!reason || reason.length < 3)) throw new HttpError(400, "封禁原因至少填写 3 个字");
  const updated = await context.entities.User.update({ where: { id: args.id }, data: { isBanned: args.banned, bannedReason: args.banned ? reason : null } });
  await context.entities.AdminAuditLog.create({ data: { adminId: context.user.id, action: args.banned ? "USER_BANNED" : "USER_UNBANNED", targetType: "USER", targetId: args.id, metadata: { reason: reason ?? null } } });
  return updated;
};
