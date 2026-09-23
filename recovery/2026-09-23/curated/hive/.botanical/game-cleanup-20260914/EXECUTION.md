# Hive conservative cleanup execution — 2026-09-14

The reviewed first pass was executed without deleting branches, dirty worktrees,
deployment artifacts, or `.botanical` evidence.

## Removed

- `/tmp/hive-brew-art-base.cbiB9q`: clean detached Git worktree at
  `54cbe9d1cf1e7daec6f1d48d28289f2afeba7d85`; its commit was remotely reachable
  and merged into integration. Its only ignored entry was the shared
  `node_modules` symlink.
- `/tmp/hive-integration-target`: 429 MB terminal, reproducible Cargo target
  cache from the successful fresh kernel build.
- The stale Git worktree registration for absent path
  `/tmp/hive-station-teardown`.

## Preserved

- Every local and remote branch.
- All dirty or unpublished worktrees.
- All `.botanical` directories and proof evidence.
- All build and deployment artifacts in existing worktrees.
- `/tmp/hive-route-tools`, which avoids downloading the matching WASM binding
  tool again.

## Post-check

- Registered worktrees decreased from 346 to 344.
- Root filesystem free space increased from about 2.6 GB to 3.0 GB.
- `/mnt/fungi-data` remains at roughly 13 MB free. Most of that mount is shared
  Botanical package stores, installed dependencies, and evidence-bearing
  worktrees; none were changed by this pass.
- No Game proof, build, server, or listener remained active after cleanup.

## Second cache pass

After the scoped-party kernel build completed and its source was pushed at
`a2f24a6853bad925d7acbbcebc107e7873cc75e0`, the terminal Cargo target at
`/home/levi/src/hive-worktrees/clearing-repair-acceptance/engine/kernel/target`
was removed. It occupied 1,591,093,424 bytes. The generated JavaScript and WASM
were retained and re-read afterward at SHA-256
`4b0c08db7f0698218458ee6abf2a04178c413b40cd0ead98a08be596dfc4a777` and
`113e76c4dd9f45b9b5159b1683f96dd85cb415c6d270bdfbed6e13ae64428975`.
No active target, worktree, branch, proof receipt, dist artifact, or `.botanical`
evidence was removed.
## 2026-09-14 overnight cache pass

Removed the reproducible Cargo build cache at `/home/levi/src/hive-worktrees/colony-shared-host/engine/kernel/target` (349 MiB before deletion). The worktree was clean at remote-backed `aecfce4a0e09aa4b399438dc5c30402bbd61735e`, contained by the current acceptance/integration/work-attempt branches, and had no owned process. Source, branch, generated distributable bytes, `.botanical` evidence, and every active lane were preserved.

Removed the terminal shared Cargo cache at `/mnt/fungi-extra/botanical-work/hive-cargo-target-root` (1.6 GiB before deletion) after the floor proof had stopped on a full filesystem and process inspection found no Cargo or Rust compiler owner. This directory contained reproducible compiler output only. The floor source, focused laws, branch, and all `.botanical` evidence remain intact.

The stopped party-lane proof later recreated that same shared target and exhausted the mount during linking. After the lane stopped and process inspection showed the only active Rust command writing to the separate WorkAttempt target, the recreated 1.5 GiB shared cache was removed again. No source or evidence was removed.
