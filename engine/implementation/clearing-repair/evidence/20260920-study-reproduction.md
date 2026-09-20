# September 20 study evidence

Baseline: `cf9c7854a401cbb245d4b98bf0a32aa2515f81ae` in
`/home/levi/src/hive-worktrees/living-terrain-integration`.
The preserved `cut-terrain-layer` source/test experiment is unaccepted and is not
imported by the grass witness. Product source was not repaired in this study.
Commands below describe completed proofs and how to repeat them on this host;
they are not evidence of additional runs. Use the shared proof guard for repeats.

## Original-art rendering witness

From the integration root:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh env LD_LIBRARY_PATH=/home/levi/src/Botanical-next/.botanical/playwright-libs/root/usr/lib/x86_64-linux-gnu node engine/implementation/clearing-repair/evidence/20260920-grass-bank-render-probe.mjs
```

The script starts an ephemeral Vite server, uses installed Playwright and the
existing Chromium headless shell, reads the original atlas and disposes the
server/browser. Default output is `.botanical/engine-study-20260920`; override
with `HIVE_STUDY_OUT`. `u2511` completed with 24 wrong interior pixels and no
browser errors. Preserved PNG and JSON files use prefix `20260920-grass-bank-`.
The `expected.png` filename denotes a bank-last diagnostic, valid as an oracle
only at pixels certified by independent geometry. It is not a general correct
whole-image reference or proposed sorting repair.

The earlier top-only attempt `u2508` failed its interior-witness assertion. Its
outputs remain in `.botanical/engine-study-20260920/top-only-attempt`.
The passing proof includes the actual bank's top and two visible side faces.

The geometric-only source and result are preserved separately as
`20260920-grass-bank-order-probe.{mjs,json}`. Original `u2503` and preserved repeat
`u2504` passed. It established coincident projection with different depth, not
independent pixel coverage.

## Native cost and recovery

`20260920-engine-cost-probe.ts` is the exact executed study source, including
its absolute integration imports and `/tmp/hive-engine-study-cost-20260920`
output path. It is an archival probe, not an installed product benchmark.
The existing scratch directory's `node_modules` symlink points to
`/home/levi/src/hive/node_modules`. It uses already installed esbuild; no package
installation or native rebuild occurred. If repeating on a different checkout,
change the explicit imports/output path and report that new source separately.

The completed bundle command, run from the integration root:

```sh
node --input-type=module -e 'import {build} from "esbuild"; await build({entryPoints:["/tmp/hive-engine-study-cost-20260920/probe.ts"],bundle:true,platform:"node",format:"esm",packages:"external",outfile:"/tmp/hive-engine-study-cost-20260920/probe.mjs"});'
```

The completed proof command:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node /tmp/hive-engine-study-cost-20260920/probe.mjs
```

`u2510` is the preserved final run. `u2506` failed when querying private
WorkAttempt as a public component; the corrected probe reads already-captured
records. `u2507` first passed, then `u2510` added per-step samples so workflow and
idle costs could be distinguished. No unexplained failed engine law is hidden by
these probe corrections.

The probe emits raw samples. `windows` in the preserved JSON was appended by
postprocessing, not emitted by the TypeScript source:

- Last sample with held work or output below 300 wood: tick 84.
- Workflow window includes final completion: ticks 1–85.
- Warm workflow excludes cold tick 1: ticks 2–85.
- Idle tail: ticks 86–90.
- Median and p95 use nearest rank, sorted index `ceil(n * fraction) - 1`.
- Counts are sampled at step boundaries. A workflow window can contain a gap
  with no held attempts while work remains incomplete.

The preserved result includes all 90 raw samples, environment, WASM hash,
instrumentation counts, exact recovery outcomes and these derived windows.
`changedBytes` and `changedRecords.bytes` measure whole records selected for
rewriting, not unequal bytes inside those records. Sequential outer timings and
nested native timings must not be summed together. This is a headless one-second
step fixture, not browser/DO capacity evidence.

## Region laws

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh timeout --signal=TERM --kill-after=5s 60s node --test src/engine/region/region.test.js src/engine/region/admission.test.js
```

`u2505` passed 20 tests. Detailed scope, source anchors and the pinned Botanical
comparison are in `20260920-durability-findings.md`. This is not a fresh current
Colony hosted crash or autonomous AI proof.
