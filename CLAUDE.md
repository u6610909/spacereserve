# CLAUDE.md — SpaceReserve (CSX4110 Final Project)

Condensed working spec. Full detail: `MASTER_PROMPT.md` (source of truth — reread it when this file is silent on something).

## What this is
Campus room-booking REST API. Students/faculty book rooms; facility staff manage rooms and override bookings; admins see audit logs + utilization. No local passwords — Microsoft AD/OIDC login, then our own JWT.

Team: Ratchanon P. (6610909), Badin Bangsen (6611108), Warachai A. (6610996).
Course: CSX4110, Prof. Dr. Chayapol Moemeng, Sec 542, Sem 1/2026. **Deadline: Wed 23 Sep 2026.**

## Stack (fixed — no substitutions)
Node 20 LTS · TypeScript · Express 4 · PostgreSQL 16 · Prisma ORM
`@azure/identity` + `@azure/keyvault-secrets` · `@azure/msal-node` (fallback: `openid-client`)
`jsonwebtoken` · `zod` · `pino` · `helmet` · `cors` · `express-rate-limit` · `cookie-parser` (approved addition)
`@google/generative-ai` · `@sendgrid/mail` · `vitest` + `supertest` · Docker + Compose · Nginx + Certbot

## Resolved environment
- **Domain:** `ratchanon-bad2026.eastasia.cloudapp.azure.com` (Azure VM DNS label; HTTPS already live for the lab)
- **VPS:** `azureuser@20.2.140.191` (Azure VM, East Asia) — same box as the lab
- **App port:** `4000` (3000 is the pm2 lab API `crud-api`)
- **Repo:** `~/CSX4110/spacereserve`, fresh git repo next to `MASTER_PROMPT.md` / `CLAUDE.md`. Never nest inside `backend-crud-api`.
- **Partner:** "Finder Portal (FinderAI)" on first mention, `FinderAI` thereafter.
- **SSL:** cert already exists — **reuse it**. Never `--force-renewal`, never request a new cert. Add the `/spacereserve/` location inside the existing SSL server block. Check `sudo certbot certificates` first.

