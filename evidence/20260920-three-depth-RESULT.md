# Three depth rendering experiment

Status: locally rendered and browser proved in the isolated study. The frontend
preview URL is supplied by the integration owner after source review and upload.

Source SHA: `8a8438fb`

The study uses the existing original Three builders for living terrain, grass,
tree, finished bed, finished stair, finished door and goblin walk poses. One
world owns the light rig, orthographic camera, terrain chunks, retained object
models, pose bank, picking and disposal. Terrain is batched per 8×8 chunk and
material while retaining triangle ranges for cell selection.

Proof artifacts:

- `evidence/20260920-three-depth-first-shape.png` — original 16×16 scene.
- `evidence/20260920-three-depth-controls.png` — dense preset, water and proof controls.
- `node --test src/studies/three-depth/*.test.js` through `run-proof.sh`: 4 passed.
- `scripts/prove-three-depth-study.mjs` through `run-proof.sh`: no console/page errors,
  640×400 canvas, DPR 1, deterministic cold/warm canvas equality, controls,
  water toggle, dense preset, eviction and rebuild exercised.

The final browser run on this software Chromium measured a frame interval median
of about 133 ms, p95 150 ms and maximum 300 ms while the authored 16×16 fixture
was resident. The status reported 364,804 triangles for the court; the dense
fixture reported 1,562,304 triangles. This is a correctness and architecture
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
