# A place for bitter herbs — accepted original art

Astra personally authored and accepts the v2 shelf and herb-carry art on 2026-09-07. I viewed the native shelf sheet, all four new pose contact sheets (all eight phases and four facings), native clearing and both shelf directions at game scale. I also inspected seven sampled frames decoded from the actual 10-second canvas recording. This is frame-by-frame motion review, not a claim of watching uncut real-time playback.

## Exact production handoff

Delivery owns tracked source/Git/build/deploy. Astra changed only this ignored study. Apply `art-integration.patch` serially; it passed `git apply --check` against the four base art files recorded in `source-inventory.json`. Candidate copies live under `candidate/src/`.

- `art.buildings.shelf.stakes[2]`, `.frame[2]`, `.finished[2]` (empty), `.filled[2]`.
- Shelf uses the existing 112x112 `camera(112,112,1.1)` and `propAnchor`. Its third argument is camera aim height. `home.js` registers the original shelf builder; `bakeArt()` only adds the filled stage for that type.
- `art.figures.rowan` and `art.figures["witch-runner"]` gain `carry-herb` and `pickup-herb`, each four directions by eight frames, with the current 80x80 camera/pawn anchor.
- Walking uses the herb-carry cycle. Stationary carrying/storage uses frame zero. Pickup uses the original pickup kinematics without an axe. Code owns which body mode/activity selects these textures.
- `mugwortBundle(parent)` exports the unchanged original bundle geometry for ground, filled shelf, and hands. Carry placement uses the actual palm midpoint in body-local coordinates, with bent elbows. No generic attachment system is introduced.

Runtime derives filled/carried appearance from the one bundle's physical location. The production recipe is 1 wood / 24 build ticks / 24 deconstruction ticks / 1 salvage, capacity one; those are code-owned facts, not art or a second inventory flag. BUILDINGS must include shelf before the new home builder is called through the main bake.

## Source and proof

Terra accepted the final source/caller after the cabinet silhouette and herb-only elbow correction. All 15 proof-source hashes were unchanged during the successful run and match current source. Astra separately verified the actual imported `src/art.js` equals the retained baseline; the study uses its real `bake()` helper. Production candidate modules differ from the corresponding served study modules only by import relocation.

`run-u942.scope`, invocation `b9b41fe569804cf182cb620ed6082222`, native session `54734`, exited 0. Actual shelf/figure identities and anchors, alpha/nonempty bounds, pause/pixel freeze, phase advance, all four turns, stationary carry frame zero and browser errors passed. The 132 unchanged-pixel comparisons cover Rowan/Sedge's eight old poses at phases 0 and 3/8 in all four facings, plus all four existing mugwort props. They do not claim every old frame was replayed. New motion counts are Rowan 5 and Sedge 8 unique phases per facing, consistent with their existing motion. Prop alpha padding is at least 28 pixels; figure padding at least 13.

V1 remains preserved: its proof exited 1 due to a frame-zero identity assumption, while Astra separately rejected the chairlike shelf and straight carrying arms. V2 uses a current-state identity snapshot. V2's original scene filenames mislabeled the later facing-3/facing-0 captures as direction0/direction1. `proof-v2/screenshot-label-erratum.json` provides observed-direction aliases with exactly the same image bytes; original JSON/files remain intact. Read those actual states rather than inferring facing from old names.

A separate recorded-motion extraction first failed because this host's minimal FFmpeg lacks fps/tile filters (`run-u946`, exit234). A direct supported crop/scale extraction then exited0 (`run-u947`) and produced the seven inspected samples. This did not launch another browser or change any game/study source.

This acceptance covers original art and the isolated actual-bake/Pixi consumer. Delivery still owns the joined storage source, physical pickup/carry/store/deconstruction, persistence, dist, and hosted interaction proof. No new simulation, map, recipe, or item framework is included here. Preserve the earlier evidence and current accepted game/studies.

The existing dev server serves `/.botanical/shelf-study/index.html`. The ordinary future proof command remains:

```sh
/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh node .botanical/shelf-study/prove.mjs .botanical/shelf-study/proof-next .
```

Use a new output directory. Before any future run, apply the small unrun filename correction patch once supplied; it avoids presumed direction labels and overwriting the first screenshot. No rerun is required for the accepted v2 art.
