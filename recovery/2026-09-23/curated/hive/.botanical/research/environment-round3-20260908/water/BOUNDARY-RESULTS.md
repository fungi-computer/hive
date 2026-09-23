# Water cold admission and ownership checkpoint

2026-09-08. **The demonstrated ownership/admission gaps are corrected for the
isolated study's supported inputs.** No production integration or retiming sweep.

The accepted earlier numerical implementation and its evidence are pinned in
`accepted-optimization-v1/`. Current exact hashes are in
`boundary-handoff-inventory.json`; final executable evidence is
`runs/ownership-v3-stability-boundary/manifest.json`.

## Owner and immediate callers

`admission.mjs` owns unit/shape/topology/state validation, copying and retained
snapshots. `candidate.mjs` owns private canonical arrays and the numerical
workspace. Geometry/arrays are copied before admission; public geometry is a
separate deep-frozen copy. Checkpoints copy every field, face/adjacency array,
geometry value and event, so later caller mutation never changes solver truth.

`stableDt(maxDt)` now selects stability using that owner's private typed arrays,
with a positive finite ceiling. Scalar `time` supplies the externally scheduled
interval boundary. The ordinary shape is:

```js
const water = createStepper(completeCheckpoint, { units: SI_UNITS });
// The existing authoritative schedule supplies intervalEnd and maxDt.
const dt = Math.min(water.stableDt(maxDt), intervalEnd - water.time);
const receipt = water.step(dt, { withdrawRate });
// Only at a retained inspection/save boundary, outside the substep loop:
const ownedSnapshot = water.checkpoint();
```

`compare.mjs` and `boundary-proof.mjs` were updated to take candidate intervals
from this owner, then assert the dense reference independently returns the same
ceiling. They no longer use the oracle as the candidate's stability controller.
The complete-state comparison still intentionally reads a **study-only** lazy
inspection facade. That Proxy is not the intended production renderer/physics
data path, and ordinary callers must not scan it each substep. No new shared
transport protocol or security framework was introduced. A later bulk consumer
can use a copied export with an explicit shape/lifetime contract; no hypothetical
export API was added without that consumer.

Read-only borrowed fields expose numeric indexing, iteration and reduction,
without a mutable buffer, array mutators or callback receiving the backing
array. They expire on the next step/replace/edit invocation. Retained snapshots
are independent mutable copies for persistence/inspection. This is a trusted
JavaScript numerical-owner boundary, not a security claim against hostile
getters or concurrent shared-memory input.

## Replacement and edits

Constructor/admission validates pinned SI units/version, all canonical face IDs,
order/endpoints/stencils/lookups, positive consistent spacing/area, finite bed and
fields, stock nonnegativity, dry/solid momentum laws, closed-face report validity,
inventory conservation and the fixture's known edit flags/revision. This work is
outside the substep loop.

`replace(checkpoint)` restores fields/time only on exactly the same geometry,
solver settings and initial finite ledger. Matching lengths are insufficient:
different beds, units, openings, settings or initial supply reject atomically.
Restoring a different geometry revision requires constructing a new owner from
its complete validated checkpoint; replacing geometry is not an implicit edit.

Only `edit('gate-open')` and `edit('dig-pond')` alter the retained diversion
fixture: opening the authored horizontal gate or lowering region4 by0.1 m. They
preserve each cell's volume and retain the original explicit local momentum
dissipation. Repeated applied edits are no-ops. Unknown edits, changes on other
fixtures, filling/raising, solid insertion and arbitrary displacement are not
supported. This is the existing study law, not a generalized game digging API or
a conserved-energy claim.

## Final focused evidence

The first boundary run `run-u2661.scope`, invocation
`cd05760acd6245c88cc9b5635dba3d28`, exited0. Root's immediate-caller review then
identified external stability scanning as the next correction. It is retained
as the intermediate source/evidence, not claimed as the final API checkpoint.

The final run `run-u2677.scope`, invocation
`a9eff57b18944fdbbd465f8230a15d8e`, retained native session23039 through normal
exit 0. It completed six focused cases in about 1.3 s of measured case time:

- 29 corrupt state variants and 3 invalid units/options rejected.
- Input, retained checkpoint and sibling checkpoint geometry/history stay
  independent; supported borrowed state/receipt mutation paths reject.
- Same-shaped geometry/settings/supply replacements reject without changing
  state; exact-geometry checkpoint restoration remains exact.
- Owned gate/dig operations match the dense reference exactly and repeated
  edits do not change revision/time/stock.
- 100 intervals from the earlier real wet 120 s checkpoint, with restart midway,
  match every field, reported face flux, exchange, withdrawal and diagnostic;
  owner-selected dt equals the dense reference. Another 0.3 m³ reaches demand.
- Invalid calls/excessive interval leave canonical state unchanged and the
  smaller retry matches; five invalid stability ceilings reject. Stability plus
  step constructs0 typed arrays under constructor instrumentation.

**Full SWE distinguishes canonical momentum from its report.** Discarding its
last-flux `q` has exactly no effect on the next result here. Discarding `mx/my`
changes the next50 ms by0.054485185 m³ L1. This is not a claim that every solver's
face history is disposable: retained local-inertial `q` is future-affecting.

Earlier timing numbers apply to their pinned earlier source. The new lazy read
boundary has not been retimed; zero typed constructors is not a full hot-loop
performance measurement. Private arrays remain in the compute path, and no
per-face geometry revalidation occurs there. No longer benchmark was launched.

Next method proposal is `NEXT-QUALIFICATION-054.md`: radial/front qualification
and separate actual0.54 m step controls/limitation probes. It is not executed
or conflated with earlier0.1 m results. All owned proof sessions completed; no
game source, source custody, Git/build/deploy or live server was changed.
