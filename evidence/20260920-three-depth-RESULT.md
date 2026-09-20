# Three depth rendering experiment

Status: isolated study published and browser proved. This is not an accepted
replacement for the current game renderer.

Rendered source SHA: `d2b775403c1a8646aab1239ac904a3456ff93d8b`

- [Separate study preview](https://three-depth-d2b77540-fungi-goblin-bnb.levi-fe0.workers.dev/three-depth-study.html)
- [Immutable study preview](https://c1ea5625-fungi-goblin-bnb.levi-fe0.workers.dev/three-depth-study.html)
- Release receipt: `.botanical/three-depth-releases/20260920T050953Z-d2b77540/RESULT.md`

The first dense fixture drew an artificial diagonal stone streak; source
`d2b77540` removed it, made the raised bank solid through its lower layer,
and suppresses buried tops. The final hosted proof and screenshots use that
corrected source.

The study uses the existing original Three builders for living terrain, grass,
tree, finished bed, finished stair, finished door and goblin walk poses. One
world owns the light rig, orthographic camera, terrain chunks, retained object
models, pose bank, picking and disposal. Terrain is batched per 8×8 chunk and
material while retaining triangle ranges for cell selection.

Proof artifacts:

- `evidence/20260920-three-depth-first-shape.png` — original 16×16 scene.
- `evidence/20260920-three-depth-controls.png` — dense preset, water and proof controls.
- `node --test src/studies/three-depth/*.test.js` through `run-proof.sh`: 6 passed.
- `scripts/prove-three-depth-study.mjs` through `run-proof.sh`: no console/page errors,
  640×400 canvas, DPR 1, deterministic cold/warm canvas equality, controls,
  water toggle, dense preset, eviction and rebuild exercised; the 20-iteration
  repeat loop returned to pixel equality, a rendered selection witness resolved,
  and resource counts stayed stable across eviction/rebuild. The final hosted
  pass at `run-u2500` had no browser errors and 3/3 files matched at each preview
  URL. The existing game preview HTML hash stayed unchanged.

The final hosted browser run on this software Chromium measured a frame interval
median of 150 ms, p95 166.7 ms and maximum 299.9 ms while the authored 16×16
fixture was resident. The status reported 365,304 triangles for the court; the
dense fixture reported 1,555,616 triangles. This is a correctness and architecture
study result, not a hardware smoothness pass. No geometry factory work is done
for camera-only changes, but layer changes and rebuilds are synchronous and
visible in the timings. GPU timing is unavailable in this proof environment.

The study documents the cutaway limit in the UI: terrain layers are cut while
retained props are shown whole only when their support layer remains visible;
arbitrary clipping through actors and furniture is outside this experiment.
Water is one transparent horizontal witness with depth test and no depth write;
it is skipped by picking. The original stair metadata still declares landing
Z=-2 while the native geometry rises toward Z=+2; this study follows geometry
and records that discrepancy for integration.

The approach removes the custom camera-specific sprite ordering and pairwise
overlap sorter from this isolated route. It retains explicit terrain exposure,
cover mask ownership, chunk rebuild/disposal, retained pose banks and a
triangle-range picking join. Verdict: **needs a specific bounded correction**
before any production renderer decision, because the original grass density is
too expensive in software Chromium and needs a hardware-accelerated matched
measurement plus further bounded batching review.
