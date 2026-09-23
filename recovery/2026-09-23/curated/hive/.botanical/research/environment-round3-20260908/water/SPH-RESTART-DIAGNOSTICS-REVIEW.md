# Headless DFSPH restart and diagnostics contract

2026-09-08. Independent read-only review of root's actual upstream checkout at
`../sph-library-fit/upstream`, commit
`f3f677140761db7637b5443beb54f19f1f835ed4`. Root owns the compiled reference and
harness; this note changes no upstream/game source and runs no new proof.
All paths/line anchors below are relative to that checkout.

## First useful proof

Use one fluid, static pinned boundary geometry, constant admitted dt with
`CFL_NONE`, one recorded thread configuration, and no emitters, animated solids,
drag, surface tension, viscosity or other stateful force extension. Initially
disable Z-sort explicitly. This isolates physical/restart behavior; it does not
qualify adaptive steps, moving boundaries, production parallelism or reordering.

Run two fresh instances from the same authored initial state and compare their
actual outputs. Then retain an exact native-precision checkpoint from a state
with real pressure activity, continue A, destroy it, recreate the same fixture,
restore the checkpoint and continue B for the same fixed intervals. A fresh
process reading a real checkpoint file is stronger than an in-process copy;
either must be labeled accurately. Compare fields by stable particle ID, masses,
time and both warm starts, together with the declared physical observations.
Require the checkpoint to contain a nonzero pressure or divergence warm-start
field; a zero-pressure free-fall case alone cannot exercise pressure history.

Do not assume exact continuation before measuring it. Rebuilt neighbor order
can affect floating reductions even without Z-sort. Preserve the first mismatch
and distinguish physical tolerance from bitwise equality instead of changing
the claim. A physically valid restart remains distinct from a repeated run.

## Exact retained fields for this deliberately fixed fixture

| State | Direct public anchor | Ownership / treatment |
| --- | --- | --- |
| Time and dt | `TimeManager.cpp:50`–`79`: get/set time, get/set step size, save/load | One external interval owner; copy both exactly |
| Particle positions and velocities | `FluidModel.h` getPosition/getVelocity | Copy each component in `Real` precision, preserving source array order |
| Particle mass and shared reference volume | `FluidModel.h` getMass/setMass, getVolume | Preserve both; volume is one `m_V` shared by this fluid model |
| Active count and particle state | `FluidModel.h` numActiveParticles/setNumActiveParticles/getParticleState | Fixed all-active population in first fixture; validate rather than imply emitter recovery |
| Particle and object IDs | `FluidModel.cpp:62`, `FluidModel.h:357` | Copy identity; do not substitute array index after sorting |
| Density-pressure warm start | Registered field `"p / rho^2"`, `TimeStepDFSPH.cpp:51` | Copy opaque scalar verbatim |
| Divergence-pressure warm start | Registered field `"p_v / rho^2"`, `TimeStepDFSPH.cpp:52` | Copy opaque scalar verbatim |
| Fixture, parameters and static boundary | Authored harness definition plus exact source/config hash | Recreate and require an exact match; shape equality alone is insufficient |

The two warm arrays are **not raw physical pressure at a step boundary**:
`pressureSolve()` multiplies its stored value by `h²` before returning;
`divergenceSolve()` multiplies by `h`. The next solve applies its own clamped,
half-weighted inverse-interval warm start. See `TimeStepDFSPH.cpp:287`–`299`,
`:367`–`380`, `:445`–`456` and `:518`–`535`. Save/reload must not rescale them.
Both warm-start macros are enabled in `TimeStepDFSPH.h:9`–`10`.

`factor`, `advected density` and `pressure acceleration` are registered working
fields. The next fixed pressure-only step recomputes them from admitted state;
they are useful diagnostics, not additional canonical history for this fixture.
The ordinary density and acceleration fields are similarly recalculated before
the relevant force use. Different enabled force modules can add history and
must be reviewed before widening this contract.

Use `FluidModel::getFields()` or validate the returned field's exact name and
`FieldType::Scalar` before using its `getFct(i)` pointer. **Missing field names
silently return the first field** in `FluidModel.cpp:378`–`391`; an unchecked
lookup can write pressure bytes into an unrelated field. Copy data out of the
pointer, never retain pointers across destruction/reallocation.

