# Rendering review and repair — September 22, 2026

Initial review: `337e1f03d226b9a173062cedf19c96638383988c`. Rendering-centered
engine soundness follow-up: `a5cf389d865188b04b52f2d45aff33321d1a2564`, owned
`living-terrain-integration` worktree. This is the current rendering audit/repair plan.
It supersedes conflicting rendering instructions in packets 14–17. Packet 18's
accepted whole-picture approximation remains binding. Historical proofs remain
evidence at their recorded source, not claims about today's hosted preview.

> **Active direction:** the “System review recut” below is the implementation
> direction. Earlier graph-retention recommendations in this report, including
> sequence B, are preserved historical evidence and are no longer an active queue.
> Original gameplay/hosted acceptance requirements remain binding. Component
> tests or a small rendered study do not authorize calling this repair delivered.

## Implementation checkpoint — ownership correction (not gameplay acceptance)

The isolated `world-view-repair-20260922` lane replaces `world-scene-owner` with
`world-view-owner`. It owns camera state, projection, inverse picking, retained
screen-layer transforms and adoption of rotation/cut requests. Input no longer
runs scene preparation; the Pixi frame consumes the latest requests. The client
keeps requested UI choices while interaction reads the displayed view. A single
view-publication notification refreshes UI eligibility and cancels/reset its
owned gestures, including a tool armed between request and publication. The
screen selection rectangle is separate from world designation overlays.

Focused startup/interaction proof now uses the real world-view owner with leaf
render/I/O services held at explicit barriers. Nine laws pass (`u3123`, invocation
`ab2fc014038947c6a6ccabcac992d52c`), including input coalescing, old-view picking
before adoption, new-view picking after adoption, armed placement plane reset,
HUD refresh exactly on publication, and late-resource disposal. This establishes
an ownership checkpoint only: full scene preparation still runs synchronously
inside the frame. Bounded staged terrain/order/display preparation, reusable
material residency, real DO interaction measurements and a reachable preview
remain required. Do not count this checkpoint as completion or smoothness proof.

### First working slice measurement and material integration

Root checkpoint `075af622` and integrated geometry `4cd7984a` built successfully
(`u3127`, `68c1503961e240da915f0ac525dd6613`). A short real DO browser run used
that frozen frontend at the previously authorized origin via Playwright route
fulfillment, **not a new public preview**. Eight workers moved, authoritative time
advanced, 178 terrain patches arrived, and return art was visually inspected.
There were no page errors. Evidence is `.botanical/world-view-first-proof/` in the
root repair lane; guarded receipt `u3131`, `b30cbc2c3406416ead63a3ce5d9baaa2`.

That run is negative performance evidence: captured main-thread long tasks
included 418 ms, 223 ms and 1,598 ms. The 64-wide view's first pan accumulated
about 466 ms of topology work and 315 ms of mesh application. ANGLE SwiftShader
limits hardware frame-rate inference. The input-delay probe captured no events
and must be fixed to capture before the keymap consumes them; it provides no
input-latency proof. Rapid rotation samples also preceded adoption, so this is
not a four-view completion or camera-return acceptance run. The frame still
prepares synchronously; proceed with bounded staged publication.

Material protocol checkpoint `e8bd1c3d` is integrated as `93ec0e9a`. The renderer
now derives faces from immutable material slabs and includes cut level in derived
body identity. Exterior cover records belong to exactly one vertical slab as well
as one horizontal region, preventing duplicate grass when taller worlds retain
multiple slabs. Twenty focused renderer laws pass (`u3139`,
`fe5faf145e114b4e9082ef6971588f2e`), including new local cuts without another read,
return to resident upper slabs, mowable cover overrides, and yielding on culled
faces. The data lane separately passed 83 focused laws and 31 immutability reruns;
independent review passed 64 slab/full-authority comparisons. This new protocol
has **not** been deployed; it requires a matching frontend and the separately
authorized test backend. Cold sampling cost and combined gameplay remain unproven.

## System review recut — replace the dense ordering model

The detailed execution packet is [packet 21](21-structural-renderer-implementation-packet-20260922.md). It owns the step-by-step replacement sequence and early go/no-go cases.

Levi's September 22 direction supersedes further incremental graph/scheduler tuning:
review the system and make substantial changes that remove unnecessary rendering
work. The staged world-view join is a recovery checkpoint, not an accepted solution.

### Evidence that changes the approach

The first joined hosted run used the actual separate performance DO, protocol 5,
eight unpaused workers, original Pixi art and a public Cloudflare tunnel. Its retained
report is `.botanical/world-view-joined-proof-1/REPORT.json` in the repair worktree;
guard `u3167`, invocation `dc7c3e8ccd2346b6854a32ad77947b30`, terminal exit 1.
Independent assets/runtime readiness was about 3.395 seconds from navigation;
visible terrain receipt was 4.794 seconds and padded receipt 5.091 seconds. There
were 48 material patches, about 766 KB of terrain transport, and no HTTP terrain
fan-out. Thus “five-second terrain” is navigation-relative, not five seconds after
readiness. Neither clock passes the complete gameplay contract by itself.

