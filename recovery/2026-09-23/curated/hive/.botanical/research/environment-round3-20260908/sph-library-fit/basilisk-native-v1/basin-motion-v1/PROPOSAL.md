# One moving-water discriminator: a closed standing wave

Source-first proposal only. No new numerical source has been compiled or run.
The parent has accepted the short hydrostatic basin, not motion. This proposal
owns only this new basin-motion-v1 directory; all native/archive/build/rest and
failed particle-boundary evidence remains frozen. Root owns the independent
standing-wave oracle and must hand off its qualified bytes before consumption.

## Chosen physical question

Can the same maintained two-phase, momentum-conserving owner move a small real
water/air interface at the correct signed amplitude and period, while retaining
phase stocks and correctly transferring potential into kinetic energy?

Use the **same literal closed basin**: width L=1m, height H=1.08m, water and air
mean depths h_w=h_a=.54m, unit out-of-plane depth. rho_w=1000kg/m³,
rho_a=1.2kg/m³, g=9.81m/s². Start the water surface at

    y = h_w + a*cos(k*x),   a=.002m, k=pi/L,

with zero velocity in both phases. All walls are rigid and slip; water wets the
vertical walls, with zero interface slope there. No viscosity, surface tension,
reduced gravity, adaptation, imposed oscillatory forcing or analytic pressure
seed. Native pressure is a solved variable; its initial zero value is only a
guess. The fluid interface is a VOF fraction, not a moving solid mask.

Keep the fixed pair Delta=.02/.01m (50x54=2700 / 100x108=10800 active cells).
Both use a 1.28m root with N=64/128 and the already-qualified aligned masks.
Refinement changes numerical cell width, never the literal water depth, wall
positions, total physical mass or wave amplitude. These are not proposed game
simulation cell sizes.

## Independent physical target

For the two finite layers with rigid upper/lower walls, the linear relation is

    omega² = (rho_w-rho_a)*g*k /
             [rho_w*coth(k*h_w) + rho_a*coth(k*h_a)].

This follows from harmonic velocity potentials, equal interface normal velocity,
and pressure continuity at the displaced interface. Root's independent oracle
supplies the signed mode, both velocity/pressure fields, and perturbation energy;
this lane will not write a duplicate oracle. Scalar proposal values in FIXTURE.json
are omega=5.361495919223879/s, period T=1.171908997384657s,
phase speed omega/k=1.7066171558230112m/s, and
E0=(rho_w-rho_a)*g*L*a²/4=.009798228J per metre depth.

The expected interface is eta(x,t)=a*cos(k*x)*cos(omega*t). It changes sign;
absolute crest height would lose the phase information we need. Kinetic energy
is E0*sin²(omega*t_u), potential above flat is E0*cos²(omega*t_f), at their
respective field times. These are linear predictions, not an exact finite-
amplitude Navier–Stokes solution. Here ka=.00628319 and a/h=.00370370. Nonlinear
harmonics and initialization/mesh errors are distinct from numerical damping or
phase error; a passed tolerance does not remove that distinction.

