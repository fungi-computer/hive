# Playable clearing spatial integration

September 20. Playable spatial integration qualified for the feature preview. The owner is
`hive-worktrees/living-terrain-integration`, branch
`engine/living-terrain-integration-20260917`. The actual-game checks below qualify this integration; approximation and performance limits remain explicit.

## Ownership and representation

The checked v7 art pack carries source-generated visual volumes and placement
datums. Original atlas image bytes are unchanged. Physical facing and camera
turn are explicit, separate inputs; the client undoes the camera component of
the chosen baked frame before placing its geometry in world coordinates.

`world-scene-owner.js` owns terrain residency/cuts, actor presentation, local
placement previews, spatial compilation, drawing and the corresponding picker.
The server supplies world facts, not a per-camera draw order. The old scalar
stream and sorter implementations have been removed; surviving placement and
support-query helpers do not compute a competing depth order.

Grass keeps the four-cell dual grid and per-cell full/short state. Its art is
projected onto supported ground quarters; adjoining quarters merge only when
the union is a rectangle. Cover cannot infer support from a previously visible
picture or remain on a buried/cut surface. A same-terrain-revision full→short
change replaces cover while retaining unchanged ground-face records. This
preserves the presentation contract for mowing; no new gameplay mowing command
is claimed.

Placement ghosts and the selected-plane grid are noninteractive UI overlays.
They can intentionally intersect occupied space, including while a proposal is
rejected. They are not physical occluders or inputs to world ordering.

The retained compiler reuses unchanged geometry and relationships across
membership revisions. Removed records are evicted; there is no history of
prepared scenes. Camera changes create a new projection owner. Unchanged
ordinary frames refresh presentation/picking references without rebuilding the
ordering graph.

## Verified evidence so far

All automated commands use the shared host's `run-proof.sh` guard. Working
scripts/results/screenshots are preserved under this worktree's `.botanical`.

- `u2621` / `60e8f6c009b2478db8b5a4652c6a6010`: 32 focused core, retained scene,
  terrain, placement and source-record tests passed.
- `u2625` / `1b244c24acbb424184ddc067096a6448`: actual clearing, 1440×1000,
  four camera turns, two available lower cut levels, 36 pan-right and 36
  pan-left inputs passed without browser errors. Results:
  `spatial-game-views.json`; inspected image: `spatial-game-views-back.png`.
  This build preceded the later preview and fragmentation work.
- `u2634` / `6cf274ab861d41c998c14855284c58b8`: 11 terrain/ghost tests passed,
  including recovery from an over-budget viewport and full→short cover updates.
- `u2641` / `83a75199fbdd42af81c2fefb6642ebdc`: four bundled actual-source art
  placement tests passed, including all physical-facing/camera combinations.
- `u2643` / `ccec9624fa414206a98f513b03097643`: 17 guide, ghost, subject,
  supported-cover and reverse-picking tests passed.
- `u2645` / `368a19145a754811a915a1056f9d3ff0`: public CF browser loaded the
  real clearing and selected Rowan through an exposed alpha pixel. The build
  interaction then **failed** on bed/cat interleaving; this is not a passing
  furniture proof. Failure state: `spatial-game-build-frame-cat-failure.json`.
- `u2653` / `89c321aa8f054a53a9b91e9450f06b4f`: real UI reproduction captured
  exact bed-stakes/cat failure geometry in `spatial-game-build-pieces.json`.
- `u2655` / `6c9d9400de32424fbd6cb9f6bebab84b`: 26 core/retained-owner tests
  passed after current-membership reuse, including changed contacts, rollback,
  fresh presentation references and bounded storage through 120 revisions.

The actual pan run still did excessive geometric work: 23 static rebuilds,
2,070,186 static face comparisons and 14,692,953 candidate visits across the
recorded camera/cut/pan sequence after the last camera reset. The later
membership-reuse correction has small-scene equivalence/work-count evidence;
it still needs the matched actual-game measurement. Shared-host software-GPU
wall times are not an FPS claim.

## Observed overlap that must be handled

An unfinished bed can lawfully be walked through. The real construction test
put a bed at `(0, 7.29, 3)` and the cat near `(0, 7.29, 2.59)`. Original-source
raycasts and checked opaque pixels establish both cat-in-front and bed-in-front
regions; this is not just transparent bounding-box padding. A finished bed also
shows genuine interleaving for some cat pictures just outside its occupied cell.

Levi explicitly chose roughly correct whole-picture rendering over general image
fragmentation. The fragmentation study remains isolated and is not integrated.
For a pair whose geometry genuinely interleaves, the shared compiler chooses a
deterministic camera-depth order and reports `approximateOverlaps`. Ordinary
nonintersecting geometry keeps its geometric order; malformed input and invalid
support contacts still fail validation. No content-name exception is involved.

Construction sites become physical obstacles at completion; the native owner
checks contacts before committing the finished structure. The cat entering an
unfinished site is therefore supported simulation behavior, not a reason to
change collision rules solely to accommodate drawing.

