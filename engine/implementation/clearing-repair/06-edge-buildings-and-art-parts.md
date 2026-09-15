# Grid-edge buildings and declarative art parts

September 14, 2026. Implementation specification, not implemented or qualified.
Source inspected: `c1549d23f4eab298ed641ee84375f7274e5f893d` in
`/home/levi/src/hive-worktrees/clearing-repair-acceptance`.
[Packet index](README.md) · [Construction](02-construction.md) ·
[Drawing](04-drawing.md) · [Delivery](05-delivery.md).

## Required playable outcome and precedence

Levi selected **walls and doors on grid edges, floors on full cells**. Dragging
walls snaps to grid lines and automatically joins corners. Floors reach walls
without extending a half tile outside the house. An actor walking up the original
stair appears between its two railings, meets the upper landing, and never has
its feet incorrectly covered by its supporting floor. This must work in the
actual multiplayer Clearing, with original art and ordinary Pixi sprites.

This supersedes the cell-centered thin-wall placement and the one-point sorting
recommendation for those walls. Compact objects still normally use points; an
edge wall supplies its real segment. It also supersedes the proposed three-length
stair split as a sufficient design: separate side rails are essential.
It does not supersede party authority, durable work, materials, route budgets,
finite 0–7 water, sparse gas, or the original playable repair acceptance.

No generic half-floor filler, hand-authored zIndex table, per-pixel runtime depth,
new renderer, universal scene language, or new game simulation. New behavior is
limited to physical boundary structures and reusable multipart presentation.

## What the inspected code actually does

| Owner | Finding / change required |
| --- | --- |
| `src/art/floor.js` | Finished boards span about 0.996 by 0.99 units of a 1-unit cell. The visible gap is not explained by an undersized floor. Retain full-cell floor placement. |
| `src/art/home.js::wall` | Thin panels branch from a cell-center post toward neighboring centers. Replace this placement with edge segments and endpoint joints. |
| `src/art/stair.js` | Original ramp, posts, landings and both rails are separate Three meshes but not declared export parts. Retain the appearance and introduce meaningful groups. |
| `src/art.js::bakeArt`, `src/art/bake.js` | Each building facing becomes one texture. Outline is applied after rendering; naive independent part bakes introduce internal outlines and can change shadows. |
| `src/art/static-manifest.js`, static pack loader/export callers | Carry placement today; must carry validated part metadata and aligned textures. Discover their exact current callers before editing. |
| `engine/src/client/client.js` | Emits one `part: body` record/container per subject. Replace that assumption through one reusable visual owner. |
| `engine/src/client/isometric-sorter.js` | Supports entity/part keys and spatial buckets, but currently gives differing scalar storey bands unconditional precedence. This cannot correctly represent a stair crossing levels. |
| `engine/kernel/src/structure_geometry.rs` | Already owns `Face { cell, axis }`, with positive-neighbor canonicalization, explicit faces, solid cells and support faces. Extend it; do not create a second boundary map owner. Walls currently produce bulk cells. |
| `engine/kernel/src/structure_support.rs` | Current wall column contacts assume cell walls. Replace wall contacts with edge contacts while retaining bounded rooted span calculation. |
| `engine/src/sdk/placement.ts`, `games/colony-building.ts` | Currently turn selected support cells into wall origins. Introduce an explicit edge target; do not overload orientation to hide a half-cell displacement. |

## A. One canonical physical edge

Cell centers are integer x/z. Cell `(x,z)` extends from `x-.5` to `x+.5`, and
`z-.5` to `z+.5`. Vertical spacing remains .54 m; a storey is four vertical
voxels, not one. Reuse the native `Face` convention: its cell is the lower-index
neighbor, its axis points to the positive neighbor. X/Z faces are vertical walls;
Y faces retain floor semantics.

Conceptual wire types (integrate into existing typed contracts, not a parallel API):

```ts
type EdgeTarget = {
  cell: readonly [number, number, number]; // lowest wall voxel, lower neighbor
  axis: "x" | "z";                       // face NORMAL, not wall tangent
};
type BuildTarget = { cell: Cell } | { area: CellArea } | { edges: readonly EdgeTarget[] };
```

Selecting the east edge of support `(x,s,z)` produces `{cell:[x,s+1,z],axis:x}`.
West produces `[x-1,s+1,z],x`; south produces `[x,s+1,z],z`; north produces
`[x,s+1,z-1],z`. Both sides therefore address exactly the same boundary.
Check overflow and existing coordinate/batch bounds using maintained parsers.
Normalize, deduplicate and sort requests before planning. Axis is not a facing;
a future door swing/hinge is separate content orientation.

