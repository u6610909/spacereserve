# MASTER PROMPT — SpaceReserve (CSX4110 Final Project)

> **How to use:** paste this whole file as your first message to Claude Code in an empty
> project directory. Fill in the `<< >>` placeholders first where you already know the value;
> leave the rest — the prompt tells Claude Code to stop and ask rather than invent them.

---

## 0. Your role

You are the sole engineer building **SpaceReserve**, a campus room-booking backend, as the
final project for CSX4110 Backend Application Development (Assumption University, Vincent Mary
School of Engineering, Science and Technology). Prof. Dr. Chayapol Moemeng, Section 542,
Semester 1/2026.

Team: Ratchanon P. (6610909), Badin Bangsen (6611108), Warachai A. (6610996).

Deadline: **Wednesday, 23 September 2026.**

Work autonomously. Build, run, and test as you go. Do not ask permission for routine
implementation decisions — only stop for the hard blockers listed in §12.

---

## 1. Non-negotiable grading requirements

The project is worth 20% of the course. It is graded against a fixed checklist. **Every item
below must be visibly present and working in the final system.** Treat this as the definition
of done — a beautiful codebase missing one of these scores zero on that line.

| # | Requirement | What "done" looks like |
|---|---|---|
| 1 | **Infrastructure** | Deployed on a hardened Linux VPS (Oracle Cloud or Azure). UFW firewall on, SSH key-only, fail2ban, non-root deploy user. |
| 2 | **Networking & Deployment** | Nginx reverse proxy + Let's Encrypt SSL. App served under a **new distinct path** `https://ratchanon-bad2026.eastasia.cloudapp.azure.com/spacereserve`. Must NOT break the existing `/content` (WordPress) or `/api` (lab) routes. |
| 3 | **Backend** | Node.js + Express REST API (TypeScript). |
| 4 | **Database** | PostgreSQL, accessed **only** through Prisma ORM, schema evolved via `prisma migrate` migration files committed to git. |
| 5 | **Security & Identity** | JWT auth with Role-Based Access Control (RBAC). |
| 6 | **AD Integration** | Login via the University's Microsoft Active Directory using MSAL / OAuth2 / OIDC. |
| 7 | **Secrets Management** | **No `.env` in production.** App fetches DB connection string, JWT secret, and API keys from the **Class Azure Key Vault** at runtime. |
| 8 | **External Integration** | Backend calls ≥1 external public API / AI service. We use **two**: Google Gemini + SendGrid. |
| 9 | **Peer API** | (a) **Expose** an endpoint for a classmate's backend, protected by a static `x-api-key` we generate for them. (b) **Consume** their endpoint using the key they issue us. |
| 10 | **Source Control** | All code in a GitHub repo with a professional `README.md`. |
| 11 | **Automation** | Automated deploy script **and** Docker Compose. |

Deliverables: Proposal (done), ≤10-min video demo, GitHub repo + README, live testable system.

---

## 2. What SpaceReserve is

A REST API for booking campus spaces — study rooms, project labs, music practice rooms.

- **Students / Faculty** search for open rooms, create a booking, cancel their own booking,
  and invite others to join a booking.
- **Facility Staff** add / edit / remove rooms, update capacity and amenities, mark a room
  out-of-order, and override a booking for maintenance.
- **System Admin** does full system configuration, views audit logs, and sees room
  utilization stats.

Nobody sets a SpaceReserve password. Everyone signs in with their university Microsoft
account through AD + OIDC; the API then issues its own JWT carrying identity and role.

---

## 3. Tech stack (fixed — do not substitute)

- Node.js 20 LTS, TypeScript, Express 4
- PostgreSQL 16
- Prisma ORM (with migrations)
- `@azure/identity` + `@azure/keyvault-secrets`
- `@azure/msal-node` (OIDC auth code flow) — or `openid-client` if MSAL proves awkward
- `jsonwebtoken`, `zod` (validation), `pino` (logging), `helmet`, `cors`, `express-rate-limit`
- `@google/generative-ai` (Gemini), `@sendgrid/mail`
- `vitest` + `supertest` for tests
- Docker + Docker Compose
- Nginx + Certbot on the VPS

