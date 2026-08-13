# TEAM.md — how we work

## Members

| Name | Student ID |
|---|---|
| Ratchanon P. | 6610909 |
| Badin Bangsen | 6611108 |
| Warachai A. | 6610996 |

Course: CSX4110 Backend Application Development · Prof. Dr. Chayapol Moemeng · Section 542 · Semester 1/2026
Deadline: **Wednesday, 23 September 2026**

## Branching

- **One branch per phase**, named `phase-<n>-<slug>` — e.g. `phase-1-scaffold`, `phase-6-reservations`.
- **No direct commits to `main`.** Every change lands through a pull request.
- **CI must pass before merge**: lint, typecheck, env guard, tests. A red build is not merged, not overridden.
- Conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
- Squash-merge into `main` so each phase is one readable commit.

## Before you push

```bash
npm run lint && npm run typecheck && npm run check:env && npm test
```

## Rules that are not negotiable

These come from the project spec and the grading checklist. Read `CLAUDE.md` in the parent
directory for the full list; the ones that bite hardest:

1. **No secrets in git, ever.** No `.env`, no keys in code or commit messages. Production has no
   `.env` at all — secrets come from Azure Key Vault at runtime.
2. **`process.env` is read only inside `src/config/`.** Enforced by ESLint and by CI.
3. **Never run `prisma migrate dev` on the server** — it can reset the database. Generate
   migrations locally, commit them, `prisma migrate deploy` on the VPS.
4. **Never break `/content` (WordPress) or `/api` (the Week 5 lab)** on the VM. We only add the
   `/spacereserve/` Nginx location block. Verify all three paths after any Nginx change.
5. **Never build Docker images on the VM.** It is memory-starved. CI builds and pushes to GHCR;
   the VM only pulls.

## Who to ask

Infrastructure, Azure, and the professor/partner-team emails go through Ratchanon.
