# Hive preservation anchor — September 23, 2026

This branch is a recovery archive, not an accepted merge or playable release. Its first commit has all 87 registered worktree tips as parents, so their committed histories remain reachable. The active, reviewed-integration handoff is on `engine/event-driven-scheduler-audit-20260923`; neither branch merges to `main`.

Under `recovery/2026-09-23/`, `MANIFEST.json` records 154 exact dirty source snapshots, one deleted path and two unresolved index stages. The evidence tiers add 16 pinned framework ledgers, 591 unique authored notes/current pause/browser/historical motion files, 923 unique environmental experiment results and scripts, 522 compact proof metadata files, and 16 losslessly compressed large terrain/camera reports. Each tier has a manifest with original paths, SHA-256 hashes and Git blob identities. The large reports use `gzip -n -1`; decompression hashes were verified against their original files before handoff.

The archive retains provenance. A file's presence does not make an experiment valid or an old branch current. Read `engine/FRAMEWORK-HANDOFF-20260923.md` on the active branch for accepted source evidence and remaining performance gates.

Generated distributions, Cargo/toolchain and dependency caches, SQLite runtime stores, and intermediate duplicate screenshots/traces remain outside this Git archive. Those local worktrees and proof directories were not reset or swept. Do not treat the archive as permission to delete them without checking custody and reproducibility.
