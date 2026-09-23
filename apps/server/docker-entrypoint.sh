#!/bin/sh
set -e
cd /app/apps/server

# One-shot: clear failed/obsolete chat migrations from a bad deploy ordering.
# Harmless if those rows are already gone.
npx prisma migrate resolve --rolled-back 20240923010000_chat_message_kind 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20260923000000_table_chat 2>/dev/null || true
npx prisma migrate resolve --rolled-back 20260923010000_chat_drop_table_fk 2>/dev/null || true

npx prisma migrate deploy
node dist/index.js
