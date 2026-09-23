# Gravity, mass transport and mechanical energy

**Finding: the present donor mass flux and arithmetic-dual-mass gravity force have a signed mechanical-energy compatibility defect.** It is separate from expected upwind momentum dissipation and can cause net spurious gain. The finite buoyancy packet's 5.39% net loss does not rule it out. No simulation was rerun and no numerical/game owner was edited for this audit.

Scope: fixed full box, stationary sealed/free-slip y, periodic x/z, constant gravity[0,−g,0], zero heater, no external force, no viscosity/diffusion. The current thermodynamic constraint is div(u)=0 and uniform p0. Statements below are exact discrete algebra in real arithmetic; floating implementations retain their explicit residual bounds. They do not extend to open faces or a nonzero thermal-expansion constraint without the additional terms named below.

## Actual source anchors

- `../finite-momentum-v1/finite-gas.mjs`, `transferThermal` lines126–145: face mass is `dt*u*area*rho_donor`; enthalpy is that same transfer times donor h. `euler` lines151–171 sends these actual mass transfers and old-state gravity to momentum, then projects the resulting momentum. Canonical cell mass/U are not reset.
- `../finite-momentum-v1/momentum.mjs`, `dualMasses`/`dualTransfers` lines101–110 and `checkDualMass` lines131–145: each active dual mass is the two neighboring half-cell masses and its transfer map obeys the independently checked `Ddual L = R D` law. Wall half-volumes are component partitions, not extra air.
- The same file, `transportMomentum` lines147–176: donor component velocity transports momentum using L(actual mass transfer). Gravity impulse is `dt*Mdual_old*g_axis`. The code evaluates kinetic energy before/after advection, body impulse and fixed-wall normal-momentum removal.
- `projectMomentum` lines179–193: beta=dualVolume/dualMass, actual advected momentum supplies the provisional velocity, pressure arrays are copied, and pressure impulse/work is recorded.
- `../finite-momentum-v1/projection.mjs`, `integratedDivergence` lines9–18 and `correctAndCheckFlux` lines136–145: divergence and pressure correction use the paired area/distance metric, with all-cell residual including the pressure pin.
- `finite-gas.mjs`, `averageState`/`acceptTrial` lines208–238: SSPRK averages actual M/U/P, weights both Euler phase receipts by1/2, then applies a final endpoint constraint projection with weight1. PE is linear in physical mass; K is not linear in momentum/mass.

Exact read sources and saved field pins are in `STORED-AUDIT.json`. No dependency, definition, frozen field or receipt changed.

## 1. The signed gravity/potential mismatch

Let a vertical physical face be oriented upward from lower cell i to upper j, with velocity v, area A, spacing h, V=A*h and density rho_i/rho_j. Let Phi=g*y be gravitational potential per unit mass, so Phi_j−Phi_i=g*h. The code uses:

```text
F = A*v*rho_up                         [kg/s]
rho_up = rho_i if v>=0, otherwise rho_j
Mface = V*(rho_i+rho_j)/2              [kg]
gravity momentum rate = -g*Mface      [kg m/s^2]
```

The true physical cell PE change follows the actual mass flux:

```text
PEdot_face = F*(Phi_j-Phi_i) = g*V*v*rho_up
gravityPower_face = -g*Mface*v

G_face = gravityPower_face + PEdot_face
       = g*V*v*(rho_up-rho_arithmetic)
       = (g*V/2)*abs(v)*(rho_i-rho_j)  [W]
```

Transverse periodic faces have zero potential difference and zero gravity component. Sealed boundary faces have no physical mass flux; fixed normal half-volumes have zero old velocity, hence zero old-state gravity power. Therefore the expression sums directly over active vertical faces without an omitted boundary power.

For one actual Euler stage the integrated identity is the same formula times dt:

```text
Gstage = sum(velocity_old * gravityImpulse)
       + sum(actualPrimalMassTransfer * potentialDifference)
       = dt * sum(G_face)
```

This is an old-state work pairing, not the entire finite gravity kick's kinetic change. The finite kick has additional terms derived below. The gap vanishes for constant density, zero velocity or centered face density. It is negative when numerical mixing lowers PE across an unstable gradient, and positive when mixing raises PE across a stable gradient.

**Net spurious-gain counterexample without a new run.** Take a stable monotone density profile, rho_i>rho_j on upward faces, and any nonzero admissible sealed divergence-free circulation u=eta*w. The positive gap is O(abs(eta)). Conservative dual donor kinetic dissipation is O(abs(eta)^3), because mass flux scales as eta and squared component-velocity jump as eta². Pressure has zero semidiscrete work at div(u)=0; stationary-wall normal velocity is zero. Thus for sufficiently small nonzero eta the semidiscrete mechanical derivative is positive. This is a material compatibility defect, not simply a choice to dissipate unresolved motion. The previous hydrostatic rest tests had u=0 and necessarily could not expose it.

## 2. Conservative donor momentum: exact kinetic identity

For a component dual node r, let M_r,P_r,u_r=P_r/M_r be the old mass/momentum/velocity. Let signed mass transfer d_e across a dual interface i→j use the code's donor velocity. Let deltaM,deltaP be the paired net increments from **only** this transport. The exact finite identity is:

