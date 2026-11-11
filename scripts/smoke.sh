#!/usr/bin/env bash
# Build the container image, boot it with a throwaway config and a throwaway
# Postgres, and confirm the health endpoint comes up. Does not require a real
# cinc server. A real (if disposable) Postgres is needed, not a stub
# connection string: instrumentation.ts's startup bootstrap queries
# dashboard_accounts/registered_servers before the server starts serving
# requests, so the schema has to actually exist.
set -euo pipefail

cd "$(dirname "$0")/.."

key="$(mktemp)"
openssl genrsa -out "$key" 2048 2>/dev/null

net="cinc-dashboard-smoke-net-$$"
app="cinc-dashboard-smoke-app-$$"
pg="cinc-dashboard-smoke-pg-$$"
docker network create "$net" >/dev/null

cleanup() {
  docker rm -f "$app" "$pg" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -f "$key"
}
trap cleanup EXIT

echo "==> building image"
docker build -t cinc-dashboard:smoke .

echo "==> starting throwaway postgres"
docker run -d --rm --name "$pg" --network "$net" \
  -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke \
  postgres:17-alpine >/dev/null

echo "==> waiting for postgres"
for _ in $(seq 1 30); do
  if docker exec "$pg" pg_isready -U smoke -d smoke >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

db_url="postgres://smoke:smoke@$pg:5432/smoke"

echo "==> applying migrations"
docker run --rm --network "$net" -e CINC_DASHBOARD_DATABASE_URL="$db_url" \
  cinc-dashboard:smoke node scripts/migrate.mjs

echo "==> starting container"
docker run -d --name "$app" --network "$net" -p 3000:3000 \
  -e CINC_SERVER_URL=https://example.invalid \
  -e CINC_WEBUI_KEY="$(cat "$key")" \
  -e SESSION_SECRET=0123456789abcdef0123456789abcdef \
  -e CINC_DASHBOARD_DATABASE_URL="$db_url" \
  -e CINC_DASHBOARD_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef \
  cinc-dashboard:smoke >/dev/null

echo "==> waiting for /api/healthz"
for _ in $(seq 1 30); do
  if curl -fs http://127.0.0.1:3000/api/healthz >/dev/null; then
    echo "healthz OK"
    exit 0
  fi
  sleep 1
done

echo "healthz did not come up" >&2
docker logs "$app" >&2
exit 1
