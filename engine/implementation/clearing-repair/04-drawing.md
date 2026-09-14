# Spatial drawing: lawful isometric sprite order

September 14: [Declarative art parts](06-edge-buildings-and-art-parts.md) supersedes
one-point thin-wall and unconditional scalar-band guidance below. Edge walls use
their segments; stairs require independently ordered rails/support surfaces and
vertical extents. Ordinary Pixi, spatial indexing and the shared picker remain.

[Packet index](README.md) · [Coordinates](02-construction.md)

## Decision

The Clearing uses ordinary Pixi sprites and `zIndex`. The renderer derives a
deterministic partial order from canonical voxel placement, physical footprints,
visible projected bounds and stable identities. It does not use sprite pixels as
physical truth and does not write or sample a per-pixel world-depth buffer.

This decision supersedes the failed paired color/depth runtime. Remove that
runtime and its picker rather than retaining a fallback. Keep the original Three
to low-resolution bake to Pixi art pipeline, alpha silhouettes, placement datums,
terrain geometry queries, cutaways and current world facts.

## One render record

Every visible world part contributes this presentation record:

```ts
type IsoRenderRecord = {
  entityId: string
  partId: string
  role: "terrain" | "floor" | "structure" | "actor" | "item" | "water"
  storeyBand: number
  footprint: readonly WorldPoint[]
  projectedBounds: ScreenBounds
  display: PIXI.DisplayObject
  moving: boolean
  visible: boolean
  pickable: boolean
  hitArea?: AlphaSilhouette
}
```

The record is derived from the same canonical placement and orientation used by
construction. A person, one-voxel wall or other compact prop supplies one support
point. Only an object that actually spans several voxels supplies a line or area:
a bed uses its two cells, a stair uses its entrance and landing, and a 2×2 brewer
uses its oriented footprint bounds. If one sprite can genuinely interleave with another,
split it into stable render parts at the content boundary; do not invent a scalar
depth that discards the long footprint.

Visual bounds cover the complete current pose, including carried props. They only
cull comparisons. Collision bounds, support, reachability and saved geometry
remain owned by their physical systems.

## Ordering

First partition records into explicit voxel storey bands. Terrain and floor faces
form the base of their band. Structures, actors and items occupy the bands covered
by their physical vertical extent. Cutaway and selected level filter records before
ordering, so a hidden upper floor cannot occlude a lower actor.

Within relevant bands:

1. Compare only visible records whose projected bounds overlap.
2. Compare point, line and multi-cell bounds in the shared camera coordinate
   system and add a `behind -> in front` edge only when geometry establishes it.
3. Leave ambiguous non-interleaving pairs to the stable total key
   `(storeyBand, role, entityId, partId)`.
4. Resolve the graph with deterministic Kahn topological ordering. The ready queue
   and edge traversal use stable keys, never insertion order.
5. Report cycles in development with the involved parts. The release path removes
   the least authoritative ambiguous edge by a documented stable edge key; a
   recurring real cycle requires splitting the offending render part.

The sorter owns these rules behind one narrow operation. Callers submit records
and receive the final back-to-front order; they do not coordinate private maps or
apply a competing rank formula.

## Cache and invalidation

Cache static-to-static relationships. Invalidate affected relationships after a
terrain/topology revision, construction, destruction, replacement, rotation,
footprint or level change, cutaway change, and camera projection/orientation
change. Camera translation or uniform zoom may update screen bounds without
changing footprint relations when the projection basis is unchanged.

Actors and other moving records bypass the static relation cache. Recompute their
relationships only against overlapping visible statics and movers in the current
neighborhood. Animation, facing or carried-prop changes invalidate visual bounds;
support cell and level changes invalidate storey/neighborhood membership.

Static cache contents are disposable presentation data. They rebuild from current
world facts and are never saved or broadcast.

## Terrain, water and overlays

Terrain is ordinary Pixi imagery produced by the existing bounded terrain
scene/cache. It occupies explicit terrain/storey bands instead of a depth-writing
render target. Water remains a translucent, nonpickable presentation layer derived
from the authoritative 0-7 water facts. It follows cutaway/level visibility,
writes no physical state and never becomes an opaque picking surface.

Selection markers, labels, progress bars, placement ghosts, designations and aim
arcs are deliberate overlays. Their display order cannot alter physical ordering,
admission or authoritative time.

## Picking

Entity picking consumes the same render records and final order used for drawing.
At one pointer/frame snapshot, filter by projected bounds, apply the existing alpha
silhouette, then inspect front to back. Determine the visible frontmost record
before applying pickability so a visible nonpickable wall can occlude an actor.
Resolve a render part back to its entity identity.

Terrain tools intentionally use the canonical support-plane/voxel query so a floor
can be targeted beneath furniture. That acquisition rule does not create a second
entity ordering system. Rectangle selection keeps its existing owned-actor
semantics.

## Art datum alignment

`structure_geometry.rs::fixture_cells` owns physical orientation. Art recipes own
their original pivot, facing and footprint metadata. `resolveWorldArtPlacement`
maps those facts and supplies the render origin and oriented footprint. The sorter
must not infer placement from a depth atlas or sprite name.

Verify the one-point wall datum and the bed, brewer and shelf multi-cell footprints
in every supported facing. Verify stairs from entrance to landing in all four directions. Fix a mismatch at
the placement/art datum boundary; never change native geometry to fit a sprite.

## Acceptance

Focused laws cover input-order independence; point, line and area relations; actor
front/behind both bed facings; stair entrance/midpoint/landing; one-cell walls, shelves,
brewers, trees, floors and actors; cache invalidation; two moving actors; and
front-to-back alpha picking including a nonpickable occluder.

One bounded real game witness must show intact original terrain, trees, goblins,
water, furniture and animation while exercising Draft, Go, Undraft, drag-dig,
floors, walls, furniture, floor replacement beneath furniture, stairs and layer
controls. It also proves party-derived Rowan/Sedge selection, current-format
save/reload and the hosted DO path. The lead personally inspects desktop and narrow
captures. A source test or screenshot alone does not prove the full interaction.
