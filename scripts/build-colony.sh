#!/usr/bin/env bash
set -euo pipefail

# Activate a local Emscripten 3.1.46 SDK in the calling shell before running.
# The compiler and its caches are not game assets or application dependencies.
if ! em++ --version | head -n 1 | rg -q '3\.1\.46'; then
  echo 'This build is pinned to Emscripten 3.1.46.' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
em++ -s INITIAL_MEMORY=16777216 -s TOTAL_STACK=1048576 \
  -s ALLOW_MEMORY_GROWTH=0 -s STACK_OVERFLOW_CHECK=2 \
  -O3 -lembind -std=c++20 vendor/libcolony/colony_js.cc \
  --post-js vendor/libcolony/colony_js_post.js \
  -o public/vendor/libcolony/colony.js
