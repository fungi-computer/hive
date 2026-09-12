# Gas repair: playable rooms in the existing Colony

September 11, 2026. King Bolete owns design, integration and acceptance.

This implements the incremental-field direction we already chose. The released
implementation failed to follow that direction in its geometry and persistence
paths. It is not a new physics project or a new demo. Status and measured results
must be appended below; this plan alone is not an accepted implementation.

## September 12 acceptance contract — supersedes the repair sequence below

The current goal is the complete playable Colony repair requested in Levi's
pasted goal, not incremental optimization of the old air compiler. Historical
measurements below remain evidence. In particular, **do not continue the proposed
whole-graph fingerprint optimization**: the cell/physical-face gas representation
it would optimize is being replaced for the real Colony consumer.

### Fixed playable workload and budgets

Use the current generated `colony-world-v1` 64×64 clearing, its full −32..39
vertical range, two ordinary workers and the existing guest. Two independent
browser connections share one authorized world. This proves two simultaneous
players' interactions, not a new account or identity service. Keep finite goods,
normal movement/work durations, and actual terrain/material/air rules enabled.

Run one sustained 20-minute scenario, pausing only at explicitly recorded save
checkpoints, and keep both connections active:

1. Queue a contiguous 4×4 dig rectangle, then a second cut through those columns
   where supported/reachable: 32 earned cuts, not direct terrain writes. Inspect
   inaccessible targets explicitly rather than counting rejected cuts as done.
2. Allow spoil to fill the existing pantry. Remaining spoil stays visible on the
   ground. Workers continue eligible work. Exercise a destination filling after
   pickup and verify put-down/release; then make space with ordinary transfers
   and verify automatic hauling resumes. Account for every spoil unit and its
   carried water through a current-format recovery.
3. Build an enclosed lower room and two accessible upper levels using ordinary
   construction, support, stairs and finite supplied goods. Use the current
   original assets. Missing acquisition/building capabilities are incomplete
   gameplay to implement, not grounds to grant free materials inside the proof.
4. Dig through the current admitted groundwater area while the other client
   issues ordinary orders. Water enters the cut and soil retains a finite amount.
   Track field + soil + spoil water; no infinite absorption or invented sources.
5. Burn paid fuel indoors, observe smoke accumulation, open a real ventilation
   path, and observe smoke clearing. Include a cellar/vertical shaft connection.
   Distinguish carrier air, smoke and actual breathable-air rules; a smoke graphic
   is not evidence of oxygen depletion. Outdoor digging must not rebuild indoor
   air that it does not affect.
6. Reconnect one client during active work and perform one owner restart/lost-ack
   check using the maintained host proof. No duplicated cuts, goods, fuel or
   acknowledgements. The other client remains usable.

Budgets are targets, not current results: warmed local full simulation steps
p95 ≤15 ms, p99 ≤30 ms, maximum ≤50 ms during these actions; report field,
geometry, assignment, save and observer costs separately. Hosted command receipt
p95 ≤250 ms and maximum ≤1 s, excluding only explicitly logged transport failure
(which still fails reliability). Foreground browser frame gaps p95 ≤25 ms,
p99 ≤50 ms, no unexplained ≥250 ms stall. No unexplained ≥1 s committed-world
stall. Memory must plateau under repeated cleared work, with live entity/ground
stock/task counts returning to the appropriate occupied baseline. Initial load
and cold recovery are reported separately, never removed from usability review.
Do not change these budgets after a failure to claim completion.

This is bounded active-region acceptance, not an all-world capacity claim.
Generated distant terrain remains queryable without resident air/water allocation.
Multiple-region transport is not a prerequisite for this two-player clearing.
Retain browser and DO hosts over one kernel. Final acceptance includes Levi's
playtest; a scripted run alone is insufficient.

### Required structural change

The current `AirGeometryCache` stores cells, physical faces, per-cell membership
strings and one-layer mixing bins; `prepare_geometry` still gathers/compiles and
binds the whole admitted graph on edits. Those are the concrete superseded costs.

