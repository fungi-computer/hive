# Early architecture review: real landforms and surface section

Reviewed 2026-09-08 against `terrain.js`, its worker/main callers, `prove-world-lab.mjs`, the current architecture sprint, and the accepted terrain study. This is a source/caller review; no test, browser, or runtime evidence was produced.

## Recommendation

Proceed with a tightly bounded v4 slice. It correctly turns the existing ridge label into geography and gives the same sampler a second deliberate landform consumer. Call the new view a **surface-height section study**. It is an early piece of the terrain study, not acceptance of the later volume section with overhangs, entrances, passages, geodes, picking, or original baked art.

`sampleTerrain(spec,x,z,footprint)` must remain the one authority. Return normalized components from that call, with one explicit law such as:

`elevation = clamp01(baseElevation + ridgeLift - canyonCarve)`

Keep `ridgeLift >= 0` and `canyonCarve >= 0`; category/feature precedence must not decide the height. `baseElevation` should include the existing broad field and coast-side bias so the reported parts sum exactly before the final clamp. Use smooth, continuous profiles in signed global `x,z`, independent of chunk/local coordinates. Keep their principal widths fixed and comfortably above the current atlas footprints (1 at the 512-cell span, 8 at the default 4096 span, and 16 at the 8192 maximum). The in-flight `radius + footprint * 0.5` draft changes the landform's geometry by query scale; remove it unless replaced by a documented area filter. Do not add another octave stack merely to make a canyon. Named centers must be computed by the same ridge/canyon centerline functions and placed on land with non-clamped room for visible lift/cut. Also compute `coastLine` once per sample and pass that centerline into ridge/canyon calculations; the current draft repeats its coherent-noise work three times per cell.

The generator-version bump is required because `spec.identity` seeds all fields and keys. It also exposes a current caller defect: `main.js` computes `namedFeatures(spec)`, but HTML button datasets duplicate v3 coordinates. Bind/update all named button coordinates and labels from `namedFeatures(spec)` at startup. Otherwise a v4 phase change can make “Lantern Ridge” jump somewhere that is no longer the ridge. Extend the terrain/feature codes explicitly (retain existing code values where practical), counts, palette, diagnostics, transferred data, and proof mappings together.

## Section boundary

`section.js` should be pure and import no game, camera, model, asset, DOM, or persistence module. Give it a half-open 24×16 interior origin in global cells and sample exactly a one-cell halo: 26×18 = **468 unique `sampleCell` calls**, yielding 384 interior cells in stable row-major world order. Reject halo zero; the in-flight fallback to the cell's own elevation silently invents a flat boundary. Derive only top faces and the two viewer-facing side faces from known cardinal neighbors. Rebase coordinates only for drawing; geography stays global. State the isolated projection convention explicitly, for example `screenX=(localX-localZ)*halfWidth` and `screenY=(localX+localZ)*halfHeight-elevation*heightScale`, with world `x,z` horizontal and display height vertical. A missing neighbor is never air; the halo supplies every edge comparison.

Keep the existing overview Worker lifecycle and `createOverviewSampler` ownership. Atlas work remains exactly 512×512 = 262,144 samples and cancellation remains observable between eight-row/4,096-sample batches. The analytic contributions should add fixed work per sample. Do not transfer three additional 512² component buffers merely for selected-cell/section diagnostics. Derive and cache the 468-sample section only when its named center or world identity changes, rather than inside every status-driven `render()` call.

## Exact first-shape acceptance

1. At named ridge and canyon centers with footprint 1, the ridge lift is positive and final elevation exceeds base; canyon carve is positive and final elevation is below base. Outside each declared support its contribution is zero. Every sampled final value equals the documented clamped composition.
2. Ridge and canyon names/codes survive nearest-pixel probes at footprints 1, 8, and 16, while existing signed seam, reverse chunk-order, exact local-cell, 512-output, stale-result, and cancellation laws still pass under v4.
3. Repeating each named section produces the same ordered 384 cells/faces/checksum; its 468 sample IDs match direct `sampleCell` calls. A section whose interior crosses `x=-1/0` proves halo floor-division continuity.
4. The page visibly jumps to dynamically sourced Ridge and Canyon locations, shows base/lift/carve/final values, and shows distinct raised and incised surface silhouettes. Record overview sampling, section derivation, buffer assembly/draw, and bytes separately; make no caves, traversal, gameplay, or capacity claim.

No architecture blocker remains if these conditions are kept. Terra should retain the coupled `terrain.js`/`section.js`/worker/main/page/CSS/proof seam through first evidence; Game Delivery alone accepts, commits, and publishes it. The active Shiitake v7 source custody is disjoint and must remain untouched.
