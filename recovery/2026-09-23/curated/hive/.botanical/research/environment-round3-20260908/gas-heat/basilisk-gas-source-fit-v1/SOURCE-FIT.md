# Pinned Basilisk source fit for finite gas energy and pressure

Source-only, owned by /root/sim_study_status_check. No archive, qcc, numerical
kernel or tracked file changed. No compile, numerical run or package adoption.
The archive and actual source/caller files are pinned in source-inventory.json.

## Chosen first native reference

Use the existing **test/shockwave.c single ideal-gas caller**, with the archive's
documented `-grid=multigrid1D` path (`test/Makefile:388`). It includes
`compressible/two-phase.h` and `compressible/Mie-Gruneisen.h`, sets gamma1=1.4,
and uses the pure phase1 limit. It initializes conservative density, cell
momentum and total energy, uses donor advection, and compares the moving shock
against independent Rankine–Hugoniot states/speed. This is the least ambiguous
existing caller for a first finite pressure-work/transport source acceptance.
[Upstream caller](https://basilisk.fr/src/test/shockwave.c).

Its open/inflow problem is not a sealed stock test. Its nondimensional strong
shock is not a room Mach-number claim or a test of our200–600 K thermodynamic
envelope. The caller's output alone does not assert positivity or total-energy
balance. Any later bounded observation must add those explicit measurements,
retain the exact physical initial/boundary states, and identify one chosen
resolution rather than silently running a new convergence survey.

For the next low-amplitude physical limit, the archive also has the actual
single-gas `test/gaussianaxi.c` caller with f=1 and the same EOS. It is
axisymmetric, N=128 with a multi-CFL loop; it must not be called a one-dimensional
Cartesian test without an explicitly reviewed caller change. The discontinuity
advection test has two different gases and is not itself the single-gas limit.
[Acoustic caller](https://basilisk.fr/src/test/gaussianaxi.c).

Do not select thermal.h/NASG.h for this first inviscid reference. The existing
two-phase+Mie-Gruneisen path already covers pressure work. Thermal NASG has
additional phase-specific assumptions discussed below. No gravity or interface
motion should be enabled to make this first reference look more game-like.

## Actual canonical quantities and event chain

`all-mach.h:39–63` allocates cell vector q, cell p and face uf. The two-phase
owner adds f, frho1, frho2, fE1 and fE2. In a Cartesian unit-metric pure phase1
cell, the physical quantities are

```text
rho = frho1;       momentum density = q;       total-energy density = fE1
M = rho*cellVolume; Pcell = q*cellVolume;        E = fE1*cellVolume
Kdensity = |q|^2/(2*rho);                       Udensity = fE1-Kdensity
pEOS = (gamma1-1)*Udensity                     [PI1=0]
```

This is cell momentum, not our canonical staggered face momentum. uf is the
projected face advecting velocity, not another conserved air mass. Any later
migration must select one representation and prove its conversion; no wrapper
can claim the old dual kinetic metric and native cell metric are identical.

The headers' actual chain is:

1. Defaults allocate properties, set f=1/frho2=fE2=0, and attach phase masses,
   energies and split momenta to the VOF owner. Default gradients use minmod2;
   shockwave sets `f.gradient=zero` in main; init applies it to those fields.
2. Init derives face uf, asks properties for EOS/coefficient fields, and sets
   initial dt limits. Both all-mach and two-phase have init events; their
   inheritance/order is real generated caller behavior, not a second loop.
3. VOF splits q into phase momenta, advects f and all associated finite
   quantities through the same `vof_advection`, restores q, then suppresses
   the default VOF call so f is not transported twice. The tracer event
   restores the interface list. `NO_1D_COMPRESSION` keeps mass/energy tracers
   in conservative form while the volume fraction has its own advection law.
4. Properties computes `ps=average_pressure` from advected energies/q and
   builds rho, face alpha and bulk compressibility. For pure ideal gas,
   alpha is the inverse arithmetic face density and bulk is gamma1*p.
   Crucially, bulk reads the retained p field; it is not simply gamma1*ps.
5. Pressure builds provisional uf from q and acceleration, then solves the
   Poisson–Helmholtz equation with lambda=-cm/(dt²*rhoc2). It corrects face uf
   and cell q. The solve overwrites the rhoc2/ps arrays as lambda/RHS; the next
   properties event rebuilds their physical meanings. They are not persistent
   independent thermodynamic stocks. See all-mach.h:168–255.
6. End-timestep adds the conservative pressure-work flux to phase energies.
   For pure phase1 it is `Enew=Eadv-dt*div(uf*pFace)` where
   pFace=(pLeft+pRight)/2. Viscous terms are separate and incomplete; the first
   reference keeps viscosity zero. See two-phase.h:461–477.

The pressure solve's p and pEOS recomputed after total-energy work need not
be exactly equal: this is a split/linearized pressure evolution, not a fully
converged nonlinear EOS reset. Measure their discrepancy and refinement trend.
Do not overwrite fE1 to make them agree. The pressure is also the next bulk
coefficient input and cannot be discarded casually when defining continuation.

In the future compile-only checkpoint use the existing qcc `-events -source`
path and personally read the generated event registration/action order. The
archive event dispatcher chains same-name actions and can keep calling the
chain after an action requests stop. A guessed event name is not proof of a
safe observation or failure boundary. No such generated gas caller exists yet.

## What the energy mechanism establishes in source

With f identically1, the absent phase's fields start and remain zero, and VOF
transport for mass/E is a shared conservative face flux. Pressure work adds
another paired face flux. On a closed stationary or periodic unit-metric grid,
their domain sum cancels algebraically. This is useful finite **total** energy
ownership. It is stronger than the former heater-only internal-energy closure,
but source cancellation is not a numerical result or positivity guarantee.

The native q representation has a local kinetic metric, so E-K positivity can
be evaluated directly per cell. However independently limiting advected rho,
q and E is not itself a proof that E-|q|²/(2rho)>0 survives transport and
pressure correction. Neither a thermodynamic temperature envelope nor atomic
rollback is provided by these headers. The exact native states and pressure
residual must be inspected at every accepted observation before claiming an
admissible continuation.

## Gravity is still a missing physical join

all-mach pressure adds acceleration to face uf and to cell q. The two-phase
energy end hook contains pressure and selected viscous work, **no acceleration
or gravitational energy work**. Running the original buoyancy scene unchanged
under this native path would therefore not implement the accepted corrected
law. No claim of gravity-compatible energy follows from the header title.

The required source is tied to actual admitted mass transfers. In vof.h those
tracer face fluxes are temporary arrays inside each directional sweep and are
deleted after its update. They are not exposed as a durable public receipt to
an end-timestep callback. A later correction must join the actual transport
owner or expose its local receipts; recomputing rho*u after projection is not
the same transferred mass. That future alteration would need a pinned, reviewed
candidate, separate from the untouched native baseline.

Likewise this code's pressure/energy coupling has its own local truncation and
admissibility behavior. Adding only dt*rho*u*g to an end hook would substitute
approximate cell work for the accepted transfer-based potential law. Adding a
measured total residual to E/U is not the correction.

## Thermal and EOS restrictions found in the actual callers

NASG.h includes b/q/cv coefficients in parts of its EOS. Its `sound_speed`
implementation omits b and q, so a general NASG acoustic claim cannot follow
from its function name. The first ideal-gas b=q=PI=0 case avoids that particular
mismatch. It does not validate a liquid NASG calibration.

NASG's `thermal_expansion` is proportional to (1-f), and only uses phase2's
thermal coefficients. With pure phase1 it returns zero. In the retained
`test/shrinking.c`, phase1 is the liquid and phase2 is the hot gas; this explains
the intended caller fit. A pure ideal gas thermal test using these equations
would need phase2, consistent cp/cv definitions and its own source acceptance.
Renaming our pure phase1 case to a thermal gas would suppress the intended
temperature/pressure coupling. NASG also references cp and Ts defined through
thermal.h; it is not a standalone replacement include for the first caller.

thermal.h replaces the pressure poisson call with a coupled T/p multigrid
solve. It computes thermal coefficients before projection and adds a shared
heat-flux energy update afterward. That is real coupling, but residuals for T
and p share one absolute maximum despite different physical scales. Thermal
fields/coefficient scratch are reused and must be observed at the correct
event phase. The first inviscid reference does not exercise any of this.

When f vanishes the two-phase owner zeroes that phase's mass and energy; there
is no export receipt or finite displaced-gas transaction. Pure f=1 avoids this
edge but proves nothing about finite water/gas phase disappearance. Embedded
VOF partial-cell code also explicitly uses an approximation to solid volume.
No arbitrary voxel topology or water displacement join is accepted by this fit.

## Failure, clock, restart and ownership fit

`poisson.h:175–230` has a finite multigrid iteration cap, but nonconvergence
prints a warning and returns its current solution. The all-mach caller then
applies it. The VOF CFL violation also warns. Neither path rejects a step
atomically. A diagnostic caller can stop and preserve the failed state; a game
advance API would need a real checkpoint/rollback or other admitted failure
contract. Catching a warning after publication is not a saved successful step.

`run.h` owns native global iter/t/dt and run() resets and frees a grid. It is a
batch event loop, not an immutable bounded advance operation. The first source
fit proposes a research executable only. A production embedding would have to
reconcile that lifecycle with the existing deterministic game clock; no extra
game simulation scheduler is proposed.

`output.h:1029–1049` excludes all face fields from its default dump list.
The dump does retain scalar components such as q, the selected scalar fields,
grid coordinates and t/iteration, but not EOS/source globals or a model/domain
definition identity. Restore mutates/recreates the grid before complete input
validation and maps nonfinite values to nodata. It is not the existing strict
finite-gas admission boundary.

After restore, init derives uf again. A cell-interpolated uf is not generally
the previous projected uf, so exact resumed evolution cannot be assumed from
matching cell dumps. A future restart adapter needs a specified face-field and
coefficient/event checkpoint, validated model/EOS/geometry metadata and an
actual interrupted-versus-uninterrupted test. This is retained numerical state
where the method needs it, not another independently evolved physical mass.

The native grid uses a common Delta (and its metric fields). A multigrid1D
reference does not prove physical3D spacings[1,.54,1], world-axis mapping,
global negative face IDs or edited-room topology. The existing world/section
bindings cannot be attached through an unchecked index adapter.

## Source/license/toolchain decision boundary

The archive's COPYING is GNU GPL version3. This study selects a numerical
reference to inspect; it does not authorize distribution, a runtime dependency
or a relicensing decision. Retain source attribution and review the actual
distribution boundary before a product integration. No GPL source is copied
into Hive production by these notes.

The already built retained qcc and archive are read-only inputs. Existing
native proof scripts set BASILISK to that src directory and OMP_NUM_THREADS=1,
retain generated C using `-events -source`, then compile in an isolated output
directory. This fit does not invoke those commands or change compiler files.
If root authorizes the next source candidate, prefer that established path,
one serial bounded executable, source hashes before/after, and a compile-only
review before numerical work. No browser, WASM port or new package is needed
to decide whether this native pressure-energy reference is useful.

**Next proposed outcome:** one source-only wrapper around the retained pure
gas shockwave initialization, fixed multigrid1D resolution and physical end
time, with independent shock/jump and finite E/U/pressure observations. Root
must select and review its exact caller/budget before compile or execution.
The follow-on acoustic/thermal/gravity cases remain separate decisions.
