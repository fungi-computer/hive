# Native proof evidence

All runs used `/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh`
around the ordinary Python command (10-minute guard, 5-second stop grace).
Every listed terminal exit was observed by polling its native session. All
writes stayed in this ignored research directory. No background server or DB.

| Ordinary command suffix | Scope | Native session | Observed exit | Record |
|---|---|---:|---:|---|
| `experiment.py --quick --output first-run.json` | run-u1722 | 39720 | 0 | first-run.log/json |
| `probes.py half` | run-u1727 | 28431 | 0 | half.log, half-results.json |
| original three-case `probes.py quarter` | run-u1730 | 33793 | 143 | quarter-bounded-partial.log/json |
| `experiment.py` | run-u1732 | 6628 | 0 | full.log, results.json |
| `probes.py checks` | run-u1734 | 77114 | 0 | checks.log/json |
| `probes.py time` | run-u1735 | 8723 | 0 | time.log/json |
| initial `aperture-probes.py` | run-u1738 | 58808 | 0 | aperture.log |
| bounded local `probes.py quarter` | run-u1741 | 47730 | 0 | quarter.log/json |
| `probes.py sensitivity` | run-u1742 | 71242 | 0 | sensitivity.log/json |
| extended `aperture-probes.py` | run-u1746 | 45932 | 0 | aperture-ambient.log, aperture-results.json |
| `probes.py checks`, explicit pair proposal computation | run-u1755 | 48219 | 0 | checks-explicit-star.log, checks-results.json |
| `compare.py` | run-u1764 | synchronous exec | 0 | comparison.log, decision-results.json |

The first run finished its numerical falsification normally; several layouts
failed unchanged gameplay targets. Neither normal exit nor ledger closure is
ventilation acceptance. First-round files and first-round failures remain intact.

The original finest group completed its 384-cell sealed 900 s baseline in
176.93 wall s. It was deliberately stopped normally via its owned scope, with
the native session observed at exit 143, to avoid spending the remaining guard
on two further expensive cases. Completed sealed output is retained. Its
in-progress remote-high case produced no result and is not evidence. The
source-local finest case received its own bounded scope and completed normally
in 568.71 wall seconds; no observation timeout was interpreted as process
termination. All owned native sessions are now terminal.

Observed first-run 24-cell modes used 0.62–2.57 wall s for 900 simulated seconds;
the 96-cell four-case group used 111.08 wall s. These unoptimized Python runs
overlapped other bounded work on the shared host, so wall-time ratios are not
scaling benchmarks. JSON records include per-case cells/faces, substeps,
pressure/linear iterations, canonical snapshot bytes, process peak RSS and
wall time. Rendering, pathfinding, actors and production costs are unmeasured.
The finest local case had 384 cells/724 faces, 2,192 substeps, 13,845 nonlinear
pressure iterations and 1,372,602 linear iterations; peak process RSS was
19,840 KiB, final JSON snapshot 16,896 bytes. A steady pressure solve still
requires the connected component; sparse visible smoke would not bound it.

Stable import API: `make_fixture`, `initial`, `advance`; `advance` returns a
successor and canonical signed per-face integrated air/smoke/heat receipt.
Pressure is derived anew; state and graph are not mutated. This is a research
entrypoint, not a game command/admission layer. The coupling expert imports
this actual solver for partition/receipt tests rather than copying equations.
Final `experiment.py` SHA-256:
`60311d19969bc3d5478f57b1ee581aa0d9a9fa4b47788566cb7c8c9f75c833ea`.
