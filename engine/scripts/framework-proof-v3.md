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