## Why upstream save/reset is insufficient by itself

`Simulation::saveState/loadState` (`Simulation.cpp:769`–`787`) handles `W_zero`,
model auxiliary state and the timestep virtual save/load. `FluidModel` binary
save (`FluidModel.cpp:722`–`765`) writes active count, particle states, force
extensions and emitters. **It does not contain position/velocity/ID arrays.**
DFSPH does not override the empty `TimeStep::saveState/loadState` methods
(`TimeStep.h:51`–`52`), so those binary calls do not save its warm starts either.
`TimeManager::saveState` separately stores time and dt.

The complete application path is `SimulatorBase::saveState/loadState`
(`SimulatorBase.cpp:1700`–`1884`): parameters and auxiliary binary state plus
registered `storeData` particle fields in separate `.bgeo` files and separate
boundary data. `writeFluidParticlesState` explicitly casts every `Real` scalar
and vector component to **float** (`:2115`–`2131`). This cannot establish exact
double-precision restart. Loading missing particle files merely warns/returns;
a changed scene MD5 also only warns. Those are application policies, not a
validated atomic game checkpoint contract. Root's small harness can use exact
typed copies without importing that application save system.

`Simulation::reset` (`Simulation.cpp:517`–`538`) restores authored initial
particles, resets forces/warm starts, sorts if enabled, resets the sort counter
and time to zero. It does not restore a retained midpoint or reset dt.
`FluidModel::reset` (`FluidModel.cpp:202`–`240`) restores initial positions,
velocities and IDs. Calling reset after restoring warm state destroys the
meaning of the intended continuation.

## IDs, sorting and the next separate law

Upstream does preserve particle identity while sorting. `FluidModel` applies
one neighbor-search permutation to position, velocity, acceleration, mass,
density, IDs, object IDs and particle state (`FluidModel.cpp:338`–`357`), then
rebuilds `particleId -> index`. DFSPH applies that same permutation to **both
warm-start arrays** (`SimulationDataDFSPH.cpp:83`–`103`). The simulation-level
sort owns the ordering across fluid, boundary and timestep consumers
(`Simulation.cpp:627`–`646`); do not call only one model's sort.

Two restart gaps remain if sorting is enabled: `Simulation::m_counter`, which
controls the next scheduled Z-sort, is not included in its binary save; and
direct ID field restoration does not rebuild the protected inverse ID map.
The application load's final sort call is commented out. First disabling Z-sort
and keeping original ID/index order avoids pretending those paths are solved.
For the later sorting law, capture per-ID mass, state and warm fields, call the
single simulation sort owner, and verify the permutation preserves each. Then
qualify restoration at a sort boundary and subsequent numerical continuation.
Any change in reduction order must be reported, not hidden by sorting only the
printed output. No unsupervised sorting/counter setter is proposed here.

## What is actually observable about convergence

- Pressure iterations: `TimeStep::getNumIterations()` / DFSPH override
  (`TimeStepDFSPH.h:75`).
- Divergence iterations: the registered read-only numeric parameter via
  `step->getValue<unsigned int>(TimeStepDFSPH::SOLVER_ITERATIONS_V)`.
- Limits/tolerances: `MAX_ITERATIONS`, `MAX_ITERATIONS_V`, `MAX_ERROR`,
  `MAX_ERROR_V`, `MIN_ITERATIONS`, `USE_DIVERGENCE_SOLVER`; initialized and
  registered in `TimeStepDFSPH.cpp:75`–`114`.
- **Final numerical residual is not retained or publicly returned.**
  `avg_density_err` is local in each solve; loops stop on tolerance or the cap.
  A count equal to the cap is conservatively a cap hit, not proof of failure or
  convergence on its own. Do not print a fabricated residual derived from count.

The pressure test compares an average one-sided residual to
`maxError * 0.01 * rho0`. Divergence uses an average one-sided residual threshold
scaled by `1/h`. They are not maximum per-particle error guarantees. In 3-D,
particles with fewer than 20 neighbors have a reporting residual suppressed
(`TimeStepDFSPH.cpp:674`–`699`); the sparse/free-surface population must be
reported alongside any compression/divergence assessment.

