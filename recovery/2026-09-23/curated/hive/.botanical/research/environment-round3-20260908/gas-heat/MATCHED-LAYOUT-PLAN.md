# Matched new-fixture layout check — predeclared

2026-09-08. This extends the accepted 180-second source-local checkpoint with
exactly three serial runs, each capped at 25 seconds wall time inside the
ordinary owned proof guard. No 900-second, spatial-refinement, browser or 3D
sweep is authorized by this plan. Preserve a failure and stop this enlargement.

## Numerical pin

Kernel: `solver.mjs`, SHA-256
`67ce0968afe17328774d911a7f282e51ee5b77b1f4ba4fc4bde22f4f7272edea`.
Current fixture: `house.mjs`, SHA-256
`0ee297eca48522b87b465ecca83ce1982981dc52a301a5e0fa5cd114a9f89654`.
The retained local run used fixture SHA-256
`81f7ca196a5970d902242b929f4d93311aa8c23a6b4ff88fe9eb3f7c8717e4a1`.
The only difference must be `maxTheta` → `peakThetaK:maxTheta` in the result
object. Reconstruct that one token-label change and check the historical hash
before running. This leaves all geometry, numerics, forcing, intervals and
observations byte-identical. Record both hashes in `matched-source-pin.json`.

## Exact cases

All cases use dx=0.5 m, depth=2 m, dt ceiling=0.05 s and observation interval
0.05 s; duration=180 s. The house, source, stair and breathing volumes remain
the same physical dimensions. Air viscosity=1.5e-5 m²/s, thermal diffusivity
2.2e-5 m²/s, tracer diffusivity=1e-5 m²/s, rho=1.2 kg/m³, cp=1005 J/(kg·K),
Tref=293.15 K. Indoor temperature starts 5 K above ambient. A 120-second
prescribed pulse emits 1.2 g tracer and 120 kJ. The pulse ends and selected
openings open exactly at120 s. Full-depth inlet/outlet area is2 m² each.

1. **sealed180**, exterior2 m: no house openings.
2. **high180**, exterior2 m: lower-left inlet and upper-right outlet.
3. **local180-exterior4**, exterior4 m: source-local outlet, doubled resolved
   ambient extent around the unchanged house.

Compare with retained **local180**, exterior2 m. Do not reuse the old0.5 m²
aperture/51.8% outcome as this comparison's baseline.

## Invariants and screening limits

Every completed case must have finite state and outputs, nonnegative tracer
(numerical tolerance1e-14 kg), tracer ledger error <1e-10 kg, signed heat ledger
error <1e-5 J, max divergence <1e-8 m³/s, and max scalar Courant ≤0.45. Require
the temperature anomaly/reference ratio ≤0.05 as this reference's conservative
Boussinesq screening bound. This bound is not a validation of 3D turbulence or
real fire. No temperature or inventory is clamped to meet it. A violated limit,
solver failure or25 s budget stops this enlargement; it does not authorize
finer grids, coefficient changes or another unbounded run.

The earlier80% export/25% upstairs-exposure reduction targets apply to the
900-second authored experiment, still incomplete. Report the180-second values
without declaring that900-second criterion passed or lowering its observation
window after seeing results.

## Exposure uncertainty and exterior extent

Compare cumulative upstairs and downstairs exposure over the same physical
1×1×2 m breathing regions. Report local/high fractional differences from the
new sealed180 baseline. No timestep or spatial convergence is established by
these runs, so a small advantage is unresolved even when ledgers close.

For doubled exterior extent, predeclare a5% relative bound on **upstairs
exposure** using the larger-extent result as denominator. A larger change means
this reference's source-capture outcome is sensitive to its exterior boundary;
stop and report it before expanding a sweep. Also report final indoor tracer
inventory for the same house volume. Far-boundary exported fraction is retained
but its measurement boundary physically moves when exterior doubles; a change
in export timing alone is not proof of different indoor ventilation. Observe
the local exposure difference across extents as one uncertainty indicator, not
a substitute for missing temporal/spatial convergence or a statistical interval.
