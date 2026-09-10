# SpaceReserve — architecture & project rules

Reference for the decisions the code comments point at. Data model and API
surface live in [`../README.md`](../README.md); this file is the "why".

## Project rules

1. **Key Vault only in production.** No `.env` file in prod. The only env vars
   allowed on the production host are `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
   `AZURE_CLIENT_SECRET` (the service principal that reads the vault) plus the
   non-secret `AZURE_KEY_VAULT_URL` and the non-secret OIDC config
   (`AD_TENANT_ID`, `AD_REDIRECT_URI`) / `GEMINI_BASE_URL` / `FRONTEND_URL`.
   The app refuses to boot in production if Key Vault is unreachable, and logs
   it loudly.
2. **`process.env` is read only inside `src/config/`.** Enforced by an ESLint
   rule and a CI grep (`scripts/check-env-guard.sh`).
3. **Never run `prisma migrate dev` on the server.** Migrations are generated
   locally, committed, and applied with `prisma migrate deploy` (via the
   one-off container in `deploy.sh`).
4. **Additive migrations only.** No destructive column drop in a single
   migration — stop writing to the column, deploy, drop it later
   (expand-then-contract).
5. **Secrets are never logged and never committed.** `.env` is gitignored;
   `.env.example` carries key names with empty values. Peer API keys are
   stored as SHA-256 hashes only.
6. **Only services touch Prisma.** Controllers stay thin, business rules live
   in services, Zod validates every body / query / param.
7. **External failures never break core flows.** Gemini fails → keyword
   fallback with `"degraded": true`, never a 500. SendGrid fails → logged, the
   booking still succeeds. FinderAI down → check-in still succeeds with
   `lostItemNotice: null`.
8. **Nginx only adds a `location /spacereserve/` block.** Nothing else on the
   host is touched. After any nginx change: `sudo nginx -t`, reload, curl the
   path.
9. **Images are built in CI and pulled on the VM — never `docker build` on the
   VM.** The VM is memory-constrained; `deploy.sh` only does `docker compose
   pull` + `up -d`. Swap is raised to 4 GB as a prerequisite.

## The database runs off the VM

The VM (Standard B1ms, ~2 GiB RAM) also runs nginx and is memory-tight. A
Postgres container alongside the Node container plus swap thrashing during a
live demo is worse than not containerising the DB at all.

**Decision: Azure Database for PostgreSQL Flexible Server (Burstable B1ms).**

- `docker-compose.prod.yml` runs a single service, `api` — no `postgres`
  service, no DB volume.
- `docker-compose.yml` (local dev) keeps its own Postgres container so dev
  stays self-contained; CI uses a Postgres service container.
- `SpaceReserve-DatabaseUrl` in Key Vault points at the Azure DB with
  `?sslmode=require`, so the Key Vault dependency is load-bearing, not
  ceremonial.
- The Azure DB firewall allows only the VM's public IP.
- DB auth is password-based: Prisma's connection pool can't refresh a rotating
  Entra token, so "use Microsoft Entra ID" applies to **user login only**, not
  the database connection.

## Auth

- User sign-in is OIDC against Microsoft Entra (`@au.edu`). The app then
  issues its own HS256 JWT (1 h), carried in an httpOnly + Secure +
  SameSite=Lax cookie. `?mode=json` on the callback returns `{ "token": … }`
  for API / Postman use — no token ever in a URL.
- `/auth/refresh` re-issues a still-valid token from current DB state; it is
  not refresh-token rotation.
- PKCE `code_verifier` and `state` ride in signed cookies (`cookie-parser`,
  signed with the JWT secret) between `/auth/login` and `/auth/callback`.
- `POST /auth/dev-login` is hard-disabled in production — it returns 404 there
  so its existence isn't revealed.

## Three-mode config

`src/config/` resolves secrets one of three ways:

- **production** — Key Vault is mandatory; boot fails if it's unreachable.
- **development** — falls back to `.env`.
- **test** — fixed fake secrets, no vault or network contact; a Postgres
  service container backs the Prisma tests.

Building this into the config module early keeps every other module
mode-agnostic.

## Deployment

- CI builds `ghcr.io/<owner>/spacereserve:latest` (+ `:<sha>`) on push to
  `main` and pushes to GHCR; the package is public so the VM needs no login.
- `deploy.sh` on the VM: `docker compose pull` → apply migrations in a one-off
  container (`node dist/config/migrateDeploy.js`, which pulls the DB URL from
  Key Vault first) → `up -d` → wait for `/health` → roll back to the previous
  image tag on failure.
- Port 4000 is published as `127.0.0.1:4000:4000` only and stays closed in
  both UFW and the Azure NSG; nginx on the host proxies to it.
- Reuse the existing Let's Encrypt cert — never `certbot --force-renewal`.

## Other decisions

- **Trailing slash:** `location = /spacereserve { return 301 /spacereserve/; }`
  next to the main block, so both forms resolve.
- **UFW order:** always `allow 22/tcp` *before* `enable`, never the reverse;
  keep the serial console open while changing firewall rules.
- **luxon** is used at exactly one boundary — parsing Gemini's relative dates
  against `Asia/Bangkok`. Containers stay UTC, Postgres stays `timestamptz`,
  no other layer does timezone math.
- **Health endpoint** is shallow by default (cached process/vault/DB status,
  short TTL — what the Docker healthcheck polls); a deeper variant actually
  round-trips the vault and DB.
- **Check-in window:** from 15 min before `startTime` until `endTime`; outside
  → 409. The "future only" rule governs creation, not check-in.
- **Capacity** is enforced on invite (and on create when attendees are passed
  inline); a solo booking of a large room is intentional.
- **API keys:** the `ApiKey` table is authoritative for verification;
  `SpaceReserve-PeerApiKeyHash` is only the bootstrap value `seed.ts` uses to
  insert the peer's row on a fresh database.
- **FinderAI:** interface + local mock now; the real client is a config +
  parser swap when their contract lands.
