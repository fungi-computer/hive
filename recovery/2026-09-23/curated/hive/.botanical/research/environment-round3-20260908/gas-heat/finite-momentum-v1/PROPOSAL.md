# Finite gas momentum: bounded algorithm decision

**Status: proposal only, 2026-09-08. No new solver, physical run, source modification or deployment.** Root retains the physical/algorithm decision. This directory contains only this note and a source inventory. Both accepted finite checkpoints and all previous geometry, world, scalar and visual evidence remain frozen.

Recommendation: extend the accepted finite mass/internal-energy stage with **conservative staggered momentum**, derived from the same mass transfers. Persist face-integrated momentum; derive velocity from momentum divided by a geometrically defined dual-cell mass. Reuse the checked variable-coefficient pressure projection. Start with full rectangular periodic/sealed boxes and an inviscid single gas. Arbitrary obstacles, openings, viscous stress, topology changes and buoyant-room conclusions remain outside the first checkpoint.

## Actual owners read

- `../finite-low-mach-refactor-v1/finite-gas.mjs`: canonical mass/U and balance references; `fields`, `validate`, `euler`, `admitAdvance`, `rungeKuttaTrial`, `acceptTrial`, codec. The current Euler caller projects an all-zero provisional face field to the heating divergence. It computes one signed mass/enthalpy receipt per face. This is a qualified expansion reference, not persistent momentum. Its SSPRK2 averaging is over canonical stocks and its pressure is derived from total U.
- `../finite-low-mach-refactor-v1/projection.mjs`: private reusable topology, copied target and positive face coefficient, numeric diagonal rebuilt per solve, sealed-component compatibility before gauge fixing, PCG and all-cell flux residual. Its correction is `u_new = u_star + beta*(phi_i-phi_j)/distance`. With beta=1/rho, phi has units Pa·s. This remains the pressure equation owner.
- `../finite-low-mach-refactor-v1/geometry-owner.mjs`: private reconstruction from the canonical descriptor; caller mutation of exposed arrays is not physical geometry mutation. Keep this binding.
- `../finite-low-mach-refactor-v1/boussinesq-reference.mjs`: persistent velocity currently advects through `advector`, `neighbor`, `momentumRate`, `predict`, then `project` and scalar `transport`. Its nonlinear term updates velocity directly; gravity is replaced by a temperature-anomaly acceleration using fixed RHO/CP/TREF. Those equations cannot be the new finite-density momentum owner. The old predictor and its no-slip ghost relations remain only in the frozen comparison consumer.
- `../transport-v2/checkpoint/transport.mjs`: bounded MC reconstruction/SSPRK2 for smoke and anomalous heat at fixed reference-air density. Its scalar flux receipt cannot serve as finite carrier mass. Do not call it to move the new density or create another independent thermal stock.
- `../transport-v2/checkpoint/geometry.mjs`: one 2-D/3-D face/metric/index owner, x-fastest cells, world y vertical, actual areas/distances, periodic canonical faces, omitted sealed boundary faces. `stencil` and `cross` describe velocity sampling/ghosts, not a conservative map from primal to momentum control-volume flux. That missing derived geometry must be built explicitly.

Source hashes are in `source-inventory.json`; all immediate numerical readers above were inspected. None is edited by this proposal.

## Primary method references and their limits