```text
K(M+deltaM,P+deltaP) - K(M,P)
  = u*deltaP - 0.5*u^2*deltaM
    + (deltaP-u*deltaM)^2/(2*(M+deltaM))
```

Summing paired donor faces gives:

```text
Ddonor = 0.5*sum_e(abs(d_e)*(u_j-u_i)^2) >= 0
Eforward = sum_r((deltaP_r-u_r*deltaM_r)^2/(2*Mnew_r)) >= 0
deltaK_advection = -Ddonor + Eforward
```

The current outgoing-mass bound ensures M_old−outgoing>=0. Each new velocity is then a mass-weighted convex combination of its retained old value and incoming donor values. Jensen/Cauchy gives Eforward<=Ddonor and consequently deltaK_advection<=0, up to measured floating residual. This applies to the full component partition, including wall normal half-nodes before they are constrained. It is a useful independent law for the actual dual donor operator. The semidiscrete limit is `Kdot_advection = -0.5*sum(abs(Fdual)*(jump(u))²)`.

This **kinetic** identity does not control the change of gravity PE caused by the donor physical mass flux. Sharing mass and momentum correctly was necessary; it did not automatically make gravity/PE compatible.

## 3. Body impulse, wall reaction and projection

Let Padv,Mnew be the transported values, b=dt*Mold*g the actual body impulse, and uadv=Padv/Mnew. Then:

```text
deltaK_body = sum(uadv*b + b^2/(2*Mnew))
Wgravity_old = sum(uold*b)
Tgravity = sum((uadv-uold)*b + b^2/(2*Mnew))
deltaK_body = Wgravity_old + Tgravity
```

Tgravity has a cross term of either sign and a nonnegative explicit-kick term. It is a time/split remainder, not a new heat source. At fixed wall normal nodes the subsequent clamp removes exactly `Pforced²/(2*Mnew)`, so deltaK_wall<=0. That clamp often cancels a provisional gravity kick which should never produce physical wall motion.

At projection, mass is held fixed. The current metric/coefficient pair implies:

```text
deltaP_f = A_f*(phi_i-phi_j)
deltaK_projection
 = sum(u_after*deltaP) - 0.5*sum(deltaP^2/M)
 = sum_i(phi_i*Dvolume(u_after)_i) - 0.5*sum(deltaP^2/M)
```

Here phi is a pressure impulse inPa·s, Dvolume has unitsm³/s, and their product is joules. With zero target divergence, the first term is only the measured residual work, so projection is non-increasing in the mass-weighted kinetic norm. With nonzero target S*V it also contains phi·target and cannot be called purely dissipative. Floating error in `M*beta=V` or dot-product pairing is an additional directly measurable residual, not permission to ignore the all-cell pressure pin.

Although the present zero-target projection has this non-increasing norm property, its large negative split receipt must **not** all be interpreted as lost physical motion. The hydrostatic pressure impulse cancels the large unphysical provisional gravity kick; at rest they cancel to nearly zero. Gravity, wall and pressure receipts need to be read together.

## 4. SSPRK averaging and the exact accepted-step decomposition

Call the old accepted state n, the first Euler endpoint a and the second endpoint b. The code averages n and b. Because the dual mass map is linear, `Mbar=(Mn+Mb)/2` exactly at the algebraic level. The kinetic Jensen term is:

```text
Jrk = K(Mbar,Pbar) - (K(Mn,Pn)+K(Mb,Pb))/2
    = -sum[ Mn*Mb/(4*(Mn+Mb)) * (un-ub)^2 ] <= 0
```

PE averages linearly with physical mass. Including the final endpoint projection, the exact accepted mechanical change is:

```text
delta(K+PE)_accepted
 = 0.5*sum_{stage=a,b}[
     -Ddonor + Eforward + Gstage + Tgravity
     + deltaK_wall + deltaK_stage_projection
   ]
   + Jrk + deltaK_final_projection
```

Every term refers to that stage's actual old state and interval; b is an exposed virtual Euler endpoint, not a second accepted physical interval. The accepted weights are1/2,1/2 and1 for final projection. Phase arrays must be read or copied before another projection reuses scratch.

For diagnosis it is useful to group all terms other than the weighted donor dissipation and gravity pair as a **time/split remainder**:

```text
delta(K+PE) = -weightedDdonor + weightedGstage + Tsplit
```

Tsplit can have either sign and contains explicit Euler convexity/kicks, wall/projection cancellation, RK Jensen and final projection. Its refinement behavior must be measured; no sign or order is asserted merely because the individual pieces have signs. The semidiscrete gravity defect remains when dt→0 and cannot be removed just by reducing dt.

## 5. What the stored evidence actually says

`STORED-AUDIT.json` SHA256 `4d603284200fa7e66fbffb6e769122a638c7d2ce4d8756670abd6c3969af780e` contains read-only arithmetic on the existing saved states and operation totals. It did not import a geometry compiler, call the solver, advance time or construct a new physical fixture. Final velocity was derived from saved P and the actual arithmetic neighboring masses encoded by the saved geometry descriptor.

