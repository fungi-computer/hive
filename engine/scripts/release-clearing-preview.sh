#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "usage: $0" >&2
  echo "Clearing previews are always released as a coherent frontend/backend pair." >&2
  exit 64
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

credential_file="/home/levi/src/Botanical-next/.botanical/credentials/cloudflare.env"
backend_origin="https://hive-public-engine-demo.levi-fe0.workers.dev"
source_sha="$(git rev-parse HEAD)"
source_short="$(git rev-parse --short=8 HEAD)"
preview_alias="clearing-$source_short"
client_origin="https://$preview_alias-fungi-goblin-bnb.levi-fe0.workers.dev"
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
printf '%s\n' "coherent-pair" > "$receipt_dir/mode.txt"

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

# Publish to a source-named alias first. It is a new, unannounced origin, so the
# old coherent pair remains usable until this entire release has passed.
./node_modules/.bin/wrangler versions upload \
  --preview-alias "$preview_alias" \
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

# Static parity alone can still leave a beautiful, disconnected placeholder.
# Prove that this exact browser origin can create and observe a real Colony world.
node engine/scripts/verify-clearing-pair.mjs \
  "$alias_origin" "$backend_origin" "$receipt_dir/pair-readback.json"

cat > "$receipt_dir/RESULT.md" <<EOF
# Clearing release

- source: \`$source_sha\`
- mode: \`coherent-pair\`
- immutable client: <$immutable_origin>
- public client: <$alias_origin/engine/colony?game=colony>
- backend: <$backend_origin>
- artifact inventory: \`dist-sha256.txt\`
- immutable readback: \`immutable-readback.json\`
- alias readback: \`alias-readback.json\`
- live pair readback: \`pair-readback.json\`

Both full static readbacks and the live Colony join/observe check completed successfully.
EOF

echo "Clearing release verified: $receipt_dir"
