# Owned proof record — 2026-09-08

Every command ran from `/home/levi/src/hive` with:

```text
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh <ordinary command below>
```

The wrapper uses an owned systemd user scope, RuntimeMaxSec=10min, TimeoutStopSec=5s and control-group cleanup. Native retained sessions were polled through terminal completion, with no background browser or dependency installation. Short commands completed in their initial call. No unexpected failing experiment occurred in this owned study; negative controls deliberately rejected bad candidates. Earlier successful outputs remain alongside the later stronger checks.

Let `C=.botanical/research/environment-round2-20260908/coupling/` **only as notation in this table**, not an environment variable used by the commands.

| Scope | Ordinary command (C expanded to path above) | Retained native handle | Terminal result |
|---|---|---|---|
| run-u1719 | `python3 C/coupling_fixture.py independent-results-run1.json` | Initial call terminal | exit 0 |
| run-u1729 | `python3 C/gas_harness.py gas-results-run1.json` | 71754 | exit 0; 5.10 s internal wall observation |
| run-u1736 | `python3 C/gas_harness.py gas-results-run2.json` | 2793 | exit 0; 6.81 s internal wall observation |
| run-u1743 | `node C/water_harness.mjs water-results-run1.json` | 87214 | exit 0; 165.94 s including full state/receipt proof hashing |
| run-u1747 | `python3 C/coupling_fixture.py independent-results-run2.json` | Initial call terminal | exit 0; includes negative signed thermal anomaly |
| run-u1751 | `python3 C/physical_water_air.py` | Initial call terminal | exit 0; interval rebased to independent fixture time zero |
| run-u1754 | `node C/wet_edit.mjs` | Initial call terminal | exit 0 |
| run-u1756 | `python3 C/physical_water_air.py water-receiver-bound.json physical-water-air-bound-results.json` | Initial call terminal | exit 0; explicit actual water interval/revision |
| run-u1760 | `node C/wet_edit.mjs wet-edit-results-run2.json` | Initial call terminal | exit 0; includes gravitational-potential diagnostic |

Final qualified inputs:

- Water sibling `water/solver.mjs`: SHA256 `3df6b17552e9dfedbb5a75cb9768615c47466d5fccaeaafcd15d9a4ea59c299e`; Node v24.20.0.
- Gas sibling `gas-heat/experiment.py`: SHA256 `60311d19969bc3d5478f57b1ee581aa0d9a9fa4b47788566cb7c8c9f75c833ea`; Python 3.12.3. Gas author independently read this study's actual gas/coupling callers and confirmed the boundary descriptions and stable hash.
- Wet initial physical snapshot file `water/runs/first-diversion-base/li-divert-no-dig.json`: SHA256 `e001cefae359bc56bb5a4b19acdee112a70813c68156f3dfca75e5ddb6383b95`. Its 180 s nonnegative state is a **new common initial condition**, not a claim of replaying the older generating solver.

The water harness and final gas harness checked solver file hashes before and after execution. Python imports disabled bytecode writing before loading sibling implementations. All created/modified files are under this owned coupling directory. No production, docs, art, Git, build, release, runtime lifecycle or backend mutation was performed.

Canonical traces are in `water-results-run1.json` and `gas-results-run2.json`; earlier gas output is preserved. `physical-water-air-results.json` retains the first rebased example; `physical-water-air-bound-results.json` is the stronger interval-bound example. No trace hash claims fluid correctness, cross-engine determinism, distributed agreement or production capacity.
