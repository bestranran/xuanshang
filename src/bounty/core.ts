import crypto from "node:crypto";

export type EpayParams = Record<string, string>;

export function assertPositiveCents(value: number, field = "amountCents") {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

export function calculateFeeCents(
  amountCents: number,
  rateBps: number,
  fixedFeeCents: number,
) {
  assertPositiveCents(amountCents);
  if (!Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new Error("rateBps must be an integer between 0 and 10000");
  }
  if (!Number.isSafeInteger(fixedFeeCents) || fixedFeeCents < 0) {
    throw new Error("fixedFeeCents must be a non-negative integer");
  }
  return Math.ceil((amountCents * rateBps) / 10_000) + fixedFeeCents;
}

export function parseMoneyToCents(value: string) {
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value)) {
    throw new Error("money must be a non-negative decimal with at most two places");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  assertPositiveCents(cents, "money");
  return cents;
}

export function formatCents(cents: number) {
  assertPositiveCents(cents);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

// XBoard 4f48e61 compatibility: sorted, non-empty fields, no URL encoding,
// excluding sign/sign_type, followed directly by the merchant key.
export function canonicalizeEpayParams(params: EpayParams) {
  return Object.entries(params)
    .filter(([key, value]) => key !== "sign" && key !== "sign_type" && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function signEpayParams(params: EpayParams, merchantKey: string) {
  if (!merchantKey) throw new Error("merchant key is required");
  return crypto
    .createHash("md5")
    .update(canonicalizeEpayParams(params) + merchantKey, "utf8")
    .digest("hex");
}

export function verifyEpaySignature(params: EpayParams, merchantKey: string) {
  const supplied = params.sign?.toLowerCase();
  if (!supplied || !/^[a-f0-9]{32}$/.test(supplied)) return false;
  const expected = signEpayParams(params, merchantKey);
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export function splitEscrow(
  budgetCents: number,
  rechargeAvailableCents: number,
  earningsAvailableCents: number,
) {
  assertPositiveCents(budgetCents, "budgetCents");
  const rechargeCents = Math.min(budgetCents, rechargeAvailableCents);
  const earningsCents = budgetCents - rechargeCents;
  if (earningsCents > earningsAvailableCents) throw new Error("insufficient balance");
  return { rechargeCents, earningsCents, totalCents: budgetCents };
}

export function encryptPayoutToken(token: string, base64Key: string) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("encryption key must decode to 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptPayoutToken(payload: string, base64Key: string) {
  const key = Buffer.from(base64Key, "base64");
  const [iv, tag, ciphertext] = payload.split(".").map((part) => Buffer.from(part, "base64url"));
  if (key.length !== 32 || !iv || !tag || !ciphertext) throw new Error("invalid encrypted token");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
