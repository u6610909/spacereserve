# SpaceReserve — how the three of us work

Share this with Badin and Warachai. **Tell them to open Claude Code inside the repo folder** —
`CLAUDE.md` is committed, so all three Claudes read the same spec and produce consistent code.
A Claude started outside the repo will invent its own conventions and you'll spend the weekend
merging garbage.

Repo: `https://github.com/u6610909/spacereserve`

---

## Why the split looks like this

Ratchanon and Badin are carrying the senior project at the same time as this one. So Warachai
takes the largest share of SpaceReserve, and Ratchanon keeps only the parts that physically
require his accounts and his server.

Rough share of the work still remaining (Phase 1 is already done):

| Person | Share | Phases |
|---|---|---|
| **Warachai** | ~55% | 2, 4, 7, 8, 9, 10, 13, 14 |
| **Badin** | ~25% | 5, 6 |
| **Ratchanon** | ~20% | 3, 12 + all account setup + reviewing and merging every PR |

---

## Who owns what

Split by **folder**. If two people edit different folders, the code won't clash. If two people
edit the same file, it will.

### Ratchanon
`src/config/` · `src/lib/` · `src/middleware/errorHandler.ts` · `src/middleware/validate.ts` ·
`src/middleware/notFound.ts` · `src/modules/health/` · `tests/health.test.ts` ·
`Dockerfile` · `docker-compose*.yml` · `.github/workflows/` · `nginx/` · `deploy.sh` ·
`.env.example` · the secret table section of `README.md`

**Phases 3 (Key Vault) and 12 (Deploy).** Plus everything nobody else can do:

- creating the Azure Key Vault, the service principal, and the Postgres database
- creating the Entra tenant + app registration, then handing Warachai the client ID and secret
- creating the Gemini and SendGrid keys and putting them in Key Vault
- reviewing and merging every pull request
- anything touching the VM — nobody else SSHes into that box

### Warachai
`prisma/` · `src/modules/auth/` · `src/middleware/requireAuth.ts` · `src/middleware/requireRole.ts` ·
`src/middleware/requireApiKey.ts` · `src/modules/search/` · `src/integrations/` ·
`src/modules/external/` · `src/modules/admin/` · `docs/`

**Phases 2 (Database), 4 (Auth), 7 (Gemini), 8 (SendGrid), 9 (Peer API expose),
10 (Peer API consume), 13 (Docs), 14 (Demo prep).**

### Badin
`src/modules/rooms/` · `src/modules/reservations/`

**Phases 5 (Rooms) and 6 (Reservations).** Reservations is the heart of the system — the
overlap check, capacity limits, cancellation rules, staff override. It's also where most of the
tests live.

### Everyone
Phase 11 — write tests for your own modules.

---

## Shared files — the ones that will cause conflicts

Some files can't belong to one person. Rules for those:

**`package.json` / `package-lock.json`** — every phase touches them. Two rules:

1. **Rebase onto `main`, never merge.** `git pull --rebase origin main` before you open a PR.
2. **On a lockfile conflict, don't hand-merge it.** Take `main`'s version and regenerate:
   ```bash
   git checkout --theirs package-lock.json   # during rebase, this is main's
   npm install
   git add package-lock.json
   ```
   Hand-merging a lockfile produces a file that installs a different dependency tree than
   anyone actually tested.

**`.env.example`** — Ratchanon's, but Warachai will need to add keys during phases 8–10
(SendGrid template IDs, FinderAI base URL). He may **append new key names** with empty values.
He may not remove or rename existing ones.

**`README.md`** — Ratchanon maintains the secret table until Phase 13. From Phase 13 onward
Warachai owns the whole file, but must leave the secret table intact.

**`src/lib/prisma.ts`** — Ratchanon writes it as a Phase 3a prerequisite (see sequencing
below), then nobody edits it again.

---

## Sequencing — read this before you start

**Phase 3a comes first, and it's Ratchanon's — half a day.**

Phase 2 can't actually be first, because it needs two things that live in Ratchanon's folders:
`src/lib/prisma.ts` (every service imports it) and `config.databaseUrl`. So Ratchanon ships a
small "Phase 3a" — the Prisma client plus the database URL config field, no Key Vault yet —
before anything else. Then Phase 2 is genuinely unblocked. Real Phase 3 (Key Vault) lands later.

**Then Warachai does Phase 2, immediately, before anything else he owns.**

Nobody can write a single module until `prisma/schema.prisma` exists and is merged — every
service imports the Prisma client. Badin is completely blocked until it lands, and so is
Warachai's own Phase 4.

The schema is already written out in full in `MASTER_PROMPT.md` §4. Copy it verbatim, generate
the migration, write the seed. It should take a day, not a week.

After Phase 2 merges, all three work in parallel.

Phase 4 (Auth) is the hardest single phase. Warachai should start it right after Phase 2 and
not leave it until September — OIDC fails for boring reasons like a redirect URI having an
extra slash, and you don't want to discover that the week before the deadline.

---

## Files only Ratchanon edits

Need a change here? **Ask — don't edit.**

- `src/app.ts` — middleware order is load-bearing
- `src/config/index.ts`
- `docker-compose*.yml`, `Dockerfile`, `deploy.sh`, `.github/workflows/`
- `nginx/`
- `CLAUDE.md`, `MASTER_PROMPT.md`, this file

Inside your own folders, edit freely.

---

## Git workflow

1. Never commit to `main` directly. Branch per phase: `phase-5-rooms`, `phase-7-gemini`.
2. Pull `main` before you start, and again before you open a PR.
3. Open a pull request. CI must pass. Ratchanon merges.
4. Conventional commits: `feat: add room availability filter`.

`main` is protected — a PR and a green CI run are required. You physically cannot push to it.

---

## Hard rules — tell your Claude these

1. **Never run `prisma migrate dev`.** It can wipe the database. Migrations are generated
   locally and applied with `prisma migrate deploy`.
2. **Never commit `.env`.** Need a secret? Ask Ratchanon. `.env.example` holds key names with
   empty values only.
3. **`process.env` is only read inside `src/config/`.** An ESLint rule and a CI check will fail
   your PR.
4. **Never SSH to the VM.** Only Ratchanon deploys. That box also runs the live lab project and
   WordPress — breaking it breaks other coursework.
5. **Never touch `/content` or `/api`** in any Nginx config.
6. **Controllers stay thin.** Business rules live in services. Only services touch Prisma.
7. **zod-validate every request body, query, and param.** No exceptions.
8. Adding a dependency that isn't in the stack list? **Ask first.**

---

## If you're stuck

Ask in the group chat before your Claude invents a workaround. The expensive failures on this
project won't be bugs — they'll be two people building the same thing differently, or someone's
Claude "helpfully" refactoring a file they don't own.