---

## 4. Data model

Four core tables. Write this as `prisma/schema.prisma`, then generate a real migration.

```prisma
enum Role {
  STUDENT
  STAFF
  ADMIN
}

enum RoomStatus {
  AVAILABLE
  OUT_OF_ORDER
}

enum ReservationStatus {
  CONFIRMED
  CANCELLED
  OVERRIDDEN
}

model User {
  id            String   @id @default(uuid())
  adObjectId    String   @unique          // Microsoft AD object id (oid claim)
  email         String   @unique
  name          String
  role          Role     @default(STUDENT)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  reservations  Reservation[]         @relation("Organizer")
  attending     ReservationAttendee[]
  auditLogs     AuditLog[]
}

model Room {
  id           String     @id @default(uuid())
  name         String     @unique
  building     String
  capacity     Int
  amenities    String[]                    // e.g. ["projector","whiteboard"]
  status       RoomStatus @default(AVAILABLE)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  reservations Reservation[]

  @@index([capacity, status])
}

model Reservation {
  id          String            @id @default(uuid())
  roomId      String
  organizerId String
  startTime   DateTime
  endTime     DateTime
  purpose     String?
  status      ReservationStatus @default(CONFIRMED)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  room        Room                  @relation(fields: [roomId], references: [id])
  organizer   User                  @relation("Organizer", fields: [organizerId], references: [id])
  attendees   ReservationAttendee[]

  @@index([roomId, startTime, endTime])
  @@index([organizerId])
}

model ReservationAttendee {
  id            String   @id @default(uuid())
  reservationId String
  userId        String
  invitedAt     DateTime @default(now())

  reservation   Reservation @relation(fields: [reservationId], references: [id], onDelete: Cascade)
  user          User        @relation(fields: [userId], references: [id])

  @@unique([reservationId, userId])
}

model AuditLog {
  id        String   @id @default(uuid())
  actorId   String?
  action    String            // "ROOM_CREATED", "BOOKING_OVERRIDDEN", ...
  entity    String
  entityId  String
  metadata  Json?
  createdAt DateTime @default(now())

  actor     User?    @relation(fields: [actorId], references: [id])

  @@index([createdAt])
}
```

**Business rules to enforce in the service layer:**

1. No two `CONFIRMED` reservations may overlap in the same room. Enforce with a transactional
   overlap check: `existing.startTime < new.endTime AND existing.endTime > new.startTime`.
2. A room with status `OUT_OF_ORDER` cannot be booked.
3. Attendee count (organizer + attendees) must not exceed `room.capacity`.
4. Bookings must be in the future, max 4 hours long, max 14 days ahead.
5. Only the organizer (or STAFF/ADMIN) may cancel a reservation.
6. Every STAFF/ADMIN mutation writes an `AuditLog` row.

---

## 5. API surface

Base path: `/spacereserve/api/v1` (so Nginx can proxy the whole prefix cleanly).

