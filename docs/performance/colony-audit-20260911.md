# Colony performance and architecture audit — September 11

King Bolete. Audit of deployed source `109957b`, using the exact released
Rust/WASM bytes, not the newer unbuilt aperture/query source. Integration root
was clean `cca01d0`; the explicitly labeled false-completion finding below is
an additional UNRELEASED regression at that head. Two independent source readers reviewed Bevy/work and
host/client paths; King ran and reviewed the measurements and physical coupling.

**Release disposition: the current Colony is not playability-qualified.** We
reproduced a native routing panic during ordinary wall building, independently
of air. We also measured excessive water/air coupling and atmosphere capture.
Earlier hearth, conservation, restart and served-hash checks remain evidence for
their named behaviors; they did not qualify sustained building/digging performance.

This audit does not propose another engine or solver rewrite. The implementation
violates existing `engine/WATER-AND-GAS.md:116` and
`docs/decisions/engine-implementation-guide.md:174-205`: local changes, retained
connections, and affected component discovery were already the accepted plan.

## Measured result

Numbers below are elapsed milliseconds in Node 24.20.0 running the released
WASM on this shared Linux host. They are not Cloudflare CPU measurements,
network latency, browser FPS or a population capacity guarantee. Raw samples,
machine description, artifact hashes, failures and command receipts are in
[colony-audit-20260911.json](colony-audit-20260911.json).

### Native field isolation

Same Colony generated terrain and initial water stocks, 40 updates of 0.1 simulated
seconds, no authored work systems. Controls remove air or set water transport
rates to zero **only in the probe**. No live configuration changed.

| Native configuration | Median | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Water without air | 0.066 | 0.958 | 1.814 |
| Air with stationary water | 4.425 | 8.424 | 11.627 |
| Moving water with air | 7.946 | 306.478 | 325.170 |

The coupled sample's mean is 93.77 ms; the water-only mean is 0.136 ms.
The sample includes initial redistribution and later quieter updates. It does
not mean every water/air update costs 300 ms. It demonstrates large spikes in
the current integration without workers or a renderer.

### Actual Colony sessions

Two workers, normal food/fuel supplies, existing authored providers, full capture
after each step, observation every five steps. Requested 160 steps at 0.1 seconds.
Dig orders target `[1,13,0]` and `[2,13,0]`; both leave the order queue during the
run. Spoil custody was not independently reasserted by this timing probe. The build
command requests a north-facing timber wall at `[2,13,2]`.

| Workload | Step median | Step p95 | Step maximum | Save median |
| --- | ---: | ---: | ---: | ---: |
| Existing supplies, water+air | 8.00 | 302.52 | 456.89 | 22.57 |
| Two-cell dig, water+air | 8.86 | 305.03 | 637.78 | 22.53 |
| Two-cell dig, air disabled | 4.97 | 11.33 | 17.22 | 0.28 |

Air-disabled controls omit air-only inspection and smoke projection, but retain
the same work systems, terrain, water, commands and native step. Observation
comparisons are therefore not identical UI workloads; native field isolation
above independently verifies the coupling cost.

The dig fixture makes 6,597 component-query bridge calls over 160 steps, costing
228 ms in aggregate. Native advance costs 5,792 ms; capture costs 3,756 ms.
Therefore JSON queries are avoidable work, but not the dominant measured stall
in this small fixture. Optimize in that order instead of blaming ECS wholesale.

One early capture contains 1,737,502 atmosphere bytes and about 1.75 MB total.
With air disabled the comparable total is about 12 KB. SQL writes only changed
records, but serializing/copying the full snapshot already occurred. The dig
fixture's changed-geometry observation spikes to 85 ms locally; first full map
projection costs 175 ms. Browser terrain rebuild time was not measured here.

WASM linear-memory high-water was approximately 34 MiB in the full dig run;
Node RSS was approximately 159 MiB and includes Node/V8, JS copies, previous
scenarios and allocator retention. Neither is a DO peak-memory qualification.
The native failure stack below indicates a bounds panic, not demonstrated OOM.

