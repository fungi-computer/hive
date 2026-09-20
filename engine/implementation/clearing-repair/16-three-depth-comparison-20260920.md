# Three.js depth comparison — executable implementation packet

Date: 2026-09-20. Owner: Game CTO. Status: **implemented locally; hosted preview pending integration custody**.

Levi authorized a bounded test of direct Three.js world rendering, implemented
from this packet and published at a different preview URL. This is not approval
to replace the game renderer. It temporarily supersedes the Three → bake → Pixi
requirement and packet 04's prohibition on runtime depth **inside this isolated
study only**. Do not revive the previous baked color/depth-atlas experiment.

## Outcome and boundaries

Deliver a small interactive study that answers: can the original 3D art provide
dependable occlusion, camera rotation and terrain cutaways, at acceptable measured
cost, with substantially less custom visibility machinery?

Use real original meshes, an orthographic camera and ordinary GPU depth testing.
Draw at low native resolution with sharp enlargement. Do not implement a painter
sorter, sprite depth atlas, fragment linked list, generalized rendering framework,
new world generator, or second simulation. Preserve existing game preview and art.

**No Three → Hive → Three round trip.** Hive's eventual input to this client
owner is only authoritative world facts: stable IDs, terrain/cover definitions,
positions, orientations and activity. The client owner turns those facts into
retained original Three models, and Three renders those models directly. Hive
does not ingest a Three scene, store meshes, issue a renderer-neutral draw list,
or reconstruct geometry after the models are built. This study's local fixture
stands in for that facts input; it is not a second Hive simulation.

The user must be able to pan, zoom, rotate, change layer, inspect a moving actor
behind furniture and terrain, reset, and repeat the troublesome leave/cut/return
sequence. A pretty still image or successful command receipt is not acceptance.

The study uses a deterministic authored diagnostic scene, clearly labelled
"Rendering experiment · local scene". It is not a live Colony session and has
no backend requests, save commands, work simulation, or multiplayer claims.
The current public backend's exact-origin CORS rule prevents assuming that a
second preview origin can use it. No backend change is needed for this test.

## Checkout, custody and deliverables

- Base: `cf9c7854a401cbb245d4b98bf0a32aa2515f81ae` (September 19 game + proof).
- Prepared isolated root: `/home/levi/src/hive-worktrees/three-depth-study-20260920`.
- Branch: `engine/three-depth-study-20260920`. Continue from the packet commit on
  this branch; do not reset it to the base SHA.
- One implementer owns this coupled study. Reviewers read this root without edits.
- `/home/levi/src/hive` contains unrelated dirty/conflicted work. Do not edit it.
- Preserve the integration lane and existing preview alias. No main merge,
  production deployment, backend deployment, package install or dependency update.
- `three`, Vite, Playwright and Wrangler already exist at the base. Reuse the
  existing dependency installation read-only (an absolute `node_modules` symlink
  in this new worktree is acceptable after checking it is absent). Do not run an
  install command against another lane's dependencies.

Add these bounded files; split internal responsibilities only if needed:

| File | Responsibility |
| --- | --- |
| `three-depth-study.html` | Separate entry with canvas and controls |
| `src/studies/three-depth/page.js` and `.css` | DOM controls, lifecycle, human-readable status |
| `src/studies/three-depth/fixture.js` | Versioned immutable scene data and deterministic pose replay |
| `src/studies/three-depth/assets.js` | Original-model preparation, bounded pose bank and owned resources |
| `src/studies/three-depth/terrain.js` | Visible solid faces, factual cover, bounded chunk rebuild/eviction |
| `src/studies/three-depth/renderer.js` | Deep public presentation owner; scene/camera/depth/picking/disposal |
| `src/studies/three-depth/*.test.js` | Focused non-browser laws |
| `scripts/prove-three-depth-study.mjs` | Short deterministic browser visual/interaction/performance proof |
| `vite.three-depth.config.js` | Study-only build; separate output directory |
| this packet + `evidence/20260920-three-depth-RESULT.md` | Source pins, proof limits, final URLs and decision evidence |

Do not refactor the current production renderer as part of this study. The
experiment may coexist because Levi explicitly requested a comparison; it must
not become a second production implementation maintained indefinitely.

## Read these real sources before writing

Paths are relative to the prepared root. Read the implementation and named caller.

