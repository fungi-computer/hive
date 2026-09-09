# Main Clearing generated wet terrain

The playable Clearing now saves one immutable generated-world/water/spoil
checkpoint, alongside its existing material and work owners. There is no authored
terrain edit list or backfill command. Current saves are schema18 and the durable
Goblin program is `goblin-wet18-v1:<optimizer build>`. Unsupported formats reject.

The registered frame maps local `(x,z)` to world `(x-7,15,z+119)`. One horizontal
voxel is1m; vertical voxels are.54m; a storey spans four vertical voxels. All225 map
columns query the same generator. The12 naturally lower edge cells are explicitly
non-standing under current navigation (z0/x7..14, z1/x12..14, z2/x14). This is a
fixed standing-datum interim, not a full deep-level navigation migration. Authored
non-building scenery is retained; no original figure/prop geometry changed.

The wet patch owns32 finite soil voxels in16 columns. That is a bounded simulation
region, not the map boundary. Excavation admission calls the actual detached
adapter: neighboring wet-soil ownership, retained collar, vertical vent and
connected-column limits apply. The four interior columns (local x7..8,z9..10)
can currently be cut through their two soil voxels to stone. Commands/jobs carry
exact world `[x,y,z]` targets. Workers use the existing libcolony assignment and
walk/work owner, staying on a legal rim rather than entering the hole.

At completion, one private candidate joins excavation, one ordinary material-owner
soil unit at the rim and job completion. An exception leaves the browser Clearing
unchanged. Region batches use that same deep owner, cloning mutable Clearing data
once per bounded batch; immutable terrain is shared until the environment owner
returns a new checkpoint. The existing50ms constant advances environment exactly
once after successful nonpaused physical work. Rendering, paused intent and
receipt replay cannot advance it.

The full water budget includes finite exported wet spoil. Ordinary soil quantity
equals export count only while this game has no soil consumer. Exported pore water
is accounted in the environment export ledger; no moving lot-to-moisture
provenance is claimed. Current saves revalidate this budget, clocks, exact targets,
material custody and occupancy of excavated columns.

Geometry queries use actual point solidity and registered bounds, including caves.
Structure geometry consumes that capability and completed sites; it cannot infer
walls from navigation or rendered pixels. Terrain picking names actual surface and
side-wall voxels. Original Three earth art is clipped to generated openings. The
water texture uses exact finite-column surface height with earth depth occlusion;
its geometry is retained, and texture invalidation follows the existing rounded
pixel projection. This display approximation changes no saved physical fact.

Proofs are distinct: u4242 passed10 actual-optimizer/Node-SQLite main/Region laws,
u4230 passed14 main/structure laws, u4238 passed9 current codec/input/picking laws,
and u4241 passed strict platform declarations with skipLibCheck:false. These are
functional evidence, not current native-DO crash or browser/render acceptance.
The current browser driver is `scripts/prove-digging.mjs`; no browser has run for
this source yet. Prior native proof receipts retain their original source pins.

No20Hz capacity claim is made. The frozen workload in the ignored handoff measures
20 idle ticks,80 actual dig ticks and60 post-reconstruction ticks, separating
clone, field, query and serialization costs. That measurement awaits the shared
adapter-owner optimization and coordinated window. Numerical equations, world
generator, original art, optimizer and host durable transaction are unchanged.
