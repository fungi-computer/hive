# Water / groundwater: expert decision pass

2026-09-08. Astra/Ultra architecture fork for Game CTO. Ignored research only; no runtime, dependency, Git, server or deployment change. Read current sprint, environmental/living-world/world-generation contracts and retained permaculture, Millison, historical-water and ONI studies. Actual callers inspected: `src/ticker.js` uses 50 ms steps; `src/world.js` has a 15×15 two-storey clearing; `src/model.ts` has wood/mugwort lots; World Lab terrain explicitly has no simulation. Actor navigation and blueprint blocking are not hydraulic topology.

## Decision

Prototype **conservative surface storage with local-inertial face discharge**, then test soil exchange separately. Its first playable target is a finite upstream supply, a diggable diversion, a pond/terrace and competing downstream use. Do not select this approximation for every future water behavior. Full shallow-water momentum must compete before enabling rapid breaches, fast narrow channels or hydraulic jumps.

| Candidate | What it represents | Decision |
|---|---|---|
| Diffusive storage graph; Manning flow from current head difference | Friction/gravity balance; backwater and storage, no momentum history | Keep an implicit version as comparator. Reject fixed-step explicit exchange with stock limits as sufficient. |
| Local-inertial shallow water | Free surface, gravity acceleration, friction and persistent discharge; omits advective acceleration | Best next bounded experiment for slow diversion/ponds; explicitly restricted applicability. |
| Well-balanced finite-volume full SWE | Conserved depth and horizontal momentum, including advection; hydrostatic depth approximation | Required candidate when flow speed/direction around structures matters; still not 3D Navier–Stokes, splashing or pressure pipes. |

