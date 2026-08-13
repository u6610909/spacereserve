# SpaceReserve

Campus room-booking REST API — final project for **CSX4110 Backend Application Development**,
Assumption University (Vincent Mary School of Engineering, Science and Technology).
Prof. Dr. Chayapol Moemeng · Section 542 · Semester 1/2026.

> **Status: Phase 1 (scaffold).** This README is a stub. It is completed in Phase 13 to the full
> graded spec: architecture diagram, ERD, tech-stack table, API reference, RBAC matrix, peer-API
> section, deployment guide, and live URL.

## What it does

Students and faculty search for open study rooms, project labs, and music practice rooms, book
them, and invite others along. Facility staff manage rooms and override bookings for maintenance.
Admins see audit logs and utilization stats. Nobody sets a SpaceReserve password — sign-in goes
through the university's Microsoft Entra ID (AD) via OIDC, and the API then issues its own JWT.

## Tech stack

Node.js 20 · TypeScript · Express 4 · PostgreSQL 16 · Prisma ORM · Azure Key Vault · MSAL (OIDC) ·
Google Gemini · SendGrid · Docker Compose · Nginx + Let's Encrypt on an Azure VM.

## Local setup

```bash
cp .env.example .env      # fill in the dev values; never commit .env
npm ci
docker compose up --build
curl http://localhost:4000/spacereserve/api/v1/health
```

Expected response:

```json
{ "status": "ok", "db": "not_configured", "keyVault": "not_configured", "version": "0.1.0", "uptimeSeconds": 1 }
```

`db` and `keyVault` become real probes in Phases 2 and 3.

Without Docker:

```bash
npm ci
npm run dev
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | Watch-mode dev server (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:env` | Fails if `process.env` is read outside `src/config/` |
| `npm test` | Vitest + supertest |

## Configuration & secrets

Production has **no `.env` file**. Every secret is fetched from Azure Key Vault at boot, and the
app refuses to start if the vault is unreachable. The only environment variables production
receives are the three Azure bootstrap values (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
`AZURE_CLIENT_SECRET`).

Secret **names only** — values live in the vault:

| Key Vault secret | Holds |
|---|---|
| `SpaceReserve-DatabaseUrl` | Postgres connection string |
| `SpaceReserve-JwtSecret` | JWT signing key (also signs the OIDC state / PKCE cookies) |
| `SpaceReserve-AdClientId` | Entra app registration client id |
| `SpaceReserve-AdClientSecret` | Entra app registration client secret |
| `SpaceReserve-GeminiApiKey` | Google Gemini |
| `SpaceReserve-SendGridApiKey` | SendGrid |
| `SpaceReserve-FinderAIApiKey` | Key issued to us by the FinderAI team |
| `SpaceReserve-PeerApiKeyHash` | Bootstrap hash of the key we issue FinderAI |

Non-secret, but kept in the same table so a tenant swap is one obvious place: **AD tenant id** —
AU's Entra tenant is `c1f3dc23-b7f8-48d3-9b5d-2b12f158f01f`. A personal Entra tenant is used for
development until AU's app registration is issued.

`.env.example` mirrors this table with empty values for local development.

## Contributing

See **[TEAM.md](TEAM.md)** — branch per phase, pull request into `main`, CI must pass before
merge, and no direct commits to `main`.

## Team

| Name | Student ID |
|---|---|
| Ratchanon P. | 6610909 |
| Badin Bangsen | 6611108 |
| Warachai A. | 6610996 |
