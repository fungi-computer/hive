# Moving nonlinear 3D soil block result

The single fixed packet passed on its first invocation: **four groups, 2,817 checks**. All runtime owner files remain byte-identical to the accepted connected-volume reference. This adds a moving 27-cell nonlinear discriminator and physical recordings, not another solver.

The block has 28 unknowns, 55 active faces, 53 closed exterior faces and 28 graph chords. Its initial soil stocks are explicitly hydrostatic and unsaturated, with a synthetic low-K middle layer; one top-centre port adds exactly 1 kg of finite pond water. Total initial water is 4,192.4960798636575 kg. No exterior water source or gas stock participates.

## Actual movement and refinement

| Maximum timestep | Nominal/accepted steps | First dry pond bracket | Upper-centre gain | Maximum symmetry discrepancy |
| --- | --- | --- | --- | --- |
| 12 s | 50 / 50 | 336–348 s | 0.9948730398961629 kg | 1.4068746168049984e-12 kg |
| 6 s | 100 / 100 | 336–342 s | 0.9949086146843484 kg | 3.147647475998383e-9 kg |
| 3 s | 200 / 200 | 339–342 s | 0.9949265023284966 kg | 1.5824070942471735e-9 kg |

These are accepted endpoint brackets, not exact continuous drying times. Every request used zero halving retries. All three runs had real interior x, y and z movement, independent of the boundary inflow. In the dt3 run, cumulative absolute mass transfers over interior faces grouped by axis were:

- x: 0.0022813744900878905 kg;
- y: 0.0005175415362101533 kg;
- z: 0.002281374509258399 kg.

Those numbers measure transfers across faces; they are not separate inventories and may count the same water passing multiple faces. Nearly all the finite donor remains in the central upper voxel at this horizon. The recording should show that modest physical redistribution, not exaggerate it into a large flooded region.

At 600 s the max soil-theta difference between dt12/dt6 was 6.58792373986472e-8; between dt6/dt3 it was 3.31252669183435e-8, about half. This is **same-owner temporal self-refinement at fixed physical mesh**. It is not an independent continuum reference, spatial convergence proof or arbitrary-soil calibration.

All x/z reflection and interchange symmetries passed at every accepted endpoint. The largest measured discrepancy, 3.14765e-9 kg, is below the predeclared 2e-7 kg limit and is retained rather than rounded to zero.

## Balances, restart and cost

Across the three unsplit physical requests, measured maxima were:

| Quantity | Observed maximum |
| --- | --- |
| Mixed residual | 7.393667258684825e-11 kg |
| Darcy residual / tree correction | 6.998817196770882e-11 kg |
| Constitutive residual | 2.842170943040401e-14 kg |
| Per-step paired reconstruction | 8.242295734817162e-13 kg |
| Aggregate paired reconstruction | 9.379164112033322e-13 kg |
| Absolute total residual | 9.094947017729282e-13 kg |
| Root compatibility | 8.35446650319015e-13 kg |
| Eliminated stock correction | 7.392486622848082e-11 kg |
| Chord transfer change / boundary complementarity product | 0 kg / 0 m² |

Every stock remained within strict pore/pond bounds. An independent reconstruction applied each recorded face transfer once to each endpoint at every accepted step. This is measured floating conservation, not exact arithmetic. No quantity clipping, capacity inflation or hidden source was introduced.

The dt3 run was separately advanced to 300 s, saved to `moving-soil-save.json`, decoded by a fresh owner and continued to 600 s. The saved state had meaningful internal flow, as checked by its actual last-step ledger, and the final canonical encoding matched the unsplit result exactly. The saved and final hashes are recorded below. This covers a moving nonlinear restart with pressure rebuilt solely from canonical water stocks.

Actual dt3 workload: 717 residual calls, 39,435 face evaluations, 317 Newton matrix builds/iterations and 2,196,810 completed trailing-matrix updates. The actual 28-unknown LU matrix used 6,272 bytes. The hard limits of 72 unknowns, 512 accepted steps and 30 million matrix updates were unchanged and not reached. No singular-LU or nonlinear-retry recovery claim follows from this successful packet.

The qualifier recorded 262.430748 ms wall time after imports/source freezing, whole-process CPU delta 365,177 µs and final RSS 88,596,480 bytes. The window includes full JSON recordings and restart work; the final proof write is outside it. Whole-process CPU can include runtime worker activity. This is one shared-host observation, not a solver-only or large-world benchmark.

## Recordings and remaining scope

`run-v1/dt3-cells.json` contains 201 frames for 27 stable soil cells, with voxel/metre position metadata and actual mass, theta, available pore void and net incident face transfer. The dt6 and dt12 recordings preserve their own endpoints. Full pressure, face, closure and work diagnostics remain in the corresponding `dt*-result.json` files. These are usable by a later Delivery visualization without rerunning the solver.

`poreAirM3` explicitly means **available vented pore void capacity**. It is not finite gas inventory, gas pressure or a joined atmosphere model. The unchanged isothermal, rigid-pore, finite-negative-head model still applies. This packet adds no excavation, open-water surface, gas, terrain or gameplay integration.

The focused Fallow run over the two new caller files found no dead code/cycles/clones or cognitive-threshold issue. Four health findings are static estimated/no-coverage CRAP advisories. The unchanged underlying `compileFaces` cognitive46 finding remains in the earlier owner's report; it was not hidden by this narrow scan or refactored before the physical discriminator.

## Frozen provenance

| Check | Scope / invocation | Exit |
| --- | --- | --- |
| Bounded syntax | `run-u3302.scope` / `04167e935af14d848ddecab8e4fe96a8` | 0 |
| Focused target Fallow | `run-u3303.scope` / `52965671c61f4dc4845d2527adac0719` | 0 |
| First and only physical packet | `run-u3307.scope` / `abcc29df08ad4f8a8bcaede9f0e60228` | 0 |

All commands used the ordinary shared `run-proof.sh` wrapper and `timeout -k 5s 30s`. The physical ordinary command was `node qualify.mjs run-v1`, with terminal output retained in `run-v1-terminal.txt` and its exit propagated. Every command completed in its retained tool call; no proof process remains. Sources were copied/hashed before the first group, then all live/frozen pins were inspected with zero mismatch. No numerical rerun or post-pin runtime/fixture/tolerance correction occurred.

| Artifact | SHA256 |
| --- | --- |
| `run-v1/proof.json` | `c613f5f4f2cacdc5a2a2ae3989b3f6a854613f6cfcd2fa0d581b5f350f081479` |
| `run-v1/source-inventory.json` | `778aa3076da28bb9cd96fe92d71698ce1f7b555f990480f760c599d43ab7ed69` |
| `run-v1-terminal.txt` | `53aa20cef7805fa7b1a52137ef03a66c32e0fa11479eacc39491c8b68147fdee` |
| `run-v1/dt3-cells.json` | `b1586592cccdcfe9d320364f340586de449fdbe8eaa7786cd4a7ff3dc918b27b` |
| `run-v1/moving-soil-save.json` | `6f446458add757dad802da49ed0023b45ea0f7bf45f28877a1608e289fa0b026` |
| Final canonical encoding | `a70aa0e28d2fbe1c1913eaf7df13b18a9fa1089278674203f4efec3308665c87` |
| `fallow.json` | `09638403b11ea3db73fe71eee4bd3d4a3e3f569c742436fb6c3654cfc94a3714` |
