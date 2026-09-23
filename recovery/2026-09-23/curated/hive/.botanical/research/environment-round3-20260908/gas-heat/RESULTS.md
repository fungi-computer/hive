# Gas/heat round 3: executable momentum/projection checkpoint

2026-09-08. This is a new isolated numerical reference, not production game gas,
an equal-geometry comparison to round 2, or a completed environmental system.

## What now exists

`solver.mjs` implements a low-speed, two-dimensional staggered-grid momentum
predictor, a cached sparse linear pressure-projection operator, and conservative
tracer/heat transport. Canonical state includes velocity on uniquely identified
faces, cell tracer mass, signed thermal anomaly, clock and source/boundary
ledgers. A full canonical geometry descriptor binds dimensions, SI units,
coefficients, cells and faces to a saved state; a matching revision number alone
cannot admit a different room. Shape, finite-value and ledger checks guard the
ordinary `advance` boundary. Cached arrays/operators are rebuilt from geometry,
not saved as an alternative physical state.

The source uses explicit molecular-scale viscosity/diffusivity constants and
first-order donor-cell transport. Numerical diffusion remains important. A new
language, finer grid or the word “Navier–Stokes” would not establish physical
accuracy. This checkpoint is JavaScript/Node using existing tools; no Rust/WASM,
framework, package installation or game integration has occurred.

## Independent qualification

`qualification-v2.json` records twelve groups, all passed in 0.519 s internal
wall time. Its exact source is preserved as `solver-v2.mjs` SHA-256
`fee97e6f6b0b5e2e4bea8910347479f526a046e4b42f785c3b63efe190c50c06`.

- Ambient rest stays exactly still. Uniformly warm closed hydrostatic rest has
  maximum velocity 9.52e-12 m/s. A known discrete pressure gradient is removed to
  6.31e-12 m/s. Random-field projection reduces the uniform closed-grid velocity
  norm and is idempotent to the declared solve tolerance.
- An analytic **Taylor–Green vortex** exercises nonlinear two-dimensional
  advection and pressure, not only viscosity. At 8/16/32 cells, velocity RMS
  error is .03716/.02061/.01072 m/s; pressure RMS error .02477/.00706/.00214 Pa.
  These are observed refinement results for the short analytic fixture, not
  an assertion of second-order momentum transport. Donor-cell advection is
  first order.
- Periodic viscous shear and wall-bounded no-slip shear converge. For the latter,
  8→16 cells reduces RMS error .000968→.000229 m/s.
- A thin closed intermediate floor transfers exactly zero tracer and zero heat
  between compartments; opposing tangential motions use wall ghosts rather
  than diffusing through the barrier.
- A known translated passive field converges with 8/16/32 cells. Mass error is
  ≤1.11e-16 kg; signed heat remains bounded and conserved.
- Full state and integrated face receipts continue identically after JSON
  save/reload and cache reconstruction. Erasing saved velocity measurably changes
  the next result, so it cannot be discarded as a cosmetic cache.
- Ten malformed states/inputs are rejected, including same-revision different
  walls, length units or viscosity, short/NaN velocity, infinite interval/source,
  NaN timestep/acceleration and a forged tracer ledger.
- A warm tall pressure opening resolves simultaneous inlet/outlet flow with
  carrier mismatch 8.57e-12 m³/s. That check covers the declared 2D boundary.

## One new two-storey checkpoint

`house-local180-v1.json` retains the sole authorized 180-second room run. It uses
a 4×6×2 m house, one-metre stair aperture, 1×1×2 m source/breathing regions,
initial indoor warmth 5 K, and resolved exterior regions two metres wide above
and beside the house. A prescribed 120-second source emits 1.2 g tracer and
120 kJ. Source cutoff and opening occur at 120 s. The low inlet and source-local
high outlet are **one metre tall and full two-metre extrusion depth: 2 m² each**.
That is four times the old model's 0.5 m² ports. These results cannot be used as
a speed/accuracy comparison to the retained round-2 51.8% exposure finding.

At 0.5 m cells (256 total), 180 simulated seconds took **3.658 s wall time** and
3.087 s user CPU on this shared host. There were 3,601 accepted substeps,
245,636 PCG iterations, no rejected steps and exactly two operator builds
(initially sealed and the opening event). Process RSS was about 102 MB; this
includes Node, JIT, fixture/output arrays and canonical descriptor. It is not a
kernel-only memory budget or browser throughput measurement.

- 86.40% of emitted tracer crossed the **far exterior** boundary by 180 s;
  80% was reached at 163.85 s. Smoke still resident in exterior cells is retained,
  not prematurely counted as exported at the house wall.
- Tracer balance error: 2.69e-17 kg. Signed heat balance error: 4.85e-9 J.
  Maximum cell-volume divergence: 1.15e-11 m³/s.
- Peak temperature anomaly/reference ratio: .03644, about 10.68 K. Heat was
  not clamped. Small temperature ratio is necessary for this approximation;
  it does not validate unresolved turbulence or 3D entrainment.
- Final maximum speed is .542 m/s. There is no sealed/remote-high comparison,
  no 900-second completed observation and no spatial/timestep/ambient-extent
  refinement for this house. The original 25% upstairs-exposure improvement
  requirement remains unresolved. Early 80% export does not complete that test.

**Reporting erratum:** the retained JSON's `result.maxTheta` is final maximum
anomaly, 5.36567 K; a later totals spread overwrote the separately accumulated
peak. Its `maxBoussinesqRatio` correctly retains the peak ratio. `house.mjs` now
names that accumulated value `peakThetaK` to avoid collision. This report-only
correction was not rerun and does not change any solver result.

## Event and source pins

The room run used solver SHA-256
`67ce0968afe17328774d911a7f282e51ee5b77b1f4ba4fc4bde22f4f7272edea`
and fixture SHA-256
`81f7ca196a5970d902242b929f4d93311aa8c23a6b4ff88fe9eb3f7c8717e4a1`.
After v2 qualification, a source read found an arbitrary 1e-10 second minimum
substep could reject a floating-point remainder at a forcing boundary. The
owner now requires representable forward progress and splits at the exact
event, without ignoring a remaining interval below 1e-12. `event-check-v1.json`
proves an interval spanning 120 s by ±5e-12 advances exactly and applies source
only to the pre-event duration. It used two steps and had exactly zero source
integral error. That correction and geometry-input hardening are the only
solver changes after the v2 pin. Earlier evidence remains intact.

Opening newly exposed faces with zero initial normal velocity is a declared
fixture assumption; existing face IDs retain history. It is not an energy law
for arbitrary edits, nor permission to displace gas when water floods a cell.

## What remains before acceptance

The next bounded comparison must use these **same new aperture dimensions** for
sealed/local/remote layouts, then qualify timestep and spatial error at fixed
physical breathing regions, plus doubled exterior extent. Any equal-method
comparison against the old Darcy code must first give it the same aperture
geometry; simply juxtaposing the old number is invalid. Retain the 80% export /
25% exposure-reduction thresholds and 5% timestep /15% spatial bounds. A failed
criterion remains failed rather than triggering an unbounded finer sweep.

Separately required: a published buoyant-flow benchmark, an actual matched 3D
reference for source capture/narrow openings, and clear validity limits before
quantitative gameplay exposure claims. Oxygen reactions, combustion, radiation,
compressible sealed gas, water displacement, evaporation/condensation and phase
energy remain explicitly unsupported. No production or population capacity
claim follows from this checkpoint.
