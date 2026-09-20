# Spatial ordering core: working small-scene checkpoint

September 20. This implements step 1 of the rendering repair in the owned
`engine/living-terrain-integration-20260917` branch. It is a separate original-art
Pixi scene, not a production renderer replacement or a performance release.

## What now works

`/engine/spatial-render-review.html` presents original grass, raised earth, the
bed, two walls, split stair art and a moving worker. The camera rotates through
four baked views. The walking control takes the worker around the bed. The mown
patch control displays mixed full/short grass. The original checked atlases are
loaded; no replacement art or Three rendering is used for the displayed scene.

`compileSpatialDrawOrder(records, {projection})` is the client-side owner of
candidate discovery, geometric relations, support validation and deterministic
topological ordering. Pixi consumes that list through the existing batch painter.
Neither the server nor Pixi decides camera-dependent visibility. There are no
content-name branches in the ordering module and no dropped cycle edges or
scalar-depth fallback. Unsplittable intersecting geometry fails explicitly.

## Contracts for implementation

- Every piece has stable `id` / `part` identity and `orderGeometry`: a convex
  planar face or conservative positive visual volume. These describe a picture,
  not physics, inventory or navigation. Existing planar ray-depth comparison is
  reused. Stable IDs only settle unconstrained order.
- Ground uses its actual faces. Surface decoration uses `projectSurfaceArt` to
  sample existing atlas appearance over its supporting polygons. `surfaceOrder`
  expresses coplanar decoration above its ground, without a content-name rule.
- Whole furniture uses source visual bounds. A worker uses an upright silhouette
  card through its feet, generated from original source geometry. This is a 2.5D
  art convention, not a claim of exact source-mesh depth at every pixel.
- `supportY` declares the support plane beneath a picture's contact ink/shadow.
  Appearance on that plane precedes the picture. It is not collision geometry.
- Split stair textures are an existing checked pixel-disjoint composite. A
  shared `compositePartition` exempts only those siblings from mutual occlusion;
  every sibling still orders against outside pictures.
- A climbing actor supplies `support: {id, part, point}`. The referenced piece
  supplies `contactSurface`. The core checks the point against that surface and
  makes the support edge mandatory, including cycle detection. Rail geometry
  independently places the actor between the rails.
- Art authoring owns visual metadata. `captureVisualVolume` detaches it before
  source disposal. The fixture currently captures source geometry directly;
  production pack export/validation is still to be implemented. Do not copy
  fixture model construction into a production render loop.

## Grass remains mowable

The four support cells are the existing dual-grid sampling contract. They were
not a sorting mistake and are retained. Each physical cell still supplies its
own cover kind, condition and full/short height. The dual grid chooses matching
masks; projected decoration pieces cover the relevant support quarters.

Grass appearance is intentionally simplified onto the ground. This keeps the
atlas and mask selection but clips elevated blade portions outside the support
polygon. It is not pixel-identical tall grass. The original whole grass image
could be both in front of and behind a bank at different pixels: reversing its
single order was not a complete repair.

Mowing must be an authoritative world operation changing cell cover state; the
renderer observes the resulting facts. This checkpoint introduces no mowing
command, job, resource yield or regrowth system. The preview checkbox supplies
short/full presentation inputs only. Do not claim gameplay mowing is complete.
The new scene test checks that ordering does not mutate those inputs or terrain,
and that mixed heights retain four-cell dual-grid supports.

## Evidence and acceptance limits

Focused tests: 13 passed (u2536, invocation
`8bc5c7eac94247d58a411d03c793d086`). Includes 80 bed-walk/camera states,
20 stair-contact/camera states, mixed-height dual-grid preservation, malformed
geometry, support cycles, pan/bin invariance and bounded distant candidates.
Production Vite build passed (u2537,
`05b7e50f74434725ac46ff8fa62506c1`), with existing Zod annotation warnings.

The retained browser script renders isolated original images and compares every
fully opaque overlap pixel with an independently selected winner: axis
separation for bed/walls/rails, raised height for bank/ground, and declared
contact for the stair surface. It does not infer expected order from the sorter's
relations. The production-built page passed the same checks (u2538,
`215d30b72b5941c6ad57d9e4d2b7bb49`): 24 bed, four bank, eight wall and
60 stair-part cases, 7,277 opaque overlap pixels and zero mismatches. Tall/short
grass changed 5,199–5,653 pixels per camera. See `evidence/20260920-spatial-review-results.json` and the adjacent
script and screenshots. Browser controls are exercised, not just the direct API.

Independent source review accepted this bounded scene. Parent personally viewed
the full scene, mixed short/full grass and actor on stairs. This is not universal
outline-only overlap proof or arbitrary-asset acceptance. Conservative boxes may
require authored partitions for other content. The face validator checks the
convex polygons supplied here; unrestricted self-intersecting author input needs
stronger boundary validation before a public authoring API.

The available Fallow artifact covers old `clearing-state.ts`, not these modules;
no current Fallow executable/report was available. No audit-green claim. The
fixture's full scene rebuild and runtime source capture remain explicit
performance advisories. Preview milliseconds include scene generation, sorting
and painting; they are not isolated sort timings or population capacity proof.

## Next production seam

1. Export and validate visual metadata with the existing original-art pack;
   remove fixture-style runtime model construction from the real caller.
2. Give one retained client owner snapshot/camera/cut invalidation and bounded
   recomputation. Replace the production scalar ordering path and its real
   consumers together. Do not retain two active production ordering authorities.
3. Exercise pan away/back, cut changes, unloaded support neighbors, camera turns,
   moving actors and cover-state changes on that real owner. Drawing and picking
   must consume the same compiled scene. Measure construction, candidate search,
   ordering, batches and memory separately before claiming improved performance.

The preserved `cut-terrain-layer.js` / test edits are unaccepted earlier work and
are deliberately excluded from this checkpoint. Production retention, terrain
cut lifecycle and hosted publication have not been fixed by this preview.
