# Deciding checkpoints for the next gas energy owner

Source plan only. Root accepted the conservative energy/pressure direction,
not a completed algorithm or a numerical run. First read the actual pinned
native reference and select its single-gas caller. These checks are ordered
decisions; they are not permission to launch a broad suite. A first numerical
packet should remain within512 cells and30 seconds after its exact physical
intervals, grids, tolerances and work cap are source-reviewed.

## 1. Close the local energy law before a moving room

Use a two-cell fixed-potential face with both signs of admitted mass transfer.
Compute local gravitational work from the same signed transfer receipt:
deltaQg_i=-deltaM_if*(Phi_f-Phi_i). Check both cell receipts, their paired sum,
and delta(E+M*Phi) against external heat/work. Repeat after adding a large
constant to Phi; physical updates must not change. Do not reconstruct mass
motion from a second velocity field.

Choose and document the kinetic metric, canonical energy quantity and exact
pressure-work flux. If cell-centered momentum replaces the research MAC
representation, make that explicit; do not claim byte-compatible state or
unchanged staggered energy partition. For any staggered candidate, prove the
cell allocation sums to physical dual kinetic energy, including boundary
half-volumes, before applying an Euler cell-positivity argument.

Every transport, gravity, pressure and accepted time stage must have local
receipts. A global total-energy residual alone is insufficient. A known
mass-diffusion potential-work term is allowed only through the declared local
energy equation. No measured residual is redistributed into temperature.

## 2. Pressure equilibrium, positivity and actual progress

Translate a finite density/temperature contact with constant velocity and
constant pressure, zero gravity. Use actual finite mass, momentum and energy,
an independent translated density profile, and a fixed end time. Measure
pressure/temperature extrema, mass/energy error and work alongside density
error. A constant-gamma ideal gas supports this independent reference without
mixing EOS definitions. A later multi-EOS interface needs its own test.

Every admitted state must have positive finite mass and internal energy under
the selected definition envelope. The fixed contact must actually complete;
returning unchanged state forever by rejection does not establish useful
admissibility. Record accepted steps, rejected trials and smallest timestep.
Do not silently clamp negative U or restore a uniform pressure after a step.

Centered transport with retained SSPRK2 is already excluded by its analytic
imaginary-axis instability. No comparator run is proposed. A different
bounded transport or implicit method must bring its own stability argument.

## 3. Hydrostatics appropriate to the selected physical model

The existing reduced low-Mach model has uniform thermodynamic p0 and a separate
dynamic hydrostatic pressure. Constant T therefore means constant rho there.
Its rest oracle cannot be renamed an exact full-compressible isothermal state.

For a full ideal gas at constant T under downward g, the continuous equilibrium
is p(y)=p(0)*exp(-g*y/(R*T)) and rho=p/(R*T). With the current arithmetic-face
gravity/pressure difference stencil, a separate exact discrete equilibrium is

```text
p_j-p_i = -g*h*(rho_i+rho_j)/2
a = g*h/(2*R*T)
p_j/p_i = (1-a)/(1+a),  a<1.
```

This algebra qualifies that stated stencil only. If the native caller has a
different reconstruction/pressure force, derive its actual discrete balance
instead. Test both exact discrete rest and convergence to the continuous
exponential; do not replace the continuum reference with the discrete answer.
Record temperature, pressure, spurious velocity and total energy separately.

## 4. Resolve the previous signed defect, not only its total

Retain the stable-density, small divergence-free circulation discriminator.
Vary velocity amplitude with a fixed smooth density field. The old scheme has
an O(abs(eta)) gravity/PE mismatch while donor kinetic loss is O(abs(eta)^3).
In the new method every mechanical gain must have its specified local internal
energy/work counterpart. Check signed flux attribution and temperature/entropy
effects. Total-energy equality does not by itself establish a physically
accurate exchange; numerical mixing effects must decrease with refinement.

For actual buoyancy, use one bounded moving3D case after rest/contact laws.
The previous1-second,8-cubed result is frozen evidence of the old method.
If choosing an all-Mach model, prepare pressure consistently with that model;
uniform full pressure plus gravity is not a hydrostatic initialization. The
existing epsilon-leading low-Mach acceleration oracle is useful only under an
explicit low-Mach/well-prepared limit. Separate Mach, epsilon, space and time
errors, and do not reuse the old30% energy screen as final physical accuracy.

## 5. Finite heating, pressure work and lifecycle

Use a sealed gas with a named heat receipt and a compression/expansion limit
appropriate to the chosen caller. The old heater-only p0Dot law survives only
where the new mechanical terms vanish or have been consistently neglected.
Pressure correction changes kinetic energy; its coupled energy update must
follow the chosen local pressure-work equation. The diagnostic's large
gravity-kick/pressure cancellation cannot be counted as physical heating.

Save the one canonical state and exact accepted time, definition/model/geometry
identity and external-source receipts. Compare uninterrupted and file-restored
continuations. Reject incompatible gravity, EOS, closure or geometry before
state/clock mutation. Numerical pressure guesses and caches are derived state
only where actual restart convergence supports that claim.

The native event loop, failed-step policy and file dump do not automatically
supply the research caller's atomic advance/retry laws. Determine their
actual behavior before exposing a game-facing operation. Report numerical
steps, linear/outer iterations, allocations and memory separately; no browser
or whole-world performance claim follows from one small native test.

## 6. Room/interface work follows; it is not implicit in a box pass

Interior-solid topology must retain one mass/energy/momentum transport owner
and its actual face metrics. Wall work is zero only for stationary impermeable
walls. Open ports need declared finite mass and total-enthalpy/pressure-work
receipts; a chunk boundary is not an ambient reservoir. Moving water/gas
interfaces need one normal velocity, traction and energy-work authority.
One-phase pressure-work qualification is useful but cannot establish finite
water coupling, excavated-volume displacement, species chemistry or combustion.
