#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building shared package"
pnpm --filter @neon21/shared build

echo "==> Starting Docker (Postgres + API)"
docker compose up --build -d

echo "==> Waiting for API health"
ready=0
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:4000/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "error: API did not become healthy on :4000" >&2
  echo "Check: docker compose logs -f server" >&2
  exit 1
fi

echo ""
echo "  API  http://localhost:4000"
echo "  Web  http://localhost:5173"
echo "  Stop with Ctrl+C (web) then: pnpm stop"
echo ""

exec pnpm --filter @neon21/web dev
