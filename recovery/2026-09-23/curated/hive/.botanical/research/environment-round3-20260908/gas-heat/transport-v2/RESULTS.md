# Scalar reconstruction decision

2026-09-08. **MC-limited MUSCL + SSPRK2 substantially improves scalar accuracy**
in the isolated ND candidate while preserving physical and restart laws. This
supports retaining it for the next numerical comparison. It is not a game
integration or a claim that coupled buoyant momentum became second order.

## Executed evidence

One guarded proof, no replacement run:

```
run-proof.sh node .botanical/research/environment-round3-20260908/gas-heat/transport-v2/qualify.mjs qualification-v1.json
```

Scope `run-u2792.scope`, invocation `be86b85abc194b6d889db40443f31854`, retained
session `4032`, observed terminal exit 0. All six groups passed in **1.663 s
wall / .872 s CPU**, with process RSS 103.3 MB. Exact source pins and every
numerical value are in `qualification-v1.json`. The earlier ND and boundary
sources/results remain unchanged.

## What changed

`transport.mjs` owns topology-derived neighbor/slope buffers, MC reconstruction,
the two Euler stages, stage admission, conservative paired face fluxes and
half-weighted receipts. Smoke and signed heat use the same path. The solver
deletes its old scalar buffers/body and delegates to that owner. Geometry,
pressure projection, momentum predictor and the accepted-step loop retain
their numerical method. Physical constants moved unchanged to a shared file.

Each scalar step holds the projected face velocity fixed. Smooth scalar
accuracy is second order where the limiter is inactive; limiting controls
oscillations at fronts and extrema. Overall coupled momentum remains first
order. The new canonical method version rejects a baseline-method save; exact
restart under the same method/domain is tested rather than silently changing
the meaning of saved state.

## Sharp-front accuracy and equal-error work

This reproduces the prior open straight duct's physical dimensions, scalar
slab, finite opening and flow. The error ceiling was fixed at **relative L1
<= .32** before running. Both methods use dtMax=.025 s and t=3 s; the direct
interval call takes 121 accepted steps including its final clipped remainder.
The prior boundary proof's shorter observation blocks took more remainder
steps; the baseline field error here matches that preserved evidence.

| Axial cells | Donor-cell L1 error | MC/SSPRK2 L1 error |
| ---: | ---: | ---: |
| 8 | 58.19% | 45.02% |
| 16 | 44.24% | 22.26% |
| 32 | 31.71% | 13.02% |

At 32 cells, the field error falls by about 59%. This is still a broadened
numerical front, not a resolved interface. At the declared error ceiling the
first qualifying tested baseline grid has 32 axial cells; the candidate needs
16 and also achieves a lower actual error. This is a **shared error ceiling**,
not interpolation to an exactly identical error value.

| Work at the <=.32 ceiling | Donor-cell, 32 cells | Candidate, 16 cells |
| --- | ---: | ---: |
| Actual field L1 | .317118 | .222618 |
| Measured total CPU | 83.8 ms | 43.6 ms |
| Measured wall time | 138.4 ms | 106.7 ms |
| Accepted steps / pressure calls | 121 | 121 |
| Pressure iterations | 0 | 0 |
| Scalar face evaluations | 31,460 | 31,944 |
| Scalar Euler stages | 121 | 242 |
| Persistent numerical workspace | 45,184 bytes | 61,632 bytes |

The measured CPU includes geometry construction, initial state, full stepping,
comparison and diagnostics. Both methods received a declared small warmup.
These are single-process observations with visible JIT/GC and scheduling
noise: for example, the baseline 8-cell CPU sample exceeded the 16-cell one.
**A stable twofold speedup is not established.** The stronger cost evidence is
the lower required grid resolution with approximately equal scalar face work.
The candidate uses about 36% more persistent numerical scratch at that ceiling.
These bytes exclude geometry records, canonical arrays, per-step result/receipt
allocation and JS runtime overhead; no heap-allocation or GC profile was run.

At equal 32-cell resolution, the candidate performs 62,920 scalar face
evaluations, twice the baseline, and uses 123,072 bytes total numerical scratch.
Its measured CPU was 81.8 ms versus baseline 83.8 ms, with slower wall time;
this noisy pair must not hide the real increase in stage work and memory.

