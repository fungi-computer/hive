# Measured attribution, unchanged finite buoyancy field

The single authorized diagnostic passed. It isolates a positive gravity/PE
compatibility defect which offsets about a quarter of the gross donor kinetic
dissipation in this particular field. No physical method was corrected.

Numerical run u3266.scope, invocation638bce135787466fa9bb1a35ef946e9e, exited0.
Retained session77477 reached terminal. One invocation, no failure or rerun,
under run-proof.sh and a30-second inner timeout. Actual qualification:2108
checks,512 cells,32 accepted SSPRK steps,64 Euler stages,96 projections and
zero retries. Wall1.80889283s,CPU2.032225s,final whole-process RSS191393792bytes.
This RSS includes the runner, saved baselines and diagnostic outputs; it is not
peak RSS, solver workspace or an estimate of playable world capacity. Timing
is this instrumented single fixture, not comparable to the prior whole suite.

## The independently derived accepted-step identity closes

All numbers below are accepted phase integrals, with Euler weights1/2+1/2 and
final projection weight1. The fixture remains the exact previous8³ box,1second,
dt1/32,epsilon.1,actual gravity,zero heat,periodic x/z and sealed free-slip y.

| Contribution | Joules |
| --- | ---: |
| Gross donor dissipation, −D | −0.09247089716084612 |
| Signed gravity/PE pairing defect, G | +0.02274420055181904 |
| Combined finite-time/split remainder | +0.00000160346049880 |
| Reconstructed net mechanical change | −0.06972509314852829 |
| Direct canonical K+PE change | −0.06972509314857689 |
| Absolute whole reconstruction discrepancy | 4.86e−14 |

The positive gravity defect is24.5961% of gross donor dissipation. The combined
finite-time/split remainder is only0.00230% of the observed net loss here.
That small aggregate is measured for this fixture; it is not a general guarantee
of small split error or a temporal/spatial convergence claim.

The gross donor term D is distinct from the actual finite advection receipt.
The forward Euler kinetic remainder is+0.001656846227234477J, giving actual
advection deltaK=−0.09081405093360653J. It belongs in the combined finite-step
remainder when comparing against the semidiscrete donor-loss law.

The signed gravity term is independently reconstructed both from old-velocity
gravity work plus actual PE transport and from the donor-density formula.
Integrated old-velocity gravity work=+1.315978143515869J, actual PE transport=
−1.29323394296405J. These correlated stage integrals could not be recovered
from only the previous whole-run summed impulses and final field. The prior
+0.0852921W endpoint discrepancy was an instantaneous rate, not this integral.

## Large split receipts must be read together

| Finite-step term included in the remainder | Joules |
| --- | ---: |
| Forward Euler kinetic convexity remainder | +0.001656846227234477 |
| Gravity cross/kick time remainder | +60.362030254317446 |
| Fixed-wall normal clamp | −7.544690243128574 |
| All weighted pressure projections | −52.780314742313664 |
| SSPRK Jensen averaging | −0.038680511641938434 |
| Their sum | +0.00000160346049880 |

Hydrostatic pressure and wall reactions remove most of the provisional gravity
kick. Calling the individual pressure or RK receipt physical heat/loss would
misattribute the mechanism. The current low-Mach enthalpy model deliberately
omits mechanical heating; this diagnostic does not add it or claim full-energy
physics. The separate signed discrete gravity defect remains material despite
the total negative energy change and the reduced-energy approximation.

## Residuals and original-output equality

Largest checked equality residual:1.1368683772161603e−13J (summing32 step changes
versus direct endpoint change). Important independent maxima:

- Donor face/linear pairing:3.82e−17J.
- Gravity/PE donor identity:1.46e−16J.
- Actual PE stock change versus transferred-mass PE:4.65e−14J.
- Finite body kick identity:1.22e−14J.
- Projection combined energy identity:1.20e−14J.
- Projection gradient/impulse work pairing:8.05e−17J.
- Pressure impulse metric discrepancy:1.04e−17kg·m/s.
- Pressure pinned-cell residual:7.46e−14m³/s.
- Largest actual residual pressure work:4.46e−15J.
- Largest step mechanical decomposition residual:6.14e−14J.

The entire pre-existing advance output equals the retained case JSON after
removing only the additional energyDiagnostics field. This includes all M/U/P,
canonical identity/time/steps, old receipt arrays/scalars, final-stage pressure
arrays and quality fields. Canonical save JSON also matches exactly. Prior
JSON did not retain a negative-zero sign, so this is complete saved-representation
equality, not an invented bitwise comparison to the lost old in-memory object.

Actual work matches the same scoped source:96 coefficient builds/solves,
6131 PCG iterations/matrix products,94208 primal face evaluations,294912 dual
interface evaluations. Initialization has512 tracked thermodynamic cell reads;
immediate post-advance132608; after the two meaningful physical-law reads133632,
exactly matching the old recorded scope. Workspace68096bytes is only the
existing projection typed-array workspace, not all solver allocations.

Source inventories were checked before/after. Original momentum and buoyancy
handoff inventories remain unchanged. Static syntax/Fallow findings and their
honest dispositions are retained in SOURCE-REVIEW.md; no source changed after
that check or after numerical acceptance. No broad suite or second Fallow was
run for writing this report.

## Decision enabled, not implementation delivered

The dominant net-loss attribution here is gross donor dissipation partially
hidden by signed gravity/PE gain. Merely decreasing dt will not remove the
semidiscrete incompatibility derived in the prior audit. The next physical
method needs a deliberate mass-flux/gravity/energy compatibility decision;
changing the physical dual mass to donor density or depositing a residual into
U is not authorized by these results. Root retains that decision. Connected
voxel rooms, moving gas volume, water coupling, oxygen/combustion and production
performance remain outside this diagnostic.
