#!/bin/bash
# Test build: copies this folder (as it is now, saved or not) into a clone of SugarYummy/maplewordledev, adds dev.js to
# every page, and pushes it; it shows up at https://ima.moe/maplewordledev/ a minute later.
# Usage: tools/dev/build.sh <version> <clone folder>     e.g. tools/dev/build.sh 6.1 ../maplewordledev
# <version>: the NEXT one after the live site's newest changelog version (live alpha v6.0 -> test 6.1)
# The newest build is the whole site at the top. Every build's code (pages, scripts, styles, data) is also kept in
# b/<build>/ and listed in builds.json (newest first), so the version box can switch back to it; the site-proxy Worker
# fills in its images and sounds from the top.
set -e
VER="$1"; OUT="$2"
[ -n "$VER" ] && [ -d "$OUT/.git" ] || { echo "usage: $0 <version> <clone folder>"; exit 1; }
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="alphaTest v$VER.$(TZ=America/Los_Angeles date +%d%m%Y.%H%M%S)"
STAMP="${BUILD##* v}"
find "$OUT" -mindepth 1 -maxdepth 1 ! -name .git ! -name b ! -name builds.json -exec rm -rf {} +
(cd "$SRC" && git ls-files -co --exclude-standard | grep -Ev '^(tools/|admin\.html$|CHANGELOG\.md$|README\.md$)' | tar -cf - -T -) | tar -xf - -C "$OUT"
# dev.js must run, or the test pages act as the real site (real saves, real account): stop if it has a syntax error.
node --check "$SRC/tools/dev/dev.js" || { echo "tools/dev/dev.js has a syntax error: not uploaded"; exit 1; }
sed "s/__BUILD__/$BUILD/" "$SRC/tools/dev/dev.js" > "$OUT/dev.js"
for f in "$OUT"/*.html; do
  sed -i "0,/<head>/s||<head>\n<meta name=\"robots\" content=\"noindex, nofollow\">\n<script src=\"dev.js?b=$STAMP\"></script>|" "$f"
done
# This build's code, kept for later.
mkdir -p "$OUT/b/$STAMP"
(cd "$OUT" && find . -path ./.git -prune -o -path ./b -prune -o -path ./worker -prune -o -path ./builds.json -prune -o -type f -regextype posix-extended -regex '.*\.(html|js|css|json)$' -print | tar -cf - -T -) | tar -xf - -C "$OUT/b/$STAMP"
# Every older build gets this dev.js too (its own build number kept), so the lock screen and the rest stay the same everywhere.
for d in "$OUT"/b/*/; do
  s="$(basename "$d")"
  [ "$s" = "$STAMP" ] || sed "s/__BUILD__/alphaTest v$s/" "$SRC/tools/dev/dev.js" > "$d/dev.js"
done
python3 - "$OUT/builds.json" "$STAMP" <<'PY'
import json, sys, os
p, stamp = sys.argv[1], sys.argv[2]
builds = json.load(open(p)) if os.path.exists(p) else []
json.dump([stamp] + [b for b in builds if b != stamp], open(p, 'w'), indent=0)
PY
cd "$OUT"
git add -A
git commit -qm "$BUILD"
git push -q origin HEAD:main
echo "$BUILD"
