# First physical qualification: water at rest in one metric basin

Status: proposed to Game CTO before running. This directory owns only the new
harness and evidence. Reuse the frozen `../stable-order-v1` native libraries;
do not alter upstream, solver equations, stable ordering, prior recordings or
the game. A passing result here will not qualify a waterfall or world scale.

## Why this fixture first

The previous 512-particle tank started as a falling block. Its default particle
volume was `0.8 * diameter^3`, but its lattice spacing was the diameter. Its
initial interior density was approximately 0.8 of rest density. That test
qualified an exact restart for its declared trajectory; it did not qualify a
resting water column. The deliberately compressed fixture was a separate
overpacked stress, not a prescription for initialization.

The next question is whether the unmodified method supports a known mass of
water against gravity, at the correct height, with little motion and without
manufacturing energy. A rest failure is cheaper and easier to diagnose than a
combined falling-stream, ledge-collision and splashing failure.

## Fixed physical problem, then its sampling

- Inner basin: `x,z in [0,1] m`, `y in [0,1.08] m`. Thus the horizontal
  footprint is one 1 m cell and the wall height is two 0.54 m vertical cells.
  All six faces are sampled, including the ceiling well above the water;
  there is no modeled gas pressure. Face edges and corners are deduplicated.
- Water initially fills `[0,1] x [0,0.54] x [0,1] m` at rest. Physical volume
  is exactly 0.54 m3 and mass is 540 kg at the fixed rest density 1000 kg/m3.
  Gravity is `(0,-9.81,0) m/s2`. No inlet, outlet, particles added/deleted,
  viscosity, surface tension, XSPH, clamp, damping or collision teleport.
- First sampling: 10 x 6 x 10 cell-centered fluid points, 600 total, at
  spacings `(0.1,0.09,0.1) m`. Each particle represents 0.0009 m3 and 0.9 kg.
  Select the library radius from its existing volume rule:
  `diameter = cbrt((0.54/600)/0.8)`, `radius = diameter/2`. Keep the default
  mass rule, rest density and support-radius relationship unchanged. This
  matches quadrature mass to the physical box; it does not replace the
  equations or empirically compress a block until it generates pressure.
- The sampled wall planes are exactly `x=0,1`, `z=0,1`, `y=0,1.08`, not
  planes silently moved to match the observed resting height. A single closed
  surface lattice uses 20 x 24 x 20 subdivisions, spacing
  `(0.05,0.045,0.05) m`: 2722 distinct boundary samples. Every rectangular
  face is covered, including corners; no missing seam or wall aperture.
  The maximum spacing is less than the fluid kernel support. Upstream Akinci
  pseudo-volumes are computed from this full static sample set once.
- Fixed external step 0.001 s, CFL_NONE, one solver thread, Z-sort disabled,
  same canonical neighbor ordering and unchanged iteration/error defaults.
  First run: 1000 steps, 1 s physical time, one guarded process with 30 s
  wall ceiling. Record its last 0.25 s separately as the rest window.

The fluid's initial half-cell distance from a wall is a *quadrature standoff*.
Its library radius is a kernel/visual parameter; the particles are not
nonoverlapping rigid balls. In particular, some nominal radius spheres already
intersect the exact wall at initialization. Report initial and final signed
center clearance, nominal-radius intrusion and equivalent-volume-sphere
intrusion separately. Neither sphere proxy changes the wall or the represented
volume. The strict leak check is particle centers crossing a geometric solid
face; passing it alone does not establish correct water volume near walls.

## Independent physical expectations

- `M = 540 kg`, `V = 0.54 m3`, free surface `H = 0.54 m`.
- Center of mass `(0.5,0.27,0.5) m`.
- Hydrostatic gauge pressure `p(y) = 1000*9.81*(0.54-y) Pa` below the surface;
  base pressure 5297.4 Pa. Required total upward boundary support is
  `Mg = 5297.4 N`. In continuum rest the vertical side walls contribute no
  net vertical force. Report the sample-set force decomposition as diagnostic;
  do not assume a corner sample has one unique plane normal.
- Initial kinetic energy zero; initial gravitational potential energy
  `M*g*H/2 = 1430.298 J`. There is no energy source beyond gravity already
  included in potential energy. Numerical damping may reduce total energy;
  an energetic, shrinking or compressing column is not thereby a rest pass.

## Pressure support observation without inventing a pressure API

Read actual public fields with exact name/type validation. After a full step,
the density-pressure field is multiplied by `dt^2` and the divergence field by
`dt`. Both contributed velocity impulses at the same pre-advection positions.
Before stepping, retain those positions and total momentum. Afterwards, use the
same completed neighbor lists, fixed boundary positions and volumes to
independently accumulate the actual boundary term for *both* fields:

```
phiP = savedDensityWarm / (dt*dt)
phiV = savedDivergenceWarm / dt
aWall(i) = sum_over_boundary_j [
  -Vj * gradW(oldXi-Xj) *
  (admitted(phiP_i) + admitted(phiV_i))
]
Fwall = sum_i mi * aWall(i)
admitted(phi) = abs(phi)>1e-5 ? phi : 0  // exact pinned solver gate
```

