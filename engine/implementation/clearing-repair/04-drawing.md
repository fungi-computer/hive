# Spatial drawing: align the art, then use its actual depth

[Packet index](README.md) · [Coordinates](02-construction.md)

## Why a better z-index alone is insufficient

`client.js` currently sorts support ancestry, x+z, ID, then sets zIndex/renderRank.
`controls.js::selectionFromSubjects` uses that rank. Long sprites reduce to a
single anchor, so no ordering can show one person behind one section and in front
of another when those pixel relations conflict. Do not ship a bounding-box graph
with an arbitrary cycle-break and claim it solves that case. Excalibur's elevation
band + screen Y is a useful baseline, but also ranks whole sprites.

Chosen implementation: preserve original Three -> low-resolution bake -> Pixi
artwork. Bake a matching visual depth image per opaque frame, and use that depth
for the shared world render pass and picking. No simulation geometry is generated
from sprite pixels. Canonical footprints/endpoints remain for placement, support,
culling and inspection. This refines/supersedes the earlier whole-sprite-sort
proposal in the sprint for opaque geometry. Avoid a new scene engine or physics.

## First bounded feasibility checkpoint (before whole-bank export)

Use existing Pixi WebGL path: installed Pixi has Mesh/Shader/State.depthTest and
State.depthMask; RenderTarget has a depth attachment. These source APIs establish
an implementation route, NOT an accepted render witness. Force the maintained
WebGL2 renderer for this slice; do not silently fall back to anchor sorting if
fragment depth/depth attachment is unavailable. Display explicit renderer failure.

Build an overlap including real terrain, the retained bed or stair and person with
one matched color/depth pair. One shared depth attachment must correctly render
all relevant input submission orders and CPU pick the same frontmost pixels. This is the
lead's difficult renderer checkpoint; complete it before a Luna bulk manifest/caller
migration. If Pixi cannot attach/write depth through its public render-target/mesh
path, stop that expansion and report the exact API failure for lead correction;
do not reach into renderer private GL state or invent a second live Three renderer.
The required rendering behavior stays fixed; an API obstacle is not permission to
ship a lower-quality algorithm.

## Datum alignment before depth

Source: native `structure_geometry.rs::fixture_cells` transforms local x/z:
N=(x,z), E=(-z,x), S=(-x,-z), W=(z,-x). `home.js::building` rotates model around
origin using Three positive Y (x,z)->(z,-x) at direction1. `colonyPlacement` maps
axial N/S to art0 and E/W to art1. Native fixture direction must not be inferred
from visual facing. Brewer `stationScene` rotates around (.5,0,.5); bed around
origin with its length centered at z=.5. North happens to align, east/south can
put the rendered footprint on the wrong side of the anchor.

Implement one pure placement-art transform helper, fed by original art recipe data:
physical local footprint, requested native orientation, available art-facing's
footprint and rotation pivot. Compute oriented footprint centroids and translate
render origin by `physicalCentroid - bakedFootprintCentroid`. For rectangular
axial assets this aligns occupied footprint even when equivalent two-facing art
is used. Verify the full transformed cell set, not centroid alone. If shapes do
not match under translation, use the matching original four-facing bake instead;
never stretch/mirror pixels or change native geometry to fit. Original art facing
selection remains content data, not renderer branches for bed/east.

Stairs use the existing four-facing model, local entrance (0,0,0) and landing
(0,2.16,2). Native endpoints use run2/rise4 and native cardinal direction. Assert
that baked entrance and landing transform to those exact metric positions for
all directions. Bed, brewer and shelf datum metadata belongs beside their original
art builder/export recipe. Compute visual bounds with Three Box3 during export;
do not hand-enter a 'brewer height' in the game sorter. New metadata describes
existing artwork; it does not add inventory/collision capability.

## Baked frame format

Extend `src/art/bake.js`, static authoring/export/manifest/loader together with a
new explicit manifest version. Each opaque frame has color rect, matching depth
rect, common anchor, local depth range and local visual bounds. Compute bounds and
image depth from the SAME posed geometry, animation frame, rotation and camera.
The depth atlas uses linear raw channels, nearest sampling, no mipmaps, no sRGB
conversion and no lossy compression. Color retains current palette/outline.

Let `towardCamera` be normalized camera.position minus camera target from the shared
`src/art/prop-camera.js`; expose that basis there, do not duplicate constants.
For a local geometry surface point p, store d=dot(p,towardCamera). Encode d linearly
into 24 bits RGB over the frame's min/max; alpha=occupied. Depth zero is not empty.
Opaque colored pixel and depth coverage MUST match. During existing one-pixel ink
outline, give a new outline pixel the depth of the nearest adjacent source pixel
using a deterministic neighbor order; never an unrelated constant depth.

