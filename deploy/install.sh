#!/usr/bin/env bash
# One-shot setup for an Ubuntu/Debian VPS.
#   sudo ./install.sh read.example.com     first install
#   sudo ./install.sh lock                 turn off new sign-ups
#   sudo ./install.sh update               pull new images and restart
#   sudo ./install.sh proxy [port]         run behind an existing web server
#   sudo ./install.sh tunnel <token|off>   serve through Cloudflare Tunnel
#   sudo ./install.sh autoupdate [off]     update by itself after each merge
#   sudo ./install.sh backup [now|off]     back up every night (on by default)
#   sudo ./install.sh reset-password       choose a new password for an account
set -euo pipefail
cd "$(dirname "$0")"

compose() { docker compose "$@"; }

secret() { openssl rand -hex 24; }

ensure_docker() {
  if ! command -v docker >/dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker
}

ensure_swap() {
  # Content fetching runs a headless browser; give small servers headroom.
  local mem_mb
  mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  if [ "$mem_mb" -lt 6000 ] && ! swapon --show | grep -q .; then
    echo "Adding a 4 GB swap file (RAM is ${mem_mb} MB)..."
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

open_firewall() {
  if command -v ufw >/dev/null && ufw status | grep -q active; then
    ufw allow 80/tcp
    ufw allow 443
  fi
}

write_env() {
  local domain=$1
  if [ -f .env ]; then
    echo ".env already exists, keeping it."
    return
  fi
  local pg_root pg_app minio fetch
  pg_root=$(secret); pg_app=$(secret); minio=$(secret); fetch=$(secret)
  sed -e "s/__DOMAIN__/${domain}/g" \
      -e "s/__PG_ROOT_PASSWORD__/${pg_root}/g" \
      -e "s/__PG_APP_PASSWORD__/${pg_app}/g" \
      -e "s/__MINIO_SECRET__/${minio}/g" \
      -e "s/__CONTENT_FETCH_TOKEN__/${fetch}/g" \
      -e "s/__IMAGE_PROXY_SECRET__/$(secret)/g" \
      -e "s/__JWT_SECRET__/$(secret)/g" \
      -e "s/__SSO_JWT_SECRET__/$(secret)/g" \
      -e "s/__WATCHER_API_KEY__/$(secret)/g" \
      env.template > .env
  chmod 600 .env
}

# Copies settings that were added to env.template after .env was written,
# such as the Stash API image or the queue's Redis address.
add_new_images() {
  local line
  [ -n "$(tail -c1 .env)" ] && echo >> .env
  grep -E '^([A-Z_]+_IMAGE|MQ_REDIS_URL)=' env.template | while read -r line; do
    if ! grep -q "^${line%%=*}=" .env; then
      echo "Adding ${line} to .env"
      echo "$line" >> .env
    fi
  done
}

# Each update leaves the previous images behind, and on a small disk they
# soon fill it. Remove every image no container uses. The build cache is
# kept, so the database migration image doesn't rebuild from scratch.
prune_images() {
  docker image prune -af >/dev/null
  # Keep the last few days of build cache so rebuilds stay quick, drop the rest.
  docker builder prune -af --filter until=72h >/dev/null
  journalctl --vacuum-size=200M >/dev/null 2>&1 || true
}

# Runs auto-update.sh every five minutes, so merges reach the server
# without anyone logging in.
setup_autoupdate() {
  if [ "${1:-}" = off ]; then
    systemctl disable --now stash-update.timer 2>/dev/null || true
    rm -f /etc/systemd/system/stash-update.service \
          /etc/systemd/system/stash-update.timer
    systemctl daemon-reload
    echo "Automatic updates are off."
    return
  fi
  cat > /etc/systemd/system/stash-update.service <<UNIT
[Unit]
Description=Update Stash when a new version is published
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=$(pwd)/auto-update.sh
UNIT
  cat > /etc/systemd/system/stash-update.timer <<UNIT
[Unit]
Description=Check for a new Stash version every five minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now stash-update.timer
  echo "Automatic updates are on. Stash now checks for a new version every"
  echo "five minutes. See what it did with: journalctl -u stash-update"
}

# Runs backup.sh every night. `update` turns this on by itself unless it
# was switched off, so servers that update automatically get backups too.
BACKUP_OFF_MARKER=/etc/stash-backup-off

setup_backup() {
  if [ "${1:-}" = off ]; then
    systemctl disable --now stash-backup.timer 2>/dev/null || true
    rm -f /etc/systemd/system/stash-backup.service \
          /etc/systemd/system/stash-backup.timer
    systemctl daemon-reload
    touch "$BACKUP_OFF_MARKER"
    echo "Nightly backups are off."
    return
  fi
  rm -f "$BACKUP_OFF_MARKER"
  cat > /etc/systemd/system/stash-backup.service <<UNIT
[Unit]
Description=Back up the Stash database and stored files
After=docker.service

[Service]
Type=oneshot
Nice=10
IOSchedulingClass=idle
ExecStart=$(pwd)/backup.sh
UNIT
  cat > /etc/systemd/system/stash-backup.timer <<UNIT
[Unit]
Description=Back up Stash every night

[Timer]
OnCalendar=*-*-* 03:30
RandomizedDelaySec=20min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
  systemctl daemon-reload
  systemctl enable --now stash-backup.timer
  echo "Nightly backups are on. They are saved in /var/backups/stash."
  echo "See the last one with: journalctl -u stash-backup"
}

# Where backup.sh puts a second copy of each backup (see backup.sh).
setup_backup_copy() {
  local folder=${1:-}
  if [ -z "$folder" ]; then
    echo "Usage: sudo ./install.sh backup copy-to <folder>   (or: copy-to off)" >&2
    exit 1
  fi
  if [ "$folder" = off ]; then
    rm -f /etc/stash-backup-copy-to
    echo "Backups are no longer copied anywhere else."
    return
  fi
  mkdir -p "$folder"
  if [ "$(realpath "$folder")" = "$(realpath -m "${STASH_BACKUP_DIR:-/var/backups/stash}")" ]; then
    echo "Pick a folder other than the backup folder itself." >&2
    exit 1
  fi
  printf '%s\n' "$folder" > /etc/stash-backup-copy-to
  echo "Each nightly backup will also be copied to $folder."
  echo "Copy the newest one there now with: sudo ./install.sh backup now"
}

ensure_backup() {
  if [ ! -e "$BACKUP_OFF_MARKER" ] &&
     [ ! -e /etc/systemd/system/stash-backup.timer ]; then
    setup_backup
  fi
}

reset_password() {
  local email pw pw2 hash found
  sql() { compose exec -T postgres psql -U postgres -d omnivore -qtA "$@"; }

  echo "Accounts on this server:"
  sql -c "select email from omnivore.user where status <> 'DELETED' order by created_at" | sed 's/^/  /'
  read -rp "Email of the account to reset: " email
  found=$(printf "select count(*) from omnivore.user where lower(email) = lower(:'e');" | sql -v e="$email")
  if [ "$found" != "1" ]; then
    echo "No account with that email." >&2
    exit 1
  fi

  read -rsp "New password (nothing shows as you type): " pw; echo
  read -rsp "Same password again: " pw2; echo
  if [ "$pw" != "$pw2" ]; then
    echo "The two passwords didn't match. Nothing was changed." >&2
    exit 1
  fi
  if [ "${#pw}" -lt 8 ]; then
    echo "Use at least 8 characters. Nothing was changed." >&2
    exit 1
  fi

  # Hash with the same bcrypt library the API uses. The password goes in on
  # stdin so it never shows up in the process list or shell history.
  hash=$(printf '%s' "$pw" | compose exec -T -w /app/packages/api api node -e \
    "let p='';process.stdin.on('data',d=>p+=d).on('end',()=>require('bcryptjs').hash(p,10).then(h=>console.log(h)))")
  unset pw pw2
  case "$hash" in
    '$2'*) ;;
    *) echo "Couldn't set the password. Is Stash running?" >&2; exit 1 ;;
  esac

  # Same change the app's own reset-password flow makes.
  printf "update omnivore.user set password = :'h', source = 'EMAIL' where lower(email) = lower(:'e');" |
    sql -v h="$hash" -v e="$email" >/dev/null
  echo "Done. Sign in at https://$(grep '^DOMAIN=' .env | cut -d= -f2) with your new password."
}

