#!/usr/bin/env bash
set -euo pipefail

engine_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repo_root=$(cd -- "$engine_root/.." && pwd)
local_tools="$repo_root/.botanical/toolchain"

# A normal installed Rust toolchain also works. The local installation keeps
# this shared host's profiles and other worktrees untouched.
if [[ -x "$local_tools/cargo/bin/cargo" ]]; then
  export CARGO_HOME="$local_tools/cargo"
  export RUSTUP_HOME="$local_tools/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
bindgen=${HIVE_WASM_BINDGEN:-wasm-bindgen}
if [[ -x "$local_tools/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen" ]]; then
  bindgen="$local_tools/wasm-bindgen-0.2.128-x86_64-unknown-linux-musl/wasm-bindgen"
fi
[[ "$("$bindgen" --version)" == "wasm-bindgen 0.2.128" ]] || {
  echo 'Install wasm-bindgen-cli 0.2.128 to match the kernel.' >&2
  exit 1
}
cd "$engine_root"
cargo build --manifest-path kernel/Cargo.toml --target wasm32-unknown-unknown --release --locked
"$bindgen" kernel/target/wasm32-unknown-unknown/release/hive_kernel.wasm \
  --target web --out-dir generated --out-name hive_kernel