### Auth
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/auth/login` | public | Redirects to Microsoft AD authorize URL (MSAL) |
| GET | `/auth/callback` | public | Handles OIDC code, upserts `User` from claims, returns our JWT |
| GET | `/auth/me` | any authed | Current user + role |
| POST | `/auth/refresh` | any authed | Rotate JWT |

### Rooms
| Method | Path | Access |
|---|---|---|
| GET | `/rooms` | any authed — filters: `capacity`, `amenities`, `building`, `availableFrom`, `availableTo` |
| GET | `/rooms/:id` | any authed |
| POST | `/rooms` | STAFF, ADMIN |
| PATCH | `/rooms/:id` | STAFF, ADMIN |
| DELETE | `/rooms/:id` | STAFF, ADMIN |
| PATCH | `/rooms/:id/status` | STAFF, ADMIN — mark out-of-order |

### Reservations
| Method | Path | Access |
|---|---|---|
| POST | `/reservations` | any authed |
| GET | `/reservations/mine` | any authed |
| GET | `/reservations/:id` | organizer, attendee, STAFF, ADMIN |
| DELETE | `/reservations/:id` | organizer, STAFF, ADMIN |
| POST | `/reservations/:id/attendees` | organizer |
| DELETE | `/reservations/:id/attendees/:userId` | organizer |
| POST | `/reservations/:id/override` | STAFF, ADMIN — maintenance override, emails organizer |
| POST | `/reservations/:id/check-in` | organizer — **triggers the peer-API lost-item lookup (§7)** |

### AI
| Method | Path | Access |
|---|---|---|
| POST | `/search/natural` | any authed — free-text → Gemini → structured query → rooms |

### Admin
| Method | Path | Access |
|---|---|---|
| GET | `/admin/audit-logs` | ADMIN |
| GET | `/admin/stats/utilization` | ADMIN |

### Peer-facing (exposed to classmate — **API key, not JWT**)
| Method | Path | Access |
|---|---|---|
| GET | `/external/bookings/active-at?room=<name>&at=<ISO8601>` | valid `x-api-key` only |

### Ops
| Method | Path | Access |
|---|---|---|
| GET | `/health` | public — returns `{status, db, keyVault, version}` |

---

## 6. External integrations

### 6a. Google Gemini — natural-language room search
`POST /search/natural` takes `{ "query": "Find me a room for 4 people tomorrow at 3 PM with a whiteboard" }`.

Send it to Gemini with a strict JSON-schema-constrained prompt that returns:

```json
{ "capacity": 4, "startTime": "2026-09-24T15:00:00+07:00", "endTime": "2026-09-24T16:00:00+07:00", "amenities": ["whiteboard"], "building": null }
```

Then feed that into the same availability query `GET /rooms` uses. Rules:
- Validate Gemini's output with zod before it touches the database. Never interpolate model
  output into SQL — it goes through Prisma's typed query builder only.
- Resolve relative dates ("tomorrow", "next Monday") against Asia/Bangkok time.
- On Gemini failure or timeout (5s), fall back to a plain keyword search and return
  `"degraded": true` — the endpoint must never 500 because of the AI.

### 6b. SendGrid — booking emails
Send to the user's university email on: booking confirmed, booking cancelled, staff override.
Use SendGrid dynamic templates. Send asynchronously (fire-and-forget with logged failures) so
a mail outage never fails the booking request.

---

## 7. Peer API integration — partner: **Finder Portal / FinderAI** (campus Lost & Found)

This is the requirement graders scrutinize most. Both directions must be demonstrably live.

### THEY CALL US (expose)
`GET /spacereserve/api/v1/external/bookings/active-at?room=Library%20Room%204B&at=2026-09-20T14:00:00%2B07:00`

- Auth: header `x-api-key: <<KEY_WE_ISSUE_TO_FINDERAI>>`. Generate a 32-byte random hex key,
  store its **SHA-256 hash** in an `ApiKey` table (add the model), compare hashes on request.
  Never store the raw key.
- Purpose: when FinderAI logs a found item in "Library Room 4B" at 2:00 PM, they call this to
  learn who had that room booked then, so they can notify the likely owner.
- Response — return the **minimum** personal data needed:
```json
{ "room": "Library Room 4B", "at": "2026-09-20T14:00:00+07:00",
  "reservation": { "id": "...", "startTime": "...", "endTime": "...",
                   "organizer": { "name": "Ratchanon P.", "email": "…@au.edu" },
                   "attendeeCount": 3 } }
```
  Return `{ "reservation": null }` when nobody had it. Rate-limit to 60 req/min per key.

### WE CALL THEM (consume)
`GET <<FINDERAI_BASE_URL>>/api/v1/items/by-location?location=<room>&since=<ISO>`
with the `x-api-key` header **they** issue us (fetched from Key Vault as `FinderAI-ApiKey`).

Trigger: `POST /reservations/:id/check-in`. Response includes a heads-up block:

```json
{ "checkedIn": true,
  "lostItemNotice": { "count": 2, "message": "2 lost items were reported in this room. Did you lose something?", "items": [...] } }
