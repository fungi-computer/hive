# Cut-level rendering and Ingnomia study

**September 17 supersession:** [Section 14](14-simple-depth-rendering-handoff.md)
now owns sorter implementation. The plane-comparison/dependency-graph proposal
below is historical and must not drive new work. This page still owns cut
visibility and terrain observation contracts. The replacement scalar convention
requires its real-art qualification checkpoint before production cutover.

September 16. Accepted direction; source research, not implemented or benchmarked.
[Index](README.md) · [Drawing](04-drawing.md) · [Art/geometry](06-edge-buildings-and-art-parts.md).

## Player contract

Selected support level L sets the structural cut. Draw potentially visible terrain
below it, including hole bottoms and lake beds subject to water opacity. No fixed
three-level window, ghost overlay, or white abyss around underground passages.
Solid earth intersecting the cut remains a visible cross-section. This visual cap
does not create a walkable surface, reveal undiscovered contents, or alter physics.

Keep whole actors and compact furniture supported at/below L, even when their art
extends above the cut. Visibility eligibility is not always-on-top: actual nearer
terrain, walls and art parts still occlude them. Structures above the cut disappear;
crossing walls/stairs use declared art parts/cut representations, not a horizontal
screen-space crop. See section 06 for rail/support separation and edge walls.
Use subtle top-edge accents and earth sides; do not generate elaborate transition
blocks for cliffs. Preserve original art, poses and attachment datums.

## Coordinates and visibility ownership

Use section 06's canonical coordinates: voxel centers are integer x/y/z, vertical
spacing h=0.54m, support top is (L+0.5)*h. A four-voxel storey is not one voxel.
Use the real camera transform for projection; do not introduce a second isometric
formula. The cut and body support refer to this same datum during stair movement.

Conceptual pseudocode (not new creator API):

```text
cutHeight = supportTop(selectedLevel)
facts = observedVolume(cameraFrustum, cutHeight, includeLower=true)
for solid in facts.solids:
    clipped = intersect(solid, below(cutHeight))
    emit exposed boundary pieces of clipped
    # includes cross-section where the cut intersects solid
for object in facts.objects:
    if object is whole-body art and supportHeight(object) <= cutHeight:
        emit declared art parts with complete pose bounds
    else:
        emit structural parts allowed by the cut contract
records = cullByProjectedBounds(emittedPieces, viewport)
order = geometryOrder(records, sharedCamera, stablePartIds)
draw safe consecutive batches in order
pick using that same order and existing alpha silhouettes
```

`observedVolume` is a required data contract, not an implemented API. Read the
existing observation owner before changing it. The current surface-only filter
cannot reconstruct underground solids: do not invent those from the highest tile.
Supply bounded authoritative solid/empty spans through the existing native
material query and host presentation owner, as specified below. Discovery is not
yet a connected player-scoped capability in this observation path; do not claim
that it is. Preserve the game's currently authorized observation scope. Renderer caches derived faces only. Keep
commands, saves, simulation activation and terrain generation under their owners.
All lower geometry is eligible; query/cull only what can affect the viewport.
Do not silently replace missing observation data with invented dirt or open air.

## Ordering and batching

The current `world-view.js` filter drops columns above the cut. The current
`terrain-layer.js` combines terrain tops and sides into chunk/level pictures, and
`isometric-sorter.js` can order differing storey bands before testing geometry.
These are the three coupled repair seams. Read current callers before editing.

Keep spatial broad-phase, static relationship cache, stable IDs and art parts.
Terrain faces and floors participate in geometry ordering; higher elevation does
not automatically mean foreground. Only merge records when no visible actor or
structural part must interleave. One giant terrain tilemap is not automatically a
valid batch. Begin with correct records, measure batches/draw calls, and introduce
packed tile geometry only behind the same order contract. Do not require one
heavy Pixi object per buried voxel or rebuild pictures when the cut changes.

Art is still authored with the original Three-to-low-resolution-bake pipeline.
Reusable top/side/corner artwork is an asset product; runtime terrain selects and
batches it. A true ordering cycle needs a smaller declared art/geometry piece;
stable tie-breaking must not be claimed to fix contradictory occlusion.

## Ingnomia evidence and limits

Reviewed repository tree `4f99266c0f95faa847ca0db2af18cf59aff07f4b`, independently
rewritten Ingnomia, not original Gnomoria. Sources:
- [Renderer](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/gui/mainwindowrenderer.cpp):
  `updateRenderParams` limits z to viewLevel-renderDepth through viewLevel;
  `paintTiles` issues instanced opaque/transparent passes. It still submits full
  world x/y for that depth slab; do not describe it as perfect viewport culling.