## Independent accuracy checks

Smooth periodic cell-average advection uses an analytic translated sine wave
over a fixed physical domain. Signed temperature uses the same scalar path.

| Axial cells | Smoke RMS error | Temperature RMS error |
| ---: | ---: | ---: |
| 16 | .00339690 kg/m³ | .0849225 K |
| 32 | .000918578 kg/m³ | .0229645 K |
| 64 | .000269358 kg/m³ | .00673395 K |

Temporal accuracy is isolated with an independent exact eigenmode of the
declared centered diffusion operator, avoiding spatial-error contamination.
The eigenvalue is `-4D/h² sin²(kh/2) = -.2343145751 s⁻¹`.

| dt | RMS error against exact semidiscrete evolution |
| ---: | ---: |
| .1 s | 2.44141e-6 |
| .05 s | 6.05004e-7 |
| .025 s | 1.50587e-7 |

Halving dt approximately quarters the temporal error. This qualifies SSPRK2
for the fixed-velocity/diffusion scalar owner, not the coupled flow integrator.

## Physical, rejection and restart laws

- A cooling source passes the first Euler stage but violates the second-stage
  bound. The operation returns rejection with the caller's full state, clock
  and ledgers byte-unchanged. A separate excessive-rate call also rejects.
- Nearly empty tracer remains nonnegative. A field at **1 K absolute** remains
  positive in the accepted transfer. An absolute-zero restore is rejected.
  Signed negative anomaly is valid; it is not incorrectly clamped to zero.
- A real solid obstruction, projected flow, tracer addition and negative heat
  source conserve stock. Tracer ledger error was `6.94e-18 kg`; heat ledger
  error `9.31e-10 J`. Temperatures remained 94.0–312.3 K. This case exercised
  nonzero pressure work (912 iterations across the recorded source/restart
  sequence), unlike the uniform open benchmark.
- JSON save/reload with a rebuilt geometry and scalar/pressure caches gives an
  exactly identical continuation and receipts.
- A 293.15 K ambient inflow enters a warmer 313.15 K duct containing a 193.15 K
  wall-adjacent cold patch. Negative anomaly remains present; output stays
  within the initial/ambient temperature bounds. Signed heat and open-air
  ledgers close. This is the existing fixed ambient boundary, not a newly
  configurable external temperature model.
- The slab's open import/export remains the independent expected 1.62 m³.
  Maximum measured heat ledger error there was `6.37e-12 J`; tracer errors were
  zero or floating-point roundoff. The finest candidate tracer-export error
  was `2.08e-6 kg` against expected `.00054 kg`.

MC face positivity and the per-stage timestep bound are derived in
`CONTRACT.md`. Signed anomaly uses the constant absolute-enthalpy shift for
admissibility. Negative cooling and negative reference-energy contributions
from residual volume imbalance enter the stage's loss bound. No mass or heat
is fabricated by a post-transfer clamp. The existing caller owns interval
halving; the scalar module does not introduce a second simulation clock.

## Pins and remaining limits

- Geometry: `90d2d3e1e0714eab9327108b1cf048a2a0627c28e7e91c79faced9943d971b14`
- Solver/caller: `14ef3fa8aa65bc0ba58009a9bbdbfb47d345dbe5cdc1e7020bcaacf8f0b2db6b`
- Transport owner: `51faac0c0a9e1eae18f46e964f6ce4ecc598c4f67d59c7f81924c13e6e32dfae`
- Qualification: `e52c2308aed8a8bc740d2dae4e48efaca8e0e98a50d6b645f2466dc3dc40a8d8`

One-dimensional smooth/front references and a multidimensional obstacle test
do not establish a universal multidimensional maximum principle for arbitrary
fields, forcing or malformed borrowed geometry. No room exposure, contraction
pressure loss, combustion, terrain edit, water displacement or production
capacity is established. There was no long run or additional proof after this
first accepted checkpoint. Keep the candidate as the accuracy comparison for
the next bounded 3D pressure/opening case, with momentum order and per-stage
cost still visible.