## Final integration evidence

- `u2670` / `440fdad1be07428a9b24d6198de7e9c4`: original bed/cat construction
  reproduction passes with the whole-picture overlap policy; original art inspected.
- `u2674` / `421317d6402948388cee914d28eafa10`: drawing qualification 101/101.
- `u2678` / `c894680488ca470abdcb89c701a9b7eb`: terrain qualification 26/26.
- `u2684` / `e17e8ce2d3904e61a7e502095813e041`: final core/retained laws 27/27,
  including deterministic visual-cycle recovery and mandatory support precedence.
- `u2686` / `295c80ce2b7a487d8f23199938631cef`: real UI built a bed, wall and
  stair and saved the resulting world. Its subsequent movement check failed;
  this receipt is construction/save evidence only.
- `u2698` / `a560c9fcdae24cc293574d2b37a916b4`: actual UI Continue restored that
  save, selected Rowan, clicked Draft, and walked seven waypoints around the
  completed furniture before showing all four camera views. Exit 0, no browser
  errors. `spatial-game-walk.{mjs,json,png}` and `spatial-game-walk-drafted.log`.
  The earlier movement test omitted Draft. Exact browser command tracing and
  native replay isolated that difference; no simulation physics was changed.
  The misleading help now explicitly says to Draft before right-click movement.
- `u2701` / `831c3fd874b644ceb2c1c224157a5dfc`: 10/10 projection-cache tests,
  including same-voxel-revision full→short cover through the upstream cutaway
  cache. The original bug was reproduced before correction (`u2700`).
- `u2702` / `9e5eb0955a144025a28f450e928e005c`: final Vite production build passes.
- `u2703` / `fd923535a96c41d7a591e2d5ecfc4b2a`: final build over the public
  Cloudflare tunnel, four turns, two lower cut levels, cutaway off, 36 right and
  36 left pan inputs. Exit 0, no browser errors. Screenshot personally reviewed.
  `spatial-game-views.{mjs,json}`, `spatial-game-views-final.log`,
  `spatial-game-views-back.png`.
- `u2705` / `d23c2a5476b44e8aa60b707b66b37cc8`: final-build saved-world Continue,
  paused idle interval with unchanged rebuild/apply counts, occupied-bed hover
  rejected as no visible surface, and Escape cleanup with unchanged physical
  record count. Exit 0, no browser errors. `spatial-game-hover.{mjs,json,log,png}`.

Independent source review covered scene ownership, preview exclusion, retained
ordering, shared picking and cleanup. It found the upstream cutaway cache bug
above, now fixed. Fallow was unavailable; no clean Fallow audit is claimed.
The repository-wide TypeScript check has existing missing-type errors; focused
source tests, bundled game-source datum tests and the actual build are the
validation used here.

## Costs and remaining limits

Final public camera/cut/pan run after the last camera reset: 23 static revisions,
221,514 static face comparisons and 1,614,094 candidate visits. The earlier
same-sequence spatial implementation did 2,070,186 comparisons and 14,692,953
visits: reductions of 89.3% and 89.0%. Membership reuse preserved 185,999 prepared
records and 678,932 relations cumulatively across revisions. These are work
counts, not retained-memory counts or FPS measurements.

The final run accumulated 6,504 ms compilation and 1,811 ms draw application on
a shared host/software GPU. Camera changes and newly visible terrain still do
substantial work; this is not a claim of smooth hardware performance. The old
scalar baseline used a different cut sequence, so its whole-run wall time is
not a matched comparison.

Before and after the public pan round trip, retained ownership was exactly
9,811 static records, 38,055 static relations, 228 static bins, four dynamics,
and 9,815 current records. Removed memberships are evicted; unit laws also
exercise 120 revisions. This bounds the measured retained scene, not total
browser RSS. The existing chunk-cache and mesh budgets remain in force.

The seven-waypoint saved-world movement interval accumulated 72 compiles,
3,994 dynamic face comparisons, 3,961 ms compilation and 1,282 ms draw
application. One remaining initial terrain population accounts for its single
static revision. These timings include shared-host contention and are recorded
separately from terrain residency work. Paused unchanged frames require no
order rebuild or draw reapplication (explicit browser assertion above).

True whole-picture overlaps and visual cycles use deterministic camera-depth
approximation. Small imperfect overlaps are an accepted limit; image
fragmentation is not integrated. Approximation counters report work performed,
not a persistent count of visible imperfect pairs. Physical support validation
remains strict. Grass keeps all four dual-grid supports and full/short state;
this change does not add a gameplay mowing command.

Public playable preview (browser-verified, local-runtime saves):
https://belong-soul-article-being.trycloudflare.com/engine/colony.html?runtime=local
The tunnel and feature server remain running. No production/backend deployment
or main merge was performed.

Original pre-integration cut-layer edits are preserved byte-for-byte under
`.botanical/spatial-integration-preserved/`. No main merge, backend/production
deployment or dependency installation is authorized by this work.
