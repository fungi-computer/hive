#!/usr/bin/env bash
set -euo pipefail
hive_root=/home/levi/src/hive
colony_output="$hive_root/.botanical/engine-do/colony-module-20260909"
source "$hive_root/.botanical/architecture-pass/libcolony-rebuild/emsdk-3.1.46/emsdk_env.sh"
em++ --version
em++ -s INITIAL_MEMORY=16777216 -s TOTAL_STACK=1048576 -s ALLOW_MEMORY_GROWTH=0 -s STACK_OVERFLOW_CHECK=2 -s MODULARIZE=1 -s EXPORT_ES6=1 -s DYNAMIC_EXECUTION=0 -s ENVIRONMENT=shell -s FILESYSTEM=0 -O3 -lembind -std=c++20 "$hive_root/vendor/libcolony/colony_js.cc" --post-js "$hive_root/vendor/libcolony/colony_js_post.js" -o "$colony_output/colony.mjs"
sha256sum "$hive_root"/vendor/libcolony/{colony.h,colony_js.cc,colony_js_post.js,LICENSE} "$colony_output"/{build.sh,colony.mjs,colony.wasm} > "$colony_output/hashes.txt"
