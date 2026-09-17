# Unified building, creator API and rendering sprint

September 17, 2026. Current planning handoff. Building and creator integration
are specified below; extended-object ordering remains unqualified. Historical
renderer stages are reference only where the current sprint explicitly retains them.

## Current sprint: a buildable upstairs room through the supported API

The user asked for Edmund API progress wherever this sprint touches engine
behavior. This means the friendly creator API discussed throughout section 10,
not an administrative product or a privileged mutation surface.

**Rule for every touched seam:** identify its existing mutation/query owner,
expose the necessary supported SDK operation or observation, move the real caller,
and remove the superseded orchestration in the same slice. Do not defer API work
as cosmetic cleanup. Do not expand unrelated inventory, guild or behavior APIs.

| Touched concern | Supported boundary required in this sprint | Authority / forbidden duplication |
| --- | --- | --- |
| Buildable content | Actor capability/definition compilation into existing catalog; geometry and visuals referenced once | Native catalog/geometry; no second building registry |
| Placement targeting | Shared typed proposal normalization for point, area and edge input | SDK coordinates; client owns only gesture/layer choices |
| Can this fit? | Batched scoped decision with per-target reasons and revision | Native placement owner; no client support checker |
| Plan / cancel construction | Typed intents usable by the existing collector and authorized external commands | Existing Rust work/transaction owner; no TS candidate assignment |
| Replace floor / deconstruct | Supported typed operations with dependency and contents checks | Existing replacement/deconstruction owners; no direct map edits |
| Why is this waiting? | Scoped construction status and rejection/dependency reasons | Observations of native state; no inferred UI job state machine |
| Display structure parts | Definition-linked art metadata and observed instance transform | Renderer derives disposable visuals; no physical mutation API |

Permissions remain scoped per operation. Preview is never authorization.
Camera/layer/ghost changes stay local UI operations and do not need durable
world commands.

### Edmund creator API rule

Whenever this sprint touches an authoring seam, improve the supported creator
API in the same slice. The Clearing UI is one consumer of that API; it must not
remain the only place where placement, rotation, area expansion or construction
intent can be expressed. For each touched concern, deliver all three parts:

1. a checked definition, query or typed operation in the public SDK;
2. one native transactional owner that revalidates and commits world changes;
3. a real Clearing consumer proving that the friendly surface reaches the
   existing engine behavior without Goblin-name branches or repeated geometry.

The current construction seam already has much of the engine machinery:
`placementDecisions`, `planConstructions`, `constructionReadiness`,
`deconstructionAccess`, `plan-deconstruction` and `replace-floor`. The sprint
must compose these into the Edmund-facing construction vocabulary rather than
adding a second planner or exposing raw kernel calls. Exact public names should
follow the installed SDK conventions after inspecting their callers; this packet
does not decree a new generic framework.

The creator story should read approximately as follows; the example shows
responsibilities, not permission to add these exact exports without grounding
them in the current SDK:

```ts
const bed = actor("goblin.bone-bed")
  .with(Buildable, {
    shape: footprint([[0, 0], [0, 1]]),
    materials: { wood: 4 },
    work: { kind: "carpentry", seconds: 8 },
  })
  .with(Visual, boneBedArt);

const proposal = construction.propose(bed, {
  at: cell(12, selectedLevel, 9),
  facing: "east",
});

const decisions = await world.inspect(construction.placement(proposal));
await player.do(construction.plan(proposal));
await player.do(construction.cancel(site));
```

Definitions compose capabilities with `.with(...)`. Behaviors collect prepared
queries through `.where(...).do(...)`. Direct player gestures submit typed
operations through the same collector; a click is not modeled as a behavior that
runs every tick. The renderer consumes observations and may never turn a red
ghost green by itself.

Keep local editing tools honest without making them durable engine concepts:
selected floor, blue grid, hover, rotation and ghost lifetime remain UI state.
The durable operation begins with the normalized proposal. Art review and camera
tools need asset/workbench APIs, not physical world mutation APIs.

### Sprint ledger: visible result and Edmund API move together

| Slice | What Levi can see | Edmund-facing boundary left behind | Duplicate removed |
| --- | --- | --- | --- |
| 1. Honest bed | One rotated bed ghost on the selected upstairs floor; missing head or foot support is red | Canonical authored footprint, normalized proposal and batched placement decision | Upper-placement candidates, repeated client footprint and client support guesses |
| 2. Whole room | Floors, walls and one custom furniture definition build through the same gesture grammar | Point/area/edge construction vocabulary compiles to the existing native catalog and work owner | Raw `colony-building.ts` target expansion and catalog-name branching as callers migrate |
| 3. Change room | Rotate furniture; replace/remove a floor; rejected destructive edits explain why | Replacement, deconstruction and cancellation as friendly typed operations with reason queries | Direct map/component edits and inferred UI job state |
| 4. Walk and cut | Actors use stairs; rails, beds, walls and cut terrain order correctly on selected levels | Definition-linked visual parts consume canonical transforms and observed instance identity | Parallel client world state and object-name sorting exceptions |
| 5. Release proof | Save/reload and two players retain one lawful room at acceptable frame cost | Versioned definitions and replay-safe creator operations proven by a custom furniture consumer | Unversioned artifacts and proof-only entrypoints |

