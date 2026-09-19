import type { Prisma } from "@prisma/client";
import { HttpError } from "wasp/server";

type WalletDelta = {
  rechargeCents?: number;
  earningsCents?: number;
  frozenCents?: number;
};

type WalletMutation = {
  userId: string;
  delta: WalletDelta;
  type: string;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  note?: string;
};

export async function applyWalletMutation(tx: Prisma.TransactionClient, mutation: WalletMutation) {
  const existing = await tx.walletEntry.findUnique({ where: { idempotencyKey: mutation.idempotencyKey } });
  if (existing) {
    if (existing.userId !== mutation.userId) throw new HttpError(409, "幂等请求与原账户不一致");
    return { entry: existing, applied: false };
  }

  const delta = {
    rechargeCents: mutation.delta.rechargeCents ?? 0,
    earningsCents: mutation.delta.earningsCents ?? 0,
    frozenCents: mutation.delta.frozenCents ?? 0,
  };
  const wallet = await tx.walletAccount.upsert({ where: { userId: mutation.userId }, update: {}, create: { userId: mutation.userId } });
  const changed = await tx.walletAccount.updateMany({
    where: {
      userId: mutation.userId,
      version: wallet.version,
      ...(delta.rechargeCents < 0 ? { rechargeAvailableCents: { gte: -delta.rechargeCents } } : {}),
      ...(delta.earningsCents < 0 ? { earningsAvailableCents: { gte: -delta.earningsCents } } : {}),
      ...(delta.frozenCents < 0 ? { withdrawalFrozenCents: { gte: -delta.frozenCents } } : {}),
    },
    data: {
      rechargeAvailableCents: { increment: delta.rechargeCents },
      earningsAvailableCents: { increment: delta.earningsCents },
      withdrawalFrozenCents: { increment: delta.frozenCents },
      version: { increment: 1 },
    },
  });
  if (changed.count !== 1) throw new HttpError(409, "余额不足或账户已发生变化，请重试");

  const updated = await tx.walletAccount.findUniqueOrThrow({ where: { userId: mutation.userId } });
  const entry = await tx.walletEntry.create({
    data: {
      userId: mutation.userId,
      type: mutation.type,
      rechargeDeltaCents: delta.rechargeCents,
      earningsDeltaCents: delta.earningsCents,
      frozenDeltaCents: delta.frozenCents,
      referenceType: mutation.referenceType,
      referenceId: mutation.referenceId,
      idempotencyKey: mutation.idempotencyKey,
      note: mutation.note,
      balanceSnapshot: {
        rechargeAvailableCents: updated.rechargeAvailableCents,
        earningsAvailableCents: updated.earningsAvailableCents,
        withdrawalFrozenCents: updated.withdrawalFrozenCents,
      },
    },
  });
  return { entry, wallet: updated, applied: true };
}