For base voxel b and height h, a wall occupies vertical faces at b through
b+h-1. Its base world height is `(b-.5)*verticalMetres`; its top is
`(b+h-.5)*verticalMetres`. A floor at support index `b+h-1` meets that top.
Example: ground floor support 13, wall base 14, wall height 4, upper floor
support 17. Add this exact dimensional test; do not copy old column off-by-one
helpers uncritically.

Represent edge walls/apertures as canonical structure variants using this target.
Remove obsolete cell-wall shape consumers together in the new format. Floors,
fixtures and stairs retain their established coordinate conventions. Saved
canonical structures own edges; derived indexes are rebuilt after load and
updated through the existing atomic structure-change owner.

## B. Physical consumers must share the edge

```text
prepareStructureChange(current, proposal):
  validate canonical targets, duplicate boundaries, content and party authority
  derive candidate solids, boundary faces, support contacts and changed bounds
  validate support and actual occupied movement/work contacts against candidate
  prepare existing water/air geometry change and exact material settlement
  return prepared result; publish all through the existing Region transaction
```

Distinct queries remain distinct: bulk occupancy, traversal clearance, face
permeability and structural support. They derive from the same structure facts;
do not equate fixtures with airtight solids or visual rails with physical walls.

### Movement and work contacts

Trace `terrain_traversal.rs`, `terrain_route.rs`, `route_query.rs`,
`navigation.rs`, `structure_contact.rs` and their real movement callers.
Every route expansion and movement execution must use the same boundary-crossing
rule, including direct movement where it shares terrain. A closed wall blocks
crossing, not standing in either neighboring cell. Check the actor's traversed
height/clearance interval. A diagonal must not cut through the common wall corner;
validate both cardinal decompositions conservatively. Vertical steps/stair links
must check their swept crossing, not merely endpoint occupancy. Preserve A*,
Hungarian and bounded assignment/route work; no algorithm replacement here.

**September 15 audit: ordinary diagonal walking is still missing.**
`terrain_traversal.rs::step` rejects non-cardinal offsets;
`terrain_route.rs` enumerates four horizontal neighbors in both single-target
A* and shared multi-target search, and `admitted_edge` rejects diagonal edges.
The flat/frame route in `navigation.rs` also enumerates four neighbors using BFS
and rejects diagonal saved segments. Direct movement supports diagonals, but
`structure_geometry.rs::blocks_direct_decomposition` accepts either open
decomposition, which is weaker than the conservative corner rule above. This
is source evidence of an unfinished traversal contract, not an engine limitation.

Implement eight-neighbor walking across level supported terrain and flat support
frames. Keep one-voxel rises/drops and explicit stair links under their existing
swept rules; do not silently add diagonal climbs, jumping gaps or stair shortcuts.
For a level diagonal A -> D, both side support cells B and C must be traversable,
and A-B-D plus A-C-D must be open through the actor's clearance interval. Ordinary
walking and direct movement with the same body/profile use the same corner
policy. Preserve direct-control wall sliding where it remains legal.

Create one admitted-edge/successor operation consumed by A*, shared multi-target
search, route costing, movement validation and restore. Price the diagonal from
its actual metric segment using existing deterministic cost arithmetic
(`sqrt(sx*sx + sz*sz)` for cell spacing sx/sz); traversal consumes that distance
at ordinary speed. Existing terrain A* uses a Euclidean lower bound; preserve its
admissibility. Flat BFS cannot price unequal cardinal/diagonal lengths: use the
installed weighted search with the same edge law at that caller. Do not add
another assignment price or shortcut the rendered position across walls.

Extend the existing movement/crossing fixture to prove open diagonals, four
rotated blocked corners, unsupported side cells, actual distance/time, saved
mid-route continuation, topology invalidation and explicit stairs. Exercise the
same route through manual Go and automatic work costing. Retain current sprite
directions/animations; diagonal movement does not require new art or a physics
rewrite. This correction belongs to the current navigation/construction slice.

Transfers and attended work must not pass through a wall merely because Euclidean
reach succeeds. Extend the existing contact predicate for segment obstruction and
share it between contact candidates and final admission. A wall can be built from
either reachable side. Construction staging retains one actual container/contact;
do not teleport it or let builders reach through a completed boundary.
Completion that would intersect a body or invalidate required occupied contact
waits with an explicit reason using the existing work-attempt owner. Release labor
and reconcile cargo through existing rules; never lock a worker or roll back
unrelated jobs. Planned walls are intent, not physical obstacles. No available
worker is required to designate a wall.

### Water and gas

Audit `terrain_water.rs`, `terrain_water/field.rs`, `air_geometry.rs`,
`local_air.rs` and their face queries. Closed wall faces seal the relevant existing
transfers. An open aperture exposes only its declared opening interval. Reuse
current simple solvers and rebind owner. Boundary installation removes no cell
volume and must not invent water displacement, refill water or delete smoke.
Opening/removing a boundary wakes the existing affected local activity.
There is no room flood-fill, pressure solver or entire-world scan added here.