```

Wrap the outbound call in a 3s timeout + circuit breaker; if FinderAI is down, check-in still
succeeds with `lostItemNotice: null`. Cache responses 60s.

---

## 8. Security & identity implementation

### AD / OIDC
- AU's Entra tenant id is **`c1f3dc23-b7f8-48d3-9b5d-2b12f158f01f`** (confirmed from the public
  OIDC discovery document at
  `https://login.microsoftonline.com/au.edu/v2.0/.well-known/openid-configuration`).
  AU federates sign-in to a SAML IdP at `home.au.edu`, but Microsoft handles that handoff
  internally — **MSAL + OIDC is still the correct approach, do not use a SAML library.**
- Still needed: an app registration inside that tenant (`<<AD_CLIENT_ID>>` + client secret +
  whitelisted redirect URI). Student accounts cannot create one. Until it exists, build against
  a personal Entra tenant with seeded users; the tenant id is config, not code.
- `@azure/msal-node` ConfidentialClientApplication, authorization-code flow with PKCE.
- Redirect URI: `https://ratchanon-bad2026.eastasia.cloudapp.azure.com/spacereserve/api/v1/auth/callback`.
- On callback: validate the ID token, then **upsert** the `User` by `adObjectId`, taking
  `email` and `name` from claims. First-time users default to `STUDENT`.
- Role assignment: map from AD group claims if the tenant provides them; otherwise an ADMIN
  promotes users via a seeded admin account. Document whichever you implement.

### Our JWT
- Signed HS256 with `JWT-Secret` from Key Vault. 1-hour expiry. Claims: `sub` (our user id),
  `email`, `role`, `iat`, `exp`, `iss: "spacereserve"`.
- `requireAuth` middleware verifies and attaches `req.user`.
- `requireRole(...roles)` middleware for RBAC. Apply it per the access column in §5.
- Ownership checks (organizer-only actions) happen in the service layer, not middleware.

### Hardening
- `helmet`, strict CORS allow-list, `express-rate-limit` (100/15min general, 10/min on
  `/search/natural`), zod validation on every body/query/param, no stack traces in prod
  responses, structured pino logs with request IDs, secrets never logged.

---

## 9. Azure Key Vault (requirement #7 — highest-risk item, do this early)

**Production must have zero secrets on disk.** At boot, before Express starts:

1. Authenticate to the Class Key Vault (`<<KEY_VAULT_URL>>`) using `DefaultAzureCredential`.
   In production use a service principal via `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` /
   `AZURE_CLIENT_SECRET` supplied as container env vars, or managed identity if available.
   Those three bootstrap variables are the **only** env config allowed in production.
2. Fetch and cache these secrets (name them with our project prefix to avoid class collisions):
   - `SpaceReserve-DatabaseUrl`
   - `SpaceReserve-JwtSecret`
   - `SpaceReserve-GeminiApiKey`
   - `SpaceReserve-SendGridApiKey`
   - `SpaceReserve-FinderAIApiKey`
   - `SpaceReserve-PeerApiKeyHash`
3. Expose them through a typed `config` module. **No `process.env` reads anywhere outside
   `src/config/`.** Add an ESLint rule or a grep check in CI enforcing that.
4. Local development may fall back to `.env` — but gate it behind `NODE_ENV !== 'production'`
   and make the app **refuse to boot** in production if Key Vault is unreachable. Say so
   loudly in the logs; this is the behaviour to show in the demo video.
5. `.env` is in `.gitignore`; commit `.env.example` with key names and empty values.

---

## 10. Repo layout

