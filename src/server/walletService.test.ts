import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("wasp/server", () => ({
  HttpError: class HttpError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

import { applyWalletMutation } from "./walletService";

const mutation = {
  userId: "user-1",
  delta: { rechargeCents: -300, earningsCents: 125 },
  type: "TEST_MUTATION",
  referenceType: "TEST",
  referenceId: "reference-1",
  idempotencyKey: "test:reference-1",
};

function transaction() {
  return {
    walletEntry: { findUnique: vi.fn(), create: vi.fn() },
    walletAccount: { upsert: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  };
}

describe("applyWalletMutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the original ledger entry for an idempotent replay", async () => {
    const tx = transaction();
    const existing = { id: "entry-1", userId: "user-1" };
    tx.walletEntry.findUnique.mockResolvedValue(existing);

    await expect(applyWalletMutation(tx as never, mutation)).resolves.toEqual({ entry: existing, applied: false });
    expect(tx.walletAccount.upsert).not.toHaveBeenCalled();
    expect(tx.walletEntry.create).not.toHaveBeenCalled();
  });

  it("rejects insufficient funds without writing a ledger entry", async () => {
    const tx = transaction();
    tx.walletEntry.findUnique.mockResolvedValue(null);
    tx.walletAccount.upsert.mockResolvedValue({ version: 7 });
    tx.walletAccount.updateMany.mockResolvedValue({ count: 0 });

    await expect(applyWalletMutation(tx as never, mutation)).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.walletEntry.create).not.toHaveBeenCalled();
  });

  it("records deltas and the post-mutation balance snapshot", async () => {
    const tx = transaction();
    tx.walletEntry.findUnique.mockResolvedValue(null);
    tx.walletAccount.upsert.mockResolvedValue({ version: 7 });
    tx.walletAccount.updateMany.mockResolvedValue({ count: 1 });
    tx.walletAccount.findUniqueOrThrow.mockResolvedValue({
      rechargeAvailableCents: 700,
      earningsAvailableCents: 625,
      withdrawalFrozenCents: 50,
    });
    tx.walletEntry.create.mockResolvedValue({ id: "entry-2" });

    const result = await applyWalletMutation(tx as never, mutation);

    expect(tx.walletAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", version: 7, rechargeAvailableCents: { gte: 300 } },
      data: {
        rechargeAvailableCents: { increment: -300 },
        earningsAvailableCents: { increment: 125 },
        withdrawalFrozenCents: { increment: 0 },
        version: { increment: 1 },
      },
    });
    expect(tx.walletEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      rechargeDeltaCents: -300,
      earningsDeltaCents: 125,
      frozenDeltaCents: 0,
      balanceSnapshot: {
        rechargeAvailableCents: 700,
        earningsAvailableCents: 625,
        withdrawalFrozenCents: 50,
      },
    }) });
    expect(result.applied).toBe(true);
  });

  it("allows an authorized caller to issue balance while preserving a ledger snapshot", async () => {
    const tx = transaction();
    tx.walletEntry.findUnique.mockResolvedValue(null);
    tx.walletAccount.upsert.mockResolvedValue({ version: 3 });
    tx.walletAccount.updateMany.mockResolvedValue({ count: 1 });
    tx.walletAccount.findUniqueOrThrow.mockResolvedValue({
      rechargeAvailableCents: 5_000,
      earningsAvailableCents: 0,
      withdrawalFrozenCents: 0,
    });
    tx.walletEntry.create.mockResolvedValue({ id: "entry-admin-credit" });

    await applyWalletMutation(tx as never, {
      ...mutation,
      delta: { rechargeCents: 5_000 },
      type: "ADMIN_RECHARGE_CREDIT",
      referenceType: "ADMIN_USER_ADJUSTMENT",
      idempotencyKey: "admin-adjust:request-1",
    });

    expect(tx.walletAccount.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", version: 3 },
      data: {
        rechargeAvailableCents: { increment: 5_000 },
        earningsAvailableCents: { increment: 0 },
        withdrawalFrozenCents: { increment: 0 },
        version: { increment: 1 },
      },
    });
    expect(tx.walletEntry.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: "ADMIN_RECHARGE_CREDIT",
      rechargeDeltaCents: 5_000,
      idempotencyKey: "admin-adjust:request-1",
      balanceSnapshot: {
        rechargeAvailableCents: 5_000,
        earningsAvailableCents: 0,
        withdrawalFrozenCents: 0,
      },
    }) });
  });
});
