# Recorded 3D buoyant tracer visual fixture

2026-09-08. Viewer assets from the actual frozen Node solver, not a browser
simulation or a validated ventilation prediction. No UI/game source is owned
by this export lane.

Both cases use an 8×10×6 voxel window (480 cells) with world x/y/z axes,
spacing [1,.54,1] m, origin [-4,0,-3], and world y vertical. A one-cell solid
shell bounds an inner air region 6 m × 4.32 m × 4 m. Sealed air has 192 cells.
The port case changes two shell cells to air throats, giving 194 air cells.

The sealed case has no external faces. The second case has a lower x- port at
local cell [0,2,2] and an upper x+ port at [7,7,3]. Each opening is a real .54 m²
face with a one-metre wall throat. Outside those faces is a prescribed ambient
pressure/temperature/tracer reservoir: zero pressure anomaly, 293.15 K, zero
tracer. **No ambient exterior domain is solved.** No wind or exterior-boundary
placement conclusion follows.

The interior source at local [2,1,2] supplies 60 W and 1e-5 kg/s of passive
tracer during the admitted simulation interval [0,20) seconds. Its cutoff is
passed as an event to the solver's existing `advance` owner. Nothing burns;
there is no oxygen species, combustion, chemistry or reactive heat source.

Each case records 46 snapshots at simulation times 0 through 45 seconds.
dtMax=.1 s remains subject to existing momentum/scalar stability rejection.
The frozen `transport-v2/checkpoint` supplies all equations and owns every time
advance. The exporter only observes the returned state and copies arrays.
Writing JSON, inspecting a sample or playing a viewer timeline does not advance
the world. The bundle is explicitly labelled **recorded native Node result**.

Every sample includes heat anomaly J/cell, passive tracer kg/cell, canonical
face velocity m/s, source/boundary ledgers, exact recorded clock and accepted
step count. Geometry includes units, global cell/face identity, coordinates,
area, distance, solid mask and the declared reservoir conditions. A viewer can
derive Kelvin from `Tref + heat/(rho*Cp*cellVolume)` without inventing state.

Before emission, check finite values, zero quantities in solids, valid method
and geometry identity, exact expected source integral, tracer/heat ledgers,
recorded clock and temperature. Sample observation must leave its caller state
byte-identical. Aggregate maximum temperature, face speed, volume imbalance,
solver iterations/caps and source/method hashes. Boussinesq ratio ΔT/Tref above
.05 stops this visual fixture rather than silently clamping heat.

Run sealed first and ports only with time remaining inside the total 30-second
wall budget. Check budget after every short simulation interval. Any failure
preserves completed samples and an explicit incomplete status. No long room
run, geometry transplant, port, renderer or production-capacity claim.