- [Vertex shader](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/content/shaders/world_v.glsl):
  projected depth uses rotated x+y+z with upright offset; empty pieces are culled
  in the vertex shader. Ordinary hardware depth testing, not a baked per-pixel
  geometry depth map. These constants assume its own tile/art convention.
- [Fragment shader](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/content/shaders/world_f.glsl):
  wall, item and creature images composite in the same upright tile; lowered walls
  can select alternate art. This is not a solution for our arbitrary interleaving.

Borrow explicit level visibility, reusable imagery, bulk draws and changed-data
uploads. Do not port OpenGL 4.3 compute/SSBO infrastructure, tile-bound creatures,
its depth limit, or its shaders into Pixi. No new depth renderer is authorized.
Source inspection does not prove performance at our active population or water load.

## Serial implementation and acceptance

1. Freeze one small fixture: flat land, pit, stepped cliff, cave under solid earth,
   lake, two-height goblins, stair rails and floor/wall contact. Establish expected
   occlusion in all supported camera orientations before expanding the repair.
2. Extend existing observation seam to expose required bounded solid/empty facts;
   unify ordinary Clearing and performance consumer. No second client world state.
3. Implement one derived cut-visibility owner and canonical terrain pieces. Remove
   old top-column filtering and whole-level precedence with their real callers.
4. Join pieces to existing sorter/picker; enforce safe batch boundaries. Preserve
   static invalidation for topology, replacement, rotation, cut and orientation;
   update moving pose bounds without invalidating the whole static world.
5. Consolidate related cut/occlusion assertions in the fixture test; personally
   inspect movement into/out of pits, cave entry, stair traversal and cut scrolling.
   Verify lower actor feet, nearer/farther faces, intact tall art, underground solid
   context, matching picking, and no artificial floor/admission changes.
6. Measure warm/cold view changes, rendered working populations 32/100/200, draw
   calls, visible records, comparisons, bake/update time, memory and frame p95.
   Separate native simulation, observation/wire and browser cost. Include active
   water and construction invalidation. Report limits, not unmeasured guarantees.
7. Run focused current-save and same-world multiplayer smoke; release only the
   coherent accepted preview pair with normal source/artifact/rollback receipts.

The concrete contracts below close the observation and batching decisions for
steps 2 and 4. Implement them serially; the first rendered fixture remains a
review checkpoint, not permission to invent a different rendering architecture.

## Follow-up: water, gas, terrain and assignment performance

Source inspection September 16, same pinned Ingnomia tree as above. These findings
are research/prioritization, not authorization for a new simulation rewrite.

| Area | Observed Ingnomia mechanism | Hive implication |
| --- | --- | --- |
| World water | `World::processWaterFlow` visits `m_water` wet-cell set, examines six neighbors, queues drain/flood changes and batches render updates. It still visits settled wet cells. | Preserve native `terrain_water/field.rs` bounded active queue, sleeping cells, unique wake-up membership and copy-on-write pages. Do not substitute an all-wet scan. Measure dirty-page projection and observation separately from flow work. |
| Pipes | `FluidManager::onTick` runs at most once per 20 ticks; topology rebuilt by `updateNetwork` on pipe edits. | Useful distinction between topology changes and transport cadence, not a reason to introduce pipes now or throttle world rivers offscreen. |
| Gas | No gas/smoke transport owner found in inspected game tick, world/fluid implementation or source filename inventory. | No gas performance claim from this study. Hive `terrain_atmosphere.rs` already bounds work, queues stocks and caches contact geometry with invalidation. Profile that real implementation; do not infer gas from pipe code. |
| Terrain ecology | `processGrass` visits growth candidates and registers nearby candidates after growth. Initial/load discovery scans whole world. | Preserve generated terrain vs active ecological work separation. Use deterministic due work/affected neighbors for growth; don't run every grass tile each tick. This is a pattern, not a proposed new grass simulation. |
| Terrain rendering | `AggregatorRenderer::onUpdateAnyTileInfo` packs only supplied changed tile IDs; `paintTiles` batches a depth slab. | Dirty visual updates are valuable. Its full-x/y slab submission and all-creature collection are not a scalability model to copy. Keep camera cuts presentation-only and update affected chunk boundaries, not all terrain. |
| Work assignment | `JobManager::getJob` indexes by type/priority, uses skill order, distance queues and connected-region tests, then chooses per gnome. Returned jobs retried with a 3ms wall-clock limit. | Keep Hive's Rust Hungarian joint assignment. Reuse eligibility/index/connectivity concepts where absent, rather than a second allocator. Deterministic operation-count budgets plus retained queue cursor are suitable for replay; a wall-clock cutoff is not. |

