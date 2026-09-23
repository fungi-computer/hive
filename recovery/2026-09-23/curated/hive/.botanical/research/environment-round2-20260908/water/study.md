# Water and groundwater: second Astra pass

2026-09-08. **Reject the original fixed-θ=0.7 implementation as the next integration candidate.** Removing its fixed smoothing substantially improves convergence, but that correction still fails one preregistered orientation criterion. Keep full shallow water in the next comparison: this bounded implementation does not show a prohibitive cost. No production solver is selected.

Read current environmental/openings and sprint contracts, all four round-one studies/disposition, and actual two-cell source/results. Work is isolated in this ignored directory; no game writer, art, Git, build, server, backend or release changed. The system identifies this agent as GPT-6; additional runtime model/effort metadata was not exposed, so it is not asserted.

## What was tested

[Preregistered thresholds](PREDECLARED.md) preceded numerical runs. A 32² grid covers 64×64 m with 2 m square cells: **115.2 m³ finite reservoir → 4 m reach → lateral gate/diversion → depression pond around an island**, alongside a downstream user demanding 0.06 m³/s. The gate opens at 60 s; excavation lowers the wet pond bed 0.1 m at 180 s. Outer boundaries are impermeable; observe 600 s. An open gate represents a horizontal connection, not a submerged sluice law. Geometry is unchanged physically at 1 m refinement.

