#!/usr/bin/env bash
# One-shot setup for an Ubuntu/Debian VPS.
#   sudo ./install.sh read.example.com     first install
#   sudo ./install.sh lock                 turn off new sign-ups
#   sudo ./install.sh update               pull new images and restart
#   sudo ./install.sh proxy [port]         run behind an existing web server
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

case "${1:-}" in
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
    compose pull
    compose up -d --build
    ;;
  ""|-h|--help)
    sed -n 2,6p "$0"
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
    echo
    echo "Done. Open https://${domain} and create your account,"
    echo "then run: sudo ./install.sh lock"
    ;;
esac
