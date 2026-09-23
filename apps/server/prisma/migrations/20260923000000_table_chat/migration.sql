-- CreateTable
CREATE TABLE "TableChatMessage" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TableChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TableChatMessage_tableId_createdAt_idx" ON "TableChatMessage"("tableId", "createdAt");

-- AddForeignKey
ALTER TABLE "TableChatMessage" ADD CONSTRAINT "TableChatMessage_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE CASCADE ON UPDATE CASCADE;
