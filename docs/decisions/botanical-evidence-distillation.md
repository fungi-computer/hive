# Botanical evidence distillation

Game CTO audit, 2026-09-12. This document is the durable entry point for Hive's
ignored `.botanical` evidence. It does not make raw evidence disposable. Levi has
explicitly directed us to keep `.botanical`; deletion requires a later inventory
that proves every unique source, receipt, visual and recovery byte is preserved.

## What the audit found

Across the main checkout, registered Hive worktrees and embedded Hive evidence
checkouts, 240 `.botanical` roots contained about **4.61 GB in 57,645 regular
files** at the full hash checkpoint. Thirteen non-Hive roots discovered under
the shared mounted parent were explicitly excluded. The two largest
owners are the main checkout at about 3.07 GB and `fresh-engine` at about 1.05 GB.
The integration worktree contains about 213 MB.

The bulk is not original project knowledge. A path- and extension-based inventory
classified approximately:

| Class | Size | Files | Retention disposition |
| --- | ---: | ---: | --- |
| Installed toolchains and vendored compiler trees | 3.13 GB | 21,056 | Reproducible after pins, install commands and licenses are recorded |
| Video captures | 611 MB | 111 | Keep selected human-visible milestones and failures; deduplicate repeated runs |
| Raw traces, result JSON and logs | 594 MB | 7,121 | Keep canonical receipts and counterexamples; summarize repetitive sweeps |
| Image captures and art | 226 MB | 2,377 | Keep original art, approved comparisons and representative failures |
| Test SQLite databases and WAL files | 226 MB | 669 | Keep only databases that are the sole replay/recovery fixture |
| Source and harness copies | 213 MB | 8,202 | Keep unique recovery source and accepted drivers; remove copies only after hash comparison with Git |
| Compiled/build output | 206 MB | 1,204 | Rebuildable after source/toolchain pins are recorded |
| Archives and vendor fixtures | 202 MB | 67 | Keep licensed source pins and irreplaceable package artifacts; deduplicate exact copies |
| Installed/cached dependencies | 158 MB | 9,238 | Reproducible from locks and recorded install exceptions |
| Human reports and manifests | 50 MB | 4,645 | Distill first-party conclusions; third-party package documentation follows its source archive |

These categories are conservative heuristics. They are useful for prioritizing
review, not sufficient evidence for deletion. In particular, `.png`, `.json`,
`.sqlite`, `.wasm` and source extensions contain mixtures of original and
reproducible material.

The machine-readable worktree and content inventories live in
`.botanical/disk-audit-20260912/worktrees.json` and
`.botanical/disk-audit-20260912/content-summary.json`; the full SHA-256 inventory,
duplicate groups and corrected Hive-only summary are `inventory.jsonl`,
`duplicate-groups.json` and `summary.json` in the same integration-worktree
directory. They record the roots, heads, branches, dirty previews, hashes and
byte counts used for this audit.

## Distilled record 1: engineering findings

Tracked decisions already contain the conclusions that should guide production:

- `architecture-proof-sprint.md` records accepted source and proof checkpoints,
  their limits, and the active implementation order.
- `hive-engine-asset-pipeline-and-goblin-boundaries.md` separates headless engine,
  asset authoring and Goblin content ownership.
- `local-snapshots-and-durable-ai-jobs.md` defines Durable Object transactions,
  command identity, receipts and restart recovery.
- `world-generation-and-streaming-contracts.md`,
  `minecraft-inspired-terrain-and-isometric-world-study.md` and
  `environmental-fields-and-openings.md` carry the production world, water and
  atmosphere contracts.
- `unified-work-algebra-recut.md`, `controls-floor-priority-recut.md` and
  `current-systems-review-and-module-plan.md` carry work, input and consolidation
  rules.

The ignored studies remain supporting evidence when they contain measurements,
failed methods or source-specific analysis that the tracked decisions summarize.
The most important study families are:

1. `research/environment-round2-20260908/` and
   `research/environment-round3-20260908/`: why research-grade water and gas
   solvers were rejected for the playable engine, including conservation,
   restart and performance measurements.
2. `performance-audit/`, `performance-do/` and `performance-client/`: the split
   between simulation, host, serialization and browser costs.
