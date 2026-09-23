# Water: executable round-three optimization checkpoint

2026-09-08. **Retain the full-SWE method and this optimization direction.** The
candidate reproduces the pinned dense reference exactly on every tested
interval, with substantially less allocation and measured work. This qualifies
an implementation change on bounded fixtures; it does not validate all required
water physics, establish browser capacity, or select a production backend.

Only this ignored `water/` directory was written. No tracked source, old evidence,
game state, Git, build, deployment, visible writer or server was changed.

## Exact code and method

- Dense `reference/solver.mjs`: SHA256
  `3df6b17552e9dfedbb5a75cb9768615c47466d5fccaeaafcd15d9a4ea59c299e`.
  Original source/docs and their hashes are preserved in `reference/manifest.json`.
- `candidate.mjs`: SHA256
  `ee49c25ead481a569b8acfef312411502077d3a293e4d10f7774e5402272d8f6`.
  Unchanged through all four completed runs below.
- First working-shape source review was sent to Game CTO before the wet-receipt
  followup; Game CTO accepted the optimization direction and identified the
  admission/lifetime boundary corrections recorded below.

The retained full shallow-water method is first-order Rusanov with hydrostatic
reconstruction, explicit Manning drag and its original positive withdrawal
operator. Numerical fluxes, canonical reductions, global CFL interval and
diagnostics retain the dense arithmetic. The candidate specializes that method;
it does not restore the rejected local-inertial approximation.

One stepper owns reusable scratch and two output field buffers. An active face
list skips only faces with exactly zero volume, momenta and conservative face
history on both sides. All wet boundaries retain pressure forces. There is no
film threshold, evaporative cleanup, independent chunk clock or sleeping pond.
The list is rebuilt canonically every interval. That still scans all faces and
cells and clears scratch: expensive numerical face evaluation is reduced, not
the whole domain's complexity or residency.

## Completed evidence

`runs/first-shape-qualification/manifest.json` contains seven passing cases:

- Identical physical terraced beds/solid cells/regions on 32² and 64² grids:
  4,096 refined cells checked, 2 m versus1 m horizontal spacing, fixed0.1 m bed
  increments. Horizontal refinement never changes the physical terraces.
- Eight-second stepped partly dry lake: zero depth drift, maximum momentum
  approximately1.735e-17 m²/s, exact dense/active agreement at every interval.
- Short32²/64² stepped diversion with gate opening, geometry edit and restart:
  all quantities, momenta, reported face fluxes, signed face/withdrawal receipts,
  interval/revision and diagnostics identical at every accepted interval.
- Frictionless dry dam-break: analytic normalized depth L1 error
  **4.3236%→3.0329%** at64²→128², preserving the earlier8% threshold.
  Restarts exactly reproduce continuation; no negative stock is introduced.
- A deliberately excessive100 s interval is rejected without changing canonical
  state; retrying the smaller CFL interval exactly matches dense output.

The short diversion barely wetted the pond and had zero demand uptake. We did
not claim that run covered meaningful withdrawal or wet excavation. The
separately declared `runs/wet-receipts-wet-receipts/` closes those paths with a
32²,120 s open/closed comparison,2 s gate opening and40 s wet excavation:

| Result | Open diversion and excavation | Closed diversion |
| --- | ---: | ---: |
| Initial finite inventory |115.2 m³|115.2 m³|
| Final pond |29.737773885 m³|0 m³|
| Final collected downstream demand |4.966715325 m³|5.365932376 m³|
| Maximum inventory balance error |2.132e-13 m³|1.848e-13 m³|
| Expensive active/dense face evaluations |930,479 /5,068,800|510,315 /5,068,800|

At excavation the pond held5.733860752 m³; every cell volume remained unchanged
at the geometry edit. Nonzero withdrawal receipts were exactly equal in all
implementations. Every interval through2,400 steps matched, and60 s reload
continued exactly. Discarding saved SWE momenta changes the next50 ms by
**0.107549643 m³ L1** in the open case, proving that momentum history cannot be
reconstructed from volume alone.

The new120 s schedule is an implementation exercise, not a reclassification of
the earlier failed600 s downstream-shortage criterion or a convergence study of
new parameters. Earlier failures and longer observations stay retained.

## Work and timing

`runs/first-timing-timing/` compares160 intervals at64²,4 simulated seconds, with
five rotating-order samples after short warmups. Every final state is exact.

