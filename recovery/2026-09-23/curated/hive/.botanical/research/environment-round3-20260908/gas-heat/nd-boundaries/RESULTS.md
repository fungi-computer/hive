# 3D wall and open-transport qualification

2026-09-08. Bounded numerical evidence over the unchanged shared ND solver;
not a production release or a 3D room-plume validation.

The viscous rectangular duct converged to an independent continuum solution.
The finite open straight duct accounted correctly for external volume, tracer
and heat. The open scalar test also exposes substantial first-order smearing;
conservation alone does not make a smoke front accurate.

## Runs and correction

- Initial `run-u2751.scope`, invocation `3248f49284014ceabeae9bad48e937f5`,
  exited 1 in the reference check before running a solver case. The 127-mode
  initial-condition cancellation residual was `1.283e-6 m/s` near a corner,
  above the declared `1e-6` criterion. Exact source and result remain in
  `v1-failed/`; `qualification-v1.json` also remains untouched.
- Reference-only diagnostic `run-u2752.scope`, invocation
  `fce500b520194d9483318640fbb0a1ff`, exited 0. Increasing the initial-condition
  series cutoff to 255 reduced that residual to `1.072e-7`, and 511 to
  `1.716e-8`. The continuum PDE and wall checks were already sound.
- Replacement `run-u2755.scope`, invocation
  `b7e9d1c152234a4198df7fd1972a4994`, retained session `8870`, observed terminal
  exit 0. **All three groups passed in 1.283 s wall / .842 s CPU**. Process RSS
  was 89.4 MB. No solver bytes, physical case or criterion changed. Only the
  initial-reference refinement check gained cutoff 255. The t=2 reference
  remains the same.

The ordinary run-proof guard wrapped each numerical command. There was no
room sweep, browser run, topology edit, new toolchain or game source change.

## Independent reference qualification

The derivation and primary background reference are in `CONTRACT.md`.
`reference.mjs` uses continuum sine/hyperbolic series, not the gas stencil.
The constant-forcing Fourier coefficient and each mode's startup ODE provide
the algebraic PDE/initial proof. Finite truncation is measured explicitly:

| Initial transient cutoff | Maximum initial residual at declared points |
| ---: | ---: |
| 15 | 2.817e-4 m/s |
| 31 | 9.153e-5 m/s |
| 63 | 5.438e-6 m/s |
| 127 | 1.283e-6 m/s |
| 255 | 1.072e-7 m/s |

At t=2, changing the steady cutoff 255→511 and transient cutoff 63→127 changed
none of the sampled floating-point values. Maximum sampled wall residual was
`5.86e-9 m/s`; modal ODE residual `1.73e-17 m/s²`; independent central-difference
continuum PDE residual `-5.49e-9 m/s²`. These sampled checks accompany the
algebra; they are not a universal bound over all coordinates.

## Actual solid-wall rectangular duct

The fluid domain remains 2 m × 2.16 m × 2 m. Two x cells are periodic; a ring
of real solid cells defines no-slip y/z interfaces. The solid ring thickness
changes with refinement, while its inner physical fluid boundaries stay fixed.
Uniform axial acceleration `.1 m/s²`, viscosity `.1 m²/s`, rest initial state,
t=2 s and dtMax=.005 s are common to every case. The expected flow is the
analytic startup solution, including corner behavior and transient decay.

| Fluid cross-section | Fluid cells | Axial RMS error | Relative RMS error | Wall time |
| --- | ---: | ---: | ---: | ---: |
| 4 × 4 | 32 | .0138722 m/s | 12.71% | .162 s |
| 8 × 8 | 128 | .00451425 m/s | 4.19% | .358 s |
| 12 × 12 | 288 | .00211315 m/s | 1.96% | .445 s |

Each case exercised eight axial face rows adjacent to solid corners. No face
crossed solid; transverse speed and cell flux imbalance stayed exactly zero;
unforced scalar stock stayed zero. Maximum combined momentum Courant was
`.10137`, within `.45`. Every case had 410 accepted steps, including small
steps at the proof's exact .1-second observation boundaries, and no rejection.

The 410 projection calls needed **zero linear iterations**: this is the exact
fully developed unidirectional symmetry of the case, with body acceleration
representing the constant driving gradient. These timings therefore cannot
estimate a room's pressure-solve cost. The earlier 3D ABC and random-projection
qualification owns nonzero pressure-iteration evidence.

## Finite open straight duct

This is an explicitly inviscid straight channel with impermeable side walls,
not a viscous entrance layer or an aperture contraction. The fixed fluid domain
is 4 m × 1.08 m × 1 m. Its actual finite x-/x+ openings each have area 1.08 m².
Uniform axial speed `.5 m/s` remains an exact continuum solution. A tracer and
heat slab initially at x=[2,3) moves 1.5 m over three seconds; exactly half
should leave the outlet. Incoming ambient air has zero tracer/thermal anomaly.

Every resolution imported and exported `1.6200000000000048 m³`, against the
independent expectation 1.62 m³. Speed error and cell flux imbalance were zero.
No scalar occupied solid cells and no face crossed a closed wall.

| Axial cells | Expected tracer export | Measured tracer export | Export error | Relative L1 field error |
| ---: | ---: | ---: | ---: | ---: |
| 8 | .00054 kg | .000503498 kg | 3.650e-5 kg | 58.19% |
| 16 | .00054 kg | .000520111 kg | 1.989e-5 kg | 44.24% |
| 32 | .00054 kg | .000531506 kg | 8.494e-6 kg | 31.71% |

The finest export error is 1.57% of expected export, but the field still has a
broad diffused front. Relative L1 error is normalized by initial tracer stock,
not by remaining stock. Heat export errors decrease identically, from 220.1 J
to 119.9 J to 51.22 J against expected 3256.2 J. Maximum ledger residual across
these cases was `8.67e-19 kg` for tracer and `4.55e-12 J` for heat.

The three cases together took `.274 s`; each advanced 139 steps, including
clipped observation boundaries, with zero pressure iterations. A single cached
operator was built per geometry. The complete result records exact work,
metrics, source hashes and material values in `qualification-v2.json`.

## Source and limits

- Frozen geometry: `90d2d3e1e0714eab9327108b1cf048a2a0627c28e7e91c79faced9943d971b14`
- Frozen solver: `49114c0ea61680ee36608c4b16283556f83fa003f163819b99eea6fed0fc120d`
- Reference: `e2ea94bad8f5ae143e52f2e486aa457d7054bd78abd15b33eac74b2dd01f8e36`
- Accepted qualification source: `b7ed501a68e99326580e047f76c518b4ebecd463e4a0e8f599e545c4aa10d5eb`

No shared ND source correction was necessary. No result establishes
contraction pressure loss, turbulent mixing, cave/room ventilation, combustion,
wall heat exchange, water displacement or restoration after geometry edits.
The strongest new evidence is actual 3D no-slip wall/corner convergence and
explicit open-boundary transport with an independent expected answer.

Before using local plume concentration as a gameplay quantity, the scalar
transport needs an accuracy decision: the current first-order scheme is
conservative and monotone but materially smears sharp fronts. A bounded
higher-resolution or limited higher-order comparison can quantify the tradeoff.
A finite-width contraction needs a separate physical reference and pressure
qualification; this straight channel must not be renamed to imply that result.
