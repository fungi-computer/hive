# Native environment: decisions for implementation

King Bolete · September 11, 2026 · personally designed after Levi's Ultra request

This completes the hard-design pass for [WATER-AND-GAS.md](WATER-AND-GAS.md).
It selects implementation rules; it is not implemented or measured behavior.
Levi's discussion-before-code instruction still holds. Native draft `86bc35e`
stays preserved, unintegrated and unqualified. No new runtime assignment follows
from this document alone.

The product is a colony where digging, building, irrigation and ventilation
matter, sharing its engine with Survival, Formations and Pirates. These decisions
do not add another demo, physics laboratory or engine rewrite.

## 1. Keep a live world; recover failures from committed state

Source baseline `3318a54`: `GameSession.step` saves the complete native world
before every tick; native `advance_json` may do that again. The Region program
creates/restores/disposes another kernel per operation, and the DO restores
another for an observation. Remove these repeated paths together.

**Choose an exclusively owned resident candidate, with discard on failed outer
commit. Do not build a general Bevy-world clone or universal undo journal.**
Bevy component IDs are world-local; our Registry also owns dynamically registered
authored records. Routes, direct-input queues, ID counters, contacts and indexes
live outside the ECS. A superficially cloned `World` does not cover them.

There are two kinds of failure:

- An ordinary rejected action, such as a blocked wall or a full pail, is a typed
  result. Prepare that operation against unchanged facts, then publish its local
  change only if every participant admits it. Other actions can continue.
- A thrown rule error, corrupt native output, failed encoding, failed database
  transaction or unexpected native error invalidates the **whole resident
  attempt**. Dispose its Kernel and Session together; restore the last durable
  revision before serving another query or command. Recovery can be slower than
  the successful path. Never continue using partially mutated RAM.

Only the host's serialized operation can observe its candidate. User game systems
run synchronously through the current bounded read/write/action context. No
arbitrary asynchronous callback can retain an engine mutation handle. WebSocket
observations either use the previous immutable presentation packet or wait until
commit; they cannot inspect the candidate halfway through a storage await.

```ts
// Proposed changes to existing Region/Session ownership, not current exports.
await owner.serial(async () => {
  let attempt: Attempt | undefined;
  try {
    const result = await owner.outerTransaction(async tx => {
      // A storage callback may be retried. Its previous candidate is unusable.
      attempt?.discard();
      attempt = undefined;
      const receipt = region.findReceipt(tx, principal, id, canonicalCommand);
      if (receipt) return { replay: receipt };

      const base = region.readHeader(tx);
      attempt = active.takeExclusiveAt(base); // exact match, otherwise hydrate
      region.authorize(principal, command, attempt.readOnlyView());
      attempt.session.execute(command);      // native + TS control state
      const change = attempt.prepareDurableChange();
      region.commit(tx, base.revision, change); // state, result, events, frontier
      await host.armRequiredWake(tx, change);  // existing outer owner transaction
      return { receipt: change.receipt, revision: change.revision };
    });
    // The outer transaction, including alarm/host writes, has now succeeded.
    if ('replay' in result) return result.replay;
    active.accept(attempt!, result.revision);
    publishCommittedProjection(result.revision);
    return result.receipt;
  } catch (error) {
    attempt?.discard();
    active.invalidate(); // also if transaction exit failed after callback return
    throw error;
  }
});
```

`takeExclusiveAt` marks the active object unavailable to other readers; it does
not copy the entire world. Taking a candidate and later discarding it also
invalidates the corresponding Session RNG, queues, impacts and cue frontiers.
Retries restore these with native state. An error after SQL committed but before
RAM promotion is harmless to durable truth: reload and return the saved receipt.
Do not attempt a compensating physical action.

Player admission still queues checked intent; it does not secretly advance the
world. Only the existing authorized host occurrence steps simulation. Its action
results distinguish queued, applied and rejected work. When `runDue` processes
up to five occurrences inside one outer transaction, use one exclusive attempt,
retain each occurrence's receipt/frontier, and coalesce the final dirty records.
Do not promote the candidate or clear its dirty tracking after an inner Region
return. Failure in the fifth occurrence invalidates the entire uncommitted batch.

Change `KernelPort` and all actual browser/DO callers together: a fatal advance
error poisons that attempt; an ordinary rejected action does not. Local physical
operations need bounded prepared deltas, but the kernel does not need an undo
implementation for every possible combination of ECS mutations. Environment
proposals use reusable scratch and copy only touched pages when preparing a
fallible compound edit. Nothing writes shared stock while still deciding whether
the edit is admissible.

The browser Worker must adopt the same attempt lifecycle. **Today**
`engine/src/runtime/worker.ts` steps/results in memory and saves only on a separate
request; it does not acknowledge durably saved gameplay on each tick. Preserve
that explicitly ephemeral mode with a committed in-memory recovery record set,
or use the existing local save owner for a requested durable save. A durable
local-host mode must join its save transaction before claiming durable work;
it is not already implemented. Rendering, prediction and audio stay outside
both simulation hosts.

## 2. Persist bounded records, not a full field inside every JSON snapshot

Keep the existing Region transaction/receipt/event/clock owner. Replace its
JSON-only state boundary for this consumer with **opaque versioned records**.
This is one state, in the same SQLite transaction, not a second database or an
environment event-replay service.

