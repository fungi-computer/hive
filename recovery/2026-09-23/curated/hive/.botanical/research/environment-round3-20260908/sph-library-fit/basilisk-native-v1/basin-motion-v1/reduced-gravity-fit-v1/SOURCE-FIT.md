# Use Basilisk's maintained reduced-gravity caller before considering another solver

**Recommendation:** accept `reduced.h` as the next caller-level gravity treatment
for this existing Basilisk reference. It is explicitly used by the library's own
standing-wave test with the same `centered + two-phase + conserving` stack. This
is an actionable reuse choice, not a new kernel or a claim that it has already
passed our basin. The current failed direct-gravity result remains frozen.

The exact proposed change is `caller-only.proposed.patch`: include `reduced.h`,
set `G.y=-9.81`, set `Z.y=.54`, and remove the constant `a` assignment. Keep the
literal basin, masks, water/air densities, zero initial velocity, 2 mm initial
surface, viscosity, timestep limits, solver limits and clock unchanged. Existing
energy/profile metrics still use physical g and the same root oracle. No source
patch has been applied, compiled or numerically executed.

## Actual maintained callers and mechanism

Paths below are relative to the frozen `../../basilisk/src` directory.

- `test/large-ns.c:6` includes `centered.h`, `two-phase.h`, `conserving.h`, then
  `reduced.h` for a **large-amplitude standing wave**. It sets G and initializes
  f, without a custom gravity kernel or uf-normal overrides. Its phases, amplitude,
  domain and resolution differ from ours; its existence is caller evidence, not
  numerical proof of our fixture.
- `test/gravity.c:9` uses `reduced.h` for a small gravity wave against a retained
  reference table. It has nonzero viscosity, different density ratio and ordinary
  centered advection. Its four uf-normal overrides and amplitude timing/maximum
  sampler must not be copied blindly into our conserving caller or replace our
  signed-mode/energy test.
- `examples/gaussian-ns.c:53` sets G and `Z.y=H0`, demonstrating the intended
  equilibrium-height reference. Its open boundaries are not our basin boundaries.
- `reduced.h:36` forms `(rho2-rho1)*G` and calls maintained `position(f,phi,G1,Z)`.
  `curvature.h:735` computes interface position using height functions first and
  the reconstructed **interface-area centroid** as fallback, not a water-volume
  centroid. It marks noninterface cells `nodata`.
- `iforce.h:96` adds `alpha/fm * phi_face * (f-f_neighbor)/Delta` to acceleration.
  The pressure gradient in `centered.h:411` uses that same alpha and face stencil.
  Its tree prolongation is temporarily made equal to p's prolongation to preserve
  this balance (`iforce.h:69`). This is the library's existing well-balanced
  interfacial-force mechanism, directly applicable to two-phase gravity waves.

The continuum transformation, with psi = G dot (x-Z), is:

```
rho = rho2 + (rho1-rho2)*f
q = physical_p - rho*psi
-grad(physical_p) + rho*G = -grad(q) - (rho1-rho2)*psi*grad(f)
phi = (rho2-rho1)*psi
physical_p = q + rho*psi
```

For our water-below-air convention and G.y=-g, phi on a positive crest is
`(rho1-rho2)*g*(interfaceY-.54)`; grad(f) points toward the water, giving the
restoring direction. The units are unchanged: q and phi are Pa; alpha*phi*grad(f)
is m/s². Z changes the hydrostatic/dynamic split, not physical gravity. Choosing
Z at the flat interface makes the equilibrium interfacial potential zero rather
than requiring cancellation of the full depth-dependent hydrostatic field.

## Lifecycle and real semantic differences

1. **Pressure meaning changes.** The solver variable p now holds q. Keeping its
   initial value zero is a zero *reduced-pressure guess*, not a statement that
   physical pressure is zero. It must be labeled accordingly; this is not an
   analytic standing-wave pressure or velocity injected into the simulation.
