# Structural renderer replacement: implementation packet

Date: September 22, 2026. Integration owner: root/Game CTO.
Source baseline: `be5085f8` on `engine/world-view-repair-20260922`.
Working repository: `/home/levi/src/hive-worktrees/world-view-repair-20260922`.

This packet is for an implementer who needs explicit steps, boundaries and checks.
Read it completely before editing. It specifies a replacement in the real game,
not a new rendering study. It does **not** claim the proposed mixed-picture order
is proven. The early art gate below exists to find a counterexample cheaply.

## 1. Mission and authority

Make the existing Pixi game responsive while eight actors work, terrain arrives,
and the player pans, zooms, rotates and changes terrain cuts. Preserve the original
baked art and upright, mowable grass. Demonstrate the same visible workload in
64- and 256-wide worlds on the actual Cloudflare DO test backend.

Replace dense geometric ordering with retained terrain pictures, a structural
voxel/cover traversal, and bounded placement of sparse actors/props. Remove the
superseded production paths as their callers migrate.

This packet and report 19's system-review recut supersede report 19's older
relation-retention sequence and conflicting graph requirements in packets 15–18.
Those documents and old proofs remain evidence. They are not additional active
implementation queues. The original acceptance requirements in the active goal
remain binding; this packet does not lower them.

Do not make simulation, asset style, networking or renderer-library changes to
make rendering easier. Do not infer physical state from a drawing cache.

### Non-negotiable constraints

- Keep Pixi and the original Three-to-baked-image asset pipeline. No live Three
  renderer, alternate game route implementing a different renderer, or art rebake.
- Keep authoritative DO simulation and WebSocket terrain transport.
- Keep exact material residency, explicit unknown coverage, cuts/cavities, and
  authoritative per-cell cover state. Do not substitute a heightmap for the world.
- Keep original grass RGBA pixels. No flattening grass onto ground, clipping away
  upright blades, replacing it with dots, or using separate front/back blade layers.
- Mowing changes cover state/masks through the existing physical operation. It
  must not merely hide presentation sprites or mutate the renderer's private map.
- Keep accepted approximate whole-picture overlaps. Do not solve arbitrary
  intersecting sprite geometry, infer fragments from opaque pixels, or require
  perfect bed/cat intersections as a condition of shipping.
- One world-view owner publishes pictures, order, picking and displayed view.
  The client/game supplies facts and requested UI choices, not renderer internals.
- Camera-only input immediately transforms the published scene.
- No generic overlap graph, opaque-rectangle pair refinement, polygon clipping,
  topological sorting or cycle repair in the replacement production ordering path.
  This also prohibits a renamed or recursively rebuilt "local" version of that graph.
- Existing meaningful authored parts/support compounds are allowed. No branch on
  a bed, grass species, stair content ID, actor name or particular fixture coordinate.
- No main merge, production backend deployment, new purchase or dependency install.
  The separate `hive-performance-engine-preview` backend was explicitly authorized.

## 2. What went wrong; do not repeat it

Packet 15 already prescribed visible-cell traversal and explicitly said not to
restore the pair graph. Packet 17 introduced a general geometric relation compiler;
packet 18 integrated it. Later work retained and scheduled that compiler rather
than rejecting the cost of its representation.

The first staged hosted run is negative evidence:

- Report: `.botanical/world-view-joined-proof-1/REPORT.json` in the repair worktree.
- Guard `u3167`, invocation `dc7c3e8ccd2346b6854a32ad77947b30`, exit 1.
- Assets/runtime ready around 3.395 seconds from navigation.
- Visible receipt around 4.794 seconds; padded receipt around 5.091 seconds.
- 48 material patches, about 766 KB terrain transport; no HTTP terrain fan-out.
- Around 47 seconds: only 59 published actor/prop records, no useful published
  ground; pending ordering had executed 576,601 operations in 576,603 advances.
- Around 77 seconds that job was still pending. Live DO work passed; loading,
  travel and cut acceptance did not. The failed interaction setup does not prove
  good input latency.

Per-operation scheduler overhead is real, but batching those calls is not this
replacement. Do not spend the next checkpoint optimizing the old compiler.

Source-confirmed waste:

1. `terrain-picture-owner.js` includes camera-plan identity in geometry reuse.
   On a plan change it can re-expose/reproject faces and then replace newly built
   records with the old record having the same ID.
2. `terrain-visibility.js` turns known grid faces into general geometric records;
   the compiler subsequently validates/projects that geometry again.
3. Grass already carries four support cells, but the compiler does not use its
   surface-root structure to establish traversal order.
4. Parallel upright card pictures can enter alpha-rectangle refinement and a
   general relation graph. Alpha is useful for picking, not for discovering an
   order already determined by the admitted structural representation.
5. A correct small fixture and passing unit laws were mistaken for sufficient
   architectural evidence before a real visible-world workload was qualified.

## 3. Read these actual sources first

Read implementations and immediate callers, not only names or this table.

