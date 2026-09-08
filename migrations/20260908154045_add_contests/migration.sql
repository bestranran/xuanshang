-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'OPEN', 'JUDGING', 'COOLING', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PrizeRank" AS ENUM ('FIRST', 'SECOND', 'THIRD');

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
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
    "content" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContestEntry_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "ContestEscrow_contestId_key" ON "ContestEscrow"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "ContestAward_prizeId_key" ON "ContestAward"("prizeId");

-- CreateIndex
CREATE INDEX "ContestAward_status_availableAt_idx" ON "ContestAward"("status", "availableAt");

-- CreateIndex
CREATE INDEX "ContestAward_contestId_idx" ON "ContestAward"("contestId");

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
ALTER TABLE "ContestEscrow" ADD CONSTRAINT "ContestEscrow_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEscrow" ADD CONSTRAINT "ContestEscrow_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "ContestPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestAward" ADD CONSTRAINT "ContestAward_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