### Support

Use explicit edge contacts in `structure_support.rs`; do not pretend a wall fills
one adjacent cell. For this timber kit, either adjacent supported surface may
root the bottom edge. A supported wall top may anchor a floor on either adjacent
cell whose edge meets it. A stacked wall on the same edge may receive that contact.
This is the selected game construction policy, not a universal engineering law.
Groundless cycles cannot support themselves. Feed anchors into the existing
bounded span calculation and retain its configured span limits. Existing
deconstruction/occupied-support rejection stays atomic; collapsible roofs are
outside this packet. Do not change floor elevation when adding wall support.

## C. Human placement and neutral commands

Extend the existing XState gesture and shared placement acquisition owner with an
edge stroke. Keep the bottom build bar, persistent tool, ghost, cancel and repeat
placement. Do not add four separate wall buttons or another gesture registry.

```text
pointer on chosen visible support plane:
  project to that plane using the existing camera/metric owner
  choose nearest projected grid segment (screen-space distance)
  canonicalize segment to EdgeTarget; stable tie-break at vertices
pointer drag:
  lock stroke tangent from initial segment
  extend along its grid line, at the same chosen elevation
  produce inclusive edge list in canonical order
pointer up:
  submit that exact list through the existing GamePack command
```

First slice draws straight runs; connect additional runs by another drag. No
automatic L-shaped interpretation or room rectangle tool is required. Maintain
the existing batch bound. Ghost and submitted edges must match even with camera
zoom, negative coordinates, upper floors and reverse-direction dragging.

GamePack owns the Zod input and admission operation. Whistle publishes the same
standard semantic schema; headless controllers provide structured edge targets.
Use the accepted `@fungi.computer/whistle/wire` `parse` boundary; no local clone.
Local custom presentation binds the existing action/field to edge acquisition.
Planning accepts legal intent waiting for support/materials; completion enforces
actual readiness. Preserve typed accepted/waiting/rejected results and reasons.

## D. Original art as declarative render parts

An asset may have one or several parts, all under one physical entity. There are
no per-content zIndex constants. The recipe declares groups and local ordering
geometry; the baked artifact carries these declarations; a shared client owner
creates, updates and disposes its sprites. The sorter remains the sole rank owner.

```ts
// Illustrative authoring shape; names must fit the existing asset owner.
parts: [
  { id: "deck.lower", group: lowerDeck, geometry: lowerSurface },
  { id: "deck.upper", group: upperDeck, geometry: upperSurface },
  { id: "rail.left", group: leftRail, geometry: leftBoundary },
  { id: "rail.right", group: rightRail, geometry: rightBoundary },
  { id: "landing", group: landing, geometry: landingSurface },
]
```

These are local support polygons and upright boundary segments/height extents,
derived beside the original mesh dimensions. A named rail means model-left,
not permanently screen-front. Placement/facing transforms all part geometry by
the same transform as the art. The minimum useful role union is supporting
surface, upright boundary, ordinary compact/footprint object. No arbitrary
callbacks, saved ordering graphs or art-derived physical inventory/occupancy.

Do not freeze the above part count as a correctness claim. A long rail/support
crossing storeys may require segmentation where ordering reverses. Give separated
pieces stable IDs and disjoint mesh ownership. Keep adjacent pieces exactly aligned.
The main actor sprite can remain whole for the intended upright walk; do not
claim arbitrary interpenetrating 3D meshes are solved by this representation.

### Bake contract

Every facing uses the same camera, canvas, origin, scale and placement datum for
all its parts. Preserve all four stair facings and construction stages. Do not
crop and recenter each part independently. Transparent padding is acceptable;
any packing trims must carry exact offsets from the shared original anchor.

Preserve shared lighting and mutual shadows during export. The current post-bake
outline must not outline artificial partition boundaries. Establish the exporter
on one stair facing before broadening: render the original composite as a golden
reference, export mutually coherent part images, recompose without actors, compare
to that reference, then personally inspect at game scale. If using offline masks
to assign original visible pixels/outline to parts, they are export-only labels;
the runtime receives ordinary RGBA textures, no depth buffer. Do not expose hidden
surfaces that overwrite correctly visible surfaces on recomposition. Alpha edges
must neither double-darken nor leave seams. Dispose shared geometry only after all
part bakes; `renderBakeCanvas` currently disposes by default.

Extend the maintained static manifest/loader with validated part IDs, texture
references, shared datum and local geometry. Version the changed artifact format;
regenerate the real pack. Do not silently accept an old single-texture stair.
Single-part art goes through the same owner. Placement ghosts may compose the
parts together, but in-world parts must be siblings in the sortable container:
putting them all inside one independently sorted parent prevents actor interleave.
One entity owns selection, label/progress overlay, lifecycle and command identity.

