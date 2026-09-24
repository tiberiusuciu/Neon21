-- AlterTable
ALTER TABLE "GoldenHourState" ADD COLUMN "cooldownMinHours" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "GoldenHourState" ADD COLUMN "cooldownMaxHours" INTEGER NOT NULL DEFAULT 12;
