# Rust water and gas for the playable colony

King Bolete · personally authored September 11, 2026

Status: design, not a performance or deployment receipt. Levi asked
to talk through world generation and groundwater before further implementation;
existing source checkpoints are preserved and no new runtime work follows merely
from this document. This is
part of [DESIGN.md](DESIGN.md) and [DEMO-ROADMAP.md](DEMO-ROADMAP.md), not a new
project. It supersedes the roadmap's former allowance for keeping environmental
hot loops in TypeScript. Native draft `86bc35e` supplies reviewed-in-progress
local transport code; it is not the completed design below.

The subsequent personally authored [implementation decisions](ENVIRONMENT-IMPLEMENTATION.md)
settle the hard runtime, generator, groundwater, coupling and shared-presentation
choices. They supersede the earlier full-clone/full-field-checkpoint sketches.
Implementers use that companion for the exact owner lifecycle and failure rules;
this document retains the model, scope and frozen workload. Runtime work remains
held under the discussion-before-code direction.

## Current implementation reference correction — September 11

The native water/terrain/construction owners now exist; the source inventory at
`6ed6b45` below is historical. Rust atmosphere remains missing. The port reference
is the **final connected-volume** owner in `src/engine/environment/atmosphere/`,
with `goblin-environment/air-state.ts`, `gas-geometry.ts` and `paid-releases.ts` as
real caller references. The older `brewhouse-air`/`environment/air` numerical
study supplies historical conservation examples only. Do not port its velocity,
divergence or pressure-solver machinery into the current engine.

Personally re-read `atmosphere/exchange.ts`, `advance.ts`, `types.ts` and the
public owner: bounded openings exchange carrier mass, smoke tracer and sensible
heat between well-mixed parcels, with explicit ambient export/import accounting.
All incident outgoing flows share the donor budget before exchange; independent
per-edge clamping must not spend a parcel twice. The fixed kernel clock owns time;
the field computes a detached candidate. Room membership and height bands derive
from canonical terrain/structure faces. Doors, vents and liquid displacement
change that geometry; no decorative smoke emitter can substitute for this join.

Fuel and recipes use the existing lot/container mutation owner. Native stage
mechanisms must be generic: TypeScript definitions name stages and configure
attended/unattended duration, consumed inputs, retained vessels and typed output
transformations. Do not create a Rust `BrewProcess` enum hardcoded to prepare,
ferment and keg. Shared work claims and contact rules select eligible workers;
unattended stages use the fixed clock without holding a worker. Finite fuel
transformation and resulting emissions commit together. A blocked output retains
progress and custody rather than consuming again on retry.

## The decision

Use **finite voxel water and connected-volume gas**, implemented in the existing
Rust kernel. Keep the useful simplified retained rules. Remove repeated graph
construction, object allocation, whole-field JSON and per-observation restores.
Do not begin another CFD solver, particles/SPH project, or replacement engine.

The player test is the existing colony: dig a ditch, see water enter it, carry
some water, build upstairs, light a hearth, and open a door or chimney to clear
the smoke. Wet soil affects plants; waste remains something to handle. The
physics detail exists to support these decisions.

| Mechanism | Chosen representation | Gameplay consequence |
| --- | --- | --- |
| Surface water and groundwater | One finite water stock per participating voxel; soil has finite pore capacity and retention | A ditch drains connected wet ground; a well can run down; soil stops absorbing when full |
| Air, smoke and room heat | Small connected, well-mixed volumes with explicit openings and height bands | Smoke spreads through openings; closed rooms retain it; upper rooms and shafts matter |
| Terrain/buildings | One signed integer voxel geometry owner | Digging, floors, doors and stairs change the same geometry used by navigation, water, gas and picking |
| Destruction | Sparse native integrity and the same compound physical change | A cannon breach changes the real wall/openings and finite debris; roof collapse is later |
| Work/materials | Existing jobs, lots, containers and physical completion | Digging produces wet spoil; moving water changes actual custody; burning spends fuel |
| TypeScript authoring | Material/species/process definitions and bounded game rules | Another soil, crop, waste recipe or building adds content rather than another solver |
| Runtime | Same headless Rust/WASM owner in browser Worker or DO | Rendering cannot settle water or fuel; multiplayer acknowledgment follows durable commit |