| Source | Reuse and caution |
| --- | --- |
| `src/art/living-terrain.js` | `terrainBody`, `terrainBodyPart`, `grassCover`: original deterministic geometry and palette |
| `src/art/living-terrain-authoring.js` | Existing stepped court, pit, path and dual-grid cover composition: start here |
| `src/art/clearing.js` | `tree("standing")`: original tree geometry |
| `src/art/home.js`, `src/art/stair.js` | `building("bed"/"stair"/"wall"/"door", "finished", direction)` |
| `src/art/figures.js` | `figure("goblin", phase, directionRadians, "walk")`: posed factory, not retained rig |
| `src/art/geometry.js` | `scene()`: one shared light rig; materials cached globally by color |
| `src/art/prop-camera.js` | `camera(width,height,targetY,depth)`: exact initial art projection |
| `src/art/static-batch.js` | `batchStaticScene`: existing material-preserving merge; destructive, bakes world matrices |
| `src/studies/brewhouse/composition.js` | `attachModel` pattern strips factory lights when composing one world |
| `src/art/bake.js`, `src/art/static-manifest.js` | Accepted raster/outline/color conventions; bake destroys geometry by default |
| `engine/src/client/mixed-render-fixture.js` | Existing bed/stair overlap witness positions; not a generic world generator |
| `engine/src/client/terrain-visibility.js` | Existing cell bounds and dual-grid cover/support semantics |
| `engine/src/client/cut-terrain-layer.js`, `terrain-face-batches.js` | Current retention and mesh rebuild costs being investigated, not code to port |
| `engine/scripts/verify-static-preview.mjs`, `wrangler.jsonc` | Existing frontend upload/readback mechanism |

Known source discrepancy: `home.js` stair metadata declares landing Z=-2, while
`stair.js` geometry rises toward +Z and has landing around `(0,2.16,2)`.
The study route follows actual geometry; record the mismatch as a future
integration blocker. Do not silently change native stairs or shared metadata.

## Fixed scene and controls

Use a version-1 data object containing bounds, voxel scale, explicit columns/runs,
factual covers, stable object IDs/transforms, and a replay path. Validate finite
coordinates, unique IDs and positive scale once on load; reject unknown versions.
It is fixture data, not an engine save or an alternative terrain authority.

Start with a **16×16** court, using the original living-terrain authoring scene's
palette, variants and placements as the source for the composition. Include:

1. A grass-to-earth winding path that crosses an 8-cell chunk boundary, plus one
   straight path; mixed short/full and green/dead grass; no cover on a cut face.
2. Earth and stone at several integer voxel levels, a two-layer pit and a raised
   bank that hides a walking actor. Neighbor cells straddle negative coordinates.
3. One original tree, a finished bed, stair with raised landing, and wall/door.
   Put at least one object and cover patch across a chunk boundary.
4. Two original actors: one replays a loop around the bed/tree/bank; the other
   traverses the stair from entrance to landing. Include stopped witness poses
   at both bed ends, both sides, and stair bottom/middle/top. These are visual
   pose replays, not proof of native navigation or sleeping capability.
5. A second **32×32 dense** preset extends the same authored pattern, with the
   same assets and two actors. Label it an authored stress fixture. Do not make
   world-population or generated-world performance claims from it.

Include a small shallow water patch as a separately switchable transparency
witness. A single horizontal surface may use alpha blending, depthTest=true,
depthWrite=false, after opaque geometry. Verify a nearer bank still occludes it.
This does not qualify intersecting transparent volumes or general fluid rendering.
Keep water off for initial opaque-scene profiling; also report the water-on result.

Controls: drag to pan, wheel zoom, Q/E or arrow buttons for quarter turns,
azimuth slider for continuous rotation at fixed 30° elevation, layer +/- and
"Full terrain", Play/Pause, frame/pose scrub, Reset view, Reset scene, preset,
and "Repeat view loop". Show selected ID or terrain cell after clicking.
Use one small control table for buttons/keys/help. All camera state stays local.
Do not add gameplay buttons, a profiler dashboard, or another UI framework.

Reset view restores exact initial target/azimuth/zoom/layer, not an approximate
inverse of accumulated gestures. Reset scene also restores replay time and data.
URL state may use `scene`, `turn`, `layer`, `t`; validate it and use sensible
defaults. Show a clear error if WebGL is unavailable; no secret fallback renderer.

## Deep owner and invariants

Expose one owner to `page.js`; do not leak Three objects, Maps or resource resets:

