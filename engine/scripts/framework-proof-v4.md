# Framework workload v4

V4 is a new qualification candidate. The pinned v3 data, command ledger and
proof scripts remain unchanged. V4 preserves the same 256×256 terrain seed,
100 distributed workers, finite 2,304 wood units, water sources and four
material-paid heat/smoke emitters. It repartitions the finite sources into six
64-chain cohorts: 128 independent jobs are available initially, then four
64-chain cohorts are designated at minutes 2, 4, 6 and 8. No source grows back
and no output is added during the run.

Workers remain split four ways across distant quadrants. Sources and the four
storage destinations span the cross-quadrant bands, so the workload includes
longer hauling routes. Generated terrain provides walking obstacles. The
command ledger designates bounded cohorts, excavates one terrain cell at step
101, and issues four finite water demands at step 201. The atmosphere workload
uses the existing Colony emitter and environment systems. V4 changes only
content and schedule; it does not add a simulation path.

## Local WASM qualification

Build the ordinary fixture bundle and run the default 6,000 occurrences. The
default is 600 simulated seconds at 100 ms per occurrence. A shorter run is a
diagnostic and cannot pass the ten-minute target.

```sh
node_modules/.bin/esbuild engine/scripts/measure-framework-proof-v4.ts --bundle --platform=node --format=esm --outfile=/tmp/hive-framework-v4.mjs
node /tmp/hive-framework-v4.mjs --native-source=<native-source-commit>
```

On the shared build host, wrap both commands with the maintained
`run-proof.sh` scope. Use the same release WASM and native source pin for before
and after comparisons. The report pins fixture definition/environment hashes,
WASM SHA, source, command outcomes, workchain output, wood/water conservation,
recovery continuation, changed record bytes, local phase timings, CPU model,
and per-minute samples.

The predeclared local gates are at least 90 moving or working workers in 90% of
the one-second samples in each minute, positive finished-wood output every
minute, no sampled route with more than 256 m remaining, and no designated
finite chain older than 120 simulated seconds. Blocked, unassigned and
stationary-route workers are recorded separately. Route search expansions,
pending/no-path decisions and replan counts are unavailable through the current
GameSession/WASM public API and must not be reported as zero. SQL, DO CPU,
publication and alarm costs are also outside this local runner.

## Local workerd host law

`framework-proof-v4-workerd.mjs` builds a proof-only registry overlay around
the existing public Region Durable Object. It adds v4 through the current
`publicPackRegistration` API and does not change `tools/public-engine-host`.
The output records source/WASM hashes, durable host sequence, exact command
retry, clock-receipt restart, and emitted host cost rows. To run a short smoke:

```sh
HIVE_DEPENDENCY_CONTEXT=/path/to/hive/package.json \
  node engine/scripts/framework-proof-v4-workerd.mjs --output <new-proof-directory>
```

Set `--active-seconds 600` to retain the running Region for a complete local
ten-minute active window. A short default run proves fixture admission and
durable host behavior only; it does not sample productive actor counts. A full
workerd run must be paired with the local WASM worker/throughput ledger and the
host owner’s committed SQL, publication and alarm metrics.

The current host registration on the v4 authoring base knows v2/v3 only. The
proof-only overlay makes a separate source change unnecessary, but the
Cloudflare-hosted performance backends remain parked. Hosted ten-minute parity,
two-client behavior, socket costs, and performance capacity are unavailable.

## Current evidence, September 23

The committed compact ledger is
[`framework-proof-v4-evidence.json`](./framework-proof-v4-evidence.json).
The raw local reports remain in the lane's ignored `.botanical/framework-v4/`
directory with the hashes recorded there.

The v4 pack-law test passed: 100 workers are split 25 per quadrant, 128 chains
start designated, 384 chains and 2,304 finite wood units are authored across
six cohorts, two finite water cells remain reachable, four emitters are
present, and the bounds are 256×256.

A full 6,000-occurrence local WASM run completed 600 simulated seconds in
566.4 seconds of wall time, under the proof scope's ten-minute limit. It
completed all finite work with wood and water conservation, restored the
current-format save, and matched a ten-step post-recovery continuation. Of 600
one-second samples, 599 had at least 90 moving or working workers; every
minute met its 90% target. Route remainder stayed below 189.5 m and every
minute produced finite output. The configured backlog-age limit failed in
minutes 3, 5, 7, 8 and 9, identifying the backlog/candidate supply owner as the
next measured issue.

| Simulated minute | Finished wood | Samples ≥90 useful workers | Oldest designated chain age |
| --- | ---: | ---: | ---: |
| 1 | 432 | 59/60 | 59.9 s |
| 2 | 246 | 60/60 | 119.9 s |
| 3 | 162 | 60/60 | 151.9 s |
| 4 | 156 | 60/60 | 119.9 s |
| 5 | 210 | 60/60 | 179.9 s |
| 6 | 150 | 60/60 | 119.9 s |
| 7 | 300 | 60/60 | 179.9 s |
| 8 | 150 | 60/60 | 198.9 s |
| 9 | 150 | 60/60 | 169.9 s |
| 10 | 210 | 60/60 | 119.9 s |

The run produced 2,166 wood units / 361 chains and delivered four water
portions with no pending water demands. Local `GameSession.step`
p50/p95/p99/max were 41.1/216.9/352.8/985.7 ms; changed-record capture was
15.0/53.5/74.7/128.6 ms. It emitted 672,917 changed rows and 496.6 MB of
changed record bytes; the maximum occurrence was 424,261 bytes. These are local
wrapper/WASM wall times, not native CPU, SQL or DO CPU.

The raw report is `.botanical/framework-v4/local-6000.json`, SHA-256
`827a5d1154bcbb5d2caf5624b7aaa2ecb83a3f5dd7890175223e469b8cf061e3`. Its
CLI `nativeSource` label captured the harness checkout (`4107a496`) rather than
the binary provenance. The WASM SHA is the release pinned by the sprint ledger
to native `3f86c110`; the raw report is preserved, and
`local-6000-attributed.json` (SHA-256
`38c232aef00d9f90df99eb5b41142acb49ffee3d877b7d6d741ee28da91ee86b`) changes
only that provenance label and documents the correction. The harness source
was base `4107a49621d67b6d39d60f017ba18dc41ad1a0f8`; this commit has a small
later `air_records.rs` source difference, so the run is not an air-record
before/after comparison.

The local workerd harness and the existing v3 framework-driver proof both
currently fail before worker startup in this shared host: workerd returns
`Uncaught Error: internal error` during runtime initialization. No durable
host result is claimed from that failure. The command is retained to reproduce
the host check when the local runtime is serviceable. Cloudflare remains parked,
so the hosted ten-minute gate remains unavailable.

No current Fallow report or executable was available for the new fixture and
harness files; no Fallow-green claim is made.
