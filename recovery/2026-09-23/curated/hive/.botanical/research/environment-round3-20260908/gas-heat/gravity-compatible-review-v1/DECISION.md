# Gravity-compatible gas: the smallest honest next owner change

Source and mathematics only, 2026-09-08. Owner: /root/sim_study_status_check.
No solver, qualifier, numerical sweep or kernel edit occurred. Root owns the
physical method decision and any subsequent source/experiment authorization.

Root read this decision and accepted the direction below. The next source-fit
is the retained Basilisk all-Mach/compressible caller, before implementation.

**Recommendation: correct the coupled finite transport/energy/pressure owner,
rather than patching the gravity force.** Retain finite mass and actual momentum,
and use a conservative energy formulation whose gravitational work follows the
actual face mass transfers. Keep the physical dual mass. Select a qualified
pressure-energy closure before implementing this seam; an all-Mach implicit
pressure/energy formulation is the preferred architectural direction for room
compression and later water displacement. It is a larger change than one flux
line and has not been derived or qualified for this implementation yet.

A centered-flux comparison would isolate the arithmetic gravity pairing, but
centered-plus-rejection is not a robust finished method. It loses monotonicity
and is also incompatible with the retained SSPRK2 density transport stability.
Neither a temperature residual patch nor donor-density replacement of physical
dual mass is recommended.

## 1. What the actual implementation owns

The frozen `finite-momentum-v1/finite-gas.mjs` has:

- `thermalFields`, lines43–58: U and finite mass determine cell thermodynamics;
  one common thermodynamic pressure is derived from sum(U), then cell EOS is
  required to agree with it. Dynamic pressure is not that thermodynamic stock.
- `targetFlux`, lines61–65: the prescribed heater alone determines p0Dot and
  target volume divergence. No kinetic, gravitational or numerical-work term
  enters this closure.
- `transferThermal`, lines126–145: one donor face mass transfer feeds the
  enthalpy transfer and the later momentum transport. Its outgoing-volume CFL
  relies on this donor thermal form.
- `euler` and `acceptTrial`: update finite M/U, transport actual P, apply gravity,
  project, then accept weighted RK stocks and receipts. No physical velocity is
  generated from a zero provisional state.

`momentum.mjs:dualMasses` defines the physical face mass as the two adjacent
half-cell masses. `dualTransfers` maps the actual primal transfers into dual
transfers; `checkDualMass` verifies that both mass descriptions commute.
`transportMomentum` transports actual P with donor component velocity and then
applies dt*Mdual*g. `projectMomentum` uses beta=Vdual/Mdual and retains the
actual pressure impulse. The same mass therefore owns inertia, kinetic energy
and pressure mobility. That is worth preserving.

`projection.mjs` owns metric divergence, coefficient assembly, pressure solve
and correction. Its closed, zero-target pressure gradient has zero
semidiscrete power and nonpositive finite correction norm. Its nullspace pin
and target equation belong to its present incompressible/low-Mach problem;
they are not automatically valid for a compressible Helmholtz pressure solve.

The passed diagnostic measured gross donor dissipation−0.0924708972J,
gravity/PE gain+0.0227442006J and a combined time/split remainder+0.00000160346J
in the same1-second case. See the frozen `finite-energy-diagnostic-v1/RESULTS.md`.
The following recommendations do not turn that observation into corrected
physics.

