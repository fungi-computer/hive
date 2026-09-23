# Soil water: pressure, occupancy and a finite pond

2026-09-08. Independent physical decision review, planning only. No solver, proof, source integration or calibration was performed. Read the actual NEXT-CONTRACT, retained groundwater source/results and supplied source inventory. The proposed equations and bounded fixtures below are the reviewer's design recommendation, not a claim that Hive has implemented a published solver.

## Decision

**Start with rigid pores, constant-density isothermal water and a mixed saturated/unsaturated Richards constraint. Set physical specific storage to zero explicitly.** Keep one finite water mass per porous cell and one separate surface-pond stock. Pressure determines saturated flow but does not manufacture occupied pore volume. Use a finite lower reservoir/standpipe for the first independently checkable reversed-seepage case. Do not preserve the old counterexample's arbitrary positive pressure as though it were independent incompressible inventory.

This supports infiltration, redistribution, a water table and pressure-driven saturated flow under a declared low-frequency Darcy approximation. It deliberately omits elastic aquifer pressure transients, water hammer, trapped-air resistance, evaporation, hysteresis, soil swelling and heat exchange. Those omissions are physical boundaries, not permission to simulate them with unnamed storage coefficients.

The primary surface/subsurface paper explicitly uses nondeformable soil, incompressible water and unaffected air pressure, with a saturated branch of constant water content. Its wet/dry interface couples pressure and the same normal flux. That is an appropriate model family for this bounded first step; its discussion also excludes difficult rapid runon over very dry soil from its equilibrium interface assumptions. [Sochala, Ern and Piperno, model and coupling conditions](https://arxiv.org/html/0809.1558).

## Canonical state and constitutive closure

For fixed bulk volume V and porosity phi, define:

```
canonical water mass          M                      kg
liquid-filled bulk fraction   theta = M/(rho0*V)      dimensionless
geometric liquid volume       W = M/rho0              m³
pore volume                   Vp = phi*V              m³
remaining geometric pore air  Va = (phi-theta)*V       m³
water saturation              Sw = theta/phi
effective saturation          Se = (theta-thetaR)/(phi-thetaR)
```

Only M is an independent water stock. Residual water is included in it, not duplicated in a second inaccessible-water account. For this fully vented first definition use `thetaS=phi`; a measured fitted thetaS below actual porosity can reflect effects the first model does not represent and must not silently mean a fully water-filled pore.

Let h be water pressure head relative to the prescribed atmospheric pore-air pressure, in metres; z increases upward and total hydraulic head is H=h+z. With alpha in m⁻¹, n>1 and m=1−1/n:

```
theta(h) = thetaR + (phi-thetaR)*(1+(-alpha*h)^n)^(-m)  h<0
           phi                                                h>=0
K(h) = Ks * Se^ell * [1-(1-Se^(1/m))^m]^2                h<0
       Ks                                                h>=0
```

These are the retained van Genuchten/Mualem constitutive choices, not a soil calibration. I inspected all three local Rosetta equation images. Rosetta distinguishes saturated conductivity from an empirical matching conductivity in its fitted relation; the first declared definition must choose its matching policy explicitly, rather than assume every fitted parameter is the same Ks. Its source uses centimetres, so alpha, head and conductivity require explicit SI conversion. [USDA Rosetta hydraulic functions](https://www.ars.usda.gov/pacific-west-area/riverside-ca/agricultural-water-efficiency-and-salinity-research-unit/docs/model/rosetta-hydraulic-functions/).

For Se<1 the inverse retention curve gives the unique negative head. At Se=1 it only says **h>=0**, not h=0. An equivalent mixed relation is

```
h = h_ret(Se) + lambda
lambda >= 0,  1-Se >= 0,  lambda*(1-Se) = 0
h_ret(Se) = -(Se^(-1/m)-1)^(1/n)/alpha,  h_ret(1)=0.
```

Lambda is a pressure constraint unknown, not extra mass. Solve it with the flux balances and boundary conditions. A head-based nonlinear solve using the plateau theta(h)=phi is also acceptable provided its residual uses actual storage differences; it must not invert saturated M and invent an arbitrary pressure. Pressure may be temporary nonlinear state or a rebuilt warm start, but is not a second water inventory.

Declare a finite supported dry-head envelope. Exactly Se=0 sends this inverse to minus infinity; do not disguise unsupported extreme dryness with an unreceipted minimum moisture or a hidden conductivity floor. `Va` describes geometry only: this vented reference has no finite gas stock or pressure response. It cannot later resize a sealed gas cell using Va without the gas owner settling displacement.

USGS's maintained unsaturated-property interface separately exposes saturation, its pressure derivative and relative permeability. Those distinctions support a narrow constitutive owner; they do not require adopting its old FORTRAN callback layout. [SUTRA unsaturated functions](https://water.usgs.gov/nrp/gwsoftware/sour/special/unsat/unsat.htm).

## Why not add thetaS + Ss*h?

Explicit compressibility is a defensible alternative, but has a different state equation. For rigid pores and a declared constant isothermal water compressibility beta, one possible limited EOS is

```
rho(p) = rho0 * exp(beta*(p-p0))
M = V * phi * Sw * rho(p)
occupied water = M/rho(p) = V*phi*Sw <= V*phi.
```

At saturation, larger mass occupies the same pores by becoming denser. Linearizing reference-density stock near p0 gives `d[M/(rho0*V)]/dh ≈ phi*beta*rho0*g`, an Ss in m⁻¹. It is not extra geometrical theta. If the matrix also compresses, porosity/strain and the stress assumptions need an explicit owner; a matrix contribution to Ss cannot simply increase occupied water while leaving every volume interpretation unchanged. USGS defines compressibility and storativity in precisely distinct physical terms. [SUTRA glossary](https://water.usgs.gov/nrp/gwsoftware/sour/glossary/glossary.htm).

That alternative must transport **mass** using density-consistent Darcy flux, account for density in gravity and volume conversion, and define its isothermal/pressure-work limits before a heat join. It permits confined pressure-storage transients, but physical water compressibility is small: this is not automatically a cheap numerical escape. Inflating beta to make the solve easy changes pressure response and must be labeled as a different artificial model. Defer it until confined compressible storage is actually the next supported outcome; do not insert a tiny unnamed Ss merely to invert a singular matrix.

## One face transfer and the finite wet/dry boundary

For the first orthogonal vertical column, evaluate each internal oriented face once:

```
Q_ij = A_face * K_face * (H_i-H_j)/distance           m³/s
R_i = M_i(new)-M_i(old) + rho0*dt*sum(outward Q_i)    kg
```

Use the same signed transfer on the two adjacent residuals. An explicit series-resistance face rule is `Q=A*(H_i-H_j)/(d_i/K_i+d_j/K_j)` for half-cell distances. It has the correct homogeneous/layered saturated limit; nonlinear wetting-front accuracy still requires refinement evidence. Zero conductivity means a sealed face, not division by an arbitrary epsilon. The cell pressure solve, not a post-flux capacity clamp, enforces saturation.

Let P be finite pond volume, As its area, d=P/As and Qtop positive **from pond into soil**. With no external input in the first packet:

```
Pnew - Pold + dt*Qtop = 0
Mtop,new - Mtop,old includes +rho0*dt*Qtop
dnew >= 0
dnew-h_boundary,new >= 0
dnew*(dnew-h_boundary,new) = 0.
```

When wet, boundary head equals pond depth. When dry, boundary head can be negative and no pond water is created to maintain h=0. If a step exhausts P, its boundary equation changes and the joint solve determines the admissible flux. Do not solve infinite-pond infiltration and then independently clip, refund or clamp each side. Conversely, genuine upward seepage makes Qtop negative and grows that same finite pond.

The boundary head is the **face trace**, not the top cell-centre head. A finite pond may overlie an unsaturated top cell through its half-cell pressure gradient. Uniform surface area and hydrostatic pond pressure are first-case assumptions; rapid waves, preferential flow and surface crust contact resistance require separate evidence.

At a dry endpoint with Pold>0, backward Euler's average Qtop can consume the old pond. With Pold=0 and no supply, a dry accepted endpoint requires Qtop=0; exfiltration must activate the wet branch. Pond exhaustion timing still needs time refinement or bounded event splitting: endpoint complementarity alone is not accurate front timing. The no-ponding seepage condition in Gatti et al. is useful confirmation that pressure and flux cannot both be prescribed arbitrarily, but it assumes expelled water does not accumulate. It must not replace the finite pond equation here. [Gatti et al., sections2.1–2.2](https://arxiv.org/html/2407.07865v1).

The eventual surface/soil join has one physical interface-transfer owner. It solves against both endpoint stocks and admits one shared delta before either owner commits. Surface water must not rerun an infiltration rule; soil must not maintain a duplicate surface amount. Rain, drains or pumps later supply explicit finite or externally receipted fluxes, never biome-derived water creation.

## Saturated pressure is not an arbitrary initial condition

The retained `groundwater.mjs` proves two distributed descriptions with equal totals can require opposite **instantaneous** tendencies. Its .5 m positive-pressure branch stores0.4505 reference-density m³ in a1 m³ soil cell while geometric water occupancy is0.45 m³. That is compressible stock, and the file explicitly says it is not a Richards integration.

Deleting Ss changes that model. In an incompressible saturated region, arbitrary positive cell heads must satisfy the pressure/flux constraint immediately; they cannot be freely assigned from cell mass. Therefore the old equal-total swapped profiles remain representation evidence, but are not an integrated reversal oracle for this new closure. In particular, a sealed vertical column cannot release invented pressure-storage water just because an initializer assigns h=.5.

For a completely saturated all-Neumann connected component, the pressure operator has a constant nullspace and net imposed volume flux must be compatible. A numerical gauge alone cannot establish absolute pressure, the atmospheric seepage threshold or an actual water table. **First admission should require a physical head reference or unsaturated storage/contact that resolves this freedom, and reject otherwise-unanchored saturated cases.** Never remove net forcing by subtracting a mean, silently pin a pressure that contradicts saturation, or add fictitious capacity. A truly sealed confined aquifer's absolute pressure response is the later compressible problem.

## Smallest useful numerical path

Use one-dimensional finite volumes and backward Euler with the actual nonlinear storage difference. Begin with one homogeneous, declared soil and bounded head range. The supported solve must include cell saturation and pond wet/dry activity, update conductivity from the current iterate, and stop on **per-cell mass residual, total mass residual, head/flux relation and complementarity**, not merely small iteration changes.

My first linearization preference is an L-stabilized iteration with a boundary active set and a tridiagonal/bordered linear solve, followed by a bounded timestep reduction if the actual residual does not converge. L is an iteration aid multiplying the difference between consecutive iterates; that term vanishes at the solution and must never appear as physical storage or in a saved mass ledger. Derive its bound from the declared retention envelope. A Newton acceleration can wait until this simple baseline is measured; it must not become an unbounded fallback tree.

List and Radu directly compare these methods and explain saturation degeneracy; their L-scheme convergence result has hypotheses, including positive bounded conductivity and timestep/coefficient conditions. It is not a universal theorem for our new pond complementarity. Their paper also reports Newton/Picard failures on difficult cases. Use that to justify honest bounded failure rather than promising unconditional success. [List and Radu, sections2–4](https://arxiv.org/pdf/1507.07837).

Predeclare cell, timestep, nonlinear-iteration, active-set-flip, linear-solve and retry budgets before execution. Keep all iterates and receipts local until accepted. Unsupported heads, infeasible pore/pond capacity, nonfinite coefficients, incompatible pressure constraints or exhausted budgets leave the full input unchanged. Preserve stock/source bytes and fixed definitions through restart; rebuilt pressure guesses must not become independent authority.

The mass-conservative time-term choice is supported by Celia et al.'s checked abstract, which also warns conservation alone does not guarantee a good infiltration profile. I did not read its full paper and do not claim its benchmark parameters or a transplanted convergence theorem. [Princeton's author publication record and abstract](https://collaborate.princeton.edu/en/publications/a-general-massconservative-numerical-solution-for-the-unsaturated/).

## Independent fixtures worth authoring next

1. **Hydrostatic rest through a water table.** Choose H*=constant and h_i=H*−z_i with H* below ground: upper cells unsaturated, lower cells saturated, dry trace negative and Q=0. A second ponded rest has H*=ground+d. The exact head/zero-flux law is independent of the nonlinear algorithm; retain different retention definitions across a layer without creating a head jump.
2. **Saturated column between two finite reservoirs.** Use a top pond and a finite bottom-connected standpipe whose free-surface elevation supplies the missing physical head. With column resistance `Rhyd=sum(L_i/(Ks_i*A))`, reservoir areas A1/A2 and all cell pressures remaining saturated,
   `Q=(H1-H2)/Rhyd`,
   `DeltaH(t)=DeltaH(0)*exp[-t*(1/A1+1/A2)/Rhyd]`.
   Each soil cell keeps exactly its pore-water mass; reservoir transfers are opposite. These equations are a direct reviewer derivation from Darcy plus the two finite mass balances. Opposite initial head differences test infiltration and reversed seepage without any imaginary pressure-storage source. Pressure is linear in cumulative hydraulic resistance. This is a constraint-flow oracle, not pressure diffusion.
3. **Finite pond exhaustion and redistribution.** Start moderately unsaturated with a finite pond and sealed bottom. Compare total pond+soil mass, surface branch changes, actual profiles and depletion time under timestep and mesh refinement. A fresh dry surface with no rainfall must not infiltrate from nowhere. This nonlinear result needs an independent converged reference, not just conservation.
4. **Nonlinear method/reference checks.** The published mixed surface/subsurface test cases include water-table rise, drying and exfiltration; List/Radu supplies explicit van Genuchten coefficients and difficult nonlinear cases. Those are useful reference families, not claims that their2D tests have already been reproduced in a1D column. Obtain the exact applicable boundary/parameter/unit setup before naming a run a reproduction. Green–Ampt sharp-front infiltration is only an asymptotic approximation and cannot be labeled an exact van Genuchten oracle.
5. **Rejection and restore.** Exercise an unanchored saturated component, net incompatible flux, finite donor exhaustion, unsupported dry state, failed nonlinear budget and same-definition aligned save/reload. Verify no negative pond, overfilled pores, duplicated aquifer stock or half-applied face transfer.

At game voxel scale the soil wetting front and water-table position remain coarse finite-volume approximations. Their refinement error is a required disclosure; water-table presence, hydraulic connectivity and plant-accessible moisture cannot be inferred from one total bucket or a biome name.

## Source truth and custody

The downloaded original van Genuchten PDF remains unread: web text extraction has zero lines and screenshot requests did not expose a readable image here. Its hash is `c741c8655d2f2ea72a7fcfa0d05772a0ccc5963fe4052bfa03c91b453de91062`. No renderer/dependency was installed. I read the three supplied equation images, USGS's maintained constitutive/glossary pages, the mixed surface/subsurface and seepage papers' actual model sections, and List/Radu's equations/assumptions and example discussion. Several USGS full-report requests returned403; those are not claimed as full-text evidence.

Read local inputs: NEXT-CONTRACT `8fd2b5cc8050fae0d5d154d01f9aa428292c282fc35eafe1699ebcc1c0e1fedd`; source inventory `8e9c22ed4885da476f5f6f910a2ed3ab56e6629c710abf8cf3422f317363df38`; retained groundwater source `e198f26818760fbdcb8a42aa1d3d9ba61c5d9ab9b16e3e47f3c9916389cfb9ed`, result `5c44307fa5b9287650c784f2e9cb06fd2ca22bb1accba37bfe2d5a1885208105`. Existing supplied-image hashes match their inventory. Only this new decision note was written. Root owns the physical decision; no water/gas/world implementation or proof custody changed.
