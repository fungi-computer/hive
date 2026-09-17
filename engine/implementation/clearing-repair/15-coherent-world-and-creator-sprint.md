# One world, ordinary actors, dependable drawing

September 17, 2026. Design and implementation handoff, not delivered capability.
Source originally inspected at `46641200`; renderer and packet corrections were
rechecked in `engine/living-terrain-integration-20260917` through `4da4587e`.

## Authoritative delivery order — finish Clearing through reusable Vishnu owners

Planning only. This replaces the withdrawn creator/shoe delivery queue. Character
customization, shoes, trades and ramen shops are architecture examples, not current
sprint priorities. Technical sections below supply contracts, not another queue.
Vishnu is the intended engine name; Hive remains the current repository name.

1. **Restore trustworthy drawing and interaction.** Qualify and integrate the
   Three bake -> ordinary pixel art -> voxel-ordered Pixi path. Resolve terrain cuts,
   whole actors, stairs/rails, long furniture, grass, water, picking and build
   guides together. Retain chunks/resources and measure active frames. No live
   Three gameplay, graph-sort fallback or visual-only workaround to physical
   facts. Deliver an independently playable matched preview first.
2. **Finish unified building and surface semantics.** Preserve the implemented
   Buildable compiler and native whole-footprint checks. Close actual selected-
   level placement, support removal/replacement, stair access and room editing.
   Separate support, attachment, obstruction and visual cover. Rug/platform/grass
   exercise reusable rules; no mandatory wardrobe, growth system or new shop.
   Required authored operations/queries and real UI callers move together.
3. **Close the core work/material loop and measure its cost.** The section 07
   checkpoint records an installed native shared planner; do not restart that
   migration. Trace digging, hauling, stockpiling, resource stages and brewing
   through it. Resolve reported unnecessary delivery trips, stale carried-item
   presentation, cancellation/continuation and waiting reasons against actual
   native facts. Include whole-clearing water/gas costs and the same productive
   32/100-worker workload in playable and performance pages. Fix measured owners,
   not a speculative second scheduler. Narrow bridge reads before exporting rows.
4. **Verify world continuity and regional boundaries.** Reuse the existing Region
   transaction, lifecycle/access and multiplayer observation owners. Prove restart,
   reconnect, retained people, shared access and finite resources together. Review
   current residency/streaming and additional-DO plans explicitly: view coverage,
   observed data and active simulation are different. A second DO does not repair
   rendering or automatically permit cross-region actor/item/fluid transfers.
   Name missing durable handoff contracts and implement only the bounded expansion
   required by the active world plan; do not silently drop that plan or expand the
   small playable clearing merely to exercise infrastructure. This contract review
   occurs before any changed loading seam, even though final acceptance is here.
5. **Close the existing creator-tool join.** Throughout 1–4, use the accepted
   actor/capability and with/where/do APIs at touched seams. Then prove one actual
   MCP-authored variation of an existing object through the shared bake/pack owner
   into ordinary construction/use/save. Reuse the current workshop and art studies.
   This is the engine-reuse witness, not a new character editor or marketplace.

Acceptance throughout: one native fact/mutation owner; no rendering gameplay;
scoped human/AI commands; typed failure reasons; bounded query/update work; current-
format durable recovery; complete physical footprints; game/asset/engine ownership.
Use one joined scene with multiple assertions plus focused owner regressions.
Release coherent playable interims; final acceptance includes two participants,
real active performance and the creator witness. Do not withhold drawing repair
until every later concern is complete.

Priority rationale: wrong visibility prevents meaningful playtesting; placement
must be reliable before trusting construction/work; productive work reveals real
simulation budgets; continuity must preserve that gameplay; creator tools prove
reuse of the repaired mechanisms. Specialized character/equipment/trade features
follow later. Their contracts must fit these foundations without becoming a new
prerequisite. Existing technical character notes remain future design checks.

Source basis: consolidation's playable-clearing outcome and whole-world environment
requirement; section 14's real upstairs-room and creator-boundary contract; section
07's installed-planner checkpoint; section 12 lifecycle/access; multiplayer stream
consolidation and environment implementation's explicit regional-handoff gap.
Historical unclosed checkboxes are not evidence a feature is still absent; confirm
current source before assigning it. Do not claim this review remeasured every owner.

## Priority and supersession