| Responsibility | Current sources | Treatment |
| --- | --- | --- |
| Current intent and negative evidence | Report 19, report 20, active goal attachment | Preserve scope; report 20's unrelated platform work is not this slice |
| Game frame, controls, diagnostics | `engine/src/client/client.js` | Keep UI/gesture authority; simplify its existing world-view call |
| Camera, candidate lifetime, publication | `world-view-owner.js`, `camera-geometry-owner.js`, `world-view.js` | Keep the owner and coordinate contract; replace dense ordering underneath |
| Camera demand and material residency | `camera-coverage-owner.js`, `terrain-region-cache.js` | Keep coverage/eviction/unknown laws; do not add another material cache |
| Terrain pictures and presentation | `cut-terrain-layer.js`, `terrain-picture-owner.js`, `terrain-visibility.js` | Replace representation and invalidation at these owners |
| Material slabs/exposure | `engine/src/runtime/terrain-region-materials.js`, `engine/src/runtime/terrain-region-exposure.js`, `engine/src/runtime/terrain-presentation.ts` | Keep v5 data authority; reuse/replace exposure operation deliberately |
| Original terrain pictures | `terrain-face-appearance.js`, `src/art/living-terrain-pack.js`, `src/art/living-terrain.js` | Preserve texture selection/UVs/anchors and art bytes |
| Dense compiler being removed | `spatial-scene-owner.js`, `spatial-draw-order.js`, relevant `plane-order.js` callers | Identify removable responsibilities; do not wrap it |
| Actors and authored parts | `actor-presentation-owner.js`, `subject-draw-records.js`, `multipart-visual-owner.js`, `art-placement.js` | Keep staged display lifetime and canonical asset placement |
| Existing geometry facts | `draw-record-facts.js`, `asset-draw-geometry.js`, checked static pack metadata | Extract bounds/support without alpha ordering proxies |
| Batch resources | `terrain-face-batches.js` | Retain buffers/runs; do not regenerate every terrain buffer per moving actor |
| Published picking | `voxel-draw-picking.js`, geometry owner, `surfaceSubjectFromOrdered` | Keep one published order; preserve real alpha/ground semantics |
| Existing original-art fixture | `spatial-render-fixture.js`, review page, real-art tests | Useful art evidence; does not replace actual colony acceptance |
| Hosted acceptance | `tools/public-engine-host/world-view-browser-proof.mjs` and its README | Review/run; driver syntax alone is not qualification |

File paths in table without a prefix are under `engine/src/client/`.

Before assigning work read current `AGENTS.md`, current-status sprint section and
Game CTO skill. Respect isolated writer branches and custody. The original
`/home/levi/src/hive` checkout is not the active integration lane: do not overwrite
its unrelated dirty source. `engine/generated` in the repair lane is a symlink to
existing generated output; do not commit or delete it.

## 4. Concrete module boundary

Keep `createWorldViewOwner` as the only game-facing owner of the displayed world.
Its public shape already exists; do not invent an engine plugin or universal ECS.

```js
worldView.updateTerrain(authoritativeTerrainObservation, epoch);
worldView.frame({
  facts: interpolatedDisplayFacts,
  selectedIds, art, paused, frameSequence,
  view: requestedView, screen,
});
// Published facts, not half-prepared inputs:
state.subjects = worldView.subjects;
const displayedOrder = worldView.records;
worldView.preview({ guide, ghost, art, placementStatus });

// Input handlers perform no extraction, sorting or uploads:
worldView.camera.move(dx, dy);
worldView.camera.zoomBy(delta, pointer);
worldView.camera.rotate(quarterTurns); // request; adopt coherently when prepared
```

Internal ownership:

- Material residency owns received facts, invalidation, bounded payloads and
  missing-region requests. A picture job cannot delete canonical received data.
- Terrain picture owner owns derived chunk pictures and their local cover updates.
- Structural painter owns traversal/placement, retained ordering data and picking
  publication. Prefer replacing the existing spatial owner/module in place;
  rename only if it makes responsibility clearer and migrate all callers together.
- Actor owner owns Pixi actor/part objects, animation history and staged writes.
- Batch owner owns geometry/buffer allocation, reuse, retirement and disposal.
- World-view owner owns the single pending successor and the publication barrier.

The caller must not reset internal maps, pass a second projection/depth contract,
walk chunks to coordinate cleanup, or manually synchronize picking after paint.
The top owner may coordinate its private children; that is its responsibility.

## 5. Data representation: facts versus pictures

### 5.1 Facts that must survive camera changes

Retain material protocol v5: checked 8×8×128 slabs with their admitted clipped halo,
explicit material runs, known air, exterior cover observations and coverage identity.
Current worlds fit one vertical slab; do not hardcode that assumption. Chunk,
material revision, epoch and cut have different meanings.

- Camera pan never invalidates material facts.
- Rotation never requests already resident material again just to change the view.
- A cut queries missing slabs only when its required material coverage is absent.
- Unknown neighbors do not become air and cannot manufacture exposed faces/grass.
- A material edit invalidates affected core/halo derivatives, not unrelated chunks.
- Offscreen is not offsimulation. No rendering operation pauses world work.

### 5.2 Retained derived pictures

A chunk's derived geometry key must not contain viewport position or camera-plan
object identity. Use explicit canonical identities, conceptually:

```text
(epoch, immutable material patch identity/revision,
 cut exposure level, camera quadrant, art/scale convention)
```

Cover has its own local revision/mask changes. Do not invalidate earth body quads
because grass was mown or water volume changed.

Keep packed quad data or compact immutable quad records with only what drawing,
local insertion and picking need. A transition can reuse today's `terrainBatch`,
`projected`, `cell`, `face`, UVs and stable IDs to get the first slice into the real
game; it must stop constructing generic plane proxies/alpha-order geometry.
Do not require a typed-array rewrite before measuring the structural replacement.

Example conceptual data, not a required public API:

```text
TerrainQuad {
  stableCellFaceId, cellXYZ, faceKind, materialSlot,
  traversalKey, atlasStyle, screenQuad, uvQuad,
  localVisualBounds, compactGroundHitDescription
}
CoverQuad {
  stableRootAndHeightId, rootXZ, supportLevel,
  fullAuthored2x2Footprint, occupiedSupportCells,
  coverState, mask, traversalKey,
  atlasStyle, screenQuad, uvQuad, originalAlphaHitArea
}
```

Store picking metadata once at its owner. Do not retain simultaneous generic
world-face objects, projected proxies, copied signatures and compact records as
permanent parallel truth. Temporary migration adapters must be removed by the
final consumer cutover.

### 5.3 Caching bounds

Do not retain every historical cut/view. Keep one published candidate and one
pending successor, with bounded chunk derivatives. Start with current-view
retention; cache additional quadrants only if measured and explicitly capped.
Received slabs and cached pictures have separate limits and metrics.