```js
const view = createDepthStudy({ canvas, onSelection });
view.setScene(sceneData);             // validated replacement, owns cleanup
view.setView({ target, azimuth, zoom, cutLevel }); // cutLevel=null means full
view.setReplayTime(seconds);          // deterministic presentation only
view.resize({ cssWidth, cssHeight });
view.pick({ cssX, cssY });             // stable object ID or terrain cell
view.render();                       // owner resolves all internal dirty work
view.inspect();                      // read-only counts/timing/current view
view.dispose();                       // idempotent, owns resources/listeners
```

The page can own one RAF loop and invoke these useful operations. The owner must
not require the page to sequence a terrain cache reset, a material reset, a pick
index reset and a draw reset. Internal asset/terrain helpers are private owners.

Required laws:

- Same scene revision + exact view + replay time + raster dimensions yields the
  same pixels on the same browser/GPU, regardless of previous camera history.
- Painting and picking use the same visible geometry and cut state. Objects
  hidden by a nearer opaque surface cannot be selected through that surface.
- Camera changes do not mutate scene data or trigger model factories. Pan/zoom
  within resident coverage only changes camera matrices and visibility.
- Cover belongs to its original factual surface and condition. Cutting terrain
  cannot transplant it onto a newly exposed earth/stone cap.
- Applying the same scene twice is idempotent. Replacing/resetting/disposal
  removes old actors, terrain, pick mappings and owned resources together.
- There is no per-object world `renderOrder` policy, pairwise overlap sorter,
  camera-specific model bank, or opaque/transparent precedence overriding depth.

### Camera and raster

Use `WebGLRenderer`, antialias=false, pixelRatio=1, sRGB output, and the existing
camera's initial angle/scale (16√2 pixels/metre). Use a 640×400 logical view on
desktop, proportionally reduced to fit a narrow host; enlarge at integer factors
when possible and letterbox rather than stretch. Keep camera frustum matched to
native raster dimensions. Apply zoom once via the camera, not a second CSS zoom.
Convert CSS pointer coordinates through the actual letterboxed canvas rectangle.

Keep near/far positive and tight enough for this scene; the camera factory
accepts depth >=80 (use 256 initially). Orbit around a fixed target while
maintaining elevation; preserve world-space lighting, not a light per model.
Capture the factory camera's actual target-to-camera distance after construction
and preserve that radius during orbit. The depth=256 factory retreats the camera;
reconstructing its position from the old `(12,...,12)` radius can put it inside
the dense scene. Verify all fixture bounds remain between near/far at every turn.
No antialiasing, device-pixel-ratio inflation, temporal filter or dynamic shadows
in the baseline. The original bake does not enable shadow maps either.

Start with the canvas directly enlarged using CSS `image-rendering: pixelated`.
No mandatory extra render target/postprocess. The original bake's one-pixel ink
outline is applied per sprite, so direct 3D will not match it automatically.
Show reference original bakes beside the study or behind a comparison button;
explicitly record outline/lighting differences. Do not recolor/remodel assets or
spend the experiment building a new outline system to conceal an appearance gap.

### Terrain, cutaways and retention

Use an 8×8 X/Z chunk owner over the bounded fixture. Horizontal cell size is one
metre; vertical voxel scale is 0.54 metres (do not scale X/Z by 0.54).
Cell `(x,y,z)` has top `(y+0.5)*0.54`. The original terrain body has top local
Y=0 and bottom=-0.54. Position it accordingly. Generate only exposed top and
four side faces from solid occupancy; include neighbors across chunk seams.
Do not use the two camera-facing baked side types as a geometry visibility rule.

For cut level L, treat cells above L as hidden and generate caps where solid
continues above the cut. Caps use the original earth/stone top mesh. Grass comes
only from factual surfaces at or below L, never inferred from cap material or
the selected layer. Build dual-grid masks separately for equal surface level,
height and condition, with bits at `(x,z),(x+1,z),(x+1,z+1),(x,z+1)` and patch
origin `(x+.5,z+.5)`. Preserve original .003/.008/.009 vertical detail offsets.
Assign each patch exactly one owner: the chunk containing its integer root
`(x,z)`, using `Math.floor(x/8)` and `Math.floor(z/8)` including negatives.
Include the one-cell outer root fringe required by covers at the fixture edge;
the residency bound includes those fringe chunks. Read all four cells from the
fixture, including neighbors outside the owner chunk. Never emit one patch from
each supporting chunk. Bounds/culling include blade height and full patch extent.

