#!/usr/bin/env bash
set -euo pipefail
for source in finite-gas.mjs momentum.mjs projection.mjs geometry-owner.mjs energy-diagnostics.mjs qualify.mjs; do
  node --check "$source"
done
/home/levi/src/Botanical-next/node_modules/.bin/fallow --no-cache --format json --output-file fallow-v1.json
