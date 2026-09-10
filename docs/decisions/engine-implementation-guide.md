# Hive implementation guide: playable fields and reusable systems

September 10, 2026. Direct Levi request: preserve the cross-game study and give
implementers concrete pseudocode for water, gas, terrain and the harder reusable
systems. Source read at `37efb52`; this is a design and delivery guide, not an
implemented API, benchmark, new game or release. The [cross-game study](hive-engine-asset-pipeline-and-goblin-boundaries.md#cross-game-acceptance-zomboid-style-survival-and-pirates--september-10)
is the durable rationale. The [environment decision](environmental-fields-and-openings.md#playability-first-environment-decision--2026-09-10)
selects game-scale fidelity. The [active sprint](architecture-proof-sprint.md)
owns the current queue and availability.

**How to use this guide:** implement one complete bounded outcome, migrate its
actual callers and remove its superseded path. Code blocks below are pseudocode.
Names such as `prepareChange`, `settleThrough` and `needs.prepareEffect` specify
responsibilities to implement inside named owners; they are not exports that an
agent should search for, invent adapters around, or claim already work. Do not
paste every section into a new framework. Future ship/combat sketches are parked.

## 1. Sequence and actual file custody

| Chunk | Outcome and primary source | Exit that matters |
| --- | --- | --- |
| A — next | Playable environment hot path: `world-presets/goblin-environment/{water-state,air-state,environment-state,gas-geometry}.ts`, `engine/environment/{water,atmosphere}`, `clearing.ts`; narrow supply/navigation/display consumers as required | Actual multi-storey clearing can dig, flood, drain, burn and vent responsively; no full gas reconstruction for fractional water changes |
| B — following host join | One headless simulation behind the existing command/observation boundary; `main.js`, current view/input, `world-presets/goblin-region.ts`, `engine/region`, existing host consumers | Browser Worker local play and an online DO consumer use the same rules; client does not advance online world state |
| C — next reusable gameplay | Extract numeric needs and compound consumption from `needs.ts`, `activity.ts`, current finite work and save callers; then finite dissolved constituents through field/material boundaries | Goblin uses shared care mechanisms; an independent survivor can use them without importing Goblin; the sanitation/garden loop gains real transferable quantities |
| Later | Perception/health, vehicles, moving spaces, projectiles, multi-region handoff | Add only for an authorized game consumer, using the same current owners |

This refines the earlier broad sequence: fix A first; B is the next integration
outcome, while isolated source preparation for C may overlap only after exact
file release. A and C both touch water/material callers, so they do not get
simultaneous coupled writers. One owner can deliver a large coherent chunk with
informational checkpoints; source review proceeds against a pin. Mechanical
implementation follows the current low-cost native-worker policy. Root owns
architecture, integration and real acceptance. No model switch or new writer
is claimed by this document.

Celld is the accepted eventual cheap DO target. Browser support, durable command
identity and a responsive client remain. Detailed tick pricing, further CFD
research, speculative ships and a language port do not block A. No immediate
backend publication authority is created by B's plan.

## 2. Ownership map and invariants

Actual entries include `createVoxelStore`, `createMaterialOwner`,
`createFiniteWorkOwner`, navigation `route`/`beginRoute`/`advanceRoute`,
`createWater`, `createAtmosphere`, `openRegion` and
`createRegionControllerModule`. They are useful source modules, not a finished
installed game SDK. `RegionProgram` currently supplies `initial`, `parseState`,
`parseCommand`, `authorize` and synchronous `execute`; it wraps a composed world,
not just a terrain fragment.

| Owner | Its authoritative facts | Game supplies |
| --- | --- | --- |
| World storage / physical geometry | Versioned base, edits, surfaces, openings and derived spatial indexes | Generated material recipe, properties, support and placement policy |
| Materials | Lots, quantities, locations, capacity, claims, consumption and production | Material IDs, supported container/recipe definitions |
| Navigation / work | Admitted traversal, paid progress, lifecycle and cleanup | Body profiles, permitted actions, priorities and work effects |
| Water / atmosphere | Field quantities, admissible transfers and geometry-dependent capacities | Rates, boundaries, paid sources, meaningful quality/exposure rules |
| Proposed needs owner | Bounded values, elapsed advancement and admitted effects | Need definitions, decay conditions, thresholds and care policy |
| Region / host | Existing world revision, command receipts and events; proposed joined time continuation/durable obligations | Current program, authenticated grants and time policy |
| Presentation | Camera, gestures, interpolation and visual resources | Goblin menus and mapping observed facts to original art |

Cross-owner effects commit together. A row's private arrays/maps are never
another row's write API. Paused commands can accept intent but cannot spend
physical time. A cache hit cannot grant permission, capacity, visibility or
reachability. A source ID proves provenance only when its corresponding finite
input/receipt exists. Definition changes cannot silently reinterpret a save.
Current-format recovery matters; backwards-compatibility shims are not required.

For field work distinguish three things:

```text
canonical: quantities, geometry edits, source progress, due frontiers
compiled:  adjacency, cell indexes, room membership, material properties
display:   water heights, smoke opacity, selected-cell facts, interpolated poses
```

The latter two rebuild from the first. Keep compiled data across unchanged
geometry, not across a mismatched owner/state identity. External/save input gets
full validation once at admission. Trusted successors stay associated with their
actual immutable owner instance; callers cannot assert trust with a version
number. Local invariant checks remain in mutation operations.

## 3. Water: local finite transport and active work

Current code is already finite voxel water, not the old shallow-water/Richards
experiment. `water/index.js` scans faces and invokes `pressure.mjs`, which builds
a sorted wet forest each step. Change the work selection and reuse, not the
physical quantity owner. Per-cell water capacity derives from the actual voxel
or pore volume. Signed Y supports stacked rooms and caves.

Every physical face belongs to one exchange class: void/void fast transport, or
soil-contact slow exchange. The latter must be removed from the fast pass when
the slow cadence is introduced. Current rate formulas remain unless explicitly
changed and qualified. The following is the intended settlement shape:

```text
advanceWater(candidate, interval, faceClass):
    faces = active faces of faceClass, in stable physical order
    before = current quantities for those faces and incident cells
    proposals = []

    for face in faces:
        if physically closed: continue
        q = proposeFromCurrentHeadGravityOrSoilRule(before, face, interval)
        append only a positive, finite directed request

    totals = sum requested outflow/inflow for each participating cell
    for request in proposals:
        q = request.q * min(
            1,
            donor available / total requested donor outflow,
            receiver free capacity / total requested receiver inflow)
        prepare representable debit and matching credit
        if either side cannot represent the transfer: defer BOTH
        otherwise append the paired delta

    apply admitted deltas inside the detached water candidate
    return changed cells, actual exchanges, and pending work
```

This deliberately conservative limiter does not spend outgoing water as new
receiving space in the same stage. It may converge over more stages; it cannot
overdraw donors or overfill receivers. Preserve retained-soil thresholds as
shared cell budgets rather than spending the same deficit once per neighbor.
The existing arithmetic owner decides representability; an epsilon does not
authorize deleting a remnant. Temporary exchange lists are bounded work data,
not a durable event for every face of every tick.

Gravity and local leveling alone fail a flooded U-shaped passage. Keep the
existing bounded head-flow behavior through nearly full cells:

```text
when fullness/connectivity changes:
    invalidate affected wet-component connectivity

when a source/receiver head changes:
    mark its wet component active

pressurePhase(component, currentStocks, allottedInterval):
    propagate current supported heads through actual wet openings
    choose deterministic donor-to-lower-head paths
    share donor, receiver and every path-face throughput budget
    retain the donor head required to cross the path crest
    settle only the bounded admitted transfers
    keep deferred work active; never treat a budget stop as a wall
```

Cache connectivity, not stale pressure heads or donor ordering. The current
local/pressure halves share elapsed time; do not give both the full interval
accidentally. Work may traverse the affected wet component, but must not rescan
every dry cell in the vertical world envelope each update.

Wake active neighborhoods for quantity changes, new capacity, edits, source or
boundary arrivals and due seepage. Stable cells can leave the fast frontier.
Soil that may drain later has a due condition, not permanent sleep. A rebuildable
frontier can conservatively seed from canonical stocks on load; if a work-order
cursor affects future behavior, persist that continuation explicitly. Never
depend on a lost in-memory queue for whether a pond will finish draining.

### Sources, saturation and larger bodies of water

Soil has finite pore capacity; saturated soil cannot absorb forever. Retention
and permeability control where water stays and how quickly it moves. A lake is
stored water over a basin. A river is stored water plus declared inflows and
outflows; without replenishment it can diminish. Rain, upstream catchment and
groundwater supply must name their source, quantity/rate and time policy.

A distant ocean need not instantiate every water voxel. A declared reservoir
boundary can supply a sea-level head and account for admitted exchange at the
active region edge. That is an explicit world-model boundary, not conservation
over an ungenerated ocean. A neighboring live region instead needs the durable
transfer protocol below; it cannot impersonate an unlimited reservoir. These
larger-world producers are planned extensions, not current cross-region proof.

## 4. Gas: retain topology, change only affected volumes

`air-state.ts:53–108` currently computes whole-source/void-water serialization,
then can compile geometry in the producer, binding and rebind paths. Replace
that with actual mutation results and one owning compiled instance.

```text
prepareAirGeometryDelta(beforeAir, acceptedWaterDelta, physicalDelta):
    affected = changed cells plus incident physical faces
    for cell in affected:
        freeVolume = actual void volume - actual liquid volume
        prepare updated member volume
    for face incident to affected:
        prepare actual open area / separator change

    if membership changes or an opening crosses zero/positive:
        discover complete affected old/new components
        prepare conservative split, merge and displaced-stock movement
    else:
        preserve member IDs, connectivity and adjacency
        update affected aggregate volumes and exchange coefficients only

    check positive capacity, physical escape routes and paid-source receivers
    return applied prepared change, or explicit blocked reason
```

Closing a doorway may split a large former component. A fixed local radius is
not sufficient to prove that split. Bounded discovery may defer the edit while
preserving its work and resources; it cannot silently ignore a distant route.
Stock follows physical cell overlap, not convenient new compartment IDs. New
space starts with no manufactured gas. Existing gas may expand or enter through
real openings. Full pockets displace their contents through actual old routes,
or block the proposed edit under the current approximate admission rule.

Current atmosphere is finite carrier, smoke tracer and heat in bounded bands.
Keep its cheap exchange model. No momentum grid, vortex solve or molecular
chemistry is needed for the first room/vent/exposure outcome:

```text
advanceAir(candidate, interval, paidSources):
    before = stocks in active bands and their exchange neighbors
    emissions = admitted finite outputs for this interval
    requests = current opening mixing + pressure/buoyancy approximation
    limit all outgoing requests against shared donor/face budgets
    prepare paired carrier, smoke and heat changes
    apply finite emissions and admitted exchanges in the same candidate
    record actual source/boundary totals and changed bands
```

Use current `atmosphere/exchange.ts` as the behavior baseline, including its
separation of concentration mixing from carrier advection. Near-equal pressure
must not freeze a smoke concentration difference. A completely mixed castle is
not the target: preserve rooms, height bands, doors and long-shaft subdivisions.
Exterior exchange needs a real exterior opening. An unknown or sleeping neighbor
is not clean air. Renderer opacity derives from these amounts and cannot affect
exchange. Expand only the requested visible/inspected cells for display.

## 5. One causal timeline, several inexpensive cadences

The proposed normal maximum intervals are water 0.2 s, air 0.5 s, soil 1 s.
These are scheduling choices, not independent clocks or speed claims. Actor
work and commands retain the existing ordered game time. Source starts/stops,
geometry changes and water-volume/vessel changes split relevant intervals.

```text
at a field deadline OR event changing field conditions, time T:
    settle the relevant old pending source/field intervals through T
    apply due completion or accepted external command in stable host order
    invalidate affected physical/quantity queries
    select the next due boundary from the fixed owned systems
```

An ordinary actor tick, UI inspection or queued order does not force every field
to advance. The conservative first implementation closes dependent intervals
for the affected field; narrower component scheduling is a later optimization.
In a flooding room air may therefore update at water cadence. Do not add histories
or complicated interpolation to preserve a nominal lower frequency.
Soil exchange uses exactly one owner/cadence and closes its pending interval before
a neighbor's boundary condition changes. No handler recursively advances the
world clock; the environment coordinator owns the explicit dependency order.

For the new implementation, select this coarse **air-before-water boundary
split**, which intentionally changes today's water-before-air step:

```text
settleFieldBoundary(candidate, targetTime T):
    airSpan = [host.airThrough, T]
    waterSpan = [host.waterThrough, T]
    soilSpan = [host.soilThrough, T]
    include only due or causally required spans; skip zero-length spans
    split each included span at its own recorded source/condition boundaries

    airOld = advance owed airSpan on OLD volumes/openings and source schedule
    waterProposal = advance owed face classes using their respective spans
    paired = prepare gas-volume/displacement change from airOld to waterProposal

    if paired is blocked:
        keep previous water quantities
        keep admitted airOld successor
        record interval covered with water HELD for the stated reason
    else:
        publish waterProposal and paired air inside the candidate

    advance each source progress only for its outputs actually admitted
    move only the covered host frontiers to T once
```

These cursors are host continuation, not independent clocks. Never pass one
elapsed duration to fields with different last-through times. Start with clear
field-level cursors; if later optimizing to per-component cursors, flush all
affected components through the edit time before split/merge, then assign that
same covered frontier to the resulting components. A failed candidate publishes
neither its stocks nor its cursors.

A held interval is not future flow debt. When a vent opens later, retry the water
under new elapsed time, not all the earlier blocked time. Unexpected numerical or
corrupt-state errors reject the detached candidate; expected physical refusal is
typed waiting. Do not catch every exception and silently skip a field. Store due
frontiers/source progress with canonical state so pause/restart cannot grant
extra growth, fuel or transport.

## 6. Terrain: one generated world and one physical query

Actual boundaries are `engine/world/voxel-world.mjs` (opaque base plus sparse
edits), `world-presets/height-caves.mjs` (original recipe), and
`engine/world/physical-geometry.ts` (derived solidity/faces). Keep content IDs,
soil depth, cave distribution and dig permissions in definitions/registered game
rules. A sample or compiler work bound must not become a mysterious forbidden
Dig cell. Known material, permission, reachability and temporary residency are
separate results with separate player-facing reasons.

```text
sampleWorldVoxel(seed, recipeVersion, signedXYZ):
    if persistent edit exists: return edited material
    column = sample shared height/moisture fields at global X/Z
    bed = quantize height once into the registered integer voxel metric
    material = game layer rule at signed Y relative to bed
    if registered cave/feature rule carves this voxel: material = void
    return material
```

This sketches responsibility, not a replacement for current recipe order. Keep
the pinned `height-caves` order unless intentionally changing the generator
identity. The original recipe uses 1 m horizontal / 0.54 m vertical voxels,
four voxels per 2.16 m storey. Rendering uses that same metric. Integer ground
elevation and fractional water fill are different facts; a sloping water surface
does not permit fractional dirt levels.

Noise uses signed global coordinates and versioned namespaces, not a random
stream advanced in chunk-load order. For negative coordinates use mathematical
floor division to identify bricks. Cache column sampling and material bricks;
persist generator identity and changed cells, not a second base map. Evicting a
cache must not erase edits or reset finite water. Overview LOD queries the same
large-scale fields at its own footprint; it does not generate every fine voxel.
Water labels follow land elevation and explicit reservoir rules. Do not fill
every isolated cave below sea level unless a declared initial aquifer/reservoir
rule provides the finite stock or boundary connection.

Physical queries combine terrain with finished structure primitives. They supply
solidity, support/contact and face openings; these are separate questions.
Rendering, picking and navigation read them through purpose-specific projections.

```text
physicalChangeResult = {
    baseRevision,
    changedVoxels,
    changedSolidVolumes,
    changedFaces,
    affectedSupportAndNavigationAreas
}

after commit:
    rebuild physical indexes for the changed areas
    wake water/gas neighborhoods whose openings or capacities changed
    invalidate affected routes, supply eligibility and visual faces
```

Changed metadata such as a display label must not bump physical connectivity.
The mutation owner issues change facts; polling consumers do not hash the entire
world to discover them. Long connected structures may have wider support effects;
the dependency query determines the affected area, not an arbitrary one-cell
invalidation radius. Support/collapse gameplay keeps the existing separate
support policy; this guide does not start collapse implementation.

### Dig/build/deconstruct as one prepared effect

`physical-completion.ts`, `terrain-removals.ts`, `terrain-yields.ts` and the
current paired environment owner already establish this responsibility:

```text
tryCompletePhysicalWork(candidate, operation):
    validate live actor/task/target/access and last incomplete work position
    proposal = prepare actual terrain or finished-structure edit
    materials = prepare exact embedding/yield/salvage in affected material branch
    water = prepare changed capacity, displacement and wet-spoil export
    air = prepare affected gas capacity/connectivity/displacement

    if an expected physical condition blocks any preparation:
        discard this operation's prepared branches
        leave this job waiting at its last incomplete progress
        retain other accepted tick work
        return waiting(reason)

    validate coupled references, capacity, stock balances and output placement
    publish prepared terrain/material/water/air/work changes together
    emit one meaningful completion result and changed-geometry facts
```

No yielded material before a successful dig, no lost pore water when soil disappears,
no finished wall while its input remains available. A failure during the enclosing
SQL commit discards the whole uncommitted world candidate; unrelated progress
survives a domain-level waiting result, not an infrastructure rollback. Cache
updates remain provisional until commit, or are invalidated on failure.

### Picking, levels and debug facts

```text
playerFaces = observed physical faces allowed by selected cutaway/layer
screenFaces = project(playerFaces, current camera, shared metric)
hit = nearest actually visible face at pointer
commandTarget = { voxel: hit.ownerVoxel, face: hit.normal }
server rechecks current knowledge, geometry and permitted operation
```

Do not invert the pointer onto a flat ground plane and guess which underground
voxel was clicked. Sprite alpha and physical footprints serve different purposes.
Rendering/picking must share the current camera and actual projection; a rotated
view is not a rotation of authoritative world coordinates. Remembered hidden
terrain comes from saved player observations, not live unseen sampling. X-ray
debugging requires a distinct grant. Debug overlays consume the exact queried
faces/openings/traversal data; they do not invent another clickbox or world.

## 7. Wastewater: constituents travel with the real transfer

This is **future source work**, not an existing pollutant model. Preserve finite
water alongside a small definition-bounded set of dissolved amounts and separate
soil-bound/solid residue. Nutrient and pollutant concentrations are derived.
Pails, stored containers, pours, ingestion and wet spoil must use the same amounts.

```text
for each accepted face transfer q in ONE transport stage:
    water0 = donor's stage-start water
    for each mobile constituent:
        proposedAmount = q * donorDissolved0 / water0

aggregate ALL outgoing constituent demands for each donor
prepare matching water and constituent debits/credits
if any required paired change is unrepresentable or unavailable:
    defer the entire affected transfer, not just its pollutant
otherwise apply the prepared stage together
```

Do not reconstruct chemistry from `water/index.js`'s final summed face receipts:
concentrations change across stages. The current pressure path only changes
water at endpoints while recording flux at intermediate faces. A constituent
join must exchange each intermediate parcel's mixture too, with shared gross
outflow budgets. Net water zero does not mean unchanged chemistry. Passing the
far donor's concentration directly to the destination would teleport pollution
through the tunnel. Bound per-stage throughflow or subdivide when an intermediate
cell cannot supply its outgoing mixture; do not spend that parcel repeatedly.
Pressure-path admission treats the entire path as one equal-flow bundle:
preflight all intermediate constituent exchanges against shared gross budgets,
then admit, reduce or defer the WHOLE path. If a face cannot settle, do not apply
the other faces or the endpoint-only water delta. Reduction must recompute the
bundle's matching quantities before any part is applied.

```text
drawIntoVessel(candidate, request):
    check actual actor/vessel/claim and selected finite water quantity
    field = prepare water + dissolved withdrawal from the actual source
    goods = prepare matching contained portions and composition
    air = prepare resulting free-volume change
    commit field + goods + air + operation progress together
```

Pouring reverses ownership for the selected real portions, not an arbitrary
uniform vessel average. Soil removal exports pore water/dissolved amounts and
bound constituents with the actual spoil. Evaporation leaves nonvolatile residue;
volatilization is a separate explicit transformation to an air constituent.
Treatment and plant uptake move or transform inventories with outputs and finite
time/capacity. No clean-water flag or free-fertilizer multiplier substitutes for
that ledger. Different species may thrive in wet soil or suffer waterlogging.

## 8. Shared needs and finite work

Extract numeric/time/effect rules from `needs.ts`; keep Goblin's automatic-care
policy, drafted behavior, ration choice and work priority in the game. A needs
owner must not import `Clearing`, paths, jobs, account identity or named food.
Health/infection is later behavior, not a field added to every actor today.

```text
needs.advanceTo(ownedNeeds, T, admittedConditionInterval):
    require T >= previousAdvancedAt
    apply defined rates once over the covered interval
    retain bounded values and changed threshold facts
    set advancedAt = T

game care policy reads threshold facts -> admits ordinary care intent
existing navigation/material/work owners acquire the actual food or water
```

The difficult part is consuming goods and granting the benefit atomically:

```text
tryFinishConsumption(candidate, operation):
    check actor/job/definition/held claim and required attendance
    effect = needs.prepareEffect(current needs, content-defined restoration)
    goods = prepare exact sink through existing material-use owner
    cleanup = prepare current operation/claim/job terminal changes
    if expected temporary refusal: return waiting with no consumption/effect
    validate sink identity <-> outcome and all prepared references
    publish goods + effect + outcome + cleanup together
```

Use a stable completion/sink identity derived from the operation. Region replay
returns the existing command receipt; a retry does not apply the effect again.
Current `WorkHost.consume(): boolean` cannot express temporary waiting: `false`
interrupts after attendance advances. If waiting is needed, change the real
`engine/work/progress.ts` result contract and every current caller; retain the
last incomplete attendance state. Do not hide retry in a forwarding wrapper.

Cancellation before consumption releases the same held goods through existing
safe-edge/drop rules and grants no benefit. A paid traversal finishes or reaches
its existing safe interruption boundary; cancellation cannot teleport cargo.
Cold restore checks outcome/sink/claim/progress relationships. A saved sink with
no corresponding outcome is corruption, not permission to consume or heal again.

The independent survivor meal example then proves reuse without importing
Goblin needs/jobs/activity. It is a narrow consumer of the same operations,
not a second implementation. Recipes with supported effects add definitions;
a new effect adds a typed, owned operation rather than arbitrary world mutation.

## 9. Composition, browser and durable online authority

The initial composition should be explicit code over actual modules. Avoid a
plugin loader or new scheduler while extracting their responsibilities:

```text
materials = createMaterialOwner(gameMaterialDefinitions)        // actual
work = createFiniteWorkOwner(materials.uses)                     // actual
terrain = createVoxelStore(gameGeneratedDefinition)              // actual
needs = createNeedsOwner(gameNeedDefinitions)                    // proposed

program = {                                                     // actual shape
    id: current game + schema + definition identity,
    initial: build current composed state,
    parseState: current codecs then cross-owner relationship checks,
    parseCommand: game command schema,
    authorize: game grant and permitted action policy,
    execute: synchronous admission/advancement through owned operations
}

region = openRegion({ owner: native SQL transaction owner,
                      region: regionId, program })              // actual
```

No UI library, renderer or model call belongs in physical advancement. Goblin
selects household work policies; a directly controlled survivor or ship need
not invoke colony assignment. The optimizer remains available for consumers
that need joint work assignment. Systems own validated saved data, not an
all-optional universal entity. Declare the few real dependency orders in the
composition and reject duplicate ownership before opening a world.

Browser local authority can run this headless program in a Worker. The online
client submits authenticated commands to the DO and receives bounded observations:

```text
client: show reversible input feedback; send stable command id + intent
host:   authenticate; apply grant; dispatch through current Region authority
region: replay identical input OR prepare and atomically commit transition
host:   publish committed revision, result and permitted observation delta
client: apply ordered revisions; interpolate visuals; resync after a gap
```

Speculative feedback cannot create real inventory, progress or hidden knowledge.
Reconnect requests current observed state/results; it does not replay clicks as
new command IDs. One slow program must not stall every region. Mycelium's current
typed module/execution door supplies scoped AI/script operations; no LLM request
belongs inside a game tick or SQL transaction.

Current Region reconstruction/serialization is correct bounded-consumer evidence,
not a throughput guarantee. Avoid a full wire encode/decode between internal
field steps. If complete save serialization dominates the online batch, evolve
the Region's private persistence to changed owned pages/records in the SAME
transaction with revision/receipt/events. Do not move canonical fields into an
uncommitted RAM sidecar or write a second database around Region. Cold restore
validates current state and rebuilds indexes; disposable RAM and rollback rules
remain mandatory on Celld. Host wake uses native durable alarms/obligations,
not a process-local timeout that disappears when the owner is evicted.

The existing Region also has finite command-receipt retention and no finished
sustained-world advance/expiry policy. B must define bounded host batches, stable
advance identities and a durable replay horizon inside the same owner. An alarm
attempt/timer ID is not evidence of advanced world time. Pending delivery or
required replay evidence must not disappear during pruning; expired inputs must
be rejected under an explicit policy rather than replayed as new effects. Raising
the current receipt cap alone does not solve a continuously running world's
lifetime. This is part of the missing online host join, not an existing facility.

## 10. Future harder systems — parked design constraints

These examples keep the boundary honest; they do not precede chunks A–C.

### Moving spaces and projectiles

```text
worldPosition(attachedBody) = shipTransform * bodyLocalPosition
worldPosition(mountedCannon) = shipTransform * cannonLocalTransform

board(person, ship):
    check contact, capacity and current permissions
    change one authoritative space attachment; preserve identity/cargo

launch(candidate, cannon):
    validate current mount, reload state, permission and actual ammunition
    prepare exact ammunition consumption and one projectile identity
    origin/velocity = current mount frame + authored muzzle rule
    publish ammunition + projectile + reload result in one transition

advanceProjectile(candidate, shot, interval):
    segment = physical movement from current position to proposed position
    hit = earliest swept collision, including relevant target motion
    if hit:
        prepare one damage/impact result and retire the shot together
    else:
        move shot or settle its authored lifetime expiry
```

Use logical local positions rather than rewriting every passenger as a second
world-space authority. Existing integer footings remain good for static/local
walking; hull motion and projectiles need their own continuous movement profiles.
Begin with ship translation/yaw; sea height/draft and cosmetic waves can provide
believable sailing without ocean CFD. Damage, vehicles and moving-space owners
do not currently exist. Cannon definitions cannot manufacture those mechanisms.

### Transfer across region owners

One local SQL transaction cannot commit two DOs. The future boundary must fence
the source before the destination can act, and retries must keep one transfer ID:

```text
source commit:
    select exact manifest and named destination
    remove transferable active custody; mark departure irrevocably in transit
    persist immutable transfer id + manifest digest + delivery obligation

destination commit on delivery:
    authenticate bound source/destination and validate manifest
    identical already-accepted transfer -> return its prior receipt
    otherwise admit custody + accepted receipt atomically

source receives durable acceptance:
    close delivery obligation; retain replay/tombstone evidence
    never debit inventory a second time
```

The source's in-transit record is recovery evidence, not spendable duplicate
inventory. A timeout cannot reactivate it because the receiver may already have
committed. Retrying cannot redirect the same token to a different region. Failed
admission requires a defined return/rejection protocol, not an implicit refund;
that protocol and receipt retention must be qualified before activation. The
first ships and fluid neighborhoods stay within one region. Cross-owner water
uses bounded aggregate transfers, not one network call per face or molecule.

## 11. Verification and implementer handoff

Use one joined affected gate for each changed candidate. Reuse unchanged proof;
do not replay old physics matrices or an editor browser suite. New laws should
exercise the failure boundary, not just call the same helper twice:

- Fractional water movement retains gas membership/compiled owner; a genuinely
  closed/opened route changes the correct entire affected component.
- A flooded passage conserves water; blocked gas displacement holds the one
  proposed change while a vent/other work can progress.
- Source/volume edits split time; pause/restart and held intervals do not create
  backdated emissions or double soil transport.
- Terrain edit/cache eviction/read order preserve signed coordinates, material,
  water stock and visible picked-face identity. A hidden cave is not disclosed.
- Simultaneous outflows preserve donor/receiver budgets. Future pressure-path
  pollutants move through intermediate mixtures, not endpoint teleportation.
- Timed care cancellation and lost-ack replay preserve one consumption and one
  effect; real navigation/material claims participate in the independent meal.
- SQL failure publishes no speculative state/cache/result. Cross-owner features
  remain unclaimed until their actual recovery protocol exists.

For chunk A, measure the same actual clearing while digging, flowing and burning,
with environment, job/path, projection and client render work separated. Report
typical and slow updates, touched/total cells, component rebuild counts and
allocations sufficient to explain the outcome. A few milliseconds is the target,
not a claim. If a single altered puddle still recompiles the map, source acceptance
has failed regardless of unit-test count. Publish the responsive game for Levi
to assess; a new scientific fixture cannot replace that exit.

Every handoff names the exact source pin/root, changed behavior, replaced owner,
current callers, passed/failed evidence and remaining limitation. Source ready,
tests passed, playable local and published are different facts. This guide starts
none of those executions by itself.