The low-Mach enthalpy approximation deliberately omits kinetic, viscous and
gravity work at its stated asymptotic order. That supports the old U-only
result within its model; it does not remove a discrete mechanical mismatch.
See the checked [Nalu derivation](https://nalu.readthedocs.io/en/latest/source/theory/lowMachNumberDerivation.html).

## 2. The algebra forces a real choice

For an upward face i→j, area A, spacing h, q=A*u, potential difference
DeltaPhi=g*h, physical face mass M=Ah*(rho_i+rho_j)/2:

```text
Fcenter = q*(rho_i+rho_j)/2
Factual = Fcenter + J
gravity power = -u*M*g = -Fcenter*DeltaPhi
PE rate = Factual*DeltaPhi
pairing defect = J*DeltaPhi
```

For donor transport, `J=abs(q)*(rho_i-rho_j)/2`. Its power is positive in
stable stratification and negative in unstable stratification. The existing
O(abs(eta)) positive stable-circulation example versus O(abs(eta)^3) kinetic
dissipation is therefore not cured by keeping only the net loss negative.

If physical M*g, the face velocity and cell-average PE definition are fixed,
exact **per-face** gravity work balance requires Factual=Fcenter on a face with
nonzero DeltaPhi. Global compensating fluxes or an additional physical energy
exchange are different choices. A pure pressure-gradient change has no net
power at div(u)=0 and cannot cancel J*DeltaPhi. Hydrostatic background-pressure
subtraction improves conditioning but does not remove J.

This conclusion is our discrete algebra, not a general impossibility theorem
for all high-order, subcell or energy-aware methods.

The established [staggered variable-density scheme of Latché and Saleh](https://arxiv.org/html/1603.07221v3)
also constructs dual mass fluxes from primal mass conservation to obtain a
kinetic-energy balance. Its stated model has no gravity, and its time scheme
differs from ours; its theorem is not a gravitational-energy guarantee here.

## 3. Why the smallest flux-only comparator is not the finished solution

The centered comparator would replace the **shared primal face state**, not
only its mass multiplication:

```text
rhoFace = (rho_i+rho_j)/2
enthalpyPerVolumeFace = (rho_i*h_i+rho_j*h_j)/2
Fmass = q*rhoFace
Fenthalpy = q*enthalpyPerVolumeFace
```

Equivalently hFace=enthalpyPerVolumeFace/rhoFace and Fenthalpy=Fmass*hFace.
For one common-pressure, constant-gamma gas this leaves the enthalpy volume
flux q*gamma*p0/(gamma−1), so the existing local energy/pressure derivation
holds without overwriting U. Keeping the old donor h while changing only mass
would not have that property. All current dual transfers would consume the new
single mass receipt, and physical inertia/gravity/projection could stay intact.

But centered mass advection is not monotone. A positive outgoing **mass** budget
could protect a proposed stage (the old outgoing-volume budget is insufficient),
and atomic envelope rejection protects accepted stocks. Neither guarantees
progress through a front or prevents new extrema. Taking smaller steps does
not resolve that distinction.

There is also a precise time-method obstruction. In the existing constant-
velocity, zero-gravity translating-density limit, centered transport has an
imaginary Fourier eigenvalue i*omega. SSPRK2 has R(z)=1+z+z²/2, hence
`abs(R(i*xi))²=1+xi⁴/4>1` for every nonzero xi. This is an independently
derived linear stability result, not a numerical run. SSPRK3 has a finite
imaginary-axis stability interval (`abs(R(i*xi))²=1−xi⁴/12+xi⁶/36`), but changing
the time method alone still does not supply density monotonicity. Therefore
even a centered comparison is not an honest one-line replacement under the
current RK owner.

A nonlinear limiter blending centered and donor flux also needs a new coupled
law: its admitted correction J still changes PE. Ordinary scalar positivity or
TVD limiting does not imply mechanical-energy compatibility. Conservatively
limiting **joint** mass, momentum and energy fluxes is a viable larger approach;
silently using donor fallback and claiming exact gravity pairing is not.

## 4. A viable conservative energy choice

For fixed external potential Phi, define E_i as **non-gravitational total
energy**, U_i+K_i. Let F_ij be the one signed mass flux i→j, and H_ij the one
signed non-gravitational total-energy flux, including the consistent pressure
work flux. Choose one shared face potential Phi_f, e.g. midpoint potential
for the present uniform grid. Set the local gravitational energy source to

```text
Qg_i = -sum_faces_out F_if*(Phi_f-Phi_i)
Mdot_i = -sum_faces_out F_if
Edot_i = -sum_faces_out H_if + Qg_i + Qexternal_i

d/dt(E_i+M_i*Phi_i)
  = -sum_faces_out [H_if+Phi_f*F_if] + Qexternal_i
```

Both sides of an internal face use the same F, H and Phi_f. Summing over a
sealed stationary domain cancels all paired fluxes. This is a local finite-
volume energy law, not a correction chosen after observing a global error.
At the discrete stage level use the exact admitted mass transfer deltaM_if in
the same formula; fixed Phi makes this identity algebraic for any such transfer.

This is our face-oriented derivation. The related fixed-external-potential
conservation form and need to base work on actual exchanged mass appear in
[Springel's AREPO paper, sections5.3–5.4](https://arxiv.org/pdf/0901.4107).
Its self-gravity terms and one-half potential factor do not apply to this
prescribed external field. Conservative energy also does not establish
temperature robustness; that paper explicitly discusses thermal errors.

The physical momentum force remains Mdual*g. The difference between its
resolved kinetic work and the energy work required by actual transported mass
must then appear in the **derived internal-energy update**, along with locally
specified kinetic transport/dissipation and pressure work. It cannot disappear.
Writing F=Fcenter+J shows the diffusion part explicitly:

```text
Qdiff_i = -sum_faces_out J_if*(Phi_f-Phi_i)
sum_i Qdiff_i = -sum_internal_faces J_ij*DeltaPhi
```

For midpoint potential an internal face contributes −J*DeltaPhi/2 to each
neighbor. This is the known numerical mass flux's potential-energy exchange,
specified before the step. It is categorically different from measuring an
arbitrary final residual and dumping it into U. It also does **not** mean that
this isolated term alone is a sufficient energy scheme: local kinetic flux,
pressure work, time integration and admissibility must join the same law.

Under this choice, numerical mixing that raises PE can draw from U; numerical
momentum dissipation can increase U. That is an explicitly declared numerical
regularization, not newly modeled combustion or microscopic heat transport.
Its temperature/entropy effects must remain bounded and converge away. Exact
total energy would prevent unaccounted production; it would not by itself
make a diffusive flow or its mechanical-energy budget accurate.

This source-form choice keeps absolute gravitational height out of canonical E.
Only potential differences enter work; adding a constant to Phi must not
change any update. That is useful for negative/large world coordinates. Storing
E+M*Phi instead is mathematically possible but worsens subtractive conditioning
when the arbitrary potential zero is far away.

## 5. The actual energy/pressure ownership cost

There must be **one** canonical energy quantity. My preferred candidate uses
non-gravitational E and derives U for thermodynamics, with a new numerical/save
identity. M and P stay finite canonical quantities. Alternatively U can remain
canonical if its increment is derived from independently defined local total-
energy flux/work and local deltaK; E must then remain derived. E and U cannot
be independently evolved duplicate stocks.

For the present full-box staggered layout one consistent cell allocation is
`K_i = M_i/4 * sum_{incident component faces} u_f²`, with constrained wall
normal velocity zero. Summing those allocations gives exactly the current
global dual kinetic metric in real arithmetic. For general wall-adjacent dual
partitions use the actual half-volume/mass weights and re-prove the partition.
Do not average velocity into a second independently evolved cell momentum.

This allocation is local but depends on neighboring face momenta and masses.
A standard cell-centered Euler positivity proof cannot simply be asserted for
`E_i-K_i>0` in this staggered representation. The candidate needs joint cell/face
admissibility and a bounded **conservative** flux limiter or a correspondingly
qualified layout/method. Clamping U, choosing independent face limiters, or
replacing the dual mass to make the test pass is forbidden.

Most importantly, the present `p0Dot=(gamma−1)*Qheater/V` and `targetFlux` are
not the closure for this new energy update. If a reduced low-Mach model is
retained, its enthalpy equation must include the derived local numerical-work
terms and its p0/divergence constraint must be re-derived. Those work terms can
depend on the corrected velocity/pressure, requiring a coupled or converged
stage. Resetting U to common p0 after the energy update would discard the new
local balance and is not acceptable.

I favor a qualified **all-Mach pressure-energy step** for the intended finite
rooms and displaced gas: thermodynamic compressibility and pressure work are
then part of the pressure solve, rather than appended to a fixed-volume
zero-divergence projection. Root's maintained coupled reference review is the
appropriate next comparison before another handwritten kernel. This is a
method-direction recommendation, not a package adoption or a claim that the
current constant-coefficient/pinned-nullspace solve is already sufficient.

An all-Mach step needs an EOS-dependent pressure operator (typically including
a compressibility/Helmholtz term), a consistent energy-work correction and a
qualified low-Mach limit. The existing geometry/face incidence and much of the
coefficient/linear-solver organization remain useful, but imposing the old
closed pressure pin on a nonsingular compressible operator would be wrong.
Cost must include coefficient/outer-iteration rebuilds and coupled positivity,
not just the previous PCG count. A fully explicit acoustic reference has a much
smaller stable timestep than our advective low-Mach reference; it is not an
unmeasured performance solution.

## 6. Exact future source seam and what is replaced

The minimum coherent correction spans the existing `finite-gas.mjs` thermal
face update, thermal read/validation, target/stage admission, Euler/RK acceptance
and `projectMomentum` pressure-energy join. It preserves canonical geometry,
finite mass, actual momentum, matched primal/dual transfers, deterministic
clock/retry ownership and current evidence.

Within a new candidate, replace enthalpy-only stage ownership with one energy-
transport owner returning shared mass/energy/work receipts. Replace the old
heater-only target/pressure coupling when the chosen closure is joined; do not
leave it active alongside a second pressure or energy stock. Reuse the one
thermodynamic definition owner for U→T/p/cv; no item- or species-name branches.

Current full-box dual geometry still explicitly rejects interior solids/open
faces. Once the energy method is qualified, obstacle geometry must extend that
same primal/dual metric owner and re-prove its basis mass law and wall work.
An open port needs finite mass and total-enthalpy/pressure-work exchange. A
moving water/gas boundary needs one interface normal velocity/traction and
displacement work; two independently projected phases cannot each own it.
No cache boundary or newly opened voxel supplies air/heat by default.

The resulting work is larger than centered-plus-reject but smaller and more
honest than accumulating independent force, heat, EOS-reset and interface fixes.
It should begin with the finite-energy/pressure law and primary-reference fit,
not a room animation. Deciding tests are in CHECKPOINTS.md.

Detailed checked-source scope and the distinction between new algebra and
previous measured results are recorded in PRIMARY-SOURCES.md. No new numerical
result is claimed by this source packet.
