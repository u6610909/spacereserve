# Deploying SpaceReserve

The code is deploy-ready. This is the checklist for the first real deploy —
create the Azure resources, plug the values in, run two scripts.

Target VM (per docs/architecture.md): `azureuser@172.197.163.99`,
domain `spacereserve.malaysiawest.cloudapp.azure.com`, app on port 4000
(loopback-only). Malaysia West, not East Asia — Gemini's API blocks requests
from Hong Kong/East Asia, so the VM lives in a region it doesn't block. This
VM is dedicated to SpaceReserve; nothing else runs on it.

---

## Part A — Azure resources to create

### 1. Azure Database for PostgreSQL — Flexible Server

Not a container (the 1 GiB VM can't fit one — docs/architecture.md). Free tier
(B1ms, 12 months) is enough. Can live in a different region than the VM.

- Firewall: allow **only** the VM's public IP `172.197.163.99`. Not `0.0.0.0/0`.
- Create a database (e.g. `spacereserve`).
- Build the connection string with `?sslmode=require`:
  `postgresql://<user>:<pass>@<server>.postgres.database.azure.com:5432/spacereserve?sslmode=require`
- This string goes into **Key Vault** as `SpaceReserve-DatabaseUrl` (step 3),
  never into a file on the VM.

### 2. App registration — Key Vault access (machine identity)

Azure portal → Microsoft Entra ID → App registrations → New registration.
This one lets the *app* authenticate to Key Vault — it is not the login one.

- Certificates & secrets → New client secret → copy the **value** now (shown once).
- Note the **Application (client) ID** and **Directory (tenant) ID** from Overview.
- On the Key Vault → Access control (IAM) → Add role assignment →
  **Key Vault Secrets User** → assign to this app registration.

### 3. Key Vault

Azure portal → Key Vault → Create. Copy the **Vault URI** from Overview.
Add these secrets (Secrets → Generate/Import):

| Secret name | Value |
|---|---|
| `SpaceReserve-DatabaseUrl` | the Postgres connection string from step 1 |
| `SpaceReserve-JwtSecret` | any long random string (`openssl rand -hex 32`) — also signs cookies |
| `SpaceReserve-AdClientId` | client id of the **login** app registration (step 4) |
| `SpaceReserve-AdClientSecret` | client secret of the login app registration |
| `SpaceReserve-GeminiApiKey` | Google AI Studio key — real key in prod; search degrades gracefully without it |
| `SpaceReserve-SendGridApiKey` | SendGrid key — or a placeholder; email failures are logged, bookings still succeed |
| `SpaceReserve-FinderAIApiKey` | the key FinderAI issues us — placeholder until their contract lands |
| `SpaceReserve-PeerApiKeyHash` | SHA-256 hash of the key we issue FinderAI — `seed.ts` reads this on a fresh DB |

Every secret must exist (even as a placeholder) or the app refuses to boot —
that refusal is intentional.

### 4. App registration — `@au.edu` login (OIDC)

A **second** app registration, separate from step 2. Must live in a tenant
`@au.edu` accounts can sign into (AU's tenant is
`c1f3dc23-b7f8-48d3-9b5d-2b12f158f01f`; a personal tenant with seeded
member users works until AU issues one — see docs/architecture.md "Settled design
decisions").

- Authentication → Add a platform → Web → Redirect URI:
  `https://spacereserve.malaysiawest.cloudapp.azure.com/spacereserve/api/v1/auth/callback`
- Certificates & secrets → New client secret.
- API permissions → Microsoft Graph → delegated: `openid`, `profile`, `email` → Grant admin consent.
- Put its client id / secret into Key Vault as `SpaceReserve-AdClientId` / `SpaceReserve-AdClientSecret` (step 3).
- Set `AD_TENANT_ID` in the deploy `.env` if the tenant isn't AU's default —
  see `backend/src/config/index.ts`.

### 5. Make the GHCR package public

GitHub → repo → Packages → `spacereserve` → Package settings → Change
visibility → Public. Then `docker compose pull` needs no login on the VM
(docs/architecture.md).

---

## Part B — First deploy (on the VM)

```bash
ssh azureuser@172.197.163.99

# one-time VM prep: swap 1→4 GB, install Docker + compose, UFW 22/80/443
cd ~/CSX4110/spacereserve   # or wherever the repo is cloned
bash backend/scripts/vm-prereqs.sh
# log out / back in so the docker group applies, then re-ssh

cd ~/CSX4110/spacereserve/backend
cp .env.prod.example .env
nano .env                    # fill AZURE_TENANT_ID / CLIENT_ID / CLIENT_SECRET / KEY_VAULT_URL

./deploy.sh                  # pulls image, runs migrations, starts, waits for health
```

### Nginx (do this once, by hand)

`sudo apt-get install -y nginx`, then `certbot --nginx -d spacereserve.malaysiawest.cloudapp.azure.com
--non-interactive --agree-tos -m <email> --redirect` — certbot writes the SSL
`server { }` block and the 80→443 redirect for you. Add the `location` blocks
from [nginx/spacereserve.conf](nginx/spacereserve.conf) (API/uploads proxy +
static frontend `try_files`) inside the 443 server block it created.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## Part C — Every deploy after that

CI builds and pushes `ghcr.io/u6610909/spacereserve:latest` (and `:<sha>`)
on every push to `main`. On the VM:

```bash
cd ~/CSX4110/spacereserve && git pull
cd backend && ./deploy.sh
```

Deploy a specific build or roll back:

```bash
IMAGE=ghcr.io/u6610909/spacereserve:<sha> ./deploy.sh
```

`deploy.sh` auto-rolls-back to the previous image if the new one fails its
health check.

Frontend redeploy (separate from the backend, static files only) — see
[../frontend/README.md](../frontend/README.md).

---

## Part D — Verify (every time — project rule)

```bash
curl -s https://spacereserve.malaysiawest.cloudapp.azure.com/spacereserve/api/v1/health
curl -s https://spacereserve.malaysiawest.cloudapp.azure.com/spacereserve/ | head -c 200
```

Both must answer. `/health` should report `"keyVault":"ok"` — if it says
`"down"`, the service principal or the vault URL is wrong.
