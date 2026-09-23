# Standing-wave discriminator: failed coarse accuracy; fine interval incomplete

The one frozen native packet **does not qualify moving water**. The coarse grid
completed the fixed period and passed phase-stock, wall, pressure-residual and
fundamental period/amplitude controls, but failed the declared full-profile and
energy limits. The fine grid exhausted the shared wall-time allowance after
0.382111 seconds, so neither a fine full-period result nor full refinement is
qualified. No solver, physical input, threshold or timestep was changed afterward.

## Exact execution and preserved evidence

- `run-u3296.scope`, invocation `b57ab3133a7a4b3a83c045c60b0e1971`, terminal exit 1.
- Frozen command: `run-proof.sh python3 run-wave.py`; combined native ceiling 28 s.
- Raw records: `result-v1/native-result.json` and each case's stdout/stderr/capture.
- Original comparison: `result-v1/comparison.json`; overall `passed:false` is correct.
- Honest scope correction: `result-v1/qualification-summary.json` records moving and
  refinement qualification as false. Original numerical captures are unchanged.
- Native source, binary and independent oracle are pinned in `source-pins.json`,
  `COMPILE-HANDOFF.json` and the native receipt. Binary SHA256:
  `b51fc305dcf1047c2fb49120d9ee8e373b956ae64f129a059027f3f1f9a4885b`.

The fixed physical problem remains a 1 m by 1.08 m closed basin, 2D/unit depth,
0.54 m water under 0.54 m incompressible air, densities 1000/1.2 kg/m³ and a 2 mm
fundamental standing displacement. The separately checked linear reference has
period 1.171908997384657 s and initial perturbation energy E0 = 0.009798228 J/m.
Finite-amplitude and native nominal-stage limitations remain explicit.

## Physical observations

| Quantity | Coarse, 0.02 m, full recorded period | Fine, 0.01 m, partial only |
|---|---:|---:|
| Active cells | 2700 | 10800 |
| Recorded steps | 1611 | 532 |
| Velocity time, seconds | 1.1719089974 | 0.3821113656 |
| Last nominal fraction time, seconds | 1.1715430115 | 0.3817453797 |
| Signed fundamental time RMS / requested amplitude | 0.011718 | 0.00023548 |
| Measured period error | 0.00541995 | no period |
| Last completed-return amplitude error | 0.0136657 | no return |
| Maximum full-profile L2 / requested amplitude | **0.131596**, limit 0.08 | 0.0362611, partial limit 0.04 |
| Maximum higher-mode residue L2 | 0.131309 | 0.0362607 |
| Maximum staggered energy error / E0 | **1.155161**, limit 0.12 | 0.0390930, partial limit 0.06 |
| Maximum kinetic-energy error / E0 | 1.167101 | 0.0384414 |
| Maximum PLIC potential-energy error / E0 | 0.0530539 | 0.00291546 |
| Maximum water-volume drift, m³/m | 1.765e-11 | 5.525e-12 |
| Maximum wall-normal speed, m/s | 1.735e-17 | 2.689e-17 |
| Maximum cell speed, m/s | 0.396501 | 0.204212 |

All captured native controls passed: finite values, original fraction roundoff
bounds, exact cell/column geometry, phase stock tolerance, clock/VOF invocation
checks and pressure convergence. Pressure residual acceptance does not establish
physical accuracy. There were no stderr or record-decoding errors. The fine stop
is a resource ceiling, not a recorded native state/physics rejection.

First energy threshold crossing was step 186 at nominal fraction time
0.1284831177 s (velocity time 0.1288491037 s): 0.120023409 E0. First profile
threshold crossing was step 714 at 0.5149642573 s: 0.0800227023 of requested a.
The fine capture does not reach the latter event.

## What the existing-row audit resolves

`row-audit-v1/AUDIT.md` and `audit.json` contain the independently labeled column
height potential-energy diagnostic, fundamental/higher-mode split and exact
matching partial-time comparison. This arithmetic-only audit ran as
`run-u3322.scope` / `146f3dcf6f154f4595f87ce9e88940bb`, exit 0; it did not execute
the native solver or alter a captured value.

At the largest energy error, recorded kinetic energy is 1.815478 E0; its excess
over the expected kinetic value is 1.167101 E0. PLIC potential energy contributes
only -0.0119402 E0 error. Replacing PLIC **only as an independent diagnostic** by
the column-height graph estimate changes total error by 0.000391076 E0. The large
velocity-field excess therefore survives this different geometric measurement.
The largest interface error is dominated by higher-mode shape, not fundamental
phase. Existing rows do not locate the excess by phase/cell or identify which
native update generated it; no unmeasured causality claim is made.

Over the exact 533 shared recorded times through 0.3817453797 s, maximum energy
error falls from 0.163185 to 0.0390930 E0 and profile error from 0.0686177 to
0.0362611 when spacing halves. This is useful partial-interval evidence. It does
not validate the unobserved fine late-time evolution or a convergence order.

## Cost and reporting correction

Coarse capture took 13.2461 s. Its native terminal reports 13.2150 s including
observation, with 11.0205 s projection, 1.56504 s VOF and 0.264818 s observation.
Those component times are nested; do not add them to total. Fine consumed the
remaining allowance, capture wall 14.3909 s, without a terminal summary. Outer
native capture wall was 28.1926 s including termination/capture/I/O; native-child
batch peak RSS was 57,868 KiB, before the separate comparator. These are single
shared-host measurements, not production throughput or whole-world suitability.

The original comparator incorrectly labels `refinement.passed:true` by comparing
full coarse RMS against partial fine RMS; fine `returnedAmplitude:true` also only
measures its last partial row. These booleans are explicitly invalid as those
claims. `reporting-v2/reporting-only.patch` is a separate, unapplied source
correction: require matching completed intervals for refinement, require completion
for returned amplitude, and label partial metrics. It changes no numbers or limits.

The earlier corrected short 2D rest result remains valid for its own fixture.
No moving-water acceptance, ledge/3D/edit/restart/production qualification or
user-facing hosted demonstration of these particular Basilisk bytes is claimed.