At about 47 seconds there were only 59 published actor/prop records and no useful
published ground. The pending order task had executed 576,601 operations through
576,603 advances. It remained pending around 77 seconds. Work/transport assertions
passed; loading, normalization, travel and cuts did not. Input evidence is insufficient
because failed normalization prevented the planned interaction workload. This is
negative acceptance evidence, not an input-latency improvement claim.

One-operation task accounting adds avoidable overhead, but changing its batch size
is not the architectural repair. Source review identifies unnecessary work itself:

- `terrain-picture-owner` ties reuse to the camera plan. On a changed plan it can
  re-expose a resident patch, reconstruct/project face geometry, then discard the
  new record in favor of the old record with the same ID.
- `terrain-visibility` emits known grid faces and upright grass as general ordering
  records. The compiler reconstructs projected geometry, discovers candidate
  overlaps, compares planes, and builds a global relation/topological graph.
- Grass cards share parallel upright planes, yet ambiguous/coplanar paths can
  expand opaque silhouette rectangles and compare their cross-product. Current
  grass frames contain up to 28 merged rectangles. This is a source cost risk,
  not proof that this particular branch dominates the failed run.
- Grass already carries four explicit support-cell facts. The general compiler
  does not consume that surface-root attachment; it rediscovers relationships
  through geometry/support-height checks instead.
- When exact whole-picture order is impossible, the compiler eventually chooses
  an approximation anyway. The accepted product does not require general image
  fragmentation or per-pixel geometric ordering of every sprite.

### Why the previous delivery loop failed

Packet 15 already prescribed `visibleCellsBackToFront`, authored footprints and
support-local parts, and explicitly prohibited restoring the pair graph. Packet 17
then introduced candidate discovery, geometric relations and topological ordering;
packet 18 integrated that compiler. The code matches the latter, not the former.
The architectural change was real, not a missing wrapper around the earlier plan.

The later repair concentrated on retention and bounded scheduling of that graph.
Small-scene correctness and component laws did not establish acceptable live-world
cost. Running the full game late allowed substantial work to accumulate around an
unqualified representation. This is an architecture/acceptance failure, not evidence
that Pixi, Durable Objects, WebSockets, missing user permission or unavailable
browser tools prevent delivery. The engineering owner must reject the next change
if it reconstructs the dense graph under a new module name.

The next checkpoint must be the replacement running in the actual game with
before/after work counts and loading/input evidence. A passing isolated fixture,
renamed owner or another planning document is not that checkpoint. Local insertion
must use finite grid/footprint bounds arithmetic into the fixed sequence; it must
not call the old plane/alpha comparator or rebuild a smaller recursive graph.

### Replacement architecture

Keep one world-view owner, client camera, original atlas pixels, Pixi, exact resident
material slabs, authoritative DO, WebSocket transport, staged coherent publication,
and alpha silhouettes for picking. Replace the dense scene representation/order
algorithm beneath that owner. No alternate renderer or game-specific rule branch.

1. **Retained terrain pictures independent of camera position.** Own chunk-local
   packed quads and compact cell/face identities, derived from material revision,
   cut and camera quadrant. Pan/zoom change transforms and visible membership;
   they do not regenerate the same faces. Extract only relevant exposed faces;
   use material-run boundaries rather than repeatedly testing six neighbors of
   buried solid voxels. Retain known air/unknown/halo laws and caves; this is not
   an authoritative heightmap conversion.
2. **Structural terrain/cover order.** Camera-oriented grid traversal orders
   opaque voxel cells without terrain-to-terrain overlap discovery. Upright grass
   uses a stable authored dual-grid footprint/anchor as its preferred slot, with
   actual occupied supports imposing local after-constraints and nearby cliffs
   imposing before-constraints. A grass patch's root-center key alone is not enough:
   it can paint before its foreground supporting tile and disappear into the ground.
   Mowing changes the affected dual-grid masks (at most four roots per changed
   surface cell), not the world graph. Original upright art remains intact.
3. **Sparse sprite placement into that retained order.** Actors and authored props
   use footprint/volume/support metadata and nearby conservative bounds to find
   insertion positions. Keep mandatory support precedence and existing baked part
   boundaries. Contradictory whole-picture relationships use a documented stable
   approximation. Large beds/stairs are not made exact by a universal foot-Y sort;
   no content-name special cases or reconstructed opaque-pixel geometry are allowed.

The terrain sweep is justified by monotone ray traversal through disjoint grid
cells for a fixed orthographic quadrant. That does not prove one scalar orders
all tall cards against cliffs or every furniture picture. Those mixed cases are
explicit obligations of the local insertion rule, not a reason to rebuild a
whole-world graph. A global “ground first, actors last” pass is also insufficient.

Remove dense uses of projected face proxies, silhouette rectangle refinement,
terrain candidate bins/edges and combined topology/cycle recovery. Keep silhouettes
for clicking and the small spatial lookup needed by moving sprites. Do not place
a forwarding wrapper around the existing compiler and call this replacement done.

### Alternative considered: depth testing inside Pixi