On eviction retire derived data and GPU resources that no published/pending view
borrows. Candidate cancellation must destroy only candidate-owned resources.
Shared atlas textures are released only by the art owner at world disposal.

## 6. Structural terrain ordering

### 6.1 Coordinate law

Use the actual orthographic projection and camera quadrant. For this camera, all
three view-ray components have fixed nonzero signs and the ray points downward.
For quadrant traversal define horizontal camera-facing coordinates:

```text
u = -sign(projection.direction.x) * cell.x
v = -sign(projection.direction.z) * cell.z
```

For camera on +X/+Z, farther cells have smaller `u + v`. Emit back-to-front.
An initial structural cell key to validate is:

```text
(diagonal = u + v, height = cell.y, lateral = u - v)
```

The complete initial dense-record key is:

```text
(diagonal, cellHeight, phase, lateral, stableRecordId)
phase 10 = camera-facing X side
phase 11 = camera-facing Z side
phase 20 = top/cut cap
phase 25 = admitted water surface at its own containing-cell height
phase 30 = rooted cover at its fixed camera-front footprint cell/support height
```

Phase precedes lateral: same-diagonal/same-height ground must not paint over
cover merely because a neighboring cell has a later lateral coordinate. The
three-component cell key above explains geometry; this full record tuple is the
actual comparison used for pictures.

X/Z here are world axes after selecting the camera-facing side; they do not mean
fixed east/south in every quadrant. Backfaces are not emitted. Water retains its
actual projected fill height; the phase only resolves its structural placement,
not its physical geometry. Qualify the water/bank cases before accepting that rule.
The top-over-side tie preserves cap/contact appearance at shared boundaries; it
is a declared picture convention, not a per-pixel occlusion proof for outlines.

Use explicit tuple comparison; never squeeze unbounded signed coordinates into
an unchecked integer bitfield. Stable ID is only the final unresolved tie. The
phase is structural orientation/attachment, never caller array position.

The geometric reason this works for **disjoint axis-aligned unit grid cells** is
monotone ray traversal: cells whose projected interiors occlude one another occur
in a consistent order along the camera-facing axes. Same horizontal-cell heights
paint bottom-to-top. Establish this with an independent small grid/ray oracle;
do not merely test that the comparator returns its own expected tuples.

This is not a proof for arbitrary sprite images, authored outlines beyond a face,
water volumes, or an entire tall prop treated as one cube. Those are addressed
separately below. Do not use screen Y as a substitute for this world-space law.

### 6.2 Exposed faces

The existing exposure operation is a correctness reference, not necessarily the
final hot path. For a fixed downward quadrant only the top and two facing side
orientations can contribute. Buried cells need no draw records.

For the first structural-order checkpoint, it is acceptable to retain the checked
existing exposure operation **once per material/cut derivative**. First remove the
dense graph and camera-triggered re-extraction. Then replace per-buried-voxel six-
neighbor scans with differences between known material/solid run intervals if
measurements show extraction remains material to load/cut cost.

A run-based implementation must preserve:

- material transitions on exposed surfaces;
- internal cavities and overhangs, not merely highest solid column;
- cut cap identity at the requested level;
- core versus halo face ownership;
- unknown and world-boundary behavior already covered by laws;
- vertical slab boundaries and the above-cut neighbor needed to determine caps.

Keep the exhaustive reference oracle in tests if useful. Remove duplicate running
production algorithms after qualification. Do not allocate all cells of a larger
world to make an exposure query convenient.

### 6.3 Chunk storage is not chunk paint order

A chunk is a residency/cache unit, **not necessarily an indivisible draw unit**.
Two isometric chunks can interleave on screen. Drawing each whole chunk by its
center is not this plan and can recreate diagonal seams.

Build sorted cell/quad runs inside chunks. Merge runs by the structural key to
form the visible stream. A bounded k-way merge or retained row/diagonal buckets is
sufficient; do not reconstruct pairwise terrain relations.

Initial cold preparation may visit all admitted visible quads. Unchanged pan
inside prepared coverage must reuse their geometry/order. Changing membership
merges entering/leaving runs; it does not re-extract retained chunks. Actor motion
must not rebuild the structural terrain order.

## 7. Grass policy: early go/no-go, not a proven theorem

### 7.1 Existing semantics

A dual-grid patch uses up to four same-level support facts to choose a mask. Its
image includes a horizontal base and upright blades. It is already one baked quad,
not dozens of individual blade entities. Preserve the image and mask generation.

The current root-point footprint is insufficient for structural insertion. A
root-center sort can draw the card before one of its foreground supporting tiles,
then paint that tile over its grass. Do not repeat that bug.

### 7.2 First policy to implement and test

Use the same **full authored 2×2 footprint for every mask**, independent of which
of its four cells currently contain full/short grass. Mowing must not move the
picture's preferred depth slot merely because a different corner becomes empty.

For a patch rooted at `(rx, rz)`, its four nominal centers are:

```text
(rx, rz), (rx+1, rz), (rx+1, rz+1), (rx, rz+1)
```

Choose the camera-front corner from those fixed centers using the quadrant, and
use that cell's diagonal, the patch support-cell height, and a cover-after-surface
subslot as the preferred key. Keep actual occupied support cells separately for
validation and mandatory support precedence. Do not use the frontmost *occupied*
corner as the stable key.

This policy shifts all equal-size cards by the same quadrant offset and therefore
preserves their mutual parallel-card order across masks. It is a **candidate**
policy for mixed grass/terrain, not proof that every pixel against a cliff is right.

Use bounded local cell checks over the authored footprint and declared visual
reach when support/cliff placement needs correction. The extent must come from
actual art/geometry and be validated/capped. Do not search every screen-overlapping
record. Do not infer per-pixel 3D from the alpha silhouette.

If the fixed policy fails, retain the exact facts/image before changing it. A
reusable local interval correction is admissible only if it has explicit bounded
inputs and remains stable across masks and pan/arrival order. No general graph,
alpha-rectangle tests or a list of content-specific adjustments is allowed.

