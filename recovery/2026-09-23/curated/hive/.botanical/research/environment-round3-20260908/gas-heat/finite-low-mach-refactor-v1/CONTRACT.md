# First finite spatial gas closure — proposed source contract

2026-09-08. Root accepted the algorithm; the first source shape is now awaiting
independent review before qualification. Older thermodynamic, spatial, voxel and
viewer sources remain unchanged.

## Narrow physical question

Can one sealed, fixed-volume, nonuniformly heated inert-gas strip retain finite
cell mass and internal energy while satisfying uniform thermodynamic pressure,
developing different temperatures/densities, and compressing unheated material?
This is a kinematic expansion/transport closure, before a finite-density momentum
join. It is not excavation, an atmospheric reservoir, a room-pressure shortcut,
combustion, or completed three-dimensional Navier–Stokes dynamics.

The physical reference is one constant-gamma species chosen from the frozen
constant-capacity definitions. No species-name equation branches. Spatial mixing
of species with different capacities is not admitted by this constant-gamma step.
Outer walls are impermeable and insulating, with the inviscid/slip-wall limiting
interpretation. No gravity, conduction, diffusion, viscosity, chemical energy or
kinetic-energy stock is included. Acoustic transients are filtered; uniform
thermodynamic pressure is the low-Mach assumption, not instantaneous density or
temperature mixing.

## Actual owners read

- `../transport-v2/checkpoint/geometry.mjs` owns ND cells, face orientation/global
  identities, areas/distances, solid/open/wall topology and pressure pins. Its
  numerical `diagonal` is constant-coefficient; it must not be reused as a
density-dependent pressure diagonal.
- `../transport-v2/checkpoint/solver.mjs` currently embeds matrix-free PCG and
  zero-target projection in the same file as Boussinesq momentum/advance. Its
  projection uses unit face coefficient, fixed numeric diagonal and no explicit
  per-component target-compatibility admission.
- `../transport-v2/checkpoint/transport.mjs` owns Boussinesq anomaly/tracer MC
  transport. Its reference-density thermal shift is not finite internal energy;
  it will remain the Boussinesq consumer, not be relabeled as carrier mass/U.
- `../finite-thermo-v1/checkpoint/{thermodynamics,definitions}.mjs` owns finite
  masses/V/U, full definition identity and derived T/rho/p/cp/cv/H. Its 200–600 K
  envelope and floating arithmetic limits continue to apply.

