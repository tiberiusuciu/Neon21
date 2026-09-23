#!/bin/sh
set -e
cd /app/apps/server
npx prisma migrate deploy
node dist/index.js