Direct sources (all under pinned tree above):
- [World water and grass](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/game/world.cpp)
- [Pipe manager](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/game/fluidmanager.cpp)
- [Job manager](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/game/jobmanager.cpp)
- [Render aggregation](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/gui/aggregatorrenderer.cpp)

### Measured follow-through, in priority order

1. Instrument existing environment advance vs observation/serialization vs drawing.
   Native water `facts()` enumerates/sorts all realized stocks; this is a potential
   projection cost, not proof it is the current bottleneck. Trace callers/frequency
   before replacing it. Existing `changed_liquid` skips unchanged Arc-backed pages;
   preserve that advantage instead of inventing a second dirty-state owner.
2. Use one environment witness with quiet lake, flowing inlet/river, dam breach,
   local excavation and smoke in closed/open rooms. Compare unchanged background
   size at equal active work. Record active/queued/processed cells, changed pages,
   output bytes, p95 tick/frame time and backlog. A bounded queue can lag behind;
   demonstrate propagation and fair progress, not merely a fast capped tick.
3. Trace assignment admission/index upkeep on construction, stock changes, draft,
   cancellation and reconnect. Evaluate connected-area rejection only as a cheap
   negative filter backed by current traversal topology; it is not a path length
   estimate or a permission proof. Keep exact path validation and native optimizer.
4. For water/air topology changes, test wake/invalidation across chunk boundaries,
   continued offscreen flow, pause, save/reload and durable restart. Retain pending
   work and conserved quantities; a cache must never be the only wake-up record.
5. Fix only measured dominant costs inside their existing owners. Do not claim
   Ingnomia has a superior water/gas/assignment solver or import its special-case
   job paths, process-global randomness, or wall-clock scheduling into Hive.

## R1 — Concrete underground observation contract

### Existing owners and exact extraction

Extend `TerrainPresentationOwner` in `engine/src/runtime/terrain-presentation.ts`
with bounded material-chunk reads. Reuse `KernelPort.terrainMaterials` in
`contracts.ts`; its maintained native implementation calls `TerrainOwner::query`
(edits before immutable generation). It accepts 1–256 cells per call. No new native
volume service, duplicate generator, physicalContacts-based terrain, or saved
render state. `physicalContacts` also contains structures and would double them.

The new read request is presentation transport, alongside placement queries, not
an action/Whistle command. Implement it in `runtime/protocol.ts`, `worker.ts`,
`remote-client.ts`, `tools/public-engine-host/worker.ts`, and their maintained
client transport adapters together. Follow the existing placement-decision request
path for authenticated read access and request correlation. DO read handling uses
its accepted session and existing serialization with mutations; never publish a
candidate state that has not committed. Local/performance workers use the same
session read owner and decoder. Do not add a separate command registry.

`terrainPresentation.readChunks(request)` is the planned internal method:

```ts
// Proposed transport types; define one Zod boundary schema and infer TS types.
type ChunkKey = readonly [number, number, number]; // signed integer chunk indices
// Chunk edge 8; origin = key * 8 in cell coordinates, including negative cells.
type TerrainChunkRequest = {
  requestId: number;
  epoch: number;
  terrainRevision: number;
  chunks: readonly ChunkKey[]; // 1..8 distinct chunks
};
type TerrainChunk = {
  key: ChunkKey;
  min: Cell; max: Cell; // half-open, chunk intersect authoritative world bounds
  columns: readonly {
    x: number; z: number;
    runs: readonly { minY: number; maxY: number; material: number }[];
  }[];
};
type TerrainChunkReply =
  | { kind: 'ready'; requestId: number; epoch: number; terrainRevision: number;
      chunks: readonly TerrainChunk[] }
  | { kind: 'stale'; requestId: number; epoch: number; terrainRevision: number }
  | { kind: 'unavailable'; requestId: number; reason: string };
```