This is the current combined sprint. Preserve completed construction, native
support, actor-definition and paired-release work. This sequence supersedes the
remaining ordering sequence in section 14 and section 06's assertion that cover
cannot be an actor. Earlier receipts remain evidence, not implementation orders.
In particular, neither the old pairwise graph nor per-pixel reconstruction of the
discarded Three geometry is the accepted rendering solution. The authoritative
voxel positions, footprints, support surfaces and authored visual parts supply the
draw order. Do not maintain competing runtime paths.

Rejected implementation shortcuts:

- live Three gameplay or reconstructing Three geometry in Pixi;
- baked per-pixel depth images or a second caller-supplied depth coordinate;
- the global pairwise plane/graph sorter and arbitrary cycle-edge deletion;
- content-name z-index exceptions, bounding-box-bottom order or magic offsets;
- treating every extended object as one point while ignoring its footprint/parts;
- drawing every lower world layer before every upper layer; horizontal proximity
  and vertical level must participate in one physical voxel traversal, so a lower
  foreground actor can remain in front of a farther raised cell;
- retaining all footprint/support points only in diagnostics while choosing one
  lexicographic minimum/maximum as the real insertion answer;
- replacing a rooted patch's declared physical root with whichever supporting
  cell happens to be visited last;
- turning grass into anonymous presentation because actor storage needs work; and
- advancing creator/character tooling ahead of playable drawing, work and recovery.

Outcome: in the actual Clearing, walk through grass, mow it, dig a pit, build an
upper platform, place a rug and bed on it, traverse stairs, change the cut level,
and reload with another player. Correct physical outcomes, readable original art,
responsive interaction and supported creator definitions must coexist.

## Confirmed product boundary: Three workshop, baked Pixi games

Levi explicitly rejected live low-resolution Three gameplay. Three is permitted
in authoring, character fitting and previews. The game uses compiled pixel art
in Pixi. The retained-world suggestion is withdrawn, not an alternative queued
for implementation. Preserve editable geometry/rig sources and export placement,
footprint, pivot and named-part metadata needed by the voxel renderer. Do not
reconstruct live 3D or per-pixel depth from pictures. No Three canvas-to-Pixi
upload loop.

Actual source audit: figures.js uses procedural Group joints, not SkinnedMesh,
Bone or AnimationMixer. art.js flattens four directions and generally eight
frames per pose; bake.js discards runtime geometry. Measured constructors: goblin
worker 32 meshes/744 triangles; Rowan 32/1,004; full grass patch 7/1,532. These are
source-complexity counts, not measured frame performance. A hundred unbatched
workers could mean 3,200 draws; 4,096 full grass patches about 6.3 million triangles.
Batching, visible-chunk culling and bounded grass detail must be measured together.

Future character customization remains a design check, not a sprint stage. Its
eventual appearance descriptor must stay independent of body/navigation/work and
physical equipment custody; authored parts may share a rig and sockets without a
combinatorial atlas. Nothing in stages 1–4 requires a human creator, wardrobe,
shoe system or goblin garment fitting. Stage 5 proves only the existing creator
tool join with one variation of an already supported game object.

Additional boundary audit findings: work-activity currently drops target Y into
2-tuples; aiming intentionally uses a ground-plane/horizontal-heading contract.
Preserve 3D work targets; make aiming mode explicit rather than treating that
specific mode as a universal 3D picker. Native world poses already retain XYZ.
Do not discard those working transforms in a new client model.

The native lifecycle currently caps all entities at 16,384. Reserve headroom for
people, items, work and structures while measuring real grass-patch actors. Generic
`render_json` Position scans and observation caps must not accidentally hide people
when grass is added; use bounded spatial actor queries at the existing lifecycle
owner. This is a scale constraint to measure and repair, not permission to turn
grass into a different non-actor concept.

## Findings, not assumptions

* `sdk/behavior.ts` already composes actor capabilities and prepared behaviors.
  An actor does not imply a JS object, personal tick, worker, sprite or DO.
* `sdk/construction.ts` compiles Buildable definitions into the native catalog;
  real bed/floor/wall consumers in `games/colony-actors.ts` must survive.
* `runtime/session.ts:step` shares component queries within a decision phase.
  Native `world.rs:query_json` caches Bevy membership queries, but exports rows
  as JSON. TS predicates are callbacks, not automatically native query filters.
  Fluent syntax alone does not bound reads or remove bridge costs.
