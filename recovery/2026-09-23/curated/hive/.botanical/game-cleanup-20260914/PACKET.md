# Hive cleanup packet — 2026-09-14

This is a read-only deletion proposal. No worktree, branch, cache, proof, or `.botanical` evidence was deleted.

## Frozen integration

- Integration branch: `engine/pathfinding-clean-20260913`
- Integration tip: `a69c0b0f45fe23d551e693003ffb9fc16ed1e3c0`
- Pushed remote: `origin/engine/pathfinding-clean-20260913`
- Recent joined branches are listed in `merged-branches.tsv`.

## Inventory result

- Registered worktrees: 346
- Missing registered path safe for metadata prune: 1
- Existing worktrees meeting the strict removal rule: 1
- Worktrees preserved by at least one rule: 344
- Commits reachable from local branches/tags but no remote-tracking ref under this exact count: 875

The strict worktree removal rule requires all of: clean, inactive, HEAD reachable from a remote-tracking ref, HEAD merged into the frozen integration tip, no `.botanical` evidence, no ignored build/deploy artifacts beyond the shared `node_modules` symlink, and not a protected current checkout. This deliberately produces a small safe list.

## Files

- `inventory.tsv`: every registered worktree and the evidence used for classification.
- `safe-worktrees.tsv`: only deletion candidates passing the strict rule, plus stale metadata.
- `preserve-worktrees.tsv`: dirty, unpublished, active, evidence-bearing, unmerged, or protected roots.
- `merged-branches.tsv`: recent pushed branches already joined; preserve until their `.botanical` evidence is distilled.
- `disposable-paths.tsv`: exact rebuildable cache/stale-metadata commands for a later approved deletion pass.

## Recommended first deletion pass

1. Review and run the `git worktree prune --dry-run` command from `disposable-paths.tsv`; it targets only the one already-missing `/tmp/hive-station-teardown` registration.
2. Remove `/tmp/hive-integration-target` to recover its recorded bytes; it is a terminal, rebuildable Cargo cache.
3. Keep `/tmp/hive-route-tools` unless space pressure outweighs avoiding a repeat tool download.
4. `/tmp/hive-brew-art-base.cbiB9q` is the sole existing worktree passing the strict rule. Its only ignored entry is the shared `node_modules` symlink. Review its row in `safe-worktrees.tsv` before using `git worktree remove /tmp/hive-brew-art-base.cbiB9q`.
5. Preserve every other existing worktree. Distill protected `.botanical` evidence separately, then regenerate this packet.