A GPU depth path could also remove the dense graph without replacing Pixi or the
baked colors. It is not a drop-in use of the current ordering planes. Current grass
RGBA combines a flat dual-grid base and upright blades into one image, while its
ordering proxy is one upright plane. The current compiler explicitly forces
supporting ground before the supported picture. Numerically depth-testing that
plane can clip the part of the baked base behind its own support; a tiny depth bias
does not repair this representation mismatch. Interacting ordinary Pixi sprites,
water, shadows/partial alpha and picking would also need one matching depth policy.

Choose structural terrain plus sparse authored-support insertion for this repair.
It preserves the accepted picture semantics and removes the dominant dense graph
without introducing a second depth representation or rebaking accepted art. Keep
the mixed grass/cliff and furniture acceptance cases mandatory; if local constraints
cannot handle those pictures, report the concrete counterexample instead of adding
named exceptions or quietly rebuilding the old general graph.

### Delivery blocks and decision gates

First replace dense terrain/grass preparation and order in the actual colony path,
using the current original atlas and unchanged authority. Review flat grass,
cliffs, multiple elevations, cut caps/cavities, chunk seams and all four quadrants.
Include mowing and pan-out/return. A local retained-chunk change must not reconstruct
unaffected chunks or perform terrain-pair/alpha-rectangle comparisons.

Then join actors and existing multipart furniture through the sparse insertion
owner, including behind/in-front, supported actors, beds and stairs. Preserve the
accepted whole-picture approximation; publish picking, pictures and displayed cut
together. Read the first resulting caller before expanding the mechanism.

Finally run the original paired 64/256 hosted workload: working actors, continuous
input during arrival, cuts, cold travel/return, loading gates, separate CPU/input/
render/loading/resource measurements and public preview. The first failed run is
retained and must not be replaced with a paused screenshot or relaxed threshold.
No dramatic speedup is claimed until those measurements establish it.

## Soundness verdict

**Keep the physical engine, original art pipeline, WebSockets and Pixi. Do not
accept the current rendering preparation and cut-residency implementation as the
foundation for more gameplay.** Its main defects are structural, not unexplained
slowness or an unavoidable price of isometric art. This audit examines rendering
and its engine inputs; it is not fresh qualification of every simulation system.

This follow-up challenges two assumptions in the initial repair plan: retaining
the existing generic geometry is not enough, and cut-baked face patches cannot
derive first-time cuts locally when buried occupancy/material is absent. The
corrections below supersede those earlier implementation constraints.

### Findings in priority order

| Finding | Source/evidence | Judgment |
| --- | --- | --- |
| Ordinary pictures are represented as unnecessarily general geometry | `asset-draw-geometry.js:60` lifts a cached 2D silhouette through rays into a 3D plane; `spatial-draw-order.js:90` projects/hulls it back into 2D; `plane-order.js:80` clips polygons and samples ray depth. | Replace the common preparation representation with direct face/card/bounds primitives. Preserve the pixels and established comparison semantics. |
| Local movement expands into scene-wide work | `spatial-draw-order.js:509` merges statics, copies relations and reconstructs topology for changed dynamics. A recorded nine-dynamic update touches a 6,786-record/45,709-edge scene. Static updates can sort twice. | Replace whole-scene update policy with retained local relations and change-driven publication. A sparse relationship owner can remain; the full rebuild cannot be the routine frame path. |
| A new cut throws away resident terrain | `terrain-region-cache.js:140` cancels and drops all regions when level changes. `terrain-presentation.ts:188` keys products by cut; `terrain-region-exposure.js:61` synthesizes caps for that cut only. | Replace the cut-baked residency contract. Existing face payload lacks buried material/occupancy, so new caps cannot be computed locally from it. More per-cut caching only improves revisits. |
| Input directly invokes expensive scene work | `client.js:791,804,1493` pan/zoom/key actions call `draw()`; ticker, pointer tools and terrain coverage call it too. `cut-terrain-layer.position()` mixes transforms with demand and preparation. | One scheduled presentation owner with bounded preparation. Input must not synchronously run the full scene pipeline. RAF coalescing alone does not make a long task short. |
| Viewport bounds do not govern all visual work | `actor-presentation-owner.js:25` processes every supplied subject; `cut-terrain-layer.js:203` revisits observed water without viewport filtering. Art binding `kind:static` also classifies moving ships/cannonballs as static ordering records (`subject-draw-records.js:124`). | Separate art family, visual residency and changed geometry. Cull by conservative visual bounds/support closure without pausing offscreen simulation. |
| Error-path scene atomicity is incomplete | `world-scene-owner.js:31` mutates/destroys actor displays before ordering validates contacts/geometry. Retaining the previous graph does not retain the previous display state. | Stage display/hit changes too. This is a source-level error-path concern, not a reproduced explanation for ordinary terrain artifacts. |

Client paths are under `engine/src/client/`; presentation/exposure runtime paths
are under `engine/src/runtime/`. Line references are at the follow-up source pin.

### The common geometry is much simpler than the preparer assumes

Recorded v6 scene composition:

| View | Terrain faces | Grass cards | Tree/prop cards | Actor cards | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Initial | 4,062 | 2,665 | 50 | 9 | 6,786 |
| Zoomed | 9,768 | 6,949 | 50 | 9 | 16,776 |

