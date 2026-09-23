# Check disposition — retained 2026-09-08 audit

Read-only interpretation of existing `fallow.json` check section: **52 findings = 15 files + 34 exports + 1 type + 1 dependency + 1 cycle**. No audit, test, build, or proof rerun. References below use committed `071a59e` unless explicitly marked working-tree or ignored evidence.

The report is **not wholly a clean-commit audit**: `resources.ts:4 woodTotal` exists in the dirty materials migration, but not in `071a59e:src/resources.ts`; seven reported scripts are also absent from that commit. Preserve this distinction when publishing counts.

## Fifteen files: fourteen CLI entrypoints, one external build input

Seven committed CLI files read `process.argv` directly: `export-study-art.mjs:7`, `prove-deconstruction.mjs:6`, `prove-draft-go.mjs:8`, `prove-herb-storage.mjs:6`, `prove-local-save.mjs:6`, `prove-mugwort.mjs:6`, `prove-world-lab.mjs:23`, all under `scripts/`. These are executable pathname consumers, not importable production modules. Their absence from ordinary `package.json` scripts is a discoverability/repeatability issue; retain historical scripts and wire only the currently supported checks into ordinary commands.

Seven further reported CLI scripts are retained on disk but absent at the pin: `prove-caps-style`, `prove-deconstruct-presentation`, `prove-hosted-save-studies-smoke`, `prove-paused-work`, `prove-structure-hit-go`, `prove-upstairs-bedroom`, `prove-work-panel` (all `scripts/*.mjs`). Existing `.botanical/structure-hit-go-final-20260908/proof.json`, `work-panel-proof-20260907/proof.json`, and `upstairs-bedroom-final14-20260907/proof.json` retain script hashes. This audit does not establish that every historical script still passes or was invoked successfully. Do not delete preserved evidence/tools merely to clear an unused-file count.

`vendor/libcolony/colony_js_post.js` is a definite required external input: `scripts/build-colony.sh:14` passes its pathname to `em++ --post-js`; `public/vendor/libcolony/PROVENANCE.md:27` records its source hash. Preserve the upstream wrapper and build edge.

## Thirty-four exports: five distinct dispositions

**25 unnecessary public exports, with live local implementations.** Eight ordinary helpers: `construction.js:128 workPositions`, `:185 coverAt`; `movement.js:3 WALK_TICKS`; `visual-hit-geometry.js:58 visibleHitAreaFor`; `world-lab/terrain.js:4 WORLD_LAB_SPEC`, `:44 mod`, `:142 chunkOf`, `:325 checksumBytes`. Each has same-file callers. Seventeen brewhouse helpers: the thirteen flagged factories in `studies/brewhouse/props.js:48–305` and four in `shell.js:10–117`. Factories are consumed by the local `PROP_BUILDERS` registry or other factories; shell helpers by `shell`. Remove unnecessary **exports**, not behavior/geometry, within existing custody. Brewhouse and World Lab have real Vite HTML entries.

**One genuinely dead helper:** `studies/brewhouse/bake.js:35 anchor` has no committed caller. Remove it and its now-unused Three import when that isolated source owner settles; do not change the accepted bake behavior.

**One analyzer misclassification:** `studies/brewhouse/main.js:75 house` is a property on local `const exports = {}`, not an ES module export. `window.__BREWHOUSE` exposes that object at line151; ignored `.botanical/brewhouse-study/capture.mjs:49` actually consumes `exports.house`. Keep the capture contract; an ordinary descriptive variable rename can remove the CommonJS-shaped ambiguity without suppression.

**Six staged materials-owner exports:** `materials.ts:110 containerContents`, `:120 containerQuantity`, `:148 reservedQuantity`, `:183 transferForActor`, `:190 carriedLot`, `:202 embeddedQuantity`. Five have internal callers; `carriedLot` has none at the pin. The owner is exercised through other exports by `materials.test.js`, not yet production-joined at this commit. These six are not all directly imported by tests. After complete v7, keep only APIs with real production/validation consumers. Pinned `npm test` selects only clearing/persistence tests: include the accepted materials laws in the normal required command when joining, rather than claiming they already run there.

**One dirty migration-only export:** `resources.ts:4 woodTotal` currently has no source caller. Let the active writer finish; then delete the unconsumed wrapper or give it one actual accounting caller. Its audit finding cannot be attributed to committed legacy resources.

## Type, dependency, cycle; v7 deletion boundary

`ui-actions.ts:100 LevelNavigationControl` is locally used by `satisfies` at129: remove only `export`.

Packed Stipe is a transitive Caps dependency, **not a Caps peer**: the committed Caps tarball manifest declares `@fungi.computer/stipe: 0.0.0`; packed `dist/components/gooey.js:2` imports it. Hive pins the local tarball for resolution. No direct Hive use was found; retain the packaging edge, without claiming current Button/Card/Checkbox use Gooey.

The real `activity.ts:26 → routine.ts:3 → activity.ts` cycle exists because rest reads `isNight` while routine finishes activities. Move pure clock queries/constants beneath both owners; no initialization failure was demonstrated here.

Complete v7 must delete duplicate live `piles/claims/actor.cargo/herbBundles/herbStorageClaims` ownership and commodity-specific transfer/reservation branches (`activity.ts:72/111`, `jobs.ts:191/346`). Preserve strict v1–v6 decoding/migration, not parallel live ledgers. Reassess staged exports after that atomic caller join; this note does not approve unfinished migration bytes or repeat the separate complexity/clone review.
