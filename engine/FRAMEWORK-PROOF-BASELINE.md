# Framework proof baseline: distributed 256/100 v1

September 23, 2026. This is a failure baseline for the [framework proof sprint](FRAMEWORK-PROOF-SPRINT.md), not a capacity result. The workload is `colony-framework-proof-256-100-v1` at source `1701933bb80c0821ec4445ac547cfba9ff9e978b` with release WASM SHA-256 `5c2620e6416a9114a553c80a89429e98ee278adc0048bfbf131f06eb0599af0f`. The local run used Node 24.20.0 on the shared development host. It advanced 300 fixed 100 ms physical steps with the real Colony pack and native kernel. It excludes SQL, publication, alarms, network and DO invocation CPU.

Reproduce with the generated WASM from this source, bundling `engine/scripts/measure-framework-proof.ts` with esbuild and running `node <bundle> --steps=300` from the repo root. The retained local ledger is `.botanical/framework-proof-baseline/native-300.json` (SHA-256 `a0ea75756985d6f8ee94e95e62e3127283001215e3059338d750a475dd8448e0`). The command runs through the shared-host `run-proof.sh` wrapper. The JSON is local evidence, not a checked-in fixture.

| Local measure over 300 steps | p50 | p95 | p99 | max |
| --- | ---: | ---: | ---: | ---: |
| Native advance, ms | 3.35 | 10.16 | 45.79 | 409.44 |
| Full record capture, ms | 8.48 | 11.94 | 13.69 | 20.55 |
| Changed-record bytes, including key and 16-byte metadata | 935,348 | 1,075,677 | 1,086,558 | 1,089,893 |

All 100 workers have distinct executing native attempts by step 20 and still do at step 300. No tree is completed by step 300, so this run **does not** prove output or sustained utilization. Its long routes are part of the reason it is diagnostically useful. The workload contains 128 initially available finite tree chains in distant bands but lacks the replenished cohorts, hauling, topology edits, water and air pressure required by gate 0.

The Region changed-record admission limit is 1,048,576 bytes. **43 of 300 local steps exceed it**; the first failure would be step 13, at 1,068,804 bytes. Offset-keyed entity chunks `kernel/entities/0000` through `/0003` account for about 278 MB of the 280 MB changed-record traffic across this run. A length change early in the serialized entity image shifts unrelated later data. This is the present blocking owner for local workerd progress. In a local workerd run of this source, the Region advanced to revision 12 and then repeatedly reported `region-record-change-bytes`; the provisional native step could not commit.

The first step's stored session state was 105,718 bytes because 128 bootstrap outcomes were present. Later stored session states were around 0.8 KB. A separate clock-receipt correction at `b44fe823` stopped copying those outcomes into every private clock receipt. Clock-overrun scheduling was corrected at `1701933b`; neither correction fixes changed records. The next comparison must pin a new source/WASM pair, use this same v1 workload, and show changed bytes/rows plus local workerd progress past step 13. Only after that can the richer qualification workload and complete host cost ledger be interpreted.
