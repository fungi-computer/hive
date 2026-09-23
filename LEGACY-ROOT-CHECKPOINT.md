# Legacy root working-file checkpoint — September 23, 2026

This archival branch overlays the exact non-ignored working source bytes from `/home/levi/src/hive` on its old `feat/goblin-bed-and-breakfast-mvp` HEAD. It is a WIP recovery tree, not an accepted build or game release. The old checkout was paused while cherry-picking `581553f2`; `engine/kernel/src/lib.rs` was deleted by the old side and remained unresolved. The two unmerged index stages are retained separately in `archive/hive-preservation-20260923` under `recovery/2026-09-23/index-stages/`. Operational `.fungi`, dependencies, generated output and `.botanical` proof directories were not added to this branch.

The source manifest and SHA-256 hashes are in `archive/hive-preservation-20260923:recovery/2026-09-23/MANIFEST.json`. This branch exists to restore exact source paths after releasing the legacy checkout; do not merge it into the active integration branch without review.