# Serves Stash through Cloudflare Tunnel, so it needs no VPS, open port or
# HTTPS certificate of its own. Caddy keeps answering on 127.0.0.1 (for the
# watchdog and local checks) and the tunnel carries the public traffic.
setup_tunnel() {
  local token=$1 files
  files=$(grep '^COMPOSE_FILE=' .env | cut -d= -f2)
  files=${files:-docker-compose.yml}
  if [ -z "$token" ]; then
    echo "Usage: sudo ./install.sh tunnel <token>   (or: tunnel off)" >&2
    echo "The token is on the tunnel's page in the Cloudflare dashboard." >&2
    exit 1
  fi
  sed -i '/^COMPOSE_FILE=/d; /^TUNNEL_TOKEN=/d' .env
  if [ "$token" = off ]; then
    files=$(echo "$files" | sed 's/:docker-compose.tunnel.yml//g')
    echo "COMPOSE_FILE=${files}" >> .env
    compose up -d --remove-orphans
    echo "Cloudflare Tunnel is off."
    return
  fi
  # Behind the tunnel Caddy serves plain HTTP on localhost, as in proxy mode.
  case ":$files:" in *:docker-compose.proxy.yml:*) ;; *) files="$files:docker-compose.proxy.yml" ;; esac
  case ":$files:" in *:docker-compose.tunnel.yml:*) ;; *) files="$files:docker-compose.tunnel.yml" ;; esac
  grep -q '^CADDY_SITE=' .env || echo "CADDY_SITE=:80" >> .env
  {
    echo "COMPOSE_FILE=${files}"
    echo "TUNNEL_TOKEN=${token}"
  } >> .env
  compose up -d --remove-orphans
  echo
  echo "Cloudflare Tunnel is on. In the Cloudflare dashboard, give the tunnel the"
  echo "public hostname $(grep '^DOMAIN=' .env | cut -d= -f2) with service http://caddy:80."
}