Use the existing observation envelope epoch. A ready reply is all requested chunks
at one terrain revision, never mixed. Run bounds partition every returned column
from min.y to max.y; adjacent identical materials coalesce. Columns ordered x then
z, runs by minY. Include empty material runs explicitly. Slots are interpreted with
`EnvironmentMaterial.solid`, not zero/nonzero. Expose the checked presentation
material palette and authoritative world bounds/verticalMetres once per epoch in
the terrain baseline. Material definitions are immutable within an epoch; changing
pack/reset/load changes epoch and clears all geometry. Keep structureSurfaces and
placementRevision separate and owned by the existing geometry projection.

Before any sampling validate all request coordinates, duplicates, bounds and epoch.
Eight chunks require at most 4096 samples, at most sixteen 256-cell native calls,
and at most 4096 runs even for alternating materials. Set request chunk count and
reply run limits from those bounds. Serialize/measure reply under 512 KiB, within
the host's existing 1 MiB observation ceiling; fail explicitly if exceeded. Don't
silently omit cells. This is an initial tunable work budget, not a speed guarantee.
Sample synchronously within one accepted session read so edits cannot interleave.
Outside-world portions are clipped using explicit bounds, not fabricated air.

### Demand and lifetime

Client `terrain-visibility.js` (new narrow derived-view owner) enumerates chunk
AABBs whose projected bounds intersect the viewport below the cut. Include original
art overhang padding and a one-cell neighbor halo. Use inverse orthographic camera
rays through viewport corners over world vertical bounds to enumerate candidates;
chunk AABB projection rejects false positives. Do not request all world columns or
sample the full 64×64×72 window on every observation. Initial camera follows the
existing focus; changing camera/cut updates demand, not physical simulation.

Process near-cut visible chunks first, then remaining potentially visible lower
chunks, stable chunk-key ties. Previously committed visible chunks stay drawn while
new coverage loads. Unobserved space is loading/unknown, never empty geology; picking
and tools cannot treat it as support. The spatially bounded response has no fixed
lower-depth limit. Sampling can continue while simulation is paused.

Maintain one outstanding chunk request per client; discard obsolete replies by
request identity/epoch/revision. Schedule subsequent batches on observation/read
turns, not an unbounded promise loop. Host uses a round-robin presentation request
queue across subscribers: at most one 4096-sample batch per service turn, yielding
to pending physical commands/ticks between batches. Keep this disposable read queue
outside simulation/save state; reconnect simply requests needed coverage again.
Don't change the tick scheduler or acknowledge a read as a durable game command.

Use a bounded presentation cache (initial 512 chunks, LRU; pending <=1 batch). Pins
are the chunks used by the current complete view. If a requested view exceeds cache
capacity, return/display an explicit view-budget condition and retain the last
complete view; don't silently drop lower layers or repeatedly evict/refetch pins.
Measure this on the existing performance cameras before acceptance and tune the
budget with evidence. World size, current presentation capacity and physical
simulation activity remain separate concerns. `presentationWindow` is initial
framing only for this new query, not permission to fabricate terrain outside it;
server clips requests to the game's actual authorized world observation bounds.
There is no new fog-of-war implementation in this repair.

### Revision and wire join

Retain `terrain-wire.ts` baseline/reference handling for current surface consumers.
Add material palette/world bounds to the full baseline. Chunk replies are complete
records, not references; cache is keyed by epoch, terrain revision and chunk key.
A frame includes `terrainChanges(previousRevision)` information for chunk cache
invalidation: changed columns invalidate every cached vertical chunk intersecting
those columns plus neighbor-derived faces; unchanged chunks can advance their
revision stamp. Missing history/full-reset empties the cache and schedules reads.
Water-only updates do not change material chunks. Valid edits outside cached coverage
are ignored for local geometry, not treated as malformed world coordinates.

Host `sendObservation` currently remembers only `attachment.terrainRevision`.
Update that path and `runtime/worker.ts` together to send the change information.
On reconnect/restore send a full baseline before references; hydrate it in the
remote client before ordinary duplicate-committed-frame suppression. Chunk replies
need their own request handling, not the world-frame sequence deduper. A newer
terrain frame invalidates in-flight older chunk replies. Water presentation uses
covered cell positions, replacing `isExteriorWater`, which currently hides cave
water. Do not make water eligibility depend on the highest exterior surface.

Complete baseline metadata and chunk decoding use one shared checked schema; remove
replaced manual validators on these touched fields. World save version changes only
if saved facts change (this design adds none). Version the presentation protocol
according to its existing owner; unsupported old clients must reconnect/reload
clearly, with no compatibility adapter.

## R2 — Concrete terrain geometry and batch contract

### Faces and cut

