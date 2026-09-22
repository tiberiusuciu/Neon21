-- AlterTable
ALTER TABLE "User" ADD COLUMN "handsPlayed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "wins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "losses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "pushes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "blackjacks" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "biggestWinCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "biggestLossCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "netProfitCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "HandOutcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resultCents" INTEGER NOT NULL,
    "betCents" INTEGER NOT NULL,
    "isBlackjack" BOOLEAN NOT NULL DEFAULT false,
    "doubled" BOOLEAN NOT NULL DEFAULT false,
    "bust" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandOutcome_userId_createdAt_idx" ON "HandOutcome"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "HandOutcome" ADD CONSTRAINT "HandOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
