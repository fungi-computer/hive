#!/usr/bin/env bash
set -euo pipefail
expected_pin=${1:?exact reviewed joined pin required}
test "$(git rev-parse HEAD)" = "$expected_pin"
test -z "$(git status --porcelain --untracked-files=no)"
out=.botanical/physical-completion/qualification-v2
mkdir "$out"
stage=admission
trap 'result=$?; printf "%s\n" "pin=$expected_pin stage=$stage exit=$result" > "$out/status.txt"' EXIT
stage=physical-laws
node --test src/physical-completion.test.js > "$out/laws.log" 2>&1
stage=strict-app-types
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck false > "$out/types.log" 2>&1
stage=diff
git diff --check > "$out/diff.log" 2>&1
stage=fallow
/tmp/botanical-release-gate-OXPQyw/node_modules/.pnpm/@fallow-cli+linux-x64-gnu@3.20.0/node_modules/@fallow-cli/linux-x64-gnu/fallow audit --base 5052b46 --root "$PWD" --format json --threads 2 --output-file "$out/fallow.json" > "$out/fallow.log" 2>&1
stage=complete
