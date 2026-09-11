#!/usr/bin/env bash
# One-time Azure VM prep for SpaceReserve. Run ONCE, as a sudo-capable user,
# before the first ./deploy.sh. Idempotent — safe to re-run.
#
# What it does NOT touch: nginx or the SSL cert (both set up separately via
# certbot — see DEPLOY.md). The SpaceReserve nginx config is added by hand —
# see nginx/spacereserve.conf and DEPLOY.md.
set -euo pipefail

log()  { printf '[vm-prereqs] %s\n' "$1"; }
fail() { printf '[vm-prereqs] ERROR: %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -ne 0 ] || fail "run as a normal user with sudo, not as root directly"
command -v sudo >/dev/null 2>&1 || fail "sudo not available"

# --- 1. Swap: 1 GB -> 4 GB (project rule) ------------------------
current_swap_kb=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
if [ "${current_swap_kb:-0}" -lt 3800000 ]; then
  log "swap is $((current_swap_kb / 1024)) MB — growing to 4 GB"
  sudo swapoff -a || true
  sudo rm -f /swapfile
  sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  log "swap now $(awk '/SwapTotal/ {print $2/1024}' /proc/meminfo) MB"
else
  log "swap already >= 4 GB — skipping"
fi

# --- 2. Docker Engine + compose v2 plugin --------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  log "docker + compose v2 already installed — skipping"
else
  log "installing docker engine + compose plugin"
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  log "added $USER to the docker group — log out and back in for it to take effect"
fi

# --- 3. UFW: 22 / 80 / 443 only (docs/architecture.md) ------------------
if command -v ufw >/dev/null 2>&1; then
  log "configuring UFW (allow 22, 80, 443 before enabling — never the reverse)"
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  sudo ufw status verbose
else
  log "ufw not installed — skipping (install with: sudo apt-get install -y ufw)"
fi

log "done. Next: cp .env.prod.example .env, fill it in, add the nginx block (DEPLOY.md), then ./deploy.sh"
