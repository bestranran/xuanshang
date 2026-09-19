import { HttpError } from "wasp/server";
import * as z from "zod";

export type SessionUser = {
  id: string;
  isAdmin: boolean;
  isBanned: boolean;
};

export type OperationContext = {
  user?: SessionUser | null;
};

export const serializable = { isolationLevel: "Serializable" as const };

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, z.prettifyError(result.error));
  return result.data;
}

export function requireUser(context: OperationContext): SessionUser {
  if (!context.user) throw new HttpError(401);
  if (context.user.isBanned) throw new HttpError(403, "该账号已被封禁，当前仅可查看");
  return context.user;
}

export function requireAdmin(context: OperationContext): SessionUser {
  const current = requireUser(context);
  if (!current.isAdmin) throw new HttpError(403);
  return current;
}
