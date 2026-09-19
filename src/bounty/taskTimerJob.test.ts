import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  taskClaim: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  userTask: { update: vi.fn() },
  taskEvent: { create: vi.fn() },
  walletAccount: { upsert: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  walletEntry: { findUnique: vi.fn(), create: vi.fn() },
  taskEscrow: { update: vi.fn() },
}));

vi.mock("wasp/server", () => ({ prisma: db }));

import { advanceTaskTimers } from "./taskTimerJob";

const baseClaim = {
  id: "claim-1",
  taskId: "task-1",
  workerId: "worker-1",
  outcome: null,
  dueAt: new Date("2026-09-10T11:00:00.000Z"),
  reviewDueAt: null,
  appealDeadline: null,
  task: {
    id: "task-1",
    publisherId: "publisher-1",
    assignedClaimId: "claim-1",
    status: "CLAIMED",
    claimDeadline: new Date("2999-09-10T13:00:00.000Z"),
    budgetCents: 1_000,
    award: null,
    escrow: {
      id: "escrow-1",
      status: "HELD",
      rechargeCents: 700,
      earningsCents: 300,
      totalCents: 1_000,
    },
  },
};

describe("task timer settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (work: (tx: typeof db) => unknown) => work(db));
    db.taskClaim.findMany.mockResolvedValue([{ id: baseClaim.id }]);
    db.taskClaim.update.mockResolvedValue({});
    db.userTask.update.mockResolvedValue({});
    db.taskEvent.create.mockResolvedValue({});
    db.taskEscrow.update.mockResolvedValue({});
    db.walletEntry.create.mockResolvedValue({});
    db.walletEntry.findUnique.mockResolvedValue(null);
    db.walletAccount.upsert.mockResolvedValue({
      version: 0,
      rechargeAvailableCents: 1_000,
      earningsAvailableCents: 500,
      withdrawalFrozenCents: 0,
    });
    db.walletAccount.updateMany.mockResolvedValue({ count: 1 });
    db.walletAccount.findUniqueOrThrow.mockResolvedValue({
      rechargeAvailableCents: 1_700,
      earningsAvailableCents: 800,
      withdrawalFrozenCents: 0,
    });
  });

  it("reopens an expired claim while the claim window is still open", async () => {
    db.taskClaim.findUnique.mockResolvedValue(baseClaim);

    await advanceTaskTimers(undefined as never, {} as never);

    expect(db.userTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "OPEN", assignedClaimId: null },
    });
    expect(db.walletAccount.updateMany).not.toHaveBeenCalled();
    expect(db.taskEscrow.update).not.toHaveBeenCalled();
  });

  it("refunds held escrow when an expired task can no longer reopen", async () => {
    db.taskClaim.findUnique.mockResolvedValue({
      ...baseClaim,
      task: { ...baseClaim.task, claimDeadline: new Date("2000-01-01T00:00:00.000Z") },
    });

    await advanceTaskTimers(undefined as never, {} as never);

    expect(db.walletAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "publisher-1", version: 0 }),
    }));
    expect(db.taskEscrow.update).toHaveBeenCalledWith({
      where: { taskId: "task-1" },
      data: { status: "RELEASED", releasedAt: expect.any(Date) },
    });
    expect(db.userTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "REFUNDED", assignedClaimId: null },
    });
    expect(db.walletEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: "task:task-1:deadline-refund",
        rechargeDeltaCents: 700,
        earningsDeltaCents: 300,
      }),
    });
  });
});