Do not finish a slice whose newly touched authoring concept exists only inside a
Clearing-specific handler. If the native operation already exists, expose and
compose it through the creator surface and move the real caller; do not rewrite
the native owner.

### Delivery slices, in order

1. **One honest upstairs bed.** Reproduce the failing native/UI path; establish
   the shared proposal/decision API and remove upper-placement targeting. Use the
   real two-cell bed, one ghost, selected-plane blue grid and full-footprint
   rejection. Include the minimum extended-art correction needed to view this
   room honestly. Deliver a local rendered room and exact remaining defects;
   don't wait for the whole sprint before showing it. No throwaway custom planner.
2. **The creator builds the room.** Complete the actor/buildable compilation join
   and request collector for bed, floor and wall consumers. Move their real game
   callers together; delete replaced raw creator orchestration. Demonstrate one
   custom furniture definition without changing engine targeting or scheduling.
   Resolve exact SDK exports against installed section-10 APIs before coding;
   illustrative `Structure`/`Buildable` names are not existing exports by decree.
3. **Stairs, cuts and changing the room.** Qualify extended-art ordering using
   the room plus stairs, walking actors and lower terrain. Freeze the actual
   algorithm before broad cutover. Exercise cancellation, removal and floor
   replacement through supported operations. Preserve compact grass behavior,
   accepted terrain artwork and the existing selected-level visibility contract.
4. **Playable matched release.** Finish the consolidated acceptance story below,
   current-save/replay and multiplayer checks, active-scene performance and exact
   client/native artifact receipts. Publish only within existing deployment
   authorization. Never claim hosted parity from source or local screenshots.

Each slice must report: what can be seen/played, which API real callers now use,
which duplicate path disappeared, what was checked, and what remains. Keep work
in the existing integration root; this document is not a new framework project.
Only the first minimal room's ordering needs resolution before slice 1 is shown;
the entire general sorting problem must not block progress on placement/API.

## Coherent implementation sequence: definitions → placement → work → drawing

September 17, later user direction: remove special-case upper building and move
this real consumer onto the accepted creator API. This section owns execution
order over the historical numbered renderer stages below. Do not implement the
old scalar-sort/removal stages before settling extended-object representation.
This is a source-grounded plan, not a claim the defect is reproduced or fixed.

### 1. Establish the actual failing path

Reproduce the second-floor bed with only its head supported. Record selected
level, orientation, canonical origin, rotated footprint, native advisory,
accepted site and completion result, plus exact loaded client/WASM versions.
Repeat with support only under the foot. Distinguish ghost, admitted plan and
finished furniture. No speculative guard may stand in for finding the break.

Verified source: `colony-environment.ts` declares the bed footprint as two cells,
`[[0,0],[0,1]]`. The September 17 runtime regression found that
`structure_support.rs` checked every rotated cell against generic load contacts,
so a wall top could satisfy a missing furniture floor. Fixtures must instead
require a completed horizontal floor surface or terrain beneath every cell;
walls and stair landings remain valid load contacts for structural members.
`construction_work.rs` already has `placement_decisions` and
`plan_constructions` calling pending validation. Section 02's historical claim
that admission omits combined validation is not a current-source diagnosis.
`client/upper-placement.js` really does offer anchor plus empty cardinal neighbors;
`placementCells` returns those candidates and `syncPlacementGhosts` repeats full
art per candidate. Remove that conflicting targeting path, but do not assert it
causes native acceptance until traced.

### 2. One definition, distinct responsibilities

Keep the existing structure catalog/geometry authority. One definition supplies
physical shape, support requirements, materials/work, completion capabilities and
visual binding; the author must not restate a footprint in UI configuration.
A bed is one instance spanning two cells, independent of its sprite count.

- SDK definition compilation validates supported shapes and references at pack
  load. Definitions are immutable data, not executable saved callbacks.
- Native geometry derives rotated occupied cells, boundary faces, support
  contacts and clearance. Keep these distinct; do not equate a sprite rectangle
  with occupancy or require every decorative overhang to touch a floor.
- Native construction owns admission, pending dependencies, work, completion and
  cleanup in the existing durable transaction. Use the existing work scheduler.
- Client placement owns selected layer/orientation/gesture and disposable ghosts.
  Renderer consumes observed instances and authored art parts; it admits nothing.

Do not add a universal actor full of optional building flags. Extend existing
actor-definition compilation with a typed construction capability/reference only
where it removes duplicate authoring. It must compile into the current structure
catalog and native completion path, not a second registry of physical buildings.
Static terrain remains chunked terrain; capability composition does not require
an actor for every floor or terrain voxel.

### 3. One proposal and one decision on every floor

