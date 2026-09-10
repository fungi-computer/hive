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

Publication supersedes the earlier unhosted status: source3478538 client correction
built in u4864. Local input u4865 passed pointer selection/order, food take/eat,
Save and paused Continue; exact restored snapshot comparison is limited by the
saved-message observation, so full restore correctness remains headless evidence.
Root viewed survival-input.png. Ordinary same-preview upload u4869 exit0,
deployment4d780b7b-64a3-4e0f-a456-dd5f914e002b; u4870 readback141/141. Initial
u4868 lacked an exported token; corrected SAME subprocess sourcing/export worked.
No credential rotation. All owned scopes dead/empty, browser port5197 clear.

## Current DO source qualification

The browser release remains frozen at 3478538. Current root d921c47 passed strict
TypeScript in u4874 (exit 0, owned scope inactive/dead and empty). This includes
the reusable session Region program, immutable program capture and removal of
unused component definitions. It does not establish DO execution or recovery.
The local DO witness is undergoing source review before its first invocation;
it must prove physical consumption, same-command replay after process restart,
conflicting reuse rejection, and rollback of a physical step. No DO is deployed.

Local native DO acceptance: root 07ef860, u4878 exit 0, invocation
d8bd1d1b4aff47b38af5fb15d8c8a0a8. Three owned runtime starts used the same persisted
SQLite store and generated WASM. Survival move/take/eat reduced bread from 8 to 7;
after lost acknowledgement and abrupt runtime restart, exact command replay kept
revision 6/tick 3 and did not consume again. Conflicting reuse returned 409. The
following step applied the exact saved TypeScript hunger consequence. Injected
receipt-write failure rolled back native movement and session state together; a
second restart retained revision 8/tick 4 with its pending command.
Evidence: .botanical/fresh-do/native-v2/{survival-proof,survival-proof-receipt}.json.
Scope inactive/dead/empty, no 8789 listener, ordinary reuse bind available; temporary
config removed. A separate Python bind without reuse hit TCP TIME_WAIT, not a live
listener. Initial u4876 stopped before readiness on unsupported compatibility date;
09-04 matches the installed runtime. No hosted DO, automatic alarm, large-world
capacity or multiplayer browser claim follows from this bounded native proof.

Custom authoring witness: u4880 exit 0 at 990ed50 ran the single new named
TypeScript-component law against unchanged WASM db1d8f26. An orchard ripeness
number/boolean component advances through an authored system, restores into a
second native instance and continues, while the first instance remains unchanged.
The filtered runner also reports an empty session-test file as passing; this is
one authored law, not two. Scope inactive/dead/empty. No Rust rebuild was used.
