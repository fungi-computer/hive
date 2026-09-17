# Simple depth rendering: implementation handoff

September 17, 2026. User-approved direction; replacement algorithm and visuals
are **not yet qualified**. This is a staged implementation brief, not permission
to invent an ordering algorithm if stage 1 fails.

## Objective and precedence

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
