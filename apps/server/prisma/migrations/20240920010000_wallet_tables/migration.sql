-- AlterTable
ALTER TABLE "User" ADD COLUMN "balanceCents" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "User" ADD COLUMN "lastClaimAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seatCapacity" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Table_name_key" ON "Table"("name");
