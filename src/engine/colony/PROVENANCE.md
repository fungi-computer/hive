# Portable libcolony module

Unchanged vendor/libcolony C++ algorithm, Embind bridge and JS post-wrapper,
compiled with retained Emscripten 3.1.46. Original MIT license remains in
vendor/libcolony/LICENSE. Classic browser loader remains independent.

Recipe:
`em++ -s INITIAL_MEMORY=16777216 -s TOTAL_STACK=1048576 -s ALLOW_MEMORY_GROWTH=0 -s STACK_OVERFLOW_CHECK=2 -s MODULARIZE=1 -s EXPORT_ES6=1 -s DYNAMIC_EXECUTION=0 -s ENVIRONMENT=shell -s FILESYSTEM=0 -O3 -lembind -std=c++20 vendor/libcolony/colony_js.cc --post-js vendor/libcolony/colony_js_post.js -o colony.mjs`

SHA256:
- colony.h: a1149ef84bddb1ba64ce3f76f394822553fe38338c0b170580832abf0d9ccd3a
- colony_js.cc: c54cb7a60f937fece00e5d64b339878e9d9cedf2821e44e8b9681f62f9d28b52
- colony_js_post.js: ded1eb8c96521ce694e812c9a2ac09ff36f1f3cae7bf51794277bf02b0b09942
- colony.mjs: b766aed9dbf46b7a85b3740a96a69daf78a5dd582df76eb040dcc450e75ac378
- colony.wasm: 33d78e3451179d1e17d283837066a819d94ec0bba239dda4c6ce19edb7fcc0e9

Native local DO smoke u3919 (3b3865e26d73483b96eb178b406b4bb5) checked
100 optimizations of 500 offers and the fixed 16MiB heap. This proves module
readiness, not the Goblin-region join. Headless callers supply WebAssembly.Module;
only host entries perform static Wasm imports. No dynamic execution is enabled.

First Goblin region content pin is `goblin-region-v1`, using current serialized
Clearing schema 16 via its existing validator and these optimizer bytes. Changing
saved meaning, preset rules or optimizer compatibility requires explicit program
version review. External build direction currently accepts only 0/1; the planned
four-orientation product change is not silently enabled by this transport.

Identity erratum after v3: the maintained loader now returns a frozen structural
Optimizer carrying `buildId = <full JS SHA256>:<full Wasm SHA256>`. Goblin captures
that declaration and method references at registration; its program ID is
`goblin-v1:<buildId>` (139 characters), so a different registered build cannot
reopen existing region state. Registered code remains trusted; a declared ID is
not authentication of arbitrary code or a supplied WebAssembly.Module. The
actual host's static import and the transitive source inventory pin this build.
There is no nominal/WeakSet provenance or hidden capability requirement.
V3 retains its original pre-identity source pins and native physical result;
identifier correction is separately qualified without repeating that run.
