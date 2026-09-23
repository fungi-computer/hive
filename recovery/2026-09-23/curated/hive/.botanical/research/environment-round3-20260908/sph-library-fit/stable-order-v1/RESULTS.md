# Stable neighbor ordering: ordinary native restart passes

2026-09-08. The fixed-tank DFSPH ordinary continuation now matches its exact
file/fresh-process restart **byte for byte**, using the original physical
fixture, checkpoint rule, time interval and acceptance tolerances. There is no
save-triggered neighbor reset and no relaxed threshold. This qualifies the
bounded numerical/restart behavior described below, not a complete water system.

## One query owner, before all consumers

The exact patch is `stable-neighbor-order.patch` (SHA256
`374013b8a0033ca754f620107382e58aa5a9010b06010ab34ab7faeeeea38b14`). It changes
only copied source in this ignored candidate:

1. `Simulation::performNeighborhoodSearch` runs the ordinary full query, then
   requests canonical ordering before returning.
2. `NeighborhoodSearchWrapper` forwards that one operation to its actual
   CompactNSearch owner; it retains no callback, rank array or ID pointer.
3. CompactNSearch sorts its already-populated **active neighbor lists in place**
   using a transient stable-ID lookup. It does not create another neighbor list,
   change membership, duplicate particle storage or change any equation.

The caller obtains fluid IDs from the current FluidModel at comparison time.
IDs are checked for uniqueness before stepping. Point-set count, prefix/suffix
indices and user-data ownership are checked before either process steps. Static
boundary sample indices act as identity only in this fixed no-permutation
fixture. The candidate explicitly rejects Z-sort before it can reorder anything.
The arbitrary-ID owner law uses IDs `[90, 10, 70, 30]` to ensure this is not merely
an ascending-array-index operation.

`TimeStepDFSPH.cpp:127` calls the full query before density, factor, divergence,
nonpressure forces and pressure work. All fluid/boundary neighbor loops for this
DFSPH step consume those completed ordered lists. Pressure iterations reuse the
same lists. The unrelated local static-boundary-volume initialization queries
have fixed geometry and are reproduced identically here; this experiment does
not claim a universal ordering policy for every library query/API or other
force extensions. The numerical patch is currently a CompactNSearch-specific
candidate, not a backend-independent upstream change ready for all builds.

Both ordinary and recreated paths invoke this rule on **every ordinary query**.
Save remains an observation of canonical fields. The former reset experiment
remains diagnostic evidence in `../neighbor-history-v1/`, not the implementation.

## Exact result

Focused proof `run-u2883.scope`, invocation
`a4a8af57fbc64cc38b6d2bfc9f27fec3`, exited 0 normally in **3.412 seconds wall**.
The shared proof guard and retained process session were used through terminal
completion. There were three short processes: an owner law, ordinary tank A and
fresh-restored tank B. No complete three-physical-case suite ran.

- Owner law: non-index IDs remain correctly ordered after initial query and
  reset/requery; original neighbor membership, vector data pointers and capacity
  remain unchanged. Two cycles, 8 lists, 24 entries, 30 comparisons.
- Actual tank: 512 fluid and 3986 static boundary samples, dt 0.001 seconds,
  target step 750. One fixed point-set order, single recorded solver-thread
  configuration, no Z-sort, emitters or additional force histories.
- Capture is the first completed step at or before 500 with nonzero warm state:
  step **172**, density-pressure warm maximum 0, divergence-pressure warm maximum
  `8.860720779317323e-6`. This directly exercises divergence history; it does not
  claim a second density-pressure-warm-active restart.
- Both processes retain exactly `125.97119999999997 kg` with zero mass error,
  no iteration-cap hits, finite states and zero declared particle-center wall
  penetration. The original physical-law checks are unchanged.
