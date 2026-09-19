import { env, HttpError, prisma } from "wasp/server";
import type { CreateGiftCardBatch, GetGiftCardBatchDetails, GetGiftCardBatches, RedeemGiftCard, SetGiftCardEnabled } from "wasp/server/operations";
import * as z from "zod";
import { generateGiftCardSecret, hashGiftCardSecret, isGiftCardSecret } from "./core";
import { applyWalletMutation } from "../server/walletService";
import { parseInput as parse, requireAdmin, requireUser, serializable } from "../server/operationUtils";

export const createGiftCardBatch: CreateGiftCardBatch<{
  name: string;
  amountCents: number;
  quantity: number;
  fundingSourceNote: string;
  expiresAt?: string;
}, any> = async (raw, context) => {
  const current = requireAdmin(context);
  const args = parse(z.object({
    name: z.string().trim().min(2).max(100),
    amountCents: z.number().int().positive().max(100_000_000),
    quantity: z.number().int().min(1).max(500),
    fundingSourceNote: z.string().trim().min(3).max(2_000),
    expiresAt: z.string().datetime().optional(),
  }), raw);
  const expiresAt = args.expiresAt ? new Date(args.expiresAt) : null;
  if (expiresAt && expiresAt <= new Date()) throw new HttpError(400, "有效期必须晚于当前时间");

  const generated = Array.from({ length: args.quantity }, () => {
    const secret = generateGiftCardSecret();
    return { secret, secretHmac: hashGiftCardSecret(secret, env.APP_MASTER_KEY), lastFour: secret.slice(-4) };
  });
  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.giftCardBatch.create({
      data: {
        name: args.name,
        amountCents: args.amountCents,
        quantity: args.quantity,
        fundingSourceNote: args.fundingSourceNote,
        expiresAt,
        createdByAdminId: current.id,
        cards: { create: generated.map(({ secret: _secret, ...card }) => card) },
      },
      include: { cards: { select: { publicNo: true, secretHmac: true, lastFour: true } } },
    });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: "GIFT_CARD_BATCH_CREATED", targetType: "GIFT_CARD_BATCH", targetId: created.id, metadata: { publicNo: created.publicNo, name: created.name, amountCents: created.amountCents, quantity: created.quantity, fundingSourceNote: created.fundingSourceNote, expiresAt } } });
    return created;
  }, serializable);
  const secrets = new Map(generated.map((card) => [card.secretHmac, card.secret]));
  return {
    batch: { id: batch.id, publicNo: batch.publicNo, name: batch.name, amountCents: batch.amountCents, quantity: batch.quantity, expiresAt: batch.expiresAt, createdAt: batch.createdAt },
    cards: batch.cards.map((card) => ({ publicNo: card.publicNo, secret: secrets.get(card.secretHmac), lastFour: card.lastFour })).sort((a, b) => a.publicNo - b.publicNo),
  };
};