Depth bake is an additional override-material render of the same scene before
geometry disposal. Preserve material alpha-test/visibility masks for any cutout
geometry. Separate semitransparent particle art from this opaque format. Do not
bake glow/smoke into opaque depth-writing pixels. Restore renderer target/materials
and dispose owned temporary resources on success/error. Exporter writes hashes,
source inventory, color+depth atlas pairing atomically in the existing bank flow.
Manifest validation rejects missing/mismatched dimensions, invalid finite ranges,
nonexistent rects and unsupported versions; no runtime guessing from sprite name.

## Runtime render owner

Add one client module `world-depth-layer.js` consuming resolved baked frames and
existing projected/interpolated poses. It owns meshes, shared depth render target,
texture lifetime, resize and disposal. No game state or authoritative time advances
inside it. It uses the same camera projection as geometry.js. Per-frame input:

```ts
DrawItem = {
  entityId, visualPartId, colorFrame, depthFrame,
  worldOrigin, screenTransform, visible, pickable
}
```

For each opaque pixel compute `worldDepth = dot(worldOrigin,towardCamera) + localDepth`.
Choose common near/far depth bounds from the visible item/terrain extents, with
finite margin; normalize consistently for all meshes and the CPU picker. Write
`gl_FragDepth = (nearDepth - worldDepth)/(nearDepth - farDepth)` (nearDepth is the
larger toward-camera coordinate). Clear depth to1, enable depth test/write, discard
transparent pixels. Verify convention with a near/far fixture; never use zIndex
as a second contradicting depth rule. Equal quantized depth uses deterministic
submission order by physical role then stable identity: finished floor surface
wins over underlying terrain; other ties stable entity/part ID. This is an exact
coplanar policy, not a per-item depth bias.

Draw opaque world once into the owned target, then compose it into existing Pixi
camera/UI. Terrain's current whole bake behind actors must gain the same matching
depth bake and origin; otherwise cliff/stair-floor comparisons remain wrong. Avoid
world-size targets: retain current bounded visible terrain residency/bake sizes.
Actor interpolation changes worldOrigin every frame, not depth-bank contents.
Camera zoom changes screenTransform only; it does not scale metric depth. If a
visual uses model scale, apply that SAME model scale in depth reconstruction and
bounds as in the color quad; no cosmetic scale may silently change only one.
Depth frame follows the SAME animation index as color. Static resources cache;
no per-frame Three scene construction, CPU full-world sort or GPU readback.

Transparent water/smoke/effects: depth-test against opaque geometry but do not write
opaque depth; preserve their current bounded visual ordering and alpha. Split water
out of opaque terrain bake where necessary. They are not selectable opaque solids.
UI labels/highlights/placement previews remain deliberate overlays after world draw;
they do not mutate physical ordering. Keep previews visibly distinct/translucent.

## Picking, extents and cutaways

Decode depth atlas once into CPU bytes alongside existing alpha silhouettes. On a
pointer query, use screen-space spatial index to find containing visible frame
rects, map through the same screenTransform/anchor to pixel UV, reject transparent
pixels, compute the same worldDepth and tie policy. Choose nearest opaque visible
surface first, THEN decide whether it is selectable. A nonpickable opaque wall can
occlude a pickable person; filtering nonpickables before occlusion is wrong.
Multiple parts map to one entity ID. No GPU readPixels on mousemove.

Floor-tool acquisition intentionally targets visible support plane through furniture
as specified by tool semantics; do not confuse that with ordinary person picking.
Use canonical geometry.js ray/plane owner and XState target plane. Entity selection
and context menus use pixel depth. Rectangle selection uses existing semantics over
owned actors; it need not inspect every image pixel.

Cutaway visibility controls both color/depth coverage before picking. A hidden
upper storey must not occlude lower pixels. Asset local bounds describe actual art;
physical footprint/height still comes from original structure definitions. Stair
endpoints and fixture footprint are passed through existing visual projection with
explicit native orientation, and validated on remote wire. No rendered pixels
become saved physical facts. Non-Colony demos use the same draw owner and pipeline.

## Deletions and acceptance

Delete supportDepth/anchor-only subject sort as opaque occlusion authority, rank-only
point picking, any obsolete ordering offsets, and one-big-terrain-behind-all-subjects
assumption. Retain layering only for explicit UI/translucent passes. Do not retain a
parallel legacy renderer as the default after failure.

Acceptance D1-D5 in delivery: original art across orientations, worker behind/front
and on all stair sections, storeys/cutaways, correct click, same output on input
permutation. Measure changed frame CPU/GPU time and asset memory on the same visible
scene. No per-frame exports/readbacks, no quadratic all-world comparisons. A color
screenshot without depth-pick evidence is insufficient. Lead personally inspects.
