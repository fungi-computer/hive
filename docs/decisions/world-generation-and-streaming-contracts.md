# World generation and streaming contracts

## Sleeping-world amendment — September 10

Levi explicitly prefers an alive-feeling world with aggressive approximation of
unobserved activity. Both browser and DO hosts remain targets. A generated chunk,
visible map tile or previously visited place does not require a perpetually
running DO. Persistent changes survive sleep; supported changes over elapsed time
may be resolved lazily or at meaningful deadlines. Follow the newer
[host and sleeping-region policy](local-snapshots-and-durable-ai-jobs.md#browser-and-do-hosts-with-sleeping-regions--september-10).
This supersedes any inference below that offscreen world continuity requires
continuous detailed stepping. Rendering residency, simulation detail, durable
ownership and player knowledge remain distinct. No runtime change is claimed.

## Vertical-world amendment, September 9

Levi explicitly requires deep digging and witch towers as the reusable engine
target. Keep the small horizontal clearing; remove one-down/one-up as engine
assumptions. Game CTO owns this source decision and serial integration. Earlier
Delivery ownership and shallow-only restrictions below are historical.

Actual source explains the inconsistency: `world.js:inside` clamps logical
levels to 0/1, `stairLanding` always returns 1 and `navigationNeighbors` finds
one stair; `construction.js` admits floors only on 1 and stairs only on 0,
with a separate upstairs-room routine. `terrain.ts` stores a removed ground
voxel rather than a general solid/void overlay. These are coupled topology and
persistence limitations, not a missing extra floor button. The roof's asset and
caller describe a cover above its base, while the floor describes its own
walking surface. A player should not have to learn that internal distinction.

### One physical coordinate and placement convention

Use signed integer voxel coordinates with the existing 1 m horizontal and
0.54 m vertical metric. A storey is a convenient four-voxel view/build increment,
not the smallest navigable height or a 0/1 physical union. Terrain, placements,
surface contacts, actor feet, fluid cells and endpoint access resolve to that
same geometry. Rendering may interpolate traversal; interpolation does not
become a second physical location.

Floor and roof tools target the displayed horizontal surface at its actual
height. The ghost, level control, inspection and committed placement agree.
A flat walkable floor can be the ceiling of the room beneath it without a
duplicate roof object. Thatch/sloped roof definitions supply their distinct
shape and walkability. Asset pivots and local offsets are rendering metadata;
they cannot silently advance the command's destination by one storey. Walls
span upward from their selected base surface. All tools use the same checked
placement owner and maintained interaction catalog.

The geometry owner distinguishes full terrain solids, structural volumes and
walkable/covering surfaces. Do not represent every thin floor or pipe as a whole
solid cube, or collapse everything into an air-cell flag. Derived support,
room/ventilation connectivity, path clearance and picking answer different
questions using that same placement. Repeated stairs, ramps and capability-
checked traversal links replace a global one-stair special case. Cat jumping
can add supported links over the same contact surfaces without a second world.

### One-voxel stepping and clambering — September 9

Levi explicitly asks for ordinary up/down traversal of one voxel without stairs,
with animation and a movement penalty. Adopt this as the initial human movement
profile. The current vertical voxel is 0.54 m; this is a noticeable step/clamber,
not a whole 2.16 m storey. It is a pending implementation decision, not shipped
movement. The current `movement.js` still charges 6 ticks for every same-level
edge and 18 for every different-level edge, while `route` uses breadth-first
search and `world.js` still restricts standing levels to 0/1.

For an adjacent horizontal cell, the shared physical query finds a supported
standing surface at the same height or exactly one voxel higher/lower. Admit an
edge only if the body/payload fits at the destination and through the movement,
the supporting geometry exists, and the destination is allowed/known. Empty air
is not a landing; a two-voxel cliff does not become an ordinary downward edge.
Missing resident data remains needs-data, not walkable or forbidden geometry.
Repeated step edges let a worker descend a terraced excavation and return with
the same carried item. They cannot mine from a surface position into a deep
shaft. Work reach uses that actual supported foot position and tool profile.

Initial game-tuning values are 6 ticks for a flat edge, 12 for a one-voxel ascent,
and 9 for descent. These are definition-owned starting values, not measured
balance or universal engine constants. Stairs and ramps remain useful routes
for larger height changes and repeated hauling. Carry/load and creature
profiles can alter admitted movement and cost through the same owner; do not
create a cat-only graph or name-based exception. Larger cat jumps and deliberate
falls remain distinct capability-checked edges, not an expanded human step.

Replace unweighted breadth-first selection with bounded cost-aware routing over
these same admitted edges. The route planner, arrival estimates and executor use
the same duration/cost facts, so a slightly longer flat path can beat repeated
clambering. Freeze an active edge's duration at admission; a later load/profile
change cannot reinterpret its saved progress halfway through the move.

The movement owner records the physical endpoints, edge kind, duration and
progress. Rendering derives a short crouch/lift/foot-plant ascent or controlled
step-down from that progress using the original Three-to-Pixi character assets.
The carried item follows the same body pose; cosmetic interpolation does not
settle movement, create a second physical position or advance paused time.
Geometry edits must respect the active traversal's occupied/swept space; a new
wall or removed landing waits rather than clipping the body or snapping it
through terrain. Commands may change the subsequent route at safe footing.
Save/reopen retains the same admitted movement and item custody.

The first joined demonstration is a pawn walking up/down generated one-voxel
ledges, choosing between a flat detour and a stepped route, then digging and
hauling through a small terraced pit. Check low ceilings, blocked landings,
carrying, pause/reload and an edit during a step. This is followed by repeated
stairs and deeper excavation under the full vertical acceptance below; the
step fixture does not shrink that requirement to one level. No new movement
writer or animation bake is launched by recording this decision.

### Four orientations and a rotating world view

Levi additionally requires four object orientations and world rotation in the
engine **and** demo. The first control is four quarter-turn camera views. A
placement's saved orientation is world-relative, independently of the camera.
His clarification is about an actual placement restriction, not primarily art
reuse: `hud.jsx` toggles `direction === 0 ? 1 : 0`, `world.js:stairCells`
supports only positive X/positive Z, and the saved-site schema only admits 0/1.
The stair entrance cannot face either opposite direction. Fix the joined control,
signed footprint/endpoints and versioned save admission; merely adding more
images would leave the bug intact. Preserve old 0/1 meanings during migration.
Rotating the view never rotates or rewrites terrain, rooms, actor paths, jobs or
stored item locations. Direction-sensitive footprints, stair endpoints and
access points support all four directions. Symmetry may deduplicate equivalent
geometry/bakes; it cannot make a one-ended stair face only two directions.

One view transform owns world-to-screen projection and its picking inverse.
Depth ordering/contact segments, hit silhouettes, selected-height cutaway,
hover/drag geometry and visible directional assets use that same camera state.
Do not repair individual callers with unrelated sign swaps. Keep the Three
original geometry and low-resolution bake to Pixi pipeline; derive necessary
camera/object facings from those originals rather than mirror asymmetric pixels
or rotate a finished isometric image in screen space. Original art/caller review
remains personal Game CTO work. Camera choice belongs in UI preferences, not
the physical simulation clock.

Acceptance rotates an asymmetric stair/bed/tower fixture through all four views,
selects the same real surfaces/objects, places all four stair directions with
correct endpoints, checks foreground occlusion and floor/roof previews, and
follows actors/held items through vertical traversal. View rotation while paused
must not change physical state. Save/reload preserves world orientation and
world positions; normal and narrow controls remain usable. This joins the
geometry/vertical migration, not an isolated CSS/canvas rotation feature.

### Bounded depth without allocating the entire world

Use sparse three-dimensional bricks and a configured world envelope. Retained
studies already provide a signed [-64,64) voxel-height envelope with 16-cube
bricks and bounded residency; that is a useful first comparison fixture, not
a promised player limit or measured gameplay capacity. Freeze final supported
depth, tower height, active field cells and traversal workload before acceptance.
Choose those numbers from a real deep excavation and tower fixture, not the
number of empty levels that can be displayed. A cold brick is generated only
when required; edits and physical field state survive cache eviction. Inactive
simulation policy remains explicit and is not inferred from camera visibility.

Water and gases must account for stacked caves/rooms, opened floors and vertical
connections. A surface heightfield is useful for coarse geography and compatible
surface flow, but cannot represent a cave underneath that surface. Retain the
useful numerical studies without forcing their restricted geometry onto the
game. Use voxel-game fidelity and declared work budgets; this amendment does
not authorize returning to fine-grid CFD as the acceptance target.

### Migration and the proof that closes this requirement

Strictly validate old saves before mapping their storey positions into physical
voxel coordinates. Preserve the exact positions of old roofs, floors, actors,
lots and stair endpoints through explicit legacy anchor conversion; do not
reinterpret an old roof as a ground tile. Keep raw recovery and versioned
generator identity. The authored clearing can remain an authored base recipe
over the same edit/query owner as procedural worlds.

Acceptance must exercise an earned-resource multi-storey tower and excavation
through multiple vertical bricks, with underground traversal and real carried
items; consistent floor/roof placement at several heights; correctly separated
stacked rooms; opening a connection that changes water/air behavior; removal
and support invalidation; paused intent; and save/evict/reload of edited geometry,
physical fields and active work. Existing shallow-save migration and ordinary
ground-level play must remain correct. A standalone brick codec, a taller render
or an expanded numeric bound alone does not satisfy this contract.

The [Excalibur depth review](excalibur-depth-source-review.md) is only a bounded
render/depth reference: spatial lookup, residency and simulation remain separate;
it does not change this world's streaming or performance contract.

The [Minecraft-inspired terrain and isometric world study](minecraft-inspired-terrain-and-isometric-world-study.md)
adds source-backed landform, cave and exposed-part rendering guidance under these
contracts; it does not expand the live clearing or reorder the current Maps sprint.

Status: Game CTO implementation direction, 2026-09-07. Read with `architecture-implementation-plan.md` and the existing World Mapping/LOD ADR. These are future contracts and explicit experiment candidates, not a new runtime, approved planet size, chosen production solver, or gameplay expansion. The existing 16-cell World Lab remains an independent first consumer. Delivery owns tracked implementation and serial integration.

Levi's later isolated round-three goal is recorded in
`.botanical/research/environment-round3-20260908/GOAL.md`. Its world-generation
checkpoint freezes the current generator and measures signed-cell/chunk-order
identity, integer surface levels, exact-versus-LOD work, and edit/eviction/
regeneration ownership. It owns ignored evidence only; it does not alter the
versioned generator, World Lab, live clearing or this contract until Delivery
accepts a concrete tracked consumer.

Levi's supplied Sebastian Lague landmass reference sharpens that future
consumer: configured coherent layers and authored shaping produce one physical
terrain height, quantization produces its voxel surface, and a fixed sea datum
then classifies water. The current World Lab `coastDistance` colour and the old
drainage atlas are diagnostics of the old sampler, not production sea authority.
Changing the recipe requires revalidating named coasts, ridges and canyons. This
adopts the source-backed ordering from Lague's
[noise](https://github.com/SebLague/Procedural-Landmass-Generation/blob/e350384ce8b59286b522c9546dcd4a34475e4aec/Proc%20Gen%20E21/Assets/Scripts/Noise.cs),
[height-map](https://github.com/SebLague/Procedural-Landmass-Generation/blob/e350384ce8b59286b522c9546dcd4a34475e4aec/Proc%20Gen%20E21/Assets/Scripts/HeightMapGenerator.cs)
and [terrain-region](https://github.com/SebLague/Procedural-Landmass-Generation/blob/e350384ce8b59286b522c9546dcd4a34475e4aec/Proc%20Gen%20E14/Assets/Scripts/MapGenerator.cs)
callers; it does not claim a deployed generator or physical ocean simulation.

## Starting evidence and immediate corrections

`src/world-lab/terrain.js` currently gives us global signed sampling, 16×16 byte-array chunks, six footprint-filtered noise scales, analytic coast/ridge markers, a 512² overview and a 25-chunk cache. `main.js` invokes it synchronously and displays terrain codes in a flat 2D canvas. The optional 1024² button does not yet report an actual duration. This is neither an isometric chunk renderer nor hydrology nor streamed Clearing state. `renderChunkBuffer` trusts window contiguity/order, and cache eviction sorts the whole small map. Correct these when their real consumer expands; do not call their present bounded cost a demonstrated crisis.

Gameplay still uses `world.js:SIZE`, `inside`, fixed-board art and `art/scale.js` projection. Changing SIZE alone cannot supply streaming, persistence, a sphere or digging. Existing floor/stair support and logical levels must survive any coordinate extraction.

## Identity and coordinate decisions

Separate a saved world's identity from its generated terrain recipe:

```ts
type WorldSpec = {
  worldId: WorldId; // different saves can share the same seed
  seed: CanonicalSeed;
  generator: {
    version: string;
    parameters: CanonicalParameters;
    digest: Digest;
  };
  terrainFeatureManifest: ImmutableManifestRef;
  contentManifest: ImmutableManifestRef;
  topology: SpaceTopology;
  units: UnitSpec;
};
type Place = { space: SpaceId; cell: WorldCell };
type ChunkAddress = { space: SpaceId; x: number; z: number; band: number };
type SpaceTopology = {
  kind: "finite-plane";
  cellBounds: IntegerBounds;
  macro: {
    bounds: Bounds;
    width: number;
    height: number;
    edgePolicy: EdgePolicy;
  };
}; // A future cube-sphere is a separately specified variant.
```

`WorldCell` is the authoritative global lattice coordinate within its space. Chunk/local indices are derived using mathematical floor division and positive modulo. Validate finite integer ranges at admission. Never use signed 32-bit coercion for the whole world's coordinate merely because the noise hash accepts 32-bit inputs. Partition/hash the coordinate explicitly and test negative and maximum supported values. Render relative to a nearby camera origin to avoid large-coordinate float jitter; camera origin changes never rewrite saved coordinates.

Initial production topology should stay a finite plane when that is what we can prove. A finite-surface planet is a separate versioned topology decision. Candidate for that future experiment: six cube-sphere faces with an explicit face-edge adjacency/orientation table and a stable surface coordinate. Sample broad fields in a shared 3D direction domain; do not generate six unrelated planar continents. Corners, cell areas, edge neighbors, travel cost, feature ownership and inverse picking need seam tests. A sphere painted with an unrelated map is only an illustration. Existing planar saves must not silently be reinterpreted as planetary cells.

Current logical `level` is a storey; `STOREY_HEIGHT=2.16` is an art/projection datum. Before excavation, choose a vertical lattice and explicit storey-to-voxel conversion whose units agree. Preserve floors/openings independently of cell solids. Do not treat level 1 as one meter, one voxel or raw geometry height. This quantitative choice remains an excavation checkpoint, not permission to migrate upstairs during brewing.

## Three persistent layers, several disposable views

1. **Generated base:** deterministic material/terrain and stable feature definitions from pinned generator inputs. Regenerable only while the exact compatible recipe remains available.
2. **Durable change records:** terrain edits, feature tombstones, player structures, spawned instances and changed ecological state. Each binds world/space, base recipe digest, global-cell or stable-feature target, ordered revision and cause; saved progress is explicit.
3. **Live authority state:** actors, goods, jobs, claims, processes and active fields at a committed simulation frontier. Sleeping/offscreen does not mean disposable.

Apply base, then compatible revision-ordered tombstones/overrides, then authoritative current instance state. Incompatible base bindings require migration or rejection, even when the seed matches. Chunk meshes, texture pages, route caches, room-query graphs, atlas tiles and spatial indexes are derived views. Persist them only when justified as versioned caches. World patches are not command receipts; clearing a render cache must not clear either one. A felled generated tree needs a durable tombstone or instance override, otherwise regeneration resurrects it.

The saved manifest retains or immutably addresses canonical parameter and manifest bytes as well as their digests. It pins generator version, complete generation parameters, content versions and base digests. Upgrade policy is explicit: retain old generator support, materialize compatible base data, or run an audited migration. Never run the latest generator under old edits and hope IDs align. Base-cache sharing requires equality of seed, complete terrain recipe, topology, units, space-generation inputs and relevant terrain-feature manifest. Unrelated dialogue/card changes do not invalidate terrain. Mutable state and instance identity remain world-scoped.

## Generation pipeline

Generate coherent geography at a bounded coarse resolution, then request local detail only where needed. A global coarse field is affordable only at an explicit bounded sample count; it is not full-detail generation in disguise.

| Stage                | Input/output                                                                                                                   | Work boundary                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Continental shape    | Low-frequency field, bounded domain warp, land/sea policy → broad elevation                                                    | Cached macro tiles or one bounded coarse surface                     |
| Ridges and substrate | Ridge field + geological regions → slope, bedrock, soil potential                                                              | Shared global coordinates, separate random domains                   |
| Climate potential    | Latitude or authored regional gradient, elevation, seasonal forcing, broad moisture transport → temperature/rainfall potential | Macro grid; no per-cell weather histories yet                        |
| Drainage features    | Coarse elevation + outlets/basins → watershed IDs, river graph, lake spill points                                              | Whole bounded macro domain first; regional refinement later          |
| Local shape          | Macro features + stable finer octaves → cell materials, slopes, channel profile                                                | Requested chunk plus required halo                                   |
| Biome potential      | Climate/substrate/drainage → weighted vegetation/species suitability                                                           | Continuous conditions first, display label second                    |
| Features             | Suitability + stable anchor rules → trees, rocks, deposits, ruins, dungeon entries                                             | Canonical owning region, cross-border references                     |
| Persistent overlay   | Base + durable changes at revision → actual local terrain and ecology                                                          | Authority-owned merge; stale generator output cannot overwrite edits |

Use fBm-style sums of coherent frequencies for broad/detail structure and a ridged transform for mountains; bounded domain warp reduces obvious regularity. Each layer has an independent seed domain. Preserve amplitudes as zoom changes. The exact noise implementation is selected by a small source/license and browser benchmark comparison; [FastNoiseLite](https://github.com/Auburn/FastNoiseLite) is a maintained implementation candidate with gradient/value/cellular noise, fractal and warp variants. Its C++ benchmark is not our browser performance result. Do not build a noise-node framework or choose WASM merely because it exists.

Compile seed/config once per request or worker context. Avoid string construction and string hashing at every lattice corner, as the provisional sampler does. A coordinate-keyed integer hash provides independent draws for `elevation`, `soil`, `tree-anchor`, etc.; requesting chunks in a different order never consumes a shared mutable random stream. Generation does not call wall time or Math.random. Simulation randomness uses its own persisted stream/counter and cause identity. Authored names/appearances sample once and persist.

Exact byte equality is a contract for the supported implementation/runtime set, not an assumption about all JavaScript math or all noise ports. Define quantization and tie-breaking before hashing persistent outputs. Test supported browser/host engines; if cross-engine generation diverges, use authoritative generated bytes or one verified shared implementation. Never infer portable determinism from one browser's repeated checksum.

## Rivers and lakes require a connected model

A moisture-noise patch is not a river. First build a bounded coarse drainage graph. `MacroSpec` fixes extent, resolution, coordinate-to-cell mapping, boundary/outlet policy and algorithm version. `MacroResult` pins that spec digest, feature manifest, completed-domain coverage and drainage/climate output digests. Local refinement consumes only a complete compatible result; partial macro tiles cannot declare a catchment complete. Suggested experiment: Priority-Flood-derived basin/spill analysis on that macro elevation grid, followed by directed flow accumulation and a river threshold. The [authors' algorithm/reference](https://arxiv.org/abs/1511.04463) is a starting point for depression handling; its guarantees do not prove a game fluid solver. Keep original terrain and a separate drainage/spill surface. Preserve selected depressions as lakes/wetlands; do not flatten every basin in the playable landscape simply to obtain flow directions.

For a finite plane, specify sea/outlet or closed-basin boundary conditions. On a closed sphere there is no rectangular exterior to flood from: oceans and retained basins provide terminals, and disconnected endorheic drainage must be deliberate. Resolve flats with deterministic rules; directed downstream traversal terminates at a valid outlet/basin rather than looping. Rainfall accumulation and channel dimensions use specified units and model assumptions.

Store major rivers as stable graph/polyline features with shared endpoints, elevations, catchments and water-source policy. Refine a local channel against those constraints, preserving a downhill bed/spill relationship. Neighboring chunks clip the same river, rather than rolling unrelated streams. A small halo cannot discover an entire watershed: cross-region refinement requires precomputed macro constraints or explicit upstream/downstream dependency data.

Generated water geometry initializes quantities once under an initialization record. Rain, ocean boundaries and springs have explicit later source/sink rules. Resampling the base must never refill a drained pond or reset a diverted stream. Distinguish water volume, flow, soil moisture, groundwater, nutrients and contaminants; later environmental work owns their evolution. Generated water is not a potable flag.

## Biomes can change without rewriting world identity

Keep **climate/geological potential** separate from **current ecological condition**. Potential describes what could thrive. Current canopy, ground cover, soil nutrients, moisture and damage explain what does thrive. Cutting trees, diverting water or restoring wetlands changes those actual quantities. A biome label/appearance is derived from them with thresholds/hysteresis to prevent flicker, not stored as a magical switch that rewrites every organism.

Ancient elven food forests are deterministic historical feature recipes plus persisted living instances/knowledge traces. They can supply unusual species, old terraces or inherited soil conditions without requiring simulation of ten thousand years. Once initialized they obey current growth, disturbance and decay rules. Generated history must not continue reapplying its benefits after destruction.

Caves require volumetric material/void data or an explicit tunnel/room graph embedded in volume. Surface height alone cannot represent overhangs or underground spaces. A later sparse vertical-brick experiment can combine strata, seeded cavities and authored connected tunnels; generated entrances and exits share stable feature IDs. Respect fluid, support and path boundaries. A procedural dungeon placed by a later world event has a persistent instance/cause; it is not a time-dependent exception inside pure terrain sampling.

## Cross-border features and LOD

Give each generated feature a canonical anchor and owner region. A tree's canopy may overlap several chunks; it still has one ID and one trunk/resource instance. Placement candidates query a bounded neighbor halo with a deterministic conflict/tie rule. Large structures and rivers use region feature records, not a halo of arbitrary size. Tombstones refer to those stable IDs. Rendering deduplicates overlapping references.

Use two explicit query contracts:

```ts
sampleBaseCell(spec, globalCell); // full authoritative detail
sampleMapFootprint(spec, bounds, resolution); // aggregate visual information
```

Both use the same geography. The second filters frequencies below its pixel footprint and includes scale-appropriate river/road/settlement features. Do not renormalize surviving noise amplitudes or let a map setting change collision. Narrow rivers may be drawn as feature lines or coverage fractions even when a center sample misses them. Atlas output can use bounded extra samples for shoreline coverage; it never silently enumerates every underlying cell. Terrain edit summaries, known settlements and discoveries form revisioned overlays. If an overlay is behind its source revision, invalidate or label it rather than present stale data as current truth.

A mini-map may know less than the loaded terrain. Server observations and maps respect discovery/vision grants. With deterministic client generation, secret procedural locations can be inferred from an exposed seed; keep hidden encounter/resource state server-owned or explicitly accept geography as discoverable. Fog drawing alone is not secrecy. Physical maps store survey references, coverage and observation time; they do not own another world database.

## Worker and residency lifecycle

Begin with one ordinary Worker around the pure terrain implementation. Main/UI owns camera demand and presentation; the worker owns its computation and scratch buffers. Additional workers require measured queue saturation plus a transfer/memory comparison.

```ts
type GenerationRequest = {
  epoch: number; requestId: number; recipeDigest: Digest;
  region: { space: SpaceId; bounds: IntegerBounds; haloCells: number };
  output: "chunk" | "overview-tile";
  maxOutputBytes: number; maxScratchBytes: number;
};

onDemandChanged(demand) {
  epoch += 1;
  queue.replaceObsoleteDemand(demand, epoch); // retain reusable same-recipe cache
  pumpWithinQueueAndByteLimits();
}
onWorkerResult(result) {
  if (!matchesCurrentRecipeAndDemand(result)) return dispose(result);
  baseCache.accept(result);                  // immutable generated base only
  scheduleBoundedRenderUpload(result);
}
```

Epoch rejects stale results; it does not interrupt a blocked worker by itself. Divide overview/macro generation into bounded tiles or resumable algorithm steps and return to the worker event loop between them. A cancel message cannot be read during a monolithic synchronous million-sample loop. Save priority/continuation state for algorithms such as drainage; cancellation discards only that request's scratch output.

Use transferable ArrayBuffers where ownership can move. Transfer detaches the sender's buffer, so it cannot simultaneously serve as the worker's retained cache. Choose a single owner or explicitly account for a copy. [Platform semantics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects). Avoid SharedArrayBuffer/Atomics until a real workload requires their deployment and synchronization burden.

Maintain separate budgets for queued/in-flight output bytes, decoded base/delta bytes, active simulation fields, GPU textures/meshes and retained save work. A cache's item count alone is insufficient when content sizes vary. Evict least-recent unpinned data; do not sort the entire world to remove one entry. A modest Map-based recency queue is sufficient before a measured need for something else.

Pins represent reasons: visible/render-overhang, actor/path corridor, active job/claim/process, changing environment boundary, pending transfer, dirty save. Reference or reason sets must release predictably. Camera movement releases a render pin only. If pinned state exceeds budget, stop admitting expansion or report a measured capacity boundary; never evict a working pawn or overwrite a dirty chunk to meet the chart.

Before evicting changed authoritative data, capture a revision, commit it and confirm the live data still matches that saved revision. A stale asynchronous save completion cannot clear a newer dirty flag. A simulation region is an authority-owned membership set of chunk addresses plus entity/process/claim records; it has its own stable region ID, owner epoch and committed tick/revision. It is not inferred from the camera window. The first region can contain the whole home and its travel corridor. Keep cross-chunk claims/actors there until the consistency set is safely checkpointed. Its manifest transaction references coherent chunk/entity versions and external boundary receipts; unrelated save calls are not an atomic world snapshot. Dynamic region repartitioning is a later protocol and cannot be caused by LRU eviction.

## Memory and frame targets

Illustrative arithmetic, not actual runtime use: a 16×16 surface chunk with one uint8 terrain, one uint16 elevation and one uint8 moisture plane is 1 KiB. A 16³ brick with uint16 material is 8 KiB. One optional uint32 water plane adds 16 KiB, before deltas/flux scratch. A 112² RGBA sprite is 50,176 bytes before packing/driver overhead. Do not allocate every gas, organism and water plane in every untouched rock brick. Sparse records suit irregular entities; dense typed arrays suit active fields. Measure conversion and sparsity overhead before selecting compression.

Initial experiment settings remain 512² overview and 25 local surface chunks. Candidate worker queue limits: one executing request, one posted request, at most eight waiting tiles with a total byte cap; view changes coalesce obsolete work. Candidate overview tiles 32² or 64² are selected by measured cancellation responsiveness, not standardized for every future algorithm.

Targets on a named desktop browser: steady 60 fps, input-to-feedback under 100 ms p95, and no generation-caused main-thread task above 50 ms. Aim for render uploads within about 2 ms per frame and ordinary worker task/cancel checkpoints within 25 ms. These are tuning targets, not promises. Report p50/p95/worst, cold versus warm, phase time, bytes and GPU/JS/WASM separately. Mobile and software-headless evidence are separate. Existing 50 ms simulation ticks must have headroom; rendering, save and generation cannot each assume the whole frame budget.

## Acceptance packets, in order

1. **Current planar lab:** full-array order/regeneration equality, signed coordinates, named coast/ridge visible at two footprints, real timing, correct caller order/window validation. No hydraulic/streamed game claim.
2. **Bounded worker:** actual input remains responsive during overview generation; change seed/region mid-request; stale results never appear; cancellation and buffer release return to the stated byte bound.
3. **Base plus patch:** change one cell/fell one feature in the lab namespace, commit, actually drop decoded data, regenerate and restore after page reload. Inject save failure/stale completion; original checkpoint remains recoverable.
4. **Macro ecology diagnostic:** display drainage direction/catchment/outlets and climate potential; adjacent chunks share one river geometry; basin/outlet constraints hold. No live water-flow claim.
5. **Real chunk integration:** one existing actor and cargo cross/return while home work continues; third modified unoccupied chunk evicts/restores; unknown terrain returns needs-data; stairs/rooms work across a boundary. This proves a controlled fixture before Levi opens world gameplay.
6. **Optional planet diagnostic:** same geographic feature across face seams and globe/local picks; correct adjacency, units and overlays. Do not promise it until that topology is selected and evidenced.

Noise/render/worker experiments can proceed independently of gameplay. Topology/save/actor integration is one coupled writer. Source before/after and one real caller matter more than a large feature count.
