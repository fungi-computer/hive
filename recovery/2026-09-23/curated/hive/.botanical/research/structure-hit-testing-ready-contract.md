# Structure hit-testing readiness contract

Status: source/API readiness only. No production or proof change is part of this
document.

Baseline: deployed `32cd4235e22a6f7d456c3100d87fa8abd89475cd`.

## Source finding

`src/construction-view.js` creates one `Sprite` per site and assigns the
finished active-level event mode in `drawSites`. Site sprites have no general
`hitArea`; Pixi therefore falls back to the texture bounds. Floors are the only
exception, with a 32x16 polygon. The 112x112 baked prop bounds are consequently
large enough for transparent padding and overlapping wall/floor/roof sprites to
intercept a bed click. The existing `cutawayWall`/`cutawayCover` branches set
`eventMode` and alpha correctly and must remain the ownership boundary.

The final10, final11, and final12 artifacts show the same failure shape: the
Upper fixture is reached without page, console, or request errors, but the
intended bed assertion times out after the selected card resolves to an upper
wall, floor, or roof. This is a hit-area/z-order failure, not a missing command
or a proof-only DOM target.

## Chosen representation

Create one local-coordinate CPU visible-silhouette hit shape for each actual
Pixi `Texture`, once at bake time, after the final outline is applied. Store
contiguous opaque row spans in compact typed arrays (multiple spans per row are
allowed). The shape implements Pixi v8's `hitArea.contains(x, y)` contract:

```text
local sprite coordinates -> pixel x/y using the same propAnchor -> row spans
```

Use the final canvas alpha with one documented visibility threshold. Do not
collapse the shape to a rectangle: transparent padding must reject, while every
visible wall/body pixel—including the tall upper wall/body and the low bed
body—must accept. The representation is local to the baked texture, so camera
scale, storey projection, and parent transforms continue to be handled by
Pixi. It is not a second logical selection model.

The cache is a `WeakMap<Texture, VisibleSilhouette>` owned by the art bake API
(or an equivalent texture-identity cache with the same lifetime). `bake()` is
the only creator and scans the already-rendered CPU canvas once. The pointer
path performs only `contains`; it does not call `renderer.extract`, `readPixels`,
`getImageData`, or any other GPU/texture readback. A texture produced for a
different wall mask is a different cache entry.

## Immediate caller boundary

1. `src/art.js` registers the silhouette immediately after `Texture.from(canvas)`
   and after outline pixels are final. The public art result exposes a narrow
   `hitAreaFor(texture)` lookup; it does not expose a generic picker or mutable
   selection state.
2. `src/construction-view.js` assigns `view.hitArea = hitAreaFor(view.texture)`
   when a site sprite is created and whenever `drawSites` changes its texture.
   The current floor-only polygon is deleted as a competing hit owner; the
   cached floor silhouette must still accept the projected 32x16 cell diamond
   and reject its transparent padding.
3. The caller does not change `visible`, `alpha`, `eventMode`, z-order, pointer
   handlers, `groundPointerOwns()`, camera projection, active-level gating, or
   the existing `input.site(site.id, event.global)`/right-click path. The shape
   only narrows the candidate sprite before those existing handlers run.

No per-site mask is required when sites share an immutable baked texture. If a
future caller supplies site-specific pixels, its texture identity must be the
cache key; never reuse a mask across changed texture pixels.

## Required behavior

- An opaque finished structure on the selected level remains selectable at any
  visible body pixel, including the top of a tall wall.
- A transparent corner/padding point in that structure is not selectable, so it
  cannot steal a neighboring bed or another structure.
- Ground/Upper visibility and active-level filtering remain exactly as they are:
  hidden or support-context-only sprites do not become interactive merely
  because their mask contains the pointer.
- A finished cutaway wall and a finished cutaway roof retain their current
  faded rendering and `eventMode = "none"`; an opaque active-level wall/roof
  retains normal selection. No alpha or cutaway rule moves into the mask.
- Armed placement, Chop/Herb strokes, pan, box selection, camera movement,
  Escape/right-click cancellation, and Draft/Go keep their current input owner.
  A successful sprite hit must still pass through the existing gesture guard;
  the mask cannot synthesize a selection or command.

## Cache lifetime and invalidation

The cache lifetime follows the immutable baked texture lifetime. Site removal
continues to destroy/delete its existing view; it must not leave a site-keyed
selection or mask registry. A texture replacement gets a fresh lookup. If a
texture source is ever mutated in place, the art API must increment its source
version or explicitly evict the WeakMap entry before the next draw; current
baked art has no in-place pixel mutation. Texture destruction must not retain a
strong reference through the cache.

## Deletion test

The implementation is not ready if any of these remain in the site hit path:

- the floor-only `new Polygon(...)` hit-area branch as a second owner;
- reliance on default Sprite texture bounds for any structure;
- per-pointer or per-frame pixel reads, GPU extraction, or mask reconstruction;
- a second selection/hover/tool store, DOM mirror, writable browser test hook,
  or altered pointer/right-click dispatcher.

The source check must show one `hitAreaFor(texture)` assignment boundary and no
other structure hit policy. A static test should also prove that a replacement
texture receives a new shape and that a removed site has no retained site cache.

## Acceptance evidence

The focused browser proof must use real projected coordinates and the existing
read-only game facts, not a DOM mirror or injected selection. Before the first
click it should record that the silhouette cache was built once for each used
texture; repeated clicks must not increase that count or invoke any pixel/GPU
readback API.

The fixture must then prove, in one normal run and the narrow layout where
applicable:

1. Upper + cutaway: clicking the visible bed body selects the bed/site target,
   not a wall, floor, or roof behind its transparent padding.
2. Clicking transparent padding beside that body leaves the correct target
   unchanged and does not select a neighboring structure.
3. Clicking visible tall wall/body pixels selects an opaque active-level wall;
   clicking the same faded cutaway wall or finished cutaway roof does not
   intercept. Turning cutaway off restores opaque roof/wall selection.
4. Ground cannot select Upper structures and Upper cannot select hidden lower
   structures; the existing active-level/support context remains observable.
5. An armed tool, pan/box gesture, camera move, right-click, and Escape retain
   their existing cancellation and command behavior after the hit-area change.

The proof should retain the prior exact fixture claims and report the deployed
asset/source hashes, target coordinates, selected target kind/site, cache-build
count, and absence of page/console/request errors. A failure must distinguish
`eventMode`/gesture suppression from a silhouette miss by recording the
read-only target and command/notice facts immediately after the real pointer
event.

This contract does not authorize implementation, build, browser, Git, dist,
provider, or script changes.
