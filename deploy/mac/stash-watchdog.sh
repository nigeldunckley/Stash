#!/bin/bash
# Run every five minutes on the Mac mini by a LaunchAgent (see
# install-watchdog.sh). Keeps Stash's OrbStack machine running and repairs
# the two things that came back broken after it stopped: Tailscale, which
# the VPS reaches Stash through, and name lookups, which feeds, pictures
# and videos need.
set -uo pipefail

MACHINE=${STASH_MACHINE:-stash}
LOG="$HOME/Library/Logs/stash-watchdog.log"
export PATH="$HOME/.orbstack/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# Keep the log short.
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 2000 ]; then
  tail -n 1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

if ! command -v orb > /dev/null; then
  log "orb not found; is OrbStack installed?"
  exit 1
fi

# 1. The machine itself. orb starts OrbStack too if it isn't running.
state=$(orb list 2> /dev/null | awk -v m="$MACHINE" '$1 == m { print $2 }')
if [ "$state" != "running" ]; then
  log "machine $MACHINE was ${state:-not listed}; starting it"
  orb start "$MACHINE" >> "$LOG" 2>&1 || log "orb start $MACHINE failed"
  sleep 30
fi

# 2-4 run inside the machine as root; each prints a line only when it
# repaired something.
orb -m "$MACHINE" sudo sh -s << 'INSIDE' 2>&1 | while read -r line; do log "$line"; done
# An update in progress restarts things itself; leave it alone.
systemctl is-active --quiet stash-update && exit 0

# 2. Name lookups. Tailscale's MagicDNS (100.100.100.100) stopped answering
#    once and every feed and picture failed, so use public resolvers.
if ! getent hosts github.com > /dev/null 2>&1; then
  tailscale set --accept-dns=false > /dev/null 2>&1
  printf 'nameserver 1.1.1.1\nnameserver 8.8.8.8\n' > /etc/resolv.conf
  systemctl restart docker
  echo "name lookups were failing; reset resolvers and restarted Docker"
  sleep 30
fi

# 3. Tailscale: the VPS forwards stash.nigeldunckley.com to this machine's
#    Tailscale address.
if command -v tailscale > /dev/null &&
  ! tailscale status --json 2> /dev/null | grep -q '"BackendState": *"Running"'; then
  systemctl restart tailscaled
  echo "Tailscale was not running; restarted tailscaled"
fi

# 4. Stash itself answers on 8088.
code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -X POST \
  -H 'content-type: application/json' -d '{"query":"{__typename}"}' \
  http://127.0.0.1:8088/api/graphql)
if [ "$code" != "200" ]; then
  cd /opt/stash/deploy && docker compose up -d > /dev/null 2>&1
  echo "Stash answered $code; ran docker compose up -d"
fi
INSIDE