export const getGiftCardBatches: GetGiftCardBatches<void, any> = async (_raw, context) => {
  requireAdmin(context);
  const batches = await prisma.giftCardBatch.findMany({ include: { _count: { select: { cards: true } }, cards: { select: { redeemedAt: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  return batches.map(({ cards, ...batch }) => ({ ...batch, redeemedCount: cards.filter((card) => card.redeemedAt).length }));
};

export const getGiftCardBatchDetails: GetGiftCardBatchDetails<{ id: string }, any> = async (raw, context) => {
  requireAdmin(context);
  const { id } = parse(z.object({ id: z.string().uuid() }), raw);
  const batch = await prisma.giftCardBatch.findUnique({
    where: { id },
    include: { cards: { include: { redeemedBy: { select: { id: true, publicNo: true, username: true, email: true } } }, orderBy: { publicNo: "asc" } } },
  });
  if (!batch) throw new HttpError(404, "礼品卡批次不存在");
  return batch;
};

export const setGiftCardEnabled: SetGiftCardEnabled<{
  target: "BATCH" | "CARD";
  id: string;
  enabled: boolean;
}, any> = async (raw, context) => {
  const current = requireAdmin(context);
  const args = parse(z.object({ target: z.enum(["BATCH", "CARD"]), id: z.string().uuid(), enabled: z.boolean() }), raw);
  return prisma.$transaction(async (tx) => {
    if (args.target === "BATCH") {
      const existing = await tx.giftCardBatch.findUnique({ where: { id: args.id } });
      if (!existing) throw new HttpError(404, "礼品卡批次不存在");
      const updated = await tx.giftCardBatch.update({ where: { id: args.id }, data: { disabled: !args.enabled } });
      await tx.adminAuditLog.create({ data: { adminId: current.id, action: args.enabled ? "GIFT_CARD_BATCH_ENABLED" : "GIFT_CARD_BATCH_DISABLED", targetType: "GIFT_CARD_BATCH", targetId: updated.id, metadata: { publicNo: updated.publicNo } } });
      return updated;
    }
    const existing = await tx.giftCard.findUnique({ where: { id: args.id } });
    if (!existing) throw new HttpError(404, "礼品卡不存在");
    if (existing.redeemedAt) throw new HttpError(409, "已兑换的礼品卡不能更改状态");
    const updated = await tx.giftCard.update({ where: { id: args.id }, data: { disabled: !args.enabled } });
    await tx.adminAuditLog.create({ data: { adminId: current.id, action: args.enabled ? "GIFT_CARD_ENABLED" : "GIFT_CARD_DISABLED", targetType: "GIFT_CARD", targetId: updated.id, metadata: { publicNo: updated.publicNo, batchId: updated.batchId, lastFour: updated.lastFour } } });
    return updated;
  }, serializable);
};

export const redeemGiftCard: RedeemGiftCard<{ secret: string }, any> = async (raw, context) => {
  const current = requireUser(context);
  const { secret } = parse(z.object({ secret: z.string().trim().min(1).max(100) }), raw);
  if (!isGiftCardSecret(secret)) throw new HttpError(400, "礼品卡卡密格式不正确");
  const secretHmac = hashGiftCardSecret(secret, env.APP_MASTER_KEY);
  try {
    return await prisma.$transaction(async (tx) => {
      const card = await tx.giftCard.findUnique({ where: { secretHmac }, include: { batch: true } });
      if (!card) throw new HttpError(404, "礼品卡卡密无效");
      if (card.redeemedAt) throw new HttpError(409, "这张礼品卡已经兑换过了");
      if (card.disabled || card.batch.disabled) throw new HttpError(409, "这张礼品卡当前已停用");
      if (card.batch.expiresAt && card.batch.expiresAt <= new Date()) throw new HttpError(409, "这张礼品卡已经过期");
      const redeemedAt = new Date();
      const claimed = await tx.giftCard.updateMany({ where: { id: card.id, redeemedAt: null, disabled: false }, data: { redeemedAt, redeemedById: current.id } });
      if (claimed.count !== 1) throw new HttpError(409, "这张礼品卡已经兑换过了");
      const credited = await applyWalletMutation(tx, {
        userId: current.id,
        delta: { rechargeCents: card.batch.amountCents },
        type: "GIFT_CARD_REDEEMED",
        referenceType: "GIFT_CARD",
        referenceId: card.id,
        idempotencyKey: `gift-card:${card.id}:redeemed`,
        note: `兑换礼品卡 · 尾号 ${card.lastFour}`,
      });
      return { amountCents: card.batch.amountCents, balanceCents: credited.wallet!.rechargeAvailableCents, redeemedAt, cardPublicNo: card.publicNo };
    }, serializable);
  } catch (error: any) {
    if (error?.code === "P2034" || error?.code === "P2002") throw new HttpError(409, "礼品卡状态已变化，请勿重复兑换");
    throw error;
  }
};