The stored density after `step()` is the **pre-advection** estimate: it is
computed early (`:150`), and positions are advanced later (`:233`) without a
second density evaluation. `advected density` is a solver working quantity,
not a fresh terminal density map. For physical compression at checkpoint
positions, evaluate a nonmutating observation using the pinned kernel,
reference volumes and chosen boundary contributions. A small all-pairs
observation is legitimate cold proof work if its cost is labeled; it must not
be timed as the production neighbor query. Calling live neighborhood/sort or
an extra solver iteration merely to obtain a diagnostic can perturb the state
or schedule being compared.

## One physical-unit correction before the first receipt

`FluidModel::initMasses` (`FluidModel.cpp:243`–`259`) initializes 3-D reference
volume to `0.8 * diameter³` and mass to that volume times reference density.
The density/pressure neighborhood laws use `getVolume`, not only `getMass`.
The shared volume is returned by reference for every particle index.

Therefore the earlier proposed block's geometric envelope `N * spacing³` is
**not** the unmodified upstream represented volume when spacing equals
diameter. Report `sum(mass)/rho0` and geometric envelope separately. If the
harness deliberately sets volume to `spacing³`, set shared volume once and
every mass consistently, then label and qualify that initialization choice.
Changing masses alone creates inconsistent pressure and inventory quantities.

## Scope of the proposed first result

One short repeated run plus one actual fresh checkpoint continuation, with
physical mass/trajectory/boundary observations and honest iteration counters,
is enough for the next source decision. It is not proof of whole-library save,
arbitrary forces, GPU/parallel determinism, particle emission, reordering,
cross-platform binary portability or production game integration. No broad
methods survey, full-library fork or rerun was performed for this review.

## Immediate root harness first-shape review

Read root's `../sph-library-fit/reference.cpp` and `compile-reference.py` before
the numerical run. The following is a source disposition, not a claim that the
subsequent executed bytes or numerical results have been reviewed.

Initialization is coherent: the fluid is created before deferred point-set
registration and before DFSPH field registration; the static boundary is added
and separately registered; `updateBoundaryVolume()` uses its own temporary
boundary query and is safe before timestep creation in this one-static-boundary
case. FluidModel's `init()` enables a default viscosity method, which the
harness explicitly disables. XSPH is allocated but both coefficients default
to zero in `XSPH.cpp:16`–`21`; its step returns without changing the state.
The harness pins `CFL_NONE` and disables Z-sort. Its native double flag matches
the checked CMake cache; the upstream library has OpenMP and AVX disabled, so
the application link flag alone does not establish parallel-kernel execution.

The independent final all-pairs density observation uses the selected kernel,
shared fluid reference volume and static Akinci boundary volumes. It is outside
the timed step loop and does not mutate the live neighbor cache. Its count named
`finalParticlesWithFewerThan20FluidNeighbors` is literally fluid-only; the
upstream divergence threshold counts fluid plus boundary neighbors, so those
must not be presented as the same diagnostic.

No initialization blocker was found for the bounded diagnostic run. Corrections
sent to root before physical qualification:

- The compression pass condition currently checks mass, COM/momentum and no
  cap hit, which could pass if pressure did nothing. Require initial density
  excess and actual pressure/warm-start or expansion activity, and compare final
  compression to that initial state. This is a nonvacuous pressure exercise,
  distinct from a full physical validation.
- Check finite stored density and independently computed terminal ratio
  explicitly; a `std::max` accumulator can silently ignore NaN.
- Tank momentum/COM differences are measured against free-fall expectations;
  static walls exchange momentum with the liquid. Label those as wall-induced
  differences, not unexplained conservation errors. The initial tank check is
  particle-center penetration against declared planes, not finite-radius
  contact or hydrostatic pressure validation.
- The cap counters are honest conservative diagnostics. They still do not
  expose the discarded final residual or certify the full free-surface solution.

Root remains the sole harness writer and will own any corrected source pin,
compilation, run and resulting acceptance.
