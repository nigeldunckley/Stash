#!/usr/bin/env bash
# One-shot setup for an Ubuntu/Debian VPS.
#   sudo ./install.sh read.example.com     first install
#   sudo ./install.sh lock                 turn off new sign-ups
#   sudo ./install.sh update               pull new images and restart
#   sudo ./install.sh proxy [port]         run behind an existing web server
#   sudo ./install.sh autoupdate [off]     update by itself after each merge
#   sudo ./install.sh backup [now|off]     back up every night (on by default)
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

# Copies image settings that were added to env.template after .env was
# written, such as the Stash API image.
add_new_images() {
  local line
  [ -n "$(tail -c1 .env)" ] && echo >> .env
  grep -E '^[A-Z_]+_IMAGE=' env.template | while read -r line; do
    if ! grep -q "^${line%%=*}=" .env; then
      echo "Adding ${line} to .env"
      echo "$line" >> .env
    fi
  done
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

ensure_backup() {
  if [ ! -e "$BACKUP_OFF_MARKER" ] &&
     [ ! -e /etc/systemd/system/stash-backup.timer ]; then
    setup_backup
  fi
}

case "${1:-}" in
  backup)
    case "${2:-}" in
      now) ./backup.sh ;;
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
  update)
    git -C .. pull --ff-only
    add_new_images
    compose pull
    compose up -d --build
    ensure_backup
    ;;
  ""|-h|--help)
    sed -n 2,7p "$0"
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
