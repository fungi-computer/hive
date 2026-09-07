# libcolony v1.0.0 · 16 MiB source build

Upstream: https://github.com/mafik/libcolony
Tag commit: 867b2147fc0e8bfa28e873d576c5e4b186ec3b2f
Release: https://github.com/mafik/libcolony/releases/download/v1.0.0/colony_js.zip
License: MIT, included verbatim. The upstream algorithm header, Embind bridge
and JS post-wrapper are retained unchanged in `vendor/libcolony/` at the repo
root. Demo HTML and demo sprites are not shipped.

The browser JS/Wasm are a source build using Emscripten 3.1.46
(compiler revision `19607820c447a13fd8d0b7680c56148427d6e1b8`).
The original Makefile explicitly reserves 327,680,000 bytes of initial memory
and a 160,000,000-byte stack. This build changes configuration to 16 MiB initial
memory, 1 MiB stack, no memory growth and stack-overflow checks. It does not
replace or alter the Hungarian algorithm or its public wrapper.

With a local Emscripten 3.1.46 SDK active, run `bash scripts/build-colony.sh`.
On the shared Botanical host, wrap automated build/proof commands with the
existing `run-proof.sh` scope runner described in PROTOTYPE.md.

Current SHA-256:

- colony.js: 60ab2e98baa488a39848e2a576bafcce48f33aa49fe995de907613c9915fafa0
- colony.wasm: 33d78e3451179d1e17d283837066a819d94ec0bba239dda4c6ce19edb7fcc0e9
- source colony.h: a1149ef84bddb1ba64ce3f76f394822553fe38338c0b170580832abf0d9ccd3a
- source colony_js.cc: c54cb7a60f937fece00e5d64b339878e9d9cedf2821e44e8b9681f62f9d28b52
- source colony_js_post.js: ded1eb8c96521ce694e812c9a2ac09ff36f1f3cae7bf51794277bf02b0b09942

Original release SHA-256 (recoverable in accepted Git history):

- release zip: 7caea3e8428b4e8d4f8695014b4a111686b8406d5c59344f17b74add5e7d504e
- colony.js: 2f31c9b940595268842c30eb02a5249227b4c3c93467c5f19d23d438b75c5fd6
- colony.wasm: 08a46ee9b5c6135ae165bdd4f5983a8ce28ad70d6da63cac0a53e79067077ef1

The browser loader sets `Module.onRuntimeInitialized` before loading the classic
script. The game uses `compute_cost({travel_time, work_time, priority})` and
`optimize([{character, task, cost}])`. Assignment keys are application-owned IDs.
The optimizer returns selected assignments; game state owns movement and work.