Every record in these two snapshots is planar; neither slow view needs furniture
volumes. Zoomed cards nevertheless carry 130,166 coverage rectangles. The 2,724
initial upright cards lie on 102 intended root-depth planes, but reconstructing
their normals produces 1,727 distinct floating-point triples. Exact-normal
equality consequently misses many semantically coplanar cases. These counts come
from saved scene records, not a new performance benchmark or proof of a visible bug.

For upright cards, all planes are parallel by construction. At a common screen
point their depth difference is constant, so general ray-depth sampling cannot
add ordering information. Use an immutable shared ink/silhouette reference,
screen placement and canonical root-depth coefficient directly. Terrain/water
use axis-aligned faces; furniture/stair parts use checked visual bounds/declared
pieces and contacts. These are geometry categories, not content-name branches.

Overlap discovery and coplanar alpha ties still matter. Do not add edges between
disjoint pictures just because their depths differ; false edges can create false
cycles. Cards versus banks and extended furniture still need local relationships.
Do not replace the entire scene with a feet-depth scalar or frozen static list.
Keep a general relation only for actual unsupported-by-fast-rule geometry, not
as a compatibility path for the retired common representation.

### What is already sound and should survive

- `SessionResident` reuses the committed Session/native kernel. Ordinary ticks do
  not rebuild the whole world. Physical terrain revision is separate from actor
  and water updates; retained surface references are real.
- The DO owns shared physical state. Per-client stream state is delivery/cancel/
  credit bookkeeping. Complete patches, reconnect and bounded credits are useful
  mechanisms. Nothing here requires another transport or browser simulation.
- Checked bake assets provide anchors, silhouettes and visual bounds separately
  from physical occupancy. Original upright grass is compatible with the repair.
- Pixi batching already preserves consecutive painter order and shares atlases.
  Initial 6,727 terrain/cover quads use 38 meshes and 511,252 buffer bytes; zoomed
  16,717 quads use 54 meshes and 1,270,492 bytes. Grass is not one object per blade.
- Selection uses published visual order. Placement deliberately asks a different
  support-surface question and may skip actors/trees; keep that explicit policy.

These facts do not prove GPU headroom. Four 2048² static pages plus ground and
terrain atlases total about 68.48 MiB RGBA8 equivalent if uploaded. That is not
measured GPU residency and excludes other copies/framebuffers. Normal alpha
blending/overdraw and upload costs still need target-hardware measurement. The
recorded ~135 MiB whole-page post-GC heap is not exclusively rendering memory.

### Required replacement boundary

The existing client scene owner must own bounded resident terrain facts, prepared
visual primitives, local ordering dependencies, staged jobs and published
draw/pick identity behind useful operations. Its callers submit observations,
view choices and input; they do not coordinate cache resets, geometry maps or
completion flags. Pixi retains GPU resources and consumes the published plan.

**A cut inside complete resident spatial and vertical coverage, including its
required halo, must be derived without another server request.** Raising a cut
can reveal additional horizontal regions, which may still need a request. Store
bounded authoritative occupancy/material coverage, neighbor halo,
exterior support and current cover. The wire encoding may use slabs or column
runs, but its known coverage must be explicit. Request missing slices outside
residency; preserve caves/overhangs and unknown-versus-air. Cancel obsolete prepared
view jobs without discarding reusable valid facts. Exposure/cap preparation
is client presentation over those facts, preserving the existing physical laws.
Migrate the actual DO/Worker readers and consumers together; retire the cut-baked
wire path rather than maintain two production truth sources.

First implementation review must show direct common primitives, retained local
changes, and responsive staged publication, followed by the reusable cut-data
contract. Native column sampling and fixed-window observation removal support
that contract; they must not become isolated optimizations of the retired shape.

Other confirmed costs include per-pick copy/reverse of the complete draw list,
whole-run batching signatures, repeated host Session-header validation, and full
actor render serialization before the JavaScript limit. Their source is real;
the current evidence does not rank them above the measured preparation costs.
Keyboard camera currently advances in discrete 24-pixel command steps. Smooth
frame-time movement is also an interaction behavior to implement; CPU fixes alone
do not supply it. None of these findings authorizes an unrelated game/AI rewrite.

## Decision

Keep Three authoring → checked low-resolution art → client scene owner → Pixi.
Keep native world authority and region delivery over WebSockets. The camera
requests world-space regions; the client prepares presentation. The DO retains a
shared physical world and disposable per-connection delivery state, never a
separate simulation or draw order for each camera.

The demonstrated problems are repeated computation and serialized startup.
Small camera pans already reuse prepared coverage and change the parent transform.
Preserve that path. Receiving a small patch or moving one actor still causes too
much whole-scene work. Fix the common preparation representation, change
granularity and cut-data contract at their existing owners.

Levi accepts roughly correct whole pictures where images genuinely interleave.
Do not restart universal exact splitting, baked per-pixel depth, a Three runtime,
or bed-specific rules. Preserve full upright grass and its supported short
variant. Packet 17/early packet 18 descriptions of flattened/clipped grass are
historical; they do not authorize clipping the restored blades.

## Actual end-to-end ownership

### September 22 priority correction: responsive live camera and cuts

