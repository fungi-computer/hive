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

The current TypeScript session format is version 3. It saves the previous physical
step's ordered action outcomes with the world and RNG state. Authored systems can
react on the following step; rejected actions are explicitly distinguishable.
Pause does not consume outcomes, and successful stepping replaces them, so save
and restore do not repeat an authored response. The eventual DO host must commit
this whole session atomically; these in-process fields alone are not durability.
Pending player input is bounded at 128 actions; authored systems have another 128
per step, within the native 256-action batch. Malformed input is rejected before
queueing; physically unavailable actions return normal rejections.

## First actual consumer checkpoint — September 10

Native pin e5aba62 in fresh-native-proof: u4850 exited 0 after five assignment
laws, seven public kernel laws, and release WASM generation. Kernel source matches
the integrated root. WASM SHA256 db1d8f26c1f02a375c67448eed6c079f0f571b662d86b7e487c6d058fc1bf37e.
Initial u4848 compile failure (ambiguous Result) is preserved in tool output.
Strict TS u4855 passed. Actual TS/WASM consumers plus session laws u4858 passed
10/10 after u4857 exposed the shared movement helper's extra destination field.
Client build u4859 includes the real worker and WASM (earlier u4856 build did not).
Local browser u4861 passed all three pages' rendered-ready and acknowledged pause
checks; root viewed all three captures in .botanical/fresh-browser. Scope dead,
empty control group and port5197 clear. No page errors. This is not movement-input,
save-button, narrow-view, hosted, or DO proof. Pantry/locker visual mapping and
label overlap remain visible corrections. Nothing from this checkpoint is hosted.