Primary formula reference: Henry and Villari, *Flow underlying coupled surface
and internal waves* (2022), Remark 6/equation (43),
[author manuscript](https://cora.ucc.ie/bitstreams/8db8b778-ea58-4eab-99cd-91fc91d6ca5c/download).
Their general problem also has a free upper surface; only the explicitly stated
rigid-lid relation applies here. Our closed standing mode is the superposition
of the two opposite linear travelling modes, with kL=pi enforcing side walls.

## Why this instead of copying a moving test wholesale

The maintained [gravity.c](https://basilisk.fr/src/test/gravity.c) owns a useful
moving-interface reference, but uses reduced G, viscosity, different densities,
a different finite box and a Prosperetti reference table. Its measured maximum
folds negative standing amplitude. Its four prescribed uf-normal callbacks
belong to that formulation and will not return to our direct-gravity caller.
The table is not exact truth for this inviscid finite-layer basin.

[stokes-ns.c](https://basilisk.fr/src/test/stokes-ns.c) does exercise the same
conserving transport composition, but initializes a nonlinear travelling/breaking
wave with reduced gravity and viscosity. Its energy/profile machinery offers
caller ideas, not an independent answer for this small closed mode. The maintained
layered dispersion test has a different numerical owner and one-layer dispersion;
it is not a substitute for the full two-phase motion test. A shallow-water Ritter
front is inapplicable to this deep narrow tank and is not an oracle here.

## Fixed time and bounded refinement

Run exactly **one analytic period T** on each grid. The common cap is DT=T/1600
(.0007324431233654106s), retaining native CFL and timestep growth. This keeps
nominal temporal resolution fixed between meshes rather than claiming a pure
spatial rate after changing both dt and Delta. Record every actual dt; if either
case takes smaller CFL-limited intervals, disclose the resulting mixed change.
Cap at 2000 completed steps per case as an explicit incompletion guard.

The proposed numerical packet is two serial cases, coarse then fine, with a
**combined 28s native wall ceiling** (ordinary run-proof wrapper outside it).
There is no concurrent solver, browser, sweep or extra repeated timing run. This
budget is deliberately a hard limit, not a prediction: the accepted rest timing
suggests this small pair may fit, but moving pressure/advection cost is unmeasured.
On timeout preserve completed and partial rows and report incomplete qualification;
do not shorten the physical period, weaken thresholds or silently omit refinement.
Compile-only source review is separate and precedes any authorized packet.

## Measurements and preregistered limits

Raw f is always retained. Each fixed column gives height H_j=sum_y f*Delta and
eta_j=H_j-h_w. Exact cell-average cosine weights are
c_j=sinc(k*Delta/2)*cos(k*x_j). The signed coefficient is
A=sum_j eta_j*c_j / sum_j c_j²; the independent expected value is a*cos(omega*t_f).
Do not normalize by measured initial amplitude or fit a phase/time origin.

The full profile reference uses eta_exact,j=a*c_j*cos(omega*t_f). Report normalized
spatial L2 error sqrt(sum Delta*(eta_j-eta_exact,j)²/(L*a²)), higher-mode residue,
and a time-weighted RMS error of (A/a-cos(omega*t_f)). Use actual sample intervals,
not unweighted counts from changing dt. Zero crossings interpolate the signed A
between neighboring observations: first downward near T/4 and next upward near
3T/4 give measured period 2*(t_up-t_down). No crossing is an actual failure.

| Quantity | Coarse .02m | Fine .01m |
| --- | ---: | ---: |
| Initial signed amplitude error relative to requested a | <=.002 | <=.002 |
| Maximum normalized full-profile L2 error | <=.08 | <=.04 |
| Time-weighted normalized signed-mode RMS error | <=.05 | <=.025 |
| Relative period error from signed zero crossings | <=.02 | <=.01 |
| First zero-crossing phase error, as fraction of T | <=.01 | <=.005 |
| Late return amplitude error against oracle at actual final f time | <=.08 | <=.04 |
| Maximum relative reconstructed staggered energy error | <=.12 | <=.06 |

These are proposed engineering accuracy limits fixed before results, not rigorous
finite-amplitude error bounds. For refinement, require the fine signed-mode RMS
error <=.8 times coarse, **or both <=.01** where a reduction ratio is no longer
informative against the fixed linear/initialization approximation. A two-grid pair
can show improvement or an accuracy floor; it cannot establish a convergence order.

At every step require finite fields, native projection residual <=TOLERANCE/dt²,
iterations <100, both phase-volume drifts <=1e-10m³ per metre, and raw f bounds
[-1e-12,1+1e-12]. Keep TOLERANCE=1e-10. Measure projected physical wall-normal
face speed separately from moving interior faces; maximum wall-normal speed must
be <=1e-6m/s. Ordinary no-penetration u/native pressure remain the owners. Do not
reuse the rest test's zero all-face speed, stationary COM or instantaneous Mg-only
support assertions for moving water. They are not the same physical laws.

Energy is an observation, not a second evolved quantity. Reconstruct the actual
water-volume centroid with native PLIC helpers and subtract the flat-interface
cell moment before summation; do not estimate tiny perturbation energy by
subtracting two rounded large whole-tank totals or by using f*y at a cell centre.
K uses the actual shared velocity and rho(f). Compare the staggered K+PE against
E0*[sin²(omega*t_u)+cos²(omega*t_f)], with K and PE separately reported. This is
not a claim of simultaneous exact Hamiltonian conservation. Retain and bound
roundoff-fraction contributions explicitly; an observer must not clamp canonical
f or repair invalid geometry.

## What passing would establish

A bounded real moving-interface/phase/energy check of the already-built native
VOF owner, including its wall conditions and consistent momentum transport.
Still unqualified: a .54m ledge/dry front, 3D solid corners, edit/displacement work,
exact restart, arbitrary external-clock control, finite-gas/heat coupling,
large-world performance, browser/WASM integration and production licensing.
