# Finite soil water

The public `index.js` supplies one pure owner for finite porous-cell water and
connected reservoir exchanges. The consumer supplies soil coefficients, cell
coordinates, physical spacing, connections, closed boundaries and initial mass.
The engine contains no Goblin material IDs, generated geography or initial-water
recipe. `world-presets/seepage` binds it to the current height/cave world.

`createVolume(definition)` compiles derived geometry. `initial`, `advance`,
`read`, `encode` and `decode` operate on the one canonical mass/clock state.
Advancement returns a detached result and a paired-face receipt; it never commits
time or storage itself. Failed numerical/work admission leaves the input intact.
The host must commit the new field with related terrain/material changes through
the region transaction. Compiled geometry is rebuildable, not saved second truth.

This is the retained rigid-pore Richards owner, with fixed-temperature liquid,
series-resistance Darcy faces and bounded implicit advancement. The original
source hashes are in `provenance.json`. Those research sources remain evidence;
new consumers import this implementation. The synthetic loam and water-table
initial condition live in `fixtures/generated-seepage.mjs` and are not assertions
about actual soil or water inferred from a terrain color.

Current admitted limits are 64 porous cells, 8 reservoirs, 72 unknowns and one
vented voxel pit. Physical definition density is 1000 kg/m³; spacing is explicit.
The tested generated scene has 18 initial soil cells, then 17 plus the excavated
pit. It removes one actual world soil cell, exports its pore water with spoil,
and accumulates approximately 12.5654 kg of seepage after 600 simulated seconds.
Current-format save/restart reproduces the final physical state exactly and
matches retained numerical facts. An independent metric/material fixture uses
the same owner. These are focused numerical/source laws, not hosted gameplay or
a large-world performance claim.

The fixed numerical tolerances and bounded work controls remain in `state.mjs`
and `geometry.mjs`; no acceptance threshold was relaxed during extraction.
`compileFaces` now separates traversal and flow construction (Fallow cognitive
56 → 11). Estimated-coverage CRAP advisories remain; public entry reachability is
not inferred from a main-game import because integration is unfinished.

Spill routing, multiple connected excavations, terrain backfill, free-falling
water, gas coupling and pail/material exchange are still unfinished. An open
lateral outlet rejects instead of inventing a basin wall. This module is one
part of the water engine, not a substitute for those required capabilities.

Breaking changes are allowed. Only the current format is read; no legacy
compatibility reader is included.
