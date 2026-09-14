#!/usr/bin/env bash
set -euo pipefail

mode="${1:-all}"
case "$mode" in
  all|client) ;;
  *) echo "usage: $0 [all|client]" >&2; exit 64 ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

credential_file="/home/levi/src/Botanical-next/.botanical/credentials/cloudflare.env"
backend_origin="https://hive-public-engine-demo.levi-fe0.workers.dev"
client_origin="https://clearing-garden-fungi-goblin-bnb.levi-fe0.workers.dev"
source_sha="$(git rev-parse HEAD)"
source_short="$(git rev-parse --short=8 HEAD)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
receipt_dir="$repo_root/.botanical/clearing-releases/${stamp}-${source_short}"
backend_dir="$receipt_dir/backend"

if [[ ! -f "$credential_file" ]]; then
  echo "missing credential file: $credential_file" >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "refusing to release dirty tracked source" >&2
  git status --short >&2
  exit 1
fi
if [[ -z "$(git for-each-ref --format='%(refname)' --contains "$source_sha" refs/remotes/)" ]]; then
  echo "refusing to release $source_sha: commit is absent from remote-tracking branches" >&2
  exit 1
fi

mkdir -p "$receipt_dir"
printf '%s\n' "$source_sha" > "$receipt_dir/source-sha.txt"
printf '%s\n' "$mode" > "$receipt_dir/mode.txt"

export CI=1
export NO_COLOR=1

./node_modules/.bin/wrangler versions list \
  --config wrangler.jsonc \
  --env-file "$credential_file" \
  --json > "$receipt_dir/frontend-versions-before.json"

VITE_HIVE_PUBLIC_HOST="$backend_origin" \
  ./node_modules/.bin/vite build 2>&1 | tee "$receipt_dir/root-build.log"
VITE_HIVE_PUBLIC_HOST="$backend_origin" \
  ./node_modules/.bin/vite build --config engine/vite.config.js 2>&1 \
  | tee "$receipt_dir/engine-build.log"

test -f dist/engine/colony.html
find dist -type f -print0 | sort -z | xargs -0 sha256sum > "$receipt_dir/dist-sha256.txt"

if [[ "$mode" == "all" ]]; then
  node tools/public-engine-host/prepare.mjs "$backend_dir" "$client_origin" \
    2>&1 | tee "$receipt_dir/backend-prepare.log"
  ./node_modules/.bin/wrangler deployments status \
    --config "$backend_dir/wrangler.json" \
    --env-file "$credential_file" \
    --json > "$receipt_dir/backend-deployment-before.json"
  ./node_modules/.bin/wrangler deploy \
    --config "$backend_dir/wrangler.json" \
    --env-file "$credential_file" \
    2>&1 | tee "$receipt_dir/backend-deploy.log"
  if grep -Fq "No targets deployed" "$receipt_dir/backend-deploy.log"; then
    echo "backend deployment produced no target" >&2
    exit 1
  fi
fi

./node_modules/.bin/wrangler versions upload \
  --preview-alias clearing-garden \
  --config wrangler.jsonc \
  --env-file "$credential_file" \
  2>&1 | tee "$receipt_dir/frontend-upload.log"

immutable_origin="$(sed -nE 's|.*Version Preview URL: *(https://[^[:space:]]+).*|\1|p' "$receipt_dir/frontend-upload.log" | tail -1)"
alias_origin="$(sed -nE 's|.*Version Preview Alias URL: *(https://[^[:space:]]+).*|\1|p' "$receipt_dir/frontend-upload.log" | tail -1)"
if [[ -z "$immutable_origin" || -z "$alias_origin" ]]; then
  echo "Wrangler did not report both frontend preview URLs" >&2
  exit 1
fi
if [[ "$alias_origin" != "$client_origin" ]]; then
  echo "unexpected frontend alias: $alias_origin" >&2
  exit 1
fi
printf '%s\n' "$immutable_origin" > "$receipt_dir/immutable-origin.txt"
printf '%s\n' "$alias_origin" > "$receipt_dir/alias-origin.txt"

node engine/scripts/verify-static-preview.mjs \
  dist "$immutable_origin" "$receipt_dir/immutable-readback.json"
node engine/scripts/verify-static-preview.mjs \
  dist "$alias_origin" "$receipt_dir/alias-readback.json"

cat > "$receipt_dir/RESULT.md" <<EOF
# Clearing release

- source: \`$source_sha\`
- mode: \`$mode\`
- immutable client: <$immutable_origin>
- public client: <$alias_origin/engine/colony?game=colony>
- backend: <$backend_origin>
- artifact inventory: \`dist-sha256.txt\`
- immutable readback: \`immutable-readback.json\`
- alias readback: \`alias-readback.json\`

Both full static readbacks completed successfully.
EOF

echo "Clearing release verified: $receipt_dir"
