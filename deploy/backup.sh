#!/usr/bin/env bash
# Run nightly by the stash-backup timer (sudo ./install.sh backup).
# Saves the database, the stored files (PDFs and uploads) and the .env
# secrets into one dated folder, and keeps the newest few.
set -euo pipefail
shopt -s nullglob
cd "$(dirname "$0")"

BACKUP_DIR=${STASH_BACKUP_DIR:-/var/backups/stash}
KEEP_DB=${STASH_BACKUP_KEEP:-14}   # database copies are small, keep two weeks
KEEP_FILES=3                       # stored files can be large, keep three
BACKUP_COPY_FILE=/etc/stash-backup-copy-to
# The dated folder name each backup gets, e.g. 2026-10-09-033000.
STAMP='[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]'

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
stamp=$(date +%Y-%m-%d-%H%M%S)
dest="$BACKUP_DIR/$stamp"
mkdir "$dest"

# A failed step (often a full disk) must not leave a half-written file
# taking up space, or a folder that looks like a good backup.
cleanup() {
  if [ $? -ne 0 ]; then
    rm -f "$dest"/*.partial
    [ -f "$dest/database.dump" ] || rm -rf "$dest"
  fi
}
trap cleanup EXIT

# Write to a .partial file and rename it, so a failed run never leaves a
# truncated file that looks like a good backup.
echo "Backing up the database..."
docker exec reader-postgres pg_dump -U postgres -Fc omnivore \
  > "$dest/database.dump.partial"
mv "$dest/database.dump.partial" "$dest/database.dump"

cp .env "$dest/env"

# Only archive the stored files when they fit with 1 GB to spare. Their
# uncompressed size is the upper bound, since PDFs barely compress.
files_kb=$(docker run --rm --volumes-from reader-storage:ro alpine \
  du -sk /data | cut -f1)
free_kb=$(df --output=avail -k "$BACKUP_DIR" | tail -n1 | tr -dc 0-9)
if [ "$free_kb" -gt $((files_kb + 1024 * 1024)) ]; then
  echo "Backing up stored files..."
  docker run --rm --volumes-from reader-storage:ro alpine \
    tar czf - -C /data . > "$dest/files.tar.gz.partial"
  mv "$dest/files.tar.gz.partial" "$dest/files.tar.gz"
else
  echo "Not enough free disk space, skipping stored files this time."
fi

# Oldest first: drop database backups beyond KEEP_DB and file archives
# beyond KEEP_FILES.
prune() {
  local root=$1 keep=$2 pattern=$3
  find "$root" -mindepth 2 -maxdepth 2 -path "$root/$STAMP/$pattern" | sort -r |
    tail -n +"$((keep + 1))" | xargs -r -d '\n' rm -f
}
tidy() {
  local root=$1
  prune "$root" "$KEEP_DB" database.dump
  prune "$root" "$KEEP_FILES" files.tar.gz
  find "$root" -mindepth 2 -maxdepth 2 -path "$root/$STAMP/*.partial" -delete
  # Only touch dated backup folders, since the copy-to folder may hold
  # other things.
  find "$root" -mindepth 1 -maxdepth 1 -type d -name "$STAMP" -empty -delete
  for dir in "$root"/$STAMP/; do
    [ -f "$dir/database.dump" ] || rm -rf "$dir"
  done
}
tidy "$BACKUP_DIR"

echo "Backup saved to $dest ($(du -sh "$dest" | cut -f1))."

# A second copy somewhere else, such as an iCloud Drive folder on the Mac
# that runs Stash (sudo ./install.sh backup copy-to <folder>). A failed copy
# leaves the backup above in place but fails the run, so the log shows it.
# The folder must already exist: a missing one usually means a share that
# isn't mounted, and recreating it would quietly fill the local disk.
copy_to=$(cat "$BACKUP_COPY_FILE" 2>/dev/null || true)
if [ -n "$copy_to" ]; then
  if [ ! -d "$copy_to" ]; then
    echo "Couldn't copy the backup: $copy_to isn't there." >&2
    exit 1
  fi
  if [ "$(realpath "$copy_to")" = "$(realpath "$BACKUP_DIR")" ]; then
    echo "Couldn't copy the backup: $copy_to is the backup folder itself." >&2
    exit 1
  fi
  if cp -R "$dest" "$copy_to/"; then
    tidy "$copy_to"
    echo "Copied to $copy_to."
  else
    rm -rf "${copy_to:?}/$stamp"
    echo "Couldn't copy the backup to $copy_to." >&2
    exit 1
  fi
fi
