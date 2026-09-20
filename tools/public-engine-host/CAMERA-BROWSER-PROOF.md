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
