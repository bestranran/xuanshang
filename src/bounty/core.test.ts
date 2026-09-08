import { describe, expect, it } from "vitest";
import {
  calculateFeeCents,
  canonicalizeEpayParams,
  decryptPayoutToken,
  encryptPayoutToken,
  parseMoneyToCents,
  signEpayParams,
  splitEscrow,
  verifyEpaySignature,
} from "./core";

describe("money", () => {
  it("rounds percentage fees up to a cent", () => {
    expect(calculateFeeCents(101, 100, 2)).toBe(4);
  });
  it.each([["1", 100], ["1.2", 120], ["1.23", 123]])("parses %s", (value, cents) => {
    expect(parseMoneyToCents(value)).toBe(cents);
  });
  it.each(["0", "-1", "1.234", "1e2", ".5", "01"])("rejects %s", (value) => {
    expect(() => parseMoneyToCents(value)).toThrow();
  });
});

describe("epay protocol vector", () => {
  const params = {
    pid: "1001",
    out_trade_no: "XS202609070001",
    notify_url: "https://example.com/api/epay/notify",
    return_url: "https://example.com/wallet/payment-result",
    name: "悬赏余额充值",
    money: "100.01",
    type: "alipay",
  };
  it("uses XBoard-compatible canonical ordering", () => {
    expect(canonicalizeEpayParams({ ...params, empty: "", sign: "ignored", sign_type: "MD5" })).toBe(
      "money=100.01&name=悬赏余额充值&notify_url=https://example.com/api/epay/notify&out_trade_no=XS202609070001&pid=1001&return_url=https://example.com/wallet/payment-result&type=alipay",
    );
  });
  it("matches the locked MD5 vector and detects tampering", () => {
    const sign = signEpayParams(params, "test-secret");
    expect(sign).toBe("0ae625656ba7e3b99c1bfd2868357dd0");
    expect(verifyEpaySignature({ ...params, sign, sign_type: "MD5" }, "test-secret")).toBe(true);
    expect(verifyEpaySignature({ ...params, money: "100.02", sign }, "test-secret")).toBe(false);
  });
});

it("uses recharge balance first when holding escrow", () => {
  expect(splitEscrow(1_000, 700, 500)).toEqual({ rechargeCents: 700, earningsCents: 300, totalCents: 1_000 });
  expect(() => splitEscrow(1_001, 700, 300)).toThrow("insufficient balance");
});

it("round-trips payout tokens with authenticated encryption", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptPayoutToken("支付宝红包口令", key);
  expect(encrypted).not.toContain("支付宝");
  expect(decryptPayoutToken(encrypted, key)).toBe("支付宝红包口令");
});
