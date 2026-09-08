import { HttpError } from "wasp/server";
import type { GetPaginatedUsers, SetUserBan, UpdateIsUserAdminById } from "wasp/server/operations";

type ListArgs = { page?: number; pageSize?: number; emailContains?: string };
export const getPaginatedUsers: GetPaginatedUsers<ListArgs, any> = async (args = {}, context) => {
  if (!context.user?.isAdmin) throw new HttpError(403);
  if (context.user.isBanned) throw new HttpError(403, "该管理员账号已被封禁");
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 20));
  const where = args.emailContains ? { email: { contains: args.emailContains, mode: "insensitive" as const } } : {};
  const [users, total] = await Promise.all([
    context.entities.User.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    context.entities.User.count({ where }),
  ]);
  return { users, total, page, pageSize };
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
