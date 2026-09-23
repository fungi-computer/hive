# Framework workload v3: finite reachable water

V3 is a new qualification fixture, not a v2 before/after comparison. V2 source,
command ledger and evidence remain unchanged. V3 reuses its 100 workers, 384
finite tree chains, four storage destinations, four finite hearths and exact
1,800-step command schedule through the existing v2 driver.

## Why v2 cannot deliver water

On integrated native source `7b8c5167ec1dc69324efac364afb7bd6b330ea0c`, WASM
`541ddcd4c8d29b89159ff9d4c6d6a085db2ce6f34621b4c453e0af0fc88f314b`,
an exhaustive scan of all 65,536 surface columns found solid support heights
13 through 26. Sea level is 12. There is no generated open surface water.
After the full schedule, the only admitted open cell is the excavation at
`[-95,14,-94]`, with level zero. All 1,755 kg of admitted water remains porous
stock. Four unfulfilled requests therefore do not demonstrate a withdrawal bug.

The full post-schedule restore preserves physical environment facts exactly.
The sole environment JSON difference is `placementRevision: 2 -> 1`, an existing
and explicitly disposable invalidation token. V3 compares every other field and
reports the original token discrepancy in the diagnostic rather than weakening
physical recovery checks.

`diagnose-framework-water.ts` reproduces this diagnosis without changing the
workload. Its full-grid inspection is offline diagnostic work, not a new runtime
query or candidate-search mechanism.

## Exact data changes

The v3 pack preserves v2's generator identity and seed. Height generation does
not depend on sea level, so every solid terrain column and all wood placement
remain unchanged.

- Set sea level to 15. This is the minimum that fills an open cell: the lowest
  solid support is 13, its first open cell is 14, and filled cells must be below
  sea level. Sea level 14 and explicit cells at sea level 12 cannot supply water.
- Append initial water cells `[-89,14,-102]` and `[75,14,-92]`. Each begins with
  seven finite portions, 540 kg, from the existing geology owner. Higher sea
  level also changes finite groundwater admission; total initial admitted mass
  is measured, not presumed to differ by only those 1,080 kg.
- Move eleven newly inundated southeast worker starts onto unoccupied dry
  support, by 2 to 7.62 metres. The complete old/new coordinate manifest is
  exported as `colonyFrameworkProofV3Relocations` and included in every report.
- Move `framework-v2.hearth.2` from `[81,-94]` to `[74,-91]` to remain adjacent
  to its relocated fuel tender. Its finite fuel and emission definition do not
  change. No tree, storage destination, work recipe or command timing changes.
- Use game ID `colony-framework-proof-256-100-v3`; retain v2 terrain identity.

V3 pack SHA-256:

- Definition: `0a87ae18def5ea68386d5de729fbab28d5689491c72a0b1a60dc6d97ffaef860`
- Environment: `c1b045b9762b305a6d413cc82e61aafa7fe0fd99b0a2ece66572dd35f229ffea`

## Proof and scope

`measure-framework-proof-v3.ts` first creates an independent source witness:
100 dry worker starts, an actual reachable bank, one ordinary field withdrawal
into an existing pail, exact field-to-lot water conservation, and current-format
restore. This witness does not modify the measured session or establish
automatic scheduled delivery.

The measured session then runs the unchanged v2 command driver. Every sample
checks wood conservation and `fieldKg + heldLotWaterKg - admittedGeologyKg`.
Lazy first admission of finite geology changes both field and admitted mass;
it is not replenishment. The report separately records first automatic water
production, delivered portions, remaining demands, useful movement/work,
changed-record bytes, and all scheduled action outcomes. The final restore
compares all physical environment fields and water accounting. Both original
and restored states then run the same ten-step suffix and compare environment,
material custody, worker positions and water accounting. This suffix is outside
the measured command ledger.

Run the usual proof scope around esbuild, then:

```sh
node /tmp/hive-framework-v3.mjs --native-source=<exact-native-source-commit>
```

Use `--steps=0` for the source witness plus short recovery suffix. The default
runs all 1,800 scheduled steps. Reports pin fixture source, native source, WASM,
definition and environment hashes. Keep pre-navigation and later-native v3
reports separate. No hosted capacity, renderer quality or v2 speedup follows
from this local proof.

