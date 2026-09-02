# Multi-stage: build with dev deps, ship a lean runtime image.
# Images are ALWAYS built in CI and pulled on the VPS — the VM is memory-starved
# and must never run `docker build` (CLAUDE.md hard rule 9).

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
COPY src ./src
# Docker has no conditional COPY, and `prisma/` does not exist until Phase 2.
# Listing package.json guarantees at least one match so the wildcard is legal
# now and picks up prisma/ once it lands; the stray copy is build-stage only.
COPY package.json prisma* ./prisma-src/
RUN if [ -f ./prisma-src/schema.prisma ]; then \
        npx prisma generate --schema ./prisma-src/schema.prisma; \
    else \
        echo 'no prisma/schema.prisma yet (Phase 2) — skipping prisma generate'; \
    fi
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# The runtime install is fresh, so it does not contain the client generated in
# the build stage. `.prisma` exists either way (@prisma/client ships a stub), so
# this COPY is safe before Phase 2 and carries the real client after it.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

# Room images are written here at runtime (multer, see lib/roomImages.ts) —
# a volume is mounted over this in both compose files so uploads survive a
# redeploy; the mkdir/chown here is just so the directory exists and is
# writable by the non-root user before that volume is mounted the first time.
RUN mkdir -p uploads/rooms && chown -R node:node uploads

# Non-root: the `node` user ships with the base image.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://127.0.0.1:4000/spacereserve/api/v1/health || exit 1

CMD ["node", "dist/index.js"]
