# Limited conservative scalar transport comparison

2026-09-08. New isolated candidate over the frozen ND reference. Momentum,
projection, geometry and the existing accepted-step owner retain their method.
No room run, source migration, world edit, browser or production port.

## Scheme and authority

Smoke mass and signed thermal anomaly use one MUSCL finite-volume transport
owner: axiswise MC (monotonized-central) slopes, upwind face reconstruction,
paired conservative advection/diffusion fluxes and SSPRK2 time integration.
The projected velocity is fixed over the two scalar Euler stages. Their
half-weighted face/source receipts settle one canonical step and one clock.
The final state is the convex average of the starting state and the second
Euler successor. No limiter acts as a post hoc mass correction.

This is second order for the smooth fixed-velocity scalar problem. The coupled
momentum/predict/project method remains first order; no global second-order
claim follows. The candidate state carries a distinct method version, so a
baseline saved field cannot silently become a changed-method restart.

MC slope in each direction is `minmod(2 Δ-, (Δ-+Δ+)/2, 2 Δ+)`. For nonnegative
cell and neighboring concentrations, each reconstructed face lies in `[0,2c]`.
Thus one Euler stage is positive if

```
dt * (2 * outgoingVolumeRate + diffusionConductance) / cellVolume <= 1.
```

The implementation uses the stricter upper bound `.45` for both stages and
rejects the interval otherwise. SSPRK2 preserves positivity by convexity.
Closed/solid faces have no transfer. Missing wall/outflow neighbors suppress
the corresponding slope; inflow uses explicit ambient zero tracer and thermal
anomaly. Diffusion remains the same centered conservative face operator.

Temperature uses absolute enthalpy for admissibility:
`E = heatAnomaly + rho*Cp*Tref*cellVolume > 0`. A constant reference shift does
not change MC slopes. Reconstruction and the same positivity argument apply
to absolute enthalpy while receipts remain signed anomaly. Small nonzero
projected volume divergence and negative heat sources need an explicit
additional loss bound: their negative contributions divided by current E are
included in each stage's admissible rate. The caller's existing interval
halving handles a rejected scalar step; there is no new scheduler. Sources
that would violate absolute zero are rejected, never clamped or omitted.

All source validation, slope/cache construction, stage arrays, boundary
ledgers and receipt combination live behind this transport owner. Its cache
is geometry-derived and rebuilt after restart. Cell location/geometry and
pressure workspaces do not become scalar-owned canonical state.

## Bounded evidence

1. Smooth periodic translated smoke and signed heat, fixed physical domain:
   establish spatial/time accuracy separately from sharp-front conservation.
2. The exact prior finite open slab: 4×1.08×1 m, .5 m/s, t=3 s, initial x=[2,3),
   1.08 g tracer and 5 K slab. Compare frozen donor-cell and candidate at small
   axial resolutions. Predeclared equal-error target: relative field L1 <=.32.
   Report CPU, full-step count, pressure work, scalar face work and allocations
   separately. A faster run at a worse error is not a win.
3. Positivity including nearly depleted tracer, signed heat with valid positive
   Kelvin, explicit cooling rejection, sealed/solid/open receipts, obstacle
   references and exact JSON restart/cache rebuild.

One short initial proof (<30 seconds), with exact source pins and failures
preserved. No assumption that a TVD limiter label proves multidimensional
maximum-principle behavior: extrema, conservation and the stated rate are
checked. No production population or million-cell capacity claim.