* `games/colony-terrain-presentation.ts` and `runtime/terrain-presentation.ts`
  generate grass presentation. They do not implement canonical mutable mowing.
* `structure_support.rs` owns derived support. Structural Floor supplies standing
  support. Structural Cover seals/spans without standing support; it means roof
  geometry, not carpet. Fixture currently includes obstruction semantics.
* `client.js` still invokes `isometric-sorter.js` each draw. It rebuilds proxies,
  signatures and graphs, and deletes constraints to escape cycles. Grass/support
  exceptions can introduce wrong relations. Static-cache tests count only new
  comparisons, not all work. `terrain-face-batches.js` retains buffers but hashes
  complete runs repeatedly. `cut-terrain-layer.js` omits viewport from an identity
  whose generated records are viewport-culled.
* `src/art/bake.js` intentionally reduces editable Three scenes to color frames.
  `parts.js` already exports meaningful visual pieces. Preserve that reduction:
  export placement/footprint/pivot/part declarations where required, rather than
  adding a depth image or reconstructing 3D in Pixi.

Audit scope includes those actual callers, native placement, query and transaction
boundaries. It is not a claim every water/gas/work/controller path was exhaustively
profiled. Preserve those owners; measure them separately in the joined workload.
The prior live CPU profile and unchanged-face sorter case are evidence of render
cost, not a worker-capacity benchmark or GPU measurement.

## Stable ownership and creator contract

Actor is the authoring and identity concept. Capabilities determine stored facts
and applicable operations. Simulation, drawing and authoring need not have a
one-to-one object count. A dual-grid visual patch can reflect four physical cover
cells; drawing that patch must not spawn or mutate actors.

| Fact | Owner | Consumers |
| --- | --- | --- |
| Terrain solids and edits | Existing native terrain owner | support, navigation, fluid geometry, observations |
| Structural support | Existing structure geometry/support owner | placement, navigation, dependency checks |
| Surface attachment, footprint and obstruction | Native placement/geometry seam | rug, cover, fixtures; checked commands and previews |
| Actor identity and capability state | Existing native ECS/lifecycle | creator queries, work targets, observations |
| Work acquisition/progress/completion | Existing native work/task owners and shared scheduler | mowing, building, hauling, production |
| Accepted command and durable result | Existing Region transaction | human, authored behavior and AI controller actions |
| Color frames, pivots and named visual parts | Existing asset exporter/pack owner | renderer and asset study |
| Visibility, GPU resources and picking | Client presentation owner | camera, world view, selection/build gestures |

Use actor `.with(...)` for definitions and behavior `.find(...).where(...).do(...)`
for decisions. Named actions propose checked operations; they do not bypass Rust.
No new per-content scheduler, entity runtime or renderer-side game state.

### Platform, rug, grass: precise semantics

The platform remains an actor with Buildable floor geometry. It creates a support
surface according to native span rules. Do not reimplement span rules in an SDK.

Introduce surface placement as a capability over the existing geometry owner:
canonical surface address (terrain face or structure face), origin, orientation,
footprint, and checked contact requirements. A multi-cell attachment resolves all
its contact faces; it cannot name one supporting head cell and ignore its tail.
Surface addresses must distinguish replacement of a surface from stale references.
An attachment footprint does not itself imply obstruction, sealing or load support.
Keep these contributions explicit, exhaustive and validated at definition compile.

Rug: independent actor, nonblocking surface attachment, no sealing or load support.
Bed: existing actor and obstruction/contact semantics. Bed support resolves through
the rug to the structural surface. Removing a rug does not invalidate the bed.
Platform removal follows the existing checked dependency policy, never silently
leaves dangling attachments. Destructive terrain edits clean up dependent cover
and reject/invalidate affected plans through native owners in the same commitment.
Do not introduce general falling physics as a prerequisite.

Every grass patch is an actor with stable identity, surface placement, height and
condition. It uses the ordinary actor/capability API and current native lifecycle;
it is not merely “actor-authored” presentation or an anonymous terrain field.
One patch actor represents the useful gameplay unit, never an individual blade.
An actor does not imply a personal JavaScript object, callback, state machine,
tick or sprite. Only explicitly due growth/work enters bounded processing, and
only visible patches produce presentation records.

