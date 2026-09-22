# September 22 platform audit laws

Source: `2997346851c4d8e8d75d85d040f8d2f6463eafda`.
Worktree: `/home/levi/src/hive-worktrees/living-terrain-integration`.
Guard: `/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh`.
Scope `run-u3098.scope`, invocation `ac4c0c2ea99d4bf7a0f9227e131a667b`.
Completed **exit 1; 49 tests, 48 pass, 1 fail**, test duration 2492.28 ms.
No product source edits, dependency install or native rebuild.

Existing esbuild bundled these entrypoints as Node ESM, with packages external:

1. `engine/src/sdk/behavior.test.ts`
2. `engine/src/sdk/public.test.ts`
3. `engine/src/games/colony-party.test.ts`
4. `engine/src/runtime/session-region-records.test.ts`
5. `tools/public-engine-host/protocol.test.ts`
6. `tools/public-engine-host/clock.test.ts`

Node `--test` ran those six bundles plus
`src/engine/region/region.test.js` and `src/engine/region/admission.test.js`.
Generated WASM SHA-256:
`ce6034ebe6edfeea0fa30f8ae0c1d614627194a256babbdd8a9bed73e07f6106`.
Local raw output and exact argument receipt are retained in
`.botanical/engine-platform-audit-20260922/laws.log` and `laws.json`.

Failure: “disconnected party residents remain eligible for automatic work while
another principal advances the region” rejected native input:
`unknown field party, expected player at line 1 column 235`.
The fixture's scope resolver supplies `party` at
`engine/src/runtime/session-region-records.test.ts`:81,83. Both current
`engine/src/contracts.ts`:493 and `engine/kernel/src/components.rs`:788 define
player scope without that field, and the host resolver supplies the correct
shape at `tools/public-engine-host/worker.ts`:302. No current host failure or
WASM/source schema mismatch is inferred. The stale fixture is not changed by
this audit and its intended disconnected-work behavior remains unqualified by
this run.

Passing evidence includes actual two-party creation, actual Colony water record
commit/recovery after injected SQL failure, historical receipt replay at current
revision, resident reuse/discard/error preservation, clock frontier replay after
reopen, admission scoping, finite retention rejection and record-write rollback.
Protocol tests do not exercise the two host lifecycle defects found by source
review. No current hosted crash, security or sustained capacity claim follows.