Levi reports that camera movement remains unusably slow and cut behavior cannot
be assessed through the stalls. Startup improvement is not playable acceptance.
The next repair owns the complete interaction/frame path, before further native
sampling or initial-observation optimization.

At `5de88220`, pan/zoom synchronously invoke the full `draw()`; terrain `position()`
mixes parent transforms with demand and potentially large record preparation.
Recorded 104 ms preparation plus 22/34 ms topology steps establish a blocking-work
problem. Moving unchanged work into RAF would still block input.

One client scene-preparation owner must:

- Apply camera state/parent transforms without invoking full scene preparation
  from input handlers. Coalesce input, ticker and received-patch invalidations.
- Retain local geometry/relations as checkpoint B specifies. Give unavoidable
  preparation, topology and buffer work explicit per-turn budgets. Work that
  cannot yield at that budget must run in a client presentation worker. A worker
  owns disposable presentation only, never simulation or camera-dependent DO state.
- Stage bounded complete patches/cut snapshots, cancel obsolete view jobs, and
  prevent ongoing actor animation from starving a pending terrain rebuild.
- Keep the last coherent scene responsive until replacement publication. Commit
  displays, order, picking and presented cut together. Requested cut and displayed
  cut are distinct while pending; commands cannot silently use a different layer
  from the one shown. Pending terrain remains unknown.
- Prove input-to-painted movement, worst main-thread stalls and requested-cut-to-
  displayed-cut latency with working actors, arriving regions, continuous input
  and repeated cut supersession. Zero work in a paused small pan is insufficient.
  Separate received, prepared, submitted and painted coverage.

Target smooth 60 Hz camera motion on a hardware browser at normal viewport/zoom;
record actual frame/input latency and machine. Shared-host software rendering can
prove work bounds and correctness, not that hardware target. If rendering itself
dominates after preparation is bounded, measure draw/upload/fill costs before
accepting the repair. No startup-only milestone completes this interaction work.

| Stage | Existing owner | Finding |
| --- | --- | --- |
| Physical facts | `engine/kernel/src/terrain.rs`, `generation.rs`, committed Region/SessionResident | One physical authority; cold per-cell sampling repeats column generation. |
| World-space presentation | `runtime/terrain-presentation.ts`, `terrain-region-exposure.js` | Camera-independent exposed faces/support; buried reads preserve caves; any terrain revision clears all region cache entries. |
| Delivery | `runtime/terrain-region-stream.ts`, `terrain-region-client.ts`, `remote-client.ts`, `tools/public-engine-host/worker.ts` | Complete socket patches with cancellation and bounded credits already work. |
| Residency/demand | `client/terrain-region-cache.js`, `camera-coverage-owner.js`, `terrain-visibility.js` | Bounded cache and padded viewport; conservative full-height prisms over-request some regions; small-pan retention works. |
| Art | `scripts/export-static-art.mjs`, `src/art/static-pack.js`, `living-terrain-pack.js` | Checked anchors/bounds/silhouettes/parts. The initial serial-loading defect was fixed in `5de88220`; it does not solve preparation/cut costs. |
| Scene | `client/world-scene-owner.js`, `cut-terrain-layer.js`, `actor-presentation-owner.js` | One lifecycle; patch publication still walks resident terrain; actor preparation covers all supplied subjects. |
| Ordering/picking | `client/spatial-scene-owner.js`, `spatial-draw-order.js`, `voxel-draw-picking.js` | Local candidate comparisons; changed actors still merge statics, copy edges and sort the combined graph. |
| Pixi submission | `client/terrain-face-batches.js` | Correct consecutive-only batching; planning/signatures/uploads can revisit unchanged runs. |

Runtime/client paths above are relative to `engine/src/`; sibling filenames share
the preceding directory. Follow real callers. These are existing responsibilities,
not a proposed layer of forwarding wrappers.

Colony Performance also observes a fixed 4,096-column terrain window before camera
delivery. The initial v6 observation is about 512 KB; regions repeat support facts.
Level range, placement, structure picking and cover consume those observations.
Removal requires migrating those consumers together, not dropping a field.

## Evidence and limits

Authoritative v6 artifact: `.botanical/terrain-loading-v6-composited/REPORT.json`;
context: [loading proof](../../../tools/public-engine-host/TERRAIN-LOADING-BROWSER-PROOF.md).
The stationary case still fails:

| Measure | Recorded result |
| --- | --- |
| Useful ground | Driver observes 5.092 s from navigation; page sample 5.040 s |
| Exact visible completion | Page clock 8.576 s; driver observes complete samples at 8.658 s |
| Useful/visible after assets and runtime ready | 1.045 s / 4.581 s; existing targets 1 s / 3 s |
| Padding complete | Page clock 11.272 s; 7.276 s after readiness |
| Delivery | 102 patches; 2,158,727 bytes; first patch 202.5 ms after request; zero HTTP terrain requests |
| Accumulated scene compilation / applying order | 3,340.9 ms / 407.1 ms; 33 topology builds |

Compilation overlaps loading; do not add these totals to elapsed time. Earlier
proof prose's 1.097 s useful latency mixed driver/page clocks. The report's
same-clock value is 1.045 s, still failing. Both observations remain evidence.

