-- AlterTable
ALTER TABLE "GoldenHourState" ADD COLUMN "windowStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "GoldenHourPlayerStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "wonCents" INTEGER NOT NULL DEFAULT 0,
    "lostCents" INTEGER NOT NULL DEFAULT 0,
    "rebatePaidCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldenHourPlayerStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoldenHourPlayerStats_windowStartedAt_idx" ON "GoldenHourPlayerStats"("windowStartedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoldenHourPlayerStats_userId_windowStartedAt_key" ON "GoldenHourPlayerStats"("userId", "windowStartedAt");
