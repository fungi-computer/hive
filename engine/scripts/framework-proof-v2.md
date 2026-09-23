# Framework workload v2: local diagnostic

`colony-framework-proof-256-100-v2` is a bounded gate-0 diagnostic. V1's builder,
ID and existing measurement script are unchanged for record-owner comparisons.
V2 is a different workload; its latency is not a before/after comparison to v1.

The fixed 256×256 world contains 100 workers in four distant quadrants and 384
finite six-unit trees. The first 128 chains are initially available. The ordinary
Colony `designateTrees` command releases another 128 at steps 601–604 and another
128 at 1201–1204, in batches of 32. All resources exist from initialization;
release neither adds nor replenishes physical material. Initial workers, trees
and destinations are distributed over generated terrain, including its slopes
and obstacles. This is not a handcrafted maze or a guarantee of reachability.

Four 768-unit storage providers receive ordinary stockpile policy at step 2.
Four workers carry real pails. Four hearths each consume one authored wood unit
through native emission admission before work starts, emitting smoke/heat for
30 simulated seconds. The smoke domain covers the whole Region. An ordinary
excavation command targets the generated surface at `[-95, -94]` at step 101;
four ordinary water requests occur at step 201. No simulation owner is copied.

The local script runs 1,800 fixed 100 ms steps. It records every scheduled action's
acceptance/rejection, actual wood quantities, carried and stored wood, one-second
worker samples, field facts, smoke/heat at the hearth cells, record capture and a
final restore attempt. The 2,304 tree units must remain conserved across standing
wood, felled wood and finished logs. Four additional hearth fuel units have
already been paid at bootstrap. Completed chains are finished log quantity / 6;
the workload has no subsequent log consumer, so deliveries do not reduce this
counter. Merely emptying a tree's finite stock does not count as a complete chain.

`moving` requires actual displacement since the prior sample. Stationary route
attempts count separately. `working` means executing a native non-route activity;
it does not independently prove progress for each worker. Displacement is a
sampled lower bound, not exact path length. Advance timings include Session's
TypeScript orchestration and native advancement, not separately instrumented
native phases. A one-second window enters active timing when its final sample
observes movement or non-route execution. No idle window enters that percentile.

From the repository root with this source's generated WASM and dependencies:

```sh
proof=/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh
mkdir -p .botanical/framework-v2
"$proof" node_modules/.bin/esbuild engine/scripts/measure-framework-proof-v2.ts engine/scripts/reproduce-framework-water-restore.ts engine/src/games/colony-framework-proof-v2.test.ts --bundle --platform=node --format=esm --outdir=.botanical/framework-v2/bundle --outbase=engine
"$proof" node --test .botanical/framework-v2/bundle/src/games/colony-framework-proof-v2.test.js
"$proof" node .botanical/framework-v2/bundle/scripts/measure-framework-proof-v2.js > .botanical/framework-v2/1800.json
"$proof" node .botanical/framework-v2/bundle/scripts/reproduce-framework-water-restore.js
```

The diagnostic exits unsuccessfully on step or recovery failure while retaining
the ledger. A failed recovery snapshot is written to
`.botanical/framework-v2/recovery-failure.json`, with typed bytes explicitly
encoded as `{encoding: "uint8", bytes: [...]}`. The small reproduction uses the
existing 64/4 performance pack, one accepted `requestWater` command and a save /
restore; it requires no v2 smoke, hauling, cohort driver or new record format.

## Remaining gate-0 and qualification work

- V2 is not admitted by the public host, and its command schedule has not run
  through Region/workerd/DO persistence or command identity. No host file changed.
- The work mix is finite and lasts 180 simulated seconds. It is not the frozen
  ten-minute hosted active qualification, and the four hearths run only 30 seconds.
- Water requests are not proof of actual water delivery or active fluid pressure.
  Air pressure is explicitly unsupported by the current environment contract;
  only native smoke and heat are exercised.
- The script does not expose route expansions, pending versus no-path decisions,
  replans, oldest waiting-job age, field backlog age, native phase CPU, SQL,
  observation/socket costs, alarm lateness, invocation CPU or client behavior.