This observation does not call another neighborhood search, sort, reset or
solve. Static `BoundaryModel::addForce` intentionally does not retain reaction
forces, so asking its public force accumulator would give a misleading zero.
The independently observed impulse must satisfy
`dt*Fwall = momentumAfter - momentumBefore - dt*M*gravity` within the declared
closure tolerance. This checks the field scaling, both solver contributions,
old/new position distinction and internal pair-force cancellation. It does
not make that implementation formula an independent continuum oracle: the
separate expected quantity is `Mg`, paired with height and rest checks.

Do not label raw warm fields pascals. Record them separately, and record the
combined acceleration-potential estimate. Only an explicitly derived
interior pressure conversion may be compared with `rho*g*(H-y)`; near-surface
kernel deficiency and boundary pseudo-volumes prevent treating this as a
pointwise measured pressure everywhere. Pressure-profile fit is diagnostic
in this first packet; integrated support is the pressure acceptance check.

## Criteria fixed before the first run

All tests report individual outcomes; finite-state or restart success cannot
override a physical failure.

1. Exactly 600 unique fluid IDs and 2722 boundary samples; one registration
   per physical point set with correct index/user-data ownership. Mass drift
   at most 1e-9 kg, no nonfinite state, no cap hits, no center more than
   1e-6 m beyond any of the six solid planes.
2. Per-step independent impulse closure error at most
   `1e-7 * max(1, M*g*dt) kg m/s`. Report worst error and component.
3. Mean upward support during the last 0.25 s differs from `Mg` by at most
   5%; mean horizontal force magnitude at most 2% of `Mg`.
4. During that same window, RMS particle speed at most 0.05 m/s; maximum
   vertical COM deviation from 0.27 m at most 0.027 m (5% of depth), and
   horizontal COM deviation at most 0.01 m. Do not subtract an observed
   effective wall offset to improve this comparison.
5. Total mechanical energy never exceeds initial energy by more than 2%.
   Record kinetic/potential separately and mean late kinetic energy divided
   by initial potential energy. Dissipation does not waive criterion 4.
6. Independently recomputed final kernel density on interior particles at
   least one support radius from walls and the nominal free surface has
   mean absolute relative density error at most 3%. Require at least one
   such particle. Record count, extrema, and initial interior/boundary/free
   surface density separately; a deliberately overpacked initialization is
   not silently reclassified as a good hydrostatic test.

These are acceptance thresholds for this deliberately coarse experiment, not
guarantees of continuum convergence. If its wall initialization creates large
compression, classify that as a boundary/initialization failure and preserve
the trajectory; do not repair it by changing water mass or shifting wall
planes in the same receipt.

## Cost and next decision

Report fluid/boundary counts, support/radius/spacings, dt, simulated seconds,
initialization, actual stepping, observation and output costs separately;
query-including-sort, nested sort, pressure and divergence timings and
iteration counts; neighbor entries/comparisons; process RSS. Sorting time
is already inside the query time and must not be added twice. No new claim
about allocation-free stepping or world population follows from this run.

Only after reviewing this one result propose the corresponding 15 x 9 x 15
fluid sampling (2025 particles) and 30 x 36 x 30 boundary subdivisions (6122
samples), with the *same* 540 kg, 1 m footprint and 0.54 m water depth. The
radius is rederived from volume, not the physical geometry. A separate 0.0005 s
fixed step would limit temporal contamination. Require improvement in COM and
bulk-density errors or that both are already within a declared negligible
band; inspect actual cost before authorizing it. This is not permission to
run a refinement sweep now.

The following ledge fixture, if rest support is credible, retains a real
0.54 m vertical drop under sampling refinement. A closed basin rest result
does not qualify exposed waterfalls, film drainage, air entrainment or
arbitrary voxel collision geometry.

## Checked source anchors

Pinned SPlisHSPlasH `f3f677140761db7637b5443beb54f19f1f835ed4`:

- `FluidModel.cpp:243`: volume/mass initialization, including the stated
  intentional 0.8 reduction. `Simulation` owns radius/kernel selection.
- `TimeStep.cpp:113`: non-AVX density sums physical fluid volumes and Akinci
  boundary pseudo-volumes, then multiplies by rest density.
- `BoundaryModel_Akinci2012.cpp:50` and `Simulation.cpp:716`: boundary volume
  is inverse sampled kernel density, initialized over static boundaries.
- `DFSPH/TimeStepDFSPH.cpp:127`: full stable query before all pressure work;
  lines 252/390/544/629/1299: both solves, warm scaling, one-sided residual,
  free-surface neighbor handling and actual pressure acceleration.
- `DFSPH/TimeStepDFSPH.h:28`: 1e-5 pressure coefficient gate.
- `BoundaryModel.h:45`: static bodies do not accumulate reaction forces.

Source observations: low neighbor count suppresses divergence initialization
and reported residual, but the later update line is still outside that
condition. Iteration counts alone do not prove a final per-particle residual.
The solver's stored density is pre-advection, hence the separate final-density
observation. No static-wall force or final-density result is inferred from a
public method name alone.