| Record | Owner and update rule |
| --- | --- |
| Header | World/generator/content identity, schema, durable revision, clock/frontiers, record counts and byte accounting |
| Session control | Current RNG, pending intents, system versions, outcome/impact/cue frontiers; existing bounded TS state |
| Entity state | Native typed component records, stable IDs, routes, direct streams, counters and contact suppression |
| Geometry edits | Changed material/face records keyed by geometry brick; unchanged terrain derives from the pinned generator |
| Water stocks | Fixed stock pages per channel, changed pages only; finite initial-admission records are retained |
| Air stocks | Parcel stocks plus stable membership/version binding per affected bin; derived adjacency rebuilt after load |
| Ledgers/work | Sources, sinks, transfers, conserved constituents and causal work frontiers |

Start with the existing bounded entity snapshot as typed native records, framed
into bounded parts (initial maximum 256 KiB each). Do **not** also rebuild the ECS to
validate that export. Entity export is still O(entities), an explicit remaining
cost to measure on actual moving/working populations. Environmental pages are
separate from the start so adding deep terrain does not enlarge every tick's
entity serialization. General incremental persistence for every ECS component
is not required to land the colony field.

Geometry addressing uses 16-cube bricks. Use 8-cube stock pages initially:
512 f64 values are 4 KiB per channel before framing. These private sizes may
change with a format version; neither limits world height nor creates a DO.
Do not serialize dry unowned space, compiled adjacency, scratch, query indexes,
active renderer objects or full definition JSON in every page.

```ts
type PreparedStateChange = {
  baseRevision: number;
  nextRevision: number;
  header: Uint8Array;
  puts: readonly { key: StateRecordKey; bytes: Uint8Array }[];
  removes: readonly StateRecordKey[];
  result: CheckedResult;
  events: readonly CheckedEvent[];
};
// Region checks unique keys, revision, per-record/aggregate bounds and accounting.
// Only the admitted engine program produces this; game content gets no SQL API.
```

Update records, header/accounting, receipt and ordered occurrence frontier in one
owner transaction. Records not touched in this revision retain their prior bytes;
the header does not imply every record was rewritten. Reading the full committed
record set occurs on hydration/export, under a coherent committed revision.
The first bounded-region host hydrates its owned set once; lazy disk paging and
distributed ownership transfer are later changes with their own evidence.

