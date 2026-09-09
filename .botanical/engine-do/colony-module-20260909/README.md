# Modular libcolony DO readiness checkpoint

Ignored candidate only; no production join. Build u3917 / invocation
90fbfd7c8ed34f1eb8e5151f1162765f used retained Emscripten 3.1.46, without
SDK install/activation, on unchanged vendor/libcolony/colony.h, colony_js.cc and
colony_js_post.js. hashes.txt pins inputs, recipe and artifacts.

build.sh retains O3, Embind, C++20, fixed INITIAL_MEMORY=16777216,
TOTAL_STACK=1048576, ALLOW_MEMORY_GROWTH=0 and STACK_OVERFLOW_CHECK=2.
It adds MODULARIZE=1, EXPORT_ES6=1, DYNAMIC_EXECUTION=0, ENVIRONMENT=shell and
FILESYSTEM=0. The shell target excludes browser/Node loading branches; actual
loading is the supplied instantiateWasm hook over a static Wasm-module import.
Generated colony.mjs contains no new Function, eval call, window, document or
importScripts. No generated-glue patch or optimizer rewrite was made.

worker.mjs imports the ES factory and static colony.wasm, creates one instance
per ColonySmoke DO, and awaits initialization before using the unchanged public
compute_cost/optimize wrapper. It reproduces the retained optimizer fixture:
500 offers (5 actors × 100 jobs), 100 optimization calls, expected unique chosen
actor/task pairs and exact expected costs. The actual native DO smoke passed
u3919 / invocation 3b3865e26d73483b96eb178b406b4bb5. result.json records runtime
versions/hashes/response, fixed 16777216-byte heap before and after, child exit
and listener closure. Runtime log retained; owned runtime stopped.

Commands (from Hive root):

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh bash .botanical/engine-do/colony-module-20260909/build.sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node .botanical/engine-do/colony-module-20260909/probe.mjs
```

Compiler side effect disclosed: Emscripten generated its symbol-list cache file
050c5d62264db327bbc2bc75303d37f45e6f3088.json in the retained SDK cache outside
this output directory. No authored source outside this directory was changed.
This readiness smoke does not prove Goblin-region integration, population
capacity, hosted deployment, or durable optimizer memory. Canonical game state
must remain with the region owner; the Wasm instance is replaceable machinery.