Construct faces from solid material cells in complete chunk coverage. A cell center
(x,y,z) occupies x/z +/-0.5 and y +/-0.5 in voxel coordinates; convert y using h.
Intersect solid cells with y <= L+0.5. At integer selected support L this retains
cells with y<=L. Emit a top face at L+0.5 when cell L is solid even if L+1 was solid;
this is a visual cross-section cap. Below cut emit a face only when its adjacent
cell is known non-solid. Omit internal faces, camera-backfacing faces, and bottoms
unless they are actually visible for the supported camera. Chunk absence never
proves an exposed face: request its halo and withhold that undecided face meanwhile.

Retain cell-sized faces as logical records with stable `(cell, face)` IDs. Don't
merge a cliff's entire height or a whole chunk into one sortable record. Top face
UVs use existing material patches; side faces use original earth/stone artwork;
cut cap uses the intersected material, not grass. Decorations are separate declared
art parts when they can overlap actors. Flat detail can share its supporting face.
No new terrain material or gameplay item is created by decoration.

### Geometry order, without a second projection

Adapt existing `isometric-sorter.js` record preparation to use the same camera
projection as `terrainScreenTransform`/canonical camera, including elevation. Drop
`terrain-band` precedence and SURFACE_ROLES precedence for non-coplanar geometry.
A role tie-break applies only after geometry establishes a tie.

For planar terrain faces use their real world corners. Existing compact actor
support points and long footprints remain art anchors, not inferred pixel depths.
Build an upright ordering plane through the compact support point (camera-facing),
or a vertical curtain through each long art part's declared endpoints. Extend its
projected bounds to the full current art pose; this ordering proxy never changes
collision or support. Different rails retain different planes. Reuse declared
support-surface and upright-boundary semantics from section 06.

For overlapping planar proxies, with camera ray r(t)=o(screenPoint)+t*d and plane
n·p=k, intersection is t=(k-n·o)/(n·d). Compare over vertices of the intersection of
their projected convex polygons; orthographic plane depth difference is affine,
so constant sign at those vertices establishes order everywhere in the overlap.
Smaller t is nearer when d points away from the camera. Ignore edge-on planes with
zero projected area; epsilon is geometry-scaled and shared, not item-specific.
Support/point versus terrain uses the same camera-ray convention. Contact ties
put a body above its own supporting face; stable IDs settle remaining true ties.

Opposite signs mean genuine interleaving of the chosen pieces: subdivide an overly
large terrain piece back to cell faces, or correct the named asset's declared parts.
Do not add runtime per-pixel depth or a generic screen-slicing framework. No cyclic
fixture can pass merely because the existing deterministic cycle fallback picks an
order. Record the conflicting IDs and fix their geometry/parts before accepting.
This proxy scheme must pass the first fixture before processing the complete map;
it is an explicit rendering approximation for billboard art, not exact 3D pixels.

### A batch is a consecutive run, not a spatial chunk

Sorter works on lightweight logical records; `display` becomes optional for packed
terrain records. Its final ordered records remain the single picking order.
After sorting, form maximal consecutive runs of terrain faces sharing atlas source,
blend mode and render state. Flush at every actor/art part/water record or state
change. Never reorder a face merely to reduce texture switches.

```text
for record in finalOrder:
    if record is terrain and compatibleWithCurrentRun(record):
        append its projected vertices, atlas UVs and triangle indices
    else:
        flushTerrainRun()
        if record is terrain: startTerrainRun(record)
        else: append existing Pixi display with next zIndex
flushTerrainRun()
```

Batch preservation law: flatten the ordered IDs of every emitted batch/display
and assert exact equality with the sorter's final ID sequence. Exercise alternating
terrain/actor/rail pieces, texture changes and index-limit splits in one
multi-assertion test. Batching never chooses or repairs spatial order.

