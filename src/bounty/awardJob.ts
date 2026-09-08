import type { CreditAvailableAwards } from "wasp/server/jobs";
import { prisma } from "wasp/server";

export const creditAvailableAwards: CreditAvailableAwards<never, void> = async () => {
  const due = await prisma.award.findMany({
    where: { status: "COOLING", availableAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });

  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const award = await tx.award.findUnique({ where: { id }, include: { task: { include: { escrow: true } } } });
      if (!award || award.status !== "COOLING" || award.availableAt > new Date()) return;
      if (!award.task.escrow || award.task.escrow.status !== "HELD" || award.task.status !== "JUDGING") return;
      const claimed = await tx.award.updateMany({ where: { id, status: "COOLING" }, data: { status: "CREDITED", creditedAt: new Date() } });
      if (claimed.count !== 1) return;
      const wallet = await tx.walletAccount.upsert({
        where: { userId: award.recipientId },
        update: { earningsAvailableCents: { increment: award.amountCents }, version: { increment: 1 } },
        create: { userId: award.recipientId, earningsAvailableCents: award.amountCents },
      });
      await tx.walletEntry.create({
        data: {
          userId: award.recipientId,
          type: "AWARD_CREDITED",
          earningsDeltaCents: award.amountCents,
          referenceType: "AWARD",
          referenceId: award.id,
          idempotencyKey: `award:${award.id}:credit`,
          balanceSnapshot: {
            rechargeAvailableCents: wallet.rechargeAvailableCents,
            earningsAvailableCents: wallet.earningsAvailableCents,
            withdrawalFrozenCents: wallet.withdrawalFrozenCents,
          },
        },
      });
      await tx.taskEscrow.update({ where: { taskId: award.taskId }, data: { status: "AWARDED", releasedAt: new Date() } });
      await tx.userTask.update({ where: { id: award.taskId }, data: { status: "COMPLETED" } });
      await tx.taskEvent.create({ data: { taskId: award.taskId, actorSource: "SYSTEM", eventType: "AWARD_CREDITED", beforeStatus: "JUDGING", afterStatus: "COMPLETED", metadata: { awardId: award.id } } });
    }, { isolationLevel: "Serializable" });
  }

  const contestDue = await prisma.contestAward.findMany({
    where: { status: "COOLING", availableAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });

  for (const { id } of contestDue) {
    await prisma.$transaction(async (tx) => {
      const award = await tx.contestAward.findUnique({ where: { id }, include: { contest: { include: { escrow: true } } } });
      if (!award || award.status !== "COOLING" || award.availableAt > new Date()) return;
      if (!award.contest.escrow || award.contest.escrow.status !== "HELD" || award.contest.status !== "COOLING") return;
      const claimed = await tx.contestAward.updateMany({ where: { id, status: "COOLING" }, data: { status: "CREDITED", creditedAt: new Date() } });
      if (claimed.count !== 1) return;
      const wallet = await tx.walletAccount.upsert({
        where: { userId: award.recipientId },
        update: { earningsAvailableCents: { increment: award.amountCents }, version: { increment: 1 } },
        create: { userId: award.recipientId, earningsAvailableCents: award.amountCents },
      });
      await tx.walletEntry.create({
        data: {
          userId: award.recipientId,
          type: "CONTEST_AWARD_CREDITED",
          earningsDeltaCents: award.amountCents,
          referenceType: "CONTEST_AWARD",
          referenceId: award.id,
          idempotencyKey: `contest-award:${award.id}:credit`,
          balanceSnapshot: {
            rechargeAvailableCents: wallet.rechargeAvailableCents,
            earningsAvailableCents: wallet.earningsAvailableCents,
            withdrawalFrozenCents: wallet.withdrawalFrozenCents,
          },
        },
      });
      const remaining = await tx.contestAward.count({ where: { contestId: award.contestId, status: { not: "CREDITED" } } });
      if (remaining === 0) {
        await tx.contestEscrow.update({ where: { contestId: award.contestId }, data: { status: "AWARDED", releasedAt: new Date() } });
        await tx.contest.update({ where: { id: award.contestId }, data: { status: "COMPLETED" } });
      }
    }, { isolationLevel: "Serializable" });
  }
};
