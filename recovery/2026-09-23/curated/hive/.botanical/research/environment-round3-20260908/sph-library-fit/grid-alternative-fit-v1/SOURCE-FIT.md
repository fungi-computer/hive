# Basilisk grid/free-surface fit: source decision

2026-09-08. Source-only checkpoint; no installation, compilation, numerical run,
upstream patch, production dependency or game edit. All earlier SWE/SPH results,
including the physical boundary failures, remain unchanged.

**Recommendation:** use the existing Basilisk centered + two-phase + conserving
implementation as the next isolated physical reference, beginning with one
literal aligned-wall basin. It already owns the coupled volume/momentum flux
and pressure solve that we need to test. It is not currently a drop-in game
solver: exact continuation, editable topology, finite thermodynamic air,
application ownership and delivery licensing are separate unresolved boundaries.
Do not write another advection/projection scheme or port this before the native
method discriminator passes.

`source-inventory.json` pins the actual downloaded bytes, URLs and response
headers. This is a per-file snapshot from the authoritative site, **not an atomic
darcs revision or a buildable complete checkout**. HTTP-success responses which
contained HTML 404 messages are retained and explicitly marked `ok:false`;
they are not source or test evidence. Local line anchors below refer to the
pinned files under `source/`, not potentially different website line numbers.

## What the actual numerical owner does

| Owner | Checked behavior and limitation |
| --- | --- |
| `two-phase.h`, `two-phase-generic.h:1–96` | `f` is fluid-1 volume fraction, `1-f` fluid-2. Density and viscosity use clamped arithmetic phase mixtures by default; face inverse density is `fm/rho((fL+fR)/2)`, centered density is `cm*rho(f)`. No compressible-gas or thermal state is supplied. |
| `vof.h:156–319,325–381` | Reconstructs geometric interfaces, computes one oriented face volume flux, and sweeps coordinate directions. VOF-associated tracers use those same phase fluxes. The multidimensional conservation statement requires divergence-free transport; actual projection has finite tolerance, so measure volume drift. CFL is capped at .5; violating it emits a warning, not a transactional rejection. |
| `navier-stokes/conserving.h:117–194` | Splits temporary momenta into `f*rho1*u` and `(1-f)*rho2*u`, attaches both to the VOF tracer owner, transports them with `f`, then reconstructs velocity from their sum and mixture density. `stokes=true` disables the *other* centered advection path; it does not remove inertia here. Temporarily suppresses the default VOF event to avoid double transport. |
| `navier-stokes/centered.h:203–443`, `poisson.h:481–517` | Updates properties, gravity/viscosity and projected face velocity. The variable-density solve is `div(alpha grad p)=div(uf*)/dt`, followed by `uf=uf*-dt*alpha grad p`. Pressure is a numerical constraint; no wall skin, displaced sample position or particle mass adjustment is required. |
| `poisson.h:104–119,160–223` | Reports iterations and before/after residual, with adaptive relaxation count. It warns and returns even when the cap fails. Our reference caller must reject an unconverged step explicitly, recording the actual residual/cap. |

For a closed, inviscid full-cell domain, shared phase fluxes provide the right
mass/momentum transport mechanism. Gravity and wall traction legitimately change
total momentum; this is not a promise of exact kinetic/total-energy conservation.
Tree refine/restrict in `conserving.h:14–29` preserves total momentum, not each
phase's separate momentum. The first fixture has no runtime adaptation.

