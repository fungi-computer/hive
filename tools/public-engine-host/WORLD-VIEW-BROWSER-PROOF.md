# Combined hosted world-view proof

`world-view-browser-proof.mjs` consumes an already paired hosted frontend and the
separate `hive-performance-engine-preview` Durable Object backend. It does not
build, deploy, install dependencies, route requests to local files, or inject
simulation/camera state. Do not run until the integration owner has supplied the
matching frontend/backend release.

Run through the shared-host guard, preserving the existing Chromium library
environment and full Chromium executable:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh \
  node tools/public-engine-host/world-view-browser-proof.mjs \
  --base-url https://FRONTEND \
  --backend-origin https://hive-performance-engine-preview.levi-fe0.workers.dev \
  --output /absolute/new/proof-directory \
  --source-root /absolute/integration-worktree \
  --frontend-source FRONTEND_COMMIT \
  --backend-source BACKEND_COMMIT_OR_RELEASE
```

`CHROMIUM_PATH` may select the provisioned full Chromium. The current provisioned
path is `/home/levi/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`.
Use the existing `LD_LIBRARY_PATH`; the driver does not change system libraries.
Default presets are `64,256`, each with eight workers in a fresh browser process,
context and private world. `--sizes 64` or `--sizes 256` isolates diagnosis; a
single preset does not establish the paired comparison. Viewport is 1280×900,
device scale 1. The driver has a 225-second per-case guard and 510-second total
guard, inside the required ten-minute process guard.

The phases are:

1. Untouched cold navigation. A preinstalled 25 ms observer records the first
   independent `assetsReady && runtimeReady`. Useful ground still requires the
   center plus nine of 35 published picks within 1,000 ms; visible ground requires
   all 35 plus **published** visible coverage within 3,000 ms. Cliff-side polygons
   supplement standing-surface picks. Raw receipt clocks remain separate. All
   navigation and sampling costs are retained; no readiness clock is restarted.
   Screenshots begin only after loading measurement. A failed loading gate stays
   failed while later diagnostic phases continue.
2. Normalize interaction camera using a real **Reset view** button if available,
   otherwise resize to 1281×900 then back to 1280×900 and wait for the client's
   real ResizeObserver camera reset. This never presses simulation Reset. Compare
   camera x/y/zoom/turn and cutaway=false across presets. Initial layer values are
   recorded; different layers do not cut terrain when cutaway is disabled.
3. Two trips with real ArrowRight/wheel input, followed by the exact reverse
   sequence of inverse inputs. Zoom and pan do not commute. The first trip must
   overlap incoming real terrain patches; the second revisits the same region.
4. Two cut/layer/rotation/restore rounds. Each step waits for `displayedView` and
   displayed camera turn, then for published coverage and completed preparation.
5. Confirm the unpaused DO workload: eight observed workers, actual motion,
   increasing authoritative time, and newly completed tree/resource work. No
   browser simulation Worker, local fallback or HTTP terrain fan-out is accepted.

The current diagnostic contract is
`spatialDraw.coverage.visibleComplete/demandComplete` for published coverage,
`receivedVisibleComplete/receivedComplete` for raw receipt, and
`spatialDraw.preparation.pending` for pending world-view preparation. A driver
for the older receipt-only coverage contract is not equivalent. Preset world
configuration is pinned through the source inventory; the driver does not assume
identical generated terrain merely because camera/viewport match.

Input observation is installed at **window capture before application scripts**,
so the keymap cannot hide events by stopping propagation. Separate outputs record:

- Event timestamp → capture: queue estimate, with raw timestamps and trust flags.
- Capture → next requestAnimationFrame callback: frame opportunity, not proof of
  paint or presentation.
- Driver input dispatch round trip: includes Playwright/CDP and browser handling.
- Browser EventTiming: thresholded at 16 ms and browser-quantized; absent entries
  do not mean zero latency. Long tasks and rAF intervals are separate.
- Actual scene preparation/order/loading diagnostics, per-phase snapshots, and
  CDP heap. Resource capacities are checked on every driver snapshot.

`REPORT.json` is updated after every phase and preserves failed phases. The exact
driver bytes, driver hash, local source hashes, and served frontend code hashes
are saved. Local hashes and optional source pins do not by themselves attest the
deployed backend; preserve the release receipt alongside this proof. Private
bearers/authentication frames are not recorded. Screenshots capture normalized,
returned and restored-cut scenes; live actors make pixel-identical images an
invalid acceptance rule.

Heap snapshots include repeated post-GC returns and raw resource/preparation
metrics. Explicit terrain and spare-mesh budgets are gated. Heap deltas remain
observational: growing retained memory is a concern to review, and passing these
short trips is not a proof of globally bounded memory. Responsiveness distributions
are measurements, not an invented hardware frame-rate gate. The final success flag
means the stated loading, lifecycle, work and owner-capacity checks passed.

The proof requires enabled GPU compositing but deliberately uses ANGLE SwiftShader.
These are software-rendered shared-host observations, not hardware GPU capacity or
60 fps evidence. Sampling and screenshots also have measurable costs. Review the
raw phase evidence before making performance comparisons.
