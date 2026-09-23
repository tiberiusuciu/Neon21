-- CreateTable (matches final schema: kind column, no FK to Table)
CREATE TABLE "TableChatMessage" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableChatMessage_tableId_createdAt_idx" ON "TableChatMessage"("tableId", "createdAt");
