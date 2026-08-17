# THE HIVE FARM — Metrics Surface · Implementor Report

**Date:** 2026-08-17 · **Implementor:** rabbit · **Box:** workspace two — this report lives on the
work box at /workspace/hive-poc/plans/reports/hive-metrics-implement.md. Dev server was LIVE during
the build (pid serving port 5173, exposed) — no restart: edits landed via file write and Vite HMR;
verification via curl.

## 1 · Metrics spec (surface-able, visible, honest)

New zero-dep module `src/metrics.js` — a windowed real-time sampler (default window 1 s). It is NOT
part of the pure sim: the sim never sees it, and the three purity-gated files (sim/ticker/tables)
were NOT touched this pass — "pure state untouched" holds literally; all counting lives in main/hive.

The surface (DOM panel `#metrics`, bottom-left, styled to match the referee chip; toggle `M` / `~` / ````):

| Line | Numbers | Trace |
|---|---|---|
| render | FPS (windowed, frames/span) · frame ms avg / min / max · window s · (+ pixi FPS if ticker exposes it) | measured performance.now over the SAME ~1s window |
| sim | step · date day · phase · tod · steps/s · acc ms · delta ms | ticker.steps + gameDate + ticker.acc residual + tk.deltaMS (the fixed step is the honest clock; labelled "sim", never "FPS") |
| tasks | executing · settled · requeued · queued · walks | sim.rows live mirror (each row's last-observed state) + derived workers in WALK/RETURN |
| render | display objects (recursive scene-graph count) | cheap read off the Pixi container tree |

Anti-conflation: the panel labels the two clocks explicitly — "render FPS" (measured frames/sec) vs
"sim step / date" (fixed-step accumulator) — the consult's referee line (day · phase · wood · water ·
grain · settled/executing · poll age) stays the single on-screen truth; the panel is a meters
surface, not a fiction, every number traceable.

`window.__HIVEPOC` extended (headless same numbers): fps, frameMs, dtMs, stepsPerSec, accMs, tasks,
walks, objects, metricsVisible, metrics snapshot. Existing getters untouched.

## 2 · Verification (final tree, timestamps Z)

- node --check src/metrics.js, src/main.js (+ full set incl. hive/sim): ALL OK
- node tests/sim.test.js: 13 passed, 0 failed (sim untouched — purity gates intact)
- curl http://localhost:5173/ -> 200 (server never restarted; HMR)
- served /src/main.js (cache-busted) imports "/src/metrics.js" alongside feed/hive/sim/ticker
- src/metrics.js -> 200; index.html contains the #metrics panel
- Tile-name status unchanged: asset mapping still pending Levi; fallbacks intact (assets.js untouched).

## 3 · Notes / problems

- First curl of the served main.js showed a STALE transform (pre-HMR cache); a cache-busted request
  (?cb=1) confirmed the metrics import — no server restart needed, matches "verify via curl: HMR picks
  up edits".
- The metrics panel refreshes once per window (1/s) to keep DOM churn off the honest loop; the main
  referee still updates per frame.
- No container recycle; no git, no browser (verified via node --check + sim truth + curl + module-graph greps).

## One line

Metrics surface is live on the hive — render FPS/frame-ms (windowed, labelled), sim steps/s + date +
accumulator, task counts off the live row mirror, display-object cost — toggled with M, mirrored in
window.__HIVEPOC, 13/13 tests still green, curl 200, and the pure sim untouched.