| Scenario | Original dense p50 | Reusable dense p50 | Active p50 | Active / dense face work |
| --- | ---: | ---: | ---: | ---: |
| Moving channel,10.9375% initially wet |290.517 ms|57.055 ms|34.611 ms|11.6226%|
| Fully wet, moving surface |365.274 ms|144.796 ms|174.774 ms|100%|

The sparse target (halve expensive face work) passed. The fully wet target (no
more than10% regression versus original dense) passed. Most initial speedup came
from workspace/source simplification, not activity alone. The fully wet active
median was about20.7% slower than the reusable dense median; do not advertise
active selection as universally free. That difference also has substantial
shared-host noise: fully wet original/active p95 were1307.546/883.153 ms, from
only five observations. A larger or exclusive benchmark is not justified by
these numbers yet; later device qualification needs explicit budgets.

At64² the original creates15 typed arrays totaling728,064 bytes per substep.
The candidate allocates a fixed942,592-byte typed workspace/state-buffer pool,
then no size-proportional typed arrays per substep. At32², an independent tiny
constructor-interception check measured the original15 arrays/183,808 bytes and
candidate0 arrays/0 bytes directly. That check also verified a retained snapshot
and constructor input after four later steps, and preserved a1e-15 m³ positive
film exactly. It measures public typed-array constructions, not V8 hidden heap
activity; O(1) receipt/state objects, initialization, replacement and retained
serialization still allocate.

The timed process peaked at394,100 KiB RSS including Node, reference garbage,
geometry objects, all variants, saved states and JSON comparisons. This is not
the kernel resident-memory footprint. The942,592-byte pool includes two output
state buffers plus scratch/indices; geometry and input/retained snapshots are
additional. Every interval still scans8,320 faces and4,096 cells on this fixture.

## Immediate boundary corrections and next method decision

Use the optimized full-SWE source as the next numerical implementation candidate,
with the pinned dense source as oracle. Do not replace or discard the oracle
until independent method and geometry qualification exist. No algorithm novelty
or better-than-human physics claim follows from eliminating wasted allocation.

Before a shared consumer or language port, bind geometry and units at admission
and replace: canonical face IDs/order/endpoints, array lengths, positive spacing
and area, bed/solid/boundary consistency, version/revision and valid inventories.
The current `replace` checks only model and shape. It is a research API, not a
production decoder. Validate there, never by revalidating every face in the hot
loop. Root owns the shared field interface; no parallel protocol was invented.

Returned state and receipt arrays are borrowed until the next step/replace.
`checkpoint()` allocates retained numerical arrays; its geometry currently
relies on caller immutability, and returned state is not protected from caller
mutation. Production needs an actual authority/lifetime boundary, with geometry
owned or immutable and retained checkpoint content fully independent. These
limitations do not alter the completed single-owner test results.

The0.1 m vertical fixture is its own physical geometry. Root's world-generation
pilot has proposed1 m horizontal and0.54 m vertical voxels (four per2.16 m
storey); we do not pretend the two already share a production unit contract.
Root will decide a common contract and explicitly qualify steps at that scale.

Method work still required: rotation/front convergence including threshold and
subcell initial-shape sensitivity; steep/shallow hydrostatic-reconstruction
limitations; appropriate momentum/energy treatment of edits; explicit topology
for stacked/cavern water, waterfalls and pipes; groundwater/soil retention;
water-air displacement and thermal exchange. This one-bed SWE model cannot
silently claim those cases. Rust/WASM remains a provisional implementation
choice, not a replacement for this physical and ownership qualification.

## Ordinary terminal records

All commands used the existing10-minute/5-second run-proof wrapper. No shell
backgrounding. Native sessions were retained and polled through normal exit.

| Scope | Invocation | Native session | Exit | Evidence |
| --- | --- | --- | ---: | --- |
|run-u2614.scope|569409f9b7a74b24adbbab70f3287058|40631|0|first-shape-qualification|
|run-u2617.scope|e76b828eaa494bbb9e7cd1bad96dad47|53733|0|first-timing-timing|
|run-u2620.scope|cb9b4aef305b4b269f5003ecf5b7c8d3|81635|0|wet-receipts-wet-receipts|
|run-u2621.scope|0c53147cf96041a586767ca5b503f6bd|completed inline|0|first-ownership-ownership|

These scopes completed in bounded seconds, not near the guard. Each run has its
actual source snapshots/hashes and numerical results. No root browser, server or
other live scope was touched.
