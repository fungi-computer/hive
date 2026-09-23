# Bind the retained minimap to the actual clearing

CTO source/caller recut,2026-09-08. Root personally read the retained component, study, camera, controls and immediate main/HUD consumers, with one bounded independent reader. HEAD857f504 plus the active mixed8 candidate is the observed source, not a minimap release. No implementation, proof or runtime edits accompany this note. Delivery retains the current frozen mixed candidate, source custody and serial publication.

## Reuse what exists

The original `src/clearing-minimap.jsx` already exports `ClearingMinimap({facts,level,viewport,onRequestCenter})`; its only local state is the keyboard/pointer cursor. `src/studies/clearing-minimap/main.jsx` supplies a diagnostic use, and /study/Vite already discover it. Do not start another map renderer or generator. The study records requested centers; that is not evidence of live camera recentering.

The production consumer should derive facts from the actual HUD display projection: current actor positions/selection, current tree state and structure cells. Use `footprint` for structures and the explicit `stairLanding` for the upper landing; a stair's lower footprint is not an upper surface. Selected Ground/Upper remains the existing preference and LEVEL_NAVIGATION control. The15×15 component is a local clearing view, not fog-of-war knowledge, a global map or evidence that larger DOM grids will scale.

## Camera is the only camera owner

`src/camera.js:focus` already centers a real cell and `cell(point,level)` supplies the shared inverse. Add one typed cell-bearing UI action/effect through the existing control catalog/main effect boundary. It clears the current camera/gesture intent, calls camera.focus and updates presentation. It never enters command request, flushPending, step, save or the actor Go path. Clicking a marker here moves the view, not the person.

The current display update publishes camera zoom only. Drag panning and some focus changes do not publish a new world snapshot while paused. Deriving a viewport polygon only on world ticks therefore leaves the map stale. A narrow camera-owned presentation snapshot/change subscription should cover pan, zoom, focus, reset and resize, with one disposer and no new clock. Subscribe only after the HUD exists; obtain the initial snapshot explicitly and remove it on teardown. Camera changes should publish camera facts without rebuilding unchanged world/material facts.

The existing study computes a clipped four-corner polygon using camera.cell. Its inverse rounds to cell indices, so that outline is approximate. Do not call it an exact continuous frustum. Be explicit about grid space: actor/source coordinates identify cell centers, while the SVG grid spans cell edges0..SIZE. Apply the center-to-edge offset consistently before clipping; do not introduce an unrelated projection formula in the component. If continuous precision is needed, expose that inverse at the existing geometry/camera owner and let quantized picking round it there. A diagonal isometric view normally projects to a polygon on this top-down map, not an axis-aligned rectangle guessed from center/zoom.

## Input and house UI join

The retained focusable map div owns arrows and Enter/Space, but global keys currently enable pause on this div and claim camera arrows. Root click focus restoration also steals its focus because it recognizes buttons/links/inputs but not this composite map. Establish explicit keyboard ownership in the existing keymap/focus boundary so one key has one meaning. `preventDefault()` in the study alone does not prove the global handler is excluded. Reuse the existing control catalog; do not add an independent level shortcut list or new input library.

`#hud` defaults to pointer-events:none. Give the mounted map an explicitly interactive surface so clicks cannot leak into armed Build/Chop/Plant tools. Use the existing CAMERA_MOVE cancellation policy before recentering, preserving allowed persistent tools while clearing a pending stroke. Context-menu and escape remain governed by that owner.

Compose the map in the existing Caps house window/menu, with the measured command-rail bounds. Normal layout may expose a compact map; narrow/short layouts can open it deliberately without hiding Ground/Upper or trapping the close control. Keep essential action buttons reachable. Replace study-only wording such as “inverse-camera footprint” with ordinary player-facing wording such as “Visible area”; the mechanism belongs in diagnostics, not the game UI.

## Useful exit and next handoff

After the current HUD/main writer releases its seam, one named visible outcome owner can bind the retained component. It may be independent of core storage/brewing only under explicit camera/HUD/main/keys ownership; two writers cannot both edit those files. Core/saves/generator remain outside this presentation slice.

One focused interaction at normal and390px is enough: show real current actor/structure markers; pan/zoom/resize while paused and observe the camera outline update; click and keyboard-activate a cell and see the real camera center; verify tick/jobs/actor positions/materials stay unchanged; ensure focused arrows/Space do not pan/pause the game twice; and ensure an armed tool never submits through a map click. Reuse the existing level control and confirm upper landing display. Current study evidence and these future joined interactions are different scopes; do not rerun a full home-construction scenario.

## First joined source review and correction