Sources: [two-phase properties](https://basilisk.fr/src/two-phase-generic.h),
[VOF](https://basilisk.fr/src/vof.h),
[conserving advection](https://basilisk.fr/src/navier-stokes/conserving.h),
[centered solver](https://basilisk.fr/src/navier-stokes/centered.h),
[projection](https://basilisk.fr/src/poisson.h).

## Literal solid volume, units and air

Use metres, seconds, kilograms: `u` and Cartesian `uf` are m/s, `a` m/s²,
`rho` kg/m³, dynamic `mu` kg/(m s), `p` Pa and `f` dimensionless. Metric-weighted
`uf` is a velocity times face fraction, not a preintegrated m³/s quantity; a
Cartesian 3D face transfer is `f_flux*uf*Delta²*dt`. Water stock is
`rho_water * sum(f*Delta³)` over active full cells. In a 2D slice use `Delta²`
and explicitly report volume/mass per unit depth. Pressure is defined up to a
constant in the closed Neumann basin, so compare gauge-independent differences
and net boundary traction. `reduced.h` changes the pressure variable; omit it
from the first direct-gravity hydrostatic discriminator.

**Do not use embedded partial-cell VOF as literal solid accounting.** The actual
`vof.h:296–314` comment and update intentionally ignore solid-occupied volume
inside partial cells for the conserved tracer measure. With Cartesian embedded
metrics `cm=cs`, the extra `cs` cancels that denominator in the update. This is
not conservation of physical `sum(cs*f*Delta³)` when `0<cs<1`. No reinterpretation
of the game inventory fixes that mismatch.

The clean first path is `grid/quadtree.h` with a fixed uniform fine grid and
ordinary **whole-cell `mask()` boundaries**, no `embed.h`. `grid/tree.h:1432–1456`
marks selected whole cells as boundary IDs and coarsens wholly masked branches;
`test/mask.c` exercises actual masked boundary handling. The retained fluid
cells have their full physical volume and standard ghost boundaries. Explicit
normal `uf=0` and symmetric/slip `u` at all six basin walls (four in 2D) prevent
wall flux. The existing centered pressure Neumann conditions balance gravity.
At ordinary Cartesian walls corners are intersections of excluded cells, not
overlapping solid kernels. This is a source fit, still requiring the physical
and volume measurements below.

The stock grid has one cubic `Delta`; silently stretching y would change its
operators. Our proposed 1m horizontal/.54m vertical world voxels can map exactly
to a .02m Cartesian study subgrid: 50 cells per horizontal voxel, 27 per vertical
voxel. The basin height 1.08m is 54 cells. This is **a convenient metric match for
the discriminator, not a required production simulation resolution**. On a
1.28m root with N=64 it gives 2,700 active 2D cells, or 135,000 active 3D cells
before any finer study. Anisotropic operators or deliberate metric approximations
would be a separate method decision.

`two-phase.h` represents both water and air as incompressible immiscible fluids
with prescribed density. It supports interfaces which can change topology
(including detached liquid), subject to resolution, VOF reconstruction and
numerical coalescence. It does not supply oxygen/smoke, gas EOS, heat, compressed
trapped air or evaporation. The gas team's finite thermodynamics cannot also own
the same air volume or momentum; any later one-way ambient approximation or
two-way coupling must explicitly settle that ownership. This basin uses closed
incompressible air solely as a declared reference medium.

## Clock, retained state and edits

The actual `test/large-ns.c:6–31` combines these three solver headers, a maximum
DT and output at scheduled .1-second times. `run.h:14–36` owns one event loop;
`grid/events.h:274–293` shortens substeps to scheduled times. **DT is a cap, not
a fixed step.** A native reference can use that ordinary long-lived run, with a
finite stop event. A future game adapter must stop at committed external
interval boundaries without restarting the solver or advancing the game clock
independently. The first basin is not that adapter.

Never call `run()` once per game tick: it resets time, recreates and frees the
grid. Never call named events as an improvised timestep: `event(name)` passes
its action arguments as `i=0,t=0` (`grid/events.h:262–270`), while VOF sweep order
depends on actual iteration modulo dimension (`vof.h:370–375`). A resumable driver
would retain the ordinary `events(true)` order and numerical state.

Independent read-only review confirmed stock `dump()/restore()` is insufficient
for exact fresh-process continuation:

- Dumps exclude every face field (`output.h:1039`) and default `p/pf`
  (`centered.h:141`). Restore rebuilds the grid, zeroes omitted fields and moves
  schedules forward without running their actions (`output.h:1236–1417`). The
  usual centered init reconstructs `uf` from `u`, rather than recovering the
  previously projected face flux used by the next VOF step.
- For the inviscid conserving fixture, retain `f`, `u`, projected `uf`, pressure
  warm start `p`, `mgp.nrelax`, `timestep.h`'s private `previous` growth limiter,
  physical time, actual iteration, dt and exact event phase. The last three
  include timing/phase metadata; a pointer/event object is not a portable save.
  The pressure initial guess and relaxation feedback affect a tolerance-limited
  solve. `dtmax` is rebuilt each step. `g` is overwritten before use in this
  inviscid conserving case; viscosity adds prior `g` and `mgu.nrelax`, while
  ordinary centered advection adds `pf/mgpf`.
- Checkpoint only between completed iterations, with the conserving temporary
  momenta/temporary interface override settled. Frozen geometry, material/BC
  definitions, solver tolerances, build/source and iteration policy identify
  the experiment. Raw `dump` is neither a validated hostile-input codec nor our
  saved-world contract. Exact continuation remains a later focused proof.

`mask()` is destructive, and its `none` branch does not unmask former solids.
Masking water away would destroy its stock. Refinement is resolution management,
not excavation or displaced-water settlement. New solid/open cells require
explicit conservative water/air/momentum remapping, wall work and pressure/flux
reprojection; solid edits are unsupported in this first fixture. Pin geometry
and reject changes at admission. Retained mask IDs also need explicit rebuild
or serialization; stock dump stores leaf flags, not those boundary IDs.

Pressure couples a connected region globally. Storage chunks cannot be treated
as independent closed pressure boxes. Sparse residency, hydraulic boundary
conditions and shared inter-region flux remain unqualified. No world-capacity
claim follows from an idle basin.

## Toolchain and licensing fit

`INSTALL:18–62` offers an authoritative darcs checkout or tarball and specifies
C99 + GNU make. The actual Makefiles are more informative than assuming missing
bison/flex is fatal: `include.c`, `postproc.c`, `ast/basilisk.c` and `ast/tokens.c`
are shipped generated C, and regeneration recipes are commented out. This
snapshot confirms those are actual C files. `gcc`, `make`, `awk` and `ar` are
present; `qcc`, `bison`, `flex`, `darcs` were not found. No package installation
appears necessary for the minimal native path, but compilation has not run.

The smallest prospective build fetches/pins one complete official archive,
uses its `config.gcc`, builds `ast/libast.a` and the `qcc` target only, then
compiles one headless C caller with qcc. `Makefile:17–33` shows that the default
all target also builds viewers and other tools; avoid those. `qcc` translates
Basilisk's field/foreach/event syntax into C; these are not plain headers that
Rust, Zig or an ordinary C compiler can directly consume. Keep the reference
single-threaded, without MPI, OpenMP, GPU, render or optional packages. No WASM
build, ABI or multi-instance isolation has been established.

The source distribution supplies [GNU GPL version 3 in COPYING](https://basilisk.fr/src/COPYING).
Treat it as copyleft code, not a permissive snippet collection. A separately
retained native research reference is the immediate recommendation; distributing
a linked browser/WASM/game derivative requires an explicit compatible licensing
choice and preservation of applicable source/notices. No production licensing
decision is being made in this study. Build instructions are checked in the
[actual INSTALL](https://basilisk.fr/src/INSTALL),
[top-level Makefile](https://basilisk.fr/src/Makefile) and
[parser Makefile](https://basilisk.fr/src/ast/Makefile).

## Smallest proposed physical caller, not yet authorized or executed

One 2D, unit-depth **literal stationary basin**, not a dam-break sweep:

- Include quadtree, centered, two-phase, conserving; no embedded cells, reduced
  gravity, viscosity, surface tension, filtering, adaptation or imposed flow.
- Root 1.28m, N=64; retain x in [0,1] and y in [0,1.08] using fixed masks.
  Water fills exactly y in [0,.54]; air occupies [.54,1.08]. Initial u and uf
  zero. Densities water 1000kg/m³, air 1.2kg/m³; gravity (0,-9.81)m/s².
  Boundary planes are literal cell faces; no hidden standoff or mass correction.
- Use direct constant face gravity and the ordinary solver, starting with p=0
  so its pressure projection must recover hydrostatics. All walls are closed
  and slip. The unit-depth water volume is .54m³, mass540kg, COM y=.27m;
  water weight5297.4N. Air mass is .648kg. Total bottom-minus-top pressure
  traction must support5303.75688N per metre depth.
- Independent pressure: choose top gauge0. Then
  `p(y)=1.2*9.81*(1.08-y)` in air and
  `p(y)=1.2*9.81*.54+1000*9.81*(.54-y)` in water. Compare after removing one
  gauge constant; do not replace reported pressure with this formula. Infer
  bottom/top traction from actual pressure and its wall ghost values.
- Proposed first interval0.1s, DT cap .001s, CFL≤.5, single thread, maximum1000
  solver steps and 30s wall guard. Record actual dt sequence/clock, both phases'
  volume and bounds, u/uf maxima, COM, pressure-profile error, wall traction,
  residual/cap and stage/cell-work timings. The existing staggered f/u timestamps
  remain explicit; stationary analytic values are time-independent.
- Proposed controls before executing: TOLERANCE1e-10, NITERMAX100; every solve
  must meet its actual `TOLERANCE/dt²` target without hitting the cap, each phase
  volume drift≤1e-10m³ per unit depth, f within [-1e-12,1+1e-12], max u and
  physical face speed≤1e-6m/s, COM drift≤1e-7m, maximum gauge-adjusted pressure
  error≤.01Pa and relative net traction error≤1e-5. Record failure unchanged;
  no tolerance/geometry/mass tuning in the same packet.

The maintained `test/hydrostatic.c` checks hydrostatic velocity on a single
fluid; `test/gravity.c` checks waves against a separate reference;
`test/large-ns.c` exercises the exact chosen three-header composition;
`test/reversed.c` separately checks geometric VOF advection and associated
tracer conservation. None is claimed to have run here or to prove our basin.
`test/missing_metric.c` sets cs/fs to one, so it is not a partial-solid-water
conservation qualification.

If this passes, the next decision is a modest moving interface/restoring-wave
case and then a real .54m ledge/3D corner with unchanged metric and independent
volume/energy/front controls. First measure cost before selecting the 135,000
active-cell 3D basin. Passing 2D rest alone would establish wall/pressure support,
not falls, thin streams, exact restart, edited voxels or world suitability.
