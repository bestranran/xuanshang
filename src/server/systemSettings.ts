import crypto from "node:crypto";
import { env, prisma } from "wasp/server";

export const systemSettingKeys = [
  "site.title", "site.logoUrl",
  "payment.epayApiUrl", "payment.epayPid", "payment.epayKey", "payment.notifyUrl", "payment.returnUrl",
  "email.smtpHost", "email.smtpPort", "email.smtpUser", "email.smtpPassword", "email.fromName", "email.fromAddress",
  "storage.region", "storage.endpoint", "storage.accessKey", "storage.secretKey", "storage.bucket",
] as const;
export type SystemSettingKey = (typeof systemSettingKeys)[number];

export const secretSettingKeys = new Set<SystemSettingKey>([
  "payment.epayKey", "email.smtpPassword", "storage.accessKey", "storage.secretKey",
]);

function masterKey() {
  const key = Buffer.from(env.APP_MASTER_KEY, "base64");
  if (key.length !== 32) throw new Error("APP_MASTER_KEY 必须是 base64 编码的 32 字节密钥");
  return key;
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

function decrypt(value: string) {
  const [version, iv, tag, body] = value.split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("系统设置密文格式无效");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

export async function getSystemSettings(keys: readonly SystemSettingKey[] = systemSettingKeys) {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [...keys] } } });
  return Object.fromEntries(rows.map((row) => [row.key, decrypt(row.encryptedValue)])) as Partial<Record<SystemSettingKey, string>>;
}

export async function saveSystemSettings(values: Partial<Record<SystemSettingKey, string>>, adminId: string) {
  await prisma.$transaction(Object.entries(values).map(([key, raw]) => {
    const value = raw?.trim() ?? "";
    return value
      ? prisma.systemSetting.upsert({ where: { key }, create: { key, encryptedValue: encrypt(value), isSecret: secretSettingKeys.has(key as SystemSettingKey), updatedByAdminId: adminId }, update: { encryptedValue: encrypt(value), isSecret: secretSettingKeys.has(key as SystemSettingKey), updatedByAdminId: adminId } })
      : prisma.systemSetting.deleteMany({ where: { key } });
  }));
}
