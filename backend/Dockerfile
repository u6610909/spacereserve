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
COPY prisma ./prisma
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl openssl

COPY package.json package-lock.json ./
# `prisma` (the CLI) is a regular dependency, not dev — the runtime image
# needs it so `deploy.sh` can run `prisma migrate deploy` in a one-off
# container against the Azure database.
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
COPY --from=build /app/dist ./dist
# Generate the client against the runtime's own node_modules (the build
# stage's is a different install). Needs `prisma/` present, above.
RUN npx prisma generate

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
