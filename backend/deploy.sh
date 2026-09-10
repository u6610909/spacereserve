#!/usr/bin/env bash
# Deploy / roll back SpaceReserve on the Azure VM.
#
# NEVER builds an image here — the VM is memory-starved (already OOM-killed
# once; needed a swapfile just to run `npm install`) and runs nginx + MySQL +
# WordPress + the pm2 lab API alongside this. CI builds and pushes to GHCR
# (CLAUDE.md hard rule 9); this script only pulls, migrates, and restarts.
#
# First-time setup: see DEPLOY.md. In short — run scripts/vm-prereqs.sh once,
# then `cp .env.prod.example .env` and fill in the four Azure values.
#
# Usage:
#   ./deploy.sh                                              # deploy :latest
#   IMAGE=ghcr.io/u6610909/spacereserve:<sha> ./deploy.sh    # deploy/roll back to a specific tag
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
HEALTH_URL="http://127.0.0.1:4000/spacereserve/api/v1/health"
HEALTH_RETRIES=15
HEALTH_INTERVAL=3
REQUIRED_ENV_VARS=(AZURE_TENANT_ID AZURE_CLIENT_ID AZURE_CLIENT_SECRET AZURE_KEY_VAULT_URL)

log()  { printf '[deploy] %s\n' "$1"; }
fail() { printf '[deploy] ERROR: %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preflight — fail early with a clear message instead of a confusing
# half-deploy.
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not installed — run scripts/vm-prereqs.sh first"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 plugin missing — run scripts/vm-prereqs.sh first"
[ -f "$COMPOSE_FILE" ] || fail "$COMPOSE_FILE not found (run this from backend/)"
[ -f "$ENV_FILE" ] || fail "$ENV_FILE not found — cp .env.prod.example .env and fill it in (see DEPLOY.md)"

missing=()
for var in "${REQUIRED_ENV_VARS[@]}"; do
  # present and non-empty in .env
  grep -qE "^${var}=.+" "$ENV_FILE" || missing+=("$var")
done
[ ${#missing[@]} -eq 0 ] || fail ".env is missing values for: ${missing[*]}"

log "preflight OK"

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------
previous_image=$(docker compose -f "$COMPOSE_FILE" images -q api 2>/dev/null || true)

log "pulling ${IMAGE:-ghcr.io/u6610909/spacereserve:latest}"
docker compose -f "$COMPOSE_FILE" pull api

# One-off container, not a host toolchain (DECISIONS.md #6). Never
# `prisma migrate dev` here — it can reset the database; migrations are
# generated locally and committed (CLAUDE.md hard rule 3). The image ships
# the prisma CLI + prisma/ dir specifically so this works offline-of-npm.
#
# `migrateDeploy.js` fetches SpaceReserve-DatabaseUrl from Key Vault first —
# the DB URL is never in an env var or a file on the VM (CLAUDE.md hard
# rule 1). The one-off container inherits the AZURE_* creds from the compose
# `environment:` block, which is all DefaultAzureCredential needs.
log "applying database migrations"
docker compose -f "$COMPOSE_FILE" run --rm api node dist/config/migrateDeploy.js

log "starting api"
docker compose -f "$COMPOSE_FILE" up -d api

log "waiting for health (up to $((HEALTH_RETRIES * HEALTH_INTERVAL))s)"
healthy=false
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep "$HEALTH_INTERVAL"
done

if [ "$healthy" = true ]; then
  log "healthy — deploy complete"
  curl -s "$HEALTH_URL"; echo
  log "reminder: also curl /content and /api to confirm nothing else broke (CLAUDE.md hard rule 4)"
  exit 0
fi

log "health check FAILED — dumping last 40 log lines:"
docker compose -f "$COMPOSE_FILE" logs --tail 40 api || true

if [ -n "$previous_image" ] && [ "$previous_image" != "$(docker compose -f "$COMPOSE_FILE" images -q api)" ]; then
  log "rolling back to previous image: $previous_image"
  IMAGE="$previous_image" docker compose -f "$COMPOSE_FILE" up -d api
  log "rolled back — investigate the failed image before retrying"
else
  log "no distinct previous image to roll back to — investigate manually"
fi
exit 1
