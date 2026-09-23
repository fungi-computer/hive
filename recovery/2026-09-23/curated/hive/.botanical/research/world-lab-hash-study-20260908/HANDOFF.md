# World Lab: cache the constant terrain-hash prefix

Root Game CTO reviewed candidate, 2026-09-08. This is an isolated source experiment and a recommended narrow next World Lab correction. Delivery retains tracked-source/Git/build/deploy ownership. No tracked source was changed by this experiment.

## Actual change and why it preserves geography

Every lattice corner currently hashes the complete world-identity string again. The candidate computes the FNV state after `identity + "|"` once per spec, then continues the identical character/32-bit multiply loop over `x + "|" + z + "|" + salt`. Continuing from that prefix is the same recurrence as hashing the concatenated string. The coordinate/salt order and arithmetic do not change.

A private WeakMap retains only that prefix state per spec. It follows spec lifetime, has no terrain/chunk buffers, and validates the identity string before reuse. It does not add a saved field, protocol field, world generator, scheduler, or public sampler API. Frozen production specs and changed diagnostic identities retain their existing behavior. Generator version should remain unchanged because generated values remain identical.

Baseline/current `src/world-lab/terrain.js`: `bcb6d5cb48579821715cd369af96a5b287ce2cdbbcc75723cdc4505ffd0b1452`.
Candidate: `d5e5d3b6548eb341143b725ef5375bfb532ff9cd48b78290027dc2b36e7542b8`.
Apply only `hash-prefix.patch` at a released World Lab source checkpoint after inspecting the current caller. Baseline and tracked source still matched when this handoff was written.

## Evidence and limits

`compare.mjs` / `proof.json`: 3,076 signed/fractional/seam samples per seed across footprints 1/8/16, two seeds. Full descriptors and named features deep-equal; changing a diagnostic identity revalidates the cache. Short timing rounds varied from 0.90 to 2.49 baseline/candidate ratio, so they do not establish a stable speedup. Original artifacts are preserved. The old native handle was unavailable when recollected; its retained JSON and scope journal are evidence, not a newly observed native exit.

The representative follow-up uses the actual `createOverviewSampler` with eight-row batches, 512×512 output, all four typed arrays and complete result metadata. `run-u1605.scope`, invocation `c866a418c4214d488478a9f8baf4d5a2`, native handle 70112 was retained through normal exit 0. Two alternating-order pairs each generated 262,144 samples in 64 batches. Complete results deep-equal in both pairs, combined array SHA `08ee7c1041535a4896c7d9d656b25f70c53a302c93661f2b401a35bf2d18925c`.

| Pair | Baseline elapsed / CPU | Candidate elapsed / CPU |
| --- | --- | --- |
| Baseline first | 6.544s / 6.504s | 2.977s / 2.880s |
| Candidate first | 6.453s / 6.400s | 2.752s / 2.698s |

`overview-proof.json` SHA `cdd08b7944e9fd443dcc667ac72476d924cfdf45422b55bb5d6ef95b6c0635af`. This supports roughly 2.2–2.35× faster overview generation on this Node/shared-host run. It does not measure browser rendering, worker message/cancellation latency, cold startup, many seeds, memory residency, mobile or population capacity. The synchronous measurement does not recommend moving browser generation out of its existing worker.

## Smallest landing

The existing visible World Lab PM can review and integrate this one-file delta through Delivery. Keep its ordinary bounded terrain contract/equality check and one serial build/publication; no new browser suite, art gate, broader terrain rewrite or worker protocol is justified by this change. Preserve the noisy initial timing result alongside the stronger workload measurement. Delivery chooses publication timing independently of the coupled game migration.