## P0: ordinary build causes a Rust route panic

Full Colony and air-disabled Colony both complete 127 steps (12.7 simulation
seconds), then trap on the next step. The captured stack is:

```text
RuntimeError: unreachable
core::slice::index::slice_index_fail
Kernel::route_for
```

This corrects the earlier inference that water/gas necessarily explains the
reported server crash. It explains measured stalls, but this reproduced crash
is navigation. We have not read Levi's actual remote instance logs, so do not
claim this proves every live symptom has the same cause.

`engine/kernel/src/world.rs:611-633` matches the next remaining waypoint against
the **first** equal coordinate in the entire retained path. Reroutes append new
path segments to that history (`:640-644`). Revisiting a coordinate can select an
old occurrence behind the current cursor, truncate the history too early, then
panic at `history[contact_start..]`. This is the leading source explanation for
the captured route panic, not yet a focused internal-index witness.

Repair the join using current waypoint/support progress, not a coordinate search
over historical travel. Checked slices must reject invalid state; do not clamp
the index or teleport the body to hide it. Qualify return trips and mid-segment
rerouting, then the exact public wall-build reproduction with air still enabled.

The panic leaves wasm-bindgen's mutable borrow guard held; subsequent `free()`
throws `attempted to take ownership of Rust value while it was borrowed`.
Host invalidation currently calls `free` before clearing its resident references
(`region-program.ts:73-75`). Its exception path can replace the primary panic
with the disposal error. The generated wrapper zeroes its pointer before native
free throws. Treat a trapped WASM instance as unusable: detach it, contain failed
disposal without repeating free on that wrapper, preserve the original exception,
and preserve the last committed world. Detaching alone is not sufficient recovery.
The measured destructor failure is additional evidence, not a successful
native recovery. Actual process exit reclaimed the audit instances.

## P0: unreleased construction regression ignores rejected publication

At current UNBUILT `cca01d0`, `construction_work.rs:177` discards the boolean returned by
`KernelEnvironment.apply_structures`. That operation returns `Ok(false)` when
air cannot admit the edit (`environment_runtime.rs:108-119`). Completion still
marks the site Finished and Sealed even though physical geometry was not applied.

**Deployed `109957b:construction_work.rs:172` correctly checks this boolean.**
The aperture changes removed that guard; this does not explain the live symptom.
The first source review conflated current source with deployed source here; exact
`git show` comparison corrected it before audit acceptance.

This is a confirmed unreleased regression separate from the routing panic. Restore
the deployed behavior and keep the site
waiting, with work and staged material intact, when publication is blocked.
No finished marker, embedded-material status or geometry revision may claim
success. The same contract must cover every construction/physical-edit caller.
Use the existing trapped-air fixture through actual construction completion,
not just the lower-level solver or aperture setter.

## P1: eliminate whole-region coupling work

`environment_runtime.rs:160-181` checks whether ANY water mass changed. If so,
`terrain_water/air_geometry.rs:131-233` scans all 18,432 configured voxel positions,
constructs cell maps/faces, and reads all water facts. This includes changes in
porous solid material that cannot alter open room volume.

`terrain_atmosphere.rs:177-218` then projects the complete room representation
before comparing it with the retained one. A changed definition calls
`compile_snapshot_from_snapshot`, which projects the same snapshot again.
Construction and excavation use this same broad path. Keeping the final compiled
object when equal does not recover the work already spent proving equality.

Required replacement:

1. Physical/water preparation returns changed cells/faces and old/new relevant
   liquid capacities at the existing mutation owner.
2. Porous-stock changes that do not alter open air are excluded.
3. Retained membership and opening indexes update affected metrics directly.
4. Only actual membership/opening connectivity changes discover the complete
   affected component and prepare a split/merge. Discovery must include alternate
   paths, not assume a fixed neighborhood always proves a room split.
5. Discovery has bounded continuation. Unrelated work proceeds; a blocked edit
   waits on relevant changes rather than reconstructing the same failed graph
   each tick. Preserve compound water/air/material publication and finite stocks.

