# Native generated wet-region qualification

This local harness imports the unchanged `createWetRegionProgram` and `openRegion`.
Cloudflare Durable Object SQLite and `transactionSync` own terrain edits, soil and
pit water, finite wet-spoil exports, field time, events and command receipts in
one transaction. It is the independent generated wet-world consumer, not Goblin
pawn work or a deployed backend. It grants no new water and has no wake scheduler.

The fixed fixture cuts `[0,14,128]`, then adjacent `[1,14,128]`, then the lower
owned soil voxel `[1,13,128]`. The third cut exposes the real generated stone floor;
excavating that unowned stone is rejected. Only `wet-world-host` may advance the
field for the declared six seconds. `wet-world-player` may excavate. Per-run
credentials select these principals and never appear in retained logs.

`before-commit` throws after the native receipt INSERT has actually executed,
inside the owner's transaction. The proof compares all retained state, receipt
and event rows to establish rollback of both excavation and field advancement.
`after-commit` calls storage.sync and withholds the response using a harness-only
pending timer. The driver observes the receipt through read-only external SQLite,
kills its owned process group, restarts it, checks unchanged rows before any DO
fetch, then asks the fresh instance to reconstruct state and replay the command.
The barrier is not a production alarm, job or acknowledgment fact.

From the worktree root, use the shared proof wrapper around:

```sh
node node_modules/typescript/bin/tsc -p tools/engine-do/wet-tsconfig.json --noEmit
node tools/engine-do/wet-proof.mjs --output .botanical/engine-do/wet-host/a-fresh-run
```

Use a new proof directory. The driver preserves SQLite, snapshots, source hashes,
bundle dependency inventory and sanitized runtime logs. It closes only its own
runtime and removes only its temporary credential configuration. Generated Worker
types come from ordinary Wrangler for `wet-wrangler.json`; strict checking uses
`skipLibCheck:false` without Node ambient types in this Worker-only closure.

This fixture establishes bounded native transaction/restart behavior. It does
not establish a production CPU envelope, cross-region transfer, arbitrary command
retention, automatic host advancement, Goblin integration or hosted deployment.

Strict Worker-only declarations passed u4151 /33fa2779053c4cc4a16c862b92b3cb4c,
with skipLibCheck:false. Initial u4148 caught the SQL adapter method accidentally
binding `this` to the SQL interface; the generic arrow now captures the actual
DO fault flag and still executes SQL eagerly. No declaration suppression was used.

Fallow first reported request fetch CC23/cognitive31. Request authority, routing
and command transaction/lifecycle now have separate responsibilities; current
maximum is commandAuthority CC10/cognitive9. Remaining estimated-coverage
advisories cover authority, routing, command execution and the proof process-stop
helper (CC7/cognitive8). No engine source or suppression changed for this audit.

## Native result

Native proof **u4164 /17ae3b862f4f44efaad2ab9d1f5d6428 passed**, exit 0, against
source checkpoint `4b0874a` on baseline `edc3de6`. All seven declared checks passed.
The two abrupt runtime kills and final graceful shutdown each closed their owned
listener. The first runtime logged a retained broken-pipe diagnostic during
readiness, before command checks; its cause was not qualified. The runtime
continued and all exact persisted-row/reconstruction assertions passed.

Final state: three cuts, 1.62 m³ of finite source-voxel spoil, exactly six seconds
of field time, 0.7225940236518458 kg in pit water, and 7680.57051564467 kg total
original water. Conservation residual was 9.094947017729282e-13 kg. Both cut and
advance receipts survived the withheld response and process replacement, with
no duplicate physical cut, spoil export, event or field advancement.

Evidence is retained under `.botanical/engine-do/wet-host/native-v1` in the
`wet-region-host` worktree: receipt.json, raw SQLite, cut/advance before/after
snapshots, final.json, three sanitized Wrangler logs, metafile.json and all 128
transitive source/dependency hashes. Post-run readback found no hash mismatch.
The wrapper transcript is `.botanical/engine-do/wet-host/native-v1.log`.
Runtime versions: Wrangler4.127.1, workerd1.20260828.1,
Miniflare5.20260828.0-alpha, esbuild0.28.2 and Zod4.5.4.