case "${1:-}" in
  reset-password)
    reset_password
    ;;
  backup)
    case "${2:-}" in
      now) ./backup.sh ;;
      copy-to) setup_backup_copy "${3:-}" ;;
      *) setup_backup "${2:-}" ;;
    esac
    ;;
  autoupdate)
    setup_autoupdate "${2:-}"
    ;;
  lock)
    sed -i 's/^ENABLE_EMAIL_SIGNUP=.*/ENABLE_EMAIL_SIGNUP=false/' .env
    compose up -d --force-recreate api web
    echo "Sign-ups are now closed."
    ;;
  proxy)
    port=${2:-8088}
    sed -i '/^COMPOSE_FILE=/d; /^CADDY_SITE=/d; /^STASH_PORT=/d' .env
    {
      echo "COMPOSE_FILE=docker-compose.yml:docker-compose.proxy.yml"
      echo "CADDY_SITE=:80"
      echo "STASH_PORT=${port}"
    } >> .env
    compose up -d --remove-orphans
    echo
    echo "Stash is listening on http://127.0.0.1:${port}."
    echo "Point your existing web server's $(grep '^DOMAIN=' .env | cut -d= -f2) site at it."
    ;;
  tunnel)
    setup_tunnel "${2:-}"
    ;;
  update)
    git -C .. pull --ff-only
    add_new_images
    prune_images
    compose pull
    compose up -d --build
    prune_images
    ensure_backup
    ./status.sh update full
    ;;
  ""|-h|--help)
    sed -n 2,10p "$0"
    exit 1
    ;;
  *)
    domain=$1
    ensure_docker
    ensure_swap
    open_firewall
    write_env "$domain"
    compose pull --ignore-buildable
    compose up -d --build
    ensure_backup
    echo
    echo "Done. Open https://${domain} and create your account,"
    echo "then run: sudo ./install.sh lock"
    ;;
esac
