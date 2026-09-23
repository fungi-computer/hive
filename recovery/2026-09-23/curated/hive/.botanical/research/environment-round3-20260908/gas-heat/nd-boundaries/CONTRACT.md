# Bounded 3D boundary qualification

2026-09-08. Independent reference cases over the unchanged `nd-checkpoint/`.
No new solver, room plume, geometry edit or production integration.

## A. Rectangular duct with actual solid walls

The fluid cross-section is always H=2.16 m by W=2 m, axial length 2 m.
Two x cells are periodic. A ring of solid cells surrounds the cross-section;
its fluid interfaces are fixed physical y=0/H and z=0/W at every refinement.
Cross-section counts 4², 8², 12² change spacing only, never fluid dimensions.
Fluid starts at rest. Axial acceleration is a=0.1 m/s², viscosity ν=0.1 m²/s.
There is no buoyancy or scalar diffusion/source. The exact solution is fully
developed axial startup Poiseuille flow, evaluated at t=2 s. The solver uses
dtMax=.005 s. Transverse motion, divergence, momentum stability and solid stock
are checked independently of axial error.

For axial speed u(y,z,t), the governing equation reduces to
`u_t = a + ν(u_yy + u_zz)`, with zero wall values and zero initial velocity.
Writing `λmn=π²(m²/H²+n²/W²)` for odd positive m,n gives

```
u = Σ [16a/(νπ²mnλmn)] sin(mπy/H) sin(nπz/W) (1-exp(-νλmn t)).
```

This follows from the independently integrated sine coefficient of the
constant forcing, `16a/(π²mn)`. Every mode satisfies its scalar ODE with zero
initial value. The reference evaluates the equivalent steady-minus-transient
form for efficient, accurate t>0 evaluation:

```
u∞ = a y(H-y)/(2ν)
     - 4aH²/(νπ³) Σodd sin(mπy/H)/m³
         cosh(mπ(z-W/2)/H)/cosh(mπW/(2H))
u(t) = u∞ - Σodd,m,n 16a/(νπ²mnλmn)
                    sin(mπy/H)sin(nπz/W)exp(-νλmn t).
```

The parabolic term has Laplacian `-a/ν`; each hyperbolic term is harmonic;
each transient mode satisfies the heat equation. This supplies a PDE check
independent of the solver stencil. The proof records finite-series initial
residual and truncation refinement, wall residual and modal ODE algebra. It
does not silently assume a truncated series is exact. The expected velocity
uses 511 odd-index cutoff for the steady series and 127 for the transient.
Initial-condition cancellation is separately refined through cutoff 255:
the preserved first run found 127's near-corner residual 1.283e-6 m/s just
exceeded the unchanged 1e-6 criterion. The reference-only diagnosis found
1.07e-7 at 255 and 1.72e-8 at 511. This correction increases reference
resolution; it changes no solver, physical case, t=2 reference or threshold.

For context, the same analytical class is discussed by Risch et al. (2019),
[Analytical Solution of the Time-Dependent Microfluidic Poiseuille Flow in
Rectangular Channel Cross-Sections](https://www.mdpi.com/2079-6374/9/2/67).
The formula and algebra above are derived here; that paper's numerical
implementation is not the oracle.

Acceptance: each refinement decreases axial RMS error by at least 20%; finest
relative RMS error below 5%; transverse speed <1e-9 m/s; cell flux imbalance
<1e-8 m³/s; Courant bound <=.45000000001. Reference truncation difference
<1e-7 m/s at declared points and initial residual <1e-6 m/s.

## B. Open straight duct transport

This is a separate **inviscid straight duct**, not an aperture contraction.
Fluid length 4 m, height 1.08 m, width 1 m; an explicit solid ring leaves finite
open x-/x+ faces. Both ends use the solver's ambient pressure, zero-gradient
velocity and clean ambient tracer/thermal anomaly. The initial axial speed
is uniformly .5 m/s; zero normal velocity at side walls is compatible with
this inviscid Euler solution. No viscous wall layer is claimed.

An initial scalar/thermal slab occupies x=[2,3) m, at concentration .001 kg/m³
and temperature anomaly 5 K; elsewhere both are zero. At t=3 s it has moved
1.5 m. Exactly half the initial slab remains; half has left x+. Imported and
exported air must each be `.5 × 1.08 × 3 = 1.62 m³`. Incoming air carries zero
tracer/thermal anomaly. Axial counts 8/16/32 refine transport over the same
physical domain; the cross-section is fixed at 2×2 fluid cells. dtMax=.025 s.

Acceptance: L1 field and scalar-export errors decrease at every axial
refinement; exact air import/export within 1e-9 m³; material ledgers within
1e-10 kg and 1e-5 J; no scalar in solid cells; no face connects fluid to solid;
max speed change <1e-9 m/s and flux imbalance <1e-8 m³/s. First-order diffusion
at a sharp front is expected and must be reported, not hidden by conservation.

## Budget and preservation

The single initial proof has a 30-second internal deadline checked between
short blocks, inside the ordinary run-proof guard. Failures/results are saved
with exact source hashes. No frozen source or earlier evidence is changed.
No contraction pressure loss, cave ventilation, 3D room plume, combustion,
water displacement, topology edits or large-world capacity is established.
