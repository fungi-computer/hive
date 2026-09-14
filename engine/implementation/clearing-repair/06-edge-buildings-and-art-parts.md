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
5. Integrate coherent pinned chunks and run affected laws/types/Fallow. Build the
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
