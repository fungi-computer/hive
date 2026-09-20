# Hosted camera proof

Accepted rendering source: `30ec8144`, frozen frontend
`.botanical/camera-engine-v5-dist`, using the separate hosted DO performance
backend. Both final hosted proofs passed with clean exit 0.
[Live 256×256 preview](https://professor-findlaw-looks-atlas.trycloudflare.com/engine/colony-performance.html?size=256&workers=8).
The current implementation and final receipts are recorded below; failed earlier
runs remain as evidence of the defects corrected during acceptance.

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
uses `.botanical/camera-browser-before-final`; its receipt follows below.


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
migration or silent world replacement was added. The initial frontend build was
`.botanical/camera-engine-dist`; subsequent frozen builds and hosted receipts are
recorded below. Source and unit success alone do not qualify camera smoothness
or returned art.

First hosted after run (`96a97ca5`, backend version
`d25d8e12-16d5-4934-8f64-3d6e7fc7eda8`) ran under `run-u2764.scope`, invocation
`49429e38bd4048f49aa55961e74fa2a2`. Artifacts `.botanical/camera-browser-after`
are preserved as failed v1 evidence. Initial coverage completed 759/759 chunks,
within prepared padding 128 and capacity 2048. Upright grass was visually reviewed.
Small pan performed **zero** static rebuild/order/topology/apply work; visual
building totaled 24.1 ms. SwiftShader RAF p95 worsened to 1849.8 ms (idle 1883.3 ms), so
this run does not establish improved frame performance. During the first long
pan the browser/page closed unexpectedly; the driver exited 1 before the ten
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
log records Chromium's normal exit 0 and the driver's final success JSON. The
outer execution session nevertheless reported 143; its cause is unknown and this
is not described as a clean wrapper exit. No manual interrupt was sent by this
proof owner.

Small pan performed zero static/order/topology/apply work and 21ms cumulative
visual building, versus baseline three rebuilds / 305.7 ms preparation and 38.4 ms
visual building. On the same software-rendered host, small-pan RAF median/p95
were 133.5 / 266.6 ms versus 400 / 1166.6 ms baseline. Idle p95 was 283.4 ms versus 416.7 ms.
These measurements include the restored upright grass and alpha-bounds trimming;
they do not isolate camera retention as the sole source of frame improvement.

All four long-travel legs finished with complete coverage and viewport retained.
The cache rose 759 → 1377 → 2048 and stayed within its 2048 limit. Distant screenshot
shows terrain and upright grass, replacing the incomplete blank view. Initial
and returned canvas files were byte-identical, SHA256
`9b7426cf7e0752633c9766fc2c8fcdf72c4006bc075cae2a3417281ba67ef995`.

CDP used heap (MiB) across idle/small/east/return/north/return/zoom/layer/cutaway was
112.6/108.6/303.4/294.8/352.0/227.7/235.3/129.2/429.9. GC was not forced during
this timing workload. These samples show allocations and collection, not a low
constant retained heap. Subsequent v3 verification checks explicit spare-mesh and
buffer budgets, cleared spare record references, and heap after collection.


V3 (`7ec6f92b`) added bounded idle mesh retention: at most 16 spare meshes
and 16,000 spare quads (1,216,000 bytes of vertex/index buffer allocation
requests), additionally constrained by the existing total mesh limit. Idle
meshes release retired record references and reused geometry explicitly allows
buffers to shrink. Integrated focused laws passed 29/29 (`run-u2780.scope`,
`37a25b41b6574ff3955d3f93ef86d849`). Independent source review additionally found
a fulfilled request Promise retaining its chunk snapshot after disposal;
`d674ecaa` clears it. All eight cut-layer laws passed after that cleanup.

The focused v3 hosted receipt (`run-u2782.scope`,
`60a49d11094a4138b8cc635ab364b0fe`, `.botanical/camera-browser-v3-final`)
exited 1 and is preserved as failed evidence. Small pan, far grass and picking,
actual ground cut and minimum zoom passed: 366 visible distant top faces,
458 distant cover records, and three exact picks outside X±32. The selected
cell changed from [-33,19,24] to its cut cap [-33,18,24], with no cover above
the cut. Minimum zoom loaded 1380 chunks; the cache held 1914, below 2048.

The final screenshot hash differed after zoom return despite camera agreement
within floating-point tolerance. Pixel analysis found 4124 differing pixels,
740 excluding the outer one-pixel border. This does not establish a renderer
cause: the proof did not yet separate pan/cut return from zoom return or
normalize keyboard focus. Seven CDP response-body capture failures also occurred;
these are recorded separately from the application's two failed HTTP requests.
Subsequent proof captures normalized initial, pre-zoom and post-zoom images and
scene records before making an acceptance claim.


V4 (`d674ecaa`, guard `run-u2790.scope`,
`45704c3f8b1c428ab54ed4bc76ac2c98`) used identical keyboard focus for each
screenshot and captured ordered records before and after zoom. Artifacts are
`.botanical/camera-browser-v4-diagnostic`; the strict post-zoom image gate
exited 1. The image after distant travel/cut/return was byte-identical to the
initial image. Minimum zoom and return left 738 interior pixels different,
without any border difference. A captured grass/tree pair had byte-identical
geometry but reversed paint order. Both upright pictures lie in the same plane;
new offscreen dependencies can reverse a pair that has no explicit tie relation.
This is a real ordering issue, not permission to relax the screenshot assertion.

At v4 return, retained terrain used 60 active meshes, 29,541 quads and
2,245,116 buffer-allocation bytes, with no spare meshes or retired records.
The chunk cache held 1914/2048. JS heap after explicit collection was about
195.5 MiB; this excludes GPU allocations and does not claim constant total
browser memory. Canceled request/body-capture receipts are retained separately
from page errors and successful authoritative terrain replies.


The coplanar correction in `30ec8144` gives overlapping checked picture ink a
stable pairwise tie. Uncovered coplanar terrain, disjoint opaque spans, touching
edges and disjoint composite siblings preserve their previous independence.
Both exact-plane shortcuts and tolerance-level plane ties share this rule;
cycle recovery is unchanged. Thirty-eight focused ordering/scene/fixture laws
passed in the isolated lane (`run-u2795.scope`,
`f067e7d5b58b46ac89825c26304df83b`), including membership extension/removal
and static/dynamic partition parity. A separate replay of the captured real
tree/grass geometry confirmed the stable relation without approximation
(`run-u2794.scope`, `8c947dfc1fd1466e954514217790b806`).

Scope limits: crossing a coverage boundary, zooming out and changing cut layers
still incur requests and scene preparation. A replacement demand is published
once complete, while overlapping chunk data and face records are reused. The
transform-only guarantee applies to ordinary panning inside the retained margin;
it does not promise instant cold loading or constant cost for terrain edits.
Unchanged actor records are retained individually, and chunk edits invalidate
the affected columns and support neighbors. No hardware-FPS or worker-population
capacity claim follows from these paused camera checks.


## Final hosted acceptance

The focused v5 run on `30ec8144` passed with clean terminal exit 0 under
`run-u2797.scope` / `8e50c321a48d4140abb871426b48ed4b`. Complete receipt,
exact driver, provenance, scene snapshots and screenshots are preserved in
`.botanical/camera-browser-v5-final`. There were no page errors. Small pan
performed zero static rebuilds. Actual DO replies supplied far surface/cover
metadata; the browser displayed 366 distant top faces and 458 grass records,
and three exact terrain picks matched. The actual cut cap at [-33,18,24]
replaced the original ground cell with no grass above the cut.

Initial, far-travel/cutaway return, and minimum-zoom return images are all
byte-identical, SHA256
`0dfdcfa88f89c5f8ed19e8011831e20f8157432e0b405745b71c343becde325e`.
The source owner reviewed the final rendered art and the distant/cut screenshots.
No original atlas pixels were regenerated. Six canceled-response capture
failures are preserved separately; 238 successful chunk replies support the
metadata checks, and each required view reached complete coverage.

Cache residency was 759 initially, 1377 at the distant view and 1914 after
minimum zoom, below capacity 2048. At the distant view, 16 spare meshes held
7802 quads / 592952 buffer-allocation bytes and zero world-record references.
At zoom return there were 59 active meshes, 29,541 quads, 2,245,116 active
buffer-allocation bytes and zero spares. Explicitly collected JS heap was
221.8 MiB. These measurements distinguish heap from buffer allocation requests;
they do not measure driver-specific GPU overhead or promise a smaller constant
heap regardless of visible coverage.


The final same-workload timing run also passed with clean exit 0: nine phases,
no errors, `run-u2799.scope` / `62ecdfa1445d412ea468e3ff73723a61`, artifacts
`.botanical/camera-browser-after-v5`. Its `COMPARISON.json` records the baseline
and final measurements; `source-provenance.json` and exact `driver.mjs` pin the
served source and test. Both browser runs used the real hosted DO, paused
authoritative simulation, the same 256×256/eight-worker preset, viewport and
software-rendered Chromium environment.

| Small-pan measurement | Baseline | Final v5 |
| --- | ---: | ---: |
| Static rebuilds | 3 | 0 |
| Static preparation | 305.7 ms | 0 ms |
| Cumulative visual building | 38.4 ms | 40.4 ms |
| RAF median | 400 ms | 233.4 ms |
| RAF p95 | 1166.6 ms | 316.6 ms |
| Input phase duration | 24.27 s | 11.09 s |

Final small pan also performed zero ordering/topology/application work. The
separate cumulative visual-building cost did not improve; frame distributions
include software rasterization and shared-host scheduling and are not hardware
FPS claims. The renderer also preserves upright grass and trims only transparent
quad padding, so this is an end-to-end implementation comparison rather than an
isolated attribution to camera retention.

All four long-travel legs settled with complete coverage. The cache reached
2048/2048 and stayed bounded. Final meshes returned to 55 active / 17,303 quads /
1,315,028 buffer-allocation bytes, with zero spares. Initial and final canvas
images were byte-identical, SHA256
`cf754bdf439e1884f641db8d93ba54a2c605302641930fa9d0abb8bedb5ef061`.
Boundary preparation and cutaway remain measurable work; for example the
cutaway-return phase performed two rebuilds and had a 2183.2 ms RAF p95 on this
software renderer. That cost is not part of the transform-only pan guarantee.

Completion evidence covers camera retention and incremental chunk reuse,
individual actor-record reuse, camera-driven authoritative far terrain/cover,
full/short cover changes, exact face picking and cut caps, all four projection
turns in focused laws, minimum zoom and pixel-identical returns, bounded cache/
mesh/buffer ownership, disposal, and before/after hosted measurements. No new
rotation controls, native mowing operation, renderer replacement, main merge or
existing-game backend deployment was introduced. The human-facing Vite preview
and Cloudflare tunnel remain running; old test identities can use **New world**
if they predate the separate backend's current implementation.