- Immediate restored checkpoint is byte-exact. At final step 750, every
  position, velocity, mass, particle/object ID, particle state and both warm
  fields is byte-exact. Metadata/clock are exact. All original numerical
  tolerances pass with **zero** differences.
- Passive witnesses check actual stable neighbor order at first, checkpoint,
  first-continuation and final steps. The measured list count agrees with one
  ordering operation per completed query, not a reporting-only sort.

Full receipt: `restart-result-v1/result.json`, SHA256
`b53d95b06c5d276c85c3c0b64be78d3852a50dbb72a8b26ce67fa67d1294e679`.
`HANDOFF.json` provides complete source/build/executable/result hashes.

## Measured work and cost

| Observation | Ordinary A: 750 steps | Restart B: 578 steps |
| --- | ---: | ---: |
| Whole measured step loop, including cold checkpoint I/O | 1866.85 ms | 1498.74 ms |
| Sorting timer | 132.69 ms | 103.72 ms |
| Query timer **including sorting** | 608.55 ms | 513.70 ms |
| Lists visited | 768,000 | 591,872 |
| Existing neighbor entries visited | 7,636,973 | 5,867,213 |
| Comparator invocations | 32,629,332 | 23,985,252 |

Sorting consumed about 7.11% of A's measured step loop. The inclusive query timer
must **not** be added to the sorting timer. Its remainder contains neighborhood
search plus query/hook bookkeeping; it is not an independently isolated benchmark.

The retained unsorted same-fixture `u2793` receipt measured 1686.55 ms for A and
1361.75 ms for B. The new A observation is about 10.7% greater. These are separate
shared-host observations, not an interleaved controlled benchmark or a scalable
world-capacity claim. Different physical trajectories and diagnostic witnesses
also limit interpretation. No timing sweep was run to select a favorable number.

Allocation evidence is deliberately narrower than a zero-allocation claim:
the operation uses existing neighbor vectors, fixed stack counters and a
transient comparator. The owner law verifies pointer/capacity retention. The
checked libstdc++ introsort/insertion/heap fallback reorders that storage; the
patch requests no copied neighbor buffers. **No whole-process allocator trace
was performed.** Existing Timing/Counting string/map bookkeeping can allocate,
and a query itself already has other allocations. Reported child peak RSS was
21,752 KiB for this packet, not a marginal allocation count for sorting.

## Build and preservation

The copied checkout is pinned to SPlisHSPlasH
`f3f677140761db7637b5443beb54f19f1f835ed4` and the same CompactNSearch
`b40afcf47fe1963b363eba2371f04b42720fcb1d`. The other external dependency
versions and all solver equations remain unchanged. The separate
`local-source-build.patch` uses copied exact dependency sources rather than
fetching new versions. This candidate has its own checkout, CMake build and
native executable; the original source/build/harness/evidence were not edited.

The first candidate build `u2847` failed because the new instrumentation lacked
an explicit Counting header. Its log and before-correction patch are preserved.
The declaration-only fix rebuilt successfully in `u2860`, invocation
`c938ca3461434e6088abf9499aaeed2c`; harness compilation `u2872`, invocation
`d17c890141224a50a74ac9b197de1db4`, exited 0. Outer build parallelism was capped
at two jobs; each concurrent external build used one. Numerical runs used the
same recorded single-thread configuration.

## Remaining boundary before a port

This is the smallest accepted direction for reproducible ordinary continuation
in the fixed study. Boundary stable identity/permutation, changing point-set
order, particle emission, other force histories, parallel reductions and
portable/cross-platform bit patterns remain unqualified. The current exact
checkpoint format is native/same-host and coupled to its recorded source and
fixture. It is not a production game-save format.

Waterfall/0.54 m voxel ledge behavior, hydrostatic accuracy and meaningful
resolution convergence are separate physical qualifications. The earlier
overpacked 27.9 m/s expansion remains a stress diagnostic, not stable liquid.
No Rust/WASM port, game integration, UI change or deployment followed this proof.
