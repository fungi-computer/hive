# Independent oracle for sealed low-Mach heating

2026-09-08. Mathematical/source review for the proposed `finite-low-mach-v1` study. No solver, geometry or proof code was written or changed. The closed-form solution below is derived here, not claimed as an executed qualification.

## Scope and verdict

The proposed equations are correct for **one calorically perfect inert gas with constant gamma**, spatially uniform thermodynamic pressure, fixed sealed volume, prescribed volumetric heating, and negligible kinetic-energy/viscous/gravitational terms in the thermal model:

```
pDot = (gamma - 1) * Qtotal / Vtotal
S(x) = div(u) = ((gamma - 1) * q(x) - pDot) / (gamma * p)
```

Here `q` is W/m³, `Qtotal = integral(q dV)` is W, pressure is Pa and `S` is s⁻¹. A source specified as per-cell `heatJS` is W and must be divided by that cell's volume to become `q`. The fixed gas volume is not a source.

The familiar `rho/rhoInitial = (p/pInitial)^(1/gamma)` describes a parcel that receives no heat or diffusion. It does **not** describe a whole Eulerian cold compartment once hot-origin material flows into it. Use the full solution below, or a genuinely protected far-cold region with a documented reach bound.

The existing thermodynamics owner supports mixtures as well as individual species, but this first formula must not silently admit spatially changing gamma. Select the existing `inert-air` definition alone. That definition gives gamma 1.4 and a 200–600 K envelope.

## Source grounding and first-law derivation

Read sources, relative to this `gas-heat` directory:

- `finite-thermo-v1/checkpoint/thermodynamics.mjs`, SHA `b2a58ea2488b91c8ca49db32bff6e5bdf2734977cd89b14da198d0289cd6db4c`: canonical species masses, volume and internal energy; derived temperature, pressure and enthalpy.
- `finite-thermo-v1/checkpoint/definitions.mjs`, SHA `536a5cd870d3bed14ceda3b21a01110a0b32dcd24b19d93f556d7f5cfca13ff3`: explicit constant capacities and envelopes.
- `transport-v2/checkpoint/solver.mjs`, SHA `14ef3fa8aa65bc0ba58009a9bbdbfb47d345dbe5cdc1e7020bcaacf8f0b2db6b`: existing integrated face divergence and constant-coefficient zero-target projection.
- `nd/geometry.mjs`, SHA `90d2d3e1e0714eab9327108b1cf048a2a0627c28e7e91c79faced9943d971b14`: metric face areas/distances and sealed-component pressure pins.

