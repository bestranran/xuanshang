-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PENDING_REVIEW', 'OPEN', 'CLAIMED', 'SUBMITTED', 'REVISION_REQUESTED', 'REJECTED_PENDING_APPEAL', 'APPEALED', 'COOLING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskClaimOutcome" AS ENUM ('REJECTED', 'APPROVED', 'EXPIRED', 'RELEASED');

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

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'OPEN', 'JUDGING', 'COOLING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PrizeRank" AS ENUM ('FIRST', 'SECOND', 'THIRD');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'READY', 'ATTACHED', 'ABORTED', 'DELETED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('VIDEO', 'ATTACHMENT');

-- CreateEnum
CREATE TYPE "FileTargetType" AS ENUM ('TASK', 'CONTEST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "publicNo" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT,
    "username" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedReason" TEXT,
    "bio" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portfolioLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avatarUrl" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskEmails" BOOLEAN NOT NULL DEFAULT true,
    "contestEmails" BOOLEAN NOT NULL DEFAULT true,
    "walletEmails" BOOLEAN NOT NULL DEFAULT true,
    "announcementEmails" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publisherId" TEXT NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "publicNo" SERIAL NOT NULL,
    "publisherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalPrizeCents" INTEGER NOT NULL,
    "submissionDeadline" TIMESTAMP(3) NOT NULL,
    "status" "ContestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestPrize" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "rank" "PrizeRank" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "winnerEntryId" TEXT,

    CONSTRAINT "ContestPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestEntry" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "entrantId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shortlisted" BOOLEAN NOT NULL DEFAULT false,
    "privateFeedback" TEXT,

    CONSTRAINT "ContestEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestEntryVersion" (
    "id" TEXT NOT NULL,
    "contestEntryId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestEntryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestEscrow" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "rechargeCents" INTEGER NOT NULL,
    "earningsCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'HELD',
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "ContestEscrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestAward" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "AwardStatus" NOT NULL DEFAULT 'COOLING',
    "availableAt" TIMESTAMP(3) NOT NULL,
    "blockedReason" TEXT,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "ContestAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTask" (
    "id" TEXT NOT NULL,
    "publicNo" SERIAL NOT NULL,
    "publisherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "privateInstructions" TEXT,
    "proofRequirements" TEXT NOT NULL DEFAULT 'See task brief',
    "workDurationHours" INTEGER NOT NULL DEFAULT 48,
    "budgetCents" INTEGER NOT NULL,
    "claimDeadline" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedClaimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskClaim" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "outcome" "TaskClaimOutcome",
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reviewDueAt" TIMESTAMP(3),
    "appealDeadline" TIMESTAMP(3),
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "revisionReason" TEXT,
    "rejectionReason" TEXT,
    "appealReason" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TaskClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionVersion" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskQuestion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "askerId" TEXT NOT NULL,
    "answererId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "TaskQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestQuestion" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "askerId" TEXT NOT NULL,
    "answererId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "ContestQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkReview" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "submissionVersionId" TEXT,
    "contestEntryVersionId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "kind" "FileKind" NOT NULL DEFAULT 'ATTACHMENT',
    "status" "FileStatus" NOT NULL DEFAULT 'ATTACHED',
    "targetType" "FileTargetType",
    "targetId" TEXT,
    "s3Key" TEXT NOT NULL,
    "multipartUploadId" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "attachedAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3),
    "deleteAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastDeleteError" TEXT,

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
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardBatch" (
    "id" TEXT NOT NULL,
    "publicNo" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "fundingSourceNote" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "publicNo" SERIAL NOT NULL,
    "batchId" TEXT NOT NULL,
    "secretHmac" TEXT NOT NULL,
    "lastFour" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "redeemedById" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RechargeOrder" (
    "id" TEXT NOT NULL,
    "publicNo" SERIAL NOT NULL,
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
    "publicNo" SERIAL NOT NULL,
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
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
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

-- CreateTable
CREATE TABLE "Auth" (
    "id" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "Auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "providerName" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "providerData" TEXT NOT NULL DEFAULT '{}',
    "authId" TEXT NOT NULL,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("providerName","providerUserId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_publicNo_key" ON "User"("publicNo");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "Announcement_status_isPinned_publishedAt_idx" ON "Announcement"("status", "isPinned", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contest_publicNo_key" ON "Contest"("publicNo");

-- CreateIndex
CREATE INDEX "Contest_status_createdAt_idx" ON "Contest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Contest_publisherId_createdAt_idx" ON "Contest"("publisherId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestPrize_winnerEntryId_key" ON "ContestPrize"("winnerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestPrize_contestId_rank_key" ON "ContestPrize"("contestId", "rank");

-- CreateIndex
CREATE INDEX "ContestEntry_entrantId_submittedAt_idx" ON "ContestEntry"("entrantId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntry_contestId_entrantId_key" ON "ContestEntry"("contestId", "entrantId");

-- CreateIndex
CREATE INDEX "ContestEntryVersion_contestEntryId_createdAt_idx" ON "ContestEntryVersion"("contestEntryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEntryVersion_contestEntryId_version_key" ON "ContestEntryVersion"("contestEntryId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ContestEscrow_contestId_key" ON "ContestEscrow"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestAward_prizeId_key" ON "ContestAward"("prizeId");

-- CreateIndex
CREATE INDEX "ContestAward_status_availableAt_idx" ON "ContestAward"("status", "availableAt");

-- CreateIndex
CREATE INDEX "ContestAward_contestId_idx" ON "ContestAward"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTask_publicNo_key" ON "UserTask"("publicNo");

-- CreateIndex
CREATE UNIQUE INDEX "UserTask_assignedClaimId_key" ON "UserTask"("assignedClaimId");

-- CreateIndex
CREATE INDEX "UserTask_status_createdAt_idx" ON "UserTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UserTask_publisherId_createdAt_idx" ON "UserTask"("publisherId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskClaim_taskId_claimedAt_idx" ON "TaskClaim"("taskId", "claimedAt");

-- CreateIndex
CREATE INDEX "TaskClaim_workerId_claimedAt_idx" ON "TaskClaim"("workerId", "claimedAt");

-- CreateIndex
CREATE INDEX "TaskClaim_outcome_dueAt_idx" ON "TaskClaim"("outcome", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_claimId_key" ON "Submission"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionVersion_submissionId_version_key" ON "SubmissionVersion"("submissionId", "version");

-- CreateIndex
CREATE INDEX "TaskQuestion_taskId_createdAt_idx" ON "TaskQuestion"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ContestQuestion_contestId_createdAt_idx" ON "ContestQuestion"("contestId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkReview_revieweeId_createdAt_idx" ON "WorkReview"("revieweeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkReview_claimId_reviewerId_key" ON "WorkReview"("claimId", "reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "File_s3Key_key" ON "File"("s3Key");

-- CreateIndex
CREATE INDEX "File_userId_status_createdAt_idx" ON "File"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "File_targetType_targetId_status_idx" ON "File"("targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "File_deleteAfter_status_idx" ON "File"("deleteAfter", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_userId_key" ON "WalletAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_idempotencyKey_key" ON "WalletEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WalletEntry_userId_createdAt_idx" ON "WalletEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardBatch_publicNo_key" ON "GiftCardBatch"("publicNo");

-- CreateIndex
CREATE INDEX "GiftCardBatch_createdAt_idx" ON "GiftCardBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_publicNo_key" ON "GiftCard"("publicNo");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_secretHmac_key" ON "GiftCard"("secretHmac");

-- CreateIndex
CREATE INDEX "GiftCard_batchId_redeemedAt_idx" ON "GiftCard"("batchId", "redeemedAt");

-- CreateIndex
CREATE INDEX "GiftCard_redeemedById_redeemedAt_idx" ON "GiftCard"("redeemedById", "redeemedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RechargeOrder_publicNo_key" ON "RechargeOrder"("publicNo");

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
CREATE UNIQUE INDEX "WithdrawalRequest_publicNo_key" ON "WithdrawalRequest"("publicNo");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_createdAt_idx" ON "WithdrawalRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeeConfig_version_key" ON "FeeConfig"("version");

-- CreateIndex
CREATE INDEX "SystemSetting_updatedAt_idx" ON "SystemSetting"("updatedAt");

-- CreateIndex
CREATE INDEX "TaskEvent_taskId_createdAt_idx" ON "TaskEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Auth_userId_key" ON "Auth"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_id_key" ON "Session"("id");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPrize" ADD CONSTRAINT "ContestPrize_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestPrize" ADD CONSTRAINT "ContestPrize_winnerEntryId_fkey" FOREIGN KEY ("winnerEntryId") REFERENCES "ContestEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_entrantId_fkey" FOREIGN KEY ("entrantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntryVersion" ADD CONSTRAINT "ContestEntryVersion_contestEntryId_fkey" FOREIGN KEY ("contestEntryId") REFERENCES "ContestEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEscrow" ADD CONSTRAINT "ContestEscrow_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEscrow" ADD CONSTRAINT "ContestEscrow_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "ContestPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_assignedClaimId_fkey" FOREIGN KEY ("assignedClaimId") REFERENCES "TaskClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskClaim" ADD CONSTRAINT "TaskClaim_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskClaim" ADD CONSTRAINT "TaskClaim_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "TaskClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionVersion" ADD CONSTRAINT "SubmissionVersion_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskQuestion" ADD CONSTRAINT "TaskQuestion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskQuestion" ADD CONSTRAINT "TaskQuestion_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskQuestion" ADD CONSTRAINT "TaskQuestion_answererId_fkey" FOREIGN KEY ("answererId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestQuestion" ADD CONSTRAINT "ContestQuestion_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestQuestion" ADD CONSTRAINT "ContestQuestion_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestQuestion" ADD CONSTRAINT "ContestQuestion_answererId_fkey" FOREIGN KEY ("answererId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReview" ADD CONSTRAINT "WorkReview_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "TaskClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReview" ADD CONSTRAINT "WorkReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReview" ADD CONSTRAINT "WorkReview_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_submissionVersionId_fkey" FOREIGN KEY ("submissionVersionId") REFERENCES "SubmissionVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_contestEntryVersionId_fkey" FOREIGN KEY ("contestEntryVersionId") REFERENCES "ContestEntryVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardBatch" ADD CONSTRAINT "GiftCardBatch_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "GiftCardBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "UserTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEvent" ADD CONSTRAINT "TaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auth" ADD CONSTRAINT "Auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_authId_fkey" FOREIGN KEY ("authId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Auth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Business invariants that Prisma cannot express in schema.prisma.
-- Keep these limited to facts that must remain true regardless of workflow changes.
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_nonnegative_balances_check" CHECK (
  "rechargeAvailableCents" >= 0
  AND "earningsAvailableCents" >= 0
  AND "withdrawalFrozenCents" >= 0
  AND "version" >= 0
);

ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_nonzero_delta_check" CHECK (
  "rechargeDeltaCents" <> 0
  OR "earningsDeltaCents" <> 0
  OR "frozenDeltaCents" <> 0
);

ALTER TABLE "TaskEscrow" ADD CONSTRAINT "TaskEscrow_valid_amounts_check" CHECK (
  "rechargeCents" >= 0
  AND "earningsCents" >= 0
  AND "totalCents" > 0
  AND "rechargeCents" + "earningsCents" = "totalCents"
);

ALTER TABLE "ContestEscrow" ADD CONSTRAINT "ContestEscrow_valid_amounts_check" CHECK (
  "rechargeCents" >= 0
  AND "earningsCents" >= 0
  AND "totalCents" > 0
  AND "rechargeCents" + "earningsCents" = "totalCents"
);

ALTER TABLE "UserTask" ADD CONSTRAINT "UserTask_valid_work_check" CHECK (
  "budgetCents" > 0 AND "workDurationHours" > 0
);

ALTER TABLE "TaskClaim" ADD CONSTRAINT "TaskClaim_valid_lifecycle_check" CHECK (
  "dueAt" > "claimedAt"
  AND "revisionCount" BETWEEN 0 AND 1
  AND (("outcome" IS NULL AND "resolvedAt" IS NULL) OR ("outcome" IS NOT NULL AND "resolvedAt" IS NOT NULL))
);

ALTER TABLE "SubmissionVersion" ADD CONSTRAINT "SubmissionVersion_version_positive" CHECK ("version" > 0);
ALTER TABLE "ContestEntryVersion" ADD CONSTRAINT "ContestEntryVersion_version_positive" CHECK ("version" > 0);
ALTER TABLE "File" ADD CONSTRAINT "File_nonnegative_counters_check" CHECK ("sizeBytes" >= 0 AND "deleteAttempts" >= 0);

ALTER TABLE "Award" ADD CONSTRAINT "Award_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "ContestPrize" ADD CONSTRAINT "ContestPrize_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_totalPrize_positive" CHECK ("totalPrizeCents" > 0);

ALTER TABLE "RechargeOrder" ADD CONSTRAINT "RechargeOrder_amounts_valid" CHECK (
  "creditCents" > 0
  AND "feeCents" >= 0
  AND "payableCents" = "creditCents" + "feeCents"
  AND "feeRateBpsSnapshot" BETWEEN 0 AND 10000
  AND "fixedFeeCentsSnapshot" >= 0
);

ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_amounts_valid" CHECK (
  "amountCents" > 0
  AND "feeCents" >= 0
  AND "payoutCents" > 0
  AND "payoutCents" = "amountCents" - "feeCents"
  AND "feeRateBpsSnapshot" BETWEEN 0 AND 10000
  AND "fixedFeeCentsSnapshot" >= 0
);

ALTER TABLE "FeeConfig" ADD CONSTRAINT "FeeConfig_values_valid" CHECK (
  "rechargeRateBps" BETWEEN 0 AND 10000
  AND "withdrawalRateBps" BETWEEN 0 AND 10000
  AND "rechargeFixedCents" >= 0
  AND "withdrawalFixedCents" >= 0
  AND "version" > 0
);

ALTER TABLE "RefundRecord" ADD CONSTRAINT "RefundRecord_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "GiftCardBatch" ADD CONSTRAINT "GiftCardBatch_amountCents_positive" CHECK ("amountCents" > 0);
ALTER TABLE "GiftCardBatch" ADD CONSTRAINT "GiftCardBatch_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_redemption_pair" CHECK (
  ("redeemedAt" IS NULL AND "redeemedById" IS NULL)
  OR ("redeemedAt" IS NOT NULL AND "redeemedById" IS NOT NULL)
);
