# Existing-row audit of the failed standing-wave packet

This is an arithmetic and source audit of frozen `../result-v1` only. No native
solver or oracle was rerun. `audit-rows.py` produced `audit.json` in 0.27 s including
wrapper startup, under `run-u3322.scope`, invocation
`146f3dcf6f154f4595f87ce9e88940bb`, exit 0. The script records its exact input hashes.

## Source ownership and an independent geometry diagnostic

`../wave-observation.h:48` accumulates column water heights from canonical raw f;
`:57` computes K = sum(0.5 * rho(f) * |u|² * Delta²) from the actual centered
velocity and maintained bounded mixture-density definition. That K accumulation
does not use PLIC centroid, a fitted wave, a supplied pressure or oracle values.
`:60` onward independently reconstructs each partial-cell volume centroid and
`:84` accumulates PLIC water first moment relative to exact flat-water moment.
`:82` bounds out-of-range f roundoff separately; no canonical f is clamped here.

The extra diagnostic assumes a single water-under-height graph in each column:

```
eta[j] = recordedWaterColumnHeight[j] - 0.54
PE_graph = (rho_water-rho_air) * g * Delta * sum(0.54*eta + eta²/2)
eta = fittedSignedFundamental * cellAverageCosine + residual
PE_graph = PE_fundamental + PE_residual + PE_cross + PE_mass_offset
```

The script checks that last algebraic decomposition to 1e-12 J/m. This column
graph estimate discards subcolumn slope and cannot represent disconnected water
parcels. It is explicitly **not a replacement** for PLIC or an exact reconstruction
of the recorded fluid. The comparison is still informative: disagreement stays
at most 0.00134878 E0 over all coarse rows and 0.000100905 E0 over the recorded
fine interval. It is much smaller than the failed energy criterion.

## Peaks and first failures

| Diagnostic | Peak energy, step 1049 | Peak profile, step 1402 |
|---|---:|---:|
| Nominal f time, s | 0.7601748288 | 1.0185608937 |
| Recorded signed fundamental / a | -0.575572988 | 0.692911805 |
| Expected signed fundamental / a | -0.594557128 | 0.680629183 |
| Signed-mode error / a | 0.01898414 | 0.01228262 |
| Full-profile normalized L2 | 0.07197565 | 0.13159571 |
| Higher-mode residue normalized L2 | 0.07071319 | 0.13130889 |
| Actual K / E0 | 1.81547753 | 1.11475421 |
| Expected K / E0 at velocity time | 0.64837680 | 0.53478671 |
| PLIC PE / E0 | 0.34155799 | 0.51571091 |
| Column graph PE / E0 | 0.34116691 | 0.51444965 |
| Column fundamental PE / E0 | 0.33117529 | 0.47996883 |
| Column higher-mode PE / E0 | 0.01000071 | 0.03448405 |
| PLIC minus column graph / E0 | 0.00039108 | 0.00126126 |
| Staggered energy error / E0 | 1.15516054 | 0.63242232 |
| Column-based staggered error / E0 | 1.15476946 | 0.63116107 |
| Projection iterations | 19 | 16 |
| Pressure residual / declared target | 0.823744 | 0.866352 |

Both peak steps use approximately 0.000731971855 s. There are zero reported
invalid moments. Cross-term energy is roundoff; mass-offset energy is respectively
-9.088e-6 and -3.234e-6 E0, so neither explains the excess.

First energy failure: step 186, f time 0.1284831177 s, velocity time 0.1288491037 s;
18 projection iterations, residual ratio 0.764553, projection wall 0.004877 s.
Its error is 0.120023409 E0, of which K contributes 0.119091192 E0. The column
graph gives 0.119728099 E0, so this first marginal crossing depends slightly on
geometric measurement; the much larger later failure does not.

First profile failure: step 714, f time 0.5149642573 s; 12 projection iterations,
residual ratio 0.853715, projection wall 0.003742 s. Signed-mode error is only
-0.000179906 a while higher-mode L2 is 0.080022601 a. This is extra resolved
column-profile shape, rather than a large fundamental phase/amplitude error.

## What time and source evidence can exclude

The generated event chain was inspected before execution in
`../COMPILE-CHECKPOINT.md`. The observer is after native projection,
`centered_gradient` and centered `correction(dt)`; passive observation does not
advance time or inject state. Native `navier-stokes/conserving.h:36` disables
the centered velocity advection owner; its `vof` owner advances f and both phase
momentum components together, recovers u from total momentum/rho(f), and suppresses
the ordinary second VOF call. Captured invocation counts and actual intervals agree.

`../../basilisk/src/navier-stokes/centered.h:236` explicitly assumes f is staggered
half a step behind u before VOF. The fixed caller records nominal f time, velocity
time, previous dt and cumulative VOF transport separately (`../wave.c:139`).
The initialized f is a physical t=0 surface; cumulative transport equals velocity
time, not a proof of an exact variable-step f clock. Startup/stagger limitations
are retained, and K plus PLIC PE remains a staggered diagnostic.

For the qualified *linear reference*, changing one quadratic phase-energy time
by a half native step changes it by at most 0.00196224 E0 (one full step 0.00392447).
This bound is on the reference only; it does not bound unrecorded time interpolation
of a rapidly varying actual velocity field. More decisively, recorded peak K is
1.81548 E0 while the reference K is at most E0 at **any** phase. A phase shift of
that reference cannot remove the kinetic excess. Column graph PE independently
preserves the large discrepancy, and f-roundoff bounds are at most 9.221e-14 E0.

Thus the data establishes extra energy in the actual recorded centered velocity
field plus higher-mode interface shape. It does not establish whether the culprit
is force discretization, startup, transport, pressure/velocity coupling or another
source interaction. No per-phase K, cell locations or substep energy terms were
recorded. It would be unsupported to assign the excess to air, a particular wall,
or a particular native update, or to claim that every high-frequency mode is
nonphysical from a finite-amplitude linear comparison alone.

## Exact common-time partial comparison

All 533 common step numbers also match nominal f times within 1e-12 s. The common
interval ends at 0.3817453797 s. Its maxima, without claiming full refinement:

| Same recorded interval | Coarse | Fine |
|---|---:|---:|
| Profile L2 | 0.06861769 | 0.03626106 |
| Higher-mode residue L2 | 0.06846825 | 0.03626072 |
| Staggered energy error / E0 | 0.16318497 | 0.03909303 |
| K error / E0 | 0.16209464 | 0.03844137 |
| PLIC minus column graph / E0 | 0.00034868 | 0.00010091 |

At the **same first coarse energy-failure step 186**, fine error is 0.027475925 E0
versus coarse 0.120023409; profile is 0.018472395 versus 0.044064457. At common step
310, fine's partial energy peak is 0.039093028 versus coarse 0.158003864. These
matching-time observations support improvement in that early interval only. They
do not reach the coarse peak profile/energy times or establish a fine late return.

The frozen comparator's full-refinement true flag is invalid. A separate
`../reporting-v2/reporting-only.patch` fixes reporting eligibility only; it has not
been applied or executed. No physical rerun, fine completion or parameter change
was made during this audit.