## Hard rules — never violate
1. **Key Vault only in production.** No `.env` in prod. Only allowed prod env vars: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET`. App must **refuse to boot** in prod if Key Vault is unreachable, and log it loudly.
2. **`process.env` is read only inside `src/config/`.** Enforce with an ESLint rule + CI grep.
3. **Never run `prisma migrate dev` on the server.** Generate migrations locally, commit them, `prisma migrate deploy` on the VPS.
4. **Never touch `/content` (WordPress) or `/api` (lab) on the VPS.** Add a new Nginx `location /spacereserve/` block only. After every Nginx change: `sudo nginx -t`, then curl all three paths.
5. **Secrets never logged, never committed.** `.env` gitignored; `.env.example` has key names with empty values. Peer API keys stored as SHA-256 hashes only.
6. **Only services touch Prisma.** Controllers thin; business rules in services; zod validates every body/query/param.
7. External failures never break core flows: Gemini fails → keyword fallback + `"degraded": true`, never 500. SendGrid fails → log, booking still succeeds. FinderAI down → check-in succeeds with `lostItemNotice: null`.
8. Stop and ask before: guessing a `<< >>` value, inventing FinderAI's contract, using a credential I haven't given you, or anything touching `/content` / `/api`.
9. **Never build Docker images on the VM.** It is memory-starved (already OOM-killed once; needed a swapfile to run `npm install`) and runs nginx + MySQL + WordPress + the pm2 lab API. Build in GitHub Actions → push to GHCR → `deploy.sh` only does `docker compose pull` + `up -d`. Bump swap 1 GB → 4 GB as a prerequisite; set `mem_limit` on Postgres. If RAM still doesn't fit, **flag it** — fallback is Azure Database for PostgreSQL, never a silent degrade.
10. **Do not reuse anything from `backend-crud-api/prisma/`** — that's MySQL + Prisma 5 + Express 5. The lab project is read-only reference for **nginx/deploy layout only**.

## Key Vault secrets (names only — never values)

| Name | Secret? | Holds |
|---|---|---|
| `SpaceReserve-DatabaseUrl` | vault | Postgres connection string |
| `SpaceReserve-JwtSecret` | vault | HS256 signing key; **also signs cookies** (PKCE state + session) |
| `SpaceReserve-AdClientId` | vault | Entra app registration client id |
| `SpaceReserve-AdClientSecret` | vault | Entra app registration client secret |
| `SpaceReserve-GeminiApiKey` | vault | Gemini |
| `SpaceReserve-SendGridApiKey` | vault | SendGrid |
| `SpaceReserve-FinderAIApiKey` | vault | key FinderAI issues us |
| `SpaceReserve-PeerApiKeyHash` | vault | bootstrap hash `seed.ts` inserts into `ApiKey` |
| `AD_TENANT_ID` | **not secret** — config default | `c1f3dc23-b7f8-48d3-9b5d-2b12f158f01f` (AU) / personal tenant while blocked |

Tenant id is public, but lives in the same config module and the same table so a tenant swap is one obvious place. Mirror this table in `.env.example` (empty values) and in the README secret table.

## Data model
Enums: `Role{STUDENT,STAFF,ADMIN}` · `RoomStatus{AVAILABLE,OUT_OF_ORDER}` · `ReservationStatus{CONFIRMED,CANCELLED,OVERRIDDEN}`
Models: `User` (adObjectId unique, email unique, role) · `Room` (name unique, building, capacity, amenities[], status) · `Reservation` (roomId, organizerId, start/end, purpose, status) · `ReservationAttendee` (unique [reservationId,userId]) · `AuditLog` (actorId?, action, entity, entityId, metadata Json?) · **plus `ApiKey`** (added in phase 9, stores SHA-256 hash).
Exact schema in `MASTER_PROMPT.md` §4 — copy verbatim.

### Business rules (service layer)
1. No two `CONFIRMED` reservations overlap in a room — transactional check `existing.start < new.end AND existing.end > new.start`.
2. `OUT_OF_ORDER` rooms cannot be booked.
3. organizer + attendees ≤ `room.capacity`.
4. Bookings: future only, ≤ 4 h long, ≤ 14 days ahead.
5. Only organizer / STAFF / ADMIN may cancel.
6. Every STAFF/ADMIN mutation writes an `AuditLog` row.

## API surface — base `/spacereserve/api/v1`
- **Auth**: `GET /auth/login`, `GET /auth/callback`, `GET /auth/me`, `POST /auth/refresh` · dev-only `POST /auth/dev-login` (hard-disabled in prod)
- **Rooms**: `GET /rooms` (filters capacity, amenities, building, availableFrom/To), `GET /rooms/:id` — authed · `POST|PATCH|DELETE /rooms[/:id]`, `PATCH /rooms/:id/status` — STAFF/ADMIN
- **Reservations**: `POST /reservations`, `GET /reservations/mine` — authed · `GET /reservations/:id` — organizer/attendee/STAFF/ADMIN · `DELETE /reservations/:id` — organizer/STAFF/ADMIN · `POST|DELETE /reservations/:id/attendees[/:userId]` — organizer · `POST /reservations/:id/override` — STAFF/ADMIN (emails organizer) · `POST /reservations/:id/check-in` — organizer (triggers FinderAI lookup)
- **AI**: `POST /search/natural` — authed, rate-limited 10/min
- **Admin**: `GET /admin/audit-logs`, `GET /admin/stats/utilization` — ADMIN
- **Peer (x-api-key, not JWT)**: `GET /external/bookings/active-at?room=&at=` — 60 req/min per key, returns minimum personal data, `{"reservation": null}` when free
- **Ops**: `GET /health` — public, `{status, db, keyVault, version}`

JWT: HS256, 1 h, claims `sub,email,role,iat,exp,iss:"spacereserve"`. `requireAuth` + `requireRole(...)` middleware; ownership checks in services. Rate limit 100/15 min general.

## Repo layout
```
src/{index.ts,app.ts}
src/config/{keyvault.ts,index.ts}          # index.ts = ONLY process.env reader
src/middleware/{requireAuth,requireRole,requireApiKey,validate,errorHandler}.ts
src/modules/{auth,rooms,reservations,search,external,admin}/  # *.routes → *.controller → *.service → *.schema
src/integrations/{gemini.ts,sendgrid.ts,finderai.ts}
src/lib/{prisma.ts,logger.ts,errors.ts,audit.ts}
prisma/{schema.prisma,migrations/,seed.ts}
tests/  docs/{ERD.png,api.md,peer-api.md}  nginx/spacereserve.conf
Dockerfile  docker-compose.yml  docker-compose.prod.yml  deploy.sh
.github/workflows/ci.yml  .env.example  README.md
```

## Deployment
Nginx: new `location /spacereserve/` → `proxy_pass http://127.0.0.1:<<APP_PORT>>/spacereserve/` with Host / X-Real-IP / X-Forwarded-For / X-Forwarded-Proto, `proxy_read_timeout 30s`. Keep the `/spacereserve` prefix inside Express; `app.set('trust proxy', 1)`.
SSL: certbot on `<<DOMAIN>>` — reuse an existing cert, don't re-issue.
Compose: `api` + `postgres:16` named volume, postgres port not published in prod, healthcheck on `/spacereserve/api/v1/health`, `restart: unless-stopped`.
`deploy.sh`: `set -euo pipefail`; pull → build → `prisma migrate deploy` → up -d → wait health → rollback to previous tag on failure.
VPS: UFW 22/80/443 only, SSH key-only, fail2ban, unattended upgrades, non-root app user, swap file configured.