First implement and measure patch actors in the existing small Clearing. Versioned
generation creates stable actor identities independently of camera visibility;
save/reload cannot regenerate a mown or removed patch. Camera paging creates no
actors. If later world scale requires different generic actor residency/storage,
change the lifecycle owner while preserving the same actor IDs, capabilities,
queries and durable behavior; do not create a grass-only shadow store.

Cover state is canonical only once: remove `generatedCover` as a parallel gameplay
answer when the actor consumer migrates. Rendering queries authoritative patch
actors and derives same-height four-corner dual-grid masks and deterministic
variants, with diagonal/chunk-boundary invalidation. It does not spawn actors,
infer growth or write mowing results.

For this slice, overlapping rugs are rejected; rugs require a supported footprint
clear of incompatible cover. No automatic destruction of grass by painting carpet.
Definitions express compatibility; later stacking must supply explicit semantics.
Snow, ash and moss are design checks, not mandatory new gameplay in this sprint.

## Stage 1A — one drawing contract and one measured fixture

**September 17 implementation checkpoint.** The mixed factual fixture, shared
subject-record producer and pure `voxel-draw-stream.js` compiler now exist beside
the live sorter. The compiler walks fixed-camera XYZ contacts, waits for every
contact of an extended footprint, retains a surface-root's declared point while
waiting for its named supports, treats multipart supports as far-boundary/open
surface/positioned occupants/near-boundary spans, and appends transparent records
after opaque. Focused integration proof passes 23/23 across the 4×4 camera/object
orientation matrix, reversed input, empty/occupied stairs, complete bed contacts,
cover supports, water and build guides. A real projected cross-layer case proves
a lower foreground actor draws after farther raised terrain; it rejected the
earlier layer-first prototype. Production still uses the old sorter. Rendered
image, shared reverse-stream picking, continuous movement and live cutover remain
required before Stage 1B/1C acceptance.

Create one maintained mixed fixture from actual original art: raised platform,
2x1 bed, rug, both stair railings, animated goblin, short/full grass, cliff, pit,
cut cap, water and blue build guide. Use the same asset/runtime producers as play.
Record existing failure and counters once; do not rerun broad suites to postpone
the replacement. Audit references to sections 06/13/14 for contradictory orders.

## Stage 1B — one voxel draw stream; remove the global occlusion puzzle

The world already owns the facts required for ordinary isometric drawing: XYZ,
selected cut level, support surface, occupied footprint, orientation and authored
visual parts. Compile those facts into one deterministic back-to-front stream.
Pixi consumes color frames and transforms; it does not reconstruct discarded 3D,
sample per-pixel depth or decide physical relationships from sprite rectangles.

Traverse visible voxel layers and cells in the order defined by the shared fixed
camera. Within each cell/layer emit explicit slots such as rear terrain/structure
faces, rooted surface objects, supported actors and foreground faces. The exact
slot vocabulary must be derived from stage 1A's real counterexamples and remain small;
it is not a universal list of content types. World rotation selects another
predefined traversal and matching authored orientation. Pan and zoom do not alter
physical order.

Cell/layer traversal is primary. Do not replace it with one global scalar made
from a sprite origin, footprint centroid or camera-distance extreme and consult
slots only when those unrelated scalars tie. A terrain top's corners and an
actor's feet must first resolve to the same canonical voxel insertion context so
the structural slot law applies. Extended records retain their complete oriented
footprint. Their declared emission cells/parts determine where they enter the
traversal; selecting one endpoint and discarding the rest is not footprint-aware.

The shared record boundary uses factual attachments, not content names:

```text
cell-face(cell, face)
surface-root(supports, point)
supported(supportActorOrTerrain, feet)
footprint(allWorldContactPoints)
part(owner, semanticRole, transformedGeometry)
surface-mark(cell)
```

Records also declare `opaque` or `transparent`; the compiler never checks for a
water, grass, goblin, bed or stair ID. Producers validate these facts once. The
draw compiler consumes them without consulting sprite bounds for physical order.

```text
for cell in visibleCellsBackToFront(cameraOrientation, selectedCut):
  emit(cell.rearVisibleFaces)
  emit(rootedObjectsAndParts(cell))
  emit(supportedActorsAt(cell))
  emit(cell.frontVisibleFaces)
```

The production compiler may merge static cell runs and continuously positioned
actors, but its ordering function consumes their authoritative world XYZ and
declared footprints/parts. Any packed traversal rank is an internal linearization,
not a saved “depth” fact or a second transform supplied by game code.

