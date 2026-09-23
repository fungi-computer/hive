# Next gas method: separate solver cost from model error

2026-09-08, bounded Game CTO source review. Planning only: no experiment,
dependency installation, production edit, or revision of retained results.

## What the current source actually spends work on

`experiment.py:90–114` already implements a sparse, matrix-free pressure solve:
diagonal-preconditioned conjugate gradients over an edge list. “Use sparse
pressure” is therefore not a new solution. Each iteration allocates several
whole-cell lists and traverses the pressure edges in Python. The outer Newton
solve (`117–164`) starts pressure at zero on every transport substep and rebuilds
connectivity/components. Its line-search evaluations construct diagonal/pair
arrays even when they only need a residual (`evaluate` ignores `jacobian`).
`advance:176` repeats all this before every transport substep.

The retained finest local fixture records 2,192 substeps, 13,845 nonlinear
iterations and 1,372,602 linear iterations for 384 cells/724 total faces
(`RUNS.md:42–45`). This establishes repeated Krylov edge/vector work as the
largest counted algorithmic workload; it is not a profiler attribution of wall
time. Shared-host Python timing cannot establish browser or production cost.

There are cheap implementation improvements: cache topology and component pins
by actual geometry/opening revision, keep fixed interior coefficients in arrays,
avoid Jacobian allocations during residual-only line search, and compare a
stronger preconditioner against Jacobi. They would optimize the *same* model.
Pressure warm starts also require an explicit restart/determinism contract;
hidden warm caches must not silently change future canonical results.

## The defect speed alone cannot fix

Interior flow is algebraically proportional to pressure gradient with an
unvalidated Darcy drag (`139–140`); there is no stored momentum or advective
acceleration. The common tracer/heat mixing coefficient is also an unvalidated
closure (`180–194`). Geometry is a two-dimensional vertical section extruded
2 m, not a three-dimensional room (`23–28`). It cannot establish real 3D plume
entrainment, lateral bypass or turbulence. Sensitivity and refinement already
changed the claimed occupant benefit. A faster implementation cannot remove
those physical uncertainties.

## Smallest useful executable comparison, when a round is scheduled

Use the **same physical source, time interval, stair and breathing volumes** in
sealed, source-local outlet and remote-high outlet layouts. Preserve current
results as a rejected-comparison baseline. Add one low-speed Boussinesq
finite-volume reference on a staggered Cartesian grid:

- Cell unknowns: tracer mass and signed sensible thermal anomaly. Face unknowns:
  normal velocity, which is canonical future-affecting history. Cell pressure
  correction enforces incompressibility and is derived by the solve.
- Predict velocity from momentum advection, declared viscosity and buoyancy
  `g * (T-Tref)/Tref`; then solve one linear pressure projection,
  `D((dt/rho) G pi) = D u*`, and correct `u = u* - (dt/rho) G pi`.
  There is no Darcy drag and no nonlinear interior steady-flow iteration.
- Closed walls/floor enforce no penetration and declared no-slip tangential
  velocity. Exterior openings connect to resolved ambient side regions;
  ambient outer boundaries have hydrostatic-background-subtracted pressure
  zero and allow inflow/outflow. Inflow carries ambient temperature/zero tracer;
  outflow carries its computed donor contents. No imposed exhaust velocity.
  Resolve both directions within a tall opening. Compare doubled exterior
  extent to detect boundary-placement contamination.
- Keep pressure coefficients/topology cached between actual opening events.
  For this small frozen grid, compare a reusable sparse factorization with
  existing Jacobi-PCG on the *identical linear operator* before inventing a
  multigrid framework. Factorization fill and rebuild cost must be reported;
  no claim that this choice scales to a world follows.
- Advect tracer and heat conservatively with those same face fluxes. Begin with
  the existing bounded upwind transport to isolate momentum replacement;
  compare a limited second-order transport only if its diffusion still changes
  the layout decision. Thermal and species diffusivity are separately declared,
  not silently fitted to the desired clearing result. Recompute/subdivide on
  aggregate advective/diffusive bounds and split exactly at forcing events.

This reference remains a 2D Boussinesq approximation, not validated room/fire
physics merely because it uses momentum equations. If its refinement and
layout outcomes disagree with the drag model, that changes the approximation
decision; if they agree, it does not prove omitted 3D/turbulent effects are small.
Before describing household ventilation as physically calibrated, check a
published buoyant-flow benchmark and at least one matched 3D low-speed reference
for the source-capture decision. Those are separate acceptance tasks, not
unbounded runs hidden inside this first comparison.

## Independent acceptance, before interpreting speed

1. Verify projection/divergence, a manufactured flow, zero-buoyancy rest, and
   conservative bounded passive transport independently of the game fixture.
   Retain the existing mass `1e-10 kg`, heat `1e-5 J`, divergence `1e-8 m³/s`,
   positivity and canonical receipt checks. Test restart with face velocity
   preserved and shuffled input edge order. Opening changes must preserve stocks
   while changing subsequent flow.
2. Preserve the authored 80% export / 25% upstairs-exposure reduction target;
   reject rather than retune if it fails. Preserve timestep error ≤5% and
   spatial error ≤15% on fixed physical breathing neighborhoods. Start with
   0.5/0.25 m; a failed comparison does not authorize an automatic finer sweep.
   Report each layout, not only a favorable aggregate. A small sign difference
   below numerical uncertainty cannot become a gameplay guarantee.
3. Measure equal-error work, not equal grid size alone: accepted simulated
   seconds, substeps, matrix-vector products/iterations, factor/rebuild time,
   allocations, solve/transport CPU, peak memory and total wall time. Compare
   cold/rebuilt and stable-geometry cases separately in a bounded owned run.
   Require a concrete production budget from the eventual active-region
   consumer before claiming “fast enough”; the research output should publish
   the measured accuracy/cost curve, not infer world capacity.

Water volume displacement, sealed compression, oxygen chemistry, combustion and
phase change remain outside this fixed-volume reference. Retain explicit
rejection at those unsupported coupling boundaries. The current pail/brewing
delivery does not wait for this research comparison.

Source anchors: `experiment.py:21–77,90–164,174–224`; `DIAGNOSIS.md:48–53,82–124,138–156`;
`RUNS.md:36–45`; `PREDECLARED.md`; tracked
`docs/decisions/environmental-fields-and-openings.md:109–149`.
