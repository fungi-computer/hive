# Finite heat in a sealed native gas room: first source shape

2026-09-09. Owner /root/sim_study_status_check. New ignored caller/observer only;
the pinned upstream archive, qcc, water references and custom gas evidence stay
unchanged. Root requested a useful closed-room heating reference instead of
another shock/acoustic survey. This source is not compiled or executed yet.

## Fixed physical fixture

One cubic1 m room, Cartesian full multigrid3D,8 cubed cells (512), Delta=.125 m.
This is an isotropic native reference, not the game's[1,.54,1] voxel binding.
No interior solids, interfaces, gravity, viscosity, chemistry, oxygen, ambient
reservoir or source tied to rendering. Walls are stationary and insulated.

Use actual `compressible/thermal.h` + `compressible/NASG.h`, pure gas phase2:
f=0, frho1=fE1=0, frho2=1.2 kg/m3, gamma2=1.4, cv2=717.5 J/kg/K,
cp2=1004.5 J/kg/K, PI=b=qEOS=0, kappa2=.026 W/m/K. Set unused phase1's
thermodynamic coefficients consistently, but its mass/energy remain zero.
Initially T=300 K, p=103320 Pa, q=0, fluid total energy258300 J and mass1.2 kg.
The native cell q stores physical momentum density; this is not a conversion
of the prior MAC face-momentum state.

A named heater owns100 J initially. It releases100 W for the interval[0,1] s
only, distributed uniformly in the left x-half (exactly.5 m3/256 cells).
Integrate to2 s to observe a full second after the source stops. The finite
reserve is not reset or replenished. These are initial/source definitions, not
new gas evolution equations.

## Exact heater/event seam

The actual headers already order stability/dt, VOF, tracer advection,
properties, thermal acceleration, pressure, and energy end-timestep hooks.
The caller extends inherited `tracer_advection`, which retains the native
`last` scheduling attribute. This runs after conservative VOF transport and
before `properties` derives ps from advected/heated E. It transfers
min(heaterRemaining,100*dt) J into fE2 over the physical heater volume.
The existing thermal owner then derives Ts/beta/coupling and solves T/p.
There is no separate temperature source or second pressure equation.

`heater_cutoff(t=1)` is an ordinary native scheduled event; `dtnext` lands the
existing dt on it. The event verifies the reserve and time, and applies no
heat. `stop(t=2)` terminates before another solver step. The heater uses the
actual admitted dt, never a render duration or its own clock. A missed cutoff
is rejected/reported, not repaired by later heat or a changed physical interval.
The received cutoff event also disables subsequent source calls, so native
floating event-time comparison cannot release a tiny remainder after cutoff.

Floating transfer receipts record donor loss, actual fE2 increment and their
difference. The heater reserve stays finite; rounding is neither hidden nor
dumped elsewhere. The exact source transfer is one cause into the native total
energy stock. Thermal and pressure face energy fluxes remain entirely native.

The qcc translator was read: same-name events inherit `last`, register a chain
and execute newest action before earlier actions. Therefore the caller's
end_timestep overload observes the energy-flux inputs BEFORE both native energy
hooks. A distinct later `completed_observation(i++,last)` observes AFTER their
full chain. This planned order must be verified in the generated C/event trace
at the future compile-only checkpoint; source naming alone is not final proof.

## Closed boundaries and measured receipts

All six walls explicitly impose cell normal q=Dirichlet0, face normal uf=0,
pressure Neumann0 and temperature Neumann0. Zero gravity makes the pressure
gradient condition consistent with stationary normal momentum. Unspecified
tangential cell components retain native free-slip defaults. Mass/energy
scalars use native zero-normal-gradient ghosts; no mass crosses if uf is zero.

