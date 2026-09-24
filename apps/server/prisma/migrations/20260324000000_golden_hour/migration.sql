-- CreateTable
CREATE TABLE "GoldenHourState" (
    "id" TEXT NOT NULL DEFAULT 'golden_hour',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "activeUntil" TIMESTAMP(3),
    "nextStartsAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldenHourState_pkey" PRIMARY KEY ("id")
);
