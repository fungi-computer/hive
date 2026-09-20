# Hosted camera proof

`camera-browser-proof.mjs` drives the real Colony performance page with keyboard,
mouse-wheel and HUD controls. It does not install instrumentation in the engine,
change camera state through diagnostics, start a simulation Worker or deploy a
backend. Run against the hosted DO preview, with the same browser executable and
viewport for before/after comparisons.

```sh
CHROMIUM_PATH=/home/levi/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell \
LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu \
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
node tools/public-engine-host/camera-browser-proof.mjs \
  --base-url https://professor-findlaw-looks-atlas.trycloudflare.com \
  --output .botanical/camera-browser-before --mode before
```

Change only output and mode to `after` when the new frontend is hosted. The
script uses a fresh browser identity for 256×256/eight workers, waits for remote
observations, pauses authoritatively, and waits five seconds and complete initial terrain coverage before measuring.
It asserts no browser Worker and a socket to the separate DO test backend.

Workload: two seconds idle; three 24-pixel key pans and their inverse; 96 key
pans east and their inverse; 96 north and their inverse; five wheel zoom-out
and inverse zoom-in steps; one lower-layer and inverse higher-layer step;
cutaway toggle and restore. Each phase records camera, view, static rebuild and
ordering counts/times, retained records, application transport measurements,
Chrome heap sample and animation-frame intervals. Final camera/view must match
the initial values and authoritative simulation time must remain frozen.
`after` additionally waits for complete terrain coverage after each phase, requires
zero static rebuilds for the small pan, requires the viewport to remain inside
the prepared area, and checks terrain cache size against the declared capacity.
Its phase duration includes coverage settling; compare work counters separately
from frame timing distributions.

Reports preserve the driver hash and served JavaScript hashes. Initial, distant
and returned canvas screenshots support human review of coverage and original
art. Camera state equality is not proof of pixel equality: inspect the images.
Heap values are sampled JS heap, not GPU memory; retained-owner limits and cache
counts must also be reviewed. Animation-frame intervals use headless Chromium
with SwiftShader and shared-host scheduling; they compare the same environment
and are not claims about a player's hardware FPS. This paused proof isolates
camera work, not worker simulation capacity or active-object invalidation.

## Evidence

An exploratory baseline completed under guarded invocation
`f802523e70b14877ae328300689c605d` (`run-u2736.scope`), artifacts
`.botanical/camera-browser-before` in the integration worktree. Small pan/return
caused three static rebuilds (280.6 ms cumulative ordering preparation); the
returned canvas was byte-identical to the initial canvas, SHA256
`be0fd4d01633470e4fd29dc4370a4d7cfae4afc077ba607b280ed3c8abcdf1cc`.

The distant screenshot was blank while coverage was incomplete: 53/382 requested
chunks ready, no retained complete coverage, a request pending. This establishes
an incomplete-coverage symptom, not its sole cause. It must not be attributed to
the fixed 64×64 grass metadata window merely from the image. Returning and
waiting eventually restored all 376 requested chunks and the exact original
image.

The exploratory run preceded the driver's additional layer-cycle, explicit key
movement assertions and served-bundle hashes. The final source-bound baseline
uses `.botanical/camera-browser-before-final`; its receipt follows when complete.
No after result is claimed yet.


Final baseline completed under guarded invocation
`a5a7f224eaa141068ea539e9786289fc` (`run-u2742.scope`),
`.botanical/camera-browser-before-final/REPORT.json`. All real-input and paused
simulation assertions passed; 18 served JavaScript hashes were recorded. The
preserved `driver.mjs` matches the report's driver hash. Small pan began with
complete 376/376 coverage and caused three static rebuilds (305.7 ms), with
38.4 ms cumulative visual building. Idle RAF p95 was 416.7 ms and small-pan p95
1166.6 ms on this software-rendered host; these are not hardware FPS claims.

The final baseline's initial image was captured before terrain finished arriving
(312/376 chunks); by the start of the small-pan phase all chunks were ready. Its
initial/returned screenshots therefore cannot establish return-image equality.
This finding tightened the driver to await complete initial coverage in both
modes. The earlier complete-coverage exploratory run supplies the exact returned
image comparison; the small-pan final baseline remains a valid complete-coverage
cost sample. Final return coverage was complete, bounded to 512 cached chunks.

## Retained camera implementation

The shared `world-scene-owner` remains the client presentation boundary. Its
terrain owner retains a padded camera demand, chunk cache, prepared faces and
cover records, and publishes the exact exposed planes to the picker. Ordinary
pan/zoom inside the retained margin changes the common Pixi transform without
replanning terrain or recompiling unchanged actor/terrain records. Actor visuals
retain geometry per object while animation, selection and progress remain live.

Coverage starts with 128 projection pixels of padding and refreshes after 65%
of that margin is consumed. Larger zoomed-out views can reduce padding to fit;
the visible demand still has an explicit fixed budget. Up to 2,048 chunks may
remain cached, independent of total world size. Requests retain the server's
8-chunk limit. Replacements reuse overlapping chunk faces and cover records;
old scene data is discarded for a changed cut/world, and late replies cannot
roll a newer observation backward. Panning outside world bounds clears presented
terrain and picking. Rotation explicitly invalidates projection-dependent data.