Keep the full geometry compiler for initial admission, restore verification and
an independent reference fixture. Remove it from ordinary water quantity updates.
Do not disable air as the shipped fix, shrink the world until the test passes,
or substitute a different water model. Existing numerical transfer code can stay.

## P1: separate static geometry records from changing gas stock

`atmosphere/state.rs:130-137` serializes definition AND state on every save.
`TerrainAtmosphere.save`, `Kernel.save_records`, `captureKernelRecords`, and the
Region caller copy that data into JS and compare it against prior records.
Bevy/world residency is correct; immutable geometry data is still repeatedly
encoded inside changing snapshots.

Separate versioned geometry/binding bytes from per-volume gas amounts and ledgers.
Encode immutable geometry only when its definition changes; reuse immutable
accepted bytes. Encode the changing stock records for durable commitment.
Commands that only queue intent must reuse unchanged native records. Track dirty
record revisions at the native owner; acceptance clears them only after the outer
transaction succeeds. Keep full current-format restore validation. This is not
permission to acknowledge unsaved effects or switch to periodic autosave.

## P1: physical edits also rebuild the entire client map

`runtime/terrain-presentation.ts:118-145` samples all 4,096 columns via 128 WASM
queries after a terrain revision. `client/terrain-layer.js:26-40` then rebuilds
and rebakes the entire 2,304 by 1,536 terrain image on the main thread.
`src/art/bake.js:37` additionally reads/scans 3,538,944 pixels for a silhouette
that this non-interactive terrain sprite never uses. Actual terrain picking uses
physical faces instead. These are source counts, not measured browser durations.

Expose changed columns from the same physical mutation. Patch cached projection
and connection baselines; retain full baseline recovery on reconnect. Reuse the
original Three-to-Pixi bake owner with an explicit no-silhouette option and
bounded terrain patches/chunks. The old Clearing already has
`src/art.js:50` clipped `bakeTerrainPatch`; adapt its behavior to signed multilevel
surfaces rather than blindly copying its old world-state dependency.
Reuse unchanged geometry/pixels and disposal rules. Visible rendering and picking
must share changed-face ownership; build-hover currently reconstructs and tests
all terrain faces for each pointer move (`client/geometry.js:78`, `client.js:889`).

## P2: use Bevy and work indexes properly

Keep typed components, cached authored `QueryState`, stable IDs, Rust assignment,
and maintained terrain pathfinding. Fluids need dedicated arrays/graphs, not one
Bevy entity per voxel. A Bevy schedule migration is not required for this repair.

- `advance_construction` clones/sorts every site before filtering Working, then
  unconditionally calls `refresh_state_weight`, even when no sites exist.
  That refresh scans every entity/schema and constructs generic records
  (`world.rs:463-483`). Numeric work progress does not change its conservative
  byte weight. Maintain membership and accounting at mutations, with full
  recomputation at load and in invariant tests.
- Retain native work queries and active-site membership. Avoid cloning finished
  buildings to discover that they need no work.
- `terrain_route.rs:75` supplies A* a zero heuristic: valid but effectively
  Dijkstra. Use an admissible lower bound consistent with rounded integer edge
  costs; do not assume rounding the final Manhattan distance is always admissible.
  Preserve exact reachability/cost semantics and Rust joint assignment.
- Cache phase-local immutable native query rows beneath existing authored intent
  overlays. Preserve pending writes/creates/removals, paused commands and ordered
  systems. Don't freeze stale query results or move physical decisions into UI.
- Reject occupied/ineligible work before route estimation as current providers
  already do; preserve that working behavior. Cache repeated route preparation
  only with appropriate actor/capability/geometry validity.

