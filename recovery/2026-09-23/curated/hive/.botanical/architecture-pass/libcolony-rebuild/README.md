# Actual upstream rebuild with smaller memory

Result: an unchanged pinned libcolony algorithm, Embind bridge and JS post-wrapper
compiled and executed successfully in local workerd with 16 MiB fixed linear
memory and a 1 MiB stack. Five actors ×100 tasks supplied 500 candidate edges;
100 consecutive calls to the real Module.optimize returned the five expected
unique assignments. Before and after, Module.HEAPU8.length was 16,777,216 bytes.

This is a disposable runtime proof. Public vendor bytes remain unchanged and
their hashes still match PROVENANCE.md. There was no production source/config
change, package dependency change, system package installation, profile edit,
authentication or provider deployment.

## Provenance and tool preparation

Libcolony source: commit 867b2147fc0e8bfa28e873d576c5e4b186ec3b2f.
Unchanged inputs are preserved in ../libcolony-source/.

Original compiler discovery found GCC/G++ and Make, but no Emscripten/Clang
Wasm toolchain or container runtime in PATH or ordinary local install locations.
Following the authorized portable SDK preparation, emsdk 3.1.46 was downloaded
under this directory. Its tag points to 93360d3670018769b424e4e8f1d3d9b26d32c977;
its release manifest selects 21644188d5c473e92f1d7df2f9f60c758a78a486.
The actual compiler identifies itself as Emscripten 3.1.46
(19607820c447a13fd8d0b7680c56148427d6e1b8).

This compiler version is pinned for this new build; the original release's exact
Emscripten SDK version is not asserted. The pinned upstream compile_commands.json
references clang-17 but does not establish an exact Emscripten version.

The compiler archive was 345,164,719 bytes and bundled Node archive 22,559,772
bytes. Installed SDK footprint is approximately 1.1 GB. Activation and compiler
cache stayed in the SDK directory; the SDK environment was sourced only inside
the bounded build subprocess. No login/profile was edited. Official preparation:
https://emscripten.org/docs/getting_started/downloads.html

## Commands

From /home/levi/src/hive:

```sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh bash /home/levi/src/hive/.botanical/architecture-pass/libcolony-rebuild/setup-build.sh
bash /home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node /home/levi/src/hive/.botanical/architecture-pass/libcolony-rebuild/probe.mjs
```

The actual compiler command, run from ../libcolony-source/ with the SDK active:

```sh
em++ -s INITIAL_MEMORY=16777216 -s TOTAL_STACK=1048576 -s ALLOW_MEMORY_GROWTH=0 -s STACK_OVERFLOW_CHECK=2 -O3 -lembind -o /home/levi/src/hive/.botanical/architecture-pass/libcolony-rebuild/small/colony.js -std=c++20 src/colony_js.cc --post-js src/colony_js_post.js
```

INITIAL_MEMORY and TOTAL_STACK replace the release's explicit 327,680,000 and
160,000,000 byte settings. Growth is disabled to prove the bounded memory size;
stack-overflow checks are enabled. Current Emscripten documentation calls the
stack setting STACK_SIZE; TOTAL_STACK is accepted by the pinned 3.1.46 compiler.

## Runtime evidence and cleanup

Local host: Node v24.20.0, Wrangler 4.127.1, workerd 1.20260828.1, Miniflare
5.20260828.0-alpha. Scratch compatibility date 2026-09-04 retains the supported
date discovered in the prior release probe. No claim is made that this installed
runtime supports the production configuration's 2026-09-07 date.

The worker imports the rebuilt JS as text and Wasm as a static module. Its eager
startup wrapper uses Module.instantiateWasm and shadows process to avoid the
release's Node/require environment path. compute_cost and optimize are the real
upstream wrapper functions.

The request offered preferred task (person+2)%5 to each person at cost person+1;
other task costs were at least 101. Each of the 100 calls checked the exact
expected five assignments and Set sizes of five for both characters and tasks
before returning HTTP 200. This probes the specified workload, not all matching
inputs or whole-game behavior. The first run's length/per-result checks were
strengthened with those explicit uniqueness assertions; its receipts remain as
result-preliminary.json and runtime-preliminary.log (scope run-u188).

- build.log: compiler/version/settings and input/output hashes, scope run-u187.
- result.json: response, versions, memory sizes, output hashes and child cleanup.
- runtime.log: final native Wrangler/workerd stdout/stderr, scope run-u193.
- scope-collection.txt: all three scopes not-found/inactive/dead after completion.
- download-and-vendor-hashes.txt: SDK source archive and unchanged vendor hashes.
  The SDK installer removed its binary download archives after extraction;
  their fixed release URLs and byte sizes are retained in build.log.

Output SHA-256:

- small/colony.js: 60ab2e98baa488a39848e2a576bafcce48f33aa49fe995de907613c9915fafa0
- small/colony.wasm: 33d78e3451179d1e17d283837066a819d94ec0bba239dda4c6ce19edb7fcc0e9

## Conclusion and next step

The original 312.5 MiB buffer is an explicit release build configuration.
The pinned Hungarian implementation can run this workload in a 16 MiB build
without changing the algorithm. A production candidate can preserve the upstream
commit and wrapper while documenting the smaller compiler configuration and
generated hashes. Before adoption, run the retained game/replay checks and bound
actual actor/task dimensions; select budgets with headroom for the rest of the
host. Sixteen MiB is a successfully tested candidate, not a measured minimum or
an unlimited capacity guarantee. Full DO persistence, hibernation, production
resource accounting and deployment are still outside this proof.
