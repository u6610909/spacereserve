#!/usr/bin/env bash
# Deploys the current tag of ghcr.io/u6610909/spacereserve to this VM.
#
# NEVER builds an image here — the VM is memory-starved (already OOM-killed
# once; needed a swapfile just to run `npm install`) and runs nginx + MySQL +
# WordPress + the pm2 lab API alongside this. CI builds and pushes to GHCR
# (CLAUDE.md hard rule 9); this script only pulls and restarts.
#
# Usage:
#   ./deploy.sh                    # deploy :latest
#   IMAGE=ghcr.io/u6610909/spacereserve:<sha> ./deploy.sh   # deploy/roll back to a specific tag
set -euo pipefail

# Location-independent — works whether invoked as ./deploy.sh from inside
# backend/ or as backend/deploy.sh from the repo root/wherever it's checked
# out on the VM.
cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://127.0.0.1:4000/spacereserve/api/v1/health"
HEALTH_RETRIES=10
HEALTH_INTERVAL=3

log() { printf '[deploy] %s\n' "$1"; }

previous_image=$(docker compose -f "$COMPOSE_FILE" images -q api 2>/dev/null || true)

log "pulling ${IMAGE:-ghcr.io/u6610909/spacereserve:latest}"
docker compose -f "$COMPOSE_FILE" pull api

# One-off container, not a host toolchain (DECISIONS.md #6). Never
# `prisma migrate dev` here — it can reset the database; migrations are
# generated locally and committed (CLAUDE.md hard rule 3).
log "applying database migrations"
docker compose -f "$COMPOSE_FILE" run --rm api npx prisma migrate deploy

log "starting api"
docker compose -f "$COMPOSE_FILE" up -d api

log "waiting for health"
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
  curl -s "$HEALTH_URL"
  echo
  exit 0
fi

log "health check failed"
if [ -n "$previous_image" ]; then
  log "rolling back to previous image: $previous_image"
  IMAGE="$previous_image" docker compose -f "$COMPOSE_FILE" up -d api
else
  log "no previous image recorded — cannot auto-rollback, investigate manually"
fi
exit 1
