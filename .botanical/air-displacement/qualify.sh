#!/usr/bin/env bash
set -euo pipefail
expected_pin=${1:?exact joined reviewed pin required}
test "$(git rev-parse HEAD)" = "$expected_pin"
test -z "$(git status --porcelain --untracked-files=no)"
out=.botanical/air-displacement/qualification-v1
mkdir "$out"
stage=admission
trap 'result=$?; printf "%s\n" "pin=$expected_pin stage=$stage exit=$result" > "$out/status.txt"' EXIT
stage=air-laws
node --test src/engine/environment/air/air.test.js src/engine/environment/air/displacement.test.js > "$out/laws.log" 2>&1
stage=shared-field-arithmetic
node --test --test-name-pattern='^(boundary arithmetic rejects a failed second half while exactly represented tiny stock is legal|deepening remaps the same finite water identity and exports only the removed soil stock)$' src/engine/environment/soil/field-exchange.test.js src/engine/environment/soil/sealed-floor.test.js > "$out/field.log" 2>&1
stage=compact-vent-event
node --test --test-name-pattern='^vent events are bounded committed physical summaries with exact replay$' src/world-presets/brewhouse-air/region.test.js > "$out/event.log" 2>&1
stage=strict-air-types
node node_modules/typescript/bin/tsc --project src/engine/environment/air/types/tsconfig.json > "$out/air-types.log" 2>&1
stage=strict-app-types
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck false > "$out/app-types.log" 2>&1
stage=diff
git diff --check > "$out/diff.log" 2>&1
stage=fallow
/tmp/botanical-release-gate-OXPQyw/node_modules/.pnpm/@fallow-cli+linux-x64-gnu@3.20.0/node_modules/@fallow-cli/linux-x64-gnu/fallow audit --base 74e2821 --root "$PWD" --format json --threads 2 --output-file "$out/fallow.json" > "$out/fallow.log" 2>&1
stage=complete
