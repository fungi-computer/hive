# Clearing client preview

- source: `6a56ac37456bea4e136a608182957176a7af1253`
- mode: client-only preview against the existing public engine backend
- immutable client: <https://ba9af548-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony.html>
- public client: <https://clearing-80e39fd9-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony.html>
- backend: <https://hive-public-engine-demo.levi-fe0.workers.dev>
- artifact inventory: `dist-sha256.txt`
- immutable readback: `immutable-readback.json` (224/224 matching files)
- alias readback: `alias-readback.json` (224/224 matching files)
- live pair readback: `pair-readback.json` (joined and observed two party members)
- hosted browser: `hosted-browser-complete/REPORT.json` (passed; 18 accepted commands, 14 assertions, six screenshots, zero browser errors)

The hosted browser used the public controls to build floors, bed, brew station,
wall, door, and stair; hit visible furniture art to submit floor replacements;
changed voxel level; rendered at 390px; then reloaded and joined a second party
in a fresh browser context. The browser proof checks command admission and
persistent identities. Native completion remains covered by the focused
construction laws.

Only frontend assets were uploaded. No backend, production, or main-branch deployment was made.
