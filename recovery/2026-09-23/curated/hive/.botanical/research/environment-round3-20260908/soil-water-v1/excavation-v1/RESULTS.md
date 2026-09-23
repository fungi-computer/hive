# An ordinary unlined excavation receives finite groundwater

2026-09-09. The single fixed packet passed in `run-v1`:5 groups,682 checks. No seed, geometry, coefficient, threshold or fixture was changed during the packet. The only pre-run caller correction was root's signed-zero assertion: an oriented zero derivative can be `-0`, so the test checks numerical zero dependence rather than a sign-bit identity.

## What actually happened

The unchanged accepted world owner supplied18 actual generated soil voxels in the fixed nine columns x=-1..1,z=127..129, two layers each. The centre target was(0,14,128). Its floor is7.56m above the world datum and its rim8.10m; the initial synthetic hydrostatic water-table head was7.71m. The actual current-world edit changed this one soil voxel to air, with a clear vertical atmospheric opening, four soil sides and one porous floor.

The target's **237.03565722779186kg of existing water** moved unchanged to the named finite wet-spoil export. All retained masses survived by stable ID; the pit started with exactly0kg. The original caller world and combined input remained unchanged. This is an immutable transactional checkpoint over the actual material/edit owner, not a change to the running game or a new terrain-generated water supply.

Over600s at a maximum6s step, the pit received:

| Path | Net water into pit |
| --- | ---: |
| Porous floor |9.300728934574245kg|
| Four unlined sides combined |3.264699917053735kg|
| Each individual side |0.8161749782–0.8161749819kg|
| Final pit stock |12.565428851627985kg|

At rho1000kg/m³ and area1m², the final stock is about12.565L and **0.0125654m deep—about1.26cm**. This is shallow finite seepage, not a dramatic flood. The recording must preserve that measured magnitude. The pit's physical capacity is540kg; no overflow event occurred.

Remaining soil water was4070.7198289707067kg, exported wet-spoil water stayed237.03565722779186kg, and pit water was12.565428851627985kg. Their total was4320.320915050126kg, with a measured discrepancy of−9.094947017729282e−13kg from the original combined baseline. Pit stock exists only in the shared solver node; the saved pit binding does not duplicate it.

## Boundary and restart evidence

The full assembled18×18 mixed-residual Jacobian was compared with centred differences away from contact kinks. Across324 entries the maximum difference was1.4251781976781785e−8kg/m, below the fixed mixed absolute/relative tolerance. Both face orientations, hydrostatic zero flow and absence of side suction from negative floor pressure passed. Root's separate primitive quadrature result is a different evidence scope and was not rerun here.

The separate saturated-after-removal fixture removed the only unsaturated target while every retained soil cell was saturated. Its empty pit acquired a derived atmospheric seepage reference and advanced1s to0.059598353009499117kg of water, without adding a saved pressure. This closes the prior unanchored-state admission gap for a pit with an exposed saturated soil side; it does not admit every dry floor-only geometry.

At300s the main pit contained6.693430939792961kg and still had a nonzero physical last-step face ledger. The complete edited-world/soil/export checkpoint was written to `moving-excavation-save.json`, read from the file by a fresh adapter, and continued another300s. Its final canonical encoding exactly matched the uninterrupted600s result. Replaying the original excavation command after that flow returned the existing state without another cut or export.

The original four-cell finite-reservoir moving consumer was also run through both the frozen original owner and this candidate. Complete state, receipt and reported numerical work matched exactly for its fixed10s/dt1 case. This is the one checked compatibility case; the entire old physical suite was not repeated.

Seven rejected cases covered stale and buried edits, a second excavation, unsupported backfill, the hard matrix-work budget, a corrupt export and over-rim canonical stock. The last is a strict admission check, not a simulated overflowing trajectory. Actual solver/step failures preserve uncommitted diagnostics and the complete input; no automatic retry of a failed whole request is installed by this adapter.

## Residuals and cost

The main600s trajectory took100 accepted steps,200 Newton matrix builds,400 residual evaluations,13,200 face evaluations and357,000 actual trailing matrix updates. No step was rejected or halved. Its largest retained dense matrix was2,592bytes for18 unknowns; this excludes all other arrays, objects, receipts, world caches and runtime memory. The saturated1s case used7 builds/12,495 matrix updates with zero rejected steps. The original compatibility case used10 builds/550 updates.

Main-trajectory recorded maxima:

| Law/diagnostic | Maximum magnitude |
| --- | ---: |
| Mixed mass residual |1.691003934101154e−10kg|
| Constitutive reconstruction |4.440892098500626e−16kg|
| Darcy-vs-receipted face difference |1.390510987603344e−10kg|
| Paired continuity |4.263256414560601e−13kg|
| Tree correction |1.3905109878743944e−10kg|
| Tree-root compatibility |4.5473000365170435e−13kg|
| Mobile stock closure |1.6916062994809522e−10kg|
| Darcy chord difference |0kg|
| Pressure/storage complementarity |0m²|

The measured qualifier interval was2004.03188ms wall and1,814,431µs CPU. Its timer starts after source pinning and includes all five groups, real world generation/restore checks, file I/O, compatibility and restart; it excludes module startup and the initial source-copy phase. It is not a kernel-only benchmark. End-of-packet process RSS was94,027,776bytes, not a measured solver-memory peak or population-capacity result.

## Retained source and tool scopes

| Check | Retained scope / invocation | Exit |
| --- | --- | --- |
| Bounded syntax |run-u3414.scope / d95ec67439484a57a194e7ccafd7173e|0|
| Target Fallow |run-u3415.scope / 0e6488c414fd478192274800cc673567|0|
| One physical packet |run-u3421.scope / fa44af10c4dc41b2a674b5613b722ca2|0|

Each automated command used the ordinary `run-proof.sh` wrapper and30s inner timeout. Fallow and the physical execution were retained/polled through completion. All33 live and frozen source hashes matched after the packet. No physical rerun or post-pin source/threshold correction occurred; no proof process remains.

Actual Fallow disposition is retained separately: zero dead-code/cycle/clone findings within14 candidate files,36 health findings using static-estimated coverage. Real cognitive hotspots remain compileFaces56, darcyFaces25, pitContacts19 and qualifier verifyTransfers19. These are debt to decompose with exact-behavior evidence, not an audit-green claim.

`run-v1/moving-frames.json` contains100 accepted frames with actual soil/pit masses and face receipts; the separate `excavated.json` is the initial zero-pit-water frame. These records are available for later Delivery playback without rerunning the solver. No live game, material, job, renderer, hosted lab, production or finite-gas integration was performed. Soil is still the accepted synthetic, rigid-pore, isothermal, finite-head Richards approximation. The pit is vented quasi-static level storage; waves, falling-film momentum/heat, contamination, oxygen, erosion, lateral spill routing, overflows and backfill displacement remain outside this proof.
