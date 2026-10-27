#!/bin/bash
# Sets up the Stash watchdog on the Mac that runs Stash's OrbStack machine.
# Run it in the Mac's own Terminal (not inside the machine):
#
#   orb -m stash cat /opt/stash/deploy/mac/install-watchdog.sh | bash
#   orb -m stash cat /opt/stash/deploy/mac/install-watchdog.sh | bash -s off
#
# The watchdog runs every five minutes and when you log in; its log is
# ~/Library/Logs/stash-watchdog.log.
set -euo pipefail

LABEL=com.stash.watchdog
DIR="$HOME/Library/Application Support/Stash"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
export PATH="$HOME/.orbstack/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

launchctl bootout "gui/$(id -u)/$LABEL" 2> /dev/null || true

if [ "${1:-}" = "off" ]; then
  rm -f "$PLIST"
  echo "Stash watchdog turned off."
  exit 0
fi

# A copy on the Mac, so the watchdog still runs while the machine is stopped.
mkdir -p "$DIR" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
orb -m "${STASH_MACHINE:-stash}" cat /opt/stash/deploy/mac/stash-watchdog.sh > "$DIR/stash-watchdog.sh"
chmod 755 "$DIR/stash-watchdog.sh"

cat > "$PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$DIR/stash-watchdog.sh</string></array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/stash-watchdog.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Stash watchdog is on: it checks Stash every five minutes."
echo "Log: ~/Library/Logs/stash-watchdog.log"
