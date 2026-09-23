# Standalone study API

`solver.mjs` is an authored numerical experiment; it imports no Hive source. Default `theta=.7` deliberately reproduces the rejected original candidate. Pass `theta:1` for the separately tested correction. `model:'swe'` selects the independently implemented reference candidate.

```js
import {makeFixture, stableDt, step, edit, serialize, restore} from './solver.mjs';
let state = makeFixture({n:32,model:'li',theta:1});
const candidate = step(state, stableDt(state,.05), {withdrawRate:.06});
// External transaction validates candidate interval/revision, paired exchanges,
// cell deltas, admissibility and full state/history; it never rescales the result.
state = candidate.state;
state = edit(state, 'gate-open');
state = restore(JSON.parse(JSON.stringify(serialize(state))));
```

* State: `V[cell]` m³ is the sole surface inventory. `q[face]` m²/s is persistent future-affecting LI discharge. `mx/my[cell]` m²/s are persistent SWE momentum per area. The small harness stores all arrays for convenience; unused arrays do not imply dual authority. SWE `q` reports its last mass flux and is disposable; SWE `mx/my` are not.
* Geometry: `z` m, `dx` m, `area` m², solid/open flags and revision. Stable integer face IDs have endpoints `a,b`, axis and aperture. A negative endpoint is an outer impermeable wall, never an ambient source. Canonical order is x faces then y faces. `faceOrder` can permute exactly-once evaluation, but paired reductions remain canonical.
* Receipts: signed `exchanges[id]` m³ from a→b, `withdrawals[cell]` m³ to `state.collected`, `interval.start/end/dt` seconds and `geometryRevision`. Receipts derive stored deltas. Consumer withdrawals are demands, not guaranteed transfers.
* Topology edits clone the state, preserve every cell volume, increment the geometry revision and explicitly dissipate affected LI discharge or SWE momentum. Excavation changes pond bed by -0.1 m, not occupied liquid. No filling/redisplacement operation is admitted by this API.
* `serialize` includes complete geometry, solver configuration, quantities, future history, time, step counter, topology events and collection ledger. `restore` is a study decoder, not production save validation or migration. Source hashes distinguish experimental semantics.
* `stableDt` supplies a 0.2 CFL ceiling; `step` requires a positive interval. LI owns its donor competition and Float64 exhaust reserve. SWE rejects an outflow/positivity failure; the caller must shorten/retry, not edit the result. The harness does not claim every inadmissible configuration is caught at the boundary.
* Diagnostics count LI wet **faces** using staggered discharge/transverse reconstruction, but SWE wet **cells** using momentum. Both omit h<0.01 m from displayed Froude distributions. Do not compare the two maxima as co-located velocity measurements. `limitedDonors` includes unsatisfied withdrawals and does not alone diagnose transport instability.

`experiment.mjs` suites are listed directly in source. Every suite saves its source snapshots and hashes in a fresh `runs/<stamp>-<suite>/` directory; use a unique stamp on repeat. Main runs retain complete snapshots at selected times and full final state, plus 10-second numerical trajectories. `manifest.json` describes completed experiments, not candidate acceptance. `results.json` consolidates dispositions and fixed-threshold comparisons.

All actual experiments use the retained proof wrapper/native session. No game command, backend, production save, Git, build or deploy is part of this study.