[PeleLMeX's checked model](https://raw.githubusercontent.com/Pele-Suite/PeleLMeX/development/Docs/sphinx/manual/Model.rst), low-Mach equations, confined pressure and projection sections: thermodynamic pressure and flow-driving pressure have different roles; velocity, conservative scalars and the variable-density projection are coupled. Its full SDC/Godunov implementation is substantially more elaborate than this proposed reference. We do not infer our accuracy from its results.

[Donev et al., *Low Mach Number Fluctuating Hydrodynamics of Diffusively Mixing Fluids*](https://math.nyu.edu/inmemoriam/donev/FluctHydro/LowMachMixing.pdf), sections III A–B and IV: conservative staggered momentum can be converted to velocity with arithmetic face density; projected Euler stages can form explicit higher-order integrators. Their EOS, diffusion and stochastic model differ from our heated ideal gas. We use the deterministic projected-stage construction as a reference, not their stochastic terms or EOS corrections.

[Nangia et al., *A robust incompressible Navier–Stokes solver for high density ratio multiphase flows*](https://arxiv.org/abs/1809.01008): conservative momentum must use mass flux consistent with the mass equation. This motivates an explicit shared-transfer law; the multiphase/interface solver, limiter and performance claims are not imported.

The equations, discrete transfer identities and fixture choices below are this proposal's derivations for the restricted current model. They require root/source review and actual qualification.

## Physical equations and the energy approximation

For one constant-gamma gas, fixed geometry and uniform thermodynamic p0(t), use:

```text
∂t rho + div(rho u) = 0
∂t(rho u) + div(rho u ⊗ u) = -grad(pi) + rho g
∂t E + div((E + p0) u) = q
E = rho e = p0 / (gamma - 1)
p0Dot = (gamma - 1) * integral(q dV) / V
div u = S = ((gamma - 1)*q - p0Dot) / (gamma*p0)
```

The last two equations are the already qualified sealed thermal closure. The mass/U model stays authoritative. Gravity is a real force `rho*g`; it is not `g*(T-Tref)/Tref`, and there is no constant-density inertia under variable-density scalars. Thermal expansion changes density; pressure and gravity act through that actual density.

The retained thermal equation omits perturbational-pressure work, viscous heating and conversion of resolved kinetic dissipation to heat. It is a low-Mach thermal approximation, **not exact conservation of U+kinetic+gravitational energy**. The thermodynamic p0 work is already in the enthalpy face flux; do not additionally add `V*p0Dot` or a second `-p0 div(u)` term to the cell-U update.

With no viscosity, the continuum mechanical balance is:

```text
d(K + potentialEnergy)/dt = integral(pi * S dV)
```

for a sealed stationary wall or periodic gravity-free domain. Thus even the limiting thermal model does not generally conserve U+K+PE when S is nonzero: the omitted `pi*S` coupling must be disclosed and bounded. With S=0, the inviscid mechanical budget should converge toward conservation. Upwind momentum transport and a finite-tolerance projection introduce additional numerical dissipation/residual. None may be hidden by changing U to make an energy report look exact.

Record separate K, gravitational PE, source U, advective momentum, gravity impulse, pressure impulse, wall reaction and mechanical residual. Derive K from momentum/dual mass and PE from physical cell mass and a fixed potential datum. Pressure-impulse work has an exact discrete operation diagnostic: at fixed dual mass, `deltaK = 0.5*(u_before+u_after)*deltaP`. Record the SSPRK2 averaging change in K separately; nonlinear kinetic energy is not the average of stage kinetic energies. PE change follows the same physical mass receipts: each face contributes `dt*Fmass*(potential_j-potential_i)`. Gravity-work/PE cancellation is a convergence test, not an asserted exact property of explicit splitting.

First-fixture approximation report: maximum Mach, pressure-impulse rate range divided by p0, hydrostatic `rho*g*height/p0`, temperature range and numerical mechanical residual. Proposed fixtures keep Mach below 0.01, pressure-scale ratios below 0.001 and temperatures within the retained 200–600 K definition. These are the declared study envelope, not a final game policy. Deep atmospheric stratification needs a hydrostatic background model instead of pretending uniform p0 remains adequate.

## Canonical state and one transfer owner

Add one canonical `faceMomentumKgMS` array on active physical faces. A face's control volume is the two adjacent half-cells, not another saved gas parcel. For an interior/periodic face on this uniform rectangular mesh:

```text
dualVolume_f = V
dualMass_f = (mass_i + mass_j)/2
rhoFace_f = dualMass_f / dualVolume_f
velocity_f = momentum_f / dualMass_f
beta_f = dualVolume_f / dualMass_f = 1/rhoFace_f
```

Persist momentum **or** velocity, not both. Momentum is recommended because transport and SSPRK2 average conserved quantities; velocity remains persistent physical motion derived from that stored momentum. Derived dual mass is rebuilt from canonical cell masses. It never becomes an independently advected/saved density field. Along each fully periodic face family its dual masses partition total physical mass; do not sum all three families and claim three times as much air exists.

The new state gets a new explicit method version/identity. It cannot silently decode old no-momentum saves as moving gas or auto-initialize momentum after digging. Initial conditions accept a checked velocity field once, derive momentum, and require it to satisfy the declared initial constraint. Any explicit initial constraint projection must report its impulse. Domain/definition/gravity-model identity, quantity shape, finite stock/clock, pressure residual and energy approximation remain checked.

For each Euler stage compute the accepted primal `Fmass_f = rho_donor * u_f * area_f` exactly once, then `Fenthalpy_f = Fmass_f * h_donor`. Both consumers retain the same signed donor decision and face identity. This is the finite owner's existing behavior; expose its stage receipt as a private shared result rather than recomputing mass in a momentum helper.

### Dual momentum transport identity

Let R map primal cell masses to arithmetic dual masses and D/Ddual be signed outgoing-flux sums. Build a linear local map L from primal mass fluxes to dual-boundary mass fluxes satisfying:

```text
Ddual * L(Fmass) = R * D(Fmass)
dualMass(new) = dualMass(old) - dt * Ddual(L(Fmass))
```

On a full uniform rectangle, an a-velocity dual face normal to a at a primal-cell center uses half the two adjacent a-normal primal fluxes. A dual face normal to b != a uses half the b-normal flux from each neighboring primal cell. Periodic lookups wrap through the existing canonical face IDs. The same dual boundary is constructed once and supplies equal/opposite momentum receipts to its two dual volumes.

Momentum flux is `Fmomentum = FdualMass * upwind(componentVelocity)`. No second interpolation of density is allowed in that flux. A uniform velocity component is therefore preserved under moving nonuniform density: the momentum update is that same constant times the dual mass update. This algebraic identity is the first nonnegotiable qualification; approximate visual similarity is insufficient.

The initial method uses first-order donor velocity and the already accepted donor physical mass transport. It does not promise nondissipative kinetic energy or reuse the separate Boussinesq MC scalar path. Once this coupling is qualified, a later reconstruction change must alter shared mass/momentum reconstruction consistently.

## Proposed projected-stage ordering

Retain the current request-admission/atomic-result/halving owner. Extend its Euler trial with physical momentum; replace its zero-provisional projection call. For Q constant over an admitted interval:

1. Validate mass/U/P and derive fields, p0, S, dual masses and velocity. The committed stage velocity must already satisfy S; source changes are explicit event boundaries. A discontinuous change in S may require an explicitly recorded low-Mach constraint impulse; do not quietly reset velocity when the heat callback changes. The first momentum fixtures use Q=0 or a constant source with a compatible initial field.
2. Compute the one primal mass/enthalpy flux and its dual mass map from that actual velocity. Check both primal outgoing/enthalpy positivity and dual outgoing-mass CFL before accepting a stage. A dual CFL is required; the old velocity-stencil CFL is not proof of a positive dual transport denominator.
3. Update candidate physical cell mass/U with the existing paired receipts and Q. Update unprojected face momentum with the dual momentum receipts and gravity impulse `dt*dualMass_old*g_axis`. The gravity numerator uses the same explicitly chosen Euler-stage mass; it is not divided by a fixed reference density.
4. Derive new dual mass from candidate physical mass. Form `u_star = P_star / dualMass_new`. Compute the candidate p0 and S using candidate U and the endpoint source. Project this actual provisional velocity with `beta = dualVolume/dualMass_new`. Numeric coefficients rebuild at this projection.
5. Apply `deltaP = dualMass_new*(u_projected-u_star)` and record the pressure impulse. Return the validated candidate mass/U/P plus all physical and mechanical receipts. No EOS/U overwrite. The pressure result belongs to this stage and actual dt; it is not another thermodynamic stock.

Build SSPRK2 from those projected Euler stages. Average **mass, U and momentum** as conserved quantities, with the same half-weighted transfer/source receipts as today. Derive averaged dual mass, then project the averaged momentum's velocity onto the endpoint constraint. This final projection is necessary because averaging momentum/density does not generally average velocity or preserve its divergence. Record its additional impulse/work; omitting it would be a real DAE error. For a successful ordinary step this means two Euler endpoint projections and one final endpoint projection through the same owner, plus any separately declared initial event adjustment. There is no new pressure matrix implementation or persistent pressure guess required for the first reference.

The first coupled method remains a **candidate** projected RK scheme. The prior scalar temporal result does not prove its coupled velocity order. Stage heat/forcing evaluation times, actual impulse weighting and endpoint constraint need to be checked in the analytic fixtures. If those fail, preserve the failure and choose a corrected projected integrator; do not describe first-order splitting as a proven second-order flow solver.

Retain named CFL and virtual-temperature-envelope retries only; structural identity, geometry, dual-map compatibility, pressure failure and true endpoint violations remain fatal and atomic. Include a positive dual mass bound and both physical/dual outgoing limits (proposed Courant <=0.45). Keep max12 halvings, max512 physical cells and bounded accepted steps. No acoustic timestep is introduced, but low Mach is an approximation constraint, not permission to step arbitrarily far.

## Boundaries: declare less, prove it correctly

**First admitted geometry:** a full rectangular single fluid component, 2-D or 3-D with the same metric owner, fixed periodic axes and/or closed outer walls; no internal solids or thin barriers. Reject interior obstacles until the dual-volume/dual-flux geometry is derived. The existing fractional no-slip ghost stencils are velocity sampling rules, not that derivation.

**Periodic:** each face/dual interface is unique and wraps exactly; all transfers cancel pairwise. Gravity is zero along a periodic axis. A periodic y gravity potential is not invented. This is the first momentum-conservation/translation domain.

**Sealed stationary walls:** normal velocity is prescribed zero. The derived dual partition includes boundary half-volumes with half-cell mass and fixed normal momentum zero; they are geometry/constraint bookkeeping, not new physical stock. Their interior dual boundary flux is half the neighboring primal flux, so the dual mass identity still holds. Fixed boundary momentum closure supplies a recorded wall reaction; fluid momentum alone is not conserved against a wall. Tangential behavior is inviscid free slip with zero normal transport. No claim of no-slip drag follows from a zero-viscosity method. Static hydrostatic fixtures test pressure/body-force cancellation before wall-adjacent circulation is attempted.

**Open:** rejected. An existing `i=-1`/`j=-1` geometry face and ambient pressure potential do not provide finite donor density, enthalpy, momentum, reservoir stock or backflow data. Port admission requires a separate finite/declared-reservoir contract and import/export/work receipts.

**Edits/collisions:** reject stale identity before work. This proposal does not remap gas when excavating/filling cells, move a wall, solve gas-water displacement or consume oxygen. Viscosity likewise needs the actual stress divergence under variable density/nonzero S; importing the old constant-nu velocity Laplacian would be wrong in general.

## Minimal independent qualification ladder

No buoyant room precedes these. The first source checkpoint should implement only enough to run this bounded ladder, with all thresholds fixed before its run.

1. **Dual algebra and variable-density translation.** Periodic x strip, no gravity/heating, uniform u=C and v=0; rho(x)=rhoBar*(1+0.2*sin(2*pi*x/L)), T=p0/(R*rho), U=p0*V/(gamma-1). Use independent exact cell-average integrals and rho(x-Ct). The physical mass profile and momentum profile move together. Check the per-dual-cell flux identity, constant velocity to floating/projection tolerance, periodic total mass and each momentum component, thermal U, nonzero actual face receipts, density-profile error and restart. Proposed grid16×4, then32×8 over the same domain; C=0.08m/s. The temperature range is approximately250–375K. Numerical diffusion must be reported.
2. **Constant-temperature hydrostatic rest.** Full box with sealed y and periodic transverse axes; rho0=p0/(R*T0), u=0, Q=0 and g_y=-9.81m/s². Independent perturbational pressure is pi(y)=-rho0*gMagnitude*y plus a gauge constant. Gravity and pressure impulses cancel, masses/U stay fixed and no circulation is created. This is the uniform-p0 low-Mach hydrostatic limit, not the exact compressible exponential atmosphere.
3. **Stratified hydrostatic rest.** Choose rho(y)=rho0*(1-0.2*y/H), exact cell-average mass, U=p0*V/(gamma-1), and T derived from U/m. Independent pi(y)=-rho0*gMagnitude*(y-0.1*y²/H). Its cell-center difference equals the arithmetic face-density gravity gradient for this linear density profile, giving an especially sharp balance test. Both temperature and density vary, so a fixed-density pressure mobility or temperature-anomaly force cannot pass legitimately. Compare pressure **differences**, velocity drift, body/pressure impulses and thermal stocks. A4×4×4 box at `[1,.54,1]` has H2.16m and a small declared hydrostatic pressure ratio.
4. **Nontrivial 3-D manufactured momentum/pressure.** Fully periodic physical box `[4,2.16,4]`m, constant rho/T and no gravity. Let `u=A(t)*sin(ky*y)`, `v=A(t)*sin(kz*z)`, `w=A(t)*sin(kx*x)`, with `A(t)=0.04*cos(t)`m/s. This has div(u)=0, real cross-axis advection and all three moving face families. Prescribe pi=`rho0*B*cos(kx*x)*cos(ky*y)*cos(kz*z)` (e.g. B=0.001m²/s²) and derive the exact body acceleration `partial_t(u)+(u dot grad)u+grad(pi)/rho0`. For example, the x advection term is `A²*ky*sin(kz*z)*cos(ky*y)`. Use analytic control-volume/face averages where required; forcing must be independently derived, not copied from the solver's discrete momentum residual. Compare all three momentum/velocity components and pressure-impulse stage rates, with gauge removal. Start4³, then8³ over the same physical domain and fixed simulation interval; include dt halving at one grid. State spatial and temporal errors separately. A manufactured force is a qualification input, not a game wind system.
5. **Thermal composition regression.** Preserve the existing independently qualified heating pressure/material-density laws and one local enthalpy receipt. Establish a compatible initial S or explicitly record its initial impulse; later gravity+nonuniform heating remains a separate proposed fixture. An old saved all-zero provisional field cannot be supplied each step as a workaround.

For every accepted fixture: finite stocks and derived values, strict same-domain/species/method reload, unchanged rejected input, physical mass/U ledgers, per-face/dual impulse receipts, all-cell divergence including pin, pressure iteration caps, maximum Mach/temperature/pressure-scale ratios and actual cell/face/solve counts. Proposed residual limits initially retain the qualified projection1e-10m³/s and finite mass/U/EOS tolerances; momentum/dual residuals need a documented scale-aware floating bound fixed before execution. No relaxation after a failed run without a method review.

## Small source shape and work budget

If approved, the new candidate would contain an evolved `finite-gas.mjs` (same thermal authority), one `momentum.mjs` owning derived dual geometry/flux/impulses, and the reused projection/geometry binding. The finite owner's old zero-provisional construction is deleted in that candidate. The old Boussinesq `predict`/temperature force is not imported; it remains frozen solely as the older reference. The finite stage exposes its actual mass/enthalpy result to momentum; it does not add a second mass update. Public callers still make one bounded `advance` and receive a canonical state/receipt. No ECS, event bus, second simulation clock or generic multiphysics framework is proposed.

First source review precedes execution. Proposed initial qualification budget: at most512 physical cells, three face families, at most240 accepted steps across the fixed fixture matrix and a30-second guarded wall limit. Pressure numeric assembly/projection count and dual geometry construction are measured separately; topology is cached, density-dependent coefficients are rebuilt. If the ladder cannot fit, split the fixed analytic cases into a specifically reviewed next packet rather than run an unbounded sweep. Preserve the first failure; no room benchmark, browser, C++/Rust/WASM port or production join in this step.

**Root decision requested:** accept conservative face momentum with derived dual mass and shared primal receipts; accept this fixed-box projected-stage reference and its explicit thermal/mechanical energy approximation; or identify a specific physical incompatibility before source work. The main deliberate limitation is full-box dual geometry, not a claim that the old obstacle ghosts or open-port data already solve finite momentum boundaries.