### Ordering and picking contract

Retain existing spatial buckets, alpha silhouettes, stable IDs and static caching.
Extend their geometry representation rather than adding a second sorter.
World vertical extents must participate. A whole stair cannot be assigned the
entrance's scalar band, and an upper band cannot unconditionally hide all lower
parts. Bands index/filter relevant geometry; they are not proof that two
overlapping projections have a particular order.

Generate only geometry-supported ordering edges. A supported occupant draws above
its support surface; a rail boundary is compared with the actor's position on the
same sloped support frame. Distinguish a far rail from a near rail using transformed
geometry, not actor name, frame number, or a global rail-always-front rule. Actors
beside/behind/beneath the staircase must also sort correctly. Use existing
canonical support/pose information; add bounded read projection data if missing,
never recreate movement or stair progress in the renderer.

Keep deterministic topological ordering. Stable ties settle genuinely unconstrained
pairs; they cannot repair contradictory physical ordering. The acceptance scene
must have no contradictory required edges. Report those pairs and split/correct
the offending geometry rather than silently removing a required relation. A
general cycle fallback, if retained for unrelated supported art, is not acceptance
evidence for the new kit. Do not give every object a bounding box that invents
occlusion outside its actual footprint or an infinite extrapolated rail line.

Picking traverses final part order front-to-back and checks the corresponding
alpha silhouette, resolving to the owning entity. Preserve tool-specific surface
picking beneath furniture. Hidden cutaway parts cannot draw or intercept clicks.
Invalidate affected static parts after geometry/facing/level changes; update moving
actors locally. No per-frame rebake or all-world all-pairs comparison.

### Edge wall artwork

Retain timber materials, original plank character and scale. Author one edge
segment and connected endpoint joinery. Its one-unit length follows the edge;
its thickness straddles the boundary. Full floor tiles terminate under that
thickness, never half a cell beyond it. Canonical endpoint adjacency determines
straight/corner/T/cross/end joins, including across different build orders.
If a junction post is rendered separately, give it deterministic derived identity
and one visual owner so neighboring segments do not double-render it. Posts grant
no new structural support. Do not retain cell-neighbor masks that connect parallel
but physically unrelated edges. Test different finishes on opposite sides.

Do not collapse a whole segment to one of five labels such as `corner` or `t`.
That loses which endpoint owns the junction and which cardinal directions meet
there. The accepted presentation shape is one stage/axis segment sprite per
physical wall plus exactly one derived junction sprite per occupied grid vertex.
The junction key is the exact four-bit `+x,+z,-x,-z` incident-edge mask. Its
stable derived ID and position come from the canonical vertex; it is nonphysical
and non-pickable, and it grants no seal, support, occupancy or authority. Choose
its visible construction stage deterministically from its incident sites. This
requires six segment bakes and forty-five junction bakes, rather than hundreds of
whole-segment combinations, and neighboring walls cannot double-render a post.

## E. Saves, authority and release

The wall representation change is a breaking physical format change. Version it
and reject unsupported saved formats clearly; never reinterpret a centered wall
as an arbitrarily chosen edge. Preserve existing world bytes/old deployment for
recovery. No automatic migration, reset or overwrite is authorized by this packet.
Prove new-current-format save/reload, command replay and DO restart. At release,
state the old-world limitation explicitly; continuity of old worlds is not proved
by fresh-world success. If preserving old-format play in the new runtime becomes
a requirement, return that product conflict to the lead instead of adding a shim.

Player/party command ownership and existing server admission remain unchanged.
An edge is a world-space target, not a permission. Two clients submitting the same
boundary cannot create duplicate structures or spend resources twice. Observation
and reconnect must show the same committed plan/result. Derive capabilities from
GamePack and use the existing connection; no new socket or registry.

Read `DEPLOYING.md` and the actual receipt state before publishing. Earlier in this
session the `clearing-garden` alias served stale bytes despite successful upload;
`clearing-playable` was used as an exact-byte interim and the backend allowed only
one frontend origin. These are historical observations, not current-state proof.
Inspect deployed versions, actual alias bytes and CORS before changing anything.
Do not switch the backend origin back and forth while Levi is playing. Prepare a
coherent pair and retain exact rollback. The original goal's final public target
remains `clearing-garden`; do not quietly substitute another URL as completion.

## F. Bounded implementation sequence

0. Repair the confirmed performance-page startup regression described below as
   the first small independent correction. It must not wait for edge-wall work.
1. Lead freezes this coordinate/ownership contract. Inventory actual callers of
   wall variants, face seals, support contacts, saved formats and client targets.
   Record exact file custody in the existing packet; no new board/framework.
