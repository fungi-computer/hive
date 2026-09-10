# Finite voxel water: source checkpoint

This replaces the production direction of the small Richards/Newton experiment.
It is not joined to the game yet. Current source owns signed 3D soil/void cells,
explicit physical face openings, one finite water amount per cell, configured
retained soil moisture and absorption/seepage rates. It has no region clock;
the current game/Region supplies the elapsed interval and commits the candidate.

`createWater(definition)` owns compilation, input validation, immutable stocks,
`advance`, finite vessel `exchange`, reads and current-format encode/decode.
The input definitions are rules and geometry, not arbitrary callbacks. Each
step proposes all neighbor transfers from one stock snapshot and accounts for
shared donor/receiver capacities before applying the same debit/credit at a face.
Sub-resolution transfers retain both stocks, and several absorption faces share
one retained-moisture deficit. Almost-dry remnants stay owned. State retains its fixed initial reference and
signed external boundary. Terrain removal/material transfers will share that
boundary through the existing compound completion owner.

## Remaining before the actual-game join

- Bounded communicating-vessel flow through full roofed passages; local down/side
  transfers alone do not establish this behavior.
- Topology edits/rebind with actual removed-soil moisture and displaced liquid.
- The new atmosphere owner's gas-volume/opening admission for flooded cells,
  including retained roof pockets. A zero-liquid-capacity gas check cannot be
  bypassed merely because this isolated water owner admits an empty void.
- Whole generated clearing producer, current material/yield/pail/work/save/UI
  consumers and actual geometry/picking. No permanent open-pit/one-surface rule.
- Focused laws, actual active whole-game performance, rendering and deployment.

Eleven focused laws are authored; none has run at this checkpoint. The 578-cell
case uses the actual 1×0.54×1 m voxel metric and specifies a synthetic
two-soil-layer clearing plus halo workload; it is
not generated-game or performance evidence. The implementation limits and work
guard are protective admission bounds, not measured capacity claims. Existing
research sources remain preserved until their real consumers are migrated;
there will not be two selectable production water solvers.