The local-inertial (LI) method stores cell volume and staggered discharge. Its gravity/friction update follows [de Almeida/Bates, equations 7–11](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1002/wrcr.20366), with solver-owned donor competition. The independent full-SWE comparator stores volume and both horizontal momenta, using authored first-order Rusanov fluxes and [Audusse hydrostatic reconstruction](https://www.math.univ-paris13.fr/~audusse/articles/hydro.pdf). This is an implemented reference candidate, not a downloaded validated package.

Both keep an uneven-bed, partly dry lake at rest for 120 s: maximum history drift approximately 7×10⁻¹⁶. The SWE comparator qualifies against the [exact frictionless dry dam-break profile](https://depts.washington.edu/clawpack/clawpack-4.3/applications/shallow/1d/dambreakdry/www/) before boundary interaction: integrated normalized depth error **4.32% → 3.03%** at 0.5 → 0.25 m, below the declared 8% bound. Original LI gives **11.15% → 13.70%**, failing and worsening. Qualification is deliberately narrow; [documented hydrostatic-reconstruction limitations](https://arxiv.org/abs/1206.4986) at steep shallow beds remain relevant.

## Decisive numerical result

Same physical fixture, 600 s, 32²:

| Solver/configuration | dt ceiling (s) | Pond (m³) | Collected (m³) | Downstream 1 cm arrival (s) |
|---|---:|---:|---:|---:|
| LI θ=.7 | .1 | 59.335 | 33.814 | 38.400 |
| LI θ=.7 | .05 | 48.776 | 33.564 | 43.500 |
| LI θ=.7 | .025 | 33.603 | 33.171 | 51.875 |
| LI θ=1 | .05 | 73.457 | 27.752 | 30.200 |
| LI θ=1 | .025 | 73.456 | 27.753 | 30.175 |
| SWE | .05 | 70.648 | 31.589 | 32.500 |
| SWE | .025 | 70.657 | 31.603 | 32.400 |

Original LI fails the 5% timestep and 15% spatial pond tolerances. In its smoothing term, fixed θ gives an effective artificial diffusion proportional to `(1−θ) dx²/(2 dt)`; reducing dt adds stronger damping at unchanged resolution. This deduction explains the observed direction and is not a threshold adjustment.

The θ=1 correction removes that term. Its dt differences are below 0.006% for both inventories; spatial differences are 0.36% pond/1.18% collection. At the finest tested dt, it differs from SWE by **3.96% pond, 12.18% collection**, passing the declared 15% bulk comparison. SWE itself changes 0.09% pond/4.00% collection at 2→1 m, and arrival by 2.65 s, passing the declared spatial bounds.

Complete 90° mapped volume/discharge/momentum errors are below 5×10⁻¹⁶ for the original methods. Radial 1 cm wet-front axis/diagonal bias decreases **9.04→7.37%** for original LI and **3.43→2.15%** for SWE. Corrected θ=1 gives **3.43→4.58%**: magnitude stays below 10%, but the declared requirement that refinement reduce bias **fails**. These radii use cell-center threshold samples; that discretization and rasterized initial circle are part of the remaining uncertainty. The correction earns another study, not acceptance by selective passing checks.

## Finite supply and gameplay consequence

At 600 s, original LI leaves reservoir/pond/other-liquid/collected volumes **10.917/59.335/11.134/33.814 m³**. SWE gives **6.956/70.629/6.053/31.561 m³**. Both sum to the original 115.2 m³; no external refill exists. Source depletion exceeds 90%, but this does not mean all water has left the domain. Main refined-run balance errors remain below 1.1×10⁻¹⁰ m³, comfortably within the relative 10⁻¹⁰ criterion.

Original LI collection equals its closed-gate comparator; SWE loses 7.52%. **Both fail the original 10% downstream-consequence threshold.** This partly diagnoses the fixture: capped demand can remain satisfied while the pond captures otherwise unused stock. An explicitly separate [1200 s observation](OBSERVATION-ADDENDUM.md) locates the first post-arrival ten-second interval delivering under 99% demand at **620–630 s LI / 520–530 s SWE**. At 1200 s, diverted/closed collections are **40.791/69.814 m³ LI** and **36.130/70.127 m³ SWE**. Closed controls remain demand-satisfied after arrival. The failed 600 s exit is retained.

Corrected θ=1 independently passes the original behavioral comparison: **18.88% less collection** and 73.460 m³ pond; excavation adds 4.595 m³ against its undug control. In original LI/SWE, excavation changes every cell volume by exactly zero at admission, then adds 2.574/4.195 m³ pond storage by 600 s. Gate leakage before opening is zero; island cells remain dry.

## Ownership and limits

A first run exposed a −4×10⁻²⁸ m rounding residue feeding a negative donor factor. Its exact source/results remain retained. The correction rejects negative input stock and leaves an explicit eight-machine-epsilon reserve in exhausted donors; later minimum depths are zero. This is internal LI numerics. **Shared accounting validates an admissible successor and paired integrated exchanges; it never clips all solvers generically.** SWE rejects an invalid outflow budget. LI withdrawals share the old donor budget; SWE applies a later positive source operator, a splitting difference covered by dt refinement.

Complete supported-Node reload matches exactly. Discarding LI discharge changes continuation by **0.011331 m³ maximum cell volume**; SWE discharge reports are disposable but its momenta are canonical. The coupling sibling independently exercised this exported solver under partitions/restarts and a wet edit. No solver copy was needed. Lowered beds, friction and momentum resets have unaccounted mechanical work/heat: quantity conservation here is **not total coupled energy conservation**.

Neither LI variant earns rapid breaches, jets or hydraulic jumps. Its characteristic speeds omit advective velocity: at Fr=.5, downstream wave-speed error is 33%; at Fr>1 it still has an upstream characteristic while full SWE has two downstream ones. Actual transient diagnostics contain high-Froude fronts; LI face and SWE cell samples are not identical velocity measurements. Pressure pipes, falling-water trajectory, gas displacement, thermal closure and calibrated gate contractions remain outside this experiment.

The [porous counterexample](groundwater-results.json) uses two disjoint porous inventories and van Genuchten retention/conductivity, following [USGS documentation](https://water.usgs.gov/nrp/gwsoftware/sour/special/unsat/unsat.htm). Two valid distributions have identical **0.679385 m³** porous total and identical pond, yet require **+4.025×10⁻⁶ versus −6×10⁻⁵ m³/s** surface exchange. A total-only bucket cannot determine reversed seepage. This is a state-discrimination proof, not integrated/calibrated Richards infiltration or well drawdown. Compressible reference-density stock is not extra pore geometry; no aquifer stock duplicates soil water.

## Cost and next consumer

Single-process 32²/600 s observations: corrected LI **5.16 s**, SWE **6.89 s**, each 12.672 million face evaluations. Both harness variants retain 41,472 field bytes and allocate 183,808 scratch typed bytes/step; unused union arrays and repeated validation are disclosed. Process peaks were approximately **109/114 MiB**, including Node, object geometry, garbage collection and serialization. These unoptimized shared-host observations justify keeping SWE competitive, not phone, population or planetary claims.

Next real game consumer remains **finite vessel water → one plant establishment** after brewing, earning liquid custody without a regional solver. A later playable diversion should compare corrected LI with SWE on a demand-limited fixture, refine front/obstacle geometry, and close mechanical/thermal coupling only when needed. [Results](results.json), [API](API.md), [terminal evidence](terminal-evidence.md), source snapshots and every failed criterion are retained. All owned numerical sessions completed; no game integration is launched.