```
spacereserve/
├── src/
│   ├── index.ts                 # bootstrap: Key Vault → config → Prisma → Express
│   ├── app.ts                   # Express app assembly (exported for tests)
│   ├── config/
│   │   ├── keyvault.ts
│   │   └── index.ts             # typed config, the ONLY process.env reader
│   ├── middleware/
│   │   ├── requireAuth.ts
│   │   ├── requireRole.ts
│   │   ├── requireApiKey.ts     # peer-facing x-api-key
│   │   ├── validate.ts          # zod
│   │   └── errorHandler.ts
│   ├── modules/
│   │   ├── auth/                # msal, jwt issuance
│   │   ├── rooms/
│   │   ├── reservations/
│   │   ├── search/              # gemini
│   │   ├── external/            # exposed peer endpoint
│   │   └── admin/
│   ├── integrations/
│   │   ├── gemini.ts
│   │   ├── sendgrid.ts
│   │   └── finderai.ts          # peer client
│   └── lib/{prisma.ts,logger.ts,errors.ts,audit.ts}
├── prisma/{schema.prisma,migrations/,seed.ts}
├── tests/
├── docker-compose.yml           # api + postgres + (dev) adminer
├── docker-compose.prod.yml
├── Dockerfile                   # multi-stage, non-root user, healthcheck
├── deploy.sh
├── nginx/spacereserve.conf
├── docs/{ERD.png,api.md,peer-api.md}
├── .github/workflows/ci.yml
├── .env.example
└── README.md
```

Each module: `*.routes.ts` → `*.controller.ts` → `*.service.ts` → `*.schema.ts` (zod).
Controllers stay thin; all business rules live in services; only services touch Prisma.

---

## 11. Deployment

### Nginx — must not break existing routes
Add a **new location block only**; do not touch `/content` or `/api`.

```nginx
location /spacereserve/ {
    proxy_pass         http://127.0.0.1:4000/spacereserve/;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_read_timeout 30s;
}
```

Keep the `/spacereserve` prefix inside Express too (mount the router at that path) so
generated OIDC redirect URLs and links are correct behind the proxy. Set
`app.set('trust proxy', 1)`.

Verify after every Nginx change: `sudo nginx -t`, then curl `/content`, `/api`, and
`/spacereserve/api/v1/health` and confirm all three still answer.

### SSL
Let's Encrypt via certbot on `ratchanon-bad2026.eastasia.cloudapp.azure.com`. If a cert already exists for the domain, reuse it —
do not re-issue and risk rate limits.

### Docker Compose
`api` (built from Dockerfile) + `postgres:16` with a named volume. API container gets only the
three Azure bootstrap vars. Healthcheck hits `/spacereserve/api/v1/health`. Restart policy
`unless-stopped`. Postgres port **not** published to the host in prod.

### deploy.sh (idempotent, `set -euo pipefail`)
`git pull` → `docker compose build` → `npx prisma migrate deploy` → `docker compose up -d` →
wait for health → print status. Roll back to previous image tag on health-check failure.

> **Critical:** use `prisma migrate deploy` on the server. **Never** `prisma migrate dev` — it
> can reset the database. Generate migrations locally, commit them, deploy them.

### VPS hardening
UFW allowing only 22/80/443, SSH key-only (`PasswordAuthentication no`), fail2ban, unattended
security upgrades, app runs as a non-root user, swap file configured (low-RAM VPS instances
OOM-kill builds and hang SSH otherwise — build images locally or with swap enabled).

---

## 12. Build order — work through these phases in order

Commit at the end of every phase with a conventional-commit message. Run `npm run lint`,
`npm run typecheck`, and the test suite before each commit.

1. **Scaffold** — TypeScript, Express, folder layout, pino, error handler, `/health`,
   Dockerfile, docker-compose, CI workflow. Health endpoint returns 200 locally.
2. **Database** — `schema.prisma`, first migration, `seed.ts` (3 users one per role, ~10 rooms
   across 2 buildings, a few reservations). `docker compose up` gives a working DB.
