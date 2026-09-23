# Environmental scale and consistency — Astra fork, 2026-09-08

Research proposal; no production edits, runtime lifecycle action, release, backend, or capacity claim. Owned evidence: `scale/accounting.py`, `scale/results.json`, `scale/proof.log`. Delivery retains source/Git custody. Read the current sprint and environmental, living-world, simulation/content, generation/streaming and mapping contracts.

## Actual starting boundary

`src/world.js:topologyNeighbors` serves actor routes through cardinal neighbors and the first finished stair; `blockedCells` includes unfinished wall plans. `movement.js:route/walk` consumes these rules. Neither is an air-aperture graph. `world-lab/terrain.js:createResidency` evicts regenerable terrain, while `main.js:drawLocal` requests its window. It owns no changed environmental state. `ticker.js` supplies 50 ms steps and clamps wall-frame delta; `clearing.ts:step` admits commands before pause, then advances work/growth. Current local behavior is not offline world advancement. These were reads of the active dirty tree, not a stable accepted source revision.

Share spatial identity, geometry revisions, paired accounting and clock boundaries. Keep water, gas circulation and thermal constitutive laws separate. A single `conductance × difference` function cannot establish all three.

## Canonical state and topology

Persist extensive quantities with declared units: water volume/mass, tracked constituent masses, and thermal energy in each modeled material. Temperature, concentration, water depth/head and pressure diagnostics derive from the selected constitutive state and geometry. **Future-affecting solver history is also canonical:** an inertial water method needs face discharge; a flow method may need velocity/momentum. A pressure-solver warm start is disposable only if discarding it cannot alter accepted results under the stated convergence policy.

Use closed solver-specific records, not one optional-field entity. Version geometry, units, solver semantics, quantization and state conversion. Logical storeys and visual `surfaceLevels` are not metres; choose explicit physical cell area/volume and vertical conversion in the numerical fixture.

A face has stable world/space/global endpoint IDs plus aperture identity, orientation, area and geometry revision. Chunk address is derived; changing storage partitions never creates a face or changes its identity. Geometry exposes material boundaries, void volume and openings; navigation, visual cutaway and enclosure queries consume separate projections. Completing/removing a wall invalidates adjacent conductance, connectivity and relevant solver dependencies at an effective tick. Reject stale proposals. Rebuilding a room-query graph cannot homogenize its air or lose heat. Volume-displacing edits need a conservative redistribution or explicit rejection; deleting occupied volume cannot delete its contents.

Future water occupancy → gas free-volume change needs one reviewed coupling transaction, including displaced gas and work/energy assumptions. It is outside the first independent fixtures.

## Accountable step