In `.botanical/camera-terrain-v6-far/REPORT.json`, one nine-dynamic update needs
93 face comparisons / 0.7 ms candidate work, followed by 6.3 ms preparation and
7.3 ms topology across 6,786 records. A zoomed publication adds seven statics to
16,767 but spends 104.2 ms preparing, 22.2 ms sorting statics and another 33.6 ms
sorting the combined scene. These are individual samples, not percentiles/FPS.

The exact 102-region native benchmark reads 508,313 material cells and 10,200
surface columns for 16,809 faces. Cold total is about 1.46 s, with 1.05–1.07 s in
native queries. `generator.sample()` recomputes bed level at each Y;
`sample_brick()` already demonstrates column reuse. The isolated `bf8de50f`
batch768 experiment reduces crossings 2,035 → 714 but paired runs do not improve
total time. Do not integrate it as a performance fix.

V6 camera artifacts prove small-pan zero-work counters, terrain beyond the old
64×64 window, cuts, minimum zoom, bounded residency and identical paused return
images. Earlier headless-shell measurements had disabled compositing and severe
browser readback cost. Use full Chromium and record enabled compositing; the
available renderer remains software. Hardware smoothness/population capacity is
unproven. Old v5 signature costs are partly fixed by `dd6d6e29`, not untouched bugs.

No current Fallow report for these rendering files was available; `fallow` is not
on PATH. Old whole-game reports do not establish a clean current audit. Startup
in `client.js` and the ordering compiler remain source-review hotspots.

## Laws owned by the implementation

1. Camera, interpolation, cache misses and painting never advance simulation,
   grant support, create stock or activate work. Visual bounds are not collision.
2. Stable subject/part identity survives redraw. Resident terrain facts are
   complete for declared spatial coverage, epoch and revision; a prepared view
   additionally identifies its cut. Empty differs from unknown. Late responses
   cannot publish into a newer view; cancellation cannot acknowledge unfinished data.
3. Anchors, physical facing, camera quarter-turn, projection, support and picking
   share coordinates. Rotation preserves world focus, selection and physical time.
4. Preserve established geometric comparison semantics and mandatory support
   precedence; acyclic relations remain satisfied. Whole-picture overlap/cycle
   recovery is explicit approximation and may leave visual constraints unsatisfied.
   Invalid contacts and support cycles remain errors; keep approximation diagnostics.
5. One published order and current hit geometry serve painting and picking.
   Texture-only refresh does not imply resorting. A batch crosses no intervening
   piece that must paint between its members.
6. Four-cell dual-grid cover uses same-level facts/halo. Full/short grass remains
   data over one mechanism with upright pixels. Gameplay mowing must change
   native cover through work; a short-art fixture does not prove mowing exists.
7. Reset/reconnect/eviction rebuild disposable presentation from committed facts.
   Cleanup owns resources; no old scene references survive disposal.
8. Identical facts, projection and final resident set give identical order/pixels/
   picks after different arrival orders, full versus incremental rebuild and
   pan-away/return. Partial culling preserves needed occluder/support dependencies.
   Arbitrary cyclic art remains approximate; universal membership-independent
   exact visibility is not promised.

## Bounded implementation sequence

### A. Overlap independent startup work

One writer owns `client.js` startup and a narrow art lifetime operation if needed.
Load terrain/static packs concurrently. Once Pixi can safely host the scene,
subscribe before starting runtime; feed early facts into existing interpolation/
terrain owners and request camera regions while art loads. Install sprites only
after checked art is available. Keep assets ready, runtime ready and coverage
separate; interactive UI readiness may require both assets and runtime.

Own atomic pack handoff, failure and late completion in one operation. Successful
or late packs are disposed exactly once after failure/cancellation. Test early
cues, disposal during Pixi initialization and subscription cleanup. No second
observation cache or pause/resume trick to conceal startup.

Acceptance: independent delayed loaders overlap; either can fail; disposal before
and after initialization cannot leak or install into a dead scene. A real DO
browser shows a region request before art completion and records navigation-to-
ground. This removes a dependency; it alone does not promise latency gates pass.

### B. Historical, superseded: retain relations and publish terrain changes once

One coupled writer owns spatial scene/compiler and its terrain record join.
Preserve current relation semantics, extending the existing owner. The follow-up
soundness audit additionally requires direct common geometry primitives; do not
retain the silhouette→3D hull→2D hull round trip as the normal path.

First checkpoint: retain each dynamic piece and its incident relations. Recompute
only changed pieces' local candidates; remove old incident edges and update pairs
of changed dynamics once. Stage validation before commit. If identities, edge
sets and support precedence remain unchanged in an acyclic graph, refresh current
display/hit records without merging all statics or sorting topology. Geometry
changes need not change order. For approximate cycles, initially rerun the current
algorithm: moving center depths affect recovery even with identical edges.