For this study, props/actors whose support level is above L are hidden; retained
objects are shown whole. A stair is retained if its entrance support is retained.
This is a terrain-layer cutaway test, not arbitrary clipping/capping through a
bed or character. Document that limit; do not add global clipping shaders that
slice actors standing on the selected surface. The upward-looking underside
view is outside scope; terrain bodies have no bottom face.

Reuse `batchStaticScene` inside identity-root terrain chunk groups, separately
for body and cover. It applies world matrices and disposes input geometries:
never call it on shared prototype geometries or a transformed parent and then
apply the same transform again. Do not merge the entire world and actors into
one mesh. Keep semantic terrain body geometry mapped to cells for picking;
cover hits may resolve to their supporting surface rather than to a blade ID.

Concrete batching/picking join: before calling `batchStaticScene`, traverse its
input meshes in the same order and build a Map keyed by the exact material
object. Append `{firstTriangle, triangleCount, target}` ranges for each source
mesh, with count `(geometry.index?.count ?? position.count)/3`. The helper
concatenates meshes in that material/traversal order. Store the range table
against each output mesh's material; resolve `Raycaster.faceIndex` by that table.
Assert the output triangle count equals the final range end. Restrict this helper
input to known original single-material full-draw-range meshes, as its code does;
fail clearly on unsupported input. Do not expect custom attributes or `userData`
to survive the helper. A focused test must hit two adjacent same-material cells
after merging and get distinct correct cells. Cover ranges retain root/mask and
support cells; resolve a cover hit to the nearest valid supporting cell in X/Z
(stable coordinate tie-break), never to a missing/above-cut neighbor.

Retain only current cut geometry per resident chunk. Cache key includes scene
revision, chunk, cut level, scale and relevant cover data. Camera azimuth is
not an art/geometry key. Dispose replacements and evictions completely. Bound
residency to the fixture's chunk count, and use frustum culling for visibility.
Provide a proof-only eviction action through the owner (not direct internal Map
mutation) to force unload/rebuild. A fixed fully resident scene alone does not
prove streaming recovery. No asynchronous terrain fetch is needed in this test.

If rebuild is deferred, old incompatible layers must be hidden until the new
chunk is ready; never present old layer records as current. Prefer a synchronous
bounded first implementation and measure layer-change cost before adding queues.

### Art and actor lifetime

Factories return Scenes with lights. Move only their non-light children into a
local model root; compose exactly one original lighting rig in the world.
`building` direction is quarter turns; `figure` direction is radians. Do not
double-rotate. Use original pivots and inspect actual mesh bounds before routes.

Grass is **opaque triangle geometry**, including both windings, not alpha cards.
Use normal depth test/write. It can have about 4,590 blade triangles per patch;
that is a key cost under test, not free detail. Reuse the original builder and
material-preserving batch helper, build on data/cut changes, and never allocate
one grass mesh per blade or rebuild grass while panning. Record actual triangles,
draw calls and construction cost. Do not silently thin or replace the grass.

Prepare eight original walk poses per actor kind once, with geometry-only roots;
switch retained visible poses at a fixed eight-frame cycle and move the actor
root. Scrubbing uses explicit replay time. Never call `figure()` every frame.
Each actor has its own Object3D hierarchy; explicitly track any shared geometry.

`geometry.js` shares materials globally. Do not mutate/dispose those shared
materials. If per-owner material changes are needed, clone once per distinct
source material, share those clones within this owner, dispose them at teardown.
Geometry/texture ownership must likewise be explicit. Do not use `bake()` or
`renderBakeCanvas()` on retained world geometry; their default destroys it.

### Picking

Use Three Raycaster against currently visible geometry. Update world/camera
matrices before querying. Resolve triangle ranges/mesh metadata to stable fixture
IDs or cell coordinates. Nearest opaque terrain/tree/grass occludes rear objects;
do not filter out the occluder first and then select a hidden actor. Nonselectable
opaque surfaces yield their terrain target or no selection. Water is a pass-through
visual in this study. Query only on pointer actions, not all grass triangles every
frame. Use chunk bounds to narrow candidates before mesh raycasts.
Maintain a candidate list of active mesh leaves whose complete ancestor chain
is visible; do not recursively raycast a root containing hidden pose-bank children
and assume Three filters visibility. Test an inactive actor pose and evicted chunk
are absent from candidates even though their resources may remain retained.

