# Decision: preserve the heat/energy reference; do not adopt this solver caller for gameplay

2026-09-09, after the single failed-budget packet. No kernel changes or
further numerical runs. The native finite-energy/heat/pressure composition
produced useful partial closed-room behavior. The exact unmodified SI
thermal caller is not a viable demonstrated game-scale heating or
ventilation owner: 512 cells consumed 6.118 CPU seconds for 0.319 simulated
seconds and 2,206 multigrid cycles. Ventilation was not exercised at all.

This is a pressure-solve adoption boundary, not evidence that finite heat
and air simulation is impractical or that another language would fix it.
The packet already ran native optimized C; a WASM port would not remove
these iterations. Keep its shared finite energy and boundary receipts as
a reference. Do not port this caller, expand it to village rooms or buy a
longer run to declare completion.

## What explains the work, from actual source

The pinned `compressible/thermal.h` has one coupled pressure/temperature
residual. Lines 185–205 evaluate two differently dimensioned equations and
return `max(abs(resT), abs(resp))` without scaling. The former has units
W/m³, the latter 1/s². Lines 145–155 relax the two fields sequentially using
neighbor values; this is not a direct block solve of the whole sealed room.
Lines 226–228 call the generic multigrid with `minlevel=max(1,minlevel)`.
For this cube the coarsest level therefore still contains 2³ cells.

The pinned `poisson.h:36–86` restricts residuals, starts a zero correction
on that coarsest level and performs relaxation there and at finer levels.
It has no direct solve or special removal of the room's constant-pressure
mode. At lines 195–200, `mg_solve` increases `nrelax` when one cycle reduces
residual by a factor less than 1.2, up to 100; it decreases it when reduction
exceeds 10. Each pressure call starts with the thermal default of four
relaxations; the 61 reported at step 30 was reached within that solve,
not accumulated as a saved physical state.

Our caller selected `TOLERANCE=1e-10`. `all-mach.h:230` turns it into
`TOLERANCE/dt²`, then the thermal solver applies it to that raw mixed maximum.
At the last accepted dt=0.014484887119 s, this demands 4.76617e-7 in either
raw residual. The final pressure residual, 4.27789e-7, dominates the
temperature residual, 9.65270e-8. The step histories show pressure residual
dominance from step 6 onward and increasing cycles/relaxations as dt grows.
This tolerance is our research setting, not a measured gameplay requirement.

## A specific conditioning problem, beyond the units warning

For this nearly uniform ideal gas, the pressure Helmholtz term is

    |lambda_p| = 1 / (dt² gamma p) ≈ 0.0329461,

while the fine-grid interior pressure diffusion diagonal is
`6/(rho*Delta²) ≈ 320`. Their ratio is approximately 9,713. Even on the
2³ coarsest grid the nominal diffusion diagonal is 20, roughly 607 times
the Helmholtz term. These are frozen-state scalar estimates from the
actual equation, not a measured matrix condition number.

All walls impose Neumann pressure. A spatially constant pressure correction
has zero gradient, so that mode is controlled by the small Helmholtz term,
not by the much larger stencil terms. Heating a sealed room genuinely
excites its mean pressure. The native coarse relaxation consequently has
a weak mean mode to converge. This is a concrete source-level explanation
consistent with rising adaptive relaxation work; no per-mode residual
trace was recorded, so its exact fraction of cost is not claimed.

The last scalar pressure threshold corresponds to a uniform-mode correction
of about 1.45e-5 Pa under this constant-coefficient estimate. For comparison,
the observed local solved/EOS disagreement reached 0.414 Pa. For temperature,
`rho*cp/dt≈83,218` would turn the same raw threshold into a local diagonal
correction of about 5.73e-12 K if pressure and neighboring corrections were
held fixed. Neither estimate is a global error bound. They show that a
single raw threshold imposes very different demands on the two fields.

Changing units alone does not remove the near-constant pressure mode or
alter the ratio of its Helmholtz and diffusion terms. Simply relaxing the
threshold can save iterations while leaving that weakness intact. Neither
is a justified finished fix based on this packet.

## One implementation decision for the parent

The needed correction is at the existing coupled pressure-solve owner:
handle the sealed-component/coarse pressure mode and give the two residual
equations explicit physical error scales. It must still solve the same
finite-energy/pressure equations; no atmospheric-pressure reset, overwritten
temperature or discarded heater energy is permitted. A correct coarse
block solve or explicit compatible mean-mode treatment is the relevant
change, rather than another fluid-library survey or a second heat owner.
The final choice and any future executable check belong to root; this note
does not authorize an implementation or retry.

For gameplay now, this is useful as retained evidence that the finite heater,
native pressure work and conductive heat can share one conservative owner.
It is not a ready room-heating/ventilation engine. Keep the game release
independent and do not advertise a completed 100 J room experiment.