Each run is an ordinary textured Pixi `Mesh`/`MeshGeometry`, not a new shader/depth
renderer; verify exact constructor syntax against installed Pixi 8.11 APIs.
See [maintained Pixi mesh guide](https://pixijs.com/8.x/guides/components/scene-objects/mesh).
Bound each run to 16,000 quads for 16-bit indices (64,000 vertices); splitting a run
preserves order. Preserve premultiplied alpha, nearest sampling, atlas padding,
canonical anchors and per-face UVs. Original art is baked once per variant, not
rebaked per frame, chunk or cut. Original actors/props remain ordinary sprites.

Cache immutable face geometry/UVs by chunk revision and art variant. Actor motion
may split/merge runs, rebuilding only affected run/index buffers; it doesn't rebake
textures. Camera pan/zoom changes the common transform; rotation/cut changes face
eligibility/order. Pool run meshes and buffers with explicit bounded capacity and
disposal; don't retain unbounded historic cuts. Index actual logical faces for
picking, never treat the mesh rectangle as an opaque blocker. Overlays retain their
existing separate purpose. Renderer owns no physical items or second simulation.

## R3 — Gas performance correction, inside the existing owner

Current `terrain_atmosphere.rs` represents sparse smoke/heat, not general gas
pressure or species. `advance` processes <=256 queued cells but clones the entire
`SmokeState`, then `validate_state` allocates queue/key sets and scans all stocks.
Contact cache is bounded but clears wholesale at its limit; invalidation scans
cached contacts. These are concrete unbounded-with-respect-to-processed-work costs.
Water uses Arc-backed pages but still clones queue/index metadata: do not claim
all its preparation is constant-cost either.

Instrument prepare/copy, contacts, transport, validation and encode separately at
256/1024/4096 stocks, holding processed cell count fixed. Preserve source emission,
escape/deposition ledgers, pause and paid-emission retry; don't simply delete checks.

If full copying/validation dominates, replace detached whole-state cloning with an
internal `PreparedSmokeAdvance`: touched-cell replacements/removals, number of
original queue entries consumed, append list, next clock and ledger deltas. Reads
check pending edits before base state, preserving current sequential transport
semantics. Append newly created cells once; a processed surviving cell requeues once.
Validate every touched amount, finite/range constraints, unique queue membership,
capacity and delta conservation before publication. Apply has no fallible domain
operation after its first mutation. Keep full relational/conservation validation
on restore/export and in focused law tests. Existing environment/DO transaction
remains the publication owner; no second store, chart or event bus.

Do not put every smoke cell to sleep just because concentration is locally steady:
heat loss, outdoor escape and source accumulation still evolve. Retain round-robin
fairness and timestamp debt. Measure backlog and propagation latency, not only the
256-cell budget. Consolidate one fixture covering emission, sealed-room spread,
opening a vent, construction/water invalidation, capacity retry, pause and
save/restart with ledger assertions; compare state/results against the prior
algorithm for seeded deterministic steps while changing storage mechanics only.

## Final handoff sequence and stop conditions

- R1: schemas + bounded observation across local/remote/performance, stale/reconnect
  and explicit unknown coverage fixture. No art changes needed.
- R2a: faces and ordering on the small cut/pit/cave/stair fixture. Lead reviews actual
  images and movement. Incorrect overlap is a correctness failure, not a tie to hide.
- R2b: consecutive-run meshes, cache lifecycle, matching picking, then full current
  Clearing and performance cameras. Record frame/query budgets and view completeness.
- R3: instrument gas alongside water; perform the specified delta-state correction
  only if measured, with conservation/durability proof. No general gas rewrite.
- Joined acceptance: retain all original packet gameplay/party/save requirements,
  current art and coherent authorized preview deployment receipts.

The lower-thinking implementer can follow these concrete modules/contracts without
choosing a new renderer or query architecture. Escalate an actual failing geometry
fixture, impossible coverage budget, or conflicting current source ownership with
exact evidence; don't improvise a fallback. This document is ready for implementation
and first-shape review, not a claim that the designs are already visually proven.

## September 16 R3 implementation receipt

The synthetic fixed-work witness processes 25,600 cell turns at 256, 1,024 and
4,096 active stocks. Before the correction, 100 whole-state clone/validation
passes cost 46,890 / 128,188 / 473,280 microseconds and total steps cost
1,092,622 / 1,067,992 / 1,011,325 microseconds in the first debug run. The
prepared-delta implementation reduced the corresponding total step measurements
to 526,767 / 578,334 / 466,988 microseconds. These are local debug diagnostics,
not release throughput claims; the retained ignored test reproduces the witness.

`PreparedSmokeAdvance` now owns touched amounts, queue consumption/appends, clock
and ledger deltas. It validates touched state and delta conservation before one
infallible publication into the existing environment transaction. Full relational
validation remains at save/restore. `run-u1826` passed all 419 kernel library tests
(one manual benchmark ignored). The full Cargo command's 14 standalone integration
fixtures still fail at their pre-existing stale `materialCatalog` schema boundary;
they do not execute atmosphere code and are not counted as R3 proof. `run-u1821`
reproduced that same failure on the untouched integration parent.
