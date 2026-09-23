# Particle-water method choice after the fixed-ledge SWE failure

2026-09-08. Source and numerical-method review, not a Unity/GPU run or a new
fluid implementation. Root owns the library build/API fit in
`../sph-library-fit/`, common units and cross-system coupling. This note adds no
game dependency, port, backend, production writer or new implementation scope.

## Recommendation

Use the maintained **SPlisHSPlasH DFSPH implementation as the first independent
three-dimensional reference** for actual voxel ledges, falling water and
containers. Keep the optimized SWE study as the regional shallow-water
candidate; its exact-reference and lake-balance results remain useful, while
the demonstrated moving-step failure remains disqualifying for arbitrary
ledges. Do not invent another pressure method to repair Lague's demo first.

Particles can own actual finite liquid mass and momentum. They can occupy
several vertical water surfaces at the same horizontal position, unlike our
single-bed SWE representation. This is a reason to test them as authoritative
water, not to restrict them to decoration. Constant particle count alone does
not prove incompressible occupied volume or calibrated liters. SPH interpolates
fields from particle masses, densities and kernels, and its force formulation
must preserve the required symmetry. [Müller et al., sections 2–3](https://matthias-research.github.io/pages/publications/sca03.pdf).

| Family | Useful first role | Cost or limitation to measure |
| --- | --- | --- |
| DFSPH | First maintained 3-D reference: pressure corrections for density and velocity divergence | Iterative neighborhood work, boundary/free-surface accuracy, convergence limits and retained warm-start state |
| IISPH | Targeted comparator if a declared DFSPH case fails or needs explanation | Its pressure projection offers a different convergence path; compare equal physical/error targets, not equal iteration counts |
| WCSPH | Simpler equation-of-state baseline if we need to isolate pressure or timestep behavior | Permitted density fluctuations, stiffness and smaller explicit stable intervals can dominate total work |

DFSPH combines density and divergence correction to limit accumulated
compression and improve stability. Its proposed advantages must be measured on
our fixtures; published large-particle demonstrations establish neither browser
nor server capacity. [Bender and Koschier](https://dankoschier.github.io/resources/papers/BK17.pdf).
IISPH derives a pressure projection using the actual symmetric SPH pressure
operator and continuity discretization. [Ihmsen et al.](https://pubmed.ncbi.nlm.nih.gov/24434223/).
WCSPH instead permits controlled density fluctuation through an equation of
state. [Becker and Teschner](https://diglib.eg.org/items/be5038ae-89ed-4988-b94c-1c4ee71e5caf).

## What was actually read in Lague's implementation

Pin: [SebLague/Fluid-Sim, 4717b7259718d349b0001c82836f24ce5fec81d7](https://github.com/SebLague/Fluid-Sim/tree/4717b7259718d349b0001c82836f24ce5fec81d7).
Root's `../lague-fluid-study/source-inventory.json` owns the copied files and
hashes. This is later repository code with 3-D, foam and count-sort work; it is
not claimed to be the exact revision used in the 2023 video Levi supplied.

The numerical source is `Assets/Scripts/Simulation/Compute/FluidSim.compute`,
with `FluidMaths3D.hlsl` and `SpatialHash3D.hlsl`; the immediate caller is
`Assets/Scripts/Simulation/FluidSim.cs`.

- Density uses a normalized quadratic spiky kernel; near-density uses a cubic
  kernel. Pressure is a linear density penalty and an additional near-pressure
  term. These are tunable quantities in the caller, not calibrated liquid units
  or a density/divergence convergence solve.
- The implementation groups particles by hashed support-sized cells and scans
  27 surrounding keys. This is a useful locality mechanism. Root's separately
  retained CPU translation proves a repeated-key case visits the same nearby
  particle twice: oracle `[0,1]`, pinned search `[0,1,1]`. That diagnostic is not
  a GPU execution result. Candidate-key deduplication or exact cell ownership
  must make neighbor membership correct before numerical comparisons.
- The primary pressure pair has a symmetric coefficient for equal masses,
  distinct positions and unique reciprocal neighbors. **The near-pressure pair
  is not generally symmetric.** Writing ordinary density as `rho`, near-density
  as `n`, the acceleration on `i` includes the denominator `rho[i] * n[j]`;
  the opposite pair uses `rho[j] * n[i]`. These differ unless the two density
  ratios happen to match. This is source algebra, not an executed GPU claim.
- For coincident particle positions the fallback pair direction is always
  `(0,1,0)`, so swapping the pair does not reverse the direction. An authoritative
  adaptation needs a deterministic antisymmetric coincident-pair rule or a
  qualified regularization, not a world-up impulse in both directions.
- A neighbor-count threshold applies explicit drag to sparse fluid particles.
  That is an external momentum/energy sink which must be disabled or accounted
  for in a closed-system conservation test. It cannot stand in for calibrated
  air coupling.
- The viscosity kernel reads neighboring `Velocities` while the same dispatch
  writes `Velocities`. Stage inputs need immutable reads and separate outputs.
  Pressure also reads neighbor velocity for foam while writing velocity; this
  affects secondary emission even when the primary pressure math is separated.
- Count-sort tie order is not stable, and no persistent identity field is
  reordered alongside positions/velocities. Identity, reproducible reductions
  and checkpoint recovery need explicit handling. A reordered array index is
  not a durable identity.

The demo also has a fixed 1/120 s prediction horizon and bounding-box position
collision response. Parent's `../lague-fluid-study/FINDINGS.md` owns the wider
clock/buffer/collision review. These adaptation findings reject a blind source
transplant; they do not reject SPH as a method.

## Maintained-reference source/caller observations

Pin: [InteractiveComputerGraphics/SPlisHSPlasH, f3f677140761db7637b5443beb54f19f1f835ed4](https://github.com/InteractiveComputerGraphics/SPlisHSPlasH/tree/f3f677140761db7637b5443beb54f19f1f835ed4).
Read `Simulation.cpp` method selection and `DFSPH/TimeStepDFSPH.cpp` under
root's seven-file source inventory. This is a source fit assessment; no
headless-reference execution is claimed here.

`TimeStepDFSPH::step()` does neighbor search, boundary contribution, density,
coefficient calculation, divergence correction, non-pressure forces, pressure
correction and motion. It exposes two iteration counters and error settings;
the source distinguishes Akinci2012, Koschier2017 and Bender2019 boundary
representations. Those are real supported alternatives, not a reason to write
a collision-only boundary and assume hydrostatic pressure is correct.

Three immediate caller issues matter before treating an ordinary `step()` return
as acceptance:

1. The method captures `h` at entry, calls `sim->updateTimeStepSize()` partway
   through, then uses the captured `h` for force integration, positions and time.
   `pressureSolve()` reads the current TimeManager size again. The first
   headless reference should use one externally pinned interval with automatic
   CFL updating disabled; adaptive integration needs its own source audit so
   every stage advances the same declared interval.
2. Both iterations stop at an **average residual or a maximum iteration count**.
   A returned step is not proof of convergence. Record cap hits, final residual,
   maximum/local compression and thin-stream/free-surface behavior. In the
   current divergence iteration the reported residual is zeroed when a 3-D
   particle has fewer than 20 neighbors; that suppresses a reporting term and
   does not establish accurate sparse-surface behavior.
3. Warm-start pressure fields are explicitly registered. With finite iteration
   limits they can affect subsequent results, so preserve them for exact
   checkpoint continuation or prove a deliberate reset policy separately.
   Neighbor indexes and boundary lookup caches are rebuilt derived data.

The public game clock remains the interval authority. Numerical substeps may
divide its admitted interval, but a frame cap, iteration cap or reference
TimeManager cannot silently discard world time. Root owns the smallest harness
that establishes that boundary; no new scheduler or game protocol is proposed.

## Fair next physical comparison

First qualify the maintained implementation on a still tank with the selected
boundary treatment, a simple gravity/free-fall control, and one bounded ledge
spill. This is a proposed next packet, not completed evidence or permission for
a long benchmark. Root should inspect first source shape and cost before larger
or finer fixtures.

- The solid ledge stays **0.54 m** under refinement. Do not replace it with a
  ramp, shrink the jump or suppress its collision geometry to help a method.
  Use the same fixed vessel, upstream liquid volume, gravity and observation
  times. Liquid resolution and boundary-sampling resolution are explicit and
  separate from the game's voxel dimensions.
- A small candidate is a finite `1.08 m × 1.08 m × 0.27 m` upstream block, volume
  `0.314928 m³`, inside a declared vessel with a 0.54 m downward ledge. Particle
  spacings 0.09/0.045 m represent 432/3456 equal-volume particles before boundary
  samples. That is only 3/6 layers of depth: deliberately report the resolution
  limit rather than promise a well-resolved continuum. Exact collision faces,
  support radius, boundary sampling and density initialization must be pinned
  before running; these numbers do not prescribe a production particle budget.
- Check total mass and finite positions/velocities; count wall penetrations and
  escaped particles; measure upstream/downstream retained mass, center of mass,
  free-fall trajectory and momentum balance including wall/gravity impulses.
  Record both raw density estimates and the reference's interior/free-surface
  classification so a deficient surface estimate cannot be called compression
  or silently excluded as success. Resolve a real dry gap below the falling
  stream when the geometry permits it.
- Compare horizontal/particle refinement and timestep refinement separately.
  Report density/volume error, boundary leakage and front/arrival metrics before
  timing. Run a finer/different maintained reference only when it answers an
  identified discrepancy, not as an unbounded solver tournament.
- The SWE Bernoulli pair is a separate mathematical bottom-path diagnostic.
  A free jet with vertical acceleration, impact and dissipation should not be
  forced to match that steady pair. Tank hydrostatics/free fall provide simple
  independent controls; an exposed waterfall still needs a declared physical
  reference before it can be called validated.

Same hardware and physical error targets decide performance comparisons.
Include neighbor build/search, boundary work, pressure iterations, other force
stages, checkpoint/transfer costs and memory; distinguish fluid particles from
boundary samples and rendered foam. Neither equal particle/cell counts nor
the demo's GPU frame rate is a fair capacity comparison.

## Composable authority if a particle method qualifies

Stable particle mass, position, momentum and needed solver history belong to one
numerical owner. A gameplay pail, pipe or terrain edit submits a finite transfer
to that owner; it cannot create independent visual liquid as replacement stock.
Particle insertion/removal requires exact mass and momentum receipts plus a
resolution/remainder policy. Wet solid replacement must settle displaced liquid
and work, rather than overwrite occupied geometry. These are unresolved joins,
not claims that the current demo implements them.

A regional SWE/3-D-liquid combination remains a candidate. It needs one
exclusive owner of water at each interface and equal opposite transfers with
momentum/energy treatment. Drawing SPH over a SWE cell while both own its full
volume would duplicate water. Conversely, secondary visual foam may have no
physical inventory if that choice is explicit. Gas displacement, soil exchange,
phase change and thermal accounting remain parent-owned cross-system decisions.

Current recommendation is therefore **DFSPH reference first, qualify real
geometry and caller next, choose production language/backend after evidence**.
Rust/WASM remains possible; nothing in this note establishes a need to rewrite
the maintained C++ reference or to port a demonstrated failed SWE face law.