2. One native/contract writer implements canonical edge structures, support and
   all physical crossing/contact consumers, current format and focused laws.
   First review: one edge separating two walkable cells, correct water/air face,
   and upper floor support. Continue its remaining bounded outcome after review.
3. One client writer, after the target contract is pinned, implements edge gesture,
   GamePack inputs, Whistle binding and ghost/read projection. Couple shared
   contract edits serially with step 2. No second command definition.
4. Lead handles original art grouping and bake review. A Luna implementer can
   carry the frozen manifest/client part lifecycle and sorter tests. First review:
   one stair/facing with actor between rails and exact empty recomposition. Then
   finish all facings/stages/cutaways and connected wall art. Shared client edits
   from steps 3/4 have one writer at a time or explicit nonoverlapping custody.
5. Add the bounded terrain surface/cliff outcome in section I after the shared
   geometry and art contracts are reviewed. It must not hold the independent
   performance-page repair or a coherent playable repair release.
6. Integrate coherent pinned chunks and run affected laws/types/Fallow. Build the
   actual artifact, inspect one bounded room interaction scene, correct defects,
   then publish/read back the pair and run the changed hosted interaction.

Use isolated worktrees. Luna gets mechanical implementation, tests and corrections
with exact files/contracts; the lead owns unresolved geometry/ordering decisions,
source acceptance, original art review and serial integration/proof/publication.
Do not delegate this document's unresolved first-render acceptance as permission
to invent a different renderer. Review evidence, not checkpoint prose. No main
merge, dependency installation in another lane, unrelated demo or stopped editor
matrix. Automated checks use the maintained `run-proof.sh`, and every owned
process/listener must be collected and closed.

## G. Acceptance ledger to complete with actual evidence

Record source pin, command/result and evidence path against each row. Unit tests
alone cannot satisfy visual or hosted rows. Write focused tests through real
owners; do not fabricate a parallel demo renderer or physical boundary engine.

| ID | Required proof |
| --- | --- |
| E1 | Opposite-side edge canonicalization, negative coordinates, reversed strokes, duplicate request, checked bounds; one identity and one material cost. |
| E2 | Closed boundary blocks cardinal/diagonal/direct/stair crossings at affected heights; adjacent cells remain usable. Opening/removing permits the correct crossings. Saved route and executing route agree. |
| E3 | Water and smoke cannot pass closed faces, can pass the opening/removal, and conserve their existing accounting; no cell-volume displacement or whole-world work. |
| E4 | Ground/stacked wall support, upper floor at exact top, configured floor spans and unsupported cycle rejection. No changed floor/fixture datum. |
| E5 | Designate without free worker; build from reachable side; no transfer through wall; contact loss returns waiting and releases labor with real cargo retained. Two workers retain independent delivery portions. |
| E6 | Same-level snapped ghosts equal command edges; straight runs and corner/T/cross/end joins; repeat/cancel, zoom and upper-level targeting work in actual UI. |
| A1 | Recombined original stair parts preserve appearance, lighting, outline and anchor; all four facings and construction stages. No per-pixel runtime resource. |
| A2 | Real moving actor at entrance/mid-ramp/landing between rails, plus beside/behind/beneath stair; upper floor contact, rail overlap and cutaway correct in each facing. Personally view captures/motion. |
| A3 | Finished room floor reaches each wall, clean corner/door joins, no exterior half-floor, no foundation poking through; bed/brewer/floor replacement intact. |
| A4 | Permuted input order identical; no contradictory required edges in room; static invalidation, moving locality, geometry extents and part lifecycle/disposal tested. |
| A5 | Picking agrees with visible front part, returns one entity, preserves furniture-underfloor tools and party-owned actor selection; labels/progress render once. |
| R1 | Existing Draft/Go/Undraft, drag-dig, building/furniture, finite water and layer controls in actual Clearing; intact trees/people/animation. |
| R2 | Two actual clients own distinct parties, see the same boundary/build result; denied other-party command and duplicate retry are safe; current-format reload/DO recovery preserve exact state. |
| R3 | Focused work counters/timing show no restored all-pairs/per-frame bake/world scan. Exercise moving actors and active construction, not idle-only capacity. |
| R4 | Clean accepted source, artifact inventory, client/backend versions, rollback, immutable AND public alias HTTP parity, actual connection and desktop/narrow rendering. Disclose old-format disposition. |

Completion means the playable room and the original Clearing goal are both true.
Do not call a local test stair, a successful upload, or deterministic-but-wrong
sorting the finished outcome.

## H. Confirmed performance-page startup regression

Levi reported every performance page blank at
`https://clearing-playable-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony-performance`.
September 14 HTTP inspection returned 200 for the page, its entry bundle, shared
client JS/CSS and performance worker. The served entry names
`colony-performance-Da_m2C99.js` and `browser-client-DSrSn9Y4.js`.

