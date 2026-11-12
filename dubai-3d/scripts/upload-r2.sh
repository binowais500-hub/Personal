#!/usr/bin/env bash
# Upload public/tiles to a Cloudflare R2 bucket (needs `npx wrangler login` once).
#   bash scripts/upload-r2.sh <bucket> [prefix]      e.g. bash scripts/upload-r2.sh maps dubai
# Then build with VITE_TILES_BASE=https://<your-r2-public-domain>/<prefix>/ npm run build
# and give the bucket a CORS rule allowing GET/HEAD and the Range header (see README).
set -euo pipefail
cd "$(dirname "$0")/.."
BUCKET="$1"; PREFIX="${2:-dubai}"
find public/tiles -type f | while read -r f; do
  key="$PREFIX/${f#public/}"
  case "$f" in *.json) ct=application/json;; *.pmtiles) ct=application/octet-stream;; *) ct=application/octet-stream;; esac
  echo "-> $key"
  npx wrangler r2 object put "$BUCKET/$key" --file "$f" --content-type "$ct" --remote >/dev/null
done