The build gesture intersects the selected horizontal plane. It never falls
through a missing second-floor tile to distant ground. Change level explicitly;
clear/recompute the gesture on level change. Centralize existing origin/edge
conversion through `sdk/placement.ts` with round-trip coordinate fixtures.

An immutable proposal contains definition reference, origin/edge, orientation
and explicit instance targets. Derived footprint cells are not extra targets.
Point placement makes one bed; a floor rectangle makes many floor targets;
edge strokes make canonical edges. Reject unsupported gesture/shape combinations
at the command boundary, not merely in the UI.

Preview and commit use identical proposal normalization. Query the native
placement decision in bounded batches; discard stale async replies by generation
and placement revision. Unknown information is checking/unavailable, never green
permission. Preserve ready/waiting/rejected distinctions instead of flattening
all non-rejected decisions into ready. Commit rechecks inside the native owner,
including earlier accepted requests. Recheck before physical completion.

Keep grounded span/contact laws. Planned support may establish dependencies but
never supplies a walking surface. Invalid pending dependencies are removed under
the accepted cancellation policy, releasing claims/material custody correctly.
Reject destructive removal that would leave committed furniture unsupported until
an explicitly designed collapse/move policy exists. Atomic floor-finish replacement
remains legal beneath furniture when it preserves the same physical support.

Delete `upper-placement.js`, its cache, anchor gesture mode and callers once
replaced. Replace their tests with selected-plane/full-proposal assertions.
Do not retain compatibility paths. Blue grid is a bounded display of the chosen
plane: known supports solid, known void dashed, unknown neutral, whole rejected
footprint red. Ordinary world occlusion applies; walls do not move the build plane.

### 4. Deliver the creator-facing join in the same slice

Do not fix the UI while leaving a second bespoke game planner for later.
`colony-building.ts` currently normalizes targets, expands areas, handles floor
replacement, deduplicates sites and returns raw action arrays. Extract reusable
placement normalization to the SDK owner and keep replacement/admission native.
Goblin retains content choices, costs, labels and access policy.

September 17 checkpoint: `sdk/construction.ts` now owns the checked point/area/
edge proposal schema, deterministic expansion, support-to-origin conversion and
site proposal identity. The real Colony command consumes it, and a non-Colony
three-cell bone bed proves the helper has no Goblin catalog branches. This is the
stable layer beneath the future actor/buildable compilation join; do not move
the geometry back into the game command. Floor replacement orchestration and the
structure-definition-to-actor join still remain in this stage.

Use the installed actor `.with(...)` composition and prepared query
`.where(...).do(...)` collection contract from section 10. Construction action
builders describe requests consumed by that pipeline; they do not mutate state.
A player build command is a scoped external intent, not a behavior that runs every
tick. Wire it into the same supported operation collector without polling for
clicks or adding a scheduler. Do not put schema declarations, coordinate math or
static art metadata into `.where()` just to make all code fluent.

Before expanding, land one real bed consumer and one contrasting floor/edge
consumer through that surface. Show the exact public imports and implementation
behind every introduced symbol. A capability's authored geometry must compile to
the existing native definition. Completion must preserve one instance identity
and grant its declared capabilities exactly once; no shadow actor beside a
separate authoritative structure. Keep existing storage/work/access owners.
New supported furniture should then be definition plus art, without edits to
client targeting, native dispatch or the scheduler. Remove the superseded raw
creator orchestration as those callers migrate; internal typed action requests
remain a legitimate implementation detail.

### 5. Settle extended artwork before replacing ordering

One canonical transform feeds both placement geometry and visual-part placement.
Support contacts and sort geometry remain distinct projections of that definition.
Ingnomia's per-component art is a reference for one object with multiple visual
pieces, not proof that our current whole-bed or full-length rail can use one
scalar key. Ordinary compact objects/grass remain ordinary sprites. Long bodies
need proven footprint-derived ordering or authored pieces; stairs must allow an
actor between their existing rails over the entire climb in each view.

Use existing art to resolve bed/floor and stair/actor counterexamples before
choosing the replacement. Record the exact accepted ordering rule, tie handling,
cycle/unsupported-overlap behavior and static invalidation in this packet. This
is the remaining design gate: do not hand a lower model contradictory instructions
to invent an algorithm and simultaneously forbid the tools it might need.
Keep overlapping-visible broad phase and cached static work. Benchmark actual
active scenes after correctness; do not trade lawful ordering for a claimed rate.

### 6. One focused acceptance story and coherent delivery

Extend the maintained building interaction fixture with multiple assertions:
second-floor bed on full/head-only/foot-only support, all rotations, one ghost and
one identity; same outcomes on ground; wall/void/obstruction rejection; correct
selected-layer targeting; floor replacement with furniture and stored contents;
stair clearance/rail drawing; stale preview and competing multiplayer placement;
support-plan cancellation and committed-support removal; paused commands,
current-format save/reload and replay without duplicate sites/material effects.
Use focused native checks for admission and one rendered scene for visual claims.
Do not repeatedly run unrelated long suites while the implementation is changing.