Deep caves, several storeys and large worlds remain supported design directions.
A small test clearing is a workload, not a hard-coded vertical or digging limit.
The [bounded residency contract](ENVIRONMENT-IMPLEMENTATION.md#2a-large-worlds-must-not-become-large-resident-arrays)
separates world extent, durable changes, resident pages and active work, and sets
initial memory targets. Large-world streaming and cross-DO transfer remain
unimplemented; a small observation packet alone does not prove either.
Celld's low-cost DO hosting remains the accepted premise. This plan does not
reopen tick pricing or require multithreaded WASM to work.

## What the source actually does today

At fresh integration `6ed6b45`:

- `engine/kernel/src/world.rs` owns the Bevy world, native navigation, lots,
  moving supports and projectiles. No colony environmental owner is integrated.
- `engine/src/runtime/session.ts:346` calls `save()` before every step for
  rollback. `save()` exports the entire native kernel as JSON. The native
  `advance_json()` also snapshots for direct/projectile operations. Simply
  adding large water arrays to these snapshots would reproduce avoidable work.
- `engine/src/runtime/region-program.ts:81` creates/restores/disposes a kernel
  for each operation. `parseState()` also restores and exports a session.
  `openRegion` invokes these parsers during admission, authorization and commit.
- `tools/public-engine-host/worker.ts:388` restores another kernel to build an
  observation. These paths discard every compiled environmental cache.
- The retained final water owner is `src/engine/environment/water/`, including
  local transport, communicating-vessel approximation, rebind and vessel exchange.
  The retained final gas owner is `src/engine/environment/atmosphere/`, **not**
  the earlier C gas or Richards/Newton experiments.
- `src/world-presets/goblin-environment/gas-geometry.ts` reconstructs cell maps
  and inspects water facts to derive gas volume/openings. This coupling must
  become a native dirty-cell update, not a full-world fact/JSON round trip.

Therefore this is three related jobs: port the field operations, make geometry
incremental, and correct the host/checkpoint lifecycle. Rust syntax alone does
not solve the second and third jobs.

## September 11 discussion: native generation and real subsurface water

Current source confirmation: the fresh Rust kernel has no terrain/noise generator.
The four packs author initial scenes in TypeScript. The retained generator is
`src/world-presets/height.js`, `height-caves.mjs` and `features.mjs`.
`height-caves.mjs` currently makes only the top two solid voxels soil; deeper
uncarved material is a single impermeable stone type. The retained groundwater
initialization uses one clearing-wide height in `goblin-environment/content.ts`,
assigns water only to original porous soil, and starts voids dry. That explains
why the result behaves mostly like wet topsoil. It is not yet layered geology
with deep aquifers, even though its addressing bounds extend underground.

**Selected design:** put deterministic world generation in
Rust alongside the common physical query, before connecting the new environmental
owner to colony terrain. Port the useful height/sea/cave recipe rather than start
another visual-generator study. Keep the model version and seed in the world
manifest; TypeScript supplies biome/material/landform configuration. One native
sampler must produce coarse map queries and requested voxel bricks without
populating the entire world. Quantize terrain height, not all water surfaces.

The new groundwater baseline should follow generated geology:

1. Generate surface landforms, climate/recharge tendency and drainage regions.
2. Generate subsurface strata: porous soil/sand/gravel or permeable rock, plus
   low-permeability layers. Porosity and permeability are different parameters;
   rock need not be either empty air or perfectly impermeable. Native hydraulic
   classification should be `PorousSolid`, not a hard-coded topsoil species;
   the current draft's soil-specific naming is a port detail to correct with its
   real callers. Soil, sandstone and fractured rock provide different data.
3. Derive a smooth regional starting groundwater head from drainage/geology and
   recharge conditions, then initialize finite pore stocks in connected material.
   Do not simply set one water table a fixed distance below every surface cell.
4. Add selected shallow perched wet layers above low-permeability lenses. They
   use the same stock/face rules. Deep pressurized/confined artesian aquifers are
   a later extension, not implied by an unconfined saturation model.
5. Carved voids connect to their surrounding material. A newly dug mine can be
   dry, seep slowly, or intercept water-bearing rock. Generated flooded caves
   require an admitted connected baseline, not every cave below an arbitrary
   horizontal height being automatically an infinite lake.

After initialization, the stored water and explicit recharge/drainage rules own
change. The starting groundwater head is not an instruction to refill depleted
cells on every load/tick. A displayed water table is derived from saturated
stock/connectivity; it cannot be a second independently mutable reservoir.
Use fine stocks near excavations and active gradients. Later coarse aquifer
storage must partition the same total, with exact promotion/demotion custody;
never run both a full coarse reservoir and a duplicate fine reservoir.

Useful first play: a shallow ditch drains wet ground, a deeper well encounters a
water-bearing layer, and an underground room beside that layer seeps until it is
drained or isolated. Recharge can replenish it; sustained pumping can lower it.
No need to simulate individual cracks or solve groundwater engineering PDEs.
This behavior is a game approximation informed by [USGS groundwater and aquifers](https://www.usgs.gov/water-science-school/science/aquifers-and-groundwater)
and [regional groundwater systems](https://pubs.usgs.gov/circ/circ1186/html/gen_facts.html).

## Botanical pattern re-read for this discussion

Personally checked Botanical Integration `45db487`, read-only:

- `packages/shiitake/src/internal/woodstock/progress.ts` stores live progress in
  an owner-scoped WeakMap/Map, validates work/message identity, increments a live
  revision and publishes observation signals without a SQLite write per update.
- Woodstock records the assistant placeholder and completed message separately.
  `woodstock/index.ts:appendRecordedEntry` deduplicates and writes a retained
  fact in a native transaction, then publishes. `openMuleRecorder` routes message
  updates to live progress and endings to the retained completion path.
- `observation-kernel.ts` owns bounded, coalesced process-local notifications;
  `session-store.ts` owns durable parent/leaf Session entries. This check confirms
  the live-versus-retained split; it does not independently establish every
  upstream Pi in-memory-tree implementation detail.

Adopt that separation: a resident mutable engine, bounded coalesced observations,
explicit attempt/revision identity and a distinct durable result. We already use
client prediction for movement. Optional precommit digging/motion visuals can be
shown as provisional progress bound to a committed base and attempt; they must
be replaceable/reset on rejection or reconnect. They cannot authorize another
player to spend provisional loot or treat an uncommitted wall as durable cover.

The rest of this document's committed observation path means **authoritative
world facts and outcomes**, not a blanket prohibition on provisional visual
feedback. A speculative channel is unnecessary for the first field port unless
actual interaction needs it; it is not a reason to duplicate state or persist
every visual update. Match Botanical's actual contracts instead of transplanting
chat entry trees into the simulation or inventing a second transaction framework.

## Ownership and the data layout

Keep environmental arrays as resources owned by `Kernel`, alongside its Bevy
world. Actors, work, containers and stations remain ECS capabilities. A liter of
water and an air sample are not separate ECS entities. No per-cell ECS query is
needed to find water's six neighbors.

Proposed internal shape, not a second public framework:

```rust
struct Kernel {
    entities: World,                 // existing Bevy owner
    geometry: VoxelGeometry,
    environment: Environment,
    // existing movement, containers, projectiles, queries...
}
struct Environment {
    water: WaterField,
    air: Atmosphere,
    due: FieldFrontiers,
}
struct WaterPage {
    water_kg: Box<[f64]>,
    // Optional bounded constituent channels, allocated only where used.
}
struct WaterField {
    pages: StockPages<WaterPage>,
    geometry: CompiledWaterGeometry,
    active: ActiveFaces,
    scratch: WaterScratch,
    ledger: WaterLedger,
}
struct Atmosphere {
    parcels: ParcelStocks,           // carrier, smoke tracer, sensible heat
    graph: CompiledRoomGraph,
    active: ActiveOpenings,
    scratch: GasScratch,
    ledger: GasLedger,
}
```

These names describe ownership; introduce only the types used by the next real
consumer. Reuse the existing serde/wasm-bindgen/Bevy toolchain. Do not add Bevy
rendering, an inheritance hierarchy, an event-bus simulation or an ECS wrapper.

Use f64 quantities initially, preserving the retained representable paired
arithmetic. World cells have signed integer coordinates; voxel spacing is a
model parameter. Goblin's retained `[1, 0.54, 1]` metre spacing is content, not a
Rust constant. A material gives porosity, retained fraction and rate parameters.
Impermeable rock need not allocate a water stock. Normal dry exposed air need not
allocate smoke effects or one gas parcel per voxel.

Start with 16×16×16 geometry bricks for addressing/cache locality. This is **not**
a DO boundary or a required fully populated field page. Allocate stock pages for
participating/changed areas, with compact dry/uniform encodings at rest. Expand
one representation into another without duplicating physical stock. Measure page
sizes before committing them as a public format; they are private implementation.

Compile coordinate lookup, numeric endpoint indexes, face areas and capacities at
admission/edit. Keep them private and immutable between edits. Cell/face strings
are for definitions, durable identity and diagnostics, not numeric inner loops.
Use compact model/geometry revision references bound to the canonical manifest.
An external `{id, revision}` pair alone cannot authenticate different geometry;
restore validates against the pinned model, generator and stored geometry. Never
store the entire serialized definition as every water state's identity.

Canonical state includes stocks, source/sink/boundary accounts, geometry changes,
field time frontiers, paid release progress and command results. Scratch arrays,
indexes, activity sets, render data and derived pressure/temperature are caches.
Rebuild caches from the committed checkpoint after eviction. Never depend on an
unload callback. Definitions and current snapshot formats are versioned; reject
unsupported versions rather than adding migrations during this rewrite.

## Water: finite quantities, local flow, actual pressure paths

For cell i, let V be its physical volume and rho the declared liquid density:

```text
capacity_i = rho * V * (soil.porosity or 1)
retained_i = rho * V * (soil.retention or 0)
mobile_i   = max(0, water_i - retained_i)
head_i     = bottom_height_i
             + voxel_height * mobile_i / (capacity_i - retained_i)
```

Water below retention is still the same stock. Plants may draw on that stock
through an admitted uptake operation. Soil-to-soil capillary redistribution below
retention is not in the first retained model; do not promise detailed capillarity.

Compile only actual open Manhattan faces. Rate caps use opening area, direction,
soil absorption/seepage and elapsed simulation time. No diagonal leaks or edges
through walls. Pure local exchange preserves the retained rule:

```text
for each due active face, using the same initial stocks:
    if adjacent dry soil can absorb touching free water:
        propose min(retention deficit, absorption_rate * area * dt * wet_contact)
    else:
        propose a head-driven quantity capped by physical transfer rate
        and one sixth of that pair's head-equalizing quantity

sum proposed outgoing, incoming and retention absorption per touched cell
scale each proposal by ALL of its shared donor/receiver/retention budgets
prepare both numeric endpoints; if either is unrepresentable, move neither
apply accepted pairs in stable face order to the candidate
wake changed cells' incident faces for the next step
```

The one-sixth limiter matches a voxel's maximum six neighbors. Incoming water
cannot be spent again in that same snapshot phase. Use reusable dense scratch and
an indexed active bitset/list; no map/string/flow-object construction per pair.
Default stepping returns a changed-cell list and aggregate work, not a history
object per face. Optional debug sampling has a strict cap.

**Covered channels need the second retained operation.** A nearest-neighbor head
rule alone does not correctly equalize a U-shaped, already flooded conduit.
Port the bounded wet-conduit forest from `water/pressure.mjs`: free surfaces
supply heads, full/near-full connected voids supply actual paths, and each shared
neck has a single throughput budget. Do not assign a head to a completely sealed
full component. Keep the retained crest constraint and deterministic tie breaks.
Water never appears at a receiver without a donor and a connected admitted path.

Use half of the field interval for the local phase and half for pressure, matching
the retained owner. Testing a local-only draft with a full interval is not parity
with the combined retained algorithm. Cache connectivity; recompute relevant
routing when geometry, wet connectivity or source heads change. Budget path work
explicitly. A complicated conduit can converge slowly; it must not mint water,
cut through solids or monopolize an unbounded flood search.

A field face can sleep when its evaluated proposal is zero at the declared
resolution and no forcing is active. No epsilon-based deletion of small stocks.
Every source, withdrawal, geometry edit and neighboring stock change wakes its
incident faces. Slow nonzero flows remain due or accumulate a saved fractional
transfer/time remainder; they must not disappear because they are visually small.
The initial all-face draft is a correctness checkpoint, not the final performance
shape. No active-set speed claim until the busy and quiet consumers are measured.

### Soil, rivers, lakes and seas

- Pore capacity is finite. Retention is neither an infinite drain nor a refill.
  Saturated soil seeps when connected heads/rates allow; an isolated finite
  aquifer can be exhausted. Exposing a saturated neighboring wall can fill a pit.
- Digging a wet soil voxel transfers its pore water with the removed spoil, as
  the retained rule already does. The same pore water cannot also appear as free
  water in the new hole. Neighboring seepage is the subsequent source of flooding.
- A closed lake is finite. A river is finite flow from an upstream catchment or
  boundary supply. A spring has a modeled reserve/recharge rule. Rain, evaporation
  and external imports/exports have explicit accounts and finite interval rates.
- A vast sea can be a content-declared boundary reservoir supplying a water level
  and bounded flux at the detailed coast. It is not a million ticking voxels.
  Such a boundary is explicitly open-system accounting, not a claim that the
  detailed region contains the entire ocean. A deliberately finite sea needs a
  coarse finite reservoir owner. Neither means Minecraft-style water duplication.
- Do not reinitialize an altered lake or aquifer from generator defaults on load.
  Unvisited terrain can be regenerated; its pristine dated environmental baseline
  is instantiated once when it enters physical custody. Region growth must admit
  its corresponding baseline exactly once, not repeatedly add "initial water."

### Wastewater and materials

Keep this extensible without requiring biochemical simulation for the first pit.
A bounded sparse constituent set accompanies water: for example nutrient and
contamination amounts. Transport amount with actual accepted water flow and the
initial donor concentration, subject to all shared donor budgets. Clear water
cannot dilute a stored contamination **amount** into nonexistence; concentration
is a derived query. Soil filtering transfers contaminant to a soil/sediment stock;
treatment/decay records an explicit transformation. Adsorption and capacity are
material rules, not `if goblin_piss` in Rust.

A pressure shortcut must not teleport new pollutant through clean water in a full
pipe. Its accepted path flow must advance constituent custody through the stored
conduit contents, or use a declared conservative well-mixed pipe-volume model.
Scalar water parity alone is not tracer parity. Add the contaminated-water case
before advertising sanitary pipes.

Solid waste stays a material lot until a dissolution/compost process transforms
it. Fertility, moisture, crop preference and pathogen effects are different facts.
Waterlogging may hurt crops. Evaporation may export water to an explicit external
account initially; vapor/condensation/latent-heat simulation is a later capability.
The game must not label a cosmetic steam sprite a proved physical phase change.

## Gas: small connected volumes, smoke and heat

Reuse the retained horizontal connected-volume partition: connected cells on the
same physical height inside an 8-metre horizontal bin share a parcel. Walls and
registered separating faces split it. Vertical faces, doors, shafts and chimney
openings remain edges. This preserves upstairs/downstairs behavior while avoiding
a gas solver on every empty voxel. The bin span is private tunable model policy;
it is not a room-size restriction. A large hall contains several exchanging
parcels rather than mixing instantaneously across a whole castle.

Each parcel owns carrier gas, a dilute smoke tracer and sensible heat. Derive
volume, temperature, pressure and smoke concentration once per active parcel per
substep; reuse them at its openings. Smoke remains the retained approximate
tracer, not a claim of full combustion chemistry. Oxygen/fuel-limited combustion
and additional gas species follow via explicit channels and reaction primitives.

Keep a fixed thermal reference temperature per model. Weather changes the
external boundary temperature, not the meaning of already saved sensible heat.
Do not silently rebase all heat by changing an ambient constant.

```text
for each active opening, from one initial parcel snapshot:
    mixing_volume = opening_area * permeability * dt
                    * (mixing_speed + bounded buoyancy_assistance)
    pressure_volume = opening_area * permeability * dt
                      * pressure_coefficient * (P_left - P_right)

sum GROSS incoming and outgoing volumes at each parcel
scale exchanges so no parcel exchanges > configured fraction per substep
mix tracer/heat/carrier by concentration differences
advect one complete carrier/tracer/heat parcel for directed pressure flow
prepare all advected constituents before publishing any one of them
record external transfer in the corresponding signed boundary accounts
```

Start from the retained coefficients, 0.25-second maximum substep and 25% gross
exchange cap. This is buoyancy-assisted room mixing, not resolved air velocity or
accurate chimney engineering. Sealed smoke does not disappear. Cooling needs an
explicit boundary/solid heat exchange or process; it is not reset-to-room-temperature.
Normal source capacity/temperature guards must map to an honest process outcome,
not repeatedly fail the entire game tick. If legitimate hearth play exceeds a
prototype envelope, revise the declared model/fixture; don't delete heat to pass.

Build connected membership on topology edits, not every smoke tick. Water-level
changes usually update member free volume and a few opening areas; update only
those metrics. Repartition only on actual membership/open-connectivity changes
(such as flooding a passage or finishing a wall). Recompute affected local bins
and incident edges; union-find alone is insufficient for deletions/splits.

Quiet parcels with no source and no representable gradient do no exchange work.
A changed neighbor or boundary forcing wakes them. Visual smoke wisps can update
at display rate without creating gas, changing breathing damage or consuming fuel.

## Water, air and edits must settle together

Only one geometry authority decides whether a voxel is soil, stone, free space,
a wall, or a floor face. Its typed delta names changed cells/faces. Navigation,
water, gas and presentation derive from the same accepted revision. Unknown is
not empty or ambient. Public observations apply discovery rules before projection.

Free gas volume in a void is `voxel volume - free liquid volume`. Soil pore water
is not subtracted again from navigable air. Rising water changes free volume and
face openings; it cannot erase the stock of air in a trapped pocket.

For ordinary flow, prepare changed water cells and their affected gas metrics
as one environmental candidate. Account for gas back-pressure and displacement
through actual open faces. The [bounded coupling rule](ENVIRONMENT-IMPLEMENTATION.md#5-bound-the-waterair-join-do-not-iterate-a-coupled-solver-to-convergence)
specifies compression capacity, topology remap, complete mixture transfer and
dependency-closed rejection. It permits one conservative recomputation, not an
unspecified search for a smaller timestep. Blocked work wakes on relevant changes;
unrelated room exchange and actor work can continue.

For a construction/dig completion:

```rust
fn prepare_completion(world: &WorldView, request: Completion) -> Outcome {
    let geometry = world.geometry.prepare(request.edit)?;
    let material = world.materials.prepare_cost_and_yield(request)?;
    let water = world.water.prepare_rebind(&geometry)?; // includes wet-spoil export
    material.bind_water_exports(&water)?;              // same removed stock once
    let air = world.air.prepare_rebind(&geometry, &water)?;
    // Also validate support, occupancy and navigation at this geometry revision.
    Outcome::Prepared(CompoundChange { geometry, material, water, air })
}
// Publication is one kernel transaction. A blocked candidate changes none of
// these owners; that job waits, keeping earned work according to job policy.
```

This is an internal compound operation, not game code coordinating mutable maps.
Do not complete/spend a job, then discover gas rejection and roll back unrelated
whole ticks. Do not add a free-water fixture exception or direct-under-every-floor
support rule. Preserve the retained supported spans and multi-storey definitions.

Keep edit-work bounds distinct from physics permission. A queued large quarry may
be completed in smaller voxel/job units with visible progress. It is not grounds
for "soil cannot be dug here" across otherwise legal terrain.

## Cheap checkpoints and actual durability

Separate three things that are currently conflated:

1. A **native attempt** is exclusive provisional physical work in memory.
2. A **committed active view** is a cache of one exact durable revision.
3. A **save/export** is the complete versioned state needed after process loss.

The [selected runtime and record boundary](ENVIRONMENT-IMPLEMENTATION.md#1-keep-a-live-world-recover-failures-from-committed-state)
removes whole-world JSON copies and per-operation reconstruction. An active host
owns one exclusive resident candidate. Expected local rejection uses prepared
physical deltas; unexpected/outer-commit failure discards the Kernel and Session
together and reloads committed state. No universal ECS undo or clone is required.
An observation cannot inspect the candidate during a storage await.

The same Region transaction commits opaque native records, small Session control,
receipt, events and clock frontier. Environmental stock pages are persisted only
when changed; the bounded entity record is still exported once per commit and
must be measured. Postcard is selected for typed native records, pending actual
WASM qualification. The companion specifies world-local component registration,
wire types, record bounds, retries and outermost-commit promotion. Game code gets
no independent storage/commit capability. Current JSON-only callers change
together; no compatibility adapter or parallel owner remains.

The actual worker nests Region's synchronous transactions inside
`state.storage.transaction()`, including alarm work. An inner callback returning
is not sufficient cache-commit evidence. Transaction retry restarts from the
correct committed base; failure after a callback has prepared data must still
abort/invalidate RAM. Serialize owner work explicitly; handle disposal and WASM
memory growth without retaining borrowed views. Copy bounded output bytes before
an async host operation; never pass a live mutable WASM view as a durable snapshot.

Crash before commit leaves no acknowledged effect. Crash after commit but before
response returns the prior receipt on retry. Reopening loads the committed bytes,
not the last browser frame. A failed SQL transaction does not undo Rust memory.
Local prepared operations, Region rollback, outer alarm rollback and lost response each need
one focused witness. Reuse current restart/receipt harnesses rather than building
another server. Browser-authoritative play uses the same native trial/format and
its local save owner, without pretending local RAM is a durable server.

Cloudflare's [SQLite storage contract](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
supports transactional storage; RAM rollback is still our responsibility. Existing
[durability/sleep contracts](../docs/decisions/local-snapshots-and-durable-ai-jobs.md)
and accepted host evidence remain the authority on what is already proved.

## Clocks, inactivity and region boundaries

Start with water at 5 Hz and gas at 2 Hz, separately accumulated from the existing
host game clock (currently 100-ms occurrences). Gas's 0.5-second due interval uses
two 0.25-second substeps initially. Actions, physics substeps, presentation and
network observations do not need matching frequencies. Field cadence/remainders
are saved. Later tuning changes the model version/parameters, not wall-clock hacks.

A topology edit or source event splits elapsed time: simulate up to that ordered
boundary before applying it. Never run a newly opened door retroactively over
past smoke. Paid releases own a saved amount/time cursor, not an extra setInterval;
retries cannot burn the same fuel twice. A new source wakes its field immediately.

Bound work by active cells/edges and admitted elapsed interval. Work counters are
cheap counters, not per-cell timings. If a component needs continuation, preserve
its work/time frontier and fair continuation order; do not silently drop elapsed
time or advance half a face without its counterpart. Authoritative interactions
requiring an unsettled field wait for its relevant frontier, while unrelated
work can proceed. First colony qualification must show no sustained backlog on
the declared workload. Slow catch-up is not an excuse for daily-play stutter.

Settled regions may sleep. Safe closed stocks stay stored. Supported quiet
ventilation/cooling/growth use bounded elapsed-time rules and saved forcing
intervals; sealed smoke does not reset. Active hazards and transfers keep only
necessary work due. Sleeping is not a promise to reproduce every missed frame,
and unsupported coarse behavior must remain explicit rather than fabricated.

A geometry brick is not a DO. A region owns multiple bricks; do not create a DO
for every chunk, empty cave or map pixel. No global world tick/barrier is required.
Region halos are read-only observations of neighbors, never spendable stock.
Until a real transfer protocol is qualified, demo edges are explicitly closed or
content-declared external reservoirs—not fake seamless distributed water.

Later inter-region flow uses durable reserved export lots and destination receipts:
source removes stock into an in-transit record, destination admits/deduplicates
it, and source retires the record after acknowledgment. The payload carries its
water/constituents and causal frontier. Destination rejection leaves source-owned
in-transit custody until a durable return is admitted; a timeout alone must never
refund and duplicate a possibly accepted delivery. Destination admission checks
current geometry/capacity. No two-DO atomic-commit claim. Rate-limited seam flow
may lag locally; cross-region pressure equalization is separate acceptance before
calling an ocean-spanning conduit seamless. This seam does not block first-region
play, and no new distributed scheduler is part of this port.

## Public TypeScript shape and presentation

Content describes behavior using checked definitions. It cannot arbitrarily write
mass arrays or call an unmetered solver for every pawn:

```ts
// Illustrative author-facing vocabulary, to be proven with actual colony callers.
const loam = soil({ porosity: .45, retainedFraction: .18,
  absorption: .003, seepage: .001 });
const hearthFuel = releaseProfile({ input: wood, duration: seconds(60),
  outputs: { smoke: smokeAmount, sensibleHeat: heatAmount } });

// Same work/material owner as food delivery; quantity units are explicit.
work.deliver({ from: visibleFieldWater(cell), to: pail, amount: litres(1) });
work.excavate({ selection: knownVoxels, yield: terrainMaterialRules });
work.process({ station: hearth, recipe: hearthFuel });
```

Field/vessel exchange must reconcile continuous kg with native lot units. Declare
liquid base units/density at material admission; quantize only the requested
transfer (for example whole millilitres), retaining residual field stock. Debit
water and credit the existing lot/container in one operation. Do not represent
one litre simultaneously as a field amount and a cargo counter. Mixed material
capacity must use the declared capacity dimension, not treat a kilogram as an
item-count slot. This extension belongs to the common material owner, not a new
water-hauling executor.

Expose scoped queries for visible cell wetness/water depth, visible room smoke/
temperature and admitted source availability. Use numeric IDs/dirty ranges at the
Rust boundary and bounded owned wire copies. Do not stream deep hidden caves,
per-face diagnostics, whole snapshots, or arbitrary internal ECS memory to players.
The same admitted queries/actions serve human and Shiitake controllers.

The shared client draws the existing original voxel/sprite assets. Liquid level
may vary inside a voxel; terrain elevation stays integer. Render smoke/dust with
pooled effects driven by committed concentrations/events. It may interpolate
visual levels, but cannot predict uncommitted resource transfers or create water.
Build/update only dirty visible meshes/tiles. Cursor picking, layers, box gestures
and depth ordering reuse the retained common controls; don't create another UI
just to demonstrate the fields.

## The implementation sequence and what Levi gets

| Chunk | Bounded outcome | Acceptance / playable value |
| --- | --- | --- |
| 1. Native owner and host lifecycle | Correct/qualify current water module; port gas parcel exchange; local prepared operations; resident host and native record boundary | Matched retained numeric cases plus existing DO retry/restart laws; no claim of colony completion from a microbenchmark |
| 2. Wet ground in the existing colony | Shared generated integer terrain/query; reachable excavation; finite water/pressure; wet-spoil settlement; changed-cell projection and retained controls | Dig a ditch and see neighboring wet ground fill it; water remains after reopening; no duplicate pore stock |
| 3. Build and ventilate | Common material-funded walls/floors/doors/stairs; three above-ground storeys and two underground rooms; gas geometry/metric join; finite hearth emissions | Light the hearth, observe smoke in actual rooms, open a door/chimney; edit blockage affects one job rather than freezing everyone |
| 4. Ecology and hygiene loop | Common pail delivery, planting, crop water use, contaminant transport and a finite waste-to-treatment process | Water a crop and handle dirty water through the same storage/work owners; no bespoke thirsty-customer simulation |

Each chunk stays reviewable in isolated writing roots with one writer per coupled
seam. Root owns algorithms, geometry/transaction decisions and art acceptance;
Luna implements bounded decided operations. An independent source reviewer checks
actual callers. Do not make every row into a new team or wait for all four before
showing a coherent playable increment. Existing cannon/survival/ship gains remain.

Within chunk 1, the first physical acceptance is native water + rollback, followed
by its colony join; gas can develop independently on agreed files and join as soon
as real room geometry is available. Host changes must qualify all existing four
pack callers together. Public URLs stay the same. No fifth science-demo page.

## Frozen workload and decision thresholds

These are proposed acceptance budgets, **not measured capacity**. Save the exact
fixture, machine/runtime, source revision, elapsed simulation time and constants
before measuring; preserve reds rather than changing the fixture until it passes.

First representative colony: 20×20 horizontal cells, a 24-voxel address band
(-8 through 15), 20 working/moving actors, three four-voxel storeys, two dug rooms,
a 32-cell flowing ditch, wet soil and two finite hearth sources. This band is the
fixture, not the engine's global height range. Port the actual generator and
physical construction definitions; never use a numerical flat-room substitute
as the only public result. Geometry addresses are not equal to active water cells.

Controlled busy profiles additionally exercise 1,024 changing water cells and
256 gas parcels/2,048 openings. Record actual visited faces, active pages and
source workload; do not derive a capacity claim from idle entries.

| Cost, release WASM on the named host | Initial engineering budget |
| --- | --- |
| Active water due update | p95 ≤ 5 ms |
| Active gas due update, including its bounded substeps | p95 ≤ 2 ms |
| Ordinary complete simulation tick, including TS rules and native trial work | p95 ≤ 15 ms CPU, measured separately from waiting/storage |
| Small-colony durable alarm/command work | p95 ≤ 50 ms local elapsed time; report serialization and SQLite separately |
| Quiet state | No solver edge work when no due source/gradient; no full graph reconstruction |

Native desktop Rust numbers are informative; actual WASM/DO results decide the
host acceptance. Measure compile/load separately from steady stepping and
serialize/commit separately from numerical work. Record p50/p95/max, bounded
memory and allocations after warm-up. Test simultaneous water/gas, not only their
best isolated cases. Do not infer browser frame rate from server CPU.

If a target misses: first inspect visited work, repeated initialization, allocation
and wire size. Then adjust activity/cadence/representation under explicit gameplay
tolerance. Do not loosen conservation, run ever larger benchmark matrices, switch
languages again or pretend an arbitrary neighbor update is constant total cost.
The small active colony should be easy relative to these budgets; that is a design
expectation to test, not a guarantee. The user's actual playtest remains decisive.

## Focused laws that protect the game

- Finite, nonnegative, capacity-bounded water; finite gas and defined vacuum;
  paired representability; admitted source/sink accounts. Shared donor competition
  never overspends. No hidden clipping, deletion or ambient replenishment.
- Restore under pinned definitions produces the same next step. Stable ordering
  removes dependence on hash iteration. Unsupported formats fail clearly.
- Digging transfers pore water once; blocked air/liquid/occupancy leaves the
  completion's materials and geometry unchanged. Other independent work proceeds.
- Rain/pail/plant/treatment/pressure operations conserve their declared stocks.
  Source ledgers are not permission to materialize an unpaired paid process.
- Smoke crosses only actual openings. Metric updates don't change membership;
  topology split/merge/removal conserves stock, and trapped volume is not erased.
- Activity wakes from every mutation owner; sleeping/repeated wake doesn't erase
  small flows or duplicate production. Budget continuation has a saved frontier.
- Crash/SQL failure/outer alarm failure/retry doesn't duplicate effects or expose
  a provisional world. Cross-region timeout never returns an uncertain export.
- Actual public observations show only committed, known-world cells/rooms.

Run affected native/actual-WASM laws once per coherent candidate, then the short
changed-colony interaction and existing durability witness where invalidated.
No repeated editor/browser matrices. A single failure receives a focused fix and
focused retest. Source review and measured costs accompany, rather than replace,
the playable increment.

## Remaining deliberate limits

No fluid velocity field, turbulence, surface tension, hydraulic erosion, accurate
flood engineering, molecular gas chemistry, automatic biome climate feedback, or
whole-world multiregion pressure solve is required for these releases. Fire
spread is a later material/neighbor hazard operation over these fields. Ships
sample water surface/current policy; wave animation is not a global ocean CFD
simulation. The engine remains usable outside DOs, while this design must first
work single-threaded in its actual browser/DO WASM consumers.

[Bevy ECS](https://docs.rs/bevy_ecs/latest/bevy_ecs/) remains the maintained entity
component foundation. It does not prescribe one entity per fluid voxel or supply
our game field/conservation/durable-commit semantics.