Select **Postcard** for typed native record bytes, subject to the ordinary real
WASM round-trip qualification. It uses Serde and has a documented stable wire
format; that is not a guarantee that our schema can change without a version.
See [Postcard's maintained documentation](https://docs.rs/postcard/1.1.3/postcard/).
Encode authored values through their existing declared field types into an
explicit wire enum (number, boolean, string, entity reference, null), rather
than assuming `serde_json::Value` is a schema-free binary decoder. This is a
wire conversion, not a second mutable component store.

On hydration register the pinned schemas into the new Bevy World first, then
decode component records through that world's Registry. Never persist/copy raw
Bevy component IDs or entity handles as portable identity. Restore stable IDs,
routes, direct queues and contact suppression; rebuild contents/collider/query
indexes from canonical state before admitting another operation.

Decode length/count limits before allocating collections, check finite values
and relational references, and reject trailing bytes/unsupported formats.
No Base64 in SQL, compression requirement, custom codec or old-save migration.
Copy output bytes out of WASM before any await; memory growth invalidates borrowed
views. Patches always derive from one exact base revision and are single-use.

The existing maximum state/store limits must become explicit record-set limits
chosen from the named workload and measured encoded bytes. Do not silently raise
them, retain a 256-KiB JSON default by accident, or mistake a new bound for proven
capacity. Large import/terrain-admission work stays bounded and resumable before
it becomes spendable physical state.

## 2a. Large worlds must not become large resident arrays

Levi asked bluntly whether this design would outgrow DO memory. **It would if we
loaded a whole deep world, all its field channels and its checkpoint copies.**
That is prohibited by the following bounded-residency contract. Sending a small
render projection alone does not solve server memory or simulation cost.

Separate four sizes: the addressable world, its durable changed data, currently
resident pages, and currently active simulation. They must not share one limit
or one dense array. For example, 128³ cells already require 16 MiB for just one
f64 channel; four channels require 64 MiB before geometry, gas, ECS, scratch,
serialization, JavaScript and WASM runtime overhead. That is arithmetic, not a
measured capacity claim.

- Generate unchanged terrain from the pinned seed. Keep a bounded geometry cache;
  cold edited geometry is restored from its durable records. A world coordinate
  can be far away or deep underground without allocating all intervening cells.
- Store lasting water/contaminants, damaged/removed material, contents and claims
  durably. Cold does not mean reset, and sparse encoding does not mean omission
  of modified zero-stock records that would otherwise regenerate as wet.
- Simulate admitted active water faces and air openings near activity. An empty
  sky is not a dense gas box; detailed atmospheric ownership follows relevant
  enclosures/hazards and explicitly classified exterior boundaries.
- Retire only **committed, quiescent** field pages from RAM. Persist unsettled
  work/frontiers first. Active flow needs its neighbor halo and real capacity;
  a missing page is neither dry receiving space nor an infinite source.
  First bounded-region hydration can load its admitted set; larger cold sets
  require the pager/activation join before that storage size is advertised.
- Clients get discovered visible geometry and bounded field projections. Rust
  does not send all underground cells, compute particle positions, or store art
  atlases in a DO. Reconstructing a visual from a material ID saves presentation
  data; it does not replace physical quantity state.

Initial qualification target: at most 32 resident 16³ geometry bricks and a
16-MiB budget for owned native canonical/compiled data, with a separately bounded
8-MiB transient allowance for scratch/encoding/projection. These are **engineering
targets to qualify**, not current allocator guarantees or a playable-world size.
The earlier 20×20×24 busy fixture remains the first performance workload. The
resident-page ceiling must be lowered if real compiled graphs/actors exceed
the byte target. Do not allocate all six neighbor-face objects for every voxel
when a regular stencil plus sparse face exceptions suffices.

Account for peak memory, not only serialized save size. Never hold old world,
new world, whole JSON save and several export copies simultaneously on a normal
tick. On failed-attempt recovery release the poisoned world before rehydrating.
Freed Rust objects can reuse WASM allocation; WASM linear memory does not shrink
just because `free()` was called. Record both live allocation and linear-memory
high-water growth through repeated edit/retire/reload cycles.

Cloudflare documents a 128-MB **isolate** memory limit including WASM; multiple
objects can share that isolate. This is not a guaranteed private 128 MB per DO.
See [Workers memory limits](https://developers.cloudflare.com/workers/platform/limits/#memory),
[DO memory sharing](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/)
and [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/).
SQL rows/BLOBs also have a 2-MB limit, hence bounded native records. Celld remains
the accepted cheap target; its configured memory envelope is a host parameter,
not evidence that the current Cloudflare demo has unlimited RAM.

The host therefore also needs a bounded aggregate resident-cache policy. A clean
idle world's cache may be dropped and rehydrated later; an in-flight candidate
is pinned until commit/abort. Do not create unbounded retained kernels in a
module map. The current wasm-bindgen module initialization is shared within the
worker, so per-Kernel estimates alone are insufficient. Qualify several co-resident
owners and actual aggregate peak before claiming this lifecycle scales. This
policy manages rebuildable memory only; it grants no cross-world mutation rights.

Later world routing assigns multiple independently owned regions to DOs, each
with bounded working state. The first region keeps stable ownership; automatic
live repartition is not required for the colony port. Inter-region actors/goods/
water need the durable handoff described in WATER-AND-GAS, and it is **not yet
implemented**. When a region's active workload cannot fit, the engine must report
admission/backlog pressure and support a real partition/host policy; it cannot
silently discard water or pretend more DOs make one tightly coupled battle free.

The practical order is bounded resident colony first, cold-page revisiting next,
then an actual two-owner handoff. World-scale distribution is achievable design
work, not a capability proved by today's four small DO demos.

## 2b. Compute placement is separate from state authority

Levi's September 11 correction: an army-movement DO, terrain DO and coordinating
DO are a legitimate architecture to evaluate. The same boundaries can enable
native threads. King's earlier blanket prohibition on splitting subsystems was
too restrictive and is superseded. **Distributed calculation can accelerate
one battle; distributing independent geographic regions is not the only option.**
The payoff depends on compute saved, communication, stale work and actual host
parallelism. None has been measured for this engine's clustered workload yet.

Distinguish two decisions:

1. **Where calculation happens.** Other DOs/threads can compute formation
   assignment, routes, terrain generation, navigation fields or environmental
   proposals from checked inputs. The existing Region accepts physical changes.
2. **Where committed state belongs.** A movement owner and terrain owner could
   commit their own state, but interacting updates then need a defined causal
   order, durable coordination and recovery. It is possible; it is additional
   work, not something an orchestrator solves by broadcasting the latest values.

Choose the first for the initial clustered consumer. It preserves our existing
receipt/physical-effect owner while allowing substantial work elsewhere. It is
not a requirement that the coordinator re-run each expensive calculation. It
checks the result contract, relevant current facts and conservation/admission
bounds; it applies the prepared result once. DO workers are trusted engine code,
not arbitrary player scripts claiming to have computed a valid physical result.

| RTS role | Work placement and data |
| --- | --- |
| Region/match coordinator | Command order, stable actor/item authority, accepting prepared effects, durable results; bounded hot contact/geometry facts |
| Movement/planning workers | Joint assignment, route/formation plans, potentially partitioned movement proposals once their collision dependency is explicit; cached relevant terrain/navigation data |
| Terrain/environment workers | Deterministic generation, dirty navigation geometry, later bounded water/gas proposals; reuse revisioned input pages |
| Presentation delivery | Route committed visible updates to subscribed clients; can be separated when actual fan-out merits it, without owning simulation |

Movement must not make a network request to the terrain owner for each footstep
or collision test. Give the worker a bounded read-only terrain projection and
changes since its last version. Local collision/contact acceptance may still
need that same small geometry working set in the Region. Do not copy an entire
world to every worker or expect zero duplication of read-only data.

The concrete conflict example is a bridge destroyed while an army route is being
calculated. The route result carries the bridge/page version it read. If that
dependency changed, reject/revalidate the affected route before it authorizes
movement. Positions based on the old bridge and destruction from the new frame
must not be presented as one coherent committed result. A remote timeout is a
missing proposal, not permission to invent movement or repeat a physical effect.

```rust
// Conceptual shape over existing native functions, not a new job DSL/scheduler.
fn calculate(input: &CheckedInput, scratch: &mut Scratch) -> PreparedResult;
struct ReadStamp { key: ResourceKey, generation: u64 }
struct PreparedResult {
    task: TaskId,
    algorithm_and_content: Version,
    reads: Vec<ReadStamp>,
    output: TypedOutput,
}
```

Keep world-local Bevy handles/borrowed JS callbacks out of this transportable
input/output. Stable IDs and typed records cross the boundary. Compile immutable
definition data once and use references/version IDs thereafter. The same Rust
function runs inline, against shared immutable native data on a thread, or with
bounded decoded data in a DO. Local execution must not pay mandatory JSON/RPC
serialization merely because a remote executor is supported. TypeScript game
rules remain the existing scoped intent/definition interface.

Native host execution can use scoped Rust work/tasks and Bevy scheduling where
their access rules fit. Independent tasks read immutable geometry and have
separate scratch/output. Declare reads/writes, partition work without conflicting
mutations, and merge in stable logical order rather than thread completion order.
Parallel speedup is available only for independent stages; terrain alteration
followed by collision on that alteration is an actual ordering dependency.
Browser/DO hosts may run tasks sequentially or via separate Workers/DOs. This does
not assume shared-memory WASM threads or that each DO ID receives its own core.
Rust scoped threads support borrowing data within an explicit lifetime;
[the native thread contract](https://doc.rust-lang.org/stable/std/thread/fn.scope.html)
is a reference for a local placement. Cloudflare documents that multiple DOs
may share an isolate; [object placement is not a per-object core guarantee](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/).

Use the current `assign::optimize` as the first real compute boundary. It already
accepts bounded stable worker/task IDs and finite costs independently of Kernel.
Keep it in Rust. Authoritative assignment still checks eligibility, claims and
capacity before committing. Route planning is another candidate once its current
position/frame/bounds/blocked inputs are separated from installation of the route.
Do not substitute an artificial sleeping job or an idle-pawn benchmark.

Validity belongs to the operation: generator output is bound to seed/version/
coordinate; assignment is bound to admitted candidates/policy and current claims;
routes depend on their corridor and actor/order generation. Do not reject every
calculation merely because an unrelated world revision advanced. Conversely,
do not keep stale results just to improve benchmark numbers. Define allowed
age/revalidation when an approximate planning input, such as worker distance,
can legitimately be older than the final assignment. Exact physical integration
requires its declared time/base state; it cannot use the planning exception.

An accepted long-running calculation has a durable task identity, selected input
identity and due/retry obligation at its owning host. Recomputable worker caches
need not be independently durable. Duplicate/late results are fenced by task,
owner generation and input identity. Only accepted results settle physical state.
Coalescing/superseding obsolete route requests is allowed; silently dropping an
acknowledged construction/transfer obligation is not. Reuse the existing Region
and applicable Watchdog capabilities rather than invent a general scheduler.

For the literal independently authoritative movement/terrain variant, first
choose the semantics: immutable terrain versions with scheduled effective time,
or staged per-participant updates with a durable coordinator decision. In the
latter, participants preserve preparation before the decision, retry application
idempotently afterward, and the client sees only an accepted coherent revision.
No participant may expose a prepared result as committed or roll back a durable
commit decision merely because another participant is temporarily unreachable.
This may introduce a local barrier and temporary unavailability. It is not a
global world tick and is not currently supplied by our one-Region SQLite proof.

Memory relief and compute relief are different. Remote calculation alone may
reduce CPU while duplicating some inputs. A genuinely large authority split needs
partitioned durable pages plus bounded validation/projection at the coordinator;
otherwise all positions/fields still pass through the same bottleneck. Do not
promise that a thin-looking coordinator has unlimited commit or fan-out capacity.

First qualification compares the **same actual formation/route workload** inline
and on another DO, including input transfer, cache warm/cold behavior, useful
completion latency, coordinator CPU, stale results and peak memory. A host with
real native parallel execution can qualify the same functions on threads as a
separate supported placement. Shipping either host is not started by this plan.
Separate DOs may share placement/execution resources: confirm actual parallelism;
the object count itself is not a core count. Coarse batches and cached inputs make
remote execution plausible; tiny per-entity RPCs can cost more than the arithmetic.

The architecture requirement is now to preserve these scheduling boundaries as
the native environment is built, without requiring distribution to land the
first wet colony. Keep topology remap and compound admission explicit, so their
calculation can move later without moving mutation authority accidentally.

## 3. One native world generator, with geology underneath the landscape

Port the retained height/sea/cave arithmetic into Rust; retain the approved
landform style and integer voxel surfaces. Maps and fine bricks call that owner.
Use explicit wrapping hash arithmetic, floor division for negative coordinates,
and ordered arithmetic. Do not swap in a different noise crate merely to make
the port shorter. Pin the new Rust generator/version in the manifest. Existing
JS reference samples are comparison evidence; old worlds need no compatibility
runtime. Voxel material decisions must match native/WASM execution, including
height thresholds; strict byte parity with JS floating-point noise is not assumed.

```rust
fn sample_cell(spec: &WorldSpec, cell: Cell) -> GeneratedCell {
    let column = sample_column(spec, cell.x, cell.z); // cached within a brick job
    let solid = terrain_and_caves(spec, &column, cell);
    let stratum = geology(spec, cell); // global-coordinate layer + lens features
    GeneratedCell { material: choose_material(solid, stratum, column), /* faces */ }
}
```

Physical material parameters are separate: diggability, strength, porosity,
retention and permeability do not derive from an art name. Sandstone can contain
water while still being rock; a game may define tungsten as undiggable without
editing Rust. Opaque material IDs resolve to validated capabilities at admission.

Choose a cheap **geological starting condition**, not an offline groundwater PDE:

1. Global-coordinate coarse fields bend layers and place finite lenses. The same
   seed at a chunk seam produces the same rock, regardless of generation order.
2. A low-frequency regional hydraulic head combines coarse terrain, sea datum
   and climate/recharge parameters. It is smoother than the local ground and
   capped at exposed drainage surfaces. Hills therefore have different depths
   to groundwater; do not subtract a fixed depth from every surface column.
3. Fill original porous capacity below that head, with a bounded unsaturated
   moisture baseline above. Cap stocks at material pore capacity. Aquitards have
   low or zero permeability; they are not extra hidden water reservoirs.
4. Finite perched lenses may have a separate initial head above a blocking layer.
   When lenses overlap, choose one deterministic initial saturation profile;
   never add two full pore volumes. Their water then uses ordinary field rules.
5. Generated voids start dry unless a named bounded lake/coastal/flooded-cave
   feature supplies their initial finite volume. Do not flood every cave merely
   because it lies below a regional scalar. Nearby wet rock can seep into it.

This baseline is authored plausibility, not a solved equilibrium or a claim of
accurate regional hydrology. Initial gradients may settle after admission.
Aquifer pressure is represented by connected saturated stock/head propagation
below; confined elastic storage and artesian jets are outside the first model.

The initial-head recipe is selected once at world creation, with explicit content
parameters. One implementable baseline is `sea + terrainGain * max(0, coarseGround
- sea) + rechargeOffset - aridityOffset`, then capped by exposed drainage height.
The coarse samples and offsets use global coordinates and bounded low-frequency
fields. Parameters determine the art/gameplay outcome, not physical truth. This
is a baseline only: there is no per-tick assignment back to that height.

```text
admit_brick(world, coordinate):
    require authority owns coordinate and no prior admission record
    generate immutable geometry and finite initial stock at the world's baseline
    prepare geometry + stock + baseline-ledger + admission record together
    commit once

reload_or_revisit(coordinate):
    restore admitted geometry edits and stocks; never call initial_stock again
```

Generation for a map does not admit physical stocks. Eviction does not erase an
admission record. Reinitialization cannot restore drained water. Until a coarse
aquifer owner exists, unadmitted neighboring stock is unavailable, with an
explicit closed or declared reservoir boundary. Expand physical custody in
bounded bricks near relevant work before exposing interactions; unknown is
neither air nor a water source.

Rain is an explicit finite atmospheric input per exposed catchment/time interval.
Route it to surface/pore capacity; overflow remains runoff. Absorption stops at
capacity. Root uptake/evaporation drain declared stocks into explicit accounts.
Lakes are finite. Rivers need upstream/rain/reservoir input and can shrink when
input ceases. A large ocean may be an explicitly open level reservoir at detailed
coasts, with measured source/sink ledger; Pirates need not tick ocean voxels.
Full drainage-network generation is later, not a prerequisite for a spring,
ditch and well using this source boundary. Fine and coarse reservoirs may never
own the same water simultaneously.

## 4. Water transport, pressure and dirty water share one transfer plan

Keep the retained local finite-volume offers and shared donor/receiver budgets.
Use active faces, dense numeric indices and reused scratch. A candidate flow is
an internal fact until water **and all carried constituents** can be applied.
No string flow report is built unless an explicit bounded diagnostic asks for it.

Use the retained bounded full-path pressure approximation for communicating
vessels, extending conducting membership to saturated permeable solids. Its
head comes from reachable free/partly saturated boundaries, not a permanent
generator water-table instruction. A saturated column can transmit head to an
excavation; its rock still limits flow by permeability and face area. A disconnected
full cluster has no fabricated external head. That permits slow well recharge
without individual crack simulation.

Both free-liquid and porous cells are water graph nodes, with different geometry:
`FreeVoid.capacity = rho * voxelVolume`; `PorousSolid.capacity = rho * porosity
* voxelVolume`. A porous node becomes a pressure conductor only when its mobile
capacity is nearly full under the model threshold and its material permits flow.
Its donor/receiver limits still use that pore capacity and retained stock; it
never acquires the volume of a hollow voxel. Initial head is not a saved pressure
force. Only connected free/partially saturated stock supplies a path head.
Its hydraulic faces never become navigable or gas openings. Gas membership is
formed from actual free space; a wet sandstone wall remains a solid air barrier
unless its separately defined air permeability/opening says otherwise.

Each pressure path consumes shared face throughput and donor/receiver budgets.
Cap gross outgoing swept volume at each intermediate cell by the water already
there at the beginning of this phase (initial policy: at most one quarter per
phase). It cannot use incoming water twice or pump arbitrary volume through a
tiny cell in one phase. Tight bottlenecks constrain every competing path.

```text
prepare all accepted face fluxes q from the SAME starting stocks
enforce shared mass, space, retention and face-throughput limits
for each directed face A -> B:
    require water_before[A] > 0; otherwise q must be zero
    moved_water = q
    for each nonzero dissolved channel:
        moved_channel = q * channel_before[A] / water_before[A]
sum all incoming/outgoing changes before writing any cell
prepare representable paired changes for the complete moved bundle
publish those changes together; retain all rejected amounts at their source
```

For a pressure path A→B→C, B receives A's constituents but sends **B's old**
mixture onward. Water in B can have zero net change while contamination moves
through it gradually. Do not debit dirty water at A and put its concentration
directly into distant C. This fixes the pressure/tracer ambiguity in the first
draft without introducing particle tracking.

For every constituent, `remaining + exported - imported` equals its prior total
within the existing paired-arithmetic tolerance. An unrepresentable endpoint
change rejects the whole affected transfer bundle and its dependent pressure
path reservation before publication; it does not move water while dropping a
tracer update. Recompute shared budgets for surviving reservations once, or defer
the affected component. Exact-zero channels require no division or transfer.

The all-face water draft is still only a first operation. Its pressure phase,
activity tracking, rebind and port admission require real consumers before the
field is complete. A float epsilon may bound comparison error; it may not erase
small water/contaminant stock or make a one-sided transfer acceptable.

## 5. Bound the water/air join; do not iterate a coupled solver to convergence

Air parcels remain connected same-height bins, not one gas entity per voxel.
Water owns liquid mass; air owns carrier, dilute smoke and sensible heat. Free
gas volume is derived once from geometry minus free liquid. Pore water inside
solid rock does not subtract air from an adjacent walkable cell.

Use an isothermal displacement approximation during an edit: moving/compressing
a parcel does not introduce a new compression-work/latent-heat solver. Retain
its carrier/smoke/heat amounts, recompute pressure at the resulting volume, and
apply explicit pressure/temperature validity bounds. This is not thermodynamic
energy conservation including mechanical work.

Ordinary liquid proposals use the current air pressure at a free surface as
back-pressure, expressed as `(P_air - P_external_reference) / (rho * gravity)`
additional hydraulic head. The external reference is the model datum, not a
connection to outside air. This prevents water freely compressing a trapped
pocket merely because the global pressure safety cap has not been reached.
Parameter tuning is still gameplay work; no accurate pneumatic machine claim.

For affected air parcels the engine can cheaply derive the remaining volume
needed to stay within the declared pressure cap at their current mass and
temperature. For incoming water, share that capacity across **gross** inflow;
do not spend possible outgoing water twice. A completely vacated water cell
creates geometry capacity, not free ambient gas underground.

Then handle actual closures, including a cell becoming fully flooded:

```text
1. Gas step due at this causal boundary runs using the old accepted geometry.
2. Propose water using old stocks, shared limits and current gas back-pressure.
3. For changed cells, update free volumes/open face areas in scratch.
4. Remap only affected gas bins and incident faces.
   Preserve mixture in surviving members; split by old member gas volume.
   Expel gas displaced by removed free volume through actual OLD open faces
   into remaining/newly connected free capacity, respecting receiver pressure
   and a bounded opening-throughput policy. Outside is allowed only at a
   classified exterior boundary. Move carrier/smoke/heat as one bundle.
5. If admissible, publish water + gas changes together.
   Otherwise reject offers contributing to that blocked component, close over
   their shared donor/receiver dependencies, and recompute ONCE from the old
   stocks with those offers absent. If still blocked, defer that component.
```

This is a deterministic bounded attempt, not bisection until something passes.
Dependency closure matters: rejecting one outflow can remove space another offer
expected to use. Do not keep dependent offers from a rejected candidate. Unrelated
field components proceed. Blocked work wakes on changed pressure, capacity,
source or geometry; it does not allocate the same failing graph every frame.

**Topology remap ownership:** split/merge by actual cell overlap, never by array
index or parcel label. A removed cell's prior gas has explicit surviving, displaced
or exterior custody. An enclosed new cavity begins evacuated; surrounding air
can enter through openings. A newly exposed exterior cavity receives ambient gas
through an explicit boundary admission/ledger. No ambient creation in sealed rock.
The exact-zero empty-parcel case has zero carrier/smoke/heat and a defined model
temperature for admission; pressure is zero until material enters it. Do not
divide by zero or quietly fill it with room-temperature gas.

Gas at 2 Hz still uses retained bounded substeps. Water at 5 Hz and gas clocks
split at a paid source/door/dig event so no newly opened vent acts retroactively.
Same-timestamp order is fixed: finish due old-geometry exchange, apply admitted
operations in stable command order, mark affected fields due for future work.
Do not duplicate an interval because both fields were dirty. Keep exact saved
frontiers; silent timestep dropping is not a performance optimization.

## 6. Digging, building, vessels and fire are compound operations

```rust
fn prepare_completion(view: &View, job: &Completion) -> PreparedOrWaiting {
    let edit = view.geometry.prepare(job.edit)?;
    let materials = view.materials.prepare_cost_and_yield(job)?;
    let water = view.water.prepare_rebind(&edit)?;
    let materials = materials.bind_water_and_constituents(&water)?;
    let air = view.air.prepare_rebind(&edit, &water)?;
    let access = view.navigation.prepare_changed_geometry(&edit)?;
    // All outputs are detached; a failure above changes no owner.
    Prepared(CompletionChange { edit, materials, water, air, access })
}
```

Removing porous material moves its retained water/constituents into wet spoil
exactly once. Connected groundwater can seep into the new void on later field
steps. Filling a flooded cell requires moving its liquid and air into admitted
capacity, not deleting either. A blocked job retains earned progress according
to the common work policy, consumes no completion cost and produces no yield.
One waiting job does not undo unrelated workers' whole tick.

A field→pail transfer quantizes the requested amount into the material's declared
base units, then atomically debits the field and credits the existing lot owner.
It retains field remainder, density and constituent quantities. Returning it
uses the same owner in reverse. A field is another admitted source/destination,
not another hauling state machine. Liquid capacity uses volume; item count and
mass are different dimensions.

Burning prepares consumed fuel, elapsed process cursor and released heat/smoke
together. A source cannot commit fuel first and discover that gas admission
failed afterward. Prototype pressure/temperature limits must produce a typed
waiting outcome or an accepted smaller whole process portion. Do not consume
full fuel while silently clamping emissions. This model does not yet simulate
oxygen starvation; presentation must not call a numerical guard an oxygen law.

Wetness, nutrients, contamination and plant preference remain distinct. More
water is not always better. Soil filtering and composting transfer/transform
stored amounts through ordinary material/process rules; cosmetic color changes
never perform treatment. The first native field includes channel-carrying layout
and one contamination-transfer law; the later colony wastewater loop supplies
actual sources, treatment recipes and needs effects.

## 7. Shared presentation makes these changes visible in all four games

Extend current `engine/src/client/{effects,animation,motion,visual-bindings,
audio}.js`, the existing observation and cue owners, and original asset builders.
No new per-game particle simulator or animation-clock copy. ZzFX remains the
accepted shared sound dependency; its local source is not yet the live release.

Three inputs have different meanings:

- **Committed state:** visible water depth, material/saturation band, parcel smoke
  density/temperature, actual burning state. It drives persistent appearance.
- **Committed event:** a completed dig/transfer, impact, ignition/extinguish.
  Existing epoch/sequence cursor deduplicates one-shot reactions on reconnect.
- **Presented motion:** interpolated/predicted foot or hull contact position and
  distance. It drives capped footsteps, small ripples and wakes without waiting
  for a new durable event for each particle. Corrections never spend inventory.

```ts
// Conceptual data additions to the existing checked presentation bindings.
terrainAppearance(materialId, wetnessBand) -> original sprite/tint variant;
contactEffect(materialId, contactKind, speedBand) -> effect + sound recipe;
committedReaction(eventKind, materialId) -> effect + sound recipe;
```

These tables contain presentation values, not mutation callbacks. Physics may
expose a checked impact-material response; art cannot change its friction or
create water. Do not infer a gameplay collider from an attractive splash sprite.

| Existing demo | First visible reuse | Physical limit stated honestly |
| --- | --- | --- |
| Colony | Darker wet soil, visible ditch water, bucket fill/carry/pour, smoke leaving an upstairs vent | Actual finite stock, paid work and room openings |
| Survival | Shared wet footsteps/ripples and a fire whose smoke follows shelter openings | Preserve accepted direct prediction; no new survival rules required just to show effects |
| Formations | Cannon impact chooses dirt clod, wet mud or water splash from the actual contact surface | Trajectory/collision still native; do not imply water drag/buoyancy until those primitives exist |
| Pirates | Existing hull motion drives the same water contact effect family, wakes and splash sounds | Detailed coast uses admitted water; an authored open ocean is not a finite whole-ocean solver |

Root owns original water/soil/smoke art variants and their reviewed bake. Use the
same pack in all four consumers. Graphics update at presentation rate while
field state updates slowly. Pool effects, impose per-view budgets, stop when off
view, and clear on world change/disposal. Cosmetic random seeds are independent
of simulation RNG. Respect reduced effects, mute and the current no-camera-shake
RTS choice. A smoke emitter density is a visual approximation of the observed
parcel, not one simulated particle per gas parcel or kilogram.

Send bounded visible changed geometry/field records in observations. Reconnect
gets a coherent visible baseline; skipped revision or lost patch requests that
baseline. Cosmetic flux samples may be coalesced; authoritative stock/revision
cannot. Discovery filtering happens before projection, including below-ground
smoke/water. Zooming down is not permission to reveal an undiscovered cave.

## 8. Destructible environments are native physical capability

Levi's amendment during this design pass: plan destructible environments at the
Rust engine level. **Yes.** Excavation, a cannon breaching a wall and eventual
collapse must share physical geometry and material custody. A client-only broken
wall would leave water, smoke, movement and the saved world disagreeing.

| Owner | Responsibility |
| --- | --- |
| Rust geometry/material capabilities | Integrity, checked damage, removal/replacement, physical debris custody, changed collision/openings and support facts |
| TypeScript game definitions/rules | What can be damaged; strength/resistance by material and damage kind; tools, weapons, burning rules, debris/yield policy, permissions |
| Existing shared client/art/audio | Cracks, impact chips, collapse/dust clips and sounds, capped cosmetic fragments; never authoritative removal |

Use sparse native integrity state only where an element has been damaged or
given explicit structural state. Untouched generated rock derives initial
strength from its material. Do not add a ticking health entity to every voxel.
Damage is not a synonym for excavation progress: work may produce a clean yield;
an impact may destroy it with a different content-defined yield. Both submit
the same checked geometry/material change when removal occurs.

```rust
enum PhysicalTarget {
    Voxel { frame: FrameId, cell: Cell, material_instance: u64 },
    Element { id: StableId, instance: u64 },
}
fn prepare_damage(view: &View, hit: AuthorizedDamage) -> DamageChange {
    let target = view.resolve_current_instance(hit.target)?;
    let integrity = target.integrity_after(hit.kind, hit.amount)?;
    if integrity.survives() { return DamageChange::Integrity(integrity); }
    let removal = target.removal_with_yield(hit.policy)?;
    // Same detached geometry/material/water/air/access preparation as digging.
    DamageChange::Destroyed(prepare_physical_change(view, removal)?)
}
```

Method names are illustrative. Common preparation is the owner extracted from
section 6, not a second copy called `damage_water`. Target identity includes the
particular material/element instance: a delayed hit on a removed wall must not
damage a different wall built at the same coordinates. Ordered impacts and a
consumed reaction identity prevent duplicate damage/debris from replay. A UI may
request fire/attack, not invent an authoritative collision. Game systems receive
only their admitted action scope.

Generalize existing native projectile contacts to query occupied voxel geometry
along the swept ball path, using the current collision owner and bounded spatial
broad phase. Do not build one permanent rigid body per terrain voxel. Resolve
contact and response against the same candidate geometry revision. Once a wall
is breached, later ordered contacts use the opening. Multiple targets on one
shot remain supported; no special cannon-only demolition implementation.

First destruction play is **a cannon breaching one voxel wall and a digger
removing another**, with one dust/material pipeline. Air can vent through the
breach; water can enter through a broken retaining wall. A failed compound
removal produces no debris or partial wall deletion. If damage reaches its
threshold while removal must wait, retain an explicit pending-destruction state
and reaction identity; keep the collider until the physical edit commits. Do
not emit a destroyed event while the wall still exists or blindly retry every
render frame.

Structural support is a separate composable native rule over accepted geometry:
rooted support, material spans and dirty connectivity. Recheck affected structure
on edits, not the whole map each tick. Unsupported clusters can become durable
collapse work, executed in bounded batches with stable IDs, conserved debris
and ordered impacts. Removing a support cannot duplicate its building inventory.

**Automatic roof collapse remains a later gameplay slice**, as Levi previously
requested. Supported multi-storey spans are required now. The first breach
fixture cannot claim falling floors/tower collapse before that capability exists.
That later join needs shared native falling-body/contact behavior for actors and
cargo, including support loss, landing and damage; never teleport them to a
convenient safe tile. Selected whole props may become physical falling pieces.
Ordinary splinters are capped cosmetic particles; only selected recoverable
rubble becomes persistent lots or colliders.

Colony damage/repair, Survival shelter, Formations siege breaches and Pirates
damaged ship elements can then compose common primitives. Hull flooding/buoyancy
is a separate later join of moving geometry and finite water, not implied by a
broken-wood effect or the existing sailing demo.

## 9. Complete bounded chunks; judge them in the game

No implementation is launched by this design checkpoint. When resumed, give each
writer an entire outcome through corrections and relevant proof; root reviews
the decisions above and changed art. Do not split these into dozens of permission
gates or repeat historical browser/physics matrices.

| Order | Complete outcome | What Levi gets / what establishes it |
| --- | --- | --- |
| A | Resident Region/Session lifecycle and native records with current four packs | Existing games retain accepted movement/cannon/cargo; one failed outer commit and lost-ack/reopen prove identical next state and no double effect; no environment needed to qualify the host boundary |
| B | Native generated voxel geometry + porous strata + finite water in current colony | Dig a ditch and a deeper wet-rock cut in the actual colony; a well drains rather than refills; rooted floor spans and multiple levels use signed geometry, not a Ground/Upper boolean |
| C | Native parcel air + water/geometry remap + paid hearth | Build a two-level enclosure, light fuel, open/close an upper vent, flood a passage; trapped and vented outcomes preserve stocks through one compound completion |
| C2 | Native material integrity + shared destruction completion | Digger and cannon remove real walls; breaches change collision/water/smoke and produce finite debris; automatic roof collapse stays later |
| D | Shared presentation and common vessel/source join across current packs | Original art, wet footsteps, impact splashes, hull wakes and carry/pour; no copied solver or new controls in individual games |
| E | Colony ecology/care loop | Irrigate, grow food, produce and treat waste through shared needs/work/material primitives; more content now composes supported rules |

Source preparation of generator and presentation can proceed independently from
the host work, with released file boundaries. Kernel/environment/compound
mutation remains one coupled writer until interfaces are actually stable.
Do not wait for every row to show a playable change. Row B is the first
new environmental play, not the end of the whole roadmap. The smaller changes
inside A still keep the existing demos working as the host is improved.

Freeze the named workload and targets in WATER-AND-GAS before reporting speed.
Measure active field work, entity/rule work, binary encoding/commit, observation
projection and client presentation separately. Report actual WASM/DO results,
including worst busy frames and memory, rather than inferring speed from Rust.
Rendering every hidden voxel or copying every field into an observation would
undo the intended savings even with a fast solver.

After this pass, most coding is mechanical but **the following are acceptance
decisions, not clerical review**: actual rollback after the outer transaction,
stock conservation across remap/pressure/vessel boundaries, cross-chunk generator
identity, and interactive/performance results. Lower-effort implementers can own
the bounded work; root must still inspect those joined results and the art.

No new model-setting change is made here. The unresolved questions are tuning
and qualification (rates, visual intensity, actual capacity), not permission to
invent another ownership model. Bring back a failing named player scenario or
source invariant when a design change is needed.

## Source anchors read for this decision

- `engine/kernel/src/world.rs`: `advance_json`, `advance_batch`, snapshot/restore,
  physical side maps/counters; `registry.rs`: authored component registration.
- `engine/src/runtime/session.ts`: step rollback, rule/action staging, save,
  impacts/cues; `region-program.ts`: per-operation kernel reconstruction.
- `src/engine/region/index.ts`: atomic state/result/event/occurrence owner;
  `tools/public-engine-host/worker.ts`: outer transaction, alarm, observation.
- `src/engine/environment/water/{transport,pressure,rebind}.mjs`: local/shared
  budgets, conduit path, displacement; atmosphere exchange/rebind equivalents.
- `src/world-presets/height.js`, `height-caves.mjs`, `goblin-environment/content.ts`:
  retained generator, shallow porous layer and fixed initial water-table limit.
- Checked Botanical `45db487` Woodstock progress/recording and observation files
  are enumerated in WATER-AND-GAS. Reuse the live/durable distinction; this does
  not claim the chat runtime itself supplies an engine transaction or scheduler.
