# Decisions — round 2

Paste this to Claude Code. All 15 flags answered. One of them changes the architecture.

---

## THE BIG CHANGE: Postgres moves off the VM

Your flag #4 was more serious than you framed it. The VM is a **Standard B2ats v2: 2 vCPU,
1 GiB RAM**, Ubuntu 24.04. MySQL alone holds ~400 MB, plus WordPress, nginx, and the pm2 lab
API. Docker daemon (~50–100 MB) + a Postgres 16 container (~150 MB idle) + our Node container
does not fit in what's left, and swap thrashing on a live demo is worse than no Docker at all.

**Decision: use Azure Database for PostgreSQL Flexible Server (free tier, B1ms, 12 months).**

Consequences — update `MASTER_PROMPT.md` §11 and `CLAUDE.md` accordingly:

- `docker-compose.prod.yml` runs **one** service: `api`. No `postgres` service, no volume.
- `docker-compose.yml` (local dev) keeps a Postgres container — dev stays self-contained.
- `SpaceReserve-DatabaseUrl` in Key Vault points at the Azure DB, with `?sslmode=require`.
  This makes the Key Vault requirement genuinely meaningful rather than ceremonial — worth
  saying out loud in the demo video.
- Firewall rule on the Azure DB: allow the VM's public IP `20.2.140.191` only. Not 0.0.0.0/0.
- Local dev and CI use their own Postgres; only prod points at Azure. The config module already
  handles this if you build the three-mode design in #10 below.
- This kills flag #7's worst case too — the DB is no longer coupled to the container lifecycle.

Docker Engine + the compose plugin still need installing on the VM as a Phase 12 prerequisite.
One `api` container is affordable; a database was not.

---

## Rulings on your flags

**#1 Trailing slash — accepted.** Add `location = /spacereserve { return 301 /spacereserve/; }`
next to the main block. Update the definition-of-done curl to prove both forms work.

**#2 UFW lockout — accepted, and treat it as a hard procedure.** `sudo ufw allow 22/tcp`
*before* `sudo ufw enable`, never the reverse. Keep Azure Portal → VM → Serial Console open in
a second tab throughout. Note also: this VM's sshd has failed the version-banner handshake
under memory pressure before, which looks exactly like a firewall block but isn't — if SSH
hangs after `ufw enable`, check memory via Run Command before assuming you locked yourself out.

Port 4000 must never be reachable externally. Belt and braces: publish the container as
`127.0.0.1:4000:4000` in compose **and** leave 4000 closed in both UFW and the Azure NSG. The
proxy hop is local, so nothing breaks.

**#3 Live nginx config — you're right that you can't plan blind.** I'll SSH and paste it. Run
these and I'll give you the output:

```bash
sudo nginx -T | sed -n '1,200p'
sudo certbot certificates
ls -la /etc/nginx/sites-enabled/
```

Backup step accepted into the runbook, as written.

**#4 Docker install — accepted as a prerequisite step**, but see the big change above: only the
API is containerised now.

**#5 GHCR auth — sidestep it. Make the package public.** The repo is a student project and the
README is graded, so the code isn't secret anyway. Public package means no PAT on the VM, no
sixth secret, and no chicken-and-egg with Key Vault. If we later want it private, the PAT goes
in `~/.docker/config.json` on the VM as a documented manual bootstrap step — but default to
public.

**#6 Migrations via one-off container — accepted exactly as you proposed.**
`docker compose run --rm api npx prisma migrate deploy`. Host stays toolchain-free.

**#7 Additive migrations only — accepted, make it a written rule in `CLAUDE.md`.** No
destructive column drops in a single migration. If a column must go: stop writing to it,
deploy, then drop it in a later migration. Expand-then-contract.

**#8 luxon — approved.** Add it to the stack. It's needed at exactly one boundary: parsing
Gemini's relative dates against Asia/Bangkok. Containers stay UTC, Postgres stays `timestamptz`,
and no other layer thinks about timezones. Document that boundary in a comment so nobody
"helpfully" adds timezone logic elsewhere later.

**#9 Health caching — accepted, and split the endpoint.** Two levels:

- Shallow (`/health`): process is up, cached vault + DB status, ≤30 s TTL. This is what the
  Docker healthcheck polls.
- Deep (`/health?deep=1`): actually round-trips Key Vault and the DB. Rate-limit it. This is
  what you show a grader.

**#10 CI config mode — accepted, and build it in Phase 3, not Phase 11.** Three modes:
`production` (Key Vault mandatory, boot-fail without it), `development` (`.env` fallback),
`test` (fake secrets injected, Postgres service container in the GitHub Actions workflow, Key
Vault never contacted). Retrofitting this in Phase 11 would mean touching every module.

**#11 FinderAI schedule — agreed, and I'm sending the email today.** Target dates I'm proposing
to them: contract frozen **Fri 28 Aug**, keys exchanged **Fri 4 Sep**, joint end-to-end test
**Wed 16 Sep** — one week before the deadline. Build the mock now; the real client is a
config + parser swap.

**#12 Personal tenant political risk — agreed, and this is the sharpest thing you've raised.**
I'm asking the professor in writing whether a personal tenant is acceptable as a fallback, so
the answer exists on record either way. Build the code so the tenant is pure config regardless.

**#13 SendGrid to `@au.edu` — accepted, and moved earlier.** Don't wait for Phase 8. As soon as
the SendGrid account exists, send one test message to a real `@au.edu` address and confirm it
lands. If AU's mail server drops unauthenticated senders, I need to know in August, not the
night before recording. Fallback: demo to a personal address and document the AU rejection.

**#14 Team contribution — my call, noted here so you can plan around it.** All three of us
commit to the one repo under our own GitHub accounts. Rough split: I take auth/Key
Vault/deploy, Badin takes rooms + reservations, Warachai takes Gemini + SendGrid + docs. Use
`Co-authored-by:` trailers when work is genuinely paired.

**#15 demo.sh as the video script — accepted.** Write it in grading-checklist order with a
printed section header before each step, so the recording is just "run it and narrate."
Pre-stage the Key Vault boot-failure demo (a second compose file with a bad vault URL) and both
peer-API directions so neither needs live improvisation.

---

## What's actually blocking

Nothing technical. Phase 1 is clear to start.

The only real blockers are two emails (professor, FinderAI) which I'm sending today, and the
nginx config paste in #3 above, which I'll get you before Phase 12 — not needed for Phase 1.

**Go ahead and draft the Phase 1 scaffold plan for review.** Reflect the single-container prod
compose and the three-mode config from #10 in that plan.
