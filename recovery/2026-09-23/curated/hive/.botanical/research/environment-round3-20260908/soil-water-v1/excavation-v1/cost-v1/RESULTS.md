# Existing world point reads dominate the avoidable adapter cost

2026-09-09. One unchanged fixed cost packet passed in run-u3438.scope, invocation898b1a3e5afc4ce88f14c8395c35346c, exit0. No solver, geometry, cache, adapter or fixture source was modified. This is one observation per operation on the shared host, not a scale benchmark.

## Measured phases

| Public phase | Wall ms | User+system CPU ms |
| --- | ---: | ---: |
| Build unchanged generated fixture |292.323459|170.977|
| Adapter initialization from canonical inputs |84.417475|52.720|
| Transactional excavation |215.948818|93.175|
| Bare soil-owner creation |2.541796|1.393|
| Bare soil600s/dt6 advance |128.639940|69.231|
| Combined adapter600s/dt6 advance |330.889600|158.416|
| Adapter read |152.932775|48.921|
| Adapter encode |181.698518|47.094|
| Fresh adapter creation |0.220743|0.237|
| Fresh complete decode |151.072829|45.018|
| Public world checkpoint restore |0.388616|0.393|
| Public region/vent/contact material reads |109.086256|33.701|

These ran once in that fixed order. The later adapter advance may benefit from runtime/JIT warmup relative to the earlier bare advance; wall time also substantially exceeds consumed CPU on this shared host. Do not interpret subtraction of these observations as an exact causal overhead measurement. There was no forced GC, cache manipulation or warmup loop. Equality checks and report writes ran outside individual phase clocks.

The whole measured interval after source pinning was1734.551102ms wall and751.159ms CPU, including untimed equality/report work. Syntax and the later Fallow check are outside that interval. End process RSS was80,773,120bytes; this includes the reference and both full result/receipt trees and is not a kernel-only or peak-memory measurement.

## Concrete source explanation

The public world read pass uses the existing `assertRegionWorld`, `assertVented` and `pitContacts` helpers. It caused the real world owner's counters to change from0 to7 generated/resident bricks,0 to28,672 material bytes,1 to1,793 height samples, and0 to11,958 cave metric evaluations. The source-derived request count is only17 soil cells +49 vertical vent cells +6 contacts =72 point reads, including repeated cells. A read-call counter is not exposed, so72 is a caller-derived count rather than a new instrumented metric.

In `worldgen/coordinate-hash-v1/voxel-world.mjs`, `read(at)` calls `decode(at)`, which generates the full16³ brick on a miss. The soil adapter deliberately restores a fresh private world to validate a combined checkpoint. Its read, encode and decode therefore rebuild large unrelated volumes while checking a small number of authoritative material facts. The original fixture itself also generated4 bricks and11,958 cave metrics for its top-soil reads. In this case those cave computations are below and outside the requested top-soil/air samples.

The restore itself cost less than.4ms CPU. The actual material-reading pass cost33.7ms CPU, compared with45–49ms CPU for complete adapter read/encode/decode. That measured workload and the direct source path identify unnecessary full-brick materialization as a demonstrated first optimization target. Private world counters inside the adapter are not exposed; this report does not multiply the public pass's counters and claim to have observed hidden totals.

Recommended next bounded source change for root: let canonical point queries check the current sparse overlay and call the same existing `baseMaterialAt` owner when absent; retain `readBrick` for callers that really need a decoded volume. Preserve exact material outputs, world/recipe/save identity, edit preconditions, finite bounds and descriptor-cache ownership. First compare through this actual excavation consumer. A later retained-world/revision validation cache can be considered only if it remains necessary after that smaller change; this result does not justify weakening decode validation or introducing a second material sampler.

No CPU profile was started: ordinary phase measurements plus actual world counters already isolate this concrete owner. The cost within bare nonlinear work can be profiled later if it becomes the demonstrated limit; it is not the first overhead to remove from this18-node adapter.

## Physical equality and work

Both measured advances used the same initial edited state and produced the accepted complete state, face receipt and work report. The combined output matched the entire accepted adapter result, including finite wet spoil and exact world edit. Fresh decode matched the accepted final state; both initial inputs remained unchanged. The accepted pit still holds12.565428851627985kg, wet spoil237.03565722779186kg, and the combined balance residual is−9.094947017729282e−13kg.

The bare public advance includes its ordinary100 accepted steps and full returned diagnostics:18unknowns,33active faces,200Newton builds,400residual evaluations,13,200face evaluations,357,000matrix updates,2,592bytes for its dense matrix, and zero rejected stages. Thus its timing is the actual public soil operation, not a claim to time LU alone. No larger graph or new physical fixture was run.

Encoded canonical state is10,143bytes. The compact JSON representations of the bare and combined full result trees are348,597 and355,837bytes respectively, including retained per-step diagnostics. Those result trees are evidence; they are not all canonical save data.

All33 accepted source pins matched before measurement. The new caller and its contract/config were frozen separately. The one-file targeted Fallow run had zero dead-code/cycle/clone/health findings; its static coverage model and the missing local node_modules warning are retained. This does not erase the existing36 health findings on the unchanged excavation candidate.

## Artifact pins

| Artifact | SHA256 |
| --- | --- |
|run-v1/proof.json|f6a86262f02f83ca4a0fc93dcf7aef69544402d8790f855dcc263f58280f279a|
|run-v1/source-inventory.json|c0c5d1ba4774857c81ae67117b4f9da84ec07e95f12d09550bfc0dfcc5b9dbf9|
|run-v1-terminal.txt|86344a9c87791aa5da8633413af68a2320f90128e7e029a202c13230601765ff|
|measure.mjs|dda812ea944dccb7da75587281065e3479a13cc61c30d6ebc204a6541fe527eb|
|fallow.json|6a035e93c04239763ae59ac46ae7272726289b1e1b34d40c2c9b94fc3aef6cd3|

The retained execution was polled through its terminal exit. No benchmark/profiler process remains and no repeat is queued.
