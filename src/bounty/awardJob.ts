import type { CreditAvailableAwards } from "wasp/server/jobs";
import { prisma } from "wasp/server";
import { sendUserEmail } from "../server/userEmailNotifications";
import { applyWalletMutation } from "../server/walletService";
import { assertTaskTransition } from "./taskState";

export const creditAvailableAwards: CreditAvailableAwards<never, void> = async () => {
  const due = await prisma.award.findMany({
    where: { status: "COOLING", availableAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });

  for (const { id } of due) {
    const credited = await prisma.$transaction(async (tx) => {
      const award = await tx.award.findUnique({ where: { id }, include: { task: { include: { escrow: true } } } });
      if (!award || award.status !== "COOLING" || award.availableAt > new Date()) return null;
      if (!award.task.escrow || award.task.escrow.status !== "HELD" || award.task.status !== "COOLING") return null;
      assertTaskTransition(award.task.status, "COMPLETED");
      const claimed = await tx.award.updateMany({ where: { id, status: "COOLING" }, data: { status: "CREDITED", creditedAt: new Date() } });
      if (claimed.count !== 1) return null;
      await applyWalletMutation(tx, { userId: award.recipientId, delta: { earningsCents: award.amountCents }, type: "AWARD_CREDITED", referenceType: "AWARD", referenceId: award.id, idempotencyKey: `award:${award.id}:credit` });
      await tx.taskEscrow.update({ where: { taskId: award.taskId }, data: { status: "AWARDED", releasedAt: new Date() } });
      await tx.userTask.update({ where: { id: award.taskId }, data: { status: "COMPLETED" } });
      await tx.taskEvent.create({ data: { taskId: award.taskId, actorSource: "SYSTEM", eventType: "AWARD_CREDITED", beforeStatus: award.task.status, afterStatus: "COMPLETED", metadata: { awardId: award.id } } });
      return { recipientId: award.recipientId, amountCents: award.amountCents, title: award.task.title };
    }, { isolationLevel: "Serializable" });
    if (credited) void sendUserEmail(prisma, credited.recipientId, "walletEmails", "悬赏奖励已到账", `“${credited.title}”的奖励 ¥${(credited.amountCents / 100).toFixed(2)} 已进入你的收益余额。`);
  }

  const contestDue = await prisma.contestAward.findMany({
    where: { status: "COOLING", availableAt: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });

  for (const { id } of contestDue) {
    const credited = await prisma.$transaction(async (tx) => {
      const award = await tx.contestAward.findUnique({ where: { id }, include: { contest: { include: { escrow: true } } } });
      if (!award || award.status !== "COOLING" || award.availableAt > new Date()) return null;
      if (!award.contest.escrow || award.contest.escrow.status !== "HELD" || award.contest.status !== "COOLING") return null;
      const claimed = await tx.contestAward.updateMany({ where: { id, status: "COOLING" }, data: { status: "CREDITED", creditedAt: new Date() } });
      if (claimed.count !== 1) return null;
      await applyWalletMutation(tx, { userId: award.recipientId, delta: { earningsCents: award.amountCents }, type: "CONTEST_AWARD_CREDITED", referenceType: "CONTEST_AWARD", referenceId: award.id, idempotencyKey: `contest-award:${award.id}:credit` });
      const remaining = await tx.contestAward.count({ where: { contestId: award.contestId, status: { not: "CREDITED" } } });
      if (remaining === 0) {
        await tx.contestEscrow.update({ where: { contestId: award.contestId }, data: { status: "AWARDED", releasedAt: new Date() } });
        await tx.contest.update({ where: { id: award.contestId }, data: { status: "COMPLETED" } });
      }
      return { recipientId: award.recipientId, amountCents: award.amountCents, title: award.contest.title };
    }, { isolationLevel: "Serializable" });
    if (credited) void sendUserEmail(prisma, credited.recipientId, "walletEmails", "比赛奖金已到账", `“${credited.title}”的奖金 ¥${(credited.amountCents / 100).toFixed(2)} 已进入你的收益余额。`);
  }
};
