# Gas/heat momentum reference: first source checkpoint

2026-09-08. Only this ignored gas-heat directory is owned. No game source,
dependencies, browser, prior evidence or deployment changed.

## First executable result

`solver-v1.mjs` preserves the exact solver accepted by `qualification-v1.json`.
SHA-256 `9b549ae54d7fe0f9d32fd69471fb2794e0644b53a81afae802057c0610afc86c`.
`run-u2613.scope`, invocation `3ebad22736134706bdcc5457496fa5e5`, observed normal
exit 0 in the initial retained native call. Eight independent numerical checks
took 0.629 s internal wall time. No pending process remained to poll.

- Ambient and uniformly warm hydrostatic rest; warm maximum speed 9.52e-12 m/s.
- Removal of an authored discrete potential gradient; speed residual 6.31e-12.
- Random-field divergence correction, non-increasing velocity-square norm and
  projection idempotence. This norm check covers uniform interior face volumes;
  it is not a complete open-boundary kinetic energy law.
- Exact viscous periodic shear decay. 8 to 16 cells: RMS .00754 to .00179 m/s.
- Periodic passive scalar translation. 8/16/32 cells: RMS concentration errors
  .1353/.0750/.0385; mass error at most 1.11e-16 kg, signed heat remains bounded.
- Save/rebuild exact full-state and face-receipt continuation. Erasing face
  velocity changes subsequent state, proving velocity is canonical history.
- A resolved tall open boundary permits balanced inlet/outlet counterflow.

The source is a staggered-grid, first-order donor-cell momentum predictor with
explicit viscosity and buoyancy, one linear velocity-potential projection and
conservative finite-volume scalar transport. Default viscosity/thermal/tracer
diffusivities are declared molecular-scale constants, not coefficients fitted
to a desirable room outcome. Coarse numerical diffusion is unresolved error.
Pressure is derived from a cold solve; connectivity, component pins and matrix
diagonal are cached per geometry. This does not introduce pressure warm-start
history or re-solve a nonlinear Darcy closure.

## Unproved additions after that pin

`solver.mjs` now adds thin face barriers and tangential half-face no-slip ghosts
so a floor cannot exchange momentum through a missing normal connection. It
also aggregates an interval receipt rather than retaining all substep arrays.
Those edits need their own focused qualification; v1 results do not certify them.

`house.mjs` is first fixture source only. It retains a 4×6×2 m house, right-hand
one-metre stair opening, 1×1×2 m source and breathing neighborhoods, 120-second
1.2 g/120 kJ prescribed pulse, initial indoor warmth 5 K and initially closed
vents. Resolved outside regions flank and cover the house. Outside far edges
use zero perturbation pressure, ambient inflow scalar values and zero normal
velocity derivative; walls impose no penetration and declared no-slip ghosts.
Opening at 120 s preserves all stocks and surviving velocity IDs; newly exposed
faces begin at zero velocity before the next projection. There is no combustion.

**Geometry mismatch is explicit:** the old model's one-metre-tall opening had
only 0.5 m out-of-plane width inside a 2 m extrusion. A full-depth 2D reference
cannot represent that throat without an additional variable-area/junction model.
This new fixture currently uses one-metre-high, 2 m² full-depth openings, four
times the old aperture area. Sealed/local/high cases can be compared with each
other, but cannot be presented as an equal-opening comparison with old results.
The retained 80% export / 25% upstairs improvement goals stay recorded; no target
is weakened to make a result pass. Parent review will settle this first fixture
choice before a numerical room comparison is run.

## Limits and next bounded checks

Before a room run, qualify a closed thin floor and no-slip channel behavior after
the face-barrier change. Then run a short 10 simulated-second timing pilot with
a 20-second wall budget. That pilot does not reach the opening event or establish
ventilation benefit. Its measured cost will ground any requested longer budget.
Only after that can a declared layout comparison and timestep/spatial/ambient-
extent refinement be meaningful. No unbounded sweep or finer-grid retry follows
automatically from a failure.

This remains two-dimensional, incompressible Boussinesq/dilute transport. It is
not calibrated 3D plume entrainment, high-temperature fire, oxygen chemistry,
sealed compression, water displacement or greenhouse radiation/condensation.
No portable/native/WASM or browser throughput claim follows from these Node runs.