| Existing case | Stored advection deltaK | Stored body+wall+pressure+deltaPE | Stored RK averaging | Net mechanical change |
|---|---:|---:|---:|---:|
|4³,dt1/32 |−.0497209J |+.0433861J |−.0229899J |−.0293248J |
|8³,dt1/16 |−.0894641J |+.0968215J |−.0773614J |−.0700041J |
|8³,dt1/32 |−.0908141J |+.0597695J |−.0386805J |−.0697251J |

The positive grouped remainder is not itself the missing integral of Gstage: it also contains the finite-kick/projection terms. The stored advection receipt is −Ddonor+Eforward, not Ddonor by itself. These distinctions prevent false attribution.

At the **saved final instant** t=1s:

| Existing case | Gravity power | PE rate from actual donor flux | Signed gap |
|---|---:|---:|---:|
|4³,dt1/32 |+1.42233875W |−1.34475723W |+.077581521W |
|8³,dt1/16 |+2.39490080W |−2.30959243W |+.085308370W |
|8³,dt1/32 |+2.39498804W |−2.30969597W |+.085292070W |

The independently rearranged donor-gap formula agrees within1.43e−15W. This establishes that a positive compatibility defect is actually present in the saved moving field; it is not merely a hypothetical counterexample. The final rate is **not its one-second time integral**, and multiplying it by1s would be unjustified.

Existing records retain whole-run signed transfer sums, operation totals and the last pressure phases, but not every accepted Euler old-velocity/density pair. The quantities `abs(F)*jump(u)^2` and `u_old*b` require those correlated stage values. Different histories can produce the same summed transfers with different dissipation/work. Therefore the audit cannot honestly assign a percentage of the5.39% net loss to each semidiscrete/temporal cause from the current aggregate records alone. The narrow proposed instrument in `DISCRIMINATOR.md` fills exactly this missing evidence.

## 6. Could internal or total energy account for donor mixing?

**Reduced-model scope comes first.** I independently read the [Nalu low-Mach derivation](https://nalu.readthedocs.io/en/latest/source/theory/lowMachNumberDerivation.html), equations and discussion at lines 20–40, after root's source handoff. In the stated low-Mach/Froude scaling, leading-order enthalpy omits kinetic, viscous and gravity work; spatially uniform thermodynamic pressure remains distinct from dynamic pressure. Thus the current finite-U conservation is a legitimate reduced-model result within its approximation, rather than a claim to solve full total-energy physics. That asymptotic omission is separate from the signed discrete defect above: the reduced zero-heat, divergence-free mass/momentum subsystem still admits the mechanical work balance being audited, and mismatched discrete gravity and mass flux can violate it. Adding a measured residual to U would change the thermodynamic closure, not automatically fix that discretization.

Not through the current enthalpy owner unchanged. For this one constant-gamma gas at uniform p0:

```text
h_donor = gamma*p0 / ((gamma-1)*rho_donor)
Fmass*h_donor = A*u*gamma*p0/(gamma-1)
```

Donor density cancels from the enthalpy flux. With zero heater and div(u)=0, U stays constant while donor mass diffusion changes rho/T and can change PE. There is no existing physical energy transfer that compensates that donor PE mixing.

A **future conservative total-energy formulation** could account for it, but it would be a thermodynamic/numerical design change, not a receipt repair. It would require one authoritative total-energy or internal-energy update with independently defined local total-energy flux, the same mass/momentum transport, pressure work, gravity potential transport/work and explicit treatment of numerical dissipation. With staggered P, the allocation of kinetic energy to physical cells must be unambiguous; U, total energy and K cannot all become separately evolved duplicate facts.

If total energy were canonical, internal U would be derived from it after the specified staggered kinetic/potential allocation. If U remains canonical, its update would have to follow the independently specified local total-energy balance and named work/flux receipts. In either case, positivity, definition envelopes, entropy/mixing assumptions and the low-Mach pressure constraint must be re-derived. The present `p0Dot=(gamma-1)*Qtotal/V` cannot remain unchanged if resolved mechanical energy is converted to internal energy in addition to the fixed external heater. Pressure/enthalpy expansion coupling and source admission would need one coherent owner.

In a full energy model, positive PE mixing could consume internal/resolved kinetic energy and momentum dissipation could become heat. Whether such subgrid mixing is physically intended, an explicit numerical approximation, or bounded/reduced by a reconstruction needs a declared decision. A globally computed residual dumped into U after the step provides none of that local flux/constitutive meaning and could break uniform-pressure EOS or positivity. It is specifically **not recommended**. Likewise, replacing the actual physical dual mass in the gravity force by donor density would impose a velocity-sign-dependent force; it must not be slipped in as a one-line conservation fix.

The immediate recommendation is diagnostic only: measure the exact accepted-stage decomposition on the unchanged existing fine buoyancy fixture, verify complete physical-state/old-receipt equality, then choose a conservative gravity/mass/energy method with the actual attribution in hand. No kernel or thermodynamic change is authorized by this note.
