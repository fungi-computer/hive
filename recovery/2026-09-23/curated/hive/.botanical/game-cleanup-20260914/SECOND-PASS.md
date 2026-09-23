# Conservative cleanup inventory — second pass

Date: 2026-09-14  
Repository: `/home/levi/src/hive`

This is a read-only candidate report. No worktree, process, branch, remote, or
cache was changed.

## Candidate worktrees

There are **no eligible cleanup candidates** under the requested rule.

The inventory inspected 346 registered worktrees. A candidate had to satisfy
all of these conditions:

- clean tracked and untracked status;
- `HEAD` contained by an explicitly named `origin/*` branch;
- no `.botanical` directory anywhere below the worktree;
- no ignored artifact other than a `node_modules` entry/symlink.

The strict intersection was empty. Clean remote-backed worktrees with build
outputs, nested evidence, or protected ownership were retained in place.

## Unconditional protections

The root tree, clearing-repair acceptance, workattempt consolidation, and
transparent-world-pass trees were excluded before considering cleanup:

| path | HEAD | branch | status/evidence reason |
| --- | --- | --- | --- |
| `/home/levi/src/hive` | `58a2ab2` | `feat/goblin-bed-and-breakfast-mvp` | dirty; `.botanical` present |
| `/home/levi/src/hive-worktrees/clearing-repair-acceptance` | `a2f24a6` | `engine/clearing-repair-acceptance-20260914` | protected; `.botanical` and ignored artifacts present |
| `/home/levi/src/hive-worktrees/workattempt-consolidation` | `56e135d` | `engine/workattempt-consolidation-20260914` | protected; dirty; `.botanical` present |
| `/home/levi/src/hive-worktrees/transparent-world-pass` | `8e9b3d8` | `engine/transparent-world-pass-20260914` | protected; clean, no evidence marker |

The integration tree was also treated as protected if present; no separate
`/home/levi/src/hive-worktrees/integration` path was registered in this scan.

## Rebuildable terminal caches

Sizes are exact `du -sb` byte totals at scan time. These are inventory only;
none are deletion candidates in this pass.

| path | bytes |
| --- | ---: |
| `/home/levi/src/hive-worktrees/clearing-repair-acceptance/engine/kernel/target` | 1,591,093,424 |
| `/home/levi/src/hive-worktrees/workattempt-consolidation/engine/kernel/target` | 363,342,251 |
| `/home/levi/src/hive-worktrees/colony-shared-host/engine/kernel/target` | 361,675,630 |
| `/home/levi/src/hive-worktrees/authored-orders/dist` | 31,587,590 |
| `/home/levi/src/hive-worktrees/fresh-engine/dist` | 31,123,168 |
| `/home/levi/src/hive-worktrees/colony-performance-playground/dist` | 20,524,785 |
| `/home/levi/src/hive-worktrees/goblin-environment/dist` | 13,999,981 |
| `/home/levi/src/hive-worktrees/wet-release/dist` | 9,989,161 |
| `/home/levi/src/hive-worktrees/gameplay-water-release/dist` | 8,930,907 |
| `/home/levi/src/hive/.botanical/worktrees/goblin-den-release/dist` | 4,439,609 |
| `/home/levi/src/hive-worktrees/fresh-network-proof/.botanical/network-v2/.wrangler` | 3,331,664 |
| `/home/levi/src/hive-worktrees/goblin-wet/tools/engine-controller/.wrangler` | 1,223,748 |
| `/home/levi/src/hive-worktrees/controllers/tools/engine-controller/.wrangler` | 1,099,872 |

Nested package `dist` directories under controller `node_modules` were
observed but are dependency contents, not independently actionable terminal
cache candidates.

## Evidence and limits

The scan used `git worktree list --porcelain`, per-worktree porcelain status,
remote branch containment, recursive `.botanical` marker checks, ignored-file
checks, and `du -sb`. It did not inspect secrets, stop processes, prune
worktrees, remove caches, or infer that a clean branch is disposable from age
or naming alone.