Official Bevy `Changed<T>` still scans matching entities; it is not a sparse
dirty-cell queue. See [Bevy 0.19.1 Changed](https://docs.rs/bevy_ecs/0.19.1/bevy_ecs/query/struct.Changed.html).

## P2: make server and client recovery honest

The host serializes commands, ticks and observations. It catches up at most five
100ms occurrences per alarm, but has no elapsed-work budget. Slow ticks can
monopolize that queue. A failure rejects the transaction and discards residency;
there is no proven infinite application retry loop. Platform retry timing and
Levi's actual remote error remain unmeasured. Withdraw the earlier stronger
retry-loop suggestion as a diagnosed cause.

`worker.ts:761-764` waits for observation publication AFTER committing a command
before returning its receipt. Heartbeats build a discarded observation response,
then another observation and force a terrain baseline. Cache committed projection
and separate renewal from building a response. Receipt delivery and failed
publication must be recoverable without repeating the physical operation.

`runtime/remote-client.ts` sets its command pump `blocked=true` after retries;
successful later observations do not reconcile/unblock it. Preserve the unresolved
command ID, recover its receipt, then resume or expose a useful recoverable error.
Do not retry with new IDs, extend timeouts to disguise stalls, or silently stop
accepting input. Trapped native state requires the recovery described under P0.

The native transport permits 48 records while host/store allow 40: a real
capacity-contract mismatch, but current approximately14 records do not hit it.
Resolve one common bound; do not blame it for this observed panic.

## Repair batches and acceptance

1. **Crash and unreleased regression:** route-progress join, trapped-instance disposal,
   retain the deployed blocked-geometry guard in upcoming source. Same exact wall fixture must complete, produce real
   geometry, survive restore, and not become Finished on rejected geometry.
2. **Water/air and capture:** changed-cell metrics, affected connectivity, reusable
   geometry records. Repeat the exact field and dig fixtures. Counts must show no
   full-air scan for pore-water redistribution or quantity-only free-volume edits.
   Keep mass/heat, retry and current-save laws. Aim at the existing <=10ms combined
   field target, then measure actual DO command/tick cost before acceptance.
3. **Terrain input/display and recovery:** changed-column projection, clipped or
   chunked original rendering, cached picking, receipt reconciliation. Reuse the
   same Colony; one bounded actual input trace measures long tasks and command
   latency while digging/building continue. No editor matrix or new lab page.
4. **Measured work cleanup:** active sites, incremental accounting, query reuse and
   heuristic. The current query overhead is smaller than coupling/capture, so do
   not postpone batches1-3 for an ECS-wide rewrite.

Root owns numerical/architecture/source acceptance. Independent work may proceed
on disjoint files; the coupled native physical owner and its captures remain one
writing seam. No new feature expansion or generated art is required by this audit.
The actual final test is the same cozy Colony with two human clients, digging,
building, water and fueled smoke together. No claim of large-population capacity
is needed. A correct isolated solver or HTTP asset hash is insufficient.

## Evidence and limitations

- `run-u5999` terminal17632 exit1: full idle/dig samples, faulty no-air inspection
  controls, actual wall panic; disposal also threw. Original evidence retained.
- `run-u6001` terminal5163 exit0: diagnostic captured the same wall panic stack;
  this terminal0 is NOT a passing game test. No-air inspection still invalid.
- `run-u6003` terminal61255 exit0: corrected air-disabled controls; same wall panic
  at the same simulated progress. Air-only inspector/effects omitted explicitly.
- `run-u6005` terminal79930 exit0: three native field isolation cases completed.
- All four scopes inactive/dead, empty ControlGroup; no browser, listener, local
  Worker, provider request, live player command or deployment was launched.
- Full driver/source snapshot, original failures and raw measurements remain in
  `.botanical/performance-audit/` in the integration worktree. Source snapshot
  uses `git archive 109957b engine/src`; three generated artifacts were SHA-checked
  against the deployed inventory. No Rust rebuild was needed.

Browser frame/input timings, actual remote DO failure logs, hosted storage cost,
exact route cursor at panic, repeated seeded workloads and two-client acceptance
remain open. Node timings establish a defect and repair priorities, not a repaired
release. Host disk pressure was observed locally; it does not explain a reproduced
Rust slice panic or establish anything about remote DO storage.
