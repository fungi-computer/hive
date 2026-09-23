# Ignored experiment execution record

Command in `/home/levi/src/hive`:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh python3 .botanical/research/environment-expert-pass-20260908/gas-heat/experiment.py
```

Each run used the existing owned systemd proof scope, 10-minute runtime guard,
5-second shutdown grace. Native handles were retained and polled with 1-second
observation windows until terminal exit. No stop/restart/lifecycle operation was
sent to another agent or process. This record concerns only the new numeric
experiment; it supplies no observation about runtime handle 5339 or port 41342.

| Run | Scope / invocation | Native handle | Exit / interpretation |
|---|---|---|---|
| 1 | `run-u1684.scope` / `de1a4e0a338e410f9d661f9c4779e60b` | `64915` | 1, ventilation export criterion failed; `failed-run-1.txt` |
| 2 | `run-u1687.scope` / `6b0ce6aec10f45369c16b4947ec7435c` | `14944` | 1, same method/parameters/criterion; added before-assertion output in retained `failed-run-2-results.json` |
| 3 | `run-u1689.scope` / `34e2d87946034d21801127106d3f9cdd` | `90722` | 0, falsifier completed, candidate explicitly rejected in `results.json` |

Run 3 preserves all scene/numerical parameters and the original `>0.0001 kg`
export criteria. It changes failed product criteria from aborting assertions to
explicit false acceptance fields so numerical convergence, reload and thermal
counterexample checks can finish. Numerical law assertions remain enforced.

The experiment uses Python standard library only. No source imports, application
build, browser/server, dependency installation or scale/performance measurement.
