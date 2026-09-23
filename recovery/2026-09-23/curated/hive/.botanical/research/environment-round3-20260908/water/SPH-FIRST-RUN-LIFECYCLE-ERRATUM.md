# First native reference: lifecycle review correction

2026-09-08. This supplements, and preserves unchanged, the earlier
`SPH-RESTART-DIAGNOSTICS-REVIEW.md`. Root owns the harness, diagnostics and
correction. This lane performed source inspection only, with no test or
upstream/harness changes.

## Observed invalid reference

Root's native run `u2748` exited 1. `../sph-library-fit/reference-v1.json`
retains the individual outcomes: freefall returned a passing JSON record;
compression and tank terminated with SIGSEGV (-11). Root's subsequent crash
trace reached the pressure boundary force path through an invalid rigid-body
pointer. These are harness integration findings, not a numerical rejection of
DFSPH. The nominal freefall pass also used invalid point-set topology and is
therefore diagnostic evidence only, not accepted physics.

The v1 reference source SHA256 was
`0134c5acafbe144e140421eac99a9b03f563f43e7311cb1413af7d74a4da9fa3`.
Root preserves the exact source, executable and failed evidence separately.

## Exact call chain missed by the initial review

All anchors are under the pinned upstream checkout
`../sph-library-fit/upstream`, revision
`f3f677140761db7637b5443beb54f19f1f835ed4`.

1. `Simulation.cpp:663` implements `setSimulationInitialized(int)`. Setting
   it to true calls `deferredInit()`; it is not a plain flag setter.
2. `Simulation.cpp:159` calls `FluidModel::deferredInit()` for every fluid.
3. `FluidModel.cpp:102` unconditionally calls `addPointSet`, overwriting the
   fluid's recorded point-set index with the newly appended index. This is
   non-idempotent registration, not a harmless refresh.
4. The v1 harness explicitly called `sim->deferredInit()` and later called
   `sim->setSimulationInitialized(true)`, registering each fluid twice.
5. `Simulation.h:22` assumes fluid point sets occupy the prefix
   `[0, numberOfFluidModels())`. Its boundary macro at line 48 treats the
   remaining point sets as boundary objects through unchecked casts.
6. `TimeStepDFSPH.cpp:1338` enters the Akinci pressure branch only when the
   pressure value is nonzero. With the duplicate fluid incorrectly classified
   as a boundary, `addForce` eventually reads it as a rigid-body owner. This
   explains why pressure-active cases exposed the defect while the unpressured
   diagnostic could complete.

The original first-shape statement that initialization was coherent was wrong.
This reviewer read the registration methods but missed the implementation of
the `setSimulationInitialized` immediate caller. Root identified the actual
cause from the executable trace; this reviewer independently confirmed the
source chain afterward.

An earlier tentative compiler/Eigen ABI lead is withdrawn. It was not supported
by the trace. In particular, fixed fluid vectors and matrices use `DontAlign`
in `Common.h`; the scalar kernel build and application also share the relevant
precision and neighborhood-search macros. No compiler change is prescribed.

## Smallest correct owner and next acceptance

Use exactly one fluid-registration transition for a newly constructed fixture:
after fluid creation and parameter setup, call
`setSimulationInitialized(true)` once, without an additional direct
`deferredInit`. Then register each static boundary exactly once through its
own deferred initializer. Root's chosen correction retains this order and
removes the later repeated initialized call. Creating DFSPH after the models
still allocates the required solver buffers. `setSimulationMethod` does not
repeat fluid registration.

Before the first physical step, assert the actual point-set count equals fluid
models plus boundary models; each fluid's index and user-data pointer match the
fluid prefix, and each boundary's index and user-data pointer match the boundary
suffix. For this one-fluid fixture that means fluid index 0, and boundary index
1 only in the tank. Checking counts alone would not establish valid mappings.

These are cold lifecycle checks, not per-neighbor runtime validation. They
should guard fresh fixture construction and the later restart constructor.
No solver equations, boundaries, timestep or acceptance thresholds need change
for this repair. Only a fresh run with valid topology can provide the first
physical reference result. Restart qualification remains pending that result.