## Phase ledger boundary

Use `measure-framework-proof-v3-ledger.ts` to wrap that exact fixture without
editing the concurrently owned record implementation. It reports local
`GameSession.step` and `captureForCommit` p50/p95/p99/max and totals, changed
put/remove rows and encoded bytes, full-save and restore wall time, query time,
and process RSS sampled at measured operation boundaries. The simulation
percentiles exclude the ten-step recovery suffix. `moving`, `working`, stalled
route, and blocked/unassigned workers remain separate in each sampled window.
Capture totals include the initial snapshot. Query timing includes workload
sampling and restore/continuation comparisons, so it is not committed-recipient
publication time.

The ledger identifies costs this local invocation cannot observe: SQL commit
latency/rows, recipient projection and socket delivery, Durable Object alarm
lateness, host CPU, cold SQL reconstruction, and route expansion/replan counters.
These are `not-measured` or `not-exposed`, not zero-cost. `GameSession.step`
wall time includes local wrapper and WASM execution, so it is not native-only
CPU. Record capture is not a SQL transaction. The v3 default is 1,800 steps
(180 simulated seconds); the sprint's final hosted active window remains 600
seconds. A local ledger does not pass that hosted gate.

Bundle and run the cost wrapper under the shared proof scope, using the same
WASM artifact and native source pin as the source witness:

```sh
node_modules/.bin/esbuild engine/scripts/measure-framework-proof-v3-ledger.ts --bundle --platform=node --format=esm --outfile=/tmp/hive-framework-v3-ledger.mjs
node /tmp/hive-framework-v3-ledger.mjs --native-source=<exact-native-source-commit>
```

## Completed same-v3 comparison, September 23

Both runs completed all 1,800 steps with every scheduled action accepted and
identical definition/environment hashes above. Each ran alone on the shared
CPU. The baseline uses native `7b8c5167ec1dc69324efac364afb7bd6b330ea0c`
and WASM `541ddcd4c8d29b89159ff9d4c6d6a085db2ce6f34621b4c453e0af0fc88f314b`.
The later run uses native `730a1e8f9872b753c8f76161c8fa729d8bb41ad9`
and WASM `5c7e1d4dfef0ea996e1ba8336398121c32182f592baa853a842bf5a40d36bb89`.
Its TypeScript bundle was pinned at `0c4ba5510ca201e6b15b92cac221fed46bad25b0`.

| Measured result | Baseline | Later native |
| --- | ---: | ---: |
| Completed tree chains | 151 | 178 |
| Produced wood | 906 | 1,068 |
| Stored wood | 95 | 258 |
| Samples with at least 90 moving/working actors | 132/180 | 179/180 |
| First automatic water portion, step | 1,544 | 1,059 |
| Final water portions / pending demands | 1 / 3 | 1 / 3 |
| Maximum changed-record bytes | 650,156 | 612,903 |
| Local script wall time, seconds | 116.149 | 74.631 |

The later run has 60/60 productive samples during the third simulated minute.
Both conserve all 2,304 wood units. Water accounting closes within
`6.74e-12 kg` in the later run; the source witness withdraws one finite
`77.14285714285714 kg` portion into a pail. Both final physical restores match,
and all four comparisons after the ten-step continuation pass. Three manual
water demands remain unfinished at step 1,800; this is evidence of one actual
automatic completion, not proof that all four requests complete within the run.

Wall time includes report/recovery work and is not tick latency or hosted
capacity. These unchanged proof scripts did not collect phase percentiles.
The separate source witness does not contribute its water to the scheduled run.

Retained raw evidence:

- Baseline: worktree `water-delivery-recovery-20260923`,
  `.botanical/framework-v3/baseline-7b8c5167.json`.
- Later: integration worktree `event-driven-scheduler-audit-20260923`,
  `.botanical/framework-v3/locality-after-1800.json` and
  `.botanical/framework-v3/locality-after-1800-bundle.json` (full bundle/native
  provenance; bundle SHA-256
  `c83a4bf850d3ad6aeec34c8f56f6bb614e6e24e13cda4ef66d5110d0e2a88ecf`).
