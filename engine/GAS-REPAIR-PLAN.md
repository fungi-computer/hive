# Gas repair: playable rooms in the existing Colony

September 11, 2026. King Bolete owns design, integration and acceptance.

This implements the incremental-field direction we already chose. The released
implementation failed to follow that direction in its geometry and persistence
paths. It is not a new physics project or a new demo. Status and measured results
must be appended below; this plan alone is not an accepted implementation.

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

Bound host catch-up work by elapsed cost as well as tick count. Do not acknowledge
uncommitted steps to keep a connection alive. A post-commit publication failure
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