On real edge changes, a full combined topology build is an acceptable first
checkpoint only within the stated per-turn budget, or outside the input thread
with versioned publication. A synchronous 33 ms sort is not responsive acceptance.
Measure its frequency before adding local topology repair. Do not
freeze static total order and merely insert actors: independent statics can sort
`[a,b]`, while a new actor legally requires `b → actor → a`. No cycle is needed.
Current-source proof: guard `u3078`, invocation
`a3b9639980814c32a8dbf4bc5a86d01f`, exit 0.

Second checkpoint: `cut-terrain-layer` supplies added/removed/changed record
identities to that same owner. Retain unaffected proxies, spatial index and
adjacency. RAF coalescing already exists and does not bound the work in a callback.
Keep queued patch bytes within the residency budget; admit a bounded number of
records/preparation operations per turn, staging a large patch across turns if
needed. Publish only complete prepared patches, with visible-first progress.
Cancel staged obsolete work on epoch/cut/revision changes. Socket credit means
receipt into bounded cache, not completed rendering: report received coverage
and rendered coverage separately. Perform one
combined topology build when necessary; remove redundant static-only topology
from the production combined path. Keep the full compiler as a reference/query
consumer of the same relation rules, not another production policy.

The scene operation accepts facts/deltas and returns an ordered borrowed view,
changed display records and an apply-order decision. Callers never manipulate
internal maps/edges/reset flags. Rejected updates leave the last valid paint/pick
view intact. This includes display/hit changes: actor preparation currently
mutates shared Pixi objects before ordering validation, so staging only graph
maps is insufficient. Validate/stage the changed display state before committing
the published scene, and dispose rejected staging resources. Reset owns all
derived state.

Acceptance: crossing an occluder changes order; relation-preserving movement does
zero topology work; stationary pieces are not re-prepared; the bridging-static
case works; cycle policy is preserved; rejected deltas are atomic; terrain
publication sorts at most once. Require full-rebuild parity plus independent
original-art fixtures and real bed/bank/stair traversal. Parity alone is no oracle.

### C. Generate each column profile once per bounded read

One writer owns native sampling, WASM/KernelPort binding and the current
`TerrainPresentationOwner` consumer. Add a bounded spatial sample operation that
reuses generation per column and overlays edits through canonical terrain. The
follow-up soundness audit supersedes preserving cut-baked exposure as the resident
wire representation: expose bounded reusable material/occupancy coverage and
prepare view cuts in the client. Keep world authority/exposure laws intact. No
camera, artwork, whole-world generation or heightfield-only shortcut enters native
sampling; caves and overhangs remain supported.

Compare region/column sampling with existing page sampling on the same 102 keys.
Whole 16³ pages can overgenerate around 8×8 regions/halos. Require exact material/
face hashes, measured paired cold-total improvement and bounded temporary storage/
per-read work. Batch-constant changes alone already failed.

Localize producer invalidation from canonical changed-column history: invalidate
affected cores/halos and retain unrelated content. Reset/epoch/history loss clears
everything. Preserve response identity when serving unchanged content at a new
revision. Warm cache performs zero sampling; two clients share world facts with
independent delivery handles. Include signed/clipped boundaries, cuts and edits.

### D. Retire fixed-window startup projection through actual consumers

After A/B qualification, one writer owns observation schema/producer and all
consumers of initial terrain surfaces. Initial observations carry small demand
inputs: identity, bounds, materials, actors and required structure facts. Regional
delivery owns resident terrain support/cover. Move level range, picker and
placement together, explicitly distinguishing structure surfaces from terrain.

Version/reject unsupported formats as required; no legacy or parallel fast API.
Prove empty-world and occupied-world focus, DO/Worker parity and current-format
recovery. This changes read projection, not durable physical transaction ownership.

### E. Only measured residual cost justifies more changes

Bound actor presentation by viewport plus authored overhang and support/attachment
closure. Keep a maintained candidate index rather than scanning all world actors
every frame. This does not drop authoritative observations or pause offscreen work.

If run planning/uploads remain costly after B, retain unchanged consecutive runs
and rebuild affected runs. Regions cannot be flattened when actors interleave
with their banks/grass. Keep the painter small.

If full-height demand remains costly after C/D, expose inexpensive conservative
native bounds. Unknown bounds retain conservative demand; metadata cannot secretly
scan all fine cells. Map LOD is separate future work.

Startup and native sampling may be separate isolated lanes. Graph/delta and
schema/consumer changes each need one writer; integration/proof/release remain
serial. Review each first working shape before expanding it.

## Invalidation contract

| Change | Owned work | Reuse |
| --- | --- | --- |
| Pan inside margin | Parent transform | Facts, geometry, relations, order, buffers |
| Coverage crossing | Missing requests/cancellation and membership | Unchanged regions and local relations |
| Actor movement | Pose/hit geometry, incident candidates/edges | Unaffected static proxies/index/edges |
| Animation texture | Display/alpha-hit refresh | Order unless declared geometry changes |
| Terrain/cover edit | Changed columns, halo, cover/order dependencies | Unaffected regions/records |
| Quarter-turn | Client projection/view-art/order/demand | Physical state and reusable world-space patches |
| Cut change | Local cap/faces/order preparation; request missing vertical coverage only | Physical state and resident material/occupancy/support facts |
| Reset/load/epoch | Cancel reads, rebuild derived state | Checked immutable art |
| Dispose | Unsubscribe/cancel/release owned resources | No per-scene references |