Protocol 3 chunks now carry native surface/generated-height metadata and cover
from the same game projection as ordinary observations. The finite simulation
workload remains central, but terrain and grass can be requested throughout the
selected bounds. The client never generates authoritative terrain or advances
the DO clock. Both the live game and render studies use complete baked grass
images on upright silhouette geometry; the old ground-quarter clipping path is
removed. Four-cell masks and full/short appearance updates remain supported.
This change does not introduce a native mowing command or a second cover authority.

Picking consumes actual exposed face planes, including cut caps and multiple
levels in cave columns, instead of reconstructing cliffs from a heightmap.
Commands still require authoritative runtime validation; a rendered cap is not
permission to move or build inside solid terrain.

Focused integrated client laws: 67/67 passed in `.botanical/camera-client-laws.log`.
Runtime chunk/surface laws: 39/39 passed in the isolated terrain lane (u2749,
`9964953152934ad8a22fd8f038d8d3de`), including actual WASM queries beyond x=32.
The full engine typecheck still has pre-existing missing Node declarations and
other unrelated failures; it is not reported green. Fallow is not installed in
this environment; the available historical clearing-state findings do not
qualify this client stack. Independent source review found the empty-demand,
cave-picking and obsolete-reply defects; those are fixed and covered by laws.

The separate test backend was updated to Cloudflare version
`d25d8e12-16d5-4934-8f64-3d6e7fc7eda8`, implementation hash
`5dddf225bb6287de132f33fd2604e3a2ae37e54ea57f652f0beb638d1b540ff2`.
The existing game backend was not deployed or reset. Test worlds from an older
implementation may require the existing **New world** control; no old-format
migration or silent world replacement was added. Frontend build is
`.botanical/camera-engine-dist`, served on the existing Cloudflare tunnel.
Hosted after-checks are pending; source and unit success alone do not qualify
camera smoothness or returned art.

First hosted after run (`96a97ca5`, backend version
`d25d8e12-16d5-4934-8f64-3d6e7fc7eda8`) ran under `run-u2764.scope`, invocation
`49429e38bd4048f49aa55961e74fa2a2`. Artifacts `.botanical/camera-browser-after`
are preserved as failed v1 evidence. Initial coverage completed 759/759 chunks,
within prepared padding128 and capacity2048. Upright grass was visually reviewed.
Small pan performed **zero** static rebuild/order/topology/apply work; visual
building totaled24.1ms. SwiftShader RAFp95 worsened to1849.8ms (idle1883.3ms), so
this run does not establish improved frame performance. During the first long
pan the browser/page closed unexpectedly; the driver exited1 before the ten
minute guard. The cause was not established. No long-travel/return assertion is
claimed from this run.

Later driver snapshots additionally record CDP `Runtime.getHeapUsage` because
`performance.memory` is coarse and can remain constant across phases. Browser
renderer crashes are explicitly recorded. The focused
`camera-coverage-browser-proof.mjs` supplements timing with actual chunk reply
surface metadata, visible grass outside X±32, and exact top-face picking through
read-only diagnostics after real pan inputs. It uses the same CLI base/output
arguments and guarded browser environment, without a mode argument.

Hosted v2 (`0fd37272`, same separate DO backend) completed all browser assertions
under invocation `aaa4c5d4dde4475d83c8f7dada0e2aee` (`run-u2775.scope`).
`.botanical/camera-browser-after-v2/REPORT.json` records success with no errors;
all page/context/browser closure events were expected cleanup. The process debug
log records Chromium's normal exit0 and the driver's final success JSON. The
outer execution session nevertheless reported143; its cause is unknown and this
is not described as a clean wrapper exit. No manual interrupt was sent by this
proof owner.

Small pan performed zero static/order/topology/apply work and21ms cumulative
visual building, versus baseline three rebuilds/305.7ms preparation and38.4ms
visual building. On the same software-rendered host, small-pan RAF median/p95
were133.5/266.6ms versus400/1166.6ms baseline. Idle p95 was283.4ms versus416.7ms.
These measurements include the restored upright grass and alpha-bounds trimming;
they do not isolate camera retention as the sole source of frame improvement.

All four long-travel legs finished with complete coverage and viewport retained.
The cache rose759→1377→2048 and stayed within its2048 limit. Distant screenshot
shows terrain and upright grass, replacing the incomplete blank view. Initial
and returned canvas files were byte-identical, SHA256
`9b7426cf7e0752633c9766fc2c8fcdf72c4006bc075cae2a3417281ba67ef995`.

CDP used heap(MiB) across idle/small/east/return/north/return/zoom/layer/cutaway was
112.6/108.6/303.4/294.8/352.0/227.7/235.3/129.2/429.9. GC was not forced during
this timing workload. These samples show allocations and collection, not a low
constant retained heap. Subsequent v3 verification checks explicit spare-mesh and
buffer budgets, cleared spare record references, and heap after collection.
