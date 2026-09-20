# Cold terrain loading proof

`terrain-loading-browser-proof.mjs` measures a fresh browser loading the real, separate DO performance backend at size 256 with eight workers. The viewport is 1280 × 900, device scale 1. It records HTTP terrain bodies, incoming WebSocket frames, read-only draw diagnostics, ground ray samples and canvas screenshots. Camera movement uses actual ArrowRight input. No simulation or cache state is injected.

Run through the shared-host guard (with the existing Chromium path/library environment):

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node tools/public-engine-host/terrain-loading-browser-proof.mjs --base-url https://professor-findlaw-looks-atlas.trycloudflare.com --output /absolute/new/artifact-directory --mode before --scenario both
```

Use a new artifact directory for each run. The driver preserves its exact bytes and SHA-256 beside its incremental `REPORT.json`. `--scenario stationary` and `--scenario pan` isolate one case. `--mode after` enables streamed transport, readiness, visible coverage and residency acceptance gates. Do not run it against the frozen baseline.

## Frozen v5 baseline, September 20

Frontend implementation: `30ec8144`; accepted integration base: `fb67f836`. Backend version: `d25d8e12-16d5-4934-8f64-3d6e7fc7eda8`, program hash `5dddf225bb6287de132f33fd2604e3a2ae37e54ea57f652f0beb638d1b540ff2`.

Times below are seconds from navigation, observed on this shared host using software WebGL. They describe these runs, not a hardware-independent latency guarantee.

| Milestone | Stationary | Cold pan then second pan |
| --- | ---: | ---: |
| Subjects visible without ground | 5.445 | 4.508 |
| Cold pan complete | — | 8.783 |
| First useful ground | 35.100 | 33.039 |
| Second pan complete | — | 51.845 |
| All 35 visible ground samples | 35.100 | 52.483 |
| Full padded demand complete | 35.100 | 62.249 |
| HTTP terrain request count | 95 | 108 |
| Captured decoded terrain response bytes | 8,897,155 | 9,956,187 |

The stationary case shows the actual all-or-nothing presentation problem: useful ground and full padded coverage appeared in the same sample, about 30 seconds after subjects appeared. The screenshot records subjects floating on a gray background. The pan case finishes with 759/759 demanded chunks and 849 cached chunks.

Evidence lives under the integration worktree `.botanical/terrain-loading-before` and `.botanical/terrain-loading-before-pan`. The first invocation (`run-u2803.scope`, invocation `7298fb9b579145e2972d85253b18b19b`) exited 1: its stationary case passed, but its original pan sampler only accepted top faces and falsely rejected one cliff-side sample. Preserve that failed report and exact driver. The corrected pan-only invocation (`run-u2807.scope`, invocation `099859dfdd7342f6a1c173edde6dc09f`) exited 0. Its formerly missing sample is a projected side face at cell `[-14,-6,-2]`.

## Measurement limits

- Useful ground requires the center sample plus at least nine of 35 distributed samples. Visible sampled coverage requires all 35; this is not a proof that every canvas pixel has ground. Samples exclude the HUD footer. Exact owner `visibleComplete`, when available, should accompany these checks.
- Top faces use the renderer's read-only terrain picking API. Since that API deliberately excludes non-standing cliff faces, the driver also intersects the sample with actual projected terrain-side polygons. It never equates nonzero draw-record counts with useful ground.
- Sampling, diagnostic projection and screenshots consume time, especially with software WebGL. Milestones use the sample observation before screenshot capture. Per-sample timestamps and screenshot completion timestamps are retained.
- HTTP byte counts are decoded captured response-body sizes, not compressed wire bytes. One pan response was canceled (`net::ERR_ABORTED`) and its body unavailable; that request counts, its unknown body size does not. Network failures and body-capture errors remain distinct from runtime errors.
- WebSocket byte totals currently include all incoming frame kinds, including observations. Final transport evidence must identify terrain stream batches separately; do not compare total WebSocket traffic directly with HTTP terrain bytes.
- The final streamed version should expose assets/runtime readiness independently of first ground, visible demand completeness separately from padded demand completeness, and batch identity/counts. Report navigation latency as well as latency after readiness. Acceptance should demonstrate useful ground around one second after readiness and visible completion around three seconds, with real cold panning and no HTTP terrain fan-out.

## Streamed acceptance driver

After mode requires zero HTTP terrain requests, received WebSocket `terrain-regions` patch faces and completion events, no runtime errors, no browser simulation Worker, and the same real DO origin. Every sampled region cache must respect both its region-count capacity and retained-byte budget. Final coverage requires exact owner `visibleComplete` plus all 35 sampled visible ground points; padded completion remains separate.

A read-only 25 ms observer records the first independent `assetsReady && runtimeReady`, first nonempty visible demand completion, and first padded completion using the browser performance clock. This continues during awaited screenshots and avoids assigning screenshot delay to owner completion. Useful ground still requires actual sampled picks. The stationary case gates useful ground within 1,000 ms of readiness and exact visible completion within 3,000 ms; the pan case deliberately changes demand and records rather than gates those start-relative latencies. This instrumentation can perturb software rendering and is explicitly part of the measured workload.

Incoming terrain event summaries include request ID, revision, level, region key, face/support counts and bytes; outgoing area requests are recorded too. Full incoming frame byte totals still include observations: filter by the `terrain` field for terrain stream totals. No hosted after run has been claimed by preparing the driver.

## Integrated implementation, awaiting hosted acceptance

The current protocol is terrain baseline version 4. The camera requests ordered
8×8 horizontal regions and a cut level through its existing authenticated
WebSocket. One shared stream owner yields between complete patches; Worker and
DO hosts use the same request and reply meanings. The DO reads each patch from
committed state through its existing serialized resident owner. Requests never
advance simulation time. Cancellation, revision changes and reconnects do not
install old terrain into a replacement view.

`TerrainPresentationOwner` owns camera-independent exposure, including buried
caves, cut caps and the one-column surface halo needed by dual-grid grass. Its
disposable cache is limited to 128 patches / 4 MiB of serialized patch payload.
Each patch is bounded by material sample, face and wire-byte budgets. The live
browser no longer downloads raw vertical voxel chunks or extracts their faces.
The old HTTP terrain routes and chunk wire contract have been removed.

The client retains at most 256 patches / 32 MiB of serialized patch payload,
requests visible regions before padding, and publishes arriving complete patches
at animation-frame boundaries. Those byte bounds describe payload storage, not
total JavaScript or GPU memory. Existing mesh/record diagnostics remain separate.
Pixi, original baked appearance, camera transforms, ordering and picking remain
their existing owners. `assetsReady` and `runtimeReady` are independent of whether
any ground has been drawn.

Source checks so far: 63 client laws, 17 migrated runtime/real-WASM Worker laws,
36 transport/route laws, and 9 stream lifecycle laws (including the subsequently
added pre-auth timeout and conflicting-replay checks). Frontend build and backend
deployment dry-run pass. Full host TypeScript checking is blocked by the existing
missing Node type definitions; no dependency installation was performed. These
checks do not yet establish hosted cold-load latency or visual acceptance.
## Actual socket contract proof

`terrain-stream-proof.mjs --endpoint BACKEND --origin FRONTEND --output NEW_DIR` runs through the same guard. It creates an isolated random bearer world for `colony-performance-256-8`, pauses it, authenticates a real socket, and checks incremental patch identities/completion while an HTTP pause command interleaves. It cancels a large area, replaces it, disconnects another partial area, reauthenticates the same world and requests only missing keys. Paused simulation time must remain unchanged. It never issues an HTTP terrain request.

This is an actual DO transport contract check. The proof itself retains keys and computes the missing set; it does not claim to exercise the browser client's automatic reconnect controller. That controller has separate source/unit evidence and browser integration coverage.

Local Wrangler proof at port 8801 passed on September 20, artifact `.botanical/terrain-stream-local-proof-v2`: guard `run-u2830.scope`, invocation `2db938188710495c9d8d8957f562920c`, terminal exit 0. The first setup run's incorrect proof assumption about the nested baseline version remains preserved in `.botanical/terrain-stream-local-proof`. Hosted parity remains pending deployment.

After-driver measurement correction: software canvas screenshots can take roughly ten seconds and must not precede the useful-ground measurement. After mode therefore records the subjects-without-ground sample without taking its screenshot; the frozen baseline screenshot remains visual evidence of that state. The first screenshot begins only after useful ground has been measured. Continuous owner coverage timestamps still run during subsequent captures, and the 1,000/3,000 ms gates are unchanged. Cold-pan input is scheduled from independent readiness before the picking/capture loop; it accepts partially received ground but requires unfinished initial demand. Its start coverage is recorded explicitly. This avoids incorrectly calling a partial first patch a completed load or waiting for a screenshot before moving.

A subsequent hosted timing attempt showed that even the first-useful screenshot perturbs the remaining software-rendered stream. The final after driver therefore defers **all screenshots until padded completion has been measured**; only the final `padded-complete` image is captured. Early subjects/useful/visible images are explicitly marked unavailable in the report, with their diagnostic milestones retained. Both stationary and cold-pan workloads keep the 35 ground samples and continuous owner clock. Thresholds remain unchanged. Earlier reports and image labels describe their original drivers and are not rewritten.

V3 proof corrections: cold-pan scheduling now waits for both independent readiness and a nonempty `requestedRegions` demand. An empty pre-observation demand is trivially complete and cannot establish that streaming finished. Milestone timestamps use the earliest finite browser-clock value or corresponding independently observed sample timestamp. Null timer fields are excluded explicitly instead of being coerced to zero; this also recognizes a sample that observes completion before the next 25 ms clock callback. Raw clocks remain in the report alongside the selected `measuredClock`. Timing gates are unchanged.