The primary [de Almeida/Bates study](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/wrcr.20366) supports local-inertial use especially at low subcritical Froude number, and documents increasing errors with velocity/depth gradients. Its equation 7 supplies the staggered-discharge scheme; θ adds numerical diffusion. [USACE guidance](https://www.hec.usace.army.mil/confluence/rasdocs/r2dum/6.0/running-a-model-with-2d-flow-areas/shallow-water-or-diffusion-wave-equations) identifies dynamic floods, contractions, gates and regime transitions as cases requiring fuller momentum. These are applicability evidence, not Hive benchmark results.

## Authoritative quantities and topology

Use SI internally: seconds, metres, m² area, m³ liquid volume, m³/s discharge; gravity 9.81 m/s². Establish metre-to-world-coordinate conversion explicitly. Store Float64 volume `V` per wettable patch, and signed discharge-per-width `q` (m²/s) per canonical horizontal face. Geometry owns bed/sill elevation, wetted width, length, material/roughness and versioned storage curve `V(eta)`; derive surface elevation `eta`, depth and velocity. First fixture uses rectangular `V=A max(0,eta-z)`. Quantities are finite; a river identity is not an infinite refill instruction.

A patch identifies a physical support surface and connected open volume. Ground and a bridge deck can have separate water at the same horizontal coordinate. Horizontal faces require actual fluid openings; solid walls remove them, gate operations change aperture/sill. A vertical hole connects distinct patches through an explicit drop/spill connector, not actor stair adjacency. Initially use an instantaneous, accounted free-overfall transfer `Q=Cw b sqrt(g) H^(3/2)` only into an unsubmerged, atmosphere-connected receiver; `Cw` is dimensionless and configured. Submergence, falling transit/impact and backpressure need another connector proof. Never claim waterfall trajectory from this equation.

Open surfaces have no artificial one-cell volume ceiling. Cisterns have physical capacity and an overflow face; a sealed full space needs gas displacement/pressure handling before admission. Future shared geometry must report **void volume minus actual liquid occupancy** to the gas owner, with a geometry revision and conservative displacement transaction. Cutaway never changes it.

## Flux and limiting contract

For face i→j, `hf=max(0,max(eta_i,eta_j)-max(z_i,z_j,sill))`, and `s=(eta_j-eta_i)/ell`. Proposed local-inertial discharge:

```text
qbar = theta*q_old + (1-theta)*(q_previousFace+q_nextFace)/2
q_star = (qbar - g*hf*dt*s) /
         (1 + g*dt*n²*|q_vector_old|/hf^(7/3))
dV_star = width*q_star*dt
```

`n` has units s/m^(1/3). Collinear-neighbor averaging and transverse velocity reconstruction must honor closed apertures; do not average across a wall. Start θ=0.7 as a measured damping parameter. A dry face yields zero flux but retains any subthreshold cell water. Exact level equilibrium with zero discharge produces zero flow over unequal beds.

All surface outflow, infiltration, evaporation and withdrawal proposals share one old-state budget. Sum requested outgoing volume per donor; scale to available volume. Then sum donor-scaled incoming volume per receiver; scale to its old free capacity. Apply each final edge once with equal/opposite deltas; persist its **accepted** discharge. This conservative rule leaves some throughput unused when a receiver also empties. Do not secretly compensate in another pass. Constituent transport uses accepted water and old donor concentrations with its own nonnegative species budget; no independent contaminant flow deletes solvent.

This prevents overdraft, not instability or accurate momentum. Canonical numeric face IDs/reduction order remove input-order dependence. Float64 conservation has a stated tolerance, not exact integer conservation; do not round cells independently or erase dry residues. Validate supported-engine replay before promising cross-engine bit identity.

Subdivide each 50 ms tick into deterministic power-of-two steps satisfying a conservative starting `dt <= 0.35*ell_min/sqrt(g*h_max)`; nonlinear/dry-front checks remain necessary. Recompute after edits and forcing. Never enlarge dt to fit a frame budget or skip authoritative time; report inability to finish the region frontier. Atmospheric rain/source changes are ordered at known ticks. Low discharge alone cannot justify sleep while unequal heads, forcing, infiltration or downstream coupling remain.

## Soil and groundwater: separate next model

Compare a Green–Ampt wetting-front/bucket model with layered mixed-form Richards flow. Green–Ampt is attractive for rainfall pulses and has named conductivity, suction and moisture-deficit parameters, but a lone cumulative-infiltration counter cannot establish cyclic drying, capillary return or a rising water table. [EPA's models](https://www.epa.gov/water-research/infiltration-models) explicitly distinguish supply limits, layering and drying assumptions. Recommend **fixed porous control volumes with retention and Darcy faces** for the next groundwater falsification, because pond↔aquifer reversal is an actual requested behavior. Start one vertical column and two neighboring shallow columns, not a continental solve.

Each disjoint porous cell owns reference-density water stock `W` (m³), bulk volume `B`, residual/saturated contents `theta_r/theta_s`, conductivity tensor and retention parameters. Derive water content `theta=W/B` and pressure head `psi` from a checked monotone retention law; derive total hydraulic head `H=z+psi`. A possible van Genuchten curve is `theta=theta_r+(theta_s-theta_r)[1+(alpha*|psi|)^n]^(-m)` for psi<0, with `m=1-1/n`; the retention/conductivity equations are checked against [USGS REF1, equations 6–8](https://pubs.usgs.gov/tm/2006/tm6a18/pdf/TM6A18.pdf). Saturated storage uses `W/B=theta_s+Ss*psi`, where specific storage `Ss` has units 1/m. This represents small water/skeleton compressibility, not extra pore space; actual occupied pore volume saturates separately. Bounds/units/parameters must be validated.

Darcy-face flow is `Q=K_face*A_face*(H_i-H_j)/ell`; resistance-weighted conductivity reflects both sides. Candidate unsaturated closure: `Se=(theta-theta_r)/(theta_s-theta_r)` and `K=Ks*sqrt(Se)*[1-(1-Se^(1/m))^m]^2`; `K=Ks` when saturated. Require `n>1`, `alpha>0`, `Ss>0`, `0<=theta_r<theta_s<1`; soil availability excludes retained `theta_r*B`. The surface interface uses surface head, a wet/dry supply constraint and receiving pore state. Exfiltration reverses the same edge. Root uptake debits soil, recharge crosses into lower porous cells, and wells debit those cells. **No extra aquifer stock overlaps their pore water.** A displayed water table is derived. A coarse unconfined aquifer reservoir `delta W=Sy*A*delta H` is an alternative representation needing a conservative conversion, not an additional owner. [USGS UZF theory](https://pubs.usgs.gov/tm/2006/tm6a19/section3.html) distinguishes moisture, conductivity and specific yield; its gravity approximation is not full capillary transport.

Use an implicit mixed mass balance for the stiff porous system, finite iteration/residual limits and timestep rejection; accepted Darcy fluxes must reproduce stored deltas and boundary totals. Positivity/capacity constraints belong inside that solve, not a post-solve clamp. [USGS's Richards implementation](https://pubs.usgs.gov/tm/2006/tm6a18/) demonstrates why ponding, seepage, evaporation, roots and adaptive timesteps are explicit boundaries. First porous experiments assume vented pore air and fixed temperature; trapped air and gas dissolution require the sibling gas/heat interface. This subsurface design is unimplemented and uncalibrated; no groundwater claim follows from the surface experiment.

## Edits, custody and persistence

Digging changes geometry while preserving water, then flow responds. Filling/removing wet geometry preflights displacement into connected capacity or rejects; it cannot delete water. Persist soil water in excavated material or explicitly drain it during that transaction. New geometry does not regenerate original water. Changed-face momentum gets an explicit remap/dissipation rule. Save volumes, discharge, porous stocks, parameters/version, topology revision, forcing cursor and committed tick together; load paused. Claims reserve availability, never add stock. Pour/fill/brew operations transfer between environment and actual vessel custody atomically with operation IDs; current integer wood/herb lots do not yet establish liquid custody.

Rain, upstream supply, evaporation, downstream discharge and consumer transformations have named accounts/receipts. Cross-chunk faces execute once at a shared simulation frontier. Camera eviction cannot wall off, drain or refill them.

## Evidence and next falsifications

The guarded [experiment](water/numerics.mjs) completed in owned `run-u1682.scope`, exit 0, on Node v24.20.0, linux x64, at 05:32:55Z. [Results](water/results.json): two 1 m² cells, 1.75 m³ total, 50 ms steps for 100 simulated seconds. Explicit Manning diffusion amplifies a 2 µm level perturbation to 2 m oscillation with **zero mass error** and 1,999 reversals. Local inertia with θ=0.7 remains bounded and settles near machine precision; unequal-bed lake-at-rest is unchanged. Digging retains 1.75 m³ and draws 0.125 m³ into the lowered cell. Shared donor/capacity allocation is order invariant. Save/restore including discharge matches; resetting discharge changes continuation by 5.30e-6 m³. This rejects one explicit method/configuration, not diffusion generally. Its ~87 ms total execution is no production capacity measurement.

Next experiments, before integration:

1. 32² wet/dry basin, island and closed levee; halve cell size/dt. Compare local inertia with implicit diffusion and well-balanced SWE on a finite gated diversion. Check arrival time, steady levels, Froude distribution, orientation bias and limiter frequency; do not tune away high-Froude errors.
2. Rain→soil→lower storage plus well drawdown, then raise groundwater to reverse seepage. Check zero-forcing conservation, uptake/evaporation accounts, nonlinear residuals and refinement convergence.
3. Edit/split/reload across an active border and pause mid-transfer. Match uninterrupted balances and trace; inject capacity exhaustion and rejected solve.

Measure cells, faces, wet-front growth, substeps, solver iterations, bytes and p95 tick time separately. Local inertia costs O(E) per substep; porous implicit work O(kE) with convergence-dependent k. Halving horizontal resolution roughly quadruples cells and doubles CFL steps: approximately eightfold work before layers. Tiny cut cells, deep pools, wet/dry fronts, broad rain activation and near-saturation stiffness are the main risks. No planet/grid-size promise is established.
