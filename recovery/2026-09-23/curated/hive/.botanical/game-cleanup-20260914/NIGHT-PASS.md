# Conservative night cleanup

- Removed `/home/levi/src/hive-worktrees/controllers/tools/engine-controller/node_modules` (about 409 MB).
- The `controllers` worktree was clean and inactive before removal; source, lockfile, `.wrangler`, `.botanical`, branch and Git registration were preserved.
- Preserved the active `workattempt-consolidation` Rust target because its writer is continuing the accepted WorkAttempt migration.
- Preserved every `.botanical` directory and all dirty/unpublished Game worktrees.

## Extra-drive cache cleanup

Deleted only reproducible Game-owned caches after confirming no matching process and no source/worktree metadata in the Cargo target paths:

- `/mnt/fungi-extra/botanical-work/hive-cargo-target-root` (Cargo target cache, about 1.6 GiB)
- `/mnt/fungi-extra/botanical-work/hive-cargo-target-integration` (Cargo target cache, about 1.5 GiB)
- `/mnt/fungi-extra/botanical-work/hive-deconstruction-control/node_modules` (about 549 MiB; registered worktree clean, source/branch/`.botanical` retained)

No worktree, Git branch, source file, proof receipt, `.botanical` directory, credential, or unpublished change was removed.

## Completed lane worktree release

Removed two clean, inactive worktree registrations after their reviewed net changes were integrated and pushed on `engine/clearing-repair-acceptance-20260914`:

- `/home/levi/src/hive-worktrees/clearing-party-join`
- `/home/levi/src/hive-worktrees/clearing-controls-20260914`

Their source branches and remote branches remain retained; no branch was deleted.
- `/home/levi/src/hive-worktrees/paired-depth-repair` released after its reviewed net source and laws were integrated/pushed; branch and remote retained.
- `/home/levi/src/hive-worktrees/clearing-party-proof-20260914` released after its reviewed proof source was integrated/pushed; branch and remote retained. No native or Wrangler proof had been run from that lane.
- `/home/levi/src/hive-worktrees/floor-replacement-acceptance-20260914` released after its reviewed occupied-bed acceptance laws were integrated/pushed; branch and remote retained. Its Cargo execution remains part of the single joined native qualification.
- `/home/levi/src/hive-worktrees/floor-colony-consumer-20260914` released after its reviewed public Colony floor-under-furniture consumer law was integrated/pushed; branch and remote retained. No build or test was run in that lane.

## Shared exact dependency links

Restored top-level links for the exact already-installed package bytes held under
node_modules/.ignored. No package manager, network request, lockfile change, or
package source change occurred. This repairs the existing shared worktree
dependency path for the final qualification and build.
## Overnight continuation

- Integrated the remotely backed qualification-runner commit `ed08abe7` as
  `ab94fee` on `engine/clearing-repair-acceptance-20260914`.
- Kept the qualification worktree because it contains `.botanical` evidence.
- Confirmed no Hive proof, build, browser, Worker, or Cargo process was active.
  A separate Botanical Git push was left untouched.

## Detached release duplicates

Removed three clean, inactive, detached Game release worktrees after verifying
that each contained no `.botanical` directory and that each exact commit was
reachable from a remote branch:

- `/home/levi/src/hive-brew-release-20260908` at `1d90cd52a3a3f1be1eabc7d166f25d00188ead16`
- `/tmp/hive-brew-art-release.NEicej` at `e53736424525567f5cbce5261e2937d86ddfe2e5`
- `/tmp/hive-dig-release-dimRCH` at `449e9b8a642dc1c9e6d815f8e7417c143ba1e574`

Their commits and all branches remain. The unresolved detached study worktree,
every dirty lane, every `.botanical` directory, and every active acceptance or
writer root remain preserved. Registered worktrees fell from 351 to 348.

The active WorkAttempt Cargo target grew to about 2.2 GiB and left only 368 MiB
free on the root filesystem. With no Cargo, rustc, proof, browser, Worker or
Wrangler process active, it was moved intact to
`/mnt/fungi-extra/botanical-work/hive-workattempt-target-20260914` and replaced
by an exact symlink at its original `engine/kernel/target` path. This preserved
incremental build bytes and freed root space without changing source, Git state,
toolchain or evidence.

- Removed clean Game worktree `party-offline-proof-recut-20260914` after commit `739b761` was pushed and integrated into acceptance as `1c11749`; branch remains remotely recoverable.
- Preserved previously remote-unreachable clean study commit `e1c9c6b` on remote branch `archive/hive-study-release-20260908`, then removed its detached worktree. The branch retains the exact source; no `.botanical` evidence existed in that worktree.

## Reproducible release output cleanup, continuation

Removed only top-level `dist` output from six clean, inactive Game worktrees after confirming no owned process was active: `gameplay-water-release`, `wet-release`, `goblin-environment`, `colony-performance-playground`, `fresh-engine`, and `authored-orders`. About 110 MiB was freed. Branches, source, `.botanical` evidence, deployment receipts, dependencies and worktree registrations remain intact.
- Removed the generated `engine/kernel/target` cache (about 1.9 GiB) from the clean deconstruction writer after its focused five-test receipt was preserved and no Cargo/rustc process owned that directory. Source, branch, commit, `.botanical`, and test result remain; the subsequent source-only ownership correction must reuse the shared target or rebuild narrowly.
- Removed the process writer's generated Cargo target (about 1.9 GiB) after its focused results and two failing cases were reported, with no Cargo/rustc process active. Source, pushed branch, `.botanical`, and failure evidence remain.

## September 14 Clearing continuation

Retired 28 additional clean, inactive Game worktrees whose exact HEAD was reachable from `origin`. Before removing each checkout, its `.botanical` directory was moved intact to `.botanical/game-cleanup-20260914/retired-worktrees/<lane>`. Branches and remote commits remain; no branch was deleted. Exact paths, commits, branches, and archive locations are recorded in `retired-worktrees-20260914.tsv`.

The acceptance Rust test target was regenerated for the 306-law run. A cross-filesystem cache move to `/mnt/fungi-extra` stopped when that filesystem filled; no source or generated WASM was involved. With no Cargo/rustc process active and test receipts already retained, both incomplete generated target-cache copies were removed. This left about 2.9 GiB free on root and 857 MiB on `/mnt/fungi-extra`.