An actor's datum is its authoritative world/support position, normally its feet.
Its transparent sprite height does not create another physical coordinate. A
multi-cell bed or shelf enters from its real oriented footprint, never only its
origin cell. When one authored object genuinely crosses insertion boundaries,
use a small set of named parts with declared local anchors, as the stair rails
already do. All parts retain one actor/selection identity. Do not automatically
slice sprites, infer parts from opaque pixels, or add content-name sort branches.
If a required fixture cannot be represented by its existing footprint and a
small meaningful authored split, stop and retain that exact counterexample before
inventing a more general renderer.

For the existing stair, stage 1A consumes the actual authored `surface`,
`rail.left` and `rail.right` geometry for every facing. It derives which rail is
behind or in front from camera orientation and transformed world geometry; art or
game definitions never rename the rails to precomputed `front`/`rear` content.
The actor must remain between those rails at entrance, midpoint and landing.
Decorative vertical extent cannot become an insertion point: declared local
contact/boundary anchors come from the authored part contract, not the highest
visible pixel or geometry bound.

The stair compiles as one support-local compound. Derive the far and near upright
boundaries from transformed geometry and camera traversal; emit the supporting
surface and actors whose canonical `support` names that stair between them. Order
those actors by position along the support. This is a reusable multipart-support
law, not a stair-name branch. A bed has no legal occupants inside its obstructed
footprint and enters only after traversal crosses its complete oriented footprint.

Terrain top, cliff side, cut cap and structural face records already carry world
geometry. Emit only faces admitted by the selected-level cut and insert actors
whole when their support position is visible; a goblin is not clipped because
its picture extends above that level. Lower visible terrain provides context but
never becomes the selected build plane. Build guides enter the same stream at the
chosen physical surface, rather than drawing unconditionally over the world.

Grass uses the same rooted-surface slot and ordinary alpha art as other cover.
It may overlap a goblin's feet because it is in front at that cell; it needs no
front/back blade layers or grass-only comparator. Dual-grid patches are visual
records derived from neighboring canonical cover cells, not new physical actors.

Water and other genuinely blended art use a declared transparent pass after the
entire opaque/cutout stream, ordered back-to-front from their physical surfaces.
This is a pass boundary, not merely a late slot used only when two traversal keys
tie. Keep this limited to supported effects; arbitrary intersecting transparent volumes are
outside the slice. HUD remains last. Visible-object picking walks the same final
records front-to-back and applies the existing alpha silhouette. Construction
targeting continues to use the canonical selected plane, not whichever picture
happens to be visible.

Stage 1B acceptance uses all supported view orientations and continuous movement. Walk
an actor around a raised tile and pit, through short/full grass, between both stair
rails, across an upper landing, and around both ends of the bed, shelf and tree.
Check cliff/cap/water overlaps, reverse input enumeration before compilation, and
obtain the same final stream, image and pick. Preserve original color art. Any
failure records world facts, emitted slots/parts and a screenshot; do not restore
the pair graph, add arbitrary numeric offsets or introduce a per-pixel depth path.
Synthetic records that predeclare disputed front/rear, slot or insertion answers
do not satisfy this gate. Use the production terrain/cover producers, actual
authored multipart metadata and the same actor projection used by play.

## Stage 1C — retained chunks, bounded updates, real play

Cut over the production world pass and remove the pair graph, support/grass sort
exceptions and signature-driven run rebuilding together. Retain visible exposed
terrain and cover buffers by chunk/material/revision. Batch only consecutive
compatible terrain records in the final voxel stream; actors and authored parts
interrupt a run where the physical order requires it. Moving actors update their
stream position, transform and frame reference, not static terrain buffers.
Changed cells invalidate affected faces and dual-grid neighbors; camera/cut changes
have explicit visibility invalidation. Fix the existing viewport identity defect.
Unload disposes owned buffers; shared textures remain pack-owned. HUD stays Pixi.

First visible release milestone: existing Clearing and upstairs construction draw
correctly and respond without the graph stall. Do not wait for mowing to show this
repair. Publish only a coherent client/backend pair with connected visual proof.

## Stage 2A — unified surface placement and ordinary grass actors

One writer owns the coupled native geometry/placement/capability contract. Extend
existing construction compilation so a rug and a platform use the same proposal,
whole-footprint admission, work completion and observation route. Remove the old
consumer branches as they migrate. Proposed public capability names are not frozen
until the platform/rug/grass creator example compiles against their real owners.