Replace the Colony air producer with coarse connected room/cave sections and
aggregated portals. Retain bounded rebuildable spatial classification for queries
and edit discovery; **do not serialize/hash cell membership as gas state or keep
one gas opening for every exposed voxel face**. Outdoors is an explicit ambient
boundary, not a stack of simulated sky cells. Roofed spaces must remain modeled
when a door opens to outdoors; opening a door must not discard their smoke.
Room split/merge retains stock through deterministic volume overlap. Breaches and
vents are bounded exchange edges; local fluid occupancy changes free capacity.
Tall shafts use a small configured number of bands, not one parcel per voxel
height. Finite smoke/heat sources and boundary ledgers remain authoritative.

Keep physical terrain/structure admission and gas amount ownership separate.
Edits update affected classification and room/portal records; unrelated outside
cuts cannot rebuild, serialize or fingerprint all gas. A topology job that exceeds
its bounded allowance waits while independent work advances; it cannot publish
partial geometry or drop stock. No second browser-side physical simulation.

Before shipping, remove superseded Colony gas compilation/caches and their dead
callers. Preserve a generic authored room exchange owner only if it is an actual
shared consumer, not an adapter keeping the rejected terrain graph alive.

## What the player should get

Build several floors, dig a cellar, light a fueled hearth, and see smoke and heat
collect and escape through actual openings. Opening a door changes ventilation;
flooding a cellar reduces its air space. Closing an impossible sealed space leaves
that construction job waiting instead of deleting gas or freezing other work.
Water still soaks into soil, drains, carries its finite stock and affects plants.

The present Rust model owns carrier gas, smoke mass and sensible heat. It does not
yet own separate oxygen, carbon dioxide or arbitrary chemical species. Do not
describe smoke as oxygen depletion. Later organism/combustion definitions can add
bounded conserved species through the same parcel/transfer ownership; that is not
required to fix the current stall.

This is deliberately coarse game physics: well-mixed small patches, neighboring
exchange and a buoyancy bias. No particle fluid solver, pressure-Poisson solve,
Navier–Stokes grid, or visually detailed smoke simulation is necessary. Client
particles illustrate committed concentrations; they do not carry gas stocks.

## What we measured

The [released-WASM audit](../docs/performance/colony-audit-20260911.md) is the
baseline. Identical 40-step physical fixtures measured water without air at
0.96 ms p95, air with static water at 8.42 ms, and their current coupling at
306.48 ms. A normal full Colony step also repeatedly encodes about 1.74 MB of air
records. Separately, the public one-wall order panics in `Kernel::route_for`, with
air enabled or disabled, after 127 successful steps. Fixing only gas cannot fix
that panic.

The immediate target is the **same** Colony workload with both fields enabled:
remove the repeated hundreds-of-milliseconds water/gas work and materially shrink
ordinary gas capture. A useful first target is combined-field p95 under 15 ms and
full-session step p95 under 30 ms on this same machine. These are qualification
targets, not claims about hosted capacity. Record maxima and saves separately.
The final player acceptance is responsive building/digging with actual smoke;
numerical timings do not prove that by themselves.

## Ownership and representation

* Rust terrain/structure/water owners remain the canonical physical geometry.
* The gas owner keeps a derived cell-to-parcel map, parcel membership, free volume
  and incident openings. It owns gas amounts and source/boundary ledgers.
* Mixing groups are now bounded to 8×8×1 cells, independent of the world metric.
  Colony already used one-metre horizontal cells, so its partition is unchanged.
  Non-unit horizontal metrics intentionally use the cell bound instead of the old
  eight-metre bound. The new geometry identity and terrain-air record version 3
  reject superseded bindings; there is no old-format migration.
* Dense numeric arrays and local adjacency belong inside this field owner. Bevy
  holds entities such as people, structures and emitters; there is no reason to
  create an entity per gas molecule, opening or empty voxel.
* Membership caches are rebuilt from committed physical state on load. They do
  not grant permission to build, exchange material or emit unpaid smoke.

## Classify changes before doing geometry work

| Actual change | Required gas work |
| --- | --- |
| Water moves between soil pores | None: those cells remain solid to air |
| Water changes outside the admitted gas bounds | None in this gas owner |
| Open water changes but has not filled/emptied an air cell | Change local free volume and incident opening metrics; retain membership |
| A cell becomes fully flooded or gets free air again | Repartition its bin/layer and reconnect its boundary faces |
| Dig, wall, floor, door or vent changes | Repartition affected bin/layers and incident faces |
| Fuel emits smoke/heat | Update the receiving parcel and activate its neighboring exchanges |
| Nothing relevant changes | Retain geometry and quiet work state |

