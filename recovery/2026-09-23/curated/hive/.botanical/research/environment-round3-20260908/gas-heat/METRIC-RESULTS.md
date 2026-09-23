# Rectangular gas metric and combined stability checkpoint

2026-09-08. Source shape was reviewed before this focused proof. No house
comparison, 900-second run, game source, new package or 3D implementation.

Frozen consumer source: `metric-checkpoint/solver.mjs`, SHA-256
`a72a3a2810eaaf5e87564631084d042f94aa36975bec84c4fa97ff49962a43eb`.
The old67ce0968… source, house/callers, matched results and predeclared plan
are preserved verbatim in `square-checkpoint/`; its inventory is outside that
directory. The new frozen inventory is `metric-checkpoint/source-inventory.json`.

## What changed

One immutable `metric` owns `hx`, `hz`, `depth`, volume and directional areas.
The existing `geometry({dx})` constructor remains a checked square shorthand.
Rectangular callers use `geometry({hx, hz, depth, ...})`; mixing a conflicting
`dx` is rejected and reading `g.dx` on a rectangular grid throws instead of
silently choosing an axis. `g.cells[].x` is physical horizontal distance and
`g.cells[].z` is physical vertical height in this research section; neither
automatically names Hive's horizontal world z coordinate.

Face area and center distance own projection weights, divergence and scalar
diffusion. Momentum derivatives and viscosity use the corresponding directional
spacing. Integrated air receipts use each face's actual area; the old common
area assumption would have been wrong on rectangular cells.

Derived neighbor coefficients are cached at the geometry owner. The predictor
and timestep bound consume that same stencil: no-slip ghosts can double a
center contribution, while a zero-gradient exterior ghost contributes zero.
The existing `advance` owner bounds the sum of advection and viscosity before
prediction and checks the resulting velocity after projection. There is no
second clock or scheduler.

Canonical state now explicitly uses `mac-boussinesq-2d-v2-metric` and binds the
full metric/geometry descriptor. No old save is silently relabeled/migrated.
Square-constructor compatibility means equivalent new inputs and qualified
physical outputs, not a claim that correcting the old unstable rate rule keeps
every historical trajectory identical.

## Focused evidence

`run-u2681.scope`, invocation `415ec37cc6e949169be7d780009e8451`, native session
68784 retained and observed at normal exit0. Five groups completed in5.941 s
on the shared host; qualification SHA-256
`7e5bacdbfbabf8e341a09be9bbcdfb61c212473f1b600c3c1caf1deee1ec2f72`.

- Square shorthand and explicit equal hx/hz produce exactly equal full state
  and receipts. One source-driven low-viscosity square case also matched the
  preserved67ce oracle with zero velocity, heat, tracer and air-receipt error.
- A1×.54×1 m cell has volume.54 m³, horizontal-flow face area.54 m² and
  vertical-flow area1 m². Its known flows yield receipts.0108 and.0100 m³.
  Tracer/heat conservation errors were2.84e-14 kg and1.39e-11 J.
- Rectangular Taylor–Green kept the **same8×4.32 m physical domain** at all
  three resolutions; it exercised nonlinear momentum and pressure:

| hx /hz metres | Velocity RMS error m/s | Pressure RMS error Pa |
|---|---:|---:|
| 1 /.54 | .0075441 | .0027235 |
| .5 /.27 | .0041541 | .00076447 |
| .25 /.135 | .0021498 | .00022578 |

- Rectangular hydrostatic rest: maximum speed6.89e-12 m/s and divergence
  8.55e-12 m³/s. JSON reload/rebuilt cache continued exact state and receipts;
  same-revision hx, hz and depth changes were each rejected.
- A divergence-free alternating velocity perturbation exposed a real old
  stability defect: the separate ceilings admitted a combined coefficient
  1.1804. Perturbation amplitude grew from.01 to.012974 with the preserved old
  solver. The corrected summed bound kept Courant≤.45 and reduced it to
  .00007121 over the same interval. Four tangential no-slip rows exercised
  doubled upwind center terms; the corrected wall case dissipated energy and
  also remained within.45.

These checks qualify rectangular metrics and the bounded analytic cases.
They do not measure a world-scale memory/frame budget, voxel-section behavior,
3D entrainment, narrow portals, smoke exposure convergence or coupled flooding.
The existing square house and its rejected/unfinished criteria remain unchanged.
