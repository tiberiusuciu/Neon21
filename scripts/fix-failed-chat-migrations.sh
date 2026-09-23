#!/usr/bin/env bash
# One-shot: clear failed/obsolete chat Prisma migrations left by bad deploy ordering.
# Safe to re-run. Does not wipe user data — only _prisma_migrations rows.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f docker-compose.yml ]]; then
  echo "error: run from the Neon21 app dir (missing docker-compose.yml)" >&2
  exit 1
fi

echo "==> Ensuring db is up"
docker compose up -d db

echo "==> Waiting for Postgres"
for _ in $(seq 1 60); do
  if docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Removing failed/obsolete chat migration rows"
docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "
DELETE FROM \"_prisma_migrations\"
WHERE finished_at IS NULL
  AND migration_name IN (
  '\''20240923010000_chat_message_kind'\'',
  '\''20240923000000_table_chat'\'',
  '\''20260923000000_table_chat'\'',
  '\''20260923010000_chat_drop_table_fk'\''
);
"'

# If TableChatMessage already exists (from an older chat migration), mark the
# current create migration applied instead of re-running CREATE TABLE.
EXISTS="$(docker compose exec -T db sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT to_regclass('\''public.\"TableChatMessage\"'\'')"' \
  | tr -d '[:space:]')"

if [[ "$EXISTS" == "TableChatMessage" ]] || [[ "$EXISTS" == *"TableChatMessage"* ]]; then
  echo "==> TableChatMessage present — ensuring 20240923000000_table_chat is marked applied"
  docker compose run --rm --entrypoint sh server -c \
    'cd /app/apps/server && npx prisma migrate resolve --applied 20240923000000_table_chat' \
    || true
fi

echo "==> Rebuilding API so migrate deploy can apply 20240923000000_table_chat"
docker compose up -d --build --force-recreate server

echo "==> Waiting for API health"
ready=0
for _ in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:4000/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "error: API did not become healthy" >&2
  docker compose logs --tail=80 server >&2 || true
  exit 1
fi

echo "==> Fix OK — $(curl -sf http://127.0.0.1:4000/health)"
