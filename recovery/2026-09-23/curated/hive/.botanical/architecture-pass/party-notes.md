# Party and optimizer evidence

Recorded from the existing bounded probes; nothing was rerun for the final plan review.

## Roster matching probe

- Source: `.botanical/architecture-pass/optimizer-probe.mjs`
- Wrapper: `/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh`
- Collected systemd scope: `run-u176.scope`
- Invocation ID: `15994a8c9a35456c99b1878fad5df851`
- Cleanup: the wrapper launched a transient user scope with `--collect`; it completed successfully and retained no running process.

Observed output:

```text
twoByTwo {"edges":[{"character":"a","task":"j1","cost":2},{"character":"a","task":"j2","cost":11},{"character":"b","task":"j1","cost":11},{"character":"b","task":"j2","cost":2}],"chosen":[{"character":"a","task":"j1","cost":2},{"character":"b","task":"j2","cost":2}]}
twoPeopleOneTask {"edges":[{"character":"a","task":"j1","cost":2},{"character":"b","task":"j1","cost":11}],"chosen":[{"character":"a","task":"j1","cost":2}]}
onePersonTwoTasks {"edges":[{"character":"a","task":"j1","cost":2},{"character":"a","task":"j2","cost":11}],"chosen":[{"character":"a","task":"j1","cost":2}]}
duplicateEdge {"edges":[{"character":"a","task":"j1","cost":11},{"character":"a","task":"j1","cost":2},{"character":"b","task":"j2","cost":2}],"chosen":[{"character":"a","task":"j1","cost":11},{"character":"a","task":"j1","cost":2},{"character":"b","task":"j2","cost":2}]}
```

Shared task IDs enforce one selected actor when actor/task input pairs are unique. The wrapper does not deduplicate repeated actor/task pairs, so the caller must emit exactly one edge for each pair.

## Cost priority probe

- Collected systemd scope: `run-u177.scope`
- Invocation ID: `07a767a218a84ecbabafbe47685ca9e4`
- Cleanup: completed under the same transient `--collect` wrapper.

For travel 10 and work 20, `compute_cost` returned 30, 15, 6 and 3 for priorities 1, 2, 5 and 10 respectively.
