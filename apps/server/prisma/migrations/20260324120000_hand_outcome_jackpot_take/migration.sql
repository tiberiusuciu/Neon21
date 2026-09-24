-- AlterTable
ALTER TABLE "HandOutcome" ADD COLUMN "jackpotTakeCents" INTEGER NOT NULL DEFAULT 0;

-- Backfill legacy loss rows at the historical 5% rate
UPDATE "HandOutcome"
SET "jackpotTakeCents" = (
  (ABS("resultCents")::bigint * 500) / 10000
)::integer
WHERE "resultCents" < 0 AND "jackpotTakeCents" = 0;

-- CreateIndex
CREATE INDEX "HandOutcome_createdAt_jackpotTakeCents_idx" ON "HandOutcome"("createdAt", "jackpotTakeCents");
