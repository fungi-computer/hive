# Native fixed-tank restart: first real file result

2026-09-08. This is the first actual fresh-process checkpoint continuation for
the pinned SPlisHSPlasH DFSPH reference. **The tight continuation law failed.**
No tolerance or historical result was changed to obtain a pass.

Root transferred only the ignored harness, compiler caller and new restart
files to this lane. Upstream, library build and game files remained untouched.
The prior v2 source, executable and three diagnostic receipts are copied under
`../sph-library-fit/restart-v2-baseline/`. The exact restart candidate is pinned
under `../sph-library-fit/restart-v1-source/` with a SHA256 inventory.

## Source and actual invocation

- One shared `reference.cpp` fixture setup serves both restart processes. Fluid
  registration occurs once through `setSimulationInitialized(true)`; the static
  boundary registers once separately. Count, point-set index and user-data
  pointer assertions precede the first step in each process.
- `reference-checkpoint.h` owns cold capture, file codec, admission and restore.
  It copies native double positions, velocities, mass, shared volume, particle
  state, particle/object IDs, both DFSPH warm fields, time and dt. Rows are written
  field by field without C++ structure padding. Loading checks count/fixture
  before allocation, complete input before mutation, exact permitted identity,
  finite numerical values, stocks, warm values, clock and trailing bytes.
- The FNV-1a fingerprint identifies this fixed initial geometry, boundary
  volumes and selected parameters. It is a **non-security, same-host fixture
  identity**, not an authentication mechanism or portable save format. Source
  and executable SHA256 hashes live in the run receipt. This is not a proposed
  production game save protocol.
- Compile `u2790`, invocation `fd6eb85cee4047deb0a016c906735a3c`, exited 0.
- Focused runner `u2793`, invocation `5087ddaefcb745b49253fe1bd050c670`, exited 1
  normally after 3.085 seconds wall. Both used the required shared proof guard.
  No full three-diagnostic rerun occurred.
- Full receipt: `../sph-library-fit/restart-v1/result.json`, SHA256
  `aeba23565f8e1bee925433abfd56b5d6cf833040d5f4d5fd8645ed6d52fb818f`.

## What passed, and what did not

The fixture contains 512 fluid and 3986 static boundary particles, two correctly
owned point sets, fixed dt 0.001 seconds, no Z-sort, and the unchanged pressure
equations/parameters. Process A captures the first pressure-active completed
step no later than step 500, then continues to step 750. Process B starts fresh,
builds the same fixture, reads the real file, restores and continues to step 750.

The first active checkpoint was **step 172**, time approximately 0.172 seconds.
Its density-pressure warm maximum was zero; its divergence-pressure warm
maximum was `8.860720779317323e-6`. The original tank diagnostic never claimed
positive density pressure, so admitting either nonzero warm field was declared
before the run. This proves an exercised divergence-history checkpoint, not a
separately pressure-warm-active restart.

Both individual processes exited 0 with no iteration cap hits or particle-center
wall penetration. Each retained exactly `125.97119999999997 kg` with zero mass
error. The immediate restored file is byte-for-byte identical to the checkpoint.
Final clocks, fixture metadata, IDs, object IDs, states and masses are exact.

Final numerical continuation is **not** bitwise identical and exceeds the
declared tight absolute/relative tolerances after another 578 steps:

| Field | Maximum absolute difference |
| --- | ---: |
| Position x | 0.00019733123244869422 m |
| Position y | 0.000025460134764648812 m |
| Position z | 0.00019891877790145784 m |
| Velocity x | 0.006531531736292548 m/s |
| Velocity y | 0.00047635676555791984 m/s |
| Velocity z | 0.006448220613091412 m/s |
| Density-pressure warm | 0 |
| Divergence-pressure warm | 0.09871521114683901 |

The warm field is opaque solver history scaled by dt; the last row is not a
physical pressure or gas-pressure difference. Position/velocity failures remain
even though the absolute final spatial separation is small. The proof does not
relabel these differences as successful deterministic continuation.

Step-loop timings include checkpoint I/O in A and are only fixture evidence:
1686.55 ms for A's 750 steps and 1361.75 ms for B's 578 steps. They are not a
performance comparison or population/capacity claim. Maximum speed over the
whole respective trajectories was approximately 6.2131 m/s; v2's differently
named final-time speed statistic must not be compared as the same observation.

## First source-grounded next diagnostic

The retained canonical fields restore exactly, but the neighbor accelerator is
rebuilt. With Z-sort disabled, CompactNSearch still retains ordering history:

- `CompactNSearch.cpp:78` builds `m_entries` and `m_map` from scratch in point
  order during initialization.
- `:319` incrementally appends and removes cell members as particles move.
- `:379` traverses the unordered map and entry order to append neighbor IDs.

Thus equal positions can generate the same neighbor membership in a different
reduction order. The scalar DFSPH loops sum in that returned order. This is a
plausible, concrete source explanation; it has not yet been causally proved and
does not rule out missing history by itself.

The smallest proposed diagnostic is to preserve this failed packet, record the
first continued step (173) plus actual neighbor sequences in both processes,
and add one continuous-run control which invalidates only the public neighbor
cache at checkpoint step 172. `NeighborhoodSearchWrapper::reset()` at line 200
exposes that operation; it does not reset the physical model or warm fields.
If continuous-reset matches fresh-restored continuation while ordinary
continuation has identical neighbor sets in a different order, the experiment
would isolate sensitivity to neighbor cache history. No upstream edit, global
sorting workaround, warm-field deletion or new acceptance tolerance is proposed.
This next diagnostic was sent to root and has not run in this receipt.

The earlier overpacked compression case remains a stress response diagnostic:
it expanded at about 27.9 m/s. It is not stable-liquid qualification. Neither
that result nor this restart exercise qualifies waterfall, arbitrary voxel
ledges, hydrostatic accuracy, resolution convergence or a production language
port.
