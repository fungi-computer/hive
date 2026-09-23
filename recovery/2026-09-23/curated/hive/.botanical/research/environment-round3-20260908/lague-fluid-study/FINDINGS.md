# Sebastian Lague fluid simulation: adoption findings

Personal Game CTO review, 2026-09-08. Levi supplied
[Coding Adventure: Simulating Fluids](https://www.youtube.com/watch?v=rSKMYc1CQHE).
The video's description/chapters and the author's code were inspected. No claim
to have played the entire video or executed Unity/HLSL is made.

Checked source: [Fluid-Sim commit 4717b725](https://github.com/SebLague/Fluid-Sim/tree/4717b7259718d349b0001c82836f24ce5fec81d7),
12 files pinned in `source-inventory.json`. This is the current repository,
including later rendering/foam/count-sort work, not necessarily the exact 2023
video revision. The source is MIT-licensed; retain its license if adapting code.

## Decision: adopt the useful mechanisms and test SPH as a real solver candidate

This is particle-based fluid dynamics, not a rippling-water shader. The source
evaluates density, pressure/near-pressure and viscosity from nearby particles,
then advances their positions and collisions. A fully 3-D particle method is
relevant to pouring, splashes, waterfalls and multiple vertical water surfaces.
It deserves a measured comparison for Hive's ledges and container flows, not an
automatic relegation to cosmetic effects. Neither the video nor the existing
small CPU checks establishes whole-world performance or game integration.

Concrete reusable mechanisms:

1. **Spatially grouped neighbor queries.** Hash positions to support-sized
   cells, group particle indices, and inspect only nearby buckets. This replaces
   an all-pairs search when locality/occupancy remain bounded. Memory, bucket
   collisions and worst-case clustered occupancy still need measurements.
2. **Compact reusable buffers and ordered stages.** Force/prediction, spatial
   grouping, density, pressure, viscosity and position updates have separate
   kernels. Keep the useful data layout and stage ownership; rebuild derived
   lookup data from canonical positions rather than saving it as another truth.
3. **Separate simulation and display.** The same particle state can produce a
   density surface and secondary foam/spray. Our low-resolution art can consume
   the result without making a visual particle equal a new physical water lot.

## Adaptations required by actual source/callers

- `FluidSim.cs` clips frame elapsed time and divides it into configured
  iterations. That is a demo pacing policy. Hive must accept intervals from its
  one authoritative world clock, select justified substeps, and retain/reject
  unfinished work explicitly. It cannot silently slow world time when rendering
  slows. Prediction currently uses a fixed 1/120 s horizon, separately from dt;
  its effect needs qualification rather than being copied as a magic constant.
- `ResolveCollisions` confines particles to a transformed bounding box. Editable
  terrain, solid walls, openings, narrow vessels and moving boundaries require
  an actual geometry owner and swept/contact tests. Boundary pressure treatment
  matters in addition to preventing particles from visibly crossing a wall.
- Particle mass, reference density and units must be explicit before connecting
  to our finite pail/kettle transfers. Constant particle count does not by itself
  establish an incompressible volume, a litre conversion, or a conservation law
  across particle creation/deletion/resampling and stored-item transfers.
- GPU kernels and rendering are not Rust/WASM code. Evaluate CPU/WASM and any
  WebGPU implementation against the same physical fixture and accuracy target;
  include initialization, transfers, sorting, solving and rendering separately.
  A CPU reference remains valuable even if a GPU path later wins.
- The count-sort scatter uses atomic increments for equal keys, so it does not
  supply stable particle ordering. Authoritative replay needs stable identity
  and an explicit numerical determinism policy.
- The viscosity dispatch reads neighbors' `Velocities` while writing that same
  buffer. It needs a read-old/write-new arrangement for a defined parallel update.
  This is a source-level race concern, not a measured GPU execution failure.

## A concrete lookup defect reproduced before reuse

`CalculateDensity`, pressure and viscosity iterate 27 neighboring hashed keys.
Distinct cells may map to the same key, and the checked implementation does not
deduplicate those queries or compare full cell identity. Distance filtering alone
does not prevent an in-radius neighbor being counted twice.

`neighbor-audit.mjs` translates the pinned hash/lookup and compares it against an
independent all-pairs query. With a 1000-entry particle table, radius 1, query
(.1,.1,.1) and neighbor (.1,.1,-.1), the oracle returns `[0,1]` while the checked
loop returns `[0,1,1]`. Deduplicating queried buckets restores `[0,1]` in this case.
Owned `run-u2704.scope`, invocation `ebe13b7cc6774ed29556d50a8a3e2871`, exited 0
for this diagnostic. Results are retained in `neighbor-audit.json`. This is a
CPU control-flow reproduction, not a Unity/GPU run, broad fix or performance test.
The mechanism remains useful; its adaptation needs collision-safe queries.

## Next method comparison

The water Astra owns the numerical assessment after the already-running bounded
radial/rest packet. Compare SPH against a suitable 3-D or step-aware reference
on finite tank/ledge/obstacle cases. Measure pressure/density error, mass and
momentum balances, boundary leakage, timestep/resolution sensitivity, replay and
active memory/CPU costs. Keep same geometry and initial physical quantities.
Do not port the current shallow-water face law unchanged after its demonstrated
moving .54 m ledge failure; agreement with our dense implementation is not proof
of the physical model. Do not declare SPH selected solely because a splash looks
convincing either.

Primary references linked by Lague include
[Müller, Charypar and Gross (2003)](https://matthias-research.github.io/pages/publications/sca03.pdf)
and the [SPH tutorial authors' resources](https://sph-tutorial.physics-simulation.org/).
The former explicitly treats free-surface particle fluids and symmetric force
construction. The larger tutorial PDF exceeded the browser fetch size in this
pass; its full contents are not claimed as read here. Independent method review
can use its relevant published sections at the next bounded checkpoint.

No runtime migration, shader dependency, new GPU provider or production change
has been made. Root retains cross-system acceptance and Delivery retains current
game source/release custody.
