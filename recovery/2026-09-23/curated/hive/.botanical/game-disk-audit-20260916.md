# Game disk audit — 2026-09-16

Read-only inventory. Nothing was deleted or stopped.

## Keep roots

- `/home/levi/src/hive` — primary retained dirty/unpublished source and active CTO session; 2.326 GiB.
- `/home/levi/src/hive-worktrees/clearing-edge-integration` — authoritative clean integration/release branch at 16066ad9, pushed; 3.091 GiB.
- `/home/levi/src/hive-worktrees/lawful-floor-stockpile` — active dirty stockpile writer lane; 0.059 GiB.
- `/home/levi/src/hive-worktrees/native-job-task-core-current` — inactive but dirty two-file source WIP; checkpoint before removal; 0.059 GiB.

## Safe clean-worktree removals

Removing these worktrees preserves their Git branch refs. Total current footprint: 9.452 GiB.

- `/home/levi/src/hive-worktrees/behavior-authoring` — 0.059 GiB
- `/home/levi/src/hive-worktrees/consolidated-gameplay-law-20260915` — 0.064 GiB
- `/home/levi/src/hive-worktrees/construction-cascade-repair` — 2.612 GiB
- `/home/levi/src/hive-worktrees/construction-geometry-laws` — 0.059 GiB
- `/home/levi/src/hive-worktrees/construction-law-repair` — 0.058 GiB
- `/home/levi/src/hive-worktrees/construction-supply-recovery` — 0.070 GiB
- `/home/levi/src/hive-worktrees/game-material-catalog` — 0.058 GiB
- `/home/levi/src/hive-worktrees/material-law-repair` — 0.058 GiB
- `/home/levi/src/hive-worktrees/native-delivery-consumer-cutover` — 2.298 GiB
- `/home/levi/src/hive-worktrees/native-field-work-requirements` — 0.058 GiB
- `/home/levi/src/hive-worktrees/native-job-foundation` — 0.094 GiB
- `/home/levi/src/hive-worktrees/native-job-task-core` — 0.059 GiB
- `/home/levi/src/hive-worktrees/native-labor-requirements` — 0.058 GiB
- `/home/levi/src/hive-worktrees/native-material-index` — 0.059 GiB
- `/home/levi/src/hive-worktrees/native-planner-index-owner` — 0.058 GiB
- `/home/levi/src/hive-worktrees/native-planner-tick` — 0.059 GiB
- `/home/levi/src/hive-worktrees/native-process-supply` — 0.058 GiB
- `/home/levi/src/hive-worktrees/native-process-water` — 0.059 GiB
- `/home/levi/src/hive-worktrees/native-production-construction-cutover` — 0.059 GiB
- `/home/levi/src/hive-worktrees/native-resource-cutover` — 2.755 GiB
- `/home/levi/src/hive-worktrees/native-resource-job` — 0.059 GiB
- `/home/levi/src/hive-worktrees/native-stockpile-consumer` — 0.059 GiB
- `/home/levi/src/hive-worktrees/native-tree-consumer` — 0.072 GiB
- `/home/levi/src/hive-worktrees/performance-page-recut-20260915` — 0.059 GiB
- `/home/levi/src/hive-worktrees/performance-page-recut-v2` — 0.096 GiB
- `/home/levi/src/hive-worktrees/performance-page-repair-v2` — 0.058 GiB
- `/home/levi/src/hive-worktrees/performance-page-shared-runtime` — 0.101 GiB
- `/home/levi/src/hive-worktrees/placement-preview-admission` — 0.059 GiB
- `/home/levi/src/hive-worktrees/scoped-sort-invalidation` — 0.059 GiB
- `/home/levi/src/hive-worktrees/visual-order-picking` — 0.059 GiB
- `/home/levi/src/hive-worktrees/water-vessel-capability` — 0.058 GiB

## Reproducible generated directories

- `/home/levi/src/hive-worktrees/clearing-edge-integration/engine/kernel/target` — Cargo target, 2.928 GiB
- `/home/levi/src/hive-worktrees/construction-cascade-repair/engine/kernel/target` — Cargo target, 2.553 GiB
- `/home/levi/src/hive-worktrees/native-delivery-consumer-cutover/engine/kernel/target` — Cargo target, 2.239 GiB
- `/home/levi/src/hive-worktrees/native-resource-cutover/engine/kernel/target` — Cargo target, 2.691 GiB
- `/home/levi/src/hive/dist` — built frontend output, 0.008 GiB
- `/home/levi/src/hive-worktrees/clearing-edge-integration/dist` — built frontend output, 0.051 GiB
- `/home/levi/src/hive-worktrees/performance-page-recut-v2/dist` — built frontend output, 0.037 GiB
- `/home/levi/src/hive-worktrees/performance-page-shared-runtime/dist` — built frontend output, 0.037 GiB

All Cargo targets total 10.410 GiB; all dist directories total 0.133 GiB. Inactive-worktree totals already include their target/dist contents.

## Preserve

- Preserve all `.botanical` directories per Levi’s explicit prior instruction; the primary `.botanical` is about 1.8 GiB allocated and includes retained research/art/proof evidence.
- Preserve `/home/levi/src/hive/node_modules` while the primary session remains active; it is reproducible but removal would disrupt work.
- Preserve `/home/levi/src/hive-worktrees/clearing-edge-integration/.botanical` (current release/proof receipts).
- No Game-owned Cargo, Wrangler, Vite, Bun, browser, or listener process was found. The observed Workerd/Node commands belong to Botanical, not Game.

## Immediate reclaim boundary

- Removing all clean inactive worktrees above reclaims about 9.452 GiB.
- Removing the integration Cargo target after retaining the integration root reclaims another 2.928 GiB.
- Removing integration `dist` (rebuildable) reclaims another 0.051 GiB.
- Combined non-overlapping immediate reclaim: about 12.430 GiB.

## Refresh after coordinated worktree cleanup

The 31 clean inactive worktrees listed above have since been removed by the
coordinated cleanup owner. They are no longer candidates for a future removal
command. The remaining exact roots are:

- `/home/levi/src/hive` — authoritative dirty primary source; keep.
- `/home/levi/src/hive-worktrees/clearing-edge-integration` — clean pushed
  integration/release root at `16066ad9`; keep root.
- `/home/levi/src/hive-worktrees/lawful-floor-stockpile` — clean committed active
  writer result at `b1846b44`; keep until integrated/released.
- `/home/levi/src/hive-worktrees/native-job-task-core-current` — dirty unpublished
  source (`engine/kernel/src/job.rs`, `engine/kernel/src/world.rs`); keep or
  checkpoint before removal.

Current reproducible generated candidates:

- integration `engine/kernel/target`: 3,152,228,352 bytes (2.936 GiB), safe now.
- integration `dist`: 55,189,504 bytes (0.051 GiB), safe now.
- primary `dist`: 8,675,328 bytes (0.008 GiB), safe now.
- stockpile lane `engine/kernel/target`: 2,433,040,384 bytes (2.266 GiB),
  reproducible but defer until the active committed lane is integrated/released.

Immediate conservative reclaim is 3,216,093,184 bytes (2.995 GiB). After the
stockpile lane is integrated/released, its target raises total reproducible
reclaim to 5,649,133,568 bytes (5.261 GiB). Preserve every `.botanical`, primary
`node_modules`, and tool-local dependencies. No Game-owned live process was
found during this refresh.