2. **Do not retain the old `a[]` assignment.** `iforce.h:30` allocates the mutable
   acceleration field when needed. Native `centered.h:346` resets that field
   before each acceleration event. The inherited order is reduced potential,
   interfacial force, then centered face prediction/projection. Retaining direct
   gravity would double-count it and can overwrite the field the module owns.
3. **Canonical fraction cleanup is a real difference.** `iforce.h:58` explicitly
   clamps active interface f to [0,1] before force evaluation. Our failed direct-a
   path recorded tiny signed overshoots without this cleanup. Do not describe the
   proposed maintained path as bitwise identical transport or claim strict raw
   conservation while hiding this step. No upstream patch is proposed to remove
   it. Existing phase-stock tolerance must stay fixed; any future receipt should
   separately expose pre/post force stock and the amount changed by native clamp.
   End-step f alone cannot measure cumulative clamp corrections.
4. **Existing temporary ownership stays upstream.** `position` may construct
   height fields; reduced gravity allocates phi; `iforce.h:130` deletes phi and
   clears `f.phi`. It restores fraction prolongation and frees its temporary list.
   This is real work to include in later timing, not a free algebraic rename.
5. **Keep our native wall setup.** No four uf overrides are needed to adopt the
   demonstrated `large-ns.c` stack. Our no-penetration/slip u callbacks remain;
   native pressure Neumann data follows the new a. At the pure bottom/top walls,
   interfacial normal force is absent and q has the corresponding homogeneous
   normal condition. New interfacial or geometric boundaries still need proof.

## Physical pressure and wall support

The current wave observer does not compare raw p with hydrostatic pressure, so its
profile/K/PLIC-energy measurements remain physically meaningful after the change.
Any pressure or support observer must reconstruct physical pressure; directly
using q would falsely remove the hydrostatic load.

For the existing literal basin's pure-phase bottom and top wall faces, use the
**actual native q ghost/interior trace**, as in the old basin observer, then:

```
q_bottom_face = (q_inside + q_bottom_ghost)/2
q_top_face    = (q_inside + q_top_ghost)/2
p_bottom_face = q_bottom_face + rho_water*g*0.54
p_top_face    = q_top_face    - rho_air*g*0.54
vertical_support = sum_x((p_bottom_face-p_top_face)*Delta)
```

This follows the actual face coordinates and physical transform. Equal-length
closed wall integrals cancel an arbitrary q gauge. In general coordinates use
`q_wall + rho_phase * G dot (x_wall-Z)` rather than these hard-coded distances.
At equilibrium it gives Mg; during motion the q traction contribution can change,
and the correct total relation is support minus Mg equals the rate of vertical
physical momentum. A time-varying wave must not be forced to have support=Mg.

Mixed cells or a wall crossed by the interface require phase-aware reconstruction.
`q_center + rho(f_center)*psi(center)` is a useful discrete field, but must not be
advertised as an exact mixed-cell volume average or exact two-phase wall trace.
Even the mean hydrostatic term contains a water-position moment:
`rho2*psi(cell_center) + (rho1-rho2)*f*psi(water_volume_centroid)`.
This distinction does not affect our pure bottom/top support formula.

There is also an evidence distinction: because the known hydrostatic component
is restored algebraically, observing Mg in a flat reduced-pressure rest case
would not independently prove that the pressure solver recovered that component.
Actual residual q, motion, traction/momentum consistency and the unchanged
standing-wave metrics remain the meaningful checks. No reconstructed pressure
or support result is claimed yet.

## Decision boundary

The source supports reusing this maintained force treatment. It does **not** yet
prove that direct gravity caused all observed excess or that reduced gravity
will pass the fixed high-density-ratio, inviscid wave. Do not replace our oracle
with a convenient demo crest plot, weaken physical limits, change mass/grid or
switch to a third numerical family. Parent can choose a single caller recut over
the existing frozen build. Any future compile/run, passive clamp/support fields
and timing scope require an explicit next handoff; none were started here.

Archive and exact read-file hashes are retained in `source-inventory.json`.