Never use `any water mass changed` as a reason to scan all 18,432 covered
positions. Derive changed liquid-volume facts from the prepared water owner;
soil moisture and dissolved contaminants do not by themselves change air space.
Validate proposal ownership/epoch before using this shortcut. The current typed preparation validates even an irrelevant edit. Its accepted
no-change receipt advances only the inspected physical frontier; compiled geometry
and its saved content binding remain unchanged. The next proposal must be newer
than that accepted frontier. No cache update acknowledges an uncommitted edit.

The first repair separates the soil-only case and eliminates duplicate projection
of a real rebind. The next source chunk replaces real-change whole-box projection
with the retained local partition. Until that lands, explicitly report the
remaining cost of flooded-cell and construction changes; do not call a faster
soil-only fixture a bounded incremental topology implementation.

```rust
let water = terrain.prepare_water_step(dt)?;
let change = terrain.air_space_change(&water, air.bounds())?;
let candidate_air = match change {
    NoAirSpaceChange => None,
    Metrics(cells) => Some(air.prepare_metric_changes(cells)?),
    Topology(tiles) => Some(air.prepare_partition_changes(tiles)?),
};
// A blocked candidate publishes neither half of a paired physical change.
// A construction block leaves that job pending; unrelated jobs can continue.
commit_prepared_water_and_air(water, candidate_air)?;
```

These names describe responsibilities, not a mandate to introduce a new public
API. Extend the existing `KernelEnvironment` and `TerrainAtmosphere` owners.

## Splits, merges, water and exterior

Retain carrier, smoke and heat when changing geometry. Allocate old parcel stock
through actual overlapping cell volume, then displace removed volume through real
old open faces with shared receiver capacity. A sealed contraction may increase
pressure within the existing envelope; an impossible contraction is blocked.
Newly exposed underground space does not receive free ambient stock. Ambient
exchange occurs only at the declared real exterior, currently the actual world
top, with signed source/sink ledgers. A query boundary is not an open window.

Partial flooding updates volumes and face wet areas. Full flooding can split a
local component. Opening/closing a door changes topology, even with identical
cell counts. Split/merge tests must include a path around a bin boundary, several
floors, simultaneous receivers and a last-cell removal. Never infer topology from
counts or revision labels alone.

For ordinary edits the affected bin/layers are bounded. Large quarry/build orders
remain existing earned per-cell work. Do not publish part of an atomic structure
because a work budget expired. If an unusually large authored structure exceeds
the admitted preparation bound, reject its definition clearly or explicitly stage
its work; do not create a second generic job scheduler in the gas owner.

## Gas exchange and activity

Keep the current conservative detached exchange solver for the first repair.
Read all flows from the same starting parcel stocks; aggregate donor demand before
applying transfers. Reordering openings must not let the first edge consume all
available stock. Shared receiver and representable-quantity laws remain required.

After the measured geometry/capture repair, aggregate physically equivalent faces
between the same parcels into cached conductances. Keep different elevation,
direction and permeability contributions explicit where they change buoyancy or
wind. Compare aggregate flux with the existing face solver before replacing it.
Retain the physical face index for edit admission and displacement.

Then maintain dirty/active parcel adjacency. Sources, edited openings, water
displacement and changed neighboring concentrations wake work. Quiet air must not
continually allocate thousands of near-zero transfers. A sleep tolerance postpones
exchange; it never deletes smoke, heat or small residual mass. Deferred work needs
a deterministic due time and restart behavior. Measure active and quiet costs.

A lower gas cadence (initial candidate 2 Hz) is a separate measured change after
the structural waste is removed. Emission release remains integrated over elapsed
time exactly once. Settle affected old geometry before changing its openings so a
door does not retroactively ventilate earlier time. Bounded substeps and donor caps
remain; no giant catch-up interval after sleeping. Do not change cadence, physics
constants and geometry algorithms together and obscure what fixed the stall.

## Durable state, capture and restart

The region DO remains the sole durable transaction owner. Candidate terrain,
materials, gas, work completion, revision and command receipt commit together.
Publish only committed observations. A failed SQLite transaction invalidates the
mutated resident state; it cannot be repaired by keeping uncommitted RAM.

