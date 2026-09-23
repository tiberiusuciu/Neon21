-- AlterTable
CREATE INDEX "HandOutcome_userId_isBlackjack_createdAt_idx" ON "HandOutcome"("userId", "isBlackjack", "createdAt");

-- CreateTable
CREATE TABLE "SpinVoucher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "SpinVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JackpotClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "tileIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "pctBps" INTEGER NOT NULL DEFAULT 0,
    "payoutCents" INTEGER NOT NULL,
    "potBeforeCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JackpotClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpinVoucher_userId_status_idx" ON "SpinVoucher"("userId", "status");

-- CreateIndex
CREATE INDEX "SpinVoucher_userId_createdAt_idx" ON "SpinVoucher"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JackpotClaim_voucherId_key" ON "JackpotClaim"("voucherId");

-- CreateIndex
CREATE INDEX "JackpotClaim_createdAt_idx" ON "JackpotClaim"("createdAt");

-- AddForeignKey
ALTER TABLE "SpinVoucher" ADD CONSTRAINT "SpinVoucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JackpotClaim" ADD CONSTRAINT "JackpotClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JackpotClaim" ADD CONSTRAINT "JackpotClaim_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "SpinVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
