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
  local keep=$1 pattern=$2
  find "$BACKUP_DIR" -mindepth 2 -maxdepth 2 -name "$pattern" | sort -r |
    tail -n +"$((keep + 1))" | xargs -r rm -f
}
prune "$KEEP_DB" database.dump
prune "$KEEP_FILES" files.tar.gz
find "$BACKUP_DIR" -mindepth 2 -maxdepth 2 -name '*.partial' -delete
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -empty -delete
for dir in "$BACKUP_DIR"/*/; do
  [ -f "$dir/database.dump" ] || rm -rf "$dir"
done

echo "Backup saved to $dest ($(du -sh "$dest" | cut -f1))."