Acceptance includes a small custom furniture definition using the same creator
surface without engine edits. Review bounded candidate/query/render costs and
remaining Fallow findings on changed owners. Preserve source, artifact hashes,
local proof and rollback receipts. Existing deployment boundaries still apply;
this plan grants no backend deployment or main merge. Report source completion,
local verification and hosted parity separately.

## September 17 source comparison: placement and long objects

This amendment takes precedence over the scalar-sort experiment below. A single
root-depth key is **not an accepted general solution for extended objects**.
Do not delete the existing ordering owner simply because a tile renderer uses
scalar depth. First settle the representation of multi-cell artwork and prove
its interaction with moving actors and terrain. Placement must be investigated
alongside sorting; a correct image does not prove a legal building.

Source findings:

- **Ingnomia**, pinned `4f99266c0f95faa847ca0db2af18cf59aff07f4b`:
  [`selection.cpp`](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/base/selection.cpp)
  loads component offsets from `Workshops_Components` / `Items_Tiles`, rotates
  each offset and checks required/forbidden conditions at every resulting cell.
  Workshop components at base height default to requiring a solid floor.
  [`worldconstructions.cpp`](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/game/worldconstructions.cpp)
  constructs workshops from rotated component positions and per-component sprites;
  `workshop.cpp` retains one workshop identity and its tile collection. Its
  tile-oriented renderer is not evidence that one arbitrary long sprite sorts
  correctly from its anchor. This review establishes selection validation, not
  full race-safe native command admission or all support-removal behavior.
- **Excalibur**: see `docs/decisions/excalibur-depth-source-review.md` for pinned
  source. Elevation bands plus screen Y provide isometric ordering, not a
  footprint support solver. That review already contains an upper-bed/floor
  counterexample. This packet must not override that evidence with an unproved
  scalar formula. Placement remains game-authored.