Visible world-lab completed the eight-file presentation join in1bb79df; Delivery retained sole integration and isolated it from the active schema9 core. Root and a bounded independent reader found one real transition defect: `CAMERA_MOVE` retained `context.tool` while entering idle, whose next `BEGIN` starts box selection and clears that tool. A retained label is not a retained interaction. The correction inb1ef4b3 uses the guarded ready/idle transition, so the next actual canvas stroke—not just the immediate label—must exercise the tool. The focused physical proof should own that evidence. The small `cameraMoveKeepsTool` predicate test only checks the guard; its current test name claiming a ready/idle transition is broader than the assertion and must not be cited as machine-transition coverage. A future touched-seam cleanup should remove the trivial exported predicate/test if its only purpose remains testability, retaining actual interaction coverage.

Root also identified the permanent pagehide unsubscribe: a BFCache restoration resumes the same app and needs its camera subscription. Delivery's corrected source keeps lifecycle handling compatible with persisted pagehide/pageshow. Its predicate/source-law checks are not evidence of an actual browser BFCache restore. Camera outline approximation, actual footprint/upper landing, key ownership and pointer consumption otherwise matched the agreed source contract.

Delivery is proving/publishing the corrected revision from a clean detached checkout while the sole vessel/save writer retains its dirty source. No source review, commit or clean build alone is a hosted minimap claim. The same short interaction may close stump → local Wood row → real material/Store inspection; it must not restart the stopped full-home storage trace.

### Browser failure classification correction

The first live proof retained a full-grid clipped polygon and timed out during recenter checking. A full-grid outline need not change on every camera move; use actual zoom controls to establish a partial visible polygon before requiring its change. This alone did not establish that the source was correct. Delivery separately found and fixed a real key-dispatch bug in5ca82e1: the OpenTUI capture-phase handler must return `false` when yielding to the focused minimap. Returning undefined marks the binding handled and applies event effects before React receives its Arrow/Enter/Space event. Root's bounded reader re-read the installed dispatcher (`@opentui/keymap/src/index.js` executor and `src/html.js` capture attachment) and corrected its earlier stronger "proof-only" classification. Both the geometric precondition and the key-dispatch correction matter; the retained timeout JSON does not identify which caused that specific stop. Do not cite a boolean ownership predicate test as proof of actual dispatcher yielding.

### Published e15f080: exact evidence and phone correction

Delivery published `e15f080acedbb97b190a068ed50365c53ee09d8f`, deployment `cf9b61ad-8950-4000-889b-cecf182f91ab`. Hosted parity JSON at `.botanical/clearing-minimap-live-final-20260908/hosted-parity-e15f080/proof.json` confirms the same-preview and deployment URL match the frozen index and all19 referenced assets. This is HTTP parity; the local normal57c and focused narrow-e15f080 traces own interaction evidence separately.

Root and an independent reader personally viewed `narrow-e15f080/narrow-menu-map.png`: the page fits390 but Ground/Upper still visibly overlap because the later <=760 level-keycap display overrides the earlier <=480 hide. Reachable bounding boxes are insufficient evidence of readable, nonoverlapping controls. Root initially treated that cascade as a source-only advisory; actual visual evidence now requires the small presentation correction through Delivery's existing owner, without repeating oak/storage/normal gameplay.

The narrow trace proves cursor movement(7,7)→(8,8), Space preserving pause and frozen simulation. Its raw polygon-string inequality does **not** independently prove meaningful recentering: the before/after216-cell shapes differ only by floating-point epsilon. Preserve the normal57c movement evidence and qualify the narrow claim. Any next focused narrow follow-up should use a deliberately separated target and numerical geometry/actual camera displacement, not string inequality. No claim here expands to BFCache, full storage or new runtime brewing.

### Phone correction published

Root personally viewed `narrow-54cbe9d/narrow-menu-map.png`: Ground and Upper are now clearly separated. The focused local proof physically selected Upper then Ground, checked the current level/readout, moved the focused map cursor, and preserved pause/simulation; it explicitly removes the unsupported narrow polygon-displacement claim. Normal57c remains the separate broader interaction evidence.

Exact feature `54cbe9d1cf1e7daec6f1d48d28289f2afeba7d85` is published to the same preview, deployment `2d439486-cd91-4e1a-b251-109f072c08c5`. Root read `.botanical/clearing-minimap-live-final-20260908/hosted-parity-54cbe9d/proof.json`: all64 clean-dist files match both canonical and immutable hosted URLs, index SHA256 `6b9e54b9f78c37922960e2d3f826e89bc560781eaa471295cfe0df4f0486ea93`, zero mismatches. That hosted scope is HTTP byte parity, not a new hosted browser run. The ordinary visible presentation owner and Delivery closed the correction independently of the uncommitted v9 material/source work.