## Settled design decisions
- **`/auth/callback`**: sets an httpOnly + Secure + SameSite=Lax cookie; `?mode=json` returns `{ "token": "..." }` for Postman/demo. No tokens in URLs or history.
- **`/auth/refresh`**: re-issue while still valid (not refresh-token rotation). Say so in one line in `docs/api.md`.
- **API keys**: the `ApiKey` table is authoritative for verification; `SpaceReserve-PeerApiKeyHash` is the bootstrap value `seed.ts` uses to insert FinderAI's row on a fresh DB — comment that in `seed.ts`.
- **Check-in window**: from 15 min before `startTime` until `endTime`; outside → 409 with a clear message. The "future only" rule governs *creation*, not check-in — comment it so it doesn't read as a bug.
- **Capacity**: enforced on invite (and on create when attendees are passed inline). A solo booking of a 20-person room is intended.
- **AD**: AU's real Entra tenant is **`c1f3dc23-b7f8-48d3-9b5d-2b12f158f01f`** (confirmed via the public OIDC discovery doc at `login.microsoftonline.com/au.edu/v2.0/.well-known/openid-configuration`, region AS). The domain is **federated** — AU's sign-in page is a SAML IdP at `home.au.edu` — but that handoff happens inside Microsoft and is invisible to us, so **MSAL + OIDC remains correct**; do not switch to a SAML library. Still missing: an app registration in that tenant (client id + secret + whitelisted redirect URI); student accounts can't create one. Build Phase 4 against a personal Entra tenant with seeded users meanwhile, keeping tenant id / client id / secret / redirect URI entirely in config so switching to AU's tenant is a Key Vault change, not a code change. Ship dev-login early. Note in the README which tenant the demo uses.
  - **Personal test tenant must use cloud-only member users — never invite MSA (personal Microsoft) accounts as guests.** Guest/MSA `oid` values are tenant-scoped and differ from what AU's tenant will emit, so the same human produces a different `adObjectId` and breaks the `User.adObjectId` unique assumption (duplicate users, broken upsert). Seed members, keep claim shape identical to AU.
  - **PKCE + state storage:** signed cookies (`cookie-parser`, signed with the JWT secret) hold `code_verifier` and `state` between `/auth/login` and `/auth/callback`; the callback session cookie is httpOnly + Secure + SameSite=Lax. No stateless-encrypted-state alternative.
- **Peer URL to hand FinderAI** (put verbatim in `docs/peer-api.md`):
  `https://ratchanon-bad2026.eastasia.cloudapp.azure.com/spacereserve/api/v1/external/bookings/active-at`
- **FinderAI client**: define the interface + a local mock now; wire the real client only when their contract lands.

## Phase checklist
**Revised order: 1 → 3 → 2 → 4 → 5 …** (Key Vault before the DB so no connection string is ever hardcoded, and so vault access is proven in week 1.)
- [ ] 1. Scaffold — TS/Express/pino/error handler/`/health`, Dockerfile, compose, CI
- [ ] 3. Key Vault — typed config, prod boot-fail without vault, dev `.env` fallback
- [ ] 2. Database — schema.prisma, first migration, seed (3 users one per role, ~10 rooms / 2 buildings, a few reservations)
- [ ] 4. Auth — MSAL OIDC login/callback, user upsert, JWT, requireAuth/requireRole, `/auth/me`, dev-login
  - [ ] On the day AU's app registration lands: run a **real AU sign-in end to end** (federated SAML handoff, conditional access, MFA prompt) — never first attempt this on recording day
- [ ] 5. Rooms — CRUD + availability filtering + status + audit logs
- [ ] 6. Reservations — transactional overlap check, cancel, attendees, override (most tests here)
- [ ] 7. Gemini search — schema-constrained output, zod-validated, Asia/Bangkok relative dates, 5 s timeout → degraded fallback
- [ ] 8. SendGrid — confirm / cancel / override, async, failures logged not thrown
- [ ] 9. Peer API expose — `ApiKey` model, hashed keys, `requireApiKey`, `/external/bookings/active-at`, per-key limit, `docs/peer-api.md`
- [ ] 10. Peer API consume — FinderAI client: 3 s timeout, circuit breaker, 60 s cache, wired into check-in
- [ ] 11. Tests — RBAC matrix, overlap rejection, capacity, out-of-order, API-key rejection, Gemini fallback
- [ ] 12. Deploy — Nginx block, SSL, deploy.sh, live; verify `/content` + `/api` unbroken
- [ ] 13. Docs — README (§13 checklist), ERD, `docs/api.md`, Postman collection
- [ ] 14. Demo prep — `demo.sh` / collection walking the grading checklist in order

Commit at the end of every phase (conventional commits). Before each commit: `npm run lint`, `npm run typecheck`, tests.

## Still blocked (do not invent — build behind an interface and stub)
`<<KEY_VAULT_URL>>` + service principal id/tenant/secret (+ whether write access exists) · `<<AD_CLIENT_ID>>` + client secret for AU's tenant (**tenant id is now known — see Settled design decisions**) · `<<FINDERAI_BASE_URL>>` + real contract + the key they issue us · Gemini API key · SendGrid key + verified sender + dynamic template IDs · GitHub repo URL.
`<<KEY_WE_ISSUE_TO_FINDERAI>>` we generate ourselves.

## Known VPS facts (lab project — read-only reference)
Azure VM `azureuser@20.2.140.191`; lab API in `~/crud-api` under pm2 on port 3000; React build in `/var/www/html`; WordPress at `/content`; MySQL and nginx on the host; Apache stopped/disabled; 1 GB swapfile added after an OOM (see `fix-vm.sh`).