Add native bounded region/ID selection and due-state selection needed by cover
work before letting generic TS behavior queries export the whole meadow. Share
reads across due behaviors in the existing decision phase. Keep arbitrary TS
callbacks supported over bounded results; do not claim automatic compilation of
JavaScript predicates. Membership, spatial selection and current eligibility remain
different queries, and admission rechecks state. Return projected fields only.
Profile bridge bytes and calls. Use the existing bridge first; if hot-row JSON is
material, change that bulk seam and its callers to a versioned packed result rather
than adding per-actor FFI calls or another world cache. JSON cold definitions are
not the same problem as frame/tick world serialization.

Scale gate: 4,096 patch actors plus actual people/items/tasks, followed by a 16,384
limit/rejection case, measured for allocation, snapshot size/reload, spatial query
rows/bytes and due-state work. No personal timer or full-world tick scan. Renderer
and observer request bounded regions; only due, changed or requested actors are
processed. Report the current lifecycle limit honestly rather than hiding grass or
crowding characters out of the render stream.

## Stage 2B — mowing is the joined surface/work proof

Define cutting through supported authored `.where(...).do(...)` requests; execution
is a task in the existing native work route. Do not add a TS worker assignment
loop. Canonical cover change and any declared clippings commit atomically. Recheck
target revision, permission and reach; retry cannot duplicate yields. Cancellation
before completion leaves cover unchanged. Finished work survives disconnect/reload.
Growth, if included, uses bounded due work in the same owner, not JS frame updates.
The first required slice is mowing; new ecology rules are not a prerequisite.

One multi-assertion scene proves: mow full to short; interrupt and retry; build
platform; place rug and bed; reject unsupported bed tail; remove rug and retain
bed support; reject unsafe platform removal; dig away cover support; cross a
dual-grid chunk seam; save/reload; two clients observe identical committed facts.
Use the same native owners headlessly; rendering never settles those actions.

## Stage 3 — everyday work, environment cost and honest performance

Do not reopen scheduler selection: the native shared planner is installed. Audit
every current playable and performance-page job producer and remove remaining TS
candidate/worker pairing or content-specific assignment. TypeScript definitions
may describe requirements and policy; Rust owns candidate narrowing, joint
assignment, claims, paths and durable task progression for all supported jobs.

Trace one real dig -> haul -> stockpile -> brew loop through authoritative facts.
A hauler selects and reserves the source and destination before movement and goes
to the pickup first; it must not walk to a destination merely to accept work.
Carried bucket/item art derives from current custody and quantity, so an idle pawn
does not permanently display a pail. Stockpile paint remains a toggleable work-plan
overlay; physical items stay visible on the ground or on a compatible container.
Impossible plans are rejected at proposal time or removed with an owned reason;
they cannot remain as scheduler poison. Cancellation, lost targets, partial cargo,
retry and save/reload conserve quantity and settle completion once.

Brewing, wood, herbs, water, food and other current consumers share the same lot,
container, transfer, task and scheduler owners wherever their laws match. Keep
multi-stage work and worker-specific stages explicit: a stage may acquire a worker
after prerequisites, retain that worker after skill-dependent work begins, release
them at a declared handoff, and leave intermediate physical items available to
other lawful tasks. No recipe or item name branches the engine transport.

Target 60 FPS on a recorded ordinary desktop browser/device, with 30 FPS as a
separately measured lower-tier target, not a claim about software-rendered CI.
Record viewport, zoom, visible geometry, GPU/backend, p50/p95/p99 and stalls.
Initial CPU presentation budget: p95 <=4 ms on the reference desktop workload;
whole-frame target <=16.7 ms. GPU timing, when unavailable, is reported unavailable.
Static-camera inert frames upload no unchanged terrain geometry. Motion may update
dynamic data; mining/mowing rebuild only affected chunks. Record stream compile,
merge, draw count, texture/buffer memory, allocation and high-water behavior
during movement and pan/cut cycles.

Run the same productive 32/100-worker scenarios through the same pack/runtime in
playable and performance pages. Report simulation, candidate/path/assignment,
water/gas, TS bridge, observation/network and drawing separately. Idle populations
do not establish capacity. No renderer fix establishes that water/gas are fast.
If 100 productive workers miss the budget, identify the measured owner before
claiming capacity or reducing simulation/world coverage.

