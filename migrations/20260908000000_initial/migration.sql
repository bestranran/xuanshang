-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'OPEN', 'IN_PROGRESS', 'JUDGING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'SELECTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "RechargeOrderStatus" AS ENUM ('CREATED', 'PAID', 'CLOSED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('HELD', 'RELEASED', 'AWARDED');

-- CreateEnum
CREATE TYPE "AwardStatus" AS ENUM ('COOLING', 'BLOCKED', 'CREDITED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'TOKEN_ISSUED', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActorSource" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "username" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedReason" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTask" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetCents" INTEGER NOT NULL,
    "applicationDeadline" TIMESTAMP(3) NOT NULL,
    "deliveryDeadline" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "selectedApplicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "submissionId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rechargeAvailableCents" INTEGER NOT NULL DEFAULT 0,
    "earningsAvailableCents" INTEGER NOT NULL DEFAULT 0,
    "withdrawalFrozenCents" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rechargeDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "earningsDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "frozenDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "balanceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RechargeOrder" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "payableCents" INTEGER NOT NULL,
    "feeRateBpsSnapshot" INTEGER NOT NULL,
    "fixedFeeCentsSnapshot" INTEGER NOT NULL,
    "epayTradeNo" TEXT,
    "status" "RechargeOrderStatus" NOT NULL DEFAULT 'CREATED',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RechargeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentNotification" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "epayTradeNo" TEXT,
    "payloadJson" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "validationResult" TEXT NOT NULL,
    "processingResult" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rechargeOrderId" TEXT,

    CONSTRAINT "PaymentNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEscrow" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "rechargeCents" INTEGER NOT NULL,
    "earningsCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'HELD',
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "TaskEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "AwardStatus" NOT NULL DEFAULT 'COOLING',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "blockedReason" TEXT,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "payoutCents" INTEGER NOT NULL,
    "feeRateBpsSnapshot" INTEGER NOT NULL,
    "fixedFeeCentsSnapshot" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "tokenCiphertext" TEXT,
    "tokenIssuedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "adminId" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeConfig" (
    "id" TEXT NOT NULL,
    "rechargeRateBps" INTEGER NOT NULL DEFAULT 0,
    "rechargeFixedCents" INTEGER NOT NULL DEFAULT 0,
    "withdrawalRateBps" INTEGER NOT NULL DEFAULT 0,
    "withdrawalFixedCents" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRecord" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "recipientUserId" TEXT NOT NULL,
    "originalReference" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "externalReference" TEXT,
    "reason" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefundRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorSource" "ActorSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "beforeStatus" "TaskStatus",
    "afterStatus" "TaskStatus",
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserTask_selectedApplicationId_key" ON "UserTask"("selectedApplicationId");

-- CreateIndex
CREATE INDEX "UserTask_status_createdAt_idx" ON "UserTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserTask_publisherId_createdAt_idx" ON "UserTask"("publisherId", "createdAt");

-- CreateIndex
CREATE INDEX "Application_applicantId_createdAt_idx" ON "Application"("applicantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Application_taskId_applicantId_key" ON "Application"("taskId", "applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_taskId_key" ON "Submission"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_applicationId_key" ON "Submission"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_key" ON "WalletAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_idempotencyKey_key" ON "WalletEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletEntry_userId_createdAt_idx" ON "WalletEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RechargeOrder_orderNo_key" ON "RechargeOrder"("orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "RechargeOrder_epayTradeNo_key" ON "RechargeOrder"("epayTradeNo");

-- CreateIndex
CREATE INDEX "RechargeOrder_userId_createdAt_idx" ON "RechargeOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentNotification_orderNo_receivedAt_idx" ON "PaymentNotification"("orderNo", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskEscrow_taskId_key" ON "TaskEscrow"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Award_taskId_key" ON "Award"("taskId");

-- CreateIndex
CREATE INDEX "Award_status_availableAt_idx" ON "Award"("status", "availableAt");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_createdAt_idx" ON "WithdrawalRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeeConfig_version_key" ON "FeeConfig"("version");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_selectedApplicationId_fkey" FOREIGN KEY ("selectedApplicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotification" ADD CONSTRAINT "PaymentNotification_rechargeOrderId_fkey" FOREIGN KEY ("rechargeOrderId") REFERENCES "RechargeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEscrow" ADD CONSTRAINT "TaskEscrow_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEscrow" ADD CONSTRAINT "TaskEscrow_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeConfig" ADD CONSTRAINT "FeeConfig_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Financial and deadline invariants enforced below the application layer.
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_budget_positive" CHECK ("budgetCents" > 0);
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_deadlines_ordered" CHECK ("deliveryDeadline" > "applicationDeadline");
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_non_negative" CHECK (
  "rechargeAvailableCents" >= 0 AND "earningsAvailableCents" >= 0 AND "withdrawalFrozenCents" >= 0
);
ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_amounts_valid" CHECK (
  "creditCents" > 0 AND "feeCents" >= 0 AND "payableCents" = "creditCents" + "feeCents"
);
ALTER TABLE "TaskEscrow" ADD CONSTRAINT "TaskEscrow_amounts_valid" CHECK (
  "rechargeCents" >= 0 AND "earningsCents" >= 0 AND "totalCents" > 0
  AND "totalCents" = "rechargeCents" + "earningsCents"
);
ALTER TABLE "Award" ADD CONSTRAINT "Award_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_amounts_valid" CHECK (
  "amountCents" > 0 AND "feeCents" >= 0 AND "payoutCents" > 0
  AND "payoutCents" = "amountCents" - "feeCents"
);
ALTER TABLE "FeeConfig" ADD CONSTRAINT "FeeConfig_values_valid" CHECK (
  "rechargeRateBps" BETWEEN 0 AND 10000
  AND "withdrawalRateBps" BETWEEN 0 AND 10000
  AND "rechargeFixedCents" >= 0 AND "withdrawalFixedCents" >= 0 AND "version" > 0
);
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_amount_positive" CHECK ("amountCents" > 0);
