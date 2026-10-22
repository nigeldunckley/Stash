#!/usr/bin/env bash
# Run every few minutes by the stash-update timer (sudo ./install.sh autoupdate).
# Applies newly built Stash images, runs a full update when the server setup
# or database changes, and does nothing when there's nothing new.
set -euo pipefail
cd "$(dirname "$0")"

# The git pull below can rewrite this file while it runs. Bash reads a
# function whole before running it, so the run carries on unaffected.
main() {
  before=$(git -C .. rev-parse HEAD)
  git -C .. pull --ff-only -q
  # Most merges only change app code, which reaches the server as new images
  # below. Only server setup (deploy/) and database migrations (packages/db/)
  # need the slower full update, which pulls everything and rebuilds.
  if [ -n "$(git -C .. diff --name-only "$before" HEAD -- deploy packages/db)" ]; then
    echo "Server setup or database changes on main, running a full update."
    ./install.sh update
    ./status.sh check updated
    return
  fi

  # The images GitHub builds for Stash, by the container that runs each one.
  image() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '"'; }
  # Clear out unused images first so a full disk can't block the pull.
  docker image prune -af >/dev/null
  stale=no
  for pair in reader-web:WEB_IMAGE reader-api:API_IMAGE reader-queue-processor:QUEUE_IMAGE; do
    name=$(image "${pair#*:}")
    [ -n "$name" ] || continue
    # Intel-only images, so an Apple Silicon Mac pulls them for Rosetta.
    docker pull -q --platform linux/amd64 "$name" >/dev/null
    running=$(docker inspect -f '{{.Image}}' "${pair%%:*}" 2>/dev/null || true)
    if [ "$running" != "$(docker image inspect -f '{{.Id}}' "$name")" ]; then
      stale=yes
    fi
  done

  if [ "$stale" = yes ]; then
    echo "New Stash images, restarting the services that use them."
    docker compose up -d
    docker image prune -af >/dev/null
    ./status.sh update images
    ./status.sh check updated
  else
    ./status.sh check up-to-date
  fi
}

# A failed check shows in Settings > Developer as well as in the log.
trap '[ $? -eq 0 ] || ./status.sh check failed || true' EXIT
main; exit