## Implementation sequence and stop rules

1. **First shape:** one original terrain chunk, grass, tree, bed and actor, shared
   light/camera, real depth, pixel enlargement, picking and full disposal. Read
   the pixels at native scale. Save a screenshot and review before expanding.
2. **Complete diagnostic scene:** stair route, chunk seams, path, pit/bank,
   quarter and continuous rotation, exact reset, layer rules and pose scrub.
3. **Retention laws:** chunk rebuild/evict, scene replacement, repeat loop,
   deterministic cold/warm captures and invisible-object picking rejection.
4. **Measure:** 16×16 and 32×32, idle/motion/pan/turn/layer/evict separately.
   Improve measured avoidable allocations with the retained owners. Do not
   redesign art or start a second optimization framework.
5. **Publish isolated preview:** source reviewed/committed/pushed; study build;
   new frontend preview alias; full static readback and hosted short browser proof.
   Finish with evidence and a recommendation, not automatic game migration.

If a core depth/cut/picking failure persists, report its minimal witness and keep
the study marked failing. If dense original grass misses performance targets,
report that result rather than reducing density off-camera or changing the art.
Only expand a working first shape. Do not spend this packet implementing full
game commands, arbitrary transparent volumes, generalized LOD, GLTF migration,
WebGPU, physics, or a new actor rig.

## Acceptance: prove pixels, lifecycle and cost

Run automated proof commands through the mandatory host wrapper:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh <ordinary command>
```

Keep each proof bounded below ten minutes and retain/poll its session. Browser
checks are available here. Existing working environment:

```sh
LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu
CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell
```

Focused laws, then a short Playwright proof through actual public controls:

- At paused replay time T, capture the canvas for all four quarter turns and
  three cut levels. Compare a fresh owner at each view with a warm owner that
  arrived by panning, cutting, rotating and returning. Compare canvas pixels,
  not a DOM screenshot containing a changing timing label. Same-browser exact
  equality is the default; any tolerance requires measured explanation.
- Repeat `home → pan beyond court → cut down twice → rotate → home view →
  original layer/time` 20 times. Also test intervening water toggle, resize,
  preset replacement and forced chunk eviction. Assert matching final pixels
  and geometry/visible/picking counts. Freeze all cosmetic time and use exact
  setters for restoration; a reversible floating-point gesture is not the oracle.
- Cold/warm equality alone can preserve a consistent bug. Independently check
  named samples: actor behind/in front of bank, tree trunk, bed ends/sides, and
  stair rails at bottom/middle/top. Save native-resolution crops and depth/hit
  witnesses. Expected front surface comes from fixture geometry, not the old
  painter-sort comparator. Review actual art pixels personally.
- Pick the nearest visible actor, bed, stair and terrain cap using mouse clicks.
  Check a hidden actor cannot be selected through the bank, and an object removed
  by a cut or scene reset cannot be hit. Repeat after camera rotation and resize.
- Cover masks/positions and world geometry are unchanged by camera movement;
  there is zero grass on newly exposed cut soil. Check seams from four directions
  and at intermediate azimuths, not only from the old baked camera.
- Reset/replace/evict 20 times and assert live owned resources return to the
  initial bounded count after warmup. Report Three's geometry/texture counts;
  do not claim a measured byte-accurate GPU memory value from those counts.
- Collect zero console/page/WebGL errors, screenshots at desktop and 390px,
  and native raster size + devicePixelRatio. No screenshots during loading.

Performance recipe: warm for 5 seconds, sample 10 seconds each of idle, two moving
actors, smooth pan, and continuous rotation; separately time 20 layer switches
and evictions. Run one renderer at a time, without screenshot/readback/profiler
overlays in the timed interval. Save raw samples plus median/p95/max for RAF
intervals, JS update time, render-submission CPU time, chunk build time and picking.
Also record long frames >50ms, draw calls, triangles, resource counts, browser,
GPU renderer string, software/hardware status and viewport/native raster.
CPU submission is not GPU time. Use disjoint timer query only if already supported
cleanly; otherwise label GPU time unavailable. Do not introduce a profiler library.

Provisional target on a hardware-accelerated desktop: 60fps-class interaction
(p95 frame interval <=20ms; p95 update+render-submission CPU <=8ms), no >50ms
camera-only stalls after warmup, and no geometry factory/build calls during pan
inside resident coverage. Report layer-change stalls separately. Software Chromium
can prove correctness but cannot close the hardware smoothness gate. Levi's
preview test remains part of performance/appearance acceptance. Do not claim
speedup over Pixi without a matched fixture, resolution, hardware and workload.

Read the existing Fallow findings relevant to touched sources, and record any
available focused advisory audit of new modules. Do not modify old source to make
an unrelated audit pass. A missing audit tool is disclosed, not a reason to install
dependencies or omit the visual laws.

## Build and separate preview — exact release boundary

Use a dedicated Vite config with repository root, only `three-depth-study.html`
as input, `base: "/"`, `publicDir: false`, and output `dist-three-depth`. Include
needed reference images explicitly through imports/new URL so unrelated public
atlases/kernel files are not copied by default. Keep output separate from
`dist` and `dist/engine`. The scene imports source art, so no startup atlas export
or kernel build is required. Reference images belong to this study build.

Human-facing local server (ordinary launch, not a proof scope):

```sh
./node_modules/.bin/vite --config vite.three-depth.config.js --host 127.0.0.1 --port 5207 --strictPort
```

Study build (wrapped):

```sh
./node_modules/.bin/vite build --config vite.three-depth.config.js
```

Before upload, commit/push the reviewed study branch; record exact source SHA and
hash every file of `dist-three-depth`. Use the existing frontend worker's version
preview mechanism with a **new** alias `three-depth-<8-char-source-sha>`:

```sh
./node_modules/.bin/wrangler versions upload \
  --config wrangler.jsonc \
  --assets ./dist-three-depth \
  --preview-alias three-depth-<8-char-source-sha> \
  --env-file /home/levi/src/Botanical-next/.botanical/credentials/cloudflare.env