### 7.3 Decisive grass fixture

Before expanding to all props, render original atlas art with:

- flat ground and full grass;
- full/short/empty mixtures exercising masks 1–15 and their transitions;
- one- and multiple-level raised banks on each relevant side;
- both sides of a chunk seam and a world edge;
- lower/upper cut transitions, including cover disappearing only when unsupported;
- all four camera quadrants;
- pan outside coverage and return; reversed patch arrival/input enumeration.

Inspect native pixel scale and a magnified screenshot. Reject missing upright
blades, broad grass-in-ground patches, diagonal missing strips, exposed floating
cover, mask-dependent depth jumps, or different returned images from identical
facts. Small accepted whole-furniture overlap is **not** permission for these bugs.

Use production cover/appearance producers and actual checked atlas bytes. The
existing fixture is useful, but do not hand-author front/back answers in test data.

**Gate:** if this fails, do not proceed to a full sparse-prop implementation.
Fix the bounded cover representation or bring the exact counterexample to the
integration owner. Do not silently restore the old compiler as a fallback.

## 8. Sparse actors and authored props

Only proceed after section 7's first working shape has been reviewed.

### 8.1 Inputs

Use canonical world position, oriented authored footprint/volume, support identity,
existing part boundaries, and actual projected visual bounds. Keep those facts at
the art/subject preparation owner; the game does not supply a magic numeric depth.

Do not generate alpha rectangles for ordering. Original alpha hit data remains
available for picking. Avoid recomputing a shared asset's bounds every animation
frame: asset geometry is immutable; placement is the changing part.

### 8.2 Bounded insertion, not another graph

Compute a stable preferred structural slot from the admitted footprint/anchor.
Query only grid cells and sparse objects within its validated local footprint and
visual reach. A small index at the structural owner may answer that query.

For each relevant nearby bound, use conservative axis separation and support
facts to derive an allowed before/after interval in the existing structural stream.
Do not invoke `compareOrderingPlanes`, `preciseFaces`, clipping, ray/polygon
intersection for pair ordering, or the old relation compiler.

Conceptual operation:

```text
placePicture(picture, retainedTerrain, candidateStaticPictures):
    preferred = slotFromAuthoredPlacement(picture)
    after = mandatorySupportSlot(picture)
    before = endOfAdmittedLocalRange

    for nearby in boundedLocalQuery(picture):
        requirement = relationFromGridOrAuthoredBounds(picture, nearby)
        if requirement is AFTER: after = max(after, nearby.afterSlot)
        if requirement is BEFORE: before = min(before, nearby.beforeSlot)
        // Overlapping conservative volumes need not produce an exact relation.

    if interval contains a legal slot:
        return clampStablePreferred(preferred, after, before)

    recordConflict(picture.id, nearbyIds, bounds, support, after, before)
    return admittedWholePictureApproximation(preferred, mandatorySupport)
```

This pseudocode specifies ownership and policy, not a finished AABB comparator.
Implement explicit axis/sign cases, document admitted bounds and test them with
actual consumers. Never claim overlapping AABBs prove exact pixel order.

Separate hard support precedence from soft visual constraints. Invalid physical
support references remain errors. Contradictory soft picture constraints choose a
stable authored-anchor policy while preserving hard support, with diagnostics.
Do not silently drop support to obtain a convenient draw list.

Use deterministic stable identity for unresolved ties; never array iteration,
arrival order, Map insertion order or the current viewport edge. Stable IDs alone must not override a known relation inside a satisfiable admitted
interval. A contradictory soft interval follows the explicitly diagnostic fallback
in 8.2a; that approximation may leave a visual relation unsatisfied. Mandatory
support is never a soft relation.

Maintain canonical static prop placement independent of the previous published
order. Re-evaluate only changed actor/prop placement
and affected local neighbors. Do not globally reorder all actors by previous
arrival order or repeatedly iterate until a fixed point: that becomes a disguised
constraint solver. If the declared one-pass/compound policy cannot represent the
actual required case, retain it for review before extending the system.

### 8.2a Explicit first insertion policy and evaluation order

Do not hand the preceding pseudocode to another model as an invitation to invent
an arbitrary constraint engine. Start with this finite policy and qualify its
admitted whole-picture approximation:

1. Build terrain/cover slots first. They never depend on actor arrival order.
2. Place static authored pictures/compounds from their own footprint plus local
   terrain constraints. Sort their independent preferred slots with stable keys;
   do not iteratively move one static prop in response to another. Meaningful
   interacting parts belong to one authored compound.
3. Place each moving picture against the fixed terrain and static-picture slots,
   plus its explicit support compound. Do not use last frame's actor order as an
   input to the new order. Place different moving actors independently, then use
   their continuous camera-facing anchor and stable ID for admitted mutual overlap.
4. Recompute affected mover placement if a local static picture changes. Texture-
   only animation preserves placement. Frame history/arrival order must not affect
   the resulting stream for the same facts.

Static slots are computed from the **candidate** facts in canonical order, not
borrowed from last frame while some neighbors are moving. A new/moved/removed prop
invalidates the affected local candidate data before movers are placed. Two changed
props must not each compute against the other's obsolete published location.

This policy intentionally does not preserve every order a general graph could
find. For example, a mover that could fit between two otherwise independently
ordered props may have an empty interval under their fixed structural order.
Do not reshuffle the props to solve that bridge case. Record the soft conflict and
apply the declared whole-picture policy; review the actual image. A supporting
compound's rail/surface/actor order remains mandatory and is handled by its local
authored structure. If a required visual case cannot tolerate the approximation,
that is the early representation gate failing, not permission to restore a graph.

A conservative local AABB check can be implemented without plane intersections:
transform its min/max intervals into camera-facing `(u, v, w)` coordinates, with
`u`/`v` as section 6 and `w = -sign(ray.y) * worldY`. First discard pairs whose
projected visual bounds do not overlap. For each of the three axes, record whether
A is wholly behind B or wholly in front, using an explicit shared boundary epsilon.