- **Godot**: [TileMapLayer documentation](https://docs.godotengine.org/en/4.6/classes/class_tilemaplayer.html)
  provides Y-sort origins and groups Y-sorted tiles by Y. Those are rendering
  controls, not an all-footprint structural admission contract. We cannot cite
  Godot Y sorting as solving either unsupported beds or arbitrary long sprites.
- **IsoSpriteSortingDemo**, pinned `86b907c94a42d9cd26fa44973f8bc4d0dc4981ce`:
  [scripts](https://github.com/markv12/IsoSpriteSortingDemo/tree/86b907c94a42d9cd26fa44973f8bc4d0dc4981ce/Assets/Scripts)
  use points/lines, overlapping sprite bounds, cached static dependencies and
  topological ordering. This directly addresses extended sorting footprints,
  but supplies no placement/support owner. Its midpoint fallbacks, cycle-edge
  removal and globally-below floors are not accepted multilevel-world rules.

### Reported bed supported only beneath its head: unresolved defect

The user reports that this can be placed. Treat it as an explicit regression,
not as solved because source contains a guard. `structure_support.rs` already
iterates `fixture_cells` and checks support beneath each cell. Trace the actual
bed definition, rotation, SDK proposal, native admission, completion and deployed
artifact to find where the intended footprint is lost or the guard is bypassed.
Distinguish a permitted preview/plan from an actually completed unsupported bed.

Required outcome: one bed identity and ghost; its whole rotated footprint on the
chosen level must satisfy its declared support and clearance. Test head-only and
foot-only support in every rotation, both rejection at command admission and
revalidation before completion. Valid full support places exactly one bed. A
supporting-floor removal must not silently leave invalid committed furniture;
use the existing structural policy. Cancelling planned support invalidates its
dependent pending plans under the accepted plan policy. Preview, native decision
and hosted result must agree. Fold these into the maintained multi-assertion
building fixture rather than a new parallel suite.

Rendering and placement share canonical transforms/geometry, but support cells,
occupied volume and visual pieces have distinct meanings. Multiple sprites do
not create multiple beds; a support anchor alone does not describe a bed.

## Objective and precedence

**Later September 17 amendment: unified layer-locked building is included.**
Read the support/placement audit and stages B1–B4 below before implementing.
Rendering and building share coordinates and declared geometry; they do not share
mutation authority or use draw order to decide physical support. This amendment
adds placement interaction and its local blue grid to the existing renderer/art
integration outcome. It does not authorize a new structural simulation.

Replace the failed geometric sprite-plane approach with the simplest consistent
position/height depth convention that passes Clearing's actual art fixtures.
Use Ingnomia as the concrete reference. Preserve ordinary Pixi drawing, original
art, independently moving actors, multipart stairs, and the selected-level cut.

This page supersedes section 13's proposed universal plane-comparison sorter and
instructions to preserve its static dependency graph. Section 13 still owns cut
visibility, coordinates, observed terrain, and lower-world presentation. Section
06 still owns authored art parts and placement. Do not interpret old graph tests
as requirements to retain the rejected implementation.

No Rust, simulation, job, custody, save-format, host protocol, or backend changes
are planned for this correction. A missing authoritative fact is an escalation
with a concrete example, not permission to add a client simulation.

## Source custody and starting point

Work currently lives in `/home/levi/src/hive-worktrees/living-terrain-integration`,
branch `engine/living-terrain-integration-20260917`, baseline `f5e277db`.
Substantial uncommitted art integration exists. Preserve it and record a source
checkpoint before implementation. Do not reset the worktree to remove sorter
patches; isolate their hunks. Follow AGENTS worktree/writer custody rules if the
writer changes. The study at the accepted art preview must remain untouched.

Read actual current files and callers:

- `engine/src/client/isometric-sorter.js`, `plane-order.js`, `ordering-projection.js`
- `terrain-visibility.js`, `terrain-face-appearance.js`, `cut-terrain-layer.js`
- `terrain-face-batches.js`, `client.js`, existing alpha picking consumers
- `src/art/prop-camera.js`, `living-terrain.js`, `living-terrain-authoring.js`,
  `living-terrain-pack.js`, and `artifacts/living-terrain/manifest.json`
- Existing stair/furniture part producers and actor movement presentation.

## What the reference actually does

Pinned Ingnomia source: `4f99266c0f95faa847ca0db2af18cf59aff07f4b`.

- [Vertex shader](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/content/shaders/world_v.glsl):
  rotate tile coordinates; depth is `x + y + z`, plus `0.5` for upright art.
  Each quad has constant depth. Screen projection is separately defined by its
  tile dimensions. This is an art convention, not exact visible-surface depth.
- [Fragment shader](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/content/shaders/world_f.glsl):
  fixed composition of wall/item/creature imagery within a tile; discard empty
  pixels. No per-pixel baked geometry depth texture.
- [Renderer](https://github.com/rschurade/Ingnomia/blob/4f99266c0f95faa847ca0db2af18cf59aff07f4b/src/gui/mainwindowrenderer.cpp):
  instanced opaque/transparent passes with hardware depth testing. Its selected
  depth slab and tile composition are not our independent actor/part contract.

Borrow a single scalar depth per drawable and consistent art placement. Do not
copy its GPU infrastructure, gameplay-specific shader flags, fixed creature
composition, or a finite lower-level window. Pixi painter ordering can express a
constant-depth ordering; this does not promise equivalent transparency behavior
or the same performance as its hardware depth pipeline.

## Stage 1 — qualify the convention before replacement

Build a small deterministic fixture using existing art and current runtime
record producers. No new renderer framework, alternate public page, or runtime
fallback. A test-only comparator/fixture is sufficient for this investigation.

Start with a camera-derived scalar at each part's declared world placement datum:

```text
towardCamera = -sharedCamera.viewDirection
depth(part) = dot(part.orderAnchorWorld, towardCamera)
key(part) = (depth(part), coincidentPhase(part), stableEntityAndPartId(part))
ordered = stableAscendingSort(parts, key)  // distant first, nearer last
```

Coordinates are world metres with Y vertical, not voxel indices: a support top
at voxel level L has Y = `(L + 0.5) * 0.54`. Do not add that conversion twice.
For the current unrotated 30-degree art camera the toward-camera vector is
approximately `(0.612372, 0.5, 0.612372)`; derive it from the actual camera rather
than hardcoding those numbers. Camera pan/zoom must not change relative depth.

This candidate adapts the reference's scalar principle, **not its exact numeric
rule**. It must pass the fixture. Ingnomia's equal tile-axis weights are not proof
that equal weights suit our camera, vertical scale, or multipart art.

Anchors are explicit presentation metadata from existing canonical placements:
actors use their interpolated support/foot datum; ordinary grass uses its rooted
placement; separately drawable structure parts use declared local anchors
transformed by placement/rotation. Do not derive depth from screen bounding-box
bottoms, transparent padding, sprite height, or content names. Independent pieces
of one baked terrain body initially share its declared body datum; record and
review the body-to-support convention against the fixture before accepting it.

A phase resolves truly coincident anchors (surface before its occupant, declared
part ties); it is not a global terrain/actor layer or a large numeric offset.
Use a transitive lexicographic comparator. Pairwise epsilon equality must not
create a nontransitive comparator. Stable IDs settle remaining ties only.

Required cases, with expected front/behind relationships written before judging
the output:

1. Tall actor moving around all sides of a raised tile and entering/leaving a pit.
   Foreground rim hides only where the pictures overlap; distant ground must not
   blanket the whole lower actor. Actors remain whole when cut-eligible.
2. Actor traversing a short/full grass boundary; grass behind a cliff; green and
   dead variants; dual-grid patch across a chunk seam. No grass-only ordering.
3. Actor ascending/descending stairs between both railings, passing underneath
   where physically allowed, and crossing upper/lower floor contacts.
4. Actor passing both ends of a long bed/shelf and a tree; adjacent elevations,
   exposed cut caps, and a shallow water edge.

Use all supported camera orientations and continuous movement, including crossing
tile boundaries. Assert expected relationships and inspect actual rendered images
at native/game size. An ordered ID list or zero exceptions is insufficient.

If a case fails, save the smallest example, anchors, keys, and screenshot. Explain
whether the datum is wrong, the authored part needs an already-supported split,
or scalar ordering is insufficient. **Stop architectural expansion and return
that evidence to the lead.** Do not quietly restore a graph, choose magic
per-object offsets, automatically slice images, or discard required constraints.
The lead must accept the first shape before broad cutover. This checkpoint is the
remaining design uncertainty; it is not assigned to a lower model to guess away.

## Stage 2 — one production order, remove superseded rules

After stage 1 acceptance, install the qualified key in a deep, small ordering
module behind actual caller needs. Return the ordered records to the existing
batcher and picker. Do not introduce a creator API or parallel renderer.

Remove the replaced ray/plane comparison runtime, per-pair signatures/graph
construction, infinite-floor support override, terrain-cover exception, and
arbitrary cycle-edge deletion. Delete `plane-order.js` only after confirming all
real consumers migrate. Keep unrelated spatial indexes used for visibility and
picking. A scalar sort does not need a broad-phase pair search.

Preserve canonical cut visibility, exposed terrain records, accepted atlas,
UVs/datums, sprite animations, texture ownership/disposal, and stair art pieces.
Grass remains ordinary art on top of the ground, not a floor or separate special
sorting path. No per-blade entities or front/back grass layers.

Batch only consecutive compatible terrain records in the final order. Ordinary
sprites interrupt a run; neither texture grouping nor whole-chunk drawing may
reorder it. Assign ascending Pixi zIndex ranks to the resulting display runs.
Picking traverses the same final record order backwards and uses existing alpha
silhouettes, including records grouped into meshes. Draw batching must not erase
individual record identity for picking.

## Stage 3 — bounded retained work and regressions

Cache static keys/order by geometry/art/camera-orientation revision. Sort moving
records and merge them into the static sequence; unchanged frames reuse the
sequence. Avoid rebuilding signatures/proxies/pair graphs every animation frame.
Animation changing only image contents need not change its anchor or order.

Keep derived visibility separate from ordering. Fix the current mismatch where
viewport-culling affects records but viewport is absent from coverage identity:
retain chunk records and cull separately, or explicitly invalidate when the
visible set changes. Panning within an unchanged requested chunk set must reveal
all eligible faces. Preserve local chunk/seam invalidation on terrain changes.

Measure visible records, static refresh, dynamic sort/merge, batch buffer rebuild,
draw calls, frame time and memory separately. Record warm/cold cut changes,
movement and excavation with active 32/100 actors if supported by the maintained
fixture. Do not infer worker capacity from idle sprites or claim a frame-rate
target from algorithmic complexity. Optimize measured costs, not a speculative
framework. Existing run meshes may still rebuild on changing membership; measure
this honestly before proposing additional buffer machinery.

Consolidate multi-assertion tests for input-order independence, ties, movement,
pan/zoom, cut, rotation, chunk edits, grass masks and matching picks. Replace tests
that require the discarded implementation; preserve player-facing regression
laws. Run focused checks through the maintained run-proof wrapper, once per
meaningful revision. Include a real rendered fixture, not only synthetic arrays.

## Delivery and scope limits

Deliver source commit, reviewed fixture images, focused test/performance receipts,
and a concise handoff identifying accepted versus unresolved cases. Documentation
alone does not mark the integration complete. Do not overwrite accepted studies.
No deployment is requested by this packet-writing turn; any later preview release
must follow current authorization and deployment notes.

The dirty terrain integration also changes presentation metadata and local worker
pack selection. Audit those separately before release: a client-only build may
not assume a hosted backend emits newly added art/cover fields. Do not solve that
with fallbacks or unauthorized backend deployment. Record exact source/artifact
pairing; do not claim the copied generated WASM matches source without verifying.

Expected churn is concentrated in sorting and record metadata, with modest
batch/pick wiring and test changes. Reuse art and terrain visibility work. No
promise of exact line count or universally correct scalar ordering has been made.

## Support and placement audit — September 17 amendment

Source inspected in this worktree at `c5aca4bf`. These are source findings, not
a completed browser reproduction of the user's exact clicks.

| Current owner/path | Finding and disposition |
| --- | --- |
| `client/upper-placement.js` | `upperPlacementCandidates` returns the anchor and empty cardinal neighbors. This is a UI extension heuristic, not native support admission. Remove this mode/cache after callers migrate. |
| `client/placement-preview.js` | `placementCells` returns all upper candidates when anchored; `syncPlacementGhosts` draws a full object at each returned cell. This explains multiple furniture previews. It does not prove multiple beds were committed. Replace the ambiguous cells list with explicit object origins versus occupied footprint cells. |
| `client/client.js` pointer handlers | Hover uses terrain hits and can silently set an anchor; pointer-down also uses alpha-hit structure lookup, then terrain fallback. Different acquisition paths can disagree on the target height. Build hover/down/drag/release must use the same plane proposal. |
| `client/build-placement.js` | `structureSurfaceFromSprite` reconstructs footprint/stair cells from sprite subjects and selects the nearest support face. Remove it from construction targeting. Retain only if a demonstrated non-build inspection consumer needs it; do not delete ordinary selection/picking. |
| `client/controls.js` | `terrainTargetMachine` holds hidden anchor state. Remove construction's `SET_ANCHOR` lifecycle. Reuse the armed tool and existing stroke machines, with explicit layer capture. |
| `client/build-placement.js` default mode | A floor offering point and rectangle defaults to rectangle. Replace this with a single-cell initial preview and explicit click/drag behavior. One click creates one floor. |
| `client/whistle-command.js`, `games/colony-building.ts` | Shared command/candidate projection already exists. Preserve it. Candidate expansion currently accepts areas for any non-edge catalog, even though furniture UI declares point-only: enforce allowed designation at the command boundary as well as in the UI. |
| `sdk/placement.ts` | `structureOriginCell` explicitly maps support cells to native origins. Keep this owner; do not scatter more `y+1` conversions through previews. Edge conversion currently lives in `colonyPlacementCandidates`; centralize/reuse that conversion through the same proposal path. |
| `kernel/src/structure_geometry.rs` | Canonical instances, rotated fixture cells, occupancy, edge geometry and horizontal support faces. Retain authority; a multi-cell fixture is one instance. |
| `kernel/src/structure_support.rs` | Rooted terrain/wall/stair contacts, bounded floor spans, and support under every fixture cell. Fixtures do not become structural anchors. Retain these laws. |
| `kernel/src/terrain_water.rs` | `construction_support` resolves prospective plans to a rooted fixed point; `validate_construction_pending` checks occupancy, terrain overlap and support. Preserve prospective versus committed separation and order independence. File location is not a reason for a broad refactor in this slice. |
| `kernel/src/construction_work.rs` | `placement_decisions` checks the complete proposal; commit revalidates. Readiness/contact selection and floor replacement are separate legitimate concerns. Retain them, including worker reachability and preserving furniture during floor replacement. |

There are several meanings of “support”: an actual standing surface, a rooted
structural load path, an actor's attachment to a surface, and the selected build
plane. Only the last is UI state. Do not merge them into an ambiguous universal
support flag or let a blue grid grant any physical capability.

## B1 — one selected layer and one placement proposal

**Levi's explicit clarification:** there is no “upper placement” concept in the
replacement. There is a chosen layer and legal or illegal placements for the
selected object. Ground-level and elevated construction use exactly the same
targeting, proposal and admission path. Do not rename the upper-placement helper
or retain its neighbor-candidate behavior behind a new wrapper.

Legality belongs to a complete proposed object/stroke, not to a universal list of
legal cells: a spot may support a floor extension but not a bed, or a one-cell
object but not a two-cell object. Query the bounded current proposal through the
existing native owner; do not scan every cell on the layer for all possible builds.

Use the existing selected view level as the sole idle build-level choice. Capture
it at stroke start; explicit level changes cancel an active stroke and invalidate
its preview/advisory before showing the new level. No hover auto-level changes.
Do not create another independently drifting level store. Reconcile the allowed
view range with the existing authoritative baseline bounds: empty buildable levels
must be selectable without pretending an existing support surface is there.

Target the horizontal plane `Y = (L + 0.5) * verticalMetres` using the same camera
and inverse canvas transform as drawing. Existing `terrainPlaneCell` already does
plane targeting; inspect/reuse its math and round-trip it against the camera.
Its conceptual operation is:

```text
ray = sharedCamera.ray(pointerInWorldCanvas)
t = (planeHeight - ray.origin.y) / ray.direction.y
point = ray.origin + t * ray.direction
supportCell = [floor(point.x + 0.5), L, floor(point.z + 0.5)]
```

Define deterministic boundary ties, validate finite coordinates/world bounds, and
snap walls to canonical grid edges on that same plane. A click beyond an upstairs
floor remains upstairs. Unsupported space produces an invalid proposal; it never
falls through to grass. Visible lower terrain stays context, never a build target
for another layer. Cut caps and unknown observations never prove support.

One narrow placement owner produces the proposal consumed by ghosts, footprint
highlighting, native advisory and command submission. Its data distinguishes:

- Selected layer, catalog, orientation and gesture.
- Object origins (one for a bed/stair; many only for an allowed floor/edge stroke).
- Canonical command input and the existing candidate projection from that input.
- Derived occupied/support cells, edges and clearance from declared shape geometry.
  These visualize the proposal; they do not decide native admission.
- Advisory status tied to proposal identity and current placement revision.

Extend the existing game placement definitions/projection to expose the shape
needed by preview. Do not create a second bed-footprint table or infer dimensions
from art. Pure shared coordinate transforms are appropriate; physical eligibility
continues through the existing native query. Ghost placement must use the same
orientation/pivot and `resolveWorldArtPlacement` conventions as the finished art.

Hover and pointer-down resolve the current pointer through this same owner.
Release commits the exact final proposal. Recompute on orientation/layer/revision
change; stale async replies cannot authorize or recolor another proposal. Preserve
native revalidation at commit even after a ready advisory. Checking, invalid, or
unknown preview state must not be displayed as ready. Changing layer cancels
pending stroke submission; repeat clicks do not bypass ordinary command identity.

## B2 — consistent gestures, distinct physical shapes

One click places one bed, even though its footprint spans two cells. Rotation
changes that one footprint and ghost. One invalid footprint cell invalidates the
whole object; never partially admit it or spawn another bed at its second cell.

Floors start with one ghost tile; click/release without a drag places one tile.
A drag beyond the existing gesture threshold expands an inclusive rectangle on
the captured layer. Walls use one canonical edge initially and an edge stroke
when dragged. Stairs use one entrance origin, with full run/rise and landing shown.
These are policies of the existing shared gesture/placement lifecycle, not four
independent building systems. Offer repeat furniture placement by subsequent
clicks; furniture dragging does not silently become a batch designation.

Retain batch native admission for floor rectangles and wall strokes, including
rooted prospective support chains. Preserve current atomic rejection semantics;
do not silently drop invalid tiles from a gesture. Existing floor replacement
must preserve supported furniture and storage contents. A reachable build contact
and a structurally admissible plan remain different decisions.

## B3 — local blue construction grid

Use a bounded local grid centered on the hovered cell (initial radius three
cells), fading at its outer edge. Highlight the complete active footprint even
if larger than this neighborhood. Keep a small `Build level L` label near the
preview, using exactly the layer control's naming.

Solid subdued blue lines indicate observed committed horizontal support at this
level; faint dashed lines indicate observed empty space. Unknown is neutral and
must not masquerade as known unsupported space. These styles describe observed
surfaces, not overall build permission. Planned support remains visually distinct
from finished support, even when native admission permits a dependent plan.
Use the existing native decision for the whole proposal: blue ready footprint,
red rejected footprint with a concise reason, neutral checking state. Do not
promise per-cell rejection reasons unless the existing query actually supplies them.

Walls do not truncate grid generation or invoke flood fill. Opaque world pieces
occlude its drawn lines normally. The grid extends behind a wall on the same
level without painting through the wall. Produce bounded cell/edge presentation
pieces that participate in the same accepted drawing convention, after their
coincident support surface and before objects that occlude them. Do not put the
whole guide in the current always-on-top transient overlay. Labels/reason text
can use the HUD. Ghosts/footprint guides must be checked against the same occlusion
fixture; retain the red conflict indication when placement intersects a wall.

Grid pieces are disposable UI presentation, never physical actors/supports or
saved state, and never intercept world picking. Reuse bounded buffers/pools;
update on hovered cell/layer/support revision/style changes, not every pointer
pixel. Show only in build mode and clear on disarm/reset. Keep no whole-world grid.

## B4 — combined implementation order and acceptance

1. Qualify section 14 stage 1 with a multi-cell bed on a raised floor, stairs,
   and the proposed finite grid pieces included. A scalar key failure is still
   an architecture checkpoint; building UX does not waive sorting requirements.
2. Implement B1/B2 in the existing placement/gesture consumers. Remove the upper
   candidate mode and its old behavior tests. This can proceed independently of
   final drawing acceptance because it uses canonical coordinates.
3. Complete renderer stages 2/3, then B3 through that same ordered stream. Reuse
   the original accepted terrain atlas and finish the active integration goal.
4. One maintained multi-assertion interaction fixture covers the following, with
   native admission regression evidence reused where unchanged:
   - A bed straddling two completed upper floor cells previews/commits exactly
     one instance in every supported orientation; missing one support rejects it.
   - Moving off that upper floor never targets lower grass, for furniture or walls.
   - Hover, down and release agree; rotation/level changes discard stale replies.
   - Single floor click, rectangle floor drag and edge wall stroke match exact
     preview origins and level. Preview footprint cells never become extra objects.
   - Floor extension obeys native span limits; prospective support never becomes
     walkable committed geometry. Replacement beneath furniture preserves it.
   - Stair entrance/landing stay at authored heights and actors interleave with
     rails. Selection and building targeting have distinct, correct behavior.
   - Grid is on the selected plane, hidden by walls, dashed over known void, and
     bounded/reused while panning; cut caps do not acquire support authority.
   - Current-format reload and authenticated multiplayer reject stale/invalid
     placements through the same owner. UI level is not an authorization grant.

Personally inspect the actual click-and-drag experience and record observed
instance counts. Source review of the duplicate-ghost path is not enough to claim
the user's exact three-bed report fixed. No backend/Rust rewrite is expected;
any necessary native defect fix needs a minimal reproduced law and coherent
source/artifact handling under the existing no-backend-deploy boundary.
