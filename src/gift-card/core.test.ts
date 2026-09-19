import { describe, expect, it } from "vitest";
import { generateGiftCardSecret, hashGiftCardSecret, isGiftCardSecret, normalizeGiftCardSecret } from "./core";

describe("gift card secrets", () => {
  it("generates 128-bit formatted secrets", () => {
    const values = new Set(Array.from({ length: 100 }, generateGiftCardSecret));
    expect(values.size).toBe(100);
    for (const value of values) expect(isGiftCardSecret(value)).toBe(true);
  });

  it("normalizes formatting without weakening the HMAC", () => {
    const secret = "GC-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF";
    expect(normalizeGiftCardSecret(secret.toLowerCase())).toBe("GC0123456789ABCDEF0123456789ABCDEF");
    expect(hashGiftCardSecret(secret, "master-key")).toBe(hashGiftCardSecret(secret.toLowerCase().replaceAll("-", " "), "master-key"));
    expect(hashGiftCardSecret(secret, "master-key")).not.toBe(hashGiftCardSecret(secret, "another-key"));
  });
});
