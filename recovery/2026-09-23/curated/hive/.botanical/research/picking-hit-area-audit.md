# Picking and hit-area audit

## Scope and screenshot limit

This reviews canvas event routing, texture anchors, and camera transforms for
the report that a click on visible empty ground opened **Timber wall · Ground ·
9,13**. The supplied screenshot shows that resulting inspection panel, but it
does not preserve pointer coordinates, camera pan/zoom, active level, or the
site list. It therefore cannot prove the exact event path or that `9,13` was
the only overlapping target.

## Concrete current risk

The strongest source-backed explanation is an overlarge construction sprite
hit box:

- Each construction site is a Pixi `Sprite` made from a baked building texture
  and anchored with `art.propAnchor`
  ([`construction-view.js` lines 79-84](../../src/construction-view.js#L79-L84)).
  Finished, active-level sites become `eventMode = "static"`
  ([lines 150-163](../../src/construction-view.js#L150-L163)).
- Only a **floor** replaces the Sprite default hit shape, with one 32×16
  projected cell diamond ([lines 101-105](../../src/construction-view.js#L101-L105)).
  Walls, doors, beds, shelves, roofs, and stairs retain the default Sprite
  bounds. The baked prop textures are 112×112
  ([`art.js` lines 54-65 and 106-119](../../src/art.js#L54-L65)). Default bounds
  include transparent padding and are far larger than a ground-cell diamond.
- On a targeted site `pointerdown` and `pointertap` stop propagation, then
  route the fixed site id directly to `inspect-site`
  ([`construction-view.js` lines 106-118](../../src/construction-view.js#L106-L118),
  [`main.js` lines 572-580](../../src/main.js#L572-L580)). Thus a transparent
  texel within wall `9,13`'s rectangle can prevent the stage ground handler
  from closing the target and open that exact wall.
- This becomes less predictable when several 112px sprites overlap: render
  `zIndex` chooses a draw order, but no explicit picking priority or logical
  footprint query chooses the intended target.

This is independent of the recent depth-order issue. A better painter order
may change which oversized sprite wins the hit test, but does not make its
transparent pixels non-interactive.

## Transform and routing findings

- `propAnchor` is calculated from the baked camera's projected world origin;
  all prop sprites share it ([`art.js` lines 41-65](../../src/art.js#L41-L65)).
  Their local default bounds remain the whole texture rectangle around that
  pivot, rather than the building's floor footprint.
- Site placement uses `projectCell(site)` in world-local coordinates
  ([`construction-view.js` lines 122-155](../../src/construction-view.js#L122-L155)).
  Camera presentation applies only a uniform scale and translated world
  position ([`camera.js` lines 14-26](../../src/camera.js#L14-L26)); Pixi target
  testing follows that transform. There is no source evidence that pan or zoom
  alone misaligns a correctly shaped site hit area.
- Stage ground conversion uses the matching inverse: global event point →
  world local → `groundCell`, with the selected level's elevation offset
  ([`camera.js` lines 39-46](../../src/camera.js#L39-L46)). Its rounded cell
  boundary behavior still needs a boundary regression check if selection is
  moved to logical cell picking.
- Stage handlers are intentionally a fallback: they call `input.down`,
  `input.up`, `input.ground`, or `input.groundRight` only for canvas events
  ([`view.js` lines 163-185](../../src/view.js#L163-L185)). Object handlers stop
  propagation in ordinary inspect mode; build-tool mode lets the ground own
  the gesture. That separation is sound, provided object hit shapes are
  truthful.

## Smallest fix

Give every interactive finished site an explicit logical-footprint hit shape;
do not use its baked texture bounds. For a one-cell wall/door/shelf/roof, use
the same projected cell diamond already used for floors. Build bed and stair
shapes from their actual `footprint(site)` cells rather than their anchor alone
([`construction.js` lines 68-77](../../src/construction.js#L68-L77),
[`world.js` lines 36-46](../../src/world.js#L36-L46)). The shape must be in the
sprite's local coordinates: each projected footprint vertex minus
`projectCell(site)`.

A union of adjacent tile diamonds may need a compound hit test/proxy rather
than one self-intersecting `Polygon`. If that proves awkward, the next-smallest
design is a nonvisual interactive footprint proxy in the world container while
the painted Sprite remains `eventMode = "none"`. It keeps the existing
`input.site(id, globalPoint)` route and prevents transparent artwork from
owning ground clicks.

Do not broaden `pointerdown`/`pointertap` propagation or alter camera math as
the first response. A larger future contract may choose a site by
`camera.cell(event.global, level)` and a deterministic footprint query, which
also resolves legitimate overlapping fixtures, but that is not required to
fix the demonstrated default-bounds hazard.

## Focused regression matrix

1. Record the exact screenshot state before claiming a repro: viewport size,
   zoom, world offset, selected level/tool, pointer screen point, returned
   target id, and its logical cell.
2. At zoom 1, 2, and 4 with an off-centre pan, click every corner and edge just
   outside a finished one-cell wall's projected diamond, including transparent
   texture area above and beside the visible wall. Each must reach ground, not
   inspect the wall.
3. Click the centre and all four diamond edge interiors of that wall, door,
   shelf, roof, and floor. Each must inspect its own id only at its active
   level. Test cutaway roof and lower-level support visibility as non-targets.
4. Place overlapping-screen but distinct nearby walls, then repeat the empty
   ground clicks and inspect clicks. Target choice must not vary with render
   refresh or child insertion order.
5. For both bed directions and both stair directions, click each footprint
   cell and just outside its union. Each interior click selects the one site;
   exterior clicks remain ground. Repeat around the stair upper landing at
   level 1.
6. Repeat a one-cell target click and an empty-ground click with a build tool
   active, right-click Go active, box selection, and pan mode. Their existing
   gesture ownership must remain unchanged.
7. Probe every shared tile boundary from both sides. Document the chosen cell
   rule; it must be stable under pan/zoom and agree with the placement grid.

Acceptance is that visible empty terrain cannot inspect a site through padded
or transparent art, while the intended logical footprints remain clickable.
