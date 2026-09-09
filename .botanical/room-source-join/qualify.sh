#!/usr/bin/env bash
set -euo pipefail
expected_pin=${1:?exact reviewed joined pin required}
test "$(git rev-parse HEAD)" = "$expected_pin"
test -z "$(git status --porcelain --untracked-files=no)"
out=.botanical/room-source-join/qualification-v1
mkdir "$out"
stage=admission
trap 'result=$?; printf "%s\n" "pin=$expected_pin stage=$stage exit=$result" > "$out/status.txt"' EXIT
stage=geometry-and-release-laws
node --test --test-concurrency=1 src/engine/world/physical-geometry.test.js src/structure-environment.test.js src/world-presets/brewhouse-air/generated-room-geometry.test.js src/engine/environment/finite-release.test.js > "$out/laws.log" 2>&1
stage=actual-region-callers
node --test --test-name-pattern '^(finite-source boundary|actual station wood|receipt failure rolls fuel)' src/world-presets/brewhouse-air/region.test.js > "$out/region.log" 2>&1
stage=strict-app-types
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck false > "$out/types.log" 2>&1
stage=diff
git diff --check > "$out/diff.log" 2>&1
stage=fallow
/tmp/botanical-release-gate-OXPQyw/node_modules/.pnpm/@fallow-cli+linux-x64-gnu@3.20.0/node_modules/@fallow-cli/linux-x64-gnu/fallow audit --base cf66f922 --root "$PWD" --format json --threads 2 --output-file "$out/fallow.json" > "$out/fallow.log" 2>&1
stage=complete
