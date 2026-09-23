# Fixed algebra qualification and conditional physical packet

Source pinned before compiling/executing. No simulation is advanced by
`algebra.c`: it uses native fields, restriction, boundaries and level-1
iterators with the actual helper and native matrix inverse.

Three fixed restricted-coefficient fixtures use coefficient multiplier
0, 1 or 2 in `setup()`. Each checks all 16 basis vectors and two constant
modes against the direct original native face-gradient expression.
Basis comparison: absolute error <=256*DBL_EPSILON times the sum of
original stencil term magnitudes and matrix-column magnitude. Zero scale
requires exact zero error.

Each fixture then solves two independently formed RHS vectors, one from
a signed nonconstant known field and one from constant T=.001 / p=.5.
Maximum relative solution error <=1e-9, using fixed reference scales .001
for T and .5 for p to avoid division by zero. The solved actual native
field must satisfy original-stencil backward error <=1024*DBL_EPSILON
times RHS plus original stencil magnitudes. These are algebra screens;
the physical run's native tolerance is unchanged.

Seven process invocations: one laws process and six rejection processes
(wrong geometry, Dirichlet, periodic, nonfinite coefficient, changed
callback, singular matrix). Rejections must exit exactly 3 with the named
HIVE_COARSE_REJECT reason. No warning is tolerated in the laws process;
raw outputs precede acceptance checks. The shared dense matrix operation
was extracted within this candidate so the singular case exercises the
same native inversion/rejection owner as the physical helper.

Algebra ceiling: 10 s total, 3 s per process, under the ordinary guarded
retained scope. No parameter/fixture/tolerance changes after a numerical
failure. Compiler-only corrections preserve the failed build and exact
delta; stencil or algebra failures stop for diagnosis.

If algebra passes, generated C must confirm the l=1 helper, unchanged
finer solver/event chain and disposal of temporary boundary probe scalars.
Only then root has authorized one physical packet, the same 100 J / 2 s
fixture and unchanged 25 s inner / 30 s outer budget, stock screens and
native tolerance. Native warnings/malformed records reject. Compare
elapsed/CPU/cycles and physical observations honestly against the baseline
which stopped at .319210305399 s; do not claim a same-horizon baseline.
