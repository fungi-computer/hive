# Shared two- and three-dimensional MAC qualification

2026-09-08. This is an isolated numerical candidate, not shipped gameplay.

The same geometry, projection, momentum, transport and stepping owners now run
two-dimensional references and genuine three-dimensional cells. World y is
vertical. The voxel metric `[1, .54, 1]` gives cell volume `.54 m³` and x/y/z
face areas `.54 / 1 / .54 m²`. The canonical descriptor binds domain, global
origin, active axes, metric, geometry, coefficients and face identities.

## Evidence

One guarded command, no replacement run:

```
run-proof.sh node .botanical/research/environment-round3-20260908/gas-heat/nd/qualify.mjs qualification-v1.json
```

Scope `run-u2735.scope`, invocation `ad29e37cbc0442ad8753b3c94883254b`, terminal
exit 0. The script measured **0.877 seconds** total wall time. Six qualification
groups passed. `qualification-v1.json` records every assertion and numerical
result, source pins, elapsed time and process RSS. There was no browser, room or
900-second simulation run.

| Qualification | Actual result |
| --- | --- |
| Shared 2D consumer versus the preserved binding checkpoint | Velocity, heat, tracer and air receipts matched exactly for the source/hydrostatic case. |
| Three-dimensional metric/global identity | Correct volumes, areas, negative-origin centers and unique face IDs. Mutating constructor inputs did not alter the built geometry. Unsafe global face extents were rejected. |
| Ambient and warm hydrostatic rest | Ambient remained exactly still. Warm maximum speed `6.27e-12 m/s`; maximum cell flux imbalance `8.58e-12 m³/s`. |
| Gradient/random projection | Gradient residual `3.34e-12 m/s`; metric-weighted squared velocity decreased from `3.08177` to `2.25890`; repeated projection changed no value in that test. |
| Fully three-dimensional ABC momentum and pressure | Both velocity and pressure error decreased at every refinement; results below. |
| Three-axis scalar transport and reload | Tracer conservation error `1.42e-13 kg`; heat error `4.09e-12 J`; all three face-family integrated volume receipts had correct units. Exact JSON reload/rebuilt cache matched. Different domain, origin or vertical spacing rejected the saved state. |

The ABC/Beltrami case has all three velocity components and cross-axis
dependence. It is an independently declared analytic solution, not a copied
result from the solver. For dimensionless periodic coordinates on the physical
cube `[0, 2π]³`,

```
u = A exp(-νt) [sin(z)+cos(y), sin(x)+cos(z), sin(y)+cos(x)]
p = -ρ |u|² / 2 + arbitrary spatial constant
```

The identities `curl(u)=u` and `laplacian(u)=-u` give
`(u·grad)u=grad(|u|²/2)`. The qualification also checks this convective/pressure
identity analytically at a point. It uses amplitude `.3`, viscosity `.02`,
interval `.04` and step `.002`. The physical domain remains unchanged during
refinement; rectangular cell counts exercise unequal directional spacings.

| Grid | Cells | Velocity RMS error at t=.04 | Pressure RMS error from the first projection | Pressure iterations, 21 solves |
| --- | ---: | ---: | ---: | ---: |
| 4 × 6 × 4 | 96 | .00156180 m/s | .0524733 Pa | 481 |
| 8 × 12 × 8 | 768 | .000980786 m/s | .0225954 Pa | 924 |
| 12 × 18 × 12 | 2592 | .000681722 m/s | .0144188 Pa | 1323 |

The three ABC cases together took `.614 s`, including geometry construction,
analytic comparisons and all stepping. Each geometry built one operator.
The largest reported scratch workspace was `435456 bytes`; this is only the
typed numerical workspace, not total geometry, state, receipts or JS overhead.
The complete six-group process reported `175788032 bytes` RSS. Neither number
is a production capacity estimate. The first-order advection remains visibly
diffusive; convergence here does not establish high-order accuracy.

## Exact source pin

- `geometry.mjs`: `90d2d3e1e0714eab9327108b1cf048a2a0627c28e7e91c79faced9943d971b14`
- `solver.mjs`: `49114c0ea61680ee36608c4b16283556f83fa003f163819b99eea6fed0fc120d`
- `qualify.mjs`: `e2ed293cf08638dcd9e6b9f67b888af423dcc51c3a0008ec2b3414e1f80cc8a8`

The sibling `nd-checkpoint/` retains these exact sources, this report and the
result. Its inventory records the historical 2D oracle dependency. Existing
square, metric, binding and house evidence remains unchanged.

## Boundaries still unresolved

- Closed/no-slip, explicit open-pressure and periodic boundary semantics are
  implemented. The present numerical checks exercise sealed and periodic
  dynamics; they do not qualify three-dimensional window/cave ventilation,
  solid-corner accuracy or real narrow throats. The prior 2D room results stay
  separate and cannot be advertised as 3D measurements.
- This is low-speed incompressible Boussinesq flow with passive smoke and
  thermal anomaly. It does not model compressibility, combustion, oxygen
  consumption, radiative heat, solid conduction or condensation.
- A geometry edit rejects old state. It does not create gas, displace water,
  transfer quantities or account for mechanical work from edits. Global domain
  origin describes physical coordinates but is not an automatic world sampler.
- Constructor inputs are copied. The outer returned object and metric records
  are frozen, but nested cell/face records, stencils and typed arrays are
  borrowed research geometry. Callers must not mutate them. This is not a
  tamper-proof public module boundary; `Object.freeze` does not deeply freeze
  those values. Projection outputs are also borrowed scratch, while accepted
  state/receipts own copies.
- Global cell/face integer extents are checked. Float physical coordinates at
  extremely large origins still have ordinary IEEE-754 precision limits.
- Only the declared bounded cases were measured. No claim of million-cell
  throughput, world capacity, browser memory budget or need for WASM follows.

The useful next qualification is a small 3D domain with an actual finite-width
opening and solid obstruction, independently checking no flux through closed
faces, explicit external mass/heat receipts and a pressure-driven known-flow
reference. A room plume should follow that boundary test, with a fixed physical
domain and its own refinement and Boussinesq checks. No such run is included here.