- Save/reload of ordinary pending manual water demand currently fails. The
  existing native validator requires a staged process for this standalone order.
  The failure remains visible; this fixture does not claim durable qualification.

Two new fixture/cohort/recovery tests and three selected existing v1/preset tests
pass. Type checking remains blocked by existing errors in transitive Colony,
actions, authoring and construction code; the broad engine check also lacks
Node type declarations. No type diagnostics name the changed fixture/driver
source. No existing Fallow report covering `colony-performance` was found in
the retained local audit artifacts; no new Fallow-clean claim is made.

## First complete local run, September 23

Source `10a7f7f88766a80238ba064d0493102a1bc74a73`, WASM SHA-256
`5c2620e6416a9114a553c80a89429e98ee278adc0048bfbf131f06eb0599af0f`.
This is the original baseline WASM/record format, not the later stable-record
build. Retained ledger: `.botanical/framework-v2/1800.json`. Node 24.20.0,
Linux x64 shared development host, no clients. The run completed all 1,800 steps
in 234.72 seconds wall time, then exited 1 because final recovery failed with
`field water process is missing`. Every scheduled native action was accepted.

| Simulated minute | Completed chains | Finished wood | Delivered wood | Carried wood |
| --- | ---: | ---: | ---: | ---: |
| 1 | 32 | 192 | 9 | 52 |
| 2 | 98 | 588 | 21 | 120 |
| 3 | 133 | 798 | 29 | 115 |

175 of 180 one-second samples observed at least 90 moving or native non-route
workers. All sampled windows were active by the documented definition. This
three-minute local utilization result does not qualify hosted capacity.
Standing wood + felled wood + logs remained 2,304 at every sample. One excavation
actually changed terrain. Four paid hearths produced sampled smoke up to
0.012199 kg/m³ and heat up to 30.166°C. Water orders stayed at four; no water lots
were delivered, and observed field mass/mobile mass did not change. Thus water
delivery and active fluid pressure remain unproven.

| Local boundary | p50 | p95 | p99 | maximum |
| --- | ---: | ---: | ---: | ---: |
| Session advance, ms | 16.33 | 561.38 | 1,494.48 | 2,091.59 |
| Full record capture, ms | 24.56 | 66.57 | 89.24 | 144.79 |
| Changed bytes, key + 16-byte metadata included | 1,792,547 | 2,323,358 | 2,336,779 | 2,344,559 |

1,676 of 1,800 steps exceed the old host's 1 MiB changed-record limit. The local
script observes this; it does not enforce a Region transaction. The shared host
was not CPU-isolated. These whole-boundary timings cannot identify a native
phase or establish a capacity limit. The first run retained summary times only;
the measurement script now additionally emits every step's advance/capture times
and changed bytes/rows so command and scheduling spikes can be inspected.

The completed ledger SHA-256 is
`726a4c544b90df866f123f18441dcf344267fd2d08cd247ad4ea32a0801925dd`.
The matching failed recovery snapshot is preserved separately as
`.botanical/framework-v2/recovery-failure-first1800.json` (SHA-256
`040dd16ed3ae79842014fd5b73f86cd2d509ede605fc64f42fa57afdb1a1045f`).
Fixture definition SHA-256 is
`e17a81bb7b9d41fba0b0d2a803a067866957b1b752f78cf6197bcec580c13013`;
environment SHA-256 is
`851332faa0a818c129ef409423500ea058d850f463848dc47e8874a5a020b5ed`.

Levi stopped further broad measurement on September 23. The raw per-step rerun
and first-20-step feature-ablation process were terminated normally through their
owned proof scopes and retained/polled to exit 143. Neither emitted a completed
ledger; their empty output files are not evidence. No feature-causality finding
or per-step spike correlation is claimed. `diagnose-framework-proof-v2.ts` is
preserved source only: it bundles successfully but its full variant run was
interrupted. It derives separate diagnostics without changing frozen v2, including
a small atmosphere with distant hearths that may reject emission admission.
Measurement work remains paused; record mutation and long-route progress are
the next integration priorities.