Before the energy hooks the observer sums the actual pressure-work boundary
flux uf*(pLeft+pRight)/2 and the actual thermal boundary flux
-kappa*face_gradient(T), multiplied by dt and area with outward signs. Its
coordinate vector rotates with each face family, so all six walls, area6 m2,
are inspected. The test requires exact zero wall face velocity. No finite
boundary mass supply is assumed. For this fixed grid, zero uf means the native
mass transfer at every external face is zero; arbitrary open-boundary mass
receipts are outside this caller.

thermal.h reuses kappa as its heat-flux scratch in end_timestep. Observe its
conductivity input before that mutation. Reuse `residual_thermal` itself to
read separate final temperature and pressure residuals before the scratch is
overwritten; this is one extra residual evaluation, not a second solver.
Then observe the physical cell stocks after both native energy updates.

The combined law is fluid total energy + heater remaining + cumulative outward
boundary pressure/heat work = initial fluid energy +100 J. Also report finite
mass, kinetic energy, derived internal-energy temperatures, native solved T,
native solved p, independently queried EOS p, and their differences. Do not
reset E or temperature to make the solved/EOS fields agree.

## First packet budget and evidence thresholds

Proposed DT ceiling1/64 s, native velocity CFL.45, no acoustic-CFL restriction
(the implicit pressure method is the subject). Native timestep ramping/dtnext
can choose smaller dt. At most256 completed steps;25 s caller wall cap and a
future30 s outer numerical guard. No per-case grid/parameter sweep is proposed.
The compile is a separate guarded checkpoint and needs root source acceptance.

NITERMAX=100, native TOLERANCE=1e-10, unchanged native solve form. The actual
mixed residual target remains TOLERANCE/dt². At the maximum dt it is4.096e-7;
smaller native ramp steps have a different target which is recorded. The native
T and p residual components have different dimensions, so the common threshold
is not called a dimensionless error or a validated temperature tolerance. We
report temperature residual (W/m3), pressure residual (1/s2), iterations,
relaxations and elapsed pressure time. No physical accuracy conclusion follows
merely from this solver threshold, and a first failure cannot be followed by
unreviewed tolerance adjustment.

Fixed stock screens are absolute mass error<=1e-11 kg and combined energy
error<=1e-5 J (one ten-millionth of the100 J input), all masses/internal energies
positive and finite, derived temperatures within the prior200–600 K study
envelope. These are conservation/admissibility screens, not an analytic flow
error estimate. Transfer rounding is separately displayed. Cutoff checks use
1e-12 s and1e-10 J solely for the scheduled floating clock/reserve receipts.
The cube/phase/area definitions have exact binary geometry and are checked
exactly. No error is clamped to satisfy these screens.

Pressure/EOS disagreement, left/right mass and temperature, physical cell/face
motion and kinetic energy are reported rather than assigned arbitrary accuracy
thresholds before a reference exists. For an ideal closed gas, mean EOS pressure
is related to admitted total heat minus kinetic-energy change; approximately
40 Pa of mean pressure rise and.11614 K mass-weighted temperature rise are
expected if kinetic energy is negligible. Nonuniform left heating should
produce a positive left/right temperature difference and transfer mass toward
the right while heating. Those qualitative directions and actual magnitudes
must be reviewed before this is called successful thermal expansion. Stock
screens alone do not establish that the room moved or heated correctly.

## Lifecycle and scope limits

This is one native batch experiment. Its heater scalar is not a general game
source controller or saved-world stock. CSV field snapshots are observations,
not a restart format. Native uf/global settings/event history are not supplied
by a normal dump; exact interrupted continuation remains unqualified.

The native solver warns and keeps its current solution on nonconvergence.
The caller records and stops on that failed step; it does not claim atomic
rollback. A failed transfer-interval admission may follow native VOF mutation,
so its raw state is preserved as failure rather than advertised as accepted.
No kernel callback, remap, finite water coupling or successful game command
is invented. GPL/adoption and actual cell-versus-face representation remain
the boundaries recorded by the preceding source fit.

Next handoff: root reviews sealed-heat.c, sealed-heat-observation.h and this
contract before any qcc invocation. Keep the initial result/failure unchanged.
