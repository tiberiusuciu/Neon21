-- CreateTable
CREATE TABLE "JackpotAdjustment" (
    "id" TEXT NOT NULL,
    "deltaCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JackpotAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JackpotAdjustment_createdAt_idx" ON "JackpotAdjustment"("createdAt");
