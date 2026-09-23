# Independent closed-tank standing-wave oracle

Root-owned mathematical reference, not a fluid solver. The water author derived
the same two-layer dispersion independently before seeing this implementation.
No source/rerun permission for the numerical basin follows from this oracle.

Let flat interface y=0, lower water depth h_w, upper air depth h_a, tank width L,
rigid slip boundaries, gravity downward, rho_w>rho_a, and unit out-of-plane depth.
For the fundamental k=pi/L, the interface perturbation is
eta=a cos(kx) cos(omega t), with initially zero velocity. Its dispersion is

    omega^2 = (rho_w-rho_a) g k /
              [rho_w coth(k h_w) + rho_a coth(k h_a)].

Potentials are

    phi_w = -a omega/k * cosh[k(y+h_w)]/sinh(k h_w) * cos(kx) sin(omega t)
    phi_a = +a omega/k * cosh[k(h_a-y)]/sinh(k h_a) * cos(kx) sin(omega t).

Velocity is grad(phi), and the Eulerian pressure perturbation is
delta_p=-rho*d(phi)/dt. At the displaced interface, first-order pressure
continuity requires delta_p_w-rho_w*g*eta = delta_p_a-rho_a*g*eta. That condition
yields the dispersion relation above. Both interface vertical velocities equal
eta_t; wall normal velocities vanish; each potential satisfies Laplace's
equation. These are independent differential/boundary checks for the oracle.

Integrating quadratic kinetic energy over the **flat phase domains** gives
K=E0 sin^2(omega t), while gravitational energy above the flat surface is
PE=E0 cos^2(omega t), with E0=(rho_w-rho_a)*g*L*a^2/4 J per metre depth.
This is the linear-wave perturbation energy, not a promise of exact finite-
amplitude Navier-Stokes energy or an initialization pressure override.

The proposed caller fixture has L=1m, h_w=h_a=.54m, densities1000/1.2kg/m3,
g=9.81m/s2 and a=.002m. The caller shifts its physical y by -.54m before asking
for flat-domain field values. Actual VOF interface geometry, represented initial
amplitude and solver timestep belong to the numerical caller. Compare its signed
mode to mode(t) at its actual fraction-field time. Its velocity and fraction
are staggered: reference K and PE must be evaluated at their respective times;
their staggered numerical sum is not a simultaneous conserved Hamiltonian.

The module bounds both a/min(depth)<=.01 and ka<=.01, and requires finite
positive derived scales. Those are a reference envelope, not a universal
finite-amplitude error guarantee. It accepts explicit SI definitions, snapshots them, and
returns pure field/mode queries. It has no state update, pressure projection,
forcing callback or water/gas stock. A larger wave needs nonlinear reference
analysis; this oracle cannot validate breaking, splashing, a ledge or dry fronts.