The exact source chain explains a synchronous startup failure:

```text
performance-page.js -> createHiveClient(mode = colony-performance-64-8)
client.js -> packs[mode] from { colony, survival, formations, pirates }
          -> localBindings(undefined)
whistle-runtime.js -> pack.commands
TypeError: Cannot read properties of undefined (reading 'commands')
```

The real imported `localBindings(undefined)` reproduces that exception. This is
source/runtime-function evidence, not a captured browser console. The lookup
occurs before HUD/canvas creation and before the client's asynchronous startup
catch. Every size/worker preset uses a name absent from the table. The current
`performance-page.test.js` checks source strings and cannot detect this defect.

Correction: the page composition root supplies its local presentation bindings
explicitly to `createHiveClient`; the shared renderer must not know a fixed list
of games. Remove the client-owned four-pack registry and pack imports, update all
actual `createHiveClient` callers together, and derive bindings from the actual
owning command definitions. For the performance variant, use its exact runtime
game ID as the Whistle namespace while sharing Colony command definitions. No
prefix matching, fallback to Colony, `pack?.commands` empty-control workaround,
duplicated handler or second command registry. Do not instantiate a second local
simulation merely to obtain presentation metadata.

Qualify an arbitrary composed game identity and all performance preset namespaces
through the shared bindings owner; check exact command IDs against published
capabilities. Add a bounded actual served-page startup check that observes canvas,
rendered terrain/workers and advancing workload rather than merely HTML or source
strings. Verify preset navigation and worker slider. Start with the reported
default, then cover size routes without claiming population capacity from those
startup checks. Preserve size/worker selections and existing performance meaning.
No performance improvement claim follows from repairing startup. Record any
subsequent runtime error separately and correct it before calling the page usable.

## I. Coherent terrain patches, dual-grid transitions and readable cliffs

Levi accepted this as part of the existing terrain/edge/art work on September 14.
The desired clearing has grassy areas, bare earth, rocky places and damp low
ground, not independently randomized checkerboard tiles. This is a bounded
landscape improvement, not permission for another environment simulation.

### Owners and generation

Read the maintained Rust generator, terrain queries and current terrain-layer
consumer before changing their contracts. Extend the existing versioned generator;
do not generate a competing world in the renderer. Use seeded, spatially coherent
variation together with existing elevation/material/water facts to choose patches.
Separate actual soil/stone material from decorative surface cover. Exposed rock
must agree with the material queried by digging; grass tufts do not create items.
Do not invent moisture accounting just to color damp ground. Use an existing
authoritative moisture fact where available; otherwise describe generated wetland
appearance honestly, without claiming live saturation. Gameplay changes follow
the existing terrain/environment mutation owners.

Same seed, version and coordinates must produce identical results regardless of
chunk request order. Sample neighboring cells across chunk boundaries rather than
restarting patterns at each chunk. Preserve edited terrain and current-format
reload. A generator/format change cannot silently alter an existing world's land.
No preset hearth, settlement or building is required to produce attractive land.

### Art and transitions

