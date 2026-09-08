import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "wasp/auth/password";

const demoPassword = "Password123";

const demoUsers = [
  { email: "admin@example.com", username: "管理员", isAdmin: true },
  { email: "publisher@example.com", username: "发布者", isAdmin: false },
  { email: "worker@example.com", username: "接单者", isAdmin: false },
] as const;

export async function seedMockUsers(prisma: PrismaClient) {
  const hashedPassword = await hashPassword(demoPassword);

  for (const demoUser of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: { username: demoUser.username, isAdmin: demoUser.isAdmin },
      create: demoUser,
      include: { auth: true },
    });
    const auth = user.auth ?? await prisma.auth.create({ data: { userId: user.id } });
    await prisma.authIdentity.upsert({
      where: {
        providerName_providerUserId: {
          providerName: "email",
          providerUserId: demoUser.email,
        },
      },
      update: {
        authId: auth.id,
        providerData: JSON.stringify({
          hashedPassword,
          isEmailVerified: true,
          emailVerificationSentAt: null,
          passwordResetSentAt: null,
        }),
      },
      create: {
        providerName: "email",
        providerUserId: demoUser.email,
        authId: auth.id,
        providerData: JSON.stringify({
          hashedPassword,
          isEmailVerified: true,
          emailVerificationSentAt: null,
          passwordResetSentAt: null,
        }),
      },
    });
  }

  const publisher = await prisma.user.findUniqueOrThrow({ where: { email: "publisher@example.com" } });
  await prisma.walletAccount.upsert({
    where: { userId: publisher.id },
    update: {},
    create: { userId: publisher.id, rechargeAvailableCents: 100_000 },
  });
  await prisma.walletEntry.upsert({
    where: { idempotencyKey: "seed:publisher:recharge" },
    update: {},
    create: {
      userId: publisher.id,
      type: "SEED_RECHARGE",
      rechargeDeltaCents: 100_000,
      referenceType: "SEED",
      referenceId: "publisher-demo-balance",
      idempotencyKey: "seed:publisher:recharge",
      balanceSnapshot: {
        rechargeAvailableCents: 100_000,
        earningsAvailableCents: 0,
        withdrawalFrozenCents: 0,
      },
    },
  });
}
