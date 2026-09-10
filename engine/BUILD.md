# Building the fresh examples

The existing clearing stays separate. Root owns this worktree's dependencies and
serial build; sibling writers use only its read-only dependency installation.

- Rust 1.98.1, target `wasm32-unknown-unknown`.
- wasm-bindgen CLI 0.2.128, matching the exact crate pin.
- Standalone Bevy ECS 0.19.1 with `std`, without renderer/reflection/executor.
- Node and the root lockfile, existing Caps/Stipe original packages and art bank.

Install ordinary Rust using rustup, or use the isolated
`.botanical/toolchain/{cargo,rustup}` installation recognized by the scripts.
The local CLI comes from the official wasm-bindgen 0.2.128 Linux musl release.
No shell profile or other lane's dependencies are changed.

The retained frontend lock installs with `npm ci --legacy-peer-deps
--ignore-scripts`: Caps uses React 18, while OpenTUI's optional React integration
declares React 19. Hive uses OpenTUI's independent HTML integration, not that
optional React binding. The install limitation is explicit; it is not a claim
that all optional package integrations are compatible.

```sh
# Wrap automated checks/builds with the repository's run-proof.sh on shared hosts.
bash engine/scripts/qualify-kernel.sh
node_modules/.bin/tsc -p engine/tsconfig.json
node_modules/.bin/vite build --config engine/vite.config.js
```

The native check includes the actual Rust public laws and produces generated
web bindings in `engine/generated/`. Vite writes only `dist/engine/`; publication
must preserve the existing clearing's frozen files. Original art and authored
example source are included byte-for-byte. No browser/server acceptance follows
merely from compilation.