For each extensive quantity, require `new = old + external input − external output + named transformation`; internal face terms cancel. Finite-volume conservation follows from sharing interface flux in adjacent updates; that property does not establish stability or physical accuracy. [Clawpack's numerical-method explanation](https://www.clawpack.org/riemann_book/html/Approximate_solvers.html).

All proposals within a phase read the same immutable state/topology/time interval. Resolve total donor demand, then competing receiver limits before applying paired equal-and-opposite deltas. Ignoring space freed by simultaneous outgoing water is a safe initial restriction, with reduced throughput disclosed. Unaccepted proposals are discarded, never queued as owed physical transfer. Preserve a carried mixture's composition and associated energy through a family-specific bundled limiter; independent scalar clipping can falsify composition. Heat capacity relates energy to temperature; it is not a storage ceiling. Momentum, pressure constraints, positivity and stable timestep limits remain solver responsibilities.

For integer quantities, deterministic proportional allocation uses quotient/remainder arithmetic and stable global face-ID ties. Bounds and overflow must be checked. If fractional integration uses remainder state, persist it with the solver version and define closure/reversal/revision behavior; it is numerical history, not material stock. Rejecting flux cannot accumulate an unlimited debt. Merely quantizing floating outputs does not prove cross-engine replay; verify the supported implementation/runtime pair or publish authoritative results.

```text
advance(t, end, committedGeometry):
  stop at earliest forcing/topology/consumer event
  choose deterministic rational subdivisions allowed by all coupled solvers
  prepare frozen snapshot and solver history
  propose physical exchanges -> limit bundled quantities -> validate
  on numerical failure: discard candidate; refine dt within named limit
  on success: commit quantities + solver history + frontier together
  publish exposure/conditions from the agreed phase
```

Budget exhaustion retains/reconstructs the uncommitted continuation; it never publishes half an update or silently drops elapsed time. Use deterministic operation quotas, not machine elapsed time, for authoritative advancement. New work-created sources apply from their declared effective boundary, never retroactively. Pause admits intent but advances no physical process. Different rates require an explicit splitting/error policy; start with shared microstep boundaries within the bounded fixture. No per-render-frame environmental clock.

## Active work and bounded authority

Maintain due events ordered by `(effectiveTick, stableID)` plus dirty faces/regions at the mutation owner. Changes wake incident transport dependencies; continuing flux, inertia and numerical residuals can keep them active. A tracer plume's sparse footprint does **not** bound a pressure solve: include its actual global/component dependency or retain a declared approximation. First verify against a full reference scan before trusting sparse scheduling.

The first authority covers a fixed authored fixture, not the transitive closure of connected outside air or a watershed. Air has a bounded building/control-volume box and explicit atmosphere ports; their forcing and signed exchanges are accounted. This approximation omits outdoor plume recirculation. Water has a finite reach/cistern and explicitly declared reservoir, stage or discharge-history boundaries. No arbitrary chunk edge becomes an atmosphere or drain.

An opening into a changed or unknown finite neighbor requires its compatible state/history and a bounded membership decision, otherwise `needs-data`. Admission of additional area stops at named cell/face/work/byte bounds. Existing overload exposes a behind frontier; it cannot erase active work. Automatic repartitioning is not selected. A later measured grouping/splitting experiment must address shared faces and history before increasing the supported domain.

Within one authority, enumerate each physical face once, read coherent endpoint snapshots, and commit both chunks and the frontier in one logical checkpoint/manifest. Loading, duplicate halo observations or replay from the last committed frontier must not double-apply it. This needs no eternal per-face event log.

Across authorities, matching face IDs alone is insufficient. A future protocol must bind agreed interval, endpoint revisions, forcing history, owner epochs and one integrated flux; persist debit/credit/reconciliation progress and reject stale ownership. Epoch change cannot make an old transfer new. Numerical divergence is a solver defect; lost acknowledgments are an ownership protocol failure. Exactly-once amounts alone do not provide compatible pressure boundary states or avoid cyclic waiting. Keep these proofs separate; no backend implementation is proposed here.

## Sleeping, eviction, weather and LOD

Exact sleeping requires a proved zero-evolution interval: no unresolved flux/inertia/source, known constant boundary conditions and a next wake event. Tiny gradients may justify approximate sleeping only with explicit tolerances and accumulated error bounds. Changed sealed air, drained ponds, heat and solver history remain persistent even offscreen. Eviction saves a coherent frontier plus required pending/history state; a stale save completion cannot clear newer dirty data. Render LRU releases only presentation.

Weather is versioned forcing over intervals: outside temperature/pressure or wind assumptions, rain mass, solar input and exchange accounts. Advance only through known forcing/boundary history; a return-time weather sample cannot reconstruct exposure or plant growth. Pristine outside fields may be implicit under that model; changed fields cannot regenerate to defaults. Required histories compact only after dependent cursors/checkpoints preserve their meaning.

Map LOD changes display sampling, never environmental resolution. A later room/region aggregate must conserve extensive quantities and declare lost gradients, stratification, momentum and exposure detail. Refinement cannot recover unknown fine history. Coarse/fine time or space coupling needs common integrated boundary flux or a conservative correction: AMReX explicitly uses flux registers because independently computed coarse/fine exchanges disagree. This motivates an acceptance test, not adopting AMReX. [AMReX source documentation](https://amrex-codes.github.io/amrex/docs_html/AmrCore.html#using-fluxregisters).

Always-alive behavior therefore means advancing to the known-input frontier using the supported exact/approximate model, with visible catch-up when needed. Neither a timestamp nor conserved totals proves accurate unattended evolution.

## Bounded evidence and next experiments

`scale/proof.log`: guarded scope `run-u1686`, retained session `62531`, exit 0. Python scalar fixture, 24 steps, no Hive imports. All nine load-order/partition combinations of the same 64² domain (1/4/16 partitions) have identical per-step hashes, zero balance error, explicit boundary net +32, and equal restore-after-step-5 trace through close/reopen events. Donor competition safely allocates five units as three/two; independent per-edge limits produce −5 remaining. Mutating a three-cell chain sequentially yields `[5,3,2]` versus `[5,5,0]` under reversed edges.

For 1/4/16 actual 16² chunks: idle face evaluations were 0/0/0; one fixed 16² disturbed patch used 2,600/3,732/3,732 evaluations; fully disturbed volumes used 2,600/6,888/21,608. This illustrates sparse-frontier potential only. The toy copies all cell state each step, uses a seven-unit quantization deadband, ignores momentum, and has no physical timestep calibration. Timings are single-run Python observations; no browser/memory/distributed/offline/100-person/Minecraft capacity claim follows.

Next: run each actual water/gas solver on identical geometry split into 1/4/16 chunks and signed-coordinate/load-order permutations; compare complete cell **and face-history** traces. Exercise cross-boundary donor/receiver competition, sealed equilibrium, active pressure circulation, topology revision mid-candidate, forcing discontinuities, restart with residuals, missing history and real decoded-state eviction. Compare sparse/full traversal and dt/dt÷2/dt÷4 accuracy. Separately measure proposal, global solve, commit, active/total bytes, checkpoint and rendering costs. Distributed crash/duplicate/reordered-boundary tests belong to a later independent protocol experiment.
