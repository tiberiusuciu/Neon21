-- AlterTable
ALTER TABLE "TableChatMessage" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'chat';
