# Actual voxel section → gas geometry qualification

2026-09-08. This proof owns only this new `section-proof/` directory. Root owns
`voxel-world.mjs` and `section-geometry.mjs`; gas owns its separate solver.
Root files were read-only throughout the run. Source snapshots retain the exact
reviewed root bytes; they are source evidence, not a relocated runtime bundle.

## Binding correction from first source review

The original section carried world identity/origin/axis/window beside its gas
constructor input, but the numerical geometry identity only bound local shape,
metric and revision. Two identical air sections from different places could
therefore admit each other's saved gas fields. A stale-world check alone did
not bind an incoming field to that location.

Root corrected the section constructor input with an opaque `domainId` encoding
complete world/space/base identity, origin, selected axis and window dimensions.
Gas added a checked nonblank domain identity to its existing geometry identity
owner. Standalone callers default to `isolated-study`; the old frozen metric
checkpoint remains untouched. This adds no game-agent protocol or second store.

## One focused run

Ordinary command:
`run-proof.sh node .botanical/research/environment-round3-20260908/worldgen/section-proof/qualify.mjs`

Owned unit `run-u2701.scope`, invocation `2e0753c878974ae6b4ed7dcb94e6baf8`.
The initial retained native call returned normal exit0; no live session remained
to poll. Four groups completed in0.180 s internal wall time, far below20 s.
Exact source pins were checked again at completion:

- `voxel-world.mjs`: `44e28bd39c1f97193ca3471ce851bfe040b238401d566fdb223f1e4c76059201`
- `section-geometry.mjs`: `0791cb2e670a92ba22b44589426f111ca38b7927d3b148c7d6c1cd9c26919d4f`
- Frozen `gas-heat/binding-checkpoint/solver.mjs`: `09176c849556cdb01d5b6a63eada6eef9514948fda48f5e225a222a4c865c8d5`
- Proof: `6869ea1f3912f9c5767ddb553e295fa2be893f0571ae6ac9dbf7416bbfa21827`

## What passed

- `describe()` returns an independent identity. Mutating a returned section's
  solid array/metric input does not edit the canonical voxel world or its save.
- Both horizontal section axes, world x and world z, map correctly. Solver
  vertical z maps explicitly to **world y**. Checked centers include negative
  origins on every axis; for example x-section column2/row1 maps to
  `(-15.5,-1.35,-8.5)` metres. Cell volume is1×.54×1=.54 m³.
- An actual generated8×10 section at a negative horizontal origin contains
  48 air and32 solid cells. Every row-major mask index was checked against the
  canonical voxel reader, rather than an independently regenerated terrain copy.
  Zero-anomaly/tracer rest remains exactly still on that geometry.
- One real underground edit carves voxel `(-18,17,-9)` through the world's
  expected-revision/material operation. It removes exactly section index8 from
  the solid mask. The old section fails its stale-revision check, and its saved
  gas state rejects against the changed geometry. No quantities are initialized
  in the new cavity or transplanted across this edit. The face count happens
  to stay82 because this isolated cavity has no open neighbor: shape validation
  still detects the changed cell, rather than relying on face count alone.
- Equal-shaped air fields from a different origin, orientation or world reject
  despite matching dimensions, metrics and revision. Exact same-domain
  save/reload and reconstructed cache reproduce full state and receipts.
  Empty/blank/non-string domain IDs reject.
- The preserved pre-binding metric solver actually admits the foreign-origin
  counterexample, while the new bound solver rejects it. This demonstrates why
  the correction is required; it is not merely a checked string comparison.

## Limits

This is a two-dimensional section with one-voxel extrusion, not3D world gas.
Its global world revision conservatively invalidates even unrelated sections.
The consumer only extracts geometry; the world owner has not yet defined gas
mass/displacement, newly excavated-volume initialization, pressure work or a
clock/field update after digging. No such quantities were invented by this proof.
No browser, large-world throughput, fire, oxygen or water-coupling claim follows.
