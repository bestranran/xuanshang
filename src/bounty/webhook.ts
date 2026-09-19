import crypto from "node:crypto";
import { prisma } from "wasp/server";
import type { EpayNotify } from "wasp/server/api";
import { parseMoneyToCents, verifyEpaySignature, type EpayParams } from "./core";
import { getSystemSettings } from "../server/systemSettings";
import { sendUserEmail } from "../server/userEmailNotifications";
import { applyWalletMutation } from "../server/walletService";

function payloadFrom(value: unknown): EpayParams {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, field]) =>
      typeof field === "string" ? [[key, field]] : [],
    ),
  );
}

function hashPayload(payload: EpayParams) {
  const stable = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)));
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

export const epayNotify: EpayNotify = async (request, response) => {
  const settings = await getSystemSettings(["payment.epayKey"]);
  const payload = payloadFrom(request.body);
  const orderNo = payload.out_trade_no ?? "";
  const epayTradeNo = payload.trade_no ?? null;
  const epayKey = settings["payment.epayKey"];
  const signatureValid = Boolean(epayKey) && verifyEpaySignature(payload, epayKey!);
  const order = orderNo ? await prisma.rechargeOrder.findUnique({ where: { orderNo } }) : null;
  let validationResult = "OK";
  let processingResult = "REJECTED";

  try {
    if (!signatureValid) throw new Error("INVALID_SIGNATURE");
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!epayTradeNo) throw new Error("MISSING_TRADE_NO");
    if (payload.trade_status !== "TRADE_SUCCESS") throw new Error("NOT_SUCCESSFUL");
    if (parseMoneyToCents(payload.money ?? "") !== order.payableCents) throw new Error("AMOUNT_MISMATCH");

    processingResult = await prisma.$transaction(async (tx) => {
      const claimed = await tx.rechargeOrder.updateMany({
        where: { id: order.id, status: "CREATED", epayTradeNo: null },
        data: { status: "PAID", epayTradeNo, paidAt: new Date() },
      });
      if (claimed.count === 0) {
        const existing = await tx.rechargeOrder.findUnique({ where: { id: order.id } });
        if (existing?.status === "PAID" && existing.epayTradeNo === epayTradeNo) return "LEGAL_DUPLICATE";
        throw new Error("ORDER_ALREADY_PROCESSED");
      }
      await applyWalletMutation(tx, { userId: order.userId, delta: { rechargeCents: order.creditCents }, type: "RECHARGE_PAID", referenceType: "RECHARGE_ORDER", referenceId: order.id, idempotencyKey: `recharge:${order.id}:credit` });
      return "CREDITED";
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    validationResult = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  }

  await prisma.paymentNotification.create({
    data: {
      orderNo,
      rechargeOrderId: order?.id,
      epayTradeNo,
      payloadJson: payload,
      payloadHash: hashPayload(payload),
      signatureValid,
      validationResult,
      processingResult,
    },
  });

  if (processingResult === "CREDITED" && order) {
    void sendUserEmail(prisma, order.userId, "walletEmails", "充值已到账", `充值金额 ¥${(order.creditCents / 100).toFixed(2)} 已进入你的充值余额。`);
  }

  if (processingResult === "CREDITED" || processingResult === "LEGAL_DUPLICATE") {
    return response.status(200).type("text/plain").send("success");
  }
  return response.status(400).type("text/plain").send("fail");
};
