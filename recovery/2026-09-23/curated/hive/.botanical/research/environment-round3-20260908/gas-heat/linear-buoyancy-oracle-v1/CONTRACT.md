# Independent initial buoyancy oracle

Root-owned mathematical reference, 2026-09-08. Source-only until its independent
check runs. This is neither a second gas owner nor an external force applied to
the finite gas solver. It supplies initial density and the **leading small-density-
contrast initial acceleration**, with analytic physical-volume averages.

Let x/z be periodic and y in [0,H] have sealed free-slip walls. Set
`kx=2pi/Lx`, `ky=pi/H`, `kz=2pi/Lz` (or0 for a 2D invariant extrusion),
`q=cos(kx*x)*sin(ky*y)*cos(kz*z)`, `rho=rho0*(1-epsilon*q)`.
Initially u=0; thermodynamic pressure is constant and U=p0*V/(gamma-1).
Gravity is the existing owner's actual `-g*ey`. No heater or manufactured
force replaces it.

Write the perturbational pressure as the background hydrostatic contribution
`-rho0*g*y` plus `pi_b`. Expanding the variable-density Euler equation to first
order in epsilon gives `a = g*epsilon*q*ey - grad(pi_b)/rho0` and `div(a)=0`.
The impermeable boundary requires a_y=0 at y=0,H. Thus

```
K2 = kx^2 + ky^2 + kz^2
pi_b = -rho0*g*epsilon*ky/K2 * cos(kx*x)*cos(ky*y)*cos(kz*z)
a_x = -g*epsilon*ky*kx/K2 * sin(kx*x)*cos(ky*y)*cos(kz*z)
a_y =  g*epsilon*(kx^2+kz^2)/K2 * cos(kx*x)*sin(ky*y)*cos(kz*z)
a_z = -g*epsilon*ky*kz/K2 * cos(kx*x)*cos(ky*y)*sin(kz*z)
```

Products separate by axis, so each box average replaces sin/cos by its midpoint
value times sinc(k*width/2). Density is a cell average; momentum acceleration
is averaged on the actual component control volume. A point or face has zero
width along its corresponding axis. `averages` is the analytic continuation;
the physical caller owns containment and boundary-face selection.

The unexpanded physical initial acceleration evaluated with this first-order
pressure differs at order epsilon^2. Finite-time advection and numerical
spatial/temporal errors are separate. A caller must compare amplitude and mesh
refinement at a declared short horizon, report error floors and avoid claiming
an exact nonlinear or all-time solution. It must not inject this acceleration
as a body-force callback: doing so would bypass the density/gravity coupling
that this experiment is supposed to test.

Root's check uses independent tensor Gauss quadrature of pointwise expressions,
finite differences of scalar pressure, acceleration divergence, wall values and
the order of the unexpanded variable-density momentum residual. No numerical
solver, grid or candidate pressure result supplies the expected values. Parameter
snapshots and invalid-reference rejection are included. Maximum10s, no browser.
