#!/usr/bin/env bash
# Run every few minutes by the stash-update timer (sudo ./install.sh autoupdate).
# Applies new commits on main and newly built Stash images, and does nothing
# when there are neither.
set -euo pipefail
cd "$(dirname "$0")"

before=$(git -C .. rev-parse HEAD)
git -C .. pull --ff-only -q
if [ "$(git -C .. rev-parse HEAD)" != "$before" ]; then
  echo "New commits on main, running a full update."
  exec ./install.sh update
fi

# The images GitHub builds for Stash, by the container that runs each one.
image() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '"'; }
stale=no
for pair in reader-web:WEB_IMAGE reader-api:API_IMAGE reader-queue-processor:QUEUE_IMAGE; do
  name=$(image "${pair#*:}")
  [ -n "$name" ] || continue
  docker pull -q "$name" >/dev/null
  running=$(docker inspect -f '{{.Image}}' "${pair%%:*}" 2>/dev/null || true)
  if [ "$running" != "$(docker image inspect -f '{{.Id}}' "$name")" ]; then
    stale=yes
  fi
done

if [ "$stale" = yes ]; then
  echo "New Stash images, restarting the services that use them."
  docker compose up -d
fi
