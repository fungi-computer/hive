# Isometric occlusion readiness contract

## Scope

This is a read-only readiness note for the reported Rowan/bed overlap in the
captured image. It describes a rendering contract; it does not change the
construction model, actor movement, or the active upstairs work.

## What the current renderer actually does

- The screenshot shows Rowan painted across the bed surface. That result is
  plausible under the current single-point ordering, but the image alone does
  not establish which painted pixels should be in front in every pose.
- [`src/view.js`](../../src/view.js#L19-L27) assigns every actor a depth of
  `x + z + level * .35 + layer`. Actors are added to the sortable `bodies`
  container ([lines 49-57](../../src/view.js#L49-L57)) and refreshed with that
  key ([lines 398-404](../../src/view.js#L398-L404)). The small actor layer is
  `.1`; it is not a footprint comparison.
- Construction sprites enter that same container through
  [`construction-view.js`](../../src/construction-view.js#L101-L120). A normal
  site receives its anchor-cell key plus `.15`
  ([lines 159-163](../../src/construction-view.js#L159-L163)). Cutaway only
  changes wall/roof alpha; it does not sort an actor against a building
  ([lines 127-138](../../src/construction-view.js#L127-L138)).
- A bed occupies two simulation cells: its anchor and its facing cell
  ([`construction.js` lines 68-77](../../src/construction.js#L68-L77)), but it
  is one site and one sprite. Its art is a long box/blanket model extending in
  local `z`, then rotated by direction
  ([`art/home.js`](../../src/art/home.js#L96-L108)). A stair has three ground
  cells plus an upper landing ([`world.js`](../../src/world.js#L36-L46)) yet is
  also one anchored sprite.
- Baked pawn art is 80x80 and construction art is 112x112. Both are positioned
  at a baked projected-world-origin anchor ([`art.js`](../../src/art.js#L44-L62),
  [`construction-view.js`](../../src/construction-view.js#L79-L84)); neither
  stores its opaque pixel extent or its multi-cell depth extent. The orthographic
  projection in [`art/scale.js`](../../src/art/scale.js#L19-L41) supplies screen
  position, not an occlusion relation.

The consequence is precise: changing `.1` or `.15` can choose one global
answer for a bed, but cannot let an actor appear behind its far portion and in
front of its near portion. Equal `x + z` positions also currently depend on
incidental child order.

## Reference and applicable rule

Shaun Lebron's [*Isometric Blocks*](https://shaunlebron.github.io/IsometricBlocks/)
is a primary implementation explanation for this exact class of painter-order
problem. For non-intersecting axis-aligned volumes it first tests overlap of
their projected 2-D silhouettes, derives a before/after relation only when a
separating axis proves one is behind the other, then topologically sorts that
partial-order graph. It also calls out cycles and splitting/clipping geometry
as the remedy. Its coordinate signs must be calibrated against Hive's camera;
they must not be copied verbatim.

## Candidate render contract

Keep simulation occupancy separate from rendering. A `Site` remains one bed or
stair for claiming, construction, saves, and clicks. Its renderer exposes one
or more **occlusion parts**, each with:

- a stable part id and display object;
- an axis-aligned world footprint/volume or an equivalent projected polygon;
- a declared visual layer only for intentional effects such as shadow and UI;
- a stable fallback order for unrelated parts.

An actor contributes a small foot volume at its visual/world position. Broad
phase compares only parts whose projected bounds overlap. For each candidate
pair, projected overlap plus a camera-calibrated axis separation creates a
directed `behind -> in-front` edge. A stable topological sort supplies draw
order. Absence of an edge means neither object is arbitrarily made in front.

Cycles are real, especially with several long transparent/overlapping sprites;
they are not a tie-break problem. Report them in development and split the
*rendered* geometry at an existing footprint boundary (or use a deliberately
defined clipped pass). Do not split the bed's construction state, resource
cost, selection target, or save record. A cycle fallback must be deterministic,
but should not be advertised as correct occlusion.

## Smallest useful patch versus the general contract

For this bed/Rowan report, the smallest robust patch is to give the existing
single bed site two depth-relevant render parts aligned to its two-cell
footprint, with the same art/selection owner. That permits an actor to draw
between its far and near portions. A single revised bed `zIndex` is only a
one-pose cosmetic fix and will regress an approach from the opposite side.

The first implementation checkpoint should therefore be the bed renderer and
the actor-foot comparison in [`construction-view.js`](../../src/construction-view.js)
and [`view.js`](../../src/view.js), using the existing direction/footprint
definition from [`construction.js`](../../src/construction.js). It needs an art
decision on how to bake or mask the two pieces of the current bed model; merely
duplicating the full baked sprite would double paint it.

The larger renderer contract becomes necessary before treating stairs, roofs,
walls, or future multi-cell fixtures as generally solved. Stairs are the next
consumer because their 3-cell run and raised landing make an anchor-only key
especially misleading. It should be introduced only after the bed checkpoint
has demonstrated its part metadata and ordering policy.

## Focused acceptance poses

1. Preserve the exact captured Rowan/bed state as a named visual case: record
   the site `{x,z,level,direction}`, Rowan visual position, facing, pose, and
   cutaway/selected-level state rather than inferring them from the screenshot.
2. For both bed directions, place an idle Rowan on each of the two walkable bed
   cells and on each cardinal end/side approach cell. Check that the intended
   near/far portions of the blanket, pillow, and feet read consistently.
3. Repeat the two diagonal positions with the same `x + z` as a bed cell. This
   catches the present incidental insertion-order tie.
4. Put Rowan and the other pawn on opposite sides of one bed. The result must
   permit interleaving around the two bed parts without duplicate bed pixels.
5. Repeat the captured pose while walking and carrying, since the actor's
   visual position is interpolated in [`view.js`](../../src/view.js#L398-L404).
6. Use the same matrix at an upstairs bed and with a pawn on the lower stair
   run, middle run, and upper landing. Verify that cutaway visibility does not
   hide an ordering defect.

Success is visual, deterministic across refreshes, and limited to the same tiny
map. It does not imply a universal isometric renderer until a stair case passes
under the part/partial-order contract.
