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
initial condition live in `world-presets/seepage/wet-clearing.mjs` and are not assertions
about actual soil or water inferred from a terrain color.

Current admitted limits are 64 porous cells, 8 reservoirs, 72 unknowns and 16 surface
connections. Vented water columns explicitly own 1..16 vertically contiguous air
voxels and one porous floor; their Darcy graph must remain connected. Physical
definition density is 1000 kg/m³; spacing is explicit. A surface edge derives its
crest and opening from two neighboring columns and uses the declared normalized
broad-crested overflow law. It carries no momentum or wave state.
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

Connected surface/soil laws now exercise a real 0.54 m ledge, filling a receiver
above one voxel, closed/subcrest/equal-head transfers, reversal and independent
drainage-curve refinement. Surface edges remain constitutive chords in the same
ledger; numerical continuity cleanup cannot transfer water across a closed crest.
The column geometry is current format only. The one-cut world consumer still
rejects an open lateral outlet; deriving new connections through repeated world
excavation is the next caller join. Terrain backfill, solid-floor/disconnected
components, free-falling travel, gas coupling and pail/material exchange remain
unfinished. These are not replaced by the surface approximation.

Breaking changes are allowed. Only the current format is read; no legacy
compatibility reader is included.
