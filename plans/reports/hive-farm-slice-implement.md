# THE HIVE FARM — Build-First Slice · Implementor Report

**Date:** 2026-08-17 · **Implementor:** rabbit (on the two box) · **Box:** workspace two
(/workspace/hive-poc, Vite + Pixi v8, no git, no browser) · **Spec:** consultant §7 slice
(hive-farm-gamification-consult.md) + verdict + Fern review + the live POC main.js.

## 1 · What was built (the §7 slice, exactly)

1. ticker.js — fixed-step accumulator (clamp Δ≤100 ms), game-date {day,tod,phase} (DAY_TICKS=120), snap-on-return, replaces the drift setInterval. src/ticker.js (pure)
2. sim.js + tables.js — wheat stage table, growth law (+1/tick only while a row says executing AND the body stands at the plot in tend), JOB_CLASSES wood/water/sow/harvest (stone DORMANT), no Math.random, SEED-42 script. src/sim.js (pure), src/tables.js (pure)
3. Re-tasked script — the POC 14 dispatches re-classed: 10 classed wood chops (coexistence), ONE requeued tend stutter (the stall law), one sow→tend→harvest cycle (full loop). Events keep real feed row shape {kind:'row', rowId, queue, state, outcome, attempts, observedAt}. src/feed.js (SEED-42 emulator; classification lives in the adapter per §5.2)
4. Scene — existing trees + one well + two plots + den + dormant outcrop; Kenney villager sprites PENDING manifest (honest colored fallbacks meanwhile). src/hive.js
5. Piles — wood + water pools live; grain appears only when the harvest settles; pool-caps; the DOM counter chip never lies. hive.js renderPiles + referee
6. Rooster glance — one soul-loop animal; glance on the FIRST settle (sow settle t=43, plot-1, ≤1.3× avg travel), 4-frame head rotate, idle-only. sim glanceFired gate → fx; hive 8-keyframe rotation
7. Tests (node, no Pixi) — §3.3 trace vector; §4.6 invariants after EVERY step; requeue-stall zero-growth; interrupt-no-grain; + determinism, purity greps, stone-dormant, ticker snap. 13/13 GREEN. tests/sim.test.js

window.__HIVEPOC extended: seed, ticksPerLoop, colonists, count, tick, + steps / day / phase / piles / plots (+ date, threads, pollAgeSec, invariants as getters over live sim truth).

## 2 · The honesty evidence (the two NO laws)

- Requeue-stall: tend T1 executing t=50 (W3 walks den→well); REQUeued t=80 → W3 blipped home (no walk); plot progress 0 and water pile 0 across the whole requeue window and through attempt-2's walk (still 0 at t=166); accrual began only at t=167 when W3 stood at plot-1 in tend. (stall law test)
- Interrupt-no-grain: an executing water row watering 33 ticks then interrupted yields 0 water / 0 grain; the honest labor already accrued is KEPT, nothing mints afterwards; an interrupted harvest yields 0 grain. (interrupt law tests)
- §3.3 trace reproduced tick-exact: sow settle t=43 (plot seeded; game-day 3 · dusk at t=430 vs cropDay 2 — the two-days split), watering [167,429]=263 and [480,959]=480 ⇒ progress 743, cropDay 6, stage gold; water 40→80 at settles; grain 3 at t=1043; first settle = the crop's birth; all §4.6 invariants hold after EVERY step of the full run + 12 seeded batch schedules + 200 ticks idle drift.

## 3 · Asset mapping — TBD by Levi (values only change in src/assets.js)

The pack ships NO manifest (tile_0000..0131). The renderer sits on ONE seam — src/assets.js
(TILES map idx+scale; FALLBACK paints; tileUrl). While idx are null the page renders honest colored
markers (POC squares) — nothing blocks.

Tools for the naming pass (tools/, pure Node): tile-fingerprint.mjs (full PNG decoder handling the
pack's bitDepth-2/4 palette-indexed tiles + 16×16 ASCII), sheet-view.mjs (12×11 sheet AScii map),
preview-ascii.mjs (Preview/Sample montage), palette-dump.mjs (PLTE/tRNS).

Provisional reads (confirm at mapping time, NOT final): villagers ≈ large skin figures (0/1/12/13/36/37-family);
big green blocks ≈ canopy/grass (24/25); big tan ≈ soil (48–51); red building w/ skin ≈ house/den (90/91/92);
light-green blocks ≈ crop patches (94,105–107,117,119); blue+grey ≈ water (72/73?,110/111?); grey-blue ≈ well
family (126–128); sacks ≈ row-10 clusters. Only assets.js values change; public/assets copy + curl 200 already serve.

## 4 · Gates (WITH timestamps, final tree)

- node --check every .js (tables, ticker, sim, feed, assets, hive, main, tests): ALL OK — 2026-08-17 03:21Z
- node tests/sim.test.js: 13 passed, 0 failed — 2026-08-17 03:21Z
- curl http://localhost:5173/ → 200 (Vite v7.3.6, strictPort) — 2026-08-17 03:22Z
- served /src/main.js references /src/feed.js /src/hive.js /src/sim.js /src/ticker.js (assets.js via hive.js) — 2026-08-17 03:22Z
- tiles served: curl /assets/kenney-tiny-farm/Tiles/tile_0000.png → 200 (assets copied into public/, 146 files) — 2026-08-17 03:22Z

## 5 · Problems hit (and fixes)

1. Sandbox worker saturation at session start — execute refused ("concurrency limit"); static file tools still worked; the pure core was authored before the sandbox recovered.
2. Kenney PNGs are palette-indexed at bitDepth 2/4 — naive decode gave garbage; tools now unpack sub-byte indices + PLTE/tRNS (kept for the manifest pass).
3. The §3.3 trace vector must be played continuously — step-every-tick; also fixed a real bug: row/firstSettle/rowLog timestamps used stale clock.steps instead of the passed-in step count (applyRow now takes now).
4. An fx regex rewrite broke five state.fx.push calls (missing close paren) — syntax gate caught it; repaired; re-ran green.
5. public/ missing — Vite serves only public/ at root; assets/ copied to public/. No container recycle during this build.
6. Report write to the docs workspace (botanical) hit a DO memory-limit reset; a memory retry hit a network blip — this copy is on the work box.

## 6 · One line

The HIVE FARM slice is built and green — one honest fixed-step clock, one pure reducer, 13/13 node tests (stall law and interrupt law proven tick-exact), dev server serving 200 with the Kenney tiles staged for Levi's manifest (only src/assets.js values change when the names land).