```text
behind = any(A.max[axis] < B.min[axis] - epsilon)
front  = any(A.min[axis] > B.max[axis] + epsilon)

if behind and not front: conservative BEFORE
if front and not behind: conservative AFTER
otherwise: no proven whole-picture relation
```

Touching/coplanar support uses the explicit support/subslot policy, not an arbitrary
depth bias. Both flags true means the conservative bounds do not establish an
occlusion order (typically diagonal separation); neither flag means overlapping
bounds. Do not add another geometry test to "finish" those cases. Use the preferred
slot/stable approximation and record relevant contradictory intervals.

This predicate is deliberately conservative, particularly for volume bounds around
an image. It is not an exact visibility oracle. Tests must include actual near/far
passersby and support compounds; if accepted required behavior fails, retain the
counterexample before extending the policy. Keep the error distinction between
unsupported/malformed physical support and a merely ambiguous visual relationship.

Use named boundaries around immutable keys:

```text
before(K) < record(K) < after(K)
if K < L, every boundary of K precedes every boundary of L
```

Represent a boundary as `{ key: structuralTuple, side: "before" | "after" }`,
with explicit beginning/end sentinels. A requirement "after this surface" produces
`after(surfaceKey)`, never `surfaceKey + epsilon`. A requirement "before this bank"
produces `before(bankKey)`. The interval is closed over these boundary values;
selecting `after(surfaceKey)` still paints strictly after that surface. Multiple
sparse pictures in one boundary bucket use their continuous physical preferred
anchor, then stable identity. A sparse picture's own stable key is addressable
inside that bucket so a mover can be inserted before/after a static picture.
Use at most the declared terrain → static → mover/compound nesting; do not allow
arbitrary dependency chains to create a recursive sorting framework.

Keep geometric continuous coordinates separate from order boundaries. A fractional
world coordinate is real placement data; an arbitrary fractional "depth epsilon"
is not. Clamp the preferred boundary to the legal interval using the same total
comparison. If lower exceeds upper, apply the declared conflict policy, preserving
mandatory support and recording the soft constraint left unsatisfied.

Stable sorting of sparse entries and merging their boundary buckets into retained
terrain runs is sufficient; no global edge list is necessary. Add direct laws for
after-one/before-next, several pictures sharing a boundary, negative coordinates,
changed neighbor membership and reversed input enumeration.

### 8.3 Supported multipart objects

Existing stair art contains meaningful surface and rail parts. Treat authored
support compounds generically:

```text
far boundary parts
supporting surface
actors whose canonical support names that compound, ordered along support
near boundary parts
```

Determine boundary sides from transformed authored geometry and camera quadrant,
not names such as `stair.leftMeansFront`. Keep a single owner/selection identity.
Test entrance, midpoint and landing in every orientation. A long part cannot be
ordered solely by its highest/farthest visible pixel.

A compound is not an indivisible draw block. Its hard internal precedence must
coexist with surrounding terrain slots, so foreground terrain can still appear
between its meaningful parts when required. Do not paint an entire stair above a
foreground cliff to preserve its rider/rail order. An impossible compound/terrain
interval is a retained counterexample for the early representation gate. Do not
solve it by hiding terrain or reinstating global topology.

The product accepts some whole-picture bed/actor ambiguity. It does not accept
actors always hidden by the wrong stair rail, clicking the wrong owner, or broad
terrain occlusion errors. Keep the existing bed/passersby and construction-site
cases as actual-art checks. Do not change collision so a rendering test becomes easy.

### 8.4 Water and overlays

Water is a non-pickable physical surface at its actual fill height. Place it in the
same structural stream with stable material/subslot rules and retain its existing
blending. Preserve current object-picking behavior deliberately: water is not an
object-selection target and does not block a target's object click. Today this
happens because water records have no hit predicate; make the water primitive's
policy explicit rather than accidentally inheriting the opaque-cover rule.
Add a water-over-target witness, separately from its visual bank occlusion.
Do not place all water in a final overlay pass. Qualify bank/person/water
ordering and changing water mass without earth-body re-extraction.

HUD remains screen-space. Selection rectangle remains screen-space. World-space
placement previews/designations use the displayed projection/cut and the existing
explicit overlay behavior. Do not let a pending rotation move tools onto unseen
geometry. Preserve the publication callback that updates/cancels gestures.

## 9. Drawing and picking are one published view

### 9.1 Retained drawing

Feed Pixi a prepared sequence of retained runs/ordinary displays. Keep original
UVs, anchors, filters, atlas bytes and blend modes. This repair changes preparation,
not the art style.

Do not replace a graph bottleneck with one draw call per tile. Batch compatible
consecutive terrain quads, respecting an actor/prop that must be inserted between
them. Keep buffers for unaffected runs. When insertion changes a boundary, split
or rebuild only affected runs; use the existing batch owner where possible.

A shared geometry/subrange approach is optional only after checking the installed
Pixi API and lifecycle. Do not invent a Mesh range API. The first measured shape
may rebuild a bounded affected run; it must expose quads packed/uploaded so that
whole-view repacking on every actor tick cannot be hidden.

Chunk changes may alter a merged list; they must not force fresh atlas copies or
unaffected per-quad geometry. Bound active/pending/spare resources and count their
actual bytes/objects, including ordinary actor/part displays.

### 9.2 Picking

Object picking consumes the exact published sequence in reverse. Preserve alpha
silhouette tests. Transparent atlas padding must never block selection.

An opaque/cutout non-pickable piece's **actual visible silhouette** can occlude a
target behind it under the current contract; water keeps the explicit transparent
click-through policy from section 8.4; its full quad cannot. Do not make all grass either
solid rectangles or unconditionally click-through to repair a failing test.

Preserve the existing support-surface query exception:
`surfaceSubjectFromOrdered` plus `camera.surfacePoint` queries a physically declared
walkable deck even where its art is transparent. That is different from selecting
an object's visible alpha silhouette. Both use the same published world/compound
facts; do not force physical surface admission through the object's alpha picker
or turn surface geometry into a second object draw order.

