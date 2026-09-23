# Narrow physical-height query acceptance

2026-09-08. Independent source/caller read; no proof rerun and no source changes.

**Accepted. Retaining the existing generated-world recipe and schema-2 save identity is correct.** This changes query work, not generated content or save meaning.

The complete diff against frozen `volume-v2/voxel-world.mjs` contains only:

- Import `sampleTerrain` instead of `sampleCell` from the same frozen height module.
- In `columnAt`, call `sampleTerrain(spec, x, z, 1)` and update its explanatory comment.

The height owner shows that `sampleCell(spec,x,z)` first calls exactly `sampleTerrain(spec,x,z,1)`, then computes four-neighbor wet/dry display facts and spreads them into the result. It does not alter `bedLevel`. The voxel owner consumes only `bedLevel`. Public voxel coordinates and brick addresses remain checked safe integers inside the same finite bounds before reaching this path, so omitting sampleCell's redundant integer check does not broaden admitted world coordinates.

No cave noise, height quantization, seed, world/realm identity, material rule, coordinate convention, resident-cap rule, sparse edit, revision or codec code changed. `heightSource` still names the unchanged height-module hash. The candidate's own source hash differs and belongs in build/evidence provenance; it is not a reason to invalidate saves whose mathematical recipe is identical.

I read the actual `qualify.mjs` caller and frozen run-v1 proof. Recorded **run-u2912.scope**, invocation prefix **bc412595**, exits 0 with four checks and `errors: []`:

1. Full recipe/world identity, material definitions and initial saves agree.
2. Twelve complete bricks, covering the known cave area, negative-coordinate boundaries and near-surface terrain, are byte-identical: 49,152 compared material cells.
3. A real edit survives eviction; old reads new saves and new reads old saves with identical canonical state.
4. A file-written checkpoint reopens to identical canonical state and the edited cell.

Both runs record 12 generated bricks, 3,072 column-level `heightSamples`, 34,816 cave evaluations and four evictions, retaining eight bricks/32,768 projection bytes. `heightSamples` counts column requests in both versions; it never counted the old display helper's extra neighboring terrain evaluations. Do not present that unchanged counter as a count of all internal terrain samples.

The observed old 1,465.5 ms versus new 228.4 ms is a single sequential shared-host comparison, with output comparisons included in the candidate interval. It supports pursuing the narrower query, not a controlled speedup claim. Mathematical equivalence follows from the exact source relationship as well as the finite fixtures.

Reviewed SHA256 pins:

- Candidate `voxel-world.mjs`: `a1f566686c6d9abca60e185718a81a23b41cfdbea590da48fe2865a71eb3ad38`
- Candidate `qualify.mjs`: `8eb1933f2cc420953bab089c28868a5a614cd32e80ee9a4f519ad46497fb8b51`
- Frozen original voxel owner: `6aae7b83f71d95f30157f78603de9cc2f90a1d4bf0aab8818e03aebe355e6e3f`
- Unchanged height owner: `530464448725cacb73836f34c2c48ddbf3e4a8c0d8a353498e7fe6da03f45bdf`

Existing terrain/cave/stock limitations remain. This acceptance does not replace imports or provenance in the current gas-binding proof, does not integrate production code, and does not claim a new world-generation algorithm.
