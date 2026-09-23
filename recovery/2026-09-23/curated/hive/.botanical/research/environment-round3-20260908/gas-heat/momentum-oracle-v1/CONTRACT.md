# Independent cyclic-flow oracle

Root-owned continuous reference for the separate finite-momentum candidate.
No numerical gas advance, state, mesh, pressure solve or transport residual is
imported here. A successful oracle check does not qualify that candidate.

On a periodic box of lengths L, k_a=2*pi/L_a, define

    u_a = A(t) sin(k_b x_b), b=(a+1) mod 3
    A(t) = A0 cos(omega t)
    pi = rho B cos(k_x x) cos(k_y y) cos(k_z z).

Each velocity component is independent of its own coordinate, so div(u)=0.
The other two components cause genuine cross-axis advection. For c=(a+2) mod3,

    (u dot grad)u_a = A² k_b cos(k_b x_b) sin(k_c x_c)
    f_a = partial_t u_a + (u dot grad)u_a + partial_a pi/rho.

This is the body acceleration needed by the inviscid constant-density Euler
equation. It is a prescribed mathematical fixture, not a game wind model. The
underlying momentum equation agrees with the already checked low-Mach primary
[PeleLMeX model](https://raw.githubusercontent.com/Pele-Suite/PeleLMeX/development/Docs/sphinx/manual/Model.rst).
This specific cyclic solution and its averages are our derivation.

The average of sin(kx) over a centered interval of width h is
sin(k*x_center)*sinc(k*h/2); similarly for cosine. Products separate over the
three coordinates. The sampler returns exact box averages of velocity,
momentum density, acceleration, pressure, pressure gradient and kinetic-energy
density. Zero width samples a point or a lower-dimensional face. The intended
staggered momentum comparison uses the actual dual-cell box, including the
normal-direction width, not an arbitrary point sampled at the face center.
The kinetic average uses the integral of sin², not the square of average u.

The finite solver owns its geometry and maps each actual control volume to this
sampler. It must not confuse cell-average pressure with point pressure when
reporting truncation error. Projection phi is a stage impulse; a continuum
pressure comparison must name stage time/weight and cannot treat a final
constraint correction divided by dt as an endpoint pressure measurement.

Pinned proposed case: L=[4,2.16,4]m, A0=.04m/s, omega=1/s,
B=.001m²/s², rho=100000/(R*300)kg/m³ using the candidate's checked gas R.
No state or recipe identity is shared with the numerical method.

Root will check analytic averages against independently evaluated tensor
quadrature of point fields, and derivatives against finite differences of the
continuous fields. These checks validate the oracle only. The actual finite
momentum source, convergence and mechanical budgets remain separately owned.
