# Exact coarse solve of the existing native thermal operator

2026-09-09. Source-only first checkpoint: not compiled or executed. Root
chose this standard linear-solver correction after the preserved u3403
budget failure. Exclusive writes are inside `coarse-solve-v1/`. Original
upstream, compile artifacts, gas/water methods and the first native result
remain unchanged.

## What changes and what stays the same

`overlay.patch` shows the entire change to the pinned upstream thermal
header: include `coarse-thermal.h`, and call its exact block solve when
`relax_thermal` receives l=1. All finer-level relaxation, residuals,
multigrid restriction/prolongation, pressure correction, heat/pressure
energy work, source timing, physical parameters and validity thresholds
stay native and unchanged. The local caller changes its thermal include
and adds one passive coarse-solver receipt after `run()`.

This is a local reviewed overlay of GPL upstream code, not an upstream
edit or a new heat/pressure equation. No matrix or factorization is retained
between solves. Native `mg_cycle` may call its coarse relaxation several
times in a cycle; each call rebuilds and solves the current operator and
RHS. That preserves the native interface at some redundant small-matrix
cost, which is measured by the new call counter rather than hidden.

The unchanged fixture is the full isotropic 8³, 1 m cube, pure ideal air,
100 J finite heater releasing 100 W for 1 s, observed to 2 s; all six walls
impermeable/insulated. DT<=1/64 s, native TOLERANCE=1e-10 and its actual
TOLERANCE/dt² residual target, NITERMAX=100, 256-step / 25 s inner caller
limits and 30 s outer guard remain as reviewed. No physical run is
authorized by this source checkpoint.

## Exact operator and indexing

The native coarsest supported level is 2³ cells, Delta=.5. X is fastest:
`j=ix+2*iy+4*iz`, centers .25/.75, unknowns `[T0..T7,p0..p7]`. Gather the
actual already-restricted face kappa/alpha and cell lambda1/2/4/lambda plus
both correction RHS fields from the native `Thermal` owner on every call.

For one coarse cell i and an interior neighbor j, define
`Kij=kappa_face/.5²`, `Aij=alpha_face/.5²`. The assembled rows are exactly:

    LT_i = lambda1_i T_i + lambda2_i p_i + sum_j Kij (T_j - T_i)
    Lp_i = lambda_i p_i + sum_j Aij (p_j - p_i)
           + lambda4_i sum_j Kij (T_j - T_i)

Each cell has three interior faces and three outside faces on this 2³
grid. A homogeneous Neumann outside ghost equals its adjacent cell, so
each outside difference is zero. Its face coefficient is still checked
for valid metric/finite value. The lambda4 term is present for every
interior thermal face and uses the receiving row's cell coefficient.
Neither field's constant component is pinned or reset. The finite
Helmholtz term supplies the mean-pressure equation.

Every matrix row and its RHS are divided by that row's maximum absolute
matrix coefficient. Native `smatrix_inverse(16, matrix, 64*DBL_EPSILON)`
inverts that scaled matrix. A zero/nonfinite returned minimum pivot or
nonfinite solution rejects the native batch. The limit is an inversion
admissibility screen, not an alternative native residual tolerance.

An independent face-difference evaluation then checks `rhs-L(solution)`
in original units; it does not multiply by the assembled matrix. Its
roundoff screen is `512*DBL_EPSILON*(|rhs| + sum |individual stencil terms|)`
per row, including the separate values in potentially cancelling neighbor
differences. Both original-unit maxima and maximum relative backward
ratio are reported. This check verifies the dense linear solve; the
unchanged native residual owner still decides full fine-grid convergence
against the original tolerance. No coarse residual is replaced by zero.

Only after those checks are the two native coarse correction fields
assigned. Canonical density/momentum/energy, heater reserve and clock are
never touched by the helper. If rejection occurs, the native batch exits
with error; no fallback or atomic physical rollback is claimed.

## Supported geometry and boundary admission

Reject TREE, MPI or non-3D at preprocessing; reject wrong N/depth, room
origin/extent, coarse centers/count, cm/fm metrics or invalid coefficients
at runtime. Every coarse cell and interior face must have one identity;
the two incident reads of a shared face coefficient must agree. Only
finite positive alpha, nonnegative kappa and negative temporal diagonal
coefficients are admitted for this fixture.

At first use, copy the actual correction boundary callbacks onto two
temporary scratch fields with distinct positive cell values, apply native
`boundary_level`, and require each of the six outside ghosts to equal
its incident value exactly. This rejects the standard periodic,
Dirichlet, missing or incompatible correction boundaries. Keep callback
identities and reject later changes. Scratch probes are disposed through
the qcc scalar lifetime; generated code must verify that at compile review.

This behavioral admission supplements the source-pinned caller's explicit
linear homogeneous Neumann declarations; it is not a general semantic
proof for arbitrary user callbacks. General boundaries are unsupported.
The first matrix qualification below checks each actual homogeneous
boundary action on every basis vector, rather than inferring it from the
single runtime admission probe. No caller callback is serialized.

## Source-only matrix/original-stencil check design

Before a physical rerun, prepare one short native algebra qualification
using this exact helper and frozen `smatrix_inverse`. It must not advance
the heater or simulation. Fixed matrix fixtures: (a) the initial air
coefficients at dt=1/64, (b) deterministic positive face-varying
kappa/alpha and cell-varying negative lambda1/lambda plus nonzero lambda2
and lambda4, each created on the 8³ grid and restricted with native
restriction. Same 2³ coarse geometry in both fixtures.

For all 16 basis vectors, put values into temporary native level-1 T/p
fields, apply their real homogeneous boundary callbacks, and evaluate the
original pinned `residual_thermal` face-gradient expression with a
level-1 iterator and zero RHS. Compare its negated residual with the
assembled matrix column in original units. The independent check must
read native field neighbors directly, not the captured row array, and
must cover all six faces/corners and the lambda4 cross block. Check
constant-temperature/constant-pressure vectors as additional mode probes.

Then choose a fixed signed known solution with nonconstant components,
form its RHS through that native stencil, solve it through the helper,
and compare both recovered fields and original-stencil residual. Check
the current physical constant mode explicitly. Preserve exact initial
source and all first failures. Fix error thresholds in the actual
qualification caller before it runs; no tuning after observations.

Use separate processes for deliberate rejection cases: wrong geometry,
Dirichlet/periodic correction boundary, nonfinite coefficient and changed
boundary callback. Each must report failure, never silently use native
relaxation or return successful physical completion. A singular/near-zero
pivot matrix is tested through the same numerical helper when that caller
is prepared. No broad grid/parameter sweep or native physics test is
implied. Root reviews this design and source before compile/run.