Stop serializing thousands of unchanged member/opening definitions on every tick.
For the terrain-produced gas consumer, save compact stocks/ledgers plus a strong
digest of the complete compiled definition and its exact format/revision. Rebuild
the deterministic definition from the saved canonical terrain/water/structures on
restore, verify the digest, then validate every stock and ledger. Current identity
strings are only revision/count labels and are **not sufficient** for this check.
An altered same-count wall, model or ambient must fail binding. No old-save shim.

The standalone authored atmosphere consumer must retain a usable definition
contract. It can explicitly supply its definition on restore; no silent assumption
that it has a terrain generator. Prefer a shared compact stock codec, with each
consumer owning its definition. Do not store a second physical geometry owner.

Later dirty-page capture may reduce unchanged native record copies, but it must
clear dirty state only after the outer durable commit accepts the candidate.
That is not a reason to defer the immediate compact gas record fix or add an
autosave interval. Keep current-format restart/retry/lost-ack laws.

## Client and host responsibilities

Smoke sprites, glow and wind streaks interpolate committed bounded observations.
They run at render cadence independently of the slower field cadence. Player
inspection should expose smoke/temperature, not solver counters.

Terrain edits must invalidate affected terrain patches/picking indexes, not rerender
all 4,096 map columns and rescan a 2304×1536 texture. This separate client repair is
required for playability even after native gas is fast. The retained terrain patch
bake is a reference, not permission to copy old game state into this engine.