Stage 3 acceptance runs the same deterministic productive scenario in the
playable and performance pages, including drawing. It reports candidate counts,
path work, assignment time, task advancement, water, gas, bridge bytes/calls,
render compilation/draw and memory separately. The scenario must produce and move
real goods; idle actors and a renderer-only benchmark do not establish capacity.

## Stage 4 — durable connections, retained people and regional boundaries

Use the existing Region transaction, lifecycle, access and observation owners.
Prove current-format save/reopen, lost-acknowledgement command replay, disconnect/
reconnect and a second participant against the same world used in stage 3. A
player's people remain ordinary persistent actors after that player disconnects;
controller presence, ownership/custody, group membership and permission remain
separate facts. Shared custody and shared property must not collapse into a team.

Before adding another Durable Object, write and test the actual handoff: stable
region identity, authoritative actor/item/fluid owner, command routing, transfer
prepare/commit/recovery, duplicate/lost message behavior and observation revision.
View coverage, loaded presentation chunks, observed facts and active simulation
are separate. Do not split regions merely to improve drawing and do not duplicate
actors, resources, water or gas across a boundary. If the current small Clearing
does not require a second DO to satisfy the declared world plan, retain the single
owner and prove the boundary rather than manufacturing a distributed demo.

Stage 4 acceptance reconnects two participants, verifies persistent people and
shared access, reopens after process loss, and conserves finite resources. A local
snapshot round trip alone does not prove DO crash durability.

## Stage 5 — existing creator-tool join and final delivery

Creator acceptance: game definitions compose platform/rug/grass and a second
surface-cover appearance without content-name engine branches; a custom bounded
TS rule submits supported intents; wait/reject reasons identify the owner. Keep
work, material, access/controller and durable transaction mechanisms. Do not
rewrite them just to rename methods. No new universal ECS or plugin runtime.

Evidence levels remain distinct: source, focused laws, baked art, actual connected
interaction, measured performance, hosted matched pair. Existing accepted studies
remain intact. No production/main deployment. This plan does not claim any new
renderer, surface attachment, mowing or performance outcome is implemented.

## Reference and scope of comparison

Ingnomia's pinned `content/shaders/world_v.glsl` and renderer confirm the useful
boundary: world/tile coordinates establish ordering and fixed-composition art is
discarded outside its visible pixels. Hive does not need to copy its hardware
depth implementation or its fixed tile contents. We borrow the coordinate-owned
ordering principle and express our independent actors through footprints and
named authored parts:
https://github.com/rschurade/Ingnomia/tree/4f99266c0f95faa847ca0db2af18cf59aff07f4b

Botanical comparison: current `ownership-and-seams.md` and `software-shape.md`
require one fact owner, typed relationships, bounded work and real caller cutovers.
This plan follows that boundary; it does not request new Botanical services or
claim a peer implementation review that has not occurred.

## Existing creator tools: the first end-to-end join

Read-only comparison of integration and primary source: the MCP scene compiler
is shared; primary has additional dirty editor admission/fidelity/resource work
that must remain preserved. MCP currently exports four original brewhouse props
and bounded primitive documents as Three Object JSON. The full editor exports
project/Three/GLB; its compiled scene is not yet a raster game asset.

The missing seam is concrete: `static-authoring.js` / `export-static-art.mjs`
use `bakeArt()`'s fixed built-in catalog. Introduce a checked versioned authored
visual document plus bake specification into that same export owner; keep the
existing atlas/manifest loader and game Visual reference. The existing brewhouse
study's duplicate bake/outline should converge on the shared bake owner when
this consumer moves. Do not create another asset pipeline or editor.

First consumer: expose existing bed geometry to MCP, author a visual variant,
compile the required facings with the shared camera/color/placement owner, and bind
it to the existing native bed definition. Prove MCP call -> retained document ->
checked pack -> ordinary bed construction/use/picking/reload. Physical footprint
and work rules remain explicit game definitions, never inferred from mesh bounds.
A bench is not already a functioning furniture consumer, and an MCP kettle does
not satisfy a brew station's multiple state-derived visual profiles.

Do not schedule this creator seam beside stage 1 merely because it touches different
files. It remains stage 5 after the playable renderer, building, work/performance
and continuity outcomes. Human appearance composition and custom shops, food or
clothing remain later product examples, not prerequisites for this sprint.