Ground/selected-plane queries have distinct purposes. Ground hit geometry must
match published terrain; build-plane selection remains the explicit displayed cut.
Neither reads a newly received/unpublished patch as though it were already visible.

Do not clone/reverse the entire record list for each click. A backwards iterator
or indexed traversal of the published sequence suffices. If the retained stream
uses spans, offer matching forward draw and reverse pick traversal from its owner.

## 10. Scheduling and coherent publication

Keep the useful staged ownership already implemented, but replace its work.
There is at most one pending world-view successor. Pin its facts/material/view.
New actor observations coalesce behind it; they cannot restart pending terrain
preparation every frame. A genuinely superseded cut/rotation/epoch can cancel it.

```text
onCameraPanOrZoom:
    transform(publishedWorldContainer)
    updateDesiredCoverageForNextFrame

frame(latestInputs, boundedBudget):
    updateMaterialDemandWithoutMutatingPublishedPictures()
    if pending target is superseded by epoch/cut/quadrant:
        cancelCandidateOwnedResources()
    if no pending:
        pending = preparePinnedSuccessor(latestInputs)
    advancePendingWithinBudget()
    if all candidate pictures/displays/order/picking are ready:
        publishTogetherInOneTurn()
    renderPublishedScene()
```

Advance in useful bounded batches with a shared frame deadline. Do not wrap every
scalar comparison in nested task metrics/allocation. However, do not present
batch-size tuning as proof that the structural replacement is delivered.

Publication performs validated pointer/display swaps and bounded retirement;
expensive extraction, sorting, buffer packing and validation happen before it.
Measure publication and first-render/upload separately from preparation.

On publication adopt the matching camera quadrant, displayed cut, subjects,
terrain hit data, order and meshes. Recompute rotation's camera-center preservation
against the latest pan state, so panning during preparation is not lost.

Coverage diagnostics must distinguish received and displayed completeness.
The published flags require matching epoch/material revision/cut/quadrant and
coverage; receiving the last patch is not the same as displaying it.

Cleanup laws: cancel-before-ready, cancel-after-ready, clear, epoch replacement,
art failure, renderer-init failure and dispose each release owned resources once.
Do not hide the shared actor container merely because a terrain frame is absent;
this was already corrected in `77a7270f`.

## 11. Work sequence and concrete checkpoints

### Checkpoint A — recover and pin the current state

1. Inspect `git status`, branches/worktrees, active processes and retained receipts.
2. Read the failed hosted report and this packet. Record source pin.
3. Preserve current dirty/untracked work; never sweep worktrees or old evidence.
4. Agree one writing owner for terrain/order/world-view integration. Independent
   review/proof tasks can run in other lanes, not edit the same seam.
5. Keep current backend/art/protocol unchanged for the first replacement.

Deliverable: a brief custody/source note in the existing report, not a new project
management system. Do not spend a turn writing another architecture proposal.

### Checkpoint B — terrain/grass replacement and early art gate

1. Implement structural keys and compact terrain/cover placement metadata.
2. Decouple chunk geometry from viewport-plan invalidation.
3. Route dense terrain and grass through structural traversal, not the compiler.
4. Keep production appearance/mowing data and original atlas bytes.
5. Add the mixed-mask raised-bank tests and inspect all four original-art views.
6. Run the first shape in the actual colony route with real arriving terrain.
7. Record time to useful ground plus actual dense pair/alpha/topology counts: zero.

A temporary development checkpoint may still have unmigrated prop code, but do
not call it accepted or maintain two permanent order authorities. Keep it isolated
and preserve exact source; do not expose a broken replacement as a finished preview.
If the early grass gate fails, stop expansion and retain the counterexample.

### Checkpoint C — sparse consumers and retained meshes

1. Integrate actors and actual authored furniture parts/supports.
2. Replace old input geometry/signature requirements at their producers.
3. Adopt the new ordering owner in `world-view-owner` and all current consumers.
4. Preserve one published pick/draw sequence and UI publication behavior.
5. Retain unaffected buffers/runs on movement and mowing.
6. Remove the dense compiler calls and superseded mutation entrypoints.
7. Review the final client caller and actual original art before expanding scope.

Deliverable: the real game uses one replacement pipeline, without an automatic old
compiler fallback. Focused laws and original-art interactions pass. Performance is
still provisional until the combined hosted run.

### Checkpoint D — paired hosted acceptance

Build one immutable frontend from the pinned integrated source. Use the authorized
separate DO backend and a live Cloudflare tunnel. Check the served code hashes and
matching protocol. Record hashes of the checked static and living-terrain manifests
and their atlas images, and verify corresponding hosted image bytes. The current
browser driver's served-code inventory does not include PNGs, so add an explicit
asset receipt rather than assuming JS hashes prove unchanged art. Run the real
combined workload; inspect screenshots personally.
Compare 64/256 at the same viewport/camera/zoom/quadrant/cut and eight working actors.

If a gate fails, retain the failed report and make the smallest correction within
the chosen representation. Do not loosen the gate, pause workers, shrink the tested
world, remove grass, substitute local simulation or change readiness clocks.

### Checkpoint E — remove superseded source and report honestly

Search all current consumers, including review routes and tests. Migrate valid
entrypoints to the same owner or preserve them explicitly as historical source
outside the active runtime. Do not delete an entrypoint merely to make checks pass.
Remove obsolete production graph/proxy/signature code once no real consumer needs
it. Keep general geometry utilities still required for picking/placement.

Summarize what was deleted, what the game caller no longer coordinates, metrics,
visual limitations, remaining risks and the reachable preview. Do not mark the
active goal complete until every original acceptance requirement is met.

## 12. Focused laws to implement

Prefer behavior and independent witnesses over tests mirroring private fields.

