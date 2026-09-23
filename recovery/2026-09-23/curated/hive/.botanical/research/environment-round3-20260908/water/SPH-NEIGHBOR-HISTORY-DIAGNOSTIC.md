# Fixed-tank DFSPH: neighbor history isolated

2026-09-08. The bounded diagnostic hypothesis passed. **The ordinary restart
law still failed under its original criteria.** Root authorized this experiment
after the first real file restart failed; all prior sources/results are retained.
No upstream/library/game changes or full three-case physical suite occurred.

## Actual source and proof

Ignored harness ownership was explicitly transferred to this lane. Exact final
sources, compiler caller and executable are pinned in
`../sph-library-fit/neighbor-history-v1-source/`, with SHA256 inventory. The
preceding candidate remains in `restart-v1-source/`; original corrected
diagnostics remain in `restart-v2-baseline/`.

- `reference.cpp`: `311c535b7fb30eb5b9119616f741481ce0dcf90e9c89841c50c2dd02c12fdfda`
- `reference-checkpoint.h`: `f68b1cf2af8680795251d1c96ba8a74d29b3daf9e813c828c9f4589e2b3cec0f`
- Native executable: `790e604e1dd9af7f582229088a1b2d5b6aabed48b3aded9a633ab01a113019fd`
- `run-neighbor-history.py`: `d8ce9f4e0aeea7c1582ba8e1a2db45a11e7bfd181283caece361f85c882a1bb3`

Compile `u2797`, invocation `65c4941c7f5f4030b32bd4edca264674`, exited 0.
Numerical packet `u2798`, invocation `78d8cbfed1044d66a3ddf974a6b21976`, exited 0
in **5.009 seconds wall**, through the shared proof guard. Three sequential
native processes ran the same fixed 512-fluid/3986-boundary tank:

1. Ordinary A: initial state through step 750, with a file checkpoint at the
   first nonzero warm field, step 172.
2. Fresh B: recreate the fixture once, admit/restore that exact file, then
   continue from step 172 through 750.
3. Reset-control A: repeat the original path through the identical step-172
   checkpoint, then call only `NeighborhoodSearchWrapper::reset()`, and continue.

The control did not reset physical particles, time, IDs, masses or warm fields.
All processes used the same source/binary, dt 0.001 seconds, one recorded thread
setting, no Z-sort, no new force modules and unchanged solver tolerances. Actual
point-set count, index and user-data ownership were checked before stepping.

Passive observations export state after step 173 and the **existing** neighbor
sequences used at the start of that step. They issue no extra neighborhood
query, sort or solver invocation. The query is pre-advection; the saved step
state is post-advection. Both correspond to the explicitly labeled same step.

Full receipt: `../sph-library-fit/neighbor-history-v1/result.json`, SHA256
`08e37e3c80a8d715134579c558e3151d1012a89e85b6b78270284d2d44bf9f67`.

## Result and its limits

All three individual physical runs exited 0: no iteration-cap hits, finite
particles/warm fields, no declared particle-center wall penetration and exact
`125.97119999999997 kg` with zero mass error. The ordinary and reset-control
checkpoint files are byte-identical. Immediate file restoration is byte-exact.

At the first continued step (173):

| Comparison | Neighbor membership | Neighbor order | Physical/retained state |
| --- | --- | --- | --- |
| Ordinary A vs fresh B | Identical | 478 sequences differ | Positions exact; velocity differences up to `5.5565e-19 m/s`, divergence-warm differences up to `5.4210e-20` |
| Reset A vs fresh B | Identical | Identical | Entire typed snapshot byte-identical |

At step 750, reset A and fresh B remain **byte-identical** across metadata,
positions, velocities, mass, IDs, particle/object states and both warm arrays.
Ordinary A versus fresh B reproduces the preserved restart failure: up to about
0.000199 m position difference and 0.00653 m/s velocity difference, outside the
unchanged tight continuation tolerance. Density-pressure history is zero in
this fixture; divergence warm history is actually exercised.

Together with the source path already inspected, this isolates sensitivity to
neighbor-cache/reduction order for this particular restart. It is not merely a
guess based on the existence of a hash map. It does not establish portable or
multi-thread bitwise determinism, arbitrary snapshots, all force histories or
physical accuracy of a waterfall/voxel-boundary solver.

The public cache reset is a **diagnostic intervention**, not an accepted save
implementation. Saving a game should not silently change its future numerical
trajectory. Resetting only when the user saves would violate that expectation.
The next integration decision should explicitly choose a reproducible numerical
ordering owner or a declared physical-tolerance policy. A maintained neighbor
query that exposes stable-ID ordering, applied consistently in ordinary stepping
and reconstruction, is a narrower candidate than treating the whole hash cache
as canonical game state. It needs its own actual method/cost comparison; no
upstream patch or production ordering policy was implemented here. Merely
turning off Z-sort was insufficient, and sorting only reported output does not
alter the reductions that produced it.

## Real physics dataset for the hosted study

Ordinary A passively recorded step 0, every 10 steps and final step 750 during
this same numerical run. No extra tank run or renderer was used.

- Dataset: `../sph-library-fit/neighbor-history-v1/tank-positions.json`
- SHA256: `63a36c56a040866b184979b3b3705a9d31138546879d2800ba5dd752da17af55`
- Size: 1,544,036 bytes; 76 frames covering 0–0.75 simulated seconds.
- 512 stable IDs and real particle-center positions per frame; 3986 actual
  static Akinci boundary sample positions; particle radius in metres.
- Units are metres and seconds. Frame positions are rounded to nine significant
  decimal digits **only in this viewer dataset**. Exact checkpoint bytes remain
  separate. Any viewer interpolation must be labeled presentation, not extra
  solved simulation frames.
- Source, executable and upstream revision hashes are embedded. Native FNV-1a
  fixture identity is explicitly non-security/same-host.
- Dataset status says `native-recorded; restart not qualified` and reports
  `ordinaryLawPass: false` independently of the successful diagnostic.

Companion `../sph-library-fit/neighbor-history-v1/viewer-handoff.json`, SHA256
`48663abf4c296c5e678707db676316a5351e2c458ad02cca946dc07de82029f7`, binds the dataset
to this run and the original failed `u2793` receipt without changing that evidence.
Root/Delivery own the study shell, navigation, renderer, actual browser checks
and publication. This lane supplied data only and makes no hosted claim.