PeleLMeX's maintained model distinguishes thermodynamic pressure from flow pressure and restores a pressure-rate term to the divergence constraint for confined domains. It also uses a density-dependent projection coefficient. This supports the physical route, not the correctness of Hive's future implementation. [PeleLMeX model, confined pressure and MAC projection](https://github.com/Pele-Suite/PeleLMeX/blob/development/Docs/sphinx/manual/Model.rst).

FDS likewise retains background-pressure change in its sensible-enthalpy equation and derives velocity divergence from thermodynamics. Its source emphasizes that finite species masses and a low-Mach constraint replace the limitations of the original Boussinesq treatment. [FDS governing equations](https://github.com/firemodels/fds/blob/master/Manuals/FDS_Technical_Reference_Guide/Equation_Chapter.tex).

For the narrow constant-gamma model, let `e` denote specific internal energy and `E = rho*e` its density. The ideal-gas relation gives `E = p/(gamma-1)`. With spatially uniform `p`,

```
partial_t(E) + div(E*u) = -p*div(u) + q
pDot/(gamma-1) + gamma*p/(gamma-1) * div(u) = q
```

Integrating over the sealed fixed volume makes the boundary flux vanish, yielding the proposed `pDot`. This does not add a physical pressure-work source at the outer wall: that wall does not move. Internal work is included in the exchange between cells. Dynamic-pressure kinetic effects are outside this thermal approximation; do not claim exact total mechanical-energy conservation.

## Independent spatial oracle: heated left segment

Take a strip of length `L`, constant cross-sectional area `A`, sealed ends `u(0)=u(L)=0`, one gas, and initially uniform `rho0`, `T0`, `p0`. No thermal conduction, species diffusion or gravity. Apply constant Eulerian heating `q0 > 0` in `0 <= x <= a`, with `0 < a < L`, and zero heating elsewhere. Align `a` with a cell face on every refinement grid.

Define:

```
f = a/L
C = (gamma-1) * q0 * f
p(t) = p0 + C*t
R = p(t)/p0
beta = 1/gamma
k = (1-f)/(gamma*f)
b = L-a
```

Direct integration of the divergence—not a Poisson solve—gives:

```
u(x,t) = ((gamma-1)*q0*(1-f)/(gamma*p(t))) * x     x <= a
u(x,t) = (C/(gamma*p(t))) * (L-x)                 x >= a
```

The velocity is continuous at `a` and zero at both walls. It is the independent target for each face at the time that face velocity is defined. Do not compare a beginning-of-step velocity against the endpoint pressure without acknowledging the temporal staggering.

The material interface initially at `a` moves to

```
xFront(t) = L - b * R^(-beta)
```

Only points beyond this front contain exclusively initially cold, never-heated parcels. In that region,

```
rhoCold(t) = rho0 * R^beta
TCold(t) = T0 * R^((gamma-1)/gamma)
```

For a **whole-strip** oracle that also handles hot-origin intrusion, characteristics and continuity give the following exact density:

```
rhoHot(t) = rho0 * R^(-k)

rho(x,t) = rhoHot                                      0 <= x <= a
           rhoHot * ((L-x)/b)^(-1/f)                   a < x < xFront
           rho0 * R^beta                              xFront <= x <= L
```

Derivation: a parcel stays in the heated section while `x(t)=xInitial*R^k`, hence its density falls by `R^-k`. After crossing at pressure `pExit`, its cold-section distance from the right wall scales as `(pExit/p)^beta`; its density subsequently rises by `(p/pExit)^beta`. Eliminating `pExit` produces the middle branch. Both interface limits agree. Initial hot-origin mass remains `A*a*rho0`; initial cold-origin mass remains `A*b*rho0`.

Use **cell averages**, not point samples, when comparing mass. Integrate each branch over the cell interval, splitting at `a` and `xFront`. Constant branches are trivial. For the middle branch, with `n=1/f > 1` and `eta(x)=(L-x)/b`, an antiderivative is

```
F(x) = rhoHot * b/(n-1) * eta(x)^(1-n)
```

Thus middle-branch mass over `[c,d]` is `A*(F(d)-F(c))`. Independently calculate `mExact` from these formulas. Then `rhoAverage=mExact/V`; the corresponding uniform-pressure finite-volume temperature is `p*V/(mExact*Rgas)`. That derived temperature is not an arithmetic average of the continuum temperature.

This stronger oracle avoids pretending that a numerically diffused front leaves an entire named compartment untouched. If a far-cold-only assertion is used instead, require the tested cell to lie beyond `xFront(tEnd)` and account for the numerical stencil: explicit schemes can transmit a small diffusive perturbation farther than the material interface. A geometric buffer alone does not guarantee exact independence after arbitrarily many stages. The full cell-average oracle is preferable for refinement.

Choose a bounded pressure ratio, for example an endpoint `p/p0` near 1.1, then check the actual maximum temperature and Mach number before fixing the fixture. Keep the same physical `L,A,a,q0` and final time across grids. Do not lower power or shorten time after seeing an error merely to make the solution pass.

## Local flux law that prevents an EOS overwrite

For an oriented internal face, compute one signed volume flux `Fv = uFace*area` in m³/s. A first-order donor flux is

```
Fmass = rhoDonor * Fv
Fenthalpy = hDonor * Fmass
hDonor = (UDonor + pDonor*VDonor)/mDonor
```

Apply equal-and-opposite receipts to the adjacent cells. The local update for internal energy in this fixed-volume, uniform-thermodynamic-pressure case is

```
mNew_i = mOld_i - dt * sum_outward(Fmass)
UNew_i = UOld_i + Q_i*dt - dt * sum_outward(Fenthalpy)
```

For the uniform-pressure constant-gamma state, `rho*h = gamma*p/(gamma-1)`. With the correct target divergence, the actual flux update consequently yields

```
DeltaU_i = V_i * pDot*dt/(gamma-1)
```

This relation is a **check on the computed source and enthalpy exchange**, not an assignment that may replace them. Derive pressure from the resulting masses/U/volume with the existing owner and measure agreement. Do not add `V*pDot*dt` a second time: that term belongs in an evolved-enthalpy equation, whereas the expression above already updates internal energy using enthalpy fluxes. Advecting only `U/V` instead of enthalpy omits pressure work; advecting enthalpy and separately charging the same intercell pressure work double counts it.

The smallest useful local fixture is three equal cells, only the first heated, initially uniform. Let `dx=L/3` and `C=(gamma-1)*q0/3`. The independent face velocities are

```
[0, 2*C*dx/(gamma*p0), C*dx/(gamma*p0), 0]
```

Compute each face's mass and enthalpy transfer directly from those numbers. Check all three local `DeltaU`, both face receipts, global unchanged mass, and global `DeltaU=Qtotal*dt`. On later steps the first cold cell receives hot-origin material; it must not be forced to have the same density as the far cold cell. A single-step update can be checked to rounding against its declared discrete rule, while multi-step accuracy must be measured against the continuum oracle and timestep refinement.

Also keep the uniform-heating limit: equal `q` everywhere gives `S=0`, zero flow, fixed cell masses, and uniform pressure/temperature increase. Correct pressure alone cannot demonstrate correct transport.

## Pressure coefficient and compatibility checks

The old solver's `project` uses `area/distance` and targets zero integrated divergence. It must not be reused unchanged under a new name. With pressure correction `pi` in Pa and face reciprocal-density approximation `betaFace`,

```
uNew_f = uStar_f + dt * betaFace * (pi_i-pi_j)/distance_f
K_f = dt * betaFace * area_f/distance_f
L(pi)_i = sum_neighbors K_f*(pi_i-pi_j)
L(pi) = V*S - integratedDivergence(uStar)
```

The right-hand side has units m³/s, not s⁻¹. The same positive `K_f` must appear in the matrix and the velocity correction. Declare the density interpolation. One finite-volume choice is distance-weighted harmonic averaging of `1/rho`, giving `K=dt*A/(dLeft*rhoLeft+dRight*rhoRight)`; this is a specific discretization decision, not a license to use inconsistent coefficients in different callers. A pressure-impulse unknown can omit explicit dt from the coefficient only if its units and correction are changed consistently.

For every sealed connected component, `sum_i V_i*S_i` must be zero within a scaled tolerance. Compute pressure rate from that component's actual volume and heat. Reject unsupported disconnected domains for the first one-strip scope, or use the correct separate closure; one pressure rate across disconnected chambers is wrong. A gauge pin is a linear-solver convention. Do not zero an incompatible pinned-cell residual and silently accept a mass source. Check the final divergence residual in **every** fluid cell, including the pinned one.

The 1D heating velocity is fixed by continuity and the walls, so it does not by itself test density-dependent pressure mobility. Add one separate local check: nonuniform positive cell densities at common thermodynamic pressure, zero target divergence, and a prescribed nonzero provisional internal-face velocity. In a sealed 1D strip the corrected flow must be zero. Each pressure jump must satisfy

```
pi_i - pi_j = -FvStar_f / K_f
```

This independent face relation detects a constant-coefficient Poisson solve masquerading as the variable-density one. Keep temperatures within the actual gas definition when constructing those densities.

## Admission, timestep and honest outcome

Before a stage: finite positive masses, volumes and internal energies; one supported constant-gamma gas; uniform initial thermodynamic pressure to a declared tolerance; finite prescribed heat; fixed metric/topology identity; correct sealed boundary; and representable clock increment. Sources must be evaluated at the declared stage time, with exact event cutoffs.

For explicit donor transfer, bound each cell's outgoing volume fraction. Energy admission is stricter than passive-mass advection because enthalpy contains `gamma` times internal-energy density: a conservative bound includes `gamma*dt*sum(outgoing Fv)/V` and any negative-heat fraction `dt*max(-Q,0)/U`. Select the safety factor before qualification. Enforce positive endpoint pressure and the 200–600 K envelope. Halving dt does not make an endpoint outside the physical definition valid; report that limit instead of looping toward zero time.

Measure independently: total and per-cell mass/enthalpy/heat receipts; pressure-vs-energy consistency; target-divergence residual; positivity; exact source power/clock; and cell-average density error under refinement. Uniform pressure and `U/V=p/(gamma-1)` can be algebraically exact in a first-order update while mass advection is still inaccurate. Do not let that easy invariant substitute for the spatial comparison.

This qualifies finite-mass, fixed-volume, sealed, inert, one-dimensional expansion/compression driven by nonuniform heating. It does not qualify gravity/buoyant plumes, 3D momentum/advection, vorticity, heat conduction, species diffusion, changing gamma, combustion, open vents, multiple pressure regions, acoustic shocks or moving voxel boundaries. Existing frozen 3D Boussinesq evidence remains evidence for that older model only. No new framework or production integration follows from this note.
