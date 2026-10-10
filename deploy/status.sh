#!/usr/bin/env bash
# Notes what an update did, for Settings > Developer in Stash. The web
# container reads the files in deploy/status.
#   ./status.sh check <up-to-date|updated|failed>   after each check
#   ./status.sh update <full|images>                when a new version went live
set -euo pipefail
cd "$(dirname "$0")"

json() { printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g'; }
log() { git -C .. log -1 --format="$1" 2>/dev/null || true; }

mkdir -p status
tmp=$(mktemp status/.next.XXXXXX)
printf '{"at":"%s","result":"%s","commit":"%s","subject":"%s","body":"%s","committedAt":"%s"}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(json "$2")" "$(log %H)" \
  "$(json "$(log %s)")" "$(json "$(log %b | sed '/^[[:space:]]*$/d' | head -n1)")" \
  "$(log %cI)" > "$tmp"
chmod 644 "$tmp"
mv "$tmp" "status/last-$1.json"
