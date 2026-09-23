# Retained native terminal evidence

Every experiment used `/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh` (systemd owned scope,10-minute guard,5-second stop grace), and each native handle was polled through terminal completion. No detached or game runtime process was launched.

| Scope | Native handle | Invocation ID | Command / outcome |
|---|---:|---|---|
|run-u1726|63772|8001506ad8b14e60b5f0d8ffd49ddcef|qualification initial; observed terminal exit0; local-inertial Ritter thresholds failed|
|run-u1728|21216|8d2d0d2a0b5f4be3b2fd147c5faa0ddd|base first-diversion; observed terminal exit0; downstream and LI comparison thresholds failed; tiny negative LI rounding retained|
|run-u1733|55078|532d2a7268644a288d5c4fcdedd2d86a|refinement corrected; observed terminal exit0; fixed-theta timestep/spatial failures retained|
|run-u1739|none (foreground terminal)|4eef1c72652a406ea30fecf605e22aaf|groundwater.mjs; direct terminal exit0; discrimination only|
|run-u1745|56896|8bff42c3850b451891a6c66aa480f6e2|restart corrected; observed terminal exit0|
|run-u1748|97464|3e993e26e98a468a9c60921bf239ae99|radial corrected; observed terminal exit0|
|run-u1750|99978|04b7da6cdcff4f088102d3ab4a9698d9|final-checkpoints.sh; observed terminal exit0; corrected radial convergence criterion failed and retained|
|run-u1761|86766|b1ce7e08b13c4efb9c07b80fcb3e38dd|summarize.mjs; observed terminal exit0; all original and supplemental threshold dispositions consolidated|

Node v24.20.0, linux x64. The first two full outputs are retained in conversation and their per-case JSON/manifests; later `proof-*.log` retain ordinary-command output. Each run directory includes the exact source bytes/sha256 it executed. Exit0 records successful experiment execution, including explicit failing numerical/behavioral criteria. It does not mean a production solver was accepted.
