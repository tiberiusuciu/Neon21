-- AlterTable
ALTER TABLE "User" ADD COLUMN "nameChosen" BOOLEAN NOT NULL DEFAULT false;

-- Email/password users already picked a display name at register
UPDATE "User" SET "nameChosen" = true WHERE "passwordHash" IS NOT NULL;
