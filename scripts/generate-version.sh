#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BASE_FILE="$ROOT_DIR/public/version.base.json"
OUT_FILE="$ROOT_DIR/public/version.js"

if [ ! -f "$BASE_FILE" ]; then
    echo "Missing version base file: $BASE_FILE" >&2
    exit 1
fi

APP_VERSION="$(python3 - <<'PY' "$BASE_FILE"
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    data = json.load(f)

version = str(data.get('appVersion', '')).strip()
if not version:
    raise SystemExit('appVersion is missing in version.base.json')

print(version)
PY
)"

RAW_SHA="${CF_PAGES_COMMIT_SHA:-${GITHUB_SHA:-local}}"
SHORT_SHA="${RAW_SHA:0:7}"
DATE_UTC="$(date -u +%F)"
BUILD_ID="${BUILD_ID_OVERRIDE:-$DATE_UTC.$SHORT_SHA}"

cat > "$OUT_FILE" <<EOF
window.APP_VERSION = '$APP_VERSION';
window.BUILD_ID = '$BUILD_ID';
EOF

echo "Generated public/version.js with APP_VERSION=$APP_VERSION BUILD_ID=$BUILD_ID"
