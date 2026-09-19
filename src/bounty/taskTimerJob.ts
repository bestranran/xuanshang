import type { AdvanceTaskTimers } from "wasp/server/jobs";
import { prisma } from "wasp/server";
import { taskCanReopen } from "./core";
import { applyWalletMutation } from "../server/walletService";
import { assertTaskTransition } from "./taskState";

const serializable = { isolationLevel: "Serializable" as const };

export const advanceTaskTimers: AdvanceTaskTimers<never, void> = async () => {
  const now = new Date();
  const due = await prisma.taskClaim.findMany({
    where: {
      outcome: null,
      OR: [
        { dueAt: { lte: now } },
        { reviewDueAt: { lte: now } },
        { appealDeadline: { lte: now } },
      ],
    },
    select: { id: true },
    take: 100,
  });

  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.taskClaim.findUnique({ where: { id }, include: { task: { include: { award: true, escrow: true } } } });
      if (!claim || claim.outcome || claim.task.assignedClaimId !== claim.id) return;
      const currentTime = new Date();

      const reopenOrRefund = async (eventType: string, beforeStatus: "CLAIMED" | "REJECTED_PENDING_APPEAL") => {
        const canReopen = taskCanReopen(claim.task.claimDeadline, currentTime);
        const escrow = claim.task.escrow;
        const afterStatus = canReopen ? "OPEN" : escrow?.status === "HELD" ? "REFUNDED" : "CLOSED";
        assertTaskTransition(claim.task.status, afterStatus);

        if (!canReopen && escrow?.status === "HELD") {
          await applyWalletMutation(tx, { userId: claim.task.publisherId, delta: { rechargeCents: escrow.rechargeCents, earningsCents: escrow.earningsCents }, type: "ESCROW_REFUNDED", referenceType: "TASK", referenceId: claim.taskId, idempotencyKey: `task:${claim.taskId}:deadline-refund` });
          await tx.taskEscrow.update({
            where: { taskId: claim.taskId },
            data: { status: "RELEASED", releasedAt: currentTime },
          });
        }

        await tx.userTask.update({ where: { id: claim.taskId }, data: { status: afterStatus, assignedClaimId: null } });
        await tx.taskEvent.create({
          data: {
            taskId: claim.taskId,
            actorSource: "SYSTEM",
            eventType,
            beforeStatus,
            afterStatus,
            metadata: { claimId: id, refunded: afterStatus === "REFUNDED" },
          },
        });
      };

      if (claim.task.status === "CLAIMED" && claim.dueAt <= currentTime) {
        await tx.taskClaim.update({ where: { id }, data: { outcome: "EXPIRED", resolvedAt: currentTime } });
        await reopenOrRefund("CLAIM_EXPIRED", "CLAIMED");
        return;
      }

      if (claim.task.status === "SUBMITTED" && claim.reviewDueAt && claim.reviewDueAt <= currentTime && !claim.task.award) {
        assertTaskTransition(claim.task.status, "COOLING");
        const availableAt = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000);
        const award = await tx.award.create({ data: { taskId: claim.taskId, recipientId: claim.workerId, amountCents: claim.task.budgetCents, availableAt } });
        await tx.taskClaim.update({ where: { id }, data: { outcome: "APPROVED", resolvedAt: currentTime, reviewDueAt: null } });
        await tx.userTask.update({ where: { id: claim.taskId }, data: { status: "COOLING" } });
        await tx.taskEvent.create({ data: { taskId: claim.taskId, actorSource: "SYSTEM", eventType: "SUBMISSION_AUTO_APPROVED", beforeStatus: "SUBMITTED", afterStatus: "COOLING", metadata: { awardId: award.id, availableAt } } });
        return;
      }

      if (claim.task.status === "REJECTED_PENDING_APPEAL" && claim.appealDeadline && claim.appealDeadline <= currentTime) {
        await tx.taskClaim.update({ where: { id }, data: { outcome: "REJECTED", resolvedAt: currentTime } });
        await reopenOrRefund("REJECTION_UNAPPEALED", "REJECTED_PENDING_APPEAL");
      }
    }, serializable);
  }
};
