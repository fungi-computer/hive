# World-scale lab readiness audit

## Decision

Build a separate **World Lab** page as a one-sprint, non-gameplay consumer of a
small shared terrain-coordinate module. The current 15×15 clearing remains the
only playable world. The lab may pan and jump through large signed coordinates,
but it must not create actors, jobs, construction, saves for the home, or routes
that the game can execute.

The lab is useful only if its base-terrain query and patch shape are the ones the
later chunk/caravan cut will consume. It is not a second map engine or a visual
mockup that generates unrelated pixels.

## Bounded lab shape

Use a named `WorldSpec` with a fixed seed, explicit `generatorVersion`, and a
16-cell chunk width. Sixteen is the documented initial candidate and places the
authored 15×15 home within one future chunk; it is a starting granularity, not a
capacity claim. A diagnostic 32-cell candidate may be compared in the same
instrumented page only if it uses the identical coordinate and terrain-query
contract. Do not choose a production chunk width from one browser run.

The page should render a camera-centred 5×5 visible chunk window (80×80 cells at
width 16), generate only that bounded window, and provide deterministic jumps
to `(0, 0)`, `(-1, 0)`, and a far signed chunk coordinate. This is visually
large because the coordinate domain is not preallocated: the far jump must look
like the same world rule, not a finite prebuilt board. A 3×3 window is an
acceptable fallback for constrained devices; the window size is a render budget,
not a world bound.

Base terrain must be a pure query of world identity, generator version, and
global cell/chunk coordinates. Chunk lookup uses mathematical floor division, so
`x=-1` is chunk `-1`, local `15`. Feature ownership must be canonical (for
example, derive a feature from one stable owner coordinate) so requesting either
side of a region edge first cannot create seams or duplicates. Record a compact
checksum for each displayed chunk and demonstrate equal checksums after reverse
request order and after hiding/re-showing it.

Keep player change data separate from generation: `WorldPatch` is sparse,
world-namespaced cell/feature deltas or tombstones layered over base terrain at
query time. A paint/remove diagnostic may alter one cell, move it outside the
visible window, and recover the same patch when it is visible again. A patch is
bound to its world identity and generator version; a generator-version change
opens a different base/patch namespace unless a later explicit migration exists.
It must never serialize a whole generated chunk merely to preserve one edit.

## Bounded measurements

Report measured values without capacity conclusions:

- base-query time per chunk and time to populate the visible window (median and
  p95 over repeated deterministic jumps);
- visible cells/chunks, retained render objects, bytes in explicit tile/patch
  buffers, and create/destroy count per camera move;
- frame interval median, p95, and worst sampled interval during a pan/jump;
- checksum/order-edge outcomes and patch survival after culling.

These are page/device observations. They do not establish an acceptable world
size, streaming budget, 50/100 actor capacity, or hosted fit.

## Lifecycle boundary

The lab proves **visible culling** only: remove render objects outside the camera
window and regenerate pure base terrain when needed. It does not prove streaming
or eviction. Streaming additionally manages resident decoded data, dirty-save
success before eviction, active work/path dependencies, and simulation outside
the camera. The lab has no active simulation and therefore cannot demonstrate
any of those obligations.

Likewise, it cannot claim the next local-caravan proof. That proof needs one
person with real cargo to cross a chunk boundary and return while another works
at home; home data remains resident, a third unoccupied modified chunk is
atomically saved/evicted/reloaded, and restart preserves actors, cargo, jobs,
stumps, and construction. Missing terrain must yield a route/data-needed result,
not an invented walkable cell or dropped cargo.

## Shared seam and anchors

The primary future consumer is the generated-chunk/local-caravan slice. The lab
is its first data/render study consumer: it should consume only a pure shared
global-coordinate, base-terrain, and sparse-patch interface. It must not import
or mutate `Clearing`, commands, jobs, assignments, or local-save slots.

Current anchors show why the seam is needed:

- `src/world.js` has finite `SIZE`, current cell identity, and gameplay topology;
  retain its tiny-map behavior until a deliberate integration replaces its
  finite-domain assumptions.
- `src/movement.js` routes only cells accepted by `inside()` and has no
  missing-data outcome; the lab must not pretend its pan is caravan pathfinding.
- `src/art/scale.js` centres projection and inverse picking on `SIZE`; extract a
  camera-origin/global-coordinate projection helper for both lab and later game
  work rather than copying this fixed-origin math.
- `src/camera.js`, `src/view.js`, and `src/construction-view.js` own the current
  single-world transform, picked ground cells, retained display objects, and
  depth ordering. A lab renderer should exercise the shared projection seam but
  cannot replace their gameplay ownership.
- `src/art/clearing.js` is a single authored cut-earth image; it cannot repeat as
  terrain. The lab needs a deliberately seamless tile/patch presentation while
  preserving the authored home for gameplay.
- `src/main.js` creates one clearing/camera/view. The separate page must mount
  its own study presentation and share only the future terrain-coordinate data
  contract.

This keeps the lab connected to the caravan foundation while preserving the
current tiny home as the only place where commands and outcomes are allowed.
