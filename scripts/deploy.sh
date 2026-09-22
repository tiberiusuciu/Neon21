#!/usr/bin/env bash
# Production deploy on the VPS. Migrations run via the server container entrypoint
# (`prisma migrate deploy`) whenever the API image is (re)started.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "error: missing .env in $ROOT" >&2
  exit 1
fi

if [[ ! -f apps/web/.env ]]; then
  echo "error: missing apps/web/.env (set VITE_API_URL for production)" >&2
  exit 1
fi

echo "==> Enabling pnpm"
corepack enable
corepack prepare pnpm@9.15.0 --activate

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building shared package"
pnpm --filter @neon21/shared build

echo "==> Rebuilding API stack (migrate deploy on container start)"
docker compose up --build -d

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
  echo "error: API did not become healthy on 127.0.0.1:4000" >&2
  docker compose logs --tail=80 server >&2 || true
  exit 1
fi

echo "==> Building web"
pnpm --filter @neon21/web build

echo "==> Deploy OK — $(curl -sf http://127.0.0.1:4000/health)"
