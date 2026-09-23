# Observation-only first rejected coarse system

Root authorized one capture reproduction, then offline diagnosis. All
writes are isolated here. The prior failed candidate and evidence remain
unchanged. The exact source delta is capture.patch plus the pure capture.h
observer; the physical caller, thermal overlay and stock observer are
byte-identical to the failed candidate.

At the existing dense operation, copy the original matrix/RHS, row scales,
scaled matrix/RHS, returned inverse, pivot and solution. These copies do
not change arithmetic, reduction order, source settings or acceptance.
Only when the unchanged original-unit guard first rejects, write those
copies, all restricted coefficients, native iteration/time/dt and all
row residual/scale/bound evaluations to coarse-failure.json. Exact binary64
values use hexadecimal strings. The actual first guard's values are
included separately to verify the observer's repeated evaluation.

The original rejection still exits the native process; no stock repair,
continued step or new accepted world state. Same 100 J / 2 s fixture,
native tolerance and 512-epsilon backward bound, 25 s caller / 30 s outer
caps. Only one numerical reproduction is allowed. Preserve any different
failure rather than iterating until a desired capture appears.

Compile uses the already approved isolated qcc dimensional-check bypass;
normal C diagnostics remain enabled and generated copy/caller placement
is reviewed before execution. No upstream/qcc changes. This pass is not
another physical acceptance run.

Offline: parse captured hex to exact binary64 quantities, compare matrix
assembly with independently reconstructed original stencils, evaluate
original-unit residuals at higher precision and solve the captured system
independently. No numerical Python packages or system LAPACK/BLAS were
available in either installed Python interpreter. Use Python's standard
Decimal and Fraction arithmetic with ordinary partial-pivot elimination
for this one 16-by-16 system; this is an offline linear algebra diagnosis,
not another physical solver. Cross-check high-precision and exact-rational
results and test the existing inverse's effect on a residual correction.
No larger simulation or changed physics is implied.