## Actual reference source

Preserved OpenRCT2/OpenTTD clones were read at the immutable commits below. They
are mechanism comparisons, not dependencies or equivalent-workload benchmarks.

- [OpenRCT2 bounds sorting](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2/paint/Paint.cpp#L338-L374)
  uses [neighboring quadrants](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2/paint/Paint.cpp#L398-L424)
  to narrow comparisons; [its viewport warning](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2/interface/Viewport.cpp#L933-L962)
  explains sorting glitches from culling membership. Borrow bounded candidates
  and stable reconstruction, not a universal exact-geometry claim.
- [OpenTTD combined sprites](https://github.com/OpenTTD/OpenTTD/blob/c56e08d5c35a137cda2e063b05fbf7895d3cf554/src/viewport.cpp#L747-L778)
  prohibit internal interleaving. [Its sorter](https://github.com/OpenTTD/OpenTTD/blob/c56e08d5c35a137cda2e063b05fbf7895d3cf554/src/viewport.cpp#L1598-L1679)
  exploits near-order/spatial bounds with known ambiguous cases. Group inseparable
  attachments, not a bed plus occupant or all terrain/grass for convenience.
- [OpenRCT2 GPU depth](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/data/shaders/drawrect.vert#L37-L65)
  comes from [draw-command order](https://github.com/OpenRCT2/OpenRCT2/blob/252987e921fa07587f8192d3a72ac17719938c20/src/openrct2-ui/drawing/engines/opengl/OpenGLDrawingEngine.cpp#L970-L995),
  not recovered per-pixel source-model depth.
- [Minecraft Java networking](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-2#network-optimizations)
  uses bounded chunk batches within client render distance, permitting play during
  loading. Borrow relevant incremental delivery. [Cloudflare's WebSocket path](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
  already supports our browser/DO use; transport replacement is not this repair.

Botanical's actual Watchdog (`packages/watchdog/src/index.ts` and
`internal/sqlite-store.ts` in Botanical-next) owns durable queued obligations and
transaction participation. Disposable camera/terrain reads are different. Preserve
Hive's committed resident read boundary; do not create a durable camera-job queue.

## Acceptance and stop rules

Use tests beside touched source: spatial scene/order, terrain cache/exposure,
camera coverage, batcher and remote/Worker wire laws. Guard automated proofs with
the prescribed 10-minute wrapper; retain failures. No dependency installation or
unrelated full-home traces.

Each checkpoint records source/build/backend identity and actual DO browser
navigation: assets ready, runtime ready, first request/patch, useful ground, exact
visible completion, padding. Retain 1 s/3 s readiness gates and navigation timing.
Never move readiness later or substitute a prewarmed socket test. Overlapping
startup may honestly expose greater post-ready latency while navigation improves.

Record preparation, changed candidates/relations, topology counts, apply time,
upload bytes, draw/mesh counts and heap/GPU residency separately. Preserve small-
pan zero-work checks. Exercise moving actors around original beds/banks/stairs;
unfinished/completed construction; four turns; cuts; full/short grass; matching
picking; rapid cold pan/cut supersession; eviction/return; reconnect/duplicate/
conflicting patches, slow receiver and cancellation. Two different client views
share physical facts and isolate delivery state.

Qualify 64/256 worlds with identical viewport/zoom and comparable content. Visible
work must not scale with total map area. Use 8 then 100 actually working actors;
separate server tick/path/state from client rendering. Idle actors do not prove
population capacity. 512/maximum-height stress follows the bounded viewport law;
caves/vertical edits remain included. Hardware smoothness still needs an actual
hardware run, separate from software-rendered correctness evidence.

Keep explicit existing caps: 256 requested/client-cached regions; 32 MiB client
serialized payload; 128 server patches / 4 MiB server payload; 512 KiB event;
eight outstanding patches; current mesh/spare caps. These are not total memory or
frame-time guarantees. Measure repeated travel/disposal and supported zoom/height;
report budget-limited coverage as such, not complete.

Accept A–D with their laws and relevant measured improvements. If B meets targets,
stop before speculative topology/buffer redesign. If C does not improve cold
production, do not ship it as a performance fix. Art changes, transport rewrites
and new frameworks do not replace passing the user-visible checks.

## Delivery status

The review/plan is source-grounded; the full camera/cut repair is not shipped.
Startup overlap is integrated as `5de88220` (lane `fe1fa714`): 15 lifecycle laws
and the build pass. A selected suite is 64/65; the sole tree-binding expectation
failure was independently reproduced on the unchanged baseline. Real-DO browser
evidence is recorded in the loading proof. One matched pair shows useful ground
7.754 → 5.798 s, but visible completion 9.817 → 10.029 s; both fail loading gates.
This is a removed startup dependency, not an interaction/performance completion.
Frontend files were locally served at the authorized origin; backend traffic was
real. No updated public preview was published; the old temporary tunnel expired.

Two independent source reviewers checked the plan. Their corrections are included:
the actual receiver path, explicit preparation/queue budgets, atomic display/hit
publication, the cycle approximation law and the stale README alpha instruction.