```

The command is frontend version upload only. Do not print credentials. Do not
run `release:preview` / `release-clearing-preview.sh`: that script deploys the
backend. Do not run `wrangler deploy`, `versions deploy`, or reuse an existing
alias. Record the actual immutable and alias URLs returned by Wrangler; expected
alias shape is `https://three-depth-<sha>-fungi-goblin-bnb.levi-fe0.workers.dev`.
The user link ends in `/three-depth-study.html`; do not announce it before it works.

Run `engine/scripts/verify-static-preview.mjs dist-three-depth <origin> <receipt>`
under the proof wrapper for both URLs. Repeat the short browser loop against the
hosted URL, check assets/errors and ensure no backend requests occur. Read back
the existing game preview entry/bundle hashes before and after to establish it
was not repointed. No full construction/multiplayer proof is relevant here.

Record in `evidence/20260920-three-depth-RESULT.md`: source SHA, both working URLs,
build/readback/browser receipts, representative images, visual differences,
timings/hardware limits, source complexity removed in this approach, retained
complexity, stair mismatch, and one verdict: `candidate worth integrating`,
`needs a specific bounded correction`, or `reject this approach`. Keep this packet's
status updated. A preview can be published with a plainly stated performance/art
failure for comparison; do not label such a result accepted or replace the game.

## Official API references (checked September 20)

- [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): rendering,
  output configuration and diagnostic counters.
- [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html):
  camera volume/zoom; keep the original art projection at reset.
- [Material](https://threejs.org/docs/pages/Material.html): depthTest/depthWrite,
  transparency and clipping; grass here is opaque geometry.
- [Raycaster](https://threejs.org/docs/pages/Raycaster.html): intersections ordered
  by distance; selection filtering is still this owner's responsibility.

The installed source/version is the implementation authority if newer online
documentation differs. Three is already a dependency; no upgrade is part of this.

## Pasteable handoff

Implement and publish the isolated renderer study described in
`engine/implementation/clearing-repair/16-three-depth-comparison-20260920.md`.
Work only in `/home/levi/src/hive-worktrees/three-depth-study-20260920` on
`engine/three-depth-study-20260920`, starting from its packet commit. Read the
packet completely and inspect its named original builders before coding. Follow
its fixed architecture, cut/cover laws, resource lifetime, staged sequence and
visual/performance proof; do not redesign the experiment or migrate the game.
First review the small working shape, then complete the fixture, bounded proof,
commit and push. Source acceptance/release custody stays with the parent Game CTO;
provide a ready artifact and evidence for serial review if running as a subagent.
The integration owner publishes through the specified frontend-only new preview
alias and returns the working URL plus honest appearance/performance limits.
Browser checks work on this host. Do not stop after a plan or local screenshot.