3. **Key Vault** — do this before writing features so nothing ever hardcodes a secret.
   Typed config module, production boot-fails-without-vault behaviour, `.env` dev fallback.
4. **Auth** — MSAL OIDC login/callback, user upsert, JWT issuance, `requireAuth`,
   `requireRole`, `/auth/me`. Add a dev-only `POST /auth/dev-login` (disabled in production)
   so you can test everything else without a live AD round-trip.
5. **Rooms** — full CRUD + availability filtering + status changes + audit logging.
6. **Reservations** — creation with transactional overlap checking, cancellation, attendees,
   staff override. This is the core; write the most tests here.
7. **Gemini search** — `/search/natural` with schema-constrained output, zod validation,
   graceful degradation.
8. **SendGrid** — confirm / cancel / override emails, async, failures logged not thrown.
9. **Peer API — expose** — `ApiKey` model, hashed key storage, `requireApiKey` middleware,
   `/external/bookings/active-at`, per-key rate limit. Generate FinderAI's key, hand it over,
   and write `docs/peer-api.md`.
10. **Peer API — consume** — FinderAI client with timeout + circuit breaker + cache, wired
    into `/reservations/:id/check-in`.
11. **Tests** — vitest + supertest against a throwaway Postgres. Cover: RBAC matrix (each role
    against each protected route), overlap rejection, capacity limit, out-of-order room
    rejection, API-key rejection on the peer endpoint, Gemini fallback path.
12. **Deploy** — Nginx location block, SSL, `deploy.sh`, live on
    `https://ratchanon-bad2026.eastasia.cloudapp.azure.com/spacereserve`. Confirm `/content` and `/api` still work.
13. **Docs** — README (see §13), ERD image, `docs/api.md`, Postman/Thunder collection.
14. **Demo prep** — a `demo.sh` or Postman collection that walks the grading checklist in
    order, so the 10-minute video can just follow it.

---

## 13. README.md requirements (graded, 5%)

Must contain, at minimum:

- Project overview and the problem it solves
- Architecture diagram (Mermaid is fine) showing client → Nginx → Express → Postgres, plus
  Key Vault, AD, Gemini, SendGrid, and FinderAI
- Tech stack table
- ERD (image or Mermaid)
- Local setup instructions that actually work from a clean clone
- Environment / Key Vault secret table (names only, never values)
- Full API reference table
- RBAC matrix (role × endpoint)
- **Peer API section** — explicitly naming: the classmate/team (Finder Portal / FinderAI),
  the endpoint we expose for them and what it returns, the endpoint we consume and what we do
  with the data, and how keys are exchanged
- Deployment guide + live URL
- Team members with student IDs

---

## 14. Stop and ask me when

Do **not** guess on these — ask, then continue:

- Real values for any `<< >>` placeholder: domain, VPS IP/user, Azure Key Vault URL, AD tenant
  and client IDs, FinderAI base URL, app port.
- The exact request/response shape of FinderAI's `/api/v1/items/by-location` — get their real
  contract before writing the client; do not invent fields.
- Anything requiring a credential I have not given you.
- Any change that would touch the existing `/content` or `/api` routes on the VPS.

Otherwise: keep going, make the call, and note the decision in the commit message.

---

## 15. Definition of done

- [ ] All 11 requirements in §1 verifiably working on the live URL
- [ ] `curl https://ratchanon-bad2026.eastasia.cloudapp.azure.com/spacereserve/api/v1/health` returns 200 with `keyVault: "ok"`
- [ ] `/content` and `/api` still respond exactly as before
- [ ] Production container has no `.env` file and no secrets in its image
- [ ] Peer API works in both directions against the real partner system
- [ ] Prisma migrations committed; `migrate deploy` runs clean on a fresh database
- [ ] `./deploy.sh` takes a fresh clone to a running system with no manual steps
- [ ] Tests pass in CI; RBAC matrix fully covered
- [ ] README complete per §13, including the named peer-API section
- [ ] Demo script ready to record the ≤10-minute video