Reference: https://github.com/jess-hammer/dual-grid-tilemap-system-godot
(Jess Hammer's implementation accompanying the video Levi supplied). Its binary
four-cell choice has 16 combinations; that does not mean 16 assets cover arbitrary
mixtures of grass, dirt, rock, heights and water. Implement independently through
our original Three-to-Pixi authoring/bake owner.

Keep physical voxel cells unchanged. Derive offset display patches from four
neighboring same-surface cells; select their transition artwork with a stable
four-corner mask. Start with a base material and grass cover transitions, then
rock/bare-earth treatment with explicit deterministic layer precedence. Avoid a
combinatorial tileset for every material mixture. Author consistent inner/outer
corners and resolve diagonal-only contact consistently without changing movement.
Do not smooth a transition across incompatible heights or bridge a real hole.
Keep fixed lighting: rotating a logical mask does not justify rotating baked
shadows. Root personally reviews representative original-art renders.

Real exposed cliff faces receive a restrained grass lip at an actual grassy top,
darker earth/root trim and soil/stone sides matching the underlying material.
Straight edges and inside/outside corners must join; stacked drops must not repeat
a grass cap on every buried voxel. Dig/fill and layer changes invalidate affected
terrain artwork through the existing cache owner. A cutaway through solid ground
gets a readable section, not a fabricated grassy cliff. No decorative physics,
extra blocking geometry, per-pixel runtime depth or separate edge registry.

The tree erased by terrain in Levi's screenshot remains a separate ordering
defect to diagnose against the actual terrain/subject sorter. Edge art cannot
conceal that bug or count as its correction.

### Sequence, bounds and proof

First review one scene containing coherent grass/dirt/rock patches, a straight
cliff, inside/outside corner, dug notch, two elevations and trees on both sides.
Then apply the same definitions and renderer to the actual Clearing. Reuse chunk
residency and visible terrain caching; no whole-world scan or tile regeneration
every frame. A changed cell invalidates its dependent display patches and exposed
faces locally. Rendering these transitions never advances water, gas or work.

Record focused evidence for seed/request-order determinism and chunk seams;
all binary masks plus representative three-material contacts; digging/filling and
cutaway updates; intact tree occlusion and matching picking; unchanged material
queries; current-format reload; bounded rebuild counts and personally viewed art.
Unit mask checks alone are not visual acceptance.

Traffic-worn paths and future routes between generated encampments share this
surface presentation but are follow-on outcomes. Paths must follow actual traffic
or authored/generated route intent, not appear because the renderer guessed one.
Do not add encampments, a road planner or a wear simulation to finish this slice.
Neither future feature blocks the current repair release. Record this limitation
explicitly rather than claiming this terrain slice implements path wear.

### Generated ground details and reserved mushroom gameplay

Levi's follow-through: restore the small ground details of the original clearing,
but do not scatter mushrooms as decorative filler. Read the accepted mushroom
contracts in `docs/decisions/home-expeditions-and-living-world.md` (accepted
direction 8 and mushroom knowledge proof), `a-home-between-realms.md` (daily
novelty and stored strains), and `living-world-system-contracts.md` (horticulture,
substrate, strain provenance). Paths above are relative to the repository root.

Source checkpoint: `src/art/terrain-columns.js::groundCover` already deterministically
derives cosmetic color/tufts from coordinates and batches them with changed
terrain chunks. It is not a general ground-detail definition system. The native
`generation.rs` produces geology, wet/cave and terrain facts, not mushroom batches.
`engine/src/sdk/common.ts::ResourceSite` and native `components.rs::ResourceSite`
carry definition/stage/nextDue; `colony-environment.ts` uses the shared lifecycle
for mugwort. `colony.ts` projects positioned sites through definition-owned art.
These are reusable foundations, not completed mushroom support: current site/lot
projections do not express fixed strain/effect/batch provenance, identification
or cultivation. Existing tree instances are supplied by Colony initial content;
they do not demonstrate generic generated living-site admission.

Keep two explicit consumers over the same terrain facts and original art:

- Cosmetic litter, tiny embedded stones and non-harvestable grass: bounded,
  seeded placement/variant selection in the existing terrain presentation owner.
  Content definitions specify allowed surface, density, spacing and an existing
  baked visual family. Replace hardcoded cosmetic choices as this consumer lands;
  do not create a parallel scatter renderer. Rebuild on terrain changes; do not
  draw tufts floating over a dug hole or through floors. Decoration has no tick,
  item quantity, harvesting claim or shadow simulation.
- Harvestable/living ground objects: generator proposes a stable site identity
  and authored definition; the existing authoritative world owner admits it once.
  Growth, removal, outputs and depleted-state persistence remain world facts.
  On revisiting a chunk, reconcile the site's committed state, not fresh noise.
  Reuse resource-site work and material custody where their laws fit; add the
  missing strain/batch/knowledge facts explicitly before claiming mushroom play.

Procedural art means stable parameters/variant selection over an owned original
builder, not new Three geometry for every mushroom every frame. Cosmetic detail
can use a small baked bank. A gameplay mushroom's appearance is selected from
its committed batch/strain facts; picking and controller observations refer to
that same identity. Hidden effects remain hidden until the knowledge rules allow
them. Sampling reveals an existing effect; it does not reroll one. New cultivated
physical batches retain strain provenance. Fungi are separate from the substrate
they consume, not a texture flag on a log.

For this art slice, reserve mushrooms and ship only non-gameplay surface detail.
Later ground-detail acceptance must cover seed/chunk-order stability, bounded
instance counts, removal after dig/build, no respawn on reload, and matching
physical/presentation identity for interactive sites. No generic ecology framework
or complete mushroom economy is required to finish the current rendering repair.

### September 14 personal art/consumer checkpoint (partial, not a release)

Root reviewed the joined client in `clearing-edge-integration` and corrected
three defects that synthetic between-two-rails assertions had missed:

- Multipart points now follow the original Three positive-Y bake rotation.
  The prior client used the opposite rotation on east/west baked facings.
  The maintained test compares all declared stair points to `localToWorld`
  on the actual original builder, including translation/placement offset.
- Upright relationships compare the actor and camera sides of the finite
  boundary, preserving endpoint reversal. Normalization retains vertical
  extents; `partRole` changes invalidate the static cache. Supporting planes
  distinguish an actor on a ramp from one underneath it.
- Full floors use the existing definition-owned floor role in sorting, below
  same-level wall/furniture/feet; an upper floor keeps its storey ordering.
  Physical edge placements now reach the real art-placement, sorting and
  structure-surface callers without being mistaken for a stair or furniture.

Root authored the edge timber kit over the original colors, grain, nails and
stone footings. Six stage/axis segments plus 45 stage/mask posts are baked into
ordinary Pixi art. The exact physical endpoint incidence owns junction identity;
posts are still client-only and non-pickable. Root personally viewed the original
Three room and actual Pixi assembly for stakes/frame/finished, and the original
Rowan sprite on entrance/middle/landing at all four baked stair facings.

Evidence in this worktree's preserved `.botanical`:

- `run-u7940` drawing: exit 0, 84 tests. Later corrected the synthetic test to
  use the real bake rotation and added explicit floor ordering coverage.
- `run-u7948`: 19 focused sorter/multipart tests passed; combined command exit 2
  from the broad `engine/tsconfig.json` check. That includes missing generated
  WASM declarations, missing Node test typings and existing test-fixture type
  errors. This is not a full engine type pass. The actual changed typed edge
  projection/connection consumers passed strict `tsc` separately in `run-u7959`.
- `run-u7945`: maintained complete bank exporter exit 0, 1,868 textures.
  Manifest SHA-256 `eb8f6eac2b0492244944e952a68eb5cebf7ea7ad652d2b738f9e12a282d34150`.
  Inventory contains the new original `src/art/edge-wall.js` and its exact hash.
- `run-u7956`: actual Pixi stair assembly and all 12 stage/facing empty
  recompositions pass, zero differing RGBA bytes in either part order.
  `stair-sprite-review/stairs.png` and `orders.json` retain the viewed result.
- `run-u7951`: actual Pixi wall/floor assembly exit 0; personally viewed
  `wall-sprite-review/walls.png`. This is a local assembly, not hosted gameplay.
- `run-u7954`: touched audit exit 1, retained at `root-art-review/fallow.json`.
  Existing client draw/HUD/gesture and sorter graph hotspots remain; new upright
  comparator is CC15/cognitive11, edge kit functions CC10/cognitive17. It also
  reports the unused `stableKey` export, unresolved generated WASM and tool
  dependency findings. No suppression or deletion of unrelated owners followed.
  This is not a clean Fallow gate.
- Proof-harness failures retained: `u7941` bare Pixi import, `u7949` incomplete
  proof binding composition, `u7953` Fallow flag spelling; corrected harnesses
  reached the results above. No live deployment was attempted.

The next root checkpoint added `timber-door` as real aperture content over the
same canonical edge target, construction/material owner and connected-junction
presentation. The first playable door is built open and rendered with a visibly
swung leaf; it is therefore immediately traversable, while the existing native
open/closed state still owns traversal, support, water and air. Designation needs
no selected or idle worker. It is not yet a player-facing open/close interaction.
Adding that interaction requires projecting authoritative aperture state; it must
not infer state from art or reintroduce worker-coupled designation.

Edge stroke lifetime now belongs to the existing XState controls owner. A rejected
oversized drag atomically commits no prefix and exposes its reason to the HUD.
Forward/reverse acquisition, cancellation and single completion passed in
`run-u7974`. The first reviewer shape silently committed the last valid prefix;
that rejected `u7973` result and its correction remain explicit.

The edge ghost consumer is also content-driven: it resolves the selected
GamePack catalog through the existing placement definition, while the shared
gesture only supplies canonical edges. This removed the wall-only ghost path, so
a door previews as a door without teaching the renderer catalog names. The joined
drawing set passed 89/89 in `run-u7985`. Root viewed the regenerated ordinary Pixi
room in `run-u7988`; both door axes join the wall kit and full-cell floors at all
three construction stages.

Root personally viewed both door axes in the original Three room at every stage.
`run-u7964` produced the accepted images after `u7963` honestly failed for a
missing browser library path. `run-u7968` regenerated the maintained v6 bank with
1,874 textures; manifest SHA-256 is
`bc03df2f43dd8b7652b69a0647ff65f0986660c905e19e837a939544f8045761`.
The six door entries, current-bank consumer, edge construction and junction laws
passed with the other drawing checks in `run-u7972` (87/87); `u7971` retains the
incorrect first junction assertion. Native aperture/support/water/air/restore
checks passed 8/8 in `run-u7976`; inherited Rust warnings remain disclosed.

Still required before whole-packet acceptance: changed native WASM/DO pairing,
actual Clearing room/party/save interactions, performance-page workload/render
checks and coherent alias publication/readback. Full A2 beside/behind/beneath
rendered interaction and upper-floor/cutaway coverage remain; local image samples
and the underneath-plane law do not establish that entire row. Do not call
mechanics complete or substitute these assemblies for the playable goal.