| Law | Evidence required |
| --- | --- |
| Voxel traversal | Small grid/ray oracle across quadrants, cliffs/cavities and negative coordinates; correct actual visible front cell |
| Cover support | Real masks/full-short transitions; all supports before cover, appropriate foreground bank after; native screenshots |
| Stable ordering | Reversed enumeration/patch arrival and pan-away/return yield same accepted order/picks/image |
| Camera locality | Many pan/zoom events within prepared coverage produce zero exposure/proxy builds and no static buffer rewrites |
| Chunk membership | Entering/leaving chunks do not reconstruct unaffected derivatives; seams remain correct |
| Mowing locality | One cell updates its affected mask roots, not body geometry or unrelated patches; physical cover remains authoritative |
| Cut residency | Resident cuts require no redundant material reads; unknown coverage stays unknown |
| Actor locality | Moving one actor queries bounded nearby data and updates affected slots/runs only; no terrain topology pass |
| Multipart support | Actor between appropriate rail parts at entrance/midpoint/landing for all views; one selection owner |
| Publication | Hold preparation open: old sprites/picking/cut stay coherent, camera moves, newer observations coalesce |
| Cancellation/lifetime | Superseded candidates dispose only owned objects; shared art and published scene survive; clear/dispose idempotent |
| Shared parent | Actors can remain visible without terrain; terrain does not override world-owned visibility |
| Resource bounds | Repeated cuts/travel/return obey declared residency and GPU caps; no accumulating history |
| Picking | Transparent holes pass through; actual non-pickable ink occludes; returned target corresponds to visible original art |
| Live work | Real DO time, worker motion and completed resource/work changes occur during rendering workload |

Remove/replace old tests that require the superseded graph algorithm. Preserve
their valid behavioral counterexamples. Do not simply delete failing art or support
fixtures, and do not demand byte-identical old approximate order where policy has
explicitly changed. Explain each changed expectation.

## 13. Diagnostics and performance acceptance

Expose compact counters at the owner; do not serialize every geometry record in
every animation-frame diagnostic read. Retain bounded samples.

Required separate observations:

- navigation, assets-ready and runtime-ready timestamps;
- first material receipt, received visible/padded completeness;
- published useful/visible/padded completeness;
- material/exposure cells or runs visited; chunk geometry builds/reuses;
- terrain/cover record counts, structural merges and quads packed;
- sparse query visits, insertion changes and ambiguous-picture diagnostics;
- dense pair comparisons, alpha-order comparisons and topology work: **zero**;
- preparation slice duration and total work, publication duration;
- input queue estimate, EventTiming where available, next-rAF opportunity;
- long tasks, frame intervals, rendering/upload work where obtainable;
- active/pending/spare geometry bytes/meshes and material cache bytes;
- heap before/far/return, optionally post-GC, as an observation rather than an
  invented fixed heap threshold or proof of universal memory boundedness.

Keep existing loading gates: useful published ground (center plus at least nine
of 35 samples) within **1 second** after independent assets+runtime readiness;
all 35 visible samples plus published visible coverage within **3 seconds**.
Record navigation-relative time as well. Do not postpone readiness until terrain
finishes. Test driver's ground witnesses include actual cliff-side geometry.

**Driver success is not a complete responsiveness gate.** The current combined
driver asserts input evidence and scenario completion but primarily reports the
latency/long-task distributions. Inspect those distributions and preserve any
explicit interaction thresholds from the active goal. No universal input threshold
was supplied here: do not invent one and claim it was accepted. Record a separate
human interaction review on a real browser/GPU through the reachable preview,
including whether camera movement, cut adoption and loading are acceptably usable.
If that review is unavailable, say responsiveness acceptance remains incomplete;
a software screenshot or absence of errors cannot supply it.

A useful engineering target is ordinary frame preparation within the existing
6 ms slice allowance, with remaining synchronous publication measured separately.
This is a target, not permission to consume 6 ms for minutes before showing terrain.
Do not claim hardware 60 FPS from SwiftShader. Actual interaction and visual
acceptability remain required; a single CPU number does not establish fun gameplay.

Compare identical views in 64 and 256 worlds. Use cold and returning visits,
continuous real pan/wheel inputs while patches arrive, repeated cuts/rotations,
and working actors. A larger world may have different sampled geometry; record
visible work counts rather than claiming equality from preset labels alone.

## 14. Commands and preview operations

Use existing installed dependencies. Automated checks run through:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh COMMAND ARGUMENTS...
```

The wrapper owns a ten-minute timeout and five-second shutdown grace. Retain/poll
the returned process session to terminal; an observation timeout is not completion.
Human-facing servers/tunnels use their normal launch commands.

Representative focused commands, adjusted to files actually changed:

```sh
GUARD=/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh
"$GUARD" node --experimental-test-module-mocks --test \
  engine/src/client/client-startup.test.js \
  engine/src/client/cut-terrain-layer.test.js \
  engine/src/client/terrain-picture-owner.test.js \
  engine/src/client/terrain-face-batches.test.js \
  engine/src/client/voxel-draw-picking.test.js
```

Add the new structural-order and real-art laws; this command alone is not enough.
Verify every named test file exists and the terminal receipt includes its tests.
Do not infer coverage from exit zero if Node skipped a path. TypeScript tests use
the existing repository/esbuild strategy where extensionless imports require it;
do not install a new runner or report unrelated global type errors as passing.

Build for the separate backend:

```sh
VITE_HIVE_PUBLIC_HOST=https://hive-performance-engine-preview.levi-fe0.workers.dev \
  "$GUARD" node node_modules/vite/bin/vite.js build \
  --config engine/vite.config.js --outDir ABSOLUTE_NEW_OUTPUT/engine
