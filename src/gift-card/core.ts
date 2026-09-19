import crypto from "node:crypto";

export function normalizeGiftCardSecret(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function generateGiftCardSecret() {
  const payload = crypto.randomBytes(16).toString("hex").toUpperCase();
  return `GC-${payload.match(/.{1,4}/g)!.join("-")}`;
}

export function hashGiftCardSecret(value: string, masterKey: string) {
  return crypto.createHmac("sha256", masterKey).update(normalizeGiftCardSecret(value)).digest("hex");
}

export function isGiftCardSecret(value: string) {
  return /^GC[A-F0-9]{32}$/.test(normalizeGiftCardSecret(value));
}
