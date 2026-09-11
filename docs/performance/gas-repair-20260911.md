# First gas repair against actual Colony

September 11, 2026. King Bolete reviewed/integrated; Luna implemented the isolated
route correction. This is a local source and actual WASM milestone, not a hosted
playability claim. [Owning plan](../../engine/GAS-REPAIR-PLAN.md).

## What changed

1. `TerrainWater` checks changed **Void** stocks inside the gas bounds before
   asking for air geometry. Soil absorption still happens but no longer triggers
   full terrain/air projection. The prepared owner and epoch are validated first.
   Real open-water changes still take the existing conservative rebind path.
2. `CompiledAtmosphere` computes a SHA-256 digest of its complete physical
   definition once per compilation. The shared saved-stock codec stores that
   binding, amounts and ledgers, instead of the entire repeated geometry.
   Terrain atmosphere reconstructs the definition from canonical saved physical
   owners, preserves its original gas revision labels and verifies the digest.
   Authored standalone atmosphere callers supply their definition as before.
   Current formats are versioned; no legacy migration/compatibility path added.
   Root owns the ordinary pinned `sha2 = 0.10.9` dependency/lock change.
3. A true rebind projects its candidate once instead of discarding that result
   and projecting it again.
4. `Kernel::route_for` uses the actual waypoint cursor when joining an in-flight
   route. A revisited coordinate no longer selects earlier history and creates
   an invalid slice. The accidentally discarded blocked-construction result
   in the unreleased aperture join is restored; the live baseline already had
   that guard.

No gas/water capability was disabled for the full Colony measurements. No model
constants, donor rules, simulation cadence or authored stocks were simplified.

## Measured comparison

The [baseline audit](colony-audit-20260911.md) supplies prior results. New raw
results, source inventory and generated artifact hashes are in
[gas-repair-20260911.json](gas-repair-20260911.json).

Actual release-built WASM runs in Node on the same shared host. The timing probe
uses the same released `109957b` authored Colony/session consumer, 40 native
0.1-second field steps, and 160 full-session steps per dig/wall scenario. Saves
occur each step; observations every five steps. Source-only control variants are
measurement controls, not shipping game modes. No timing estimate is inferred
from idle entities or an untested server configuration.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Coupled water + air native p95 | 306.48 ms | 6.73 ms |
| Coupled native maximum | 325.17 ms | 31.64 ms |
| Air with static water p95 | 8.42 ms | 7.44 ms |
| Digging full-session p95 | about 305 ms | 18.18 ms |
| Digging full-session maximum | 637.78 ms | 432.74 ms |
| Digging save median | 22.53 ms | 0.43 ms |
| Initial gas capture | 1,737,502 bytes | 8,536 bytes |
| Wall workload | native panic after 127 successful steps | 160 steps, no panic |

The water-only control still shows timing noise (candidate p95 9.30 ms, median
0.064 ms). Do not attribute unrelated shared-host/GC variation to changed water
physics. The approximately 45-fold coupled-p95 and 203-fold gas-record reductions
address the measured repeated work, not total frame rate or DO capacity.

**Remaining failures:** the dig completion spike is still 433 ms; its observation
p95 is 63.84 ms and maximum 65.45 ms. The wall remains `planned` after the timed
16 seconds, so the crash regression does not by itself prove wall completion.
Real topology rebuilds and client whole-terrain rebakes remain next repairs.
No claimed improvement to browser frame time, network latency or host recovery
comes from this measurement.

## Qualification and preserved failures

* Native `u6008`, invocation `cc5e34f9d877411bafa4e29c117b5c7d`, exited 101:
  29 atmosphere/geometry laws and 3 terrain-water laws passed, then 10 existing
  movement laws passed and the new regression failed its guessed timing/setup
  precondition. This red is preserved, not described as a runtime regression.
* The corrected test finds the actual repeated waypoint while the actor is still
  moving. `u6012`, invocation `c1cfea5c65fa4875b7b1628976965dce`, exited 0:
  that regression, 8 construction laws (including trapped-air waiting), and
  5 paid-emission laws pass. The earlier passing suites were not replayed.
* The same `u6012` ran two actual current Colony WASM tests: soil flow → earned
  two-cell excavation → save/restore → identical next full state; and ordinary
  hearth supply/contact → exact wood debit → smoke → restore/identical next air.
  Both pass. This closes the source review's skipped-step/later-change/recovery
  concern with an actual game consumer.
* WASM build and original timing probes: `u6010`, invocation
  `42c6b6d8faac491980790fd50e06c133`, exit 0. Both full-session scenarios reported
  empty errors. Numerical success is separate from completed work as above.
* Strict engine TypeScript check: `u6013`, invocation
  `233d063f4e9b4b9a8d4c7d0d4fa8fcc2`, exit 0. Touched diff check passes.
* The preceding released panic and destructor errors remain in the baseline
  report. This chunk does not yet change host poisoned-resident cleanup.

All four owned scopes were collected and confirmed inactive/dead with empty
control groups. No listener, browser, Worker, or deployment was launched. Compiler
warnings remain (12 existing unused/dead-field advisories in the test build).
Fallow was not available on this execution PATH; do not claim a Fallow pass.
Independent source review found no blocker in invalidation/digest/restore changes.

## Next concrete repair

Replace real-change full air projection with updates to the affected existing
mixing bins and incident faces. Measure the **maximum dig/build completion step**,
not just the now-improved ordinary p95. Preserve the exact finite-stock remap and
atomic waiting behavior. Then repair the already-identified whole-map client bake
and picking invalidation before claiming a smooth playable update.