The independently checked [PeleLMeX model source](https://github.com/Pele-Suite/PeleLMeX/blob/development/Docs/sphinx/manual/Model.rst)
separates thermodynamic pressure from flow correction, derives a confined-domain
pressure derivative, and uses a density-weighted MAC projection. Its actual
transport/momentum coupling is considerably richer than this restricted first
reference. No upstream solver is imported or represented as implemented here.

## Independent derivation of the limiting equations

Let `E=rho*e` be internal energy per physical volume. For one constant-gamma ideal
gas with uniform thermodynamic pressure `p(t)`, `E=p/(gamma-1)`. The local internal
energy equation, including pressure work and external volumetric heat `q`, is

```
partial_t(E) + div(E*u) = -p*div(u) + q
partial_t(E) + div((E+p)*u) = q       [grad(p)=0]
therefore pDot + gamma*p*div(u) = (gamma-1)*q.
```

Integrating over fixed sealed volume makes boundary flux vanish:

```
pDot = (gamma-1) * Qtotal / Vtotal
S = div(u) = ((gamma-1)*q - pDot) / (gamma*p).
```

For an unheated material parcel, continuity gives
`D log(rho)/Dt = -S = pDot/(gamma*p)`. Thus
`rho/rho0 = (p/p0)^(1/gamma)`. This is **not** the average density of the complete
Eulerian unheated compartment once hot-origin material advects into it.

For a strip `0 <= x <= L` with constant heating on `[0,a]`, the independent velocity
is a direct integral, with no pressure solver in the oracle:

```
u(x,t) = integral_0^x ((gamma-1)*q(s)-pDot)/(gamma*p(t)) ds.
```

The former heater edge is a material front after crossing into the unheated side.
Writing `r=p/p0`, `f=a/L`, `b=1/gamma` and `k=(1-f)/(gamma*f)`, its position is
`xf = L-(L-a)*r^(-b)`. The exact no-diffusion density profile is

```
rhoH = rho0*r^(-k)
rho(x) = rhoH                                  x <= a
         rhoH*((L-x)/(L-a))^(-1/f)             a < x < xf
         rho0*r^b                              x >= xf.
```

This follows by integrating the cold-side characteristic
`L-x(t)=(L-a)*(r_birth/r(t))^b` and its adiabatic density change. It joins
continuously at both ends. Integrating each piece over a finite-volume cell gives
an independent cell-average oracle; for `f=1/2` the middle antiderivative uses
`1/(L-x)`. The cold probe stays physically beyond the material front, while the
full-profile error also exposes numerical donor-cell smearing.

## Small source shape proposed

`projection.mjs` extracts the actual matrix/PCG correction into one owner used by
both isolated consumers:

```
project(g, predictedFaceVelocity, {
  targetVolumeFlux: Float64Array(g.n),  // S_i*V_i, m3/s, default zero
  faceCoefficient: Float64Array(g.faces.length) // beta_f, default one
})
```

For finite gas, `beta_f = 2/(rho_i+rho_j)` at interior faces. The operator weight is
`beta_f * area_f / distance_f`; projected velocity adds
`beta_f*(phi_i-phi_j)/distance_f`. Consequently `L_beta phi = target - D(u*)`, with
`D` returning integrated volume flux, not a dimensionless divergence. Fixed
Dirichlet exterior corrections and sealed component pins retain their existing
meaning. Every closed component's RHS must be compatible **before** dropping its
pinned equation; never subtract an arbitrary mean to conceal impossible flux.

The internal `geometry-owner.mjs` first recompiles the supplied canonical descriptor
with the frozen geometry compiler, verifies the exact identity and retains its own
geometry. All finite, projection and Boussinesq entry points use that same private
snapshot. External source face/cell/solid/stencil mutations cannot change the bound
numerics; actual edits require a new descriptor and state admission. No public
finite/Boussinesq result exposes the snapshot. Internal trusted numerical modules
borrow it without mutating it; the outer freeze alone does not protect typed arrays.

Only topology/pin/component and scratch structures are cached numerically. Every
projection/RK stage rebuilds the coefficient-dependent diagonal and weights. Input
velocity/target/coefficient arrays are checked and borrowed only during the call;
outputs use the existing copied-or-borrowed-scratch convention. Coefficient builds,
solves, PCG iterations, matrix products, residual and all-cell constraint error are
counted. The compatibility legacy transport export also binds this private geometry
before calling the single frozen transport implementation.

`boussinesq-reference.mjs` is an isolated copy of the existing immediate caller,
delegating its existing zero-target, beta=1 projection to this owner. Its embedded
old matrix/project implementation and pressure scratch are removed. Frozen
momentum/transport/geometry inputs remain unchanged. A focused equivalence check
compares its actual advance with the frozen reference. There are not two candidate
pressure rules.

For the finite-density consumer the unknown `phi` is **pressure impulse in Pa·s**,
with dt absorbed into it. The legacy beta=1 consumer retains its velocity-potential
scaling; it does not reinterpret that constant-coefficient potential as Pa.

`finite-gas.mjs` uses the same projection and frozen thermodynamic owner. Canonical
state contains finite per-cell mass and U, geometry/definition/species identity,
clock and explicit source/balance facts. Pressure is derived from existing cell U:
`p=(gamma-1)*sum(U)/sum(V)` in the one connected sealed domain. There is no saved
authoritative room pressure or room inventory. Geometry changes and foreign
definitions reject before physical state/clock/source mutation.

Each forward-Euler stage performs:

1. Read finite cell thermodynamics; check positive stocks, definition envelope and
   local EOS consistency against derived p. Assemble cell heat in W and pDot.
2. Project the zero provisional velocity to `V_i*S_i`. This only selects the
   expansion constraint flow; in the one-dimensional strip the sealed-wall
   velocity is uniquely fixed by its integral. It is not a general momentum model.
3. On each interior face, take one donor density and temperature. With
   `q_f=u_f*A_f`, use `massRate_f=q_f*rho_donor` and the same donor's specific
   enthalpy `h_donor=cp*T_donor`. Record `enthalpyRate_f=massRate_f*h_donor` once.
   Apply equal/opposite mass and enthalpy transfers to the two cells, then external
   cell heat to U. Closed exterior faces have no transfer.
4. Validate the candidate without assigning U from a desired final EOS. Reject
   unsupported/nonfinite/negative/envelope-breaking states. Any floating balance
   residual is measured, not silently declared zero.

Because `rho*h=gamma*p/(gamma-1)` in this particular single-gas reference, the
discrete target constraint yields

```
Delta U_i = Q_i*dt - dt*sum_outward(massRate*h)
          = Q_i*dt - dt*gamma*p/(gamma-1)*V_i*S_i
          = dt*V_i*pDot/(gamma-1).
```

Uniform EOS follows from **actual local enthalpy transfers and heat**, rather than
a final uniform-U overwrite. A three-cell one-hot/two-cold receipt fixture can
check this local law independently before the longer strip comparison.

Two such stages form SSPRK2; the second stage recomputes p, density coefficients,
projection and fluxes from the first stage's finite state. Average the two sets of
face/source receipts consistently with the SSPRK2 state. This qualifies temporal
behavior of the constrained finite transport, not second-order coupled momentum.
First-order donor spatial reconstruction is declared openly.

The timestep bound includes positive-mass outflow and gamma-weighted outgoing
enthalpy plus signed cooling loss. The supported step is conservative and positive
under its declared CFL; failure preserves the input. A named **new intermediate
Euler stage** temperature-envelope overshoot may reduce dt: its t+2dt provisional
endpoint can exceed the model envelope even when the averaged t+dt state is valid.
Invalid initial state, structural identity, EOS, balance and linear-solver failures
are fatal. A requested bulk endpoint outside the definition envelope rejects before
work; the bulk condition is necessary, not sufficient for nonuniform temperature.
Neither retry nor admission clamps heat. Requested versus stored floating joules
remain distinct; report residuals at the actual ~kJ/cell scale. No finite heat donor
is debited.

## Initial proof budget and criteria proposed

One guarded invocation under 30 s, no browser, large room run, moving boundary or
3D momentum expansion. The main fixture is the existing ND two-dimensional metric
constructor: size `[32,2]`, spacing `[0.25,0.54]`, extrusion 1 m; a physical
8×1.08×1 m chamber. Initially 100 kPa, 300 K; heat 1,000 W/m³ on x<4 m for 100 s.
Total heat is 432,000 J, pDot=200 Pa/s, final p=120 kPa. The hot-origin front remains
below 4.49 m; cold probe cells x≥7 m are separated by more than 2.5 m from it.

Use dt maxima 4/2/1 s on the **same geometry/source/physical interval**. Report
temporal cold-probe error, full exact-cell-average density error, pressure/heat,
mass, local EOS and constraint errors, solver work/CPU/time and floating receipts.
The far-cold law should show temporal convergence; the full profile also contains
fixed-mesh spatial error and cannot be advertised as pure temporal convergence.

Supporting bounded exits: rest, per-component incompatible target rejection,
density-weighted projection against an independently prescribed potential,
coefficient invalidation, ordinary constant-coefficient consumer agreement,
individual mass/enthalpy receipts, exact JSON/file restart and rejected foreign or
unsupported state. No geometry edit and no default ambient inflow.

## Fixed admission and qualification thresholds before execution

- PCG absolute residual: 1e-13 m³/s; iteration cap `6*n+100`. Postprojection
  integrated flux residual including the gauge cell: at most 1e-10 m³/s.
- Sealed compatibility before pinning: absolute component RHS sum at most
  `1e-12 * max(1, sum(abs(target))+sum(abs(provisional integrated flux)))` m³/s.
  This accepts floating roundoff only; no mean is removed.
- Stage outgoing enthalpy/cooling coefficient: at most 0.45. At most 12 CFL or named
  virtual-stage-envelope halvings per accepted step. No catch-all error retry.
  The isolated finite study admits at most 512 cells and 2,048 accepted steps per
  advance; callers may request a smaller step budget. These are work budgets,
  not physics rules. Exhaustion discards the candidate and preserves the caller's
  original state/clock/ledgers. Positive intervals that round to unchanged time
  reject. All 4/2/1 s main cases are expected to need no retries.
- Local EOS relative discrepancy: at most 5e-10. Total mass balance tolerance is
  `1e-12 kg + 2e-13*initialMass`; internal-energy balance tolerance is
  `1e-8 J + 2e-13*max(initialU,abs(accumulatedHeat))`. Actual residuals are reported
  without forcing zero or modifying stocks.
- Independent pressure relative error: at most 1e-9; source heat absolute error
  at most 1e-6 J. Independent face velocity error at its **stage evaluation time**:
  at most 2e-10 m/s. Unequal-density impulse jumps: at most 2e-10 absolute scaled
  error; legacy Boussinesq state arrays agree within 1e-9 absolute.
- Whole-strip exact-cell-average relative L1 mass error: below 0.02 at each of
  dt 4/2/1 s. This is a bounded first-order spatial result, not second-order space.
  Far-cold finest relative density error below 1e-6 and successive timestep-error
  ratios between 3 and 5 are the proposed temporal exit. The far-cold error still
  includes numerical diffusion; its geometric separation alone does not remove
  that effect. Full-profile errors remain separately visible.
- Maximum accepted temperature stays inside 200–600 K and diagnosed face Mach
  number below 1e-3 for the stated low-speed fixture. All stocks/receipts finite,
  solids unchanged, zero outside mass/enthalpy exchange, actual file restart exact.
- One numerical invocation must complete within 30 s measured wall time. No
  power/interval/layout change is allowed merely to turn an observed failure green.