```

Serve the parent output directory so `/engine/...` resolves. Use a new immutable
output directory per measured build. Never rebuild files underneath an active
proof and then attribute the run to one source pin.

Browser environment already provisioned:

```text
CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome
LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu
cloudflared=/home/levi/src/Botanical-next/.botanical/cloudflared/bin/cloudflared
```

Read `tools/public-engine-host/WORLD-VIEW-BROWSER-PROOF.md` and the actual driver.
Update the driver's source-path inventory as modules are replaced; require complete
hashes for the actual replacement sources. Missing old hardcoded paths are not a
complete source receipt, and a served bundle hash alone does not attest which local
source was used. Pair the frozen build inventory with the served bundle/asset hashes.
Example paired run:

```sh
"$GUARD" node tools/public-engine-host/world-view-browser-proof.mjs \
  --base-url https://LIVE_FRONTEND \
  --backend-origin https://hive-performance-engine-preview.levi-fe0.workers.dev \
  --output ABSOLUTE_NEW_PROOF_DIRECTORY \
  --source-root ABSOLUTE_INTEGRATION_WORKTREE \
  --frontend-source EXACT_SOURCE_COMMIT \
  --backend-source EXACT_DEPLOYMENT_VERSION
```

Export the browser environment for that command. The default sizes are 64,256.
A 64-only diagnostic run is useful during implementation, not final paired proof.
The driver is new and needs scrutiny: distinguish a driver failure from game failure
without suppressing either. Its resize-based camera normalization must use actual
ResizeObserver behavior, never a simulation reset or injected camera state.

At packet authoring time, the previous measurement infrastructure was:

- Frontend origin: `https://laura-ware-due-mere.trycloudflare.com`.
- Human server port: 8879, serving `.botanical/world-view-hosted`.
- Separate backend version: `5ac3cd1b-c501-46b6-9e87-ca639e30f082`.
- Backend implementation hash:
  `6e4aa1d6281c882970ed1b6308fd0fcf6fb26dc7ec8235eed21e3a1e690e071e`.
- Deployment record: `.botanical/world-view-release/deployment.json`.

These identify the **failed old staged build**, not a released replacement. Recheck
process/network state; quick tunnels expire. The backend permits the exact frontend
origin. A new origin may require updating only the authorized separate test backend.
`prepare.mjs` defaults to the production-demo name: explicitly inspect/change the
prepared config target to `hive-performance-engine-preview` before any deploy.
Never deploy the default target accidentally. Use the existing credential mechanism
without printing secrets; do not ask for credentials already available to the owner.

## 15. Review, custody and scope discipline

One writer owns the coupled replacement through terrain/cover/order/world-view
integration. Native agents may independently review the algorithm/art and operate
proofs against a pinned build. Do not parallelize edits to the same ownership seam.
Use isolated worktrees/branches as required by AGENTS; preserve dirty/untracked
bytes and release custody explicitly if transferring writers.

The independent reviewer must answer:

1. Which expensive operation no longer exists?
2. Does the game caller become simpler, and who now owns invalidation/publication?
3. Does pan reuse ready geometry rather than rebuild-then-discard it?
4. Does any code quietly call the old comparator/graph?
5. Are grass and multipart support semantics preserved in original art?
6. Are actual working-world measurements substantially better, with unchanged gates?

Read current Fallow findings on touched code. If Fallow remains unavailable, state
that limitation; do not install tools merely to manufacture a green audit or claim
an unavailable scan ran. Do not add general frameworks or unrelated engine repairs.

Report concise updates about changed behavior, measured evidence and remaining
uncertainty. Do not describe module extraction, tests, commits or plans as delivered
smoothness. Give the user a reachable preview only with an accurate statement of
what is playable and what failed. The user cannot access localhost.

## 16. Stop/continue decisions for the implementer

**Continue autonomously** with reversible authorized source work, focused proof,
corrections, and the separate preview. Do not ask permission for ordinary progress.

**Stop expanding the design and bring evidence to the owner** if:

- original mixed-mask grass/bank art cannot fit the declared local policy;
- a supported multipart case requires a second graph or content-name exception;
- a coordinate/traversal counterexample invalidates the proposed terrain key;
- publication requires changing authoritative physical state;
- the proposed fix requires rebaking accepted art, switching renderers, adding
  runtime per-pixel depth, changing product scope, or deploying another backend.

Supply exact source pin, world facts, camera/cut, original-art image, expected versus
actual behavior, and the smallest failing reproduction. Do not respond by adding
an unreviewed fallback or by writing a new plan that quietly changes the goal.

Do not stop simply because work is difficult or a test fails. A concrete bounded
correction within the admitted representation is ordinary implementation work.
The stop conditions prevent another architectural drift, not persistence.

## 17. Completion checklist

The integration owner, not an isolated lane, accepts completion only when:

- [ ] The actual game uses the structural replacement with one draw/pick owner.
- [ ] Dense terrain/grass graph, alpha refinement and topology are absent from its hot path.
- [ ] Unchanged camera motion does not reconstruct terrain or upload unchanged buffers.
- [ ] Local movement/mowing retain unaffected chunks and ordering/batch data.
- [ ] Original upright grass, all tested masks, cliffs/seams/cuts and four views pass visual review.
- [ ] Supported furniture/actors and picking pass actual original-art interaction checks.
- [ ] Cuts reuse resident materials; received and displayed coverage remain separate.
- [ ] Continuous observations cannot starve terrain publication; cancellation/disposal laws pass.
- [ ] Resource limits cover active, pending, retained and spare allocations; repeated travel shows no unexplained growth.
- [ ] Real DO eight-worker workload remains active and makes physical progress.
- [ ] Paired 64/256 combined hosted acceptance passes unchanged loading and interaction checks.
- [ ] Input/frame/preparation/order/loading/resource evidence is separate and honestly qualified.
- [ ] Source/release hashes, failed and successful receipts and rendered evidence are retained.
- [ ] Superseded running paths are removed; valid consumers/entrypoints remain supported.
- [ ] A working Cloudflare preview is reachable from another machine and given to Levi.

An incomplete box means incomplete delivery. Do not redefine the task around the
subset that passes. The right outcome is a substantially simpler rendering system
that the user can actually enjoy moving around in—not another accepted document.