3. `research/*world*`, `research/*terrain*`, `terrain-render/` and
   `groundwater-followup/`: deterministic generation, vertical terrain,
   groundwater and rendering evidence.
4. `research/*work*`, `research/*storage*`, `consolidation-audit/` and
   `stockpile-ui-audit/`: retained Clearing behavior and the move toward shared
   jobs, material custody and policy-driven floor stockpiles.
5. `engine-do/`, `research/*durable*` and `research/*capability*`: DO ownership,
   controller admission, Mycelium/Shiitake integration and replay boundaries.

The production lesson from the environmental studies is settled: use bounded,
game-scale discrete water and regional/room-scale gas. Preserve finite material,
direction, contamination, temperature and restart laws. Do not ship the old CFD
laboratories or their fine grids as the live simulation.

## Distilled record 2: releases and playtests

For each published checkpoint, preserve one compact receipt containing:

- source commit and exact built artifact hash;
- deployment/version identifier, URL and rollback identifier;
- the smallest meaningful interaction that passed;
- the observed human playtest result;
- known failures and claims the evidence does not support.

The current historical release narrative begins in
`.botanical/marketing/shiit-app-game-handoff-20260909.md`. It records the wet
clearing, compact editor, Copper Familiar, asset MCP and subsequent main-game
releases. Its older sections are explicitly superseded in place. The raw hosted
directories and browser recordings are evidence behind that narrative, not the
primary status surface.

Repeated captures of unchanged builds should collapse to one accepted capture
and any visually distinct failure that informed a correction. A failed run is
worth retaining when it reveals a real product defect, such as startup cost,
input interception, task locking, excessive water creation or narrow-layout
failure. Infrastructure-only retries with identical bytes and no new observation
need only one terminal receipt.

## Distilled record 3: recovery, art and exact artifacts

Before any raw cleanup, build a hash manifest with these retention classes:

1. **Permanent:** original art/source, license and provenance files, accepted
   decision evidence, public release receipts, recovery manifests, and fixtures
   that uniquely prove conservation or lost-acknowledgment behavior.
2. **Checkpoint:** selected screenshots/video, exact package tarballs used by an
   accepted consumer, failed counterexamples and native databases needed to
   reproduce a known bug.
3. **Rebuildable:** Rust/Emscripten toolchains, dependency installs, browser
   profiles, Vite caches, compiled objects, generated bundles and duplicate
   source archives whose upstream pin and license are preserved.

Recovery source is never inferred from a filename. Compare it to the recorded
Git commit and dirty inventory. If bytes do not exist in Git or another verified
private recovery ref, retain them and name their owner. Similarly, art is not a
generic screenshot category: authored sprites, generated source scenes and
approved visual references remain permanent even when their rendered previews
are reproducible.

## Safe consolidation sequence

1. Finish a SHA-256 manifest of first-party reports, recovery source, media,
   databases and archives across all 237 roots.
2. Link each accepted production conclusion to its tracked decision and each
   deployed build to one release receipt.
3. Select representative art/playtest media and record provenance, purpose and
   hash.
4. Verify unique dirty source against private recovery refs.
5. Only then produce a concrete deletion manifest for rebuildable exact paths.
   Keep `.botanical` itself and its compact ledgers.

This converts `.botanical` from an accidental archive into evidence with a
searchable index. It deliberately avoids preserving every experiment as active
architecture or discarding failures that explain current laws.

## First cleanup checkpoint

The first cleanup on 2026-09-12 removed **1,282,061,948 bytes** from five exact
Hive-owned paths under `/home/levi/src/hive/.botanical`:

- the old Emscripten 3.1.46 installation used by the libcolony rebuild study;
- the `caps-probe` and `xstate-probe` dependency installations;
- the kettle-water and brewer-contact Vite caches.

The Emscripten setup script, version, README, build log and produced study
evidence remain. Both dependency lockfiles and all study source remain. The
full pre-deletion SHA inventory and exact path/byte/reason record are retained
in `inventory.jsonl` and `deletion-v1.json`. The deletion guard resolved the
owning Git common directory to `/home/levi/src/hive/.git`; no Botanical-next or
other non-Hive path was changed.

The active Rust 1.98.1/wasm-bindgen toolchain remains because current engine
build scripts consume it. Test databases, media, art, recovery source and
ambiguous duplicate artifacts also remain pending the later evidence-selection
pass.
