#!/usr/bin/env bash
# Daily pg_dump of the Yggdrasil database into ~/yggdrasil-backups, keeping the newest 30.
# DATABASE_URL comes from the macOS Keychain item `yggdrasil-database-url` (see docs/deploy/README.md).
# A DATABASE_URL already in the environment wins, for manual runs and tests.
set -euo pipefail
umask 077

# launchd starts with a bare PATH; Homebrew libpq (pg_dump 17) lives here.
export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:$PATH"
dir="${YGGDRASIL_BACKUP_DIR:-$HOME/yggdrasil-backups}"
keep="${YGGDRASIL_BACKUP_KEEP:-30}"
url="${DATABASE_URL:-$(security find-generic-password -a "$(id -un)" -s yggdrasil-database-url -w)}"

mkdir -p "$dir"
out="$dir/yggdrasil-$(date +%Y%m%d-%H%M%S).dump"
trap 'rm -f "$out.tmp"' EXIT
# ponytail: URL (with password) is visible in `ps` while pg_dump runs; fine on a single-user Mac, move to ~/.pgpass if not.
# App data only: public + drizzle (migration journal). Supabase-managed schemas (auth, storage…) are skipped.
pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=drizzle --dbname="$url" --file="$out.tmp"
mv "$out.tmp" "$out"

# shellcheck disable=SC2012 # names are our own date-stamped files, no odd characters
ls -1t "$dir"/yggdrasil-*.dump | tail -n "+$((keep + 1))" | while IFS= read -r old; do rm -f -- "$old"; done
echo "$(date '+%F %T') backup ok: $out ($(du -h "$out" | cut -f1))"
