# First aligned-basin packet failed; preserved without rerun

Actual `u3233 / c52403f8727049ebb13bb472bb75b19d`, runner/native exit1. It
completed one numerical timestep, then stopped at the original failed physical
controls. No timeout, nonfinite values, parser errors or stderr output.

The initial geometry and stock controls passed:2,700 full cells, actual cell
width.02m, basin area1.0799999999999463m², literal bottom/top coordinates,
bottom/top lengths1.0000000000000004m, f range[0,1], and both phase volumes
.5400000000000058m³ per metre depth. These stayed unchanged in the first step;
water COM stayed.2699999999999972m.

| After the one completed step | Actual | Original criterion |
| --- | ---: | ---: |
| Simulated dt | .00009090909090909s | ≤.001s |
| Maximum cell speed | .000891824836717474m/s | ≤.000001m/s |
| Maximum face speed | .0008918248390938593m/s | ≤.000001m/s |
| Gauge-adjusted pressure error | 3876.539780100062Pa | ≤.01Pa |
| Bottom-minus-top pressure support | 10509.296137357798N/m | 5303.75688N/m, relative error≤1e-5 |
| Projection residual | .010484121073991068 | ≤.012100000000000003 |
| Projection iterations |21, with5 relaxations | <100 |

The pressure solve met its configured residual, but the physical solution did
not pass. The velocity is approximately g*dt and support is near twice the
expected value; these are clues for the next source/caller audit, not an
established library defect. The pressure gauge itself is arbitrary; the quoted
pressure error removed the best mean gauge, and wall support subtracts the top
traction to remove that gauge as well.

Captured process wall time.116026s; native reported wall including observer
.0659391s, projection.0264062s, VOF.0271475s; child peak RSS16,512KiB. These are
one first-step measurements, not sustained performance. The upstream performance
footer says0 steps because the failure returned from the first step before its
outer iteration counter increment; the observer records the one actual completed
solver step. The .1s interval was not reached.

The runner field oneHonestTerminal is false because its success condition also
requires a completed interval. A single parsed terminal does exist and honestly
reports exit1/completedInterval:false. This is not a missing-terminal incident.

All raw rows, stdout/stderr, exact source/binary pins and derived extrema are
retained in result-v1 and RESULT-HANDOFF.json. No thresholds, masses, walls or
solver inputs were changed; no second run. Physical cause remains under the
separate bounded source audit. No 3D, motion, restart or production qualification.