Bound host catch-up to one due occurrence per durable transaction/alarm, retaining
its exact scheduled deadline and occurrence identity. Rearm remaining overdue work;
never skip physical time or concatenate five expensive ticks before input can run.
This supersedes the earlier proposed elapsed-cost timer: Cloudflare timers freeze
during CPU-only execution, so an in-process `performance.now()` guard would not
prove that budget. See [Workers timer semantics](https://developers.cloudflare.com/workers/runtime-apis/performance/).
External/native profiling remains useful; elapsed I/O time is not CPU time. Do not
acknowledge uncommitted steps to keep a connection alive. A post-commit publication failure
must not erase the successful command receipt. A native panic detaches the poisoned
resident; a throwing destructor must not hide the original crash. No retry of an
already committed physical effect.

## Implementation and proof order

1. **Root gas repair:** typed air-space invalidation from prepared water; compact
   bound gas records; eliminate duplicate projection on a real change. Focused
   soil/open-water/out-of-bounds, restore/binding and conservation laws.
2. **Independent Luna repair:** current-cursor route splice, actual revisited-cell
   regression and the accidentally dropped blocked-construction guard. This is a
   separate measured crash, not a claim that gas caused it.
3. Build one joined WASM candidate. Repeat the exact 40-step isolation and 160-step
   public Colony dig/wall fixtures from the audit. Report fields, whole step,
   save/observation, memory, errors and completed work separately. Try normal
   smoke emission too; never ship a disabled-air benchmark as the fix.
4. Use remaining hot paths to choose the next patch: incremental actual topology,
   active exchange and client terrain patching. No new lab or blanket ECS rewrite.
5. Publish a coherent correction to the existing Colony once source and changed
   consumer evidence qualify it. Ask Levi to try the same build/dig/hearth actions.
   Do not repeat expensive editor or unrelated historical matrices.

Targets are falsifiable. If soil invalidation and capture improve timings but
the actual wall still stalls, keep that failure visible and fix its remaining
path. Record implementation/results here rather than silently declaring all
future work complete.

## Results

First repair implemented and tried against the existing Colony on September 11.
Full evidence and limitations: [gas-repair-20260911.md](../docs/performance/gas-repair-20260911.md).

| Same local workload | Released baseline | First repair |
| --- | ---: | ---: |
| Water + gas native step, p95 | 306.48 ms | 6.73 ms |
| Full Colony digging step, p95 | about 305 ms | 18.18 ms |
| Full Colony digging step, maximum | 637.78 ms | 432.74 ms |
| Full Colony gas record | 1,737,502 bytes | 8,536 bytes |
| Full Colony save, median during digging | 22.53 ms | 0.43 ms |

The 433 ms digging completion hitch remains. Real geometry changes still rebuild
the broad gas projection. Do not describe this result as completed incremental
topology or a fully playable release. The next performance repair is that real
geometry path, followed by the measured client terrain/picking path. The separate
wall routing panic no longer reproduces in the same 160-step workload, but its
wall remained in planned state at that cutoff; that run does not prove completed
building. Native construction completion/blocked laws passed separately.

Actual WASM Colony tests passed earned two-cell digging followed by exact
save/restore/next-step equality and ordinary hearth fuel delivery, wood debit,
smoke production and restoration. The numerical constants, simulation cadence,
water stocks and smoke model were not reduced. No new browser/DO/deployment or
capacity proof was performed for this first repair.


### Local geometry and indexed remap — second repair

Implemented bounded tile queries for actual water, excavation and structure
proposals. Derived tiles are shared until affected; old/new incident faces are
rebuilt from physical queries, including a removed tile's boundary. Only the real
world ceiling can connect to ambient. Compiled state still uses the existing
conservative stock remap and detached publication. Restore rebuilds the cache.

Water's coordinate index now answers admitted liquid volume directly; each tile
no longer projects the whole water field. Gas remap reuses its canonical member
index and per-volume opening index instead of rebuilding member maps or surveying
all unrelated openings. No source rate, transfer rule or clock cadence changed.

The same full Colony digging fixture now measures 16.22 ms p95 and 172.46 ms
maximum (local WASM, 160 steps). Both digs finish and exact next-step recovery
passes. **The remaining maximum is still too large to call the hitch solved.**
Definition assembly/validation/content hashing and stock remap still visit the
whole admitted gas graph. Observation also resamples terrain columns after edits.
The second repair is not a claim of complete change-local execution.

See [the second repair receipt](../docs/performance/local-gas-repair-20260911.md).
Client chunk baking/picking and poisoned-resident cleanup are separately joined
source; their client/host acceptance is not inferred from these Rust measurements.

### Third repair and real-server acceptance

Equivalent physical faces are aggregated only for ordinary exchange; the original
faces remain for displacement and geometry admission. The same digging workload
now measures 9.67 ms p95 and 127.37 ms maximum. Current terrain observations query
changed columns rather than regenerating every column. These repairs preserve
water, smoke, heat, paid sources and current-format recovery.

The first real local DO trial completed digging, four wood deliveries, building
and paid smoke for two connected clients, but failed responsiveness with a
1.3-second update gap. Native speedup is therefore not the endpoint. Continue
with the actual host/client path, preserving that failure and the same acceptance
threshold. See the [live trial record](../docs/performance/local-gas-repair-20260911.md#actual-local-do-trial-and-remaining-responsiveness-failure).

### Published correction and remaining work

The source/caller repairs above are published from f24881f on the existing
[Colony page](https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony.html).
One actual hosted two-client dig/build/paid-smoke trial passed: command maximum
206.39 ms and update maximum 165.58 ms, with all 158 served files matching the
build. Desktop physical drag input passed locally on the same source. The local
1563 ms storage-boundary wait did not recur in this hosted trial; it remains
recorded, not erased. Use New world for the changed program identity.

The repair goal stays active: global gas definition assembly/remap and quiet/active
exchange remain incomplete, as do broader population and multi-region proofs.
Details and exact limits are in the linked performance receipt. This is a playable
correction, not a claim that every item in this plan is implemented.

### Exact quiet-exchange implementation

The next chunk implements exact activity caching, without the speculative sleep
threshold or cadence change above. Cache the pre-transfer parcel quantities and
raw opening flows. A source or changed neighbor invalidates incident aggregate
openings; changed geometry or timestep rebuilds the cache. An unchanged opening
can skip transfer application only when its transfer is exactly zero. Its raw
flow still participates in shared donor/receiver budgets, so another opening
cannot consume extra capacity simply because this opening is quiet.

The cache is immutable candidate-owned, excluded from saved physical state, and
rebuilt after restore. Failed candidates cannot mutate the accepted cache.
Non-finite flows remain on the checked path rather than being hidden by sleep.
The current implementation still scans parcel signatures and, when work is active,
all raw flow budgets. It is not a claim that all gas work is sparse.

Qualification: 39 native atmosphere laws passed in u6067, including exact dense
reference comparison, source wake/neighbor propagation, quiet cache reuse,
current-format restore, failed-candidate isolation and geometry invalidation.
Independent read-only review found no correctness blocker. The next qualification
compares identical current Colony JavaScript against old and new WASM with an
unlit and fueled hearth, exact saved-state hashes, step/save timings and the
existing hearth consumer laws. Native laws alone do not establish a speedup.

Actual WASM comparison u6069 passed with identical saved-state hashes for both
120-step unlit and burning Colony sequences. The ordinary earned-fuel/hearth
consumer also passed. However this chunk did **not** demonstrate a meaningful
whole-game performance improvement: unlit step p95 5.08 → 5.27 ms; burning step
p95 7.21 → 7.51 ms. Burning median 3.41 → 3.13 ms is insufficient to claim a
robust gain from one run. WASM memory remained 25,952,256 bytes. This is a tested
source experiment, **not a new deployed optimization**. Do not attribute the
previous published speedup to this cache. No browser/server capacity claim follows.

Keep the current live release unchanged. Before accepting this additional cache
complexity for release, demonstrate a named consumer benefit or remove it from
the release candidate. The next meaningful performance target remains broad
compiled-definition assembly/validation/hashing and stock remapping on actual
geometry changes; repeated timing runs of this quiet-hearth fixture are not a
substitute. Exact baseline/candidate measurements are retained in
[gas-activity-20260911.json](../docs/performance/gas-activity-20260911.json).

### Geometry follow-through: ordered openings and lazy evacuation

The retained actual Worker CPU profile contains the compiled-definition and full
opening-sort paths during the existing build/dig trial. These samples select work
to remove; they are not precise per-edit or billable CPU measurements.

Two focused changes now remove repeated work without changing definitions:

* Keep ordered immutable references to existing opening records. Patch admission
  removes replaced face IDs, sorts only new opening references, and merges them
  with the retained order. Initial construction/restore still establishes the
  complete order. The definition uses exactly the original `(is exterior, id)`
  ordering, so content binding and transfer order do not change.
* Build the old gas evacuation graph only if a fully removed nonempty parcel
  actually needs a route. Expansion, splitting, and partial contraction continue
  through their existing overlap/real-face paths without building that graph.

This still copies the retained opening list and materializes/validates/hashes the
full definition. It does not complete local compilation. Qualify exact full
projector parity for internal and sky openings, conservative removal behavior,
and current restore; then compare the same actual Colony dig/completed-wall
workload before claiming a performance gain. Do not publish on source reasoning
alone or replay unrelated browser matrices.

Actual qualification u6080: both dig and completed-wall physical snapshots match
exactly, and each restores to the same next step. Three rebind laws, nine terrain
laws and one sky-opening add/remove law pass. The retained fixture setup failures
and mixed-module harness failure are listed in the measurement receipt.

The measured worst digging step **did not improve** (177.51 → 196.12 ms).
Dig p95 changed 14.36 → 11.91 ms; completed-wall p95 8.41 → 8.48 ms and maximum
180.80 → 176.16 ms. This does not establish a robust hitch reduction. These
source changes remain provisional and undeployed alongside the activity cache.
Do not add more caching around the edges and declare the geometry problem solved:
the next cut must address full definition materialization/compilation and remap
representation itself, using these exact physical/restore comparisons. No broad
browser rerun or another timing-only repetition is warranted by this result.

See [the exact comparison](../docs/performance/gas-geometry-order-20260911.json).

### Source disposition after measurement

The activity cache and ordered-opening/lazy-evacuation experiments are preserved
in private Git history through 806cdb0 with their receipts. They are removed from
the current runtime candidate: the measured benefit does not justify retaining
additional cache state while the main hitch remains. Runtime source returns to
the accepted published 9d08a8e baseline; the added exterior opening regression
and these findings remain. Existing generated WASM is a build artifact from the
experiment and must be rebuilt from current source before any next release.
This is deliberate removal of unproven complexity, not a completed repair.

### Shared immutable geometry representation

The next source cut changes the representation rather than retaining the previous
speculative activity/order caches. Terrain partitions and the compiled atmosphere
share immutable volume/opening definitions. A compiled member index contains
numeric `(volume, member)` references ordered by the original arbitrary cell-ID
string. It no longer owns another copy of every cell-name string. Generic authored
atmospheres enter the same representation through the existing owned definition
API; this does not assume terrain-shaped IDs.

The public owned definition is materialized only on explicit read, lazily. Actual
production save/restore metadata, no-op comparison, remap, exchange and sampling
use shared geometry directly. Shared data cannot share state mutation authority:
each compile still creates a fresh owner token. All validation, numeric order and
content digest bytes remain unchanged. No saved format or physics rule changes.
This still compiles numeric indices and hashes the full graph; it is not yet
complete local compilation. Measure the actual edit workload before accepting it.

Source/type check passed. Focused law execution initially stopped at compiler
output because the root filesystem filled; no law pass is inferred from that
attempt. Only owned obsolete Hive native build outputs were removed (inventory
retained), and the same atmosphere laws now use `cargo test --lib` to avoid
building unused cdylib/integration targets. Source, saves and prior evidence are
preserved. Results will follow below.

The corrected native qualification passes all 36 atmosphere/terrain laws. New
laws verify identical owned-format content binding/save bytes, fresh state-owner
identity despite shared geometry, generic non-terrain member IDs and duplicate
rejection. Independent source review found no semantic blocker; Rust check also
passed. The current WASM dig/build comparison is still required for speed claims.

Shared-only e55c1ec actual WASM result: both earned digs and completed wall match
published-kernel physical save hashes and restore to the same next step. Linear
WASM footprint was 41,222,144 → 33,292,288 bytes in both workloads. Timing does
not establish a gain: digging p95 10.04 → 11.89 ms/max 141.61 → 152.99 ms;
building p95 8.42 → 9.53 ms/max 124.83 → 138.91 ms. The representation is now a
qualified memory improvement and foundation for reuse, not a claimed hitch fix.
See [the paired receipt](../docs/performance/gas-shared-geometry-20260911.json).

The next coupled source uses exact immutable-volume identity to reuse prior
validated aggregates and merge retained member ordering with only changed
members. New/changed members and all cross-volume duplicate/endpoint rules remain
validated. Opening identity uniqueness uses a membership-only hash set, never its
iteration order. Fresh construction and restore still fully validate. This does
not weaken content binding or share physical state-owner tokens.

Volume/member reuse passes 37 laws and actual WASM physical/restore parity
(u6086/u6087). It still does not establish a hitch improvement: dig maximum
149.18 → 177.45 ms, wall maximum 168.11 → 121.37 ms in this pair. Retain
the paired results rather than presenting the wall result alone.

A Node CPU profile of the actual 160-step colony dig workload identified
repeated opening endpoint membership lookup inside compilation (64.83 ms of
samples) and whole-content SHA256 (48.93 ms) as remaining work. These are
sampled local workload costs, not DO billing or capacity measurements.

The next candidate reuses compiled opening metrics and remaps endpoint indices
only when the exact immutable opening and both endpoint volumes survive.
Changed endpoints still take full validation; identity/duplicate checks remain.
The address lookup is private, rebuilt, and kept safe by retained Arc ownership;
it is neither saved identity nor mutation authority. Independent source review
found no blocker; u6089 passed all 37 laws. Actual WASM measurement is pending.

Opening reuse actual WASM qualification u6091 passed with exact earned-dig,
completed-wall, and restore/next-step physical parity. Worst dig step decreased
137.86 → 110.50 ms; worst wall step 160.41 → 72.73 ms. Normal p95 was
essentially unchanged (dig 10.33 → 10.57 ms; wall 9.56 → 9.53 ms). Memory
remained lower: 41,222,144 → 33,292,288 bytes. This supports retaining the
shared compiler reuse, but does not establish playable hosted latency or finish
the repair. Whole-content hashing and full-graph preparation remain; follow the
actual profile before further changes. No new deployment or browser claim.

### Live freeze report — September 12

Levi could complete some digging in the currently published demo, then it froze.
Cause and queue size are unknown. This contradicts any claim of sustained
playability; earlier two-dig hosted proof does not cover this session. The latest
shared compiler changes are not deployed and cannot explain or fix this report
by assumption. Pause the next binding optimization while investigating.

Read current host alarm/transaction/publication and client receive/recovery
callers. A failed due occurrence discards resident RAM and rethrows; publication
errors are reported separately. Neither source fact identifies this incident.
Distinguish browser unresponsiveness from stalled simulation with responsive
camera, capture the actual last committed revision/error where available, and
exercise a larger ordinary dig queue on a separate test world. Do not erase the
player world, skip failed physical work, or claim a cause from slow-tick timings.

### Corrected diagnosis and retained loose-stock rule — September 12

Levi clarified that actors still obey manual movement and then return to storage.
This is not a demonstrated server freeze. Source shows the pantry is finite (20
units), each cut creates 3 spoil units, and the mandatory dig-to-delivery claim
waits indefinitely when the pantry fills. Retained `src/terrain-yields.ts` and
physical completion allow ordinary ground/hand/container custody. Restore that
behavior instead of raising the pantry limit.

Current source: native timed excavation outputs a finite positioned GroundStock
container and ordinary lot, atomically with terrain/water completion. It does not
require actor carrying capacity. Colony retires completed excavation independently
and creates unclaimed ordinary haul requests for loose spoil. Full destinations
are ineligible. When space disappears after pickup, generic drop-lot reparents
the same held lot/water to grounded stock; the delivery releases its actor only
after observing the committed GroundStock custody change. Existing terrain and
supported-frame positions remain native authority. No lost goods, fake completed
delivery, infinite pantry, or bespoke soil transfer loop.

Source evidence: native excavation four laws passed (u6095); native drop preserves
lot/water/recovery and rejects duplicate drop (u6097). Six delivery laws and strict
engine TypeScript pass in the corrected join; first native test fixture used an
unsupported two-second single step and was corrected to two ordinary steps. The
first TypeScript check found a fixture returning the wrong air query shape;
corrected. New support-frame drop source follows the native build and still needs
its focused native check. Colony first source commit 868378d is joined; no latest
WASM/gameplay/browser/deployment acceptance yet. Original soil/stone and carrying
art bindings are reused, not regenerated. Empty stock container/task cleanup and
actual sustained multi-dig completion remain part of the joined acceptance.

### Coarse replacement source checkpoint

`room_topology.rs` now classifies roofed connected spaces separately from directly
skylit cells, with configurable coarse vertical bands. It outputs aggregate room
metrics and room-to-room/ambient conductances; outdoor-only input produces zero
gas sections. An open door does not flood-fill the room into outdoors. Two focused
classification laws pass in u6101 (native exit0). This is **not integrated or a
performance/playability result**: current TerrainAtmosphere still runs the old
producer. Next work replaces its receiver/remap/stock join and local invalidation,
then removes the superseded cell-level gas geometry. The new classifier currently
consumes a full bounded snapshot for initial construction; local updates must not
repeat it across the entire active world. No new WASM/deployment from this pin.

Production callers identified: TerrainAtmosphere fresh/restore/rebind/save;
environment_runtime paid emitter advance; fuel_emission admission; world
atmosphere sampling. Keep ambient portals without outdoor gas parcels. Outdoor
fire still needs explicit paid source/boundary accounting, not a fake indoor
room or a discarded fuel result. Empty room sets and roof removal must conserve
existing smoke/heat via an actual new ambient opening, not silently erase stock.


## September 12 coarse production join — local, not released

The actual TerrainAtmosphere owner now compiles one gas volume per connected
room section and aggregate portals, with four-voxel vertical bands. Spatial
membership remains rebuildable lookup data; it is not encoded as gas members.
Outdoor-only terrain has no gas parcels. Paid outdoor emissions use the existing
detached gas owner to record equal finite source and boundary amounts; no outdoor
cloud grid is allocated. Current terrain-air records are version 4 and reject
older formats. Room split/merge and roof transitions use spatial volume overlap.

Focused native `room_topology` qualification u6113 (invocation
bc721c450a524a72ae728711e3350904) passed 5 laws and diff check. The earlier u6112
compile failure was a test accessing a private field; it is retained separately.
These checks cover room retention through an open door, empty outdoor geometry,
roof creation/removal with conserved ledgers, split and trapped-stock rejection,
and finite outdoor emission with recovery/invalid-source rejection.

This is NOT performance or hosted acceptance. Relevant edits currently still
query and classify the full bounded region. Local invalidation must replace that
path before acceptance. Existing voxel-specific caller tests also need their
assertions recut to actual room semantics. No new WASM or deployment is claimed.
Side query frontiers are not automatically outdoors: they may border another
unmodeled region. Only explicitly known sky exposure is an ambient boundary.
