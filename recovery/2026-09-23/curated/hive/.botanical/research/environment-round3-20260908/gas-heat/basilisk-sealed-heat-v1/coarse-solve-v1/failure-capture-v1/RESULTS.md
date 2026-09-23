# Cause found: finite-precision inverse application, not a stencil or guard defect

2026-09-09. The single observation-only reproduction captured the exact
first rejected system. Offline exact-rational and 80-digit checks identify
ordinary numerical solve error in the explicit inverse/application path.
The original acceptance threshold remains unchanged. No corrective
physical run or kernel correction was performed in this directory.

## Retained invocation and equality evidence

Compile u3478 / a71894aa7c124f659af20c0bd1ca3d26 exited 0 in 31.804 s,
with empty C diagnostics and unchanged upstream/source pins. The previously
approved isolated symbolic dimensional-check bypass remains disclosed.

Capture u3479 / aa059b02b0c44e65a895db7b3b6514b1 ended with the expected
native exit 3 / wrapper exit 1 in 0.166201 s elapsed, 0.132776 child CPU
seconds, peak child RSS 19,072 KiB. This is successful diagnostic capture
of a rejected physical solve, not a successful physical experiment.

All 25 preceding observation records equal the original failed candidate's
records exactly. The rejection occurs at native iteration 25, time
0.24735390459260645 s, attempted dt 0.014200869724667803 s. No additional
physical step is claimed. The exact hexadecimal capture is
`run-capture-v1/coarse-failure.json`, SHA
`e6780c930f052ec238c3e39b28947affd56e5548b6a74435b7efbb718ada5e67`.
The numerical window was released immediately; later work is offline.

## Exact rejected row

Temperature equation at coarse cell 6:

- Actual absolute original-stencil residual: 1.2975485960751813e-19.
- Unchanged backward-error bound: 9.766461020009931e-20.
- Ratio: 1.3285760250480803. Its pressure row passes at ratio 0.02250.
- Returned minimum scaled pivot: 0.02666750715823496, well above the
  existing inversion admissibility cutoff.

That small absolute error is not grounds to bypass the guard. The exact
rational original-stencil residual is 1.2971551229724887e-19, confirming
that the failure is real and is not caused by roundoff in the guard's
own evaluation.

## Independent offline decisions

Offline u3483 / 8fec84f0cec7486ca312baf1853361e1 exited 0 in 0.061806 s.
`analyze-v1.py` reads only the captured system. No numerical package or
system LAPACK was available; it uses ordinary independent partial-row-
pivot Gaussian elimination over Python's standard Fraction, Decimal
(80 digits), and binary64 arithmetic. This differs from the native
full-pivot Gauss–Jordan explicit inverse and its later dot product.
Exact Fraction solutions have exactly zero rational matrix residual.
Decimal and Fraction solutions agree to maximum relative error 6.49e-76.

Every captured assembled entry reproduces exactly from the stored
coefficients in binary64. Every captured original-stencil residual,
scale and bound also reproduces exactly. Independently reconstructing
the stencil as an exact-rational operator reveals only expected matrix
assembly rounding. At the failed row, that rounding contributes about
1.01e-22 to residual, roughly 0.08% of the observed 1.30e-19 error.
There is no missing lambda4 term, wrong face, boundary or acceptance
formula identified in this system.

| Offline treatment of the same captured system | Maximum original double guard ratio | Pass unchanged guard? |
|---|---:|---|
| Captured native inverse/application | 1.328576 | No |
| Same captured inverse, exact dot product rounded to binary64 | 0.541242 | Yes |
| Independent binary64 partial-pivot solve | 0.001687 | Yes |
| Exact-rational assembled-matrix solve, rounded to binary64 | 0.001626 | Yes |
| Exact-rational original-stencil solve, rounded to binary64 | 0.000947 | Yes |
| One ordinary double residual correction with the same inverse | 0.001184 | Yes |

The stored inverse's higher-precision `||A_scaled * inverse - I||_infinity`
is 9.3244e-14. Re-evaluating its dot product at exact precision removes
most of the failed row's error, while independent direct solves improve
further. Thus the rejected result comes from finite-precision explicit
inverse construction/application, with a material contribution from
ordinary dot-product summation. It is not evidence that the underlying
coarse linear equations are inconsistent.

All case values, per-row residuals/bounds, exact-stencil residuals,
solutions as hex and source/input pins are in OFFLINE-RESULT.json.

## Smallest standard correction recommended to root

Keep the same assembled operator, original-stencil residual, row scales,
native inverse, physical equations and thresholds. If a finite initial
solution fails the backward check, compute the signed residual
`r = rhs - L_original(x)`, divide it by the already used row scales,
apply the same inverse to obtain a correction, and form `x <- x + delta`.
Then run the same original-unit guard again before committing any coarse
correction. This is ordinary iterative refinement of one linear solve.

One such binary64 correction on the captured system reduces the worst
guard ratio to 0.001184 (failed row 6 falls to 0.000271). No altered
tolerance, new heat, atmospheric reset or high-precision runtime is
needed for this observed failure. The candidate should use a fixed
bounded correction count and still reject any remaining failure;
nonfinite coefficients or an invalid inverse are not reasons to retry.
Only this saved system has qualified that proposed correction. A further
physical run requires root's next decision; it has not happened here.

The prior candidate, raw failure, original baseline and all upstream
sources remain frozen. No full 2 s completion, ventilation, water coupling,
restart or gameplay adoption is claimed.
