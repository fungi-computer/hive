#!/usr/bin/env bash
set -euo pipefail
engine_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repo_root=$(cd -- "$engine_root/.." && pwd)
export CARGO_HOME="$repo_root/.botanical/toolchain/cargo"
export RUSTUP_HOME="$repo_root/.botanical/toolchain/rustup"
export RUSTUP_TOOLCHAIN=1.98.1
export CARGO_BUILD_JOBS=2
export PATH="$CARGO_HOME/bin:$PATH"
cd "$engine_root"
cargo test --manifest-path kernel/Cargo.toml --locked --jobs 2
./scripts/build-kernel.sh
