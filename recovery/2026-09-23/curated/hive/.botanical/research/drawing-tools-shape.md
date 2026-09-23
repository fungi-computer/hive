# Drawing and selection shape — source-observed 2026-09-07

This is a source review only (no browser or runtime proof). Capture hashes: `main.js` `ec19dc58`, `hud.jsx` `5f160127`, `construction-view.js` `9e3180b9`, `view.js` `8b989e8d`, `camera.js` `67e9aed7`, `art/scale.js` `2de8ee96`.

## Current correction already in delivery

The prior one-stroke wall exit came from `main.js:355-363` finishing a placement and the HUD's former finish action cancelling the machine. The captured source has the intended narrow repair in progress: `toolMachine` sends `PLACED` from `fixed` to `ready` while retaining `tool` (`hud.jsx:38-44,114-128`), and `main.js:363` sends `placement-result`; the HUD's **Done placing** still maps to `CANCEL` (`hud.jsx:670-676,1174-1176`). Keep that ownership with delivery. A successful build line should return to ready with its tool and orientation; explicit Done/Escape should leave it. Each tool can declare whether a successful command remains ready or exits, rather than treating a gesture transition as a world result.

One present input mismatch is worth inspecting alongside that correction: tree and actor `pointerdown` both stop propagation (`view.js:54-68,79-97`), so the stage never calls `input.down` when an armed tool starts over an occupied target (`view.js:150-156`). Selection may continue to consume that pointer when no tool is armed. When a tool is armed, route that one pointer down through the same drawing begin adapter without selecting the actor/tree. This is a current UX correction, not a prerequisite for repeat placement.

## One small seam

Add one pure, UI-owned `drawing-tools.js` module when the next tool needs it. It owns no Pixi objects, Jotai atoms, camera, jobs, or world state. Its input is copied cell/screen points; its output is immutable geometry:

```text
cellRect(start, end) -> { level, minX, maxX, minZ, maxZ } | null
wallRow(start, end, { maxCells }) -> Cell[]       // current dominant-axis row policy
filledCells(rect, { maxCells }) -> Cell[]
outlineCells(rect, { maxCells }) -> Cell[]        // perimeter, deduplicated corners
screenRect(startScreen, endScreen) -> Rect
containsScreenPoint(rect, point) -> boolean
idsInCellRect(items, rect, eligible) -> Id[]
```

`cellRect` rejects mixed levels. Limits are supplied by the caller's product/world policy; the geometry helper does not inherit the current `SIZE` as a hidden permanent rule. `idsInCellRect` receives the candidate facts and eligibility predicate, so it can serve Chop without becoming an owner of `jobs`, tree state, or a spatial-index project. Derive it only for an active target-area gesture and when its points or relevant tree/job revision change; do not add a second cached world model.

Use these outputs as a transient plan: Wall uses `wallRow`; Chop uses `cellRect` plus eligible tree IDs; a future floor brush uses `filledCells`; a future room outline uses `outlineCells`. A bed remains its one anchor cell and `construction.footprint()` remains responsible for its second occupied cell. Room support, doors, overlaps, stairs, and material rules stay in `construction.js`/the command owner, which already validates a real footprint (`construction.js:18-45`). Geometry previews intent; `request()` preflights before queuing (`main.js:114-146`), while the existing fixed-step command owner validates against the actual applying state. A stale preview therefore receives accepted/rejected command results rather than silently becoming world truth.

XState should continue to own only tool choice and gesture lifecycle: `idle → ready → dragging → fixed`, raw start/end points, and whether a fixed gesture has submitted. Jotai continues to own selection and preferences. A frozen preview target-ID list, if needed for a fixed Chop confirmation, is UI input only and must feed the same submit path; it must not be another assignment/order record. In particular, `CAMERA_MOVE` currently clears the selected tool (`hud.jsx:70-73`). The deeper interaction contract should add a distinct “abort this stroke, keep ready tool” event for a coordinate-invalid gesture or pan, while Done/Escape clear the tool. It does not imply new vertical camera behavior.

Camera conversion remains outside the module. Today `camera.cell()` calls `groundCell()` and both it and `dragCells()` return level 0 (`camera.js:28-35`, `art/scale.js:32-40`, `construction-view.js:10-21`). Upstairs work must make the pointer adapter and actor projection use the same active storey: `screen → cell(activeLevel)` and `cell(activeLevel) → screen`. The drawing helper merely preserves the supplied level and rejects cross-level strokes; it should not fake Z support before camera/world picking support exists.

## Derivations to consolidate

- Move `dragCells` out of `construction-view.js` when introducing the next shape. It is already ONE shared implementation used by command cells in `main.js:355-362` and ghost cells in `construction-view.js:142-169`; the issue is geometry ownership in a renderer, not duplicated wall-row code. Preserve that shared ownership rather than making new separate preview/commit implementations. It remains a wall-row primitive, not a general area brush.
- Replace `main.js`'s local `rectangleTargetIds` with the same `cellRect`/candidate helper. The current Chop target calculation is repeated on move and release (`main.js:305-313,322-327`), and its bounds logic is separate from every other draw plan.
- Compute `screenRect` once from the XState points. Rendering independently normalizes it in `view.js:281-291`; actor selection independently normalizes it and tests projected actors in `main.js:335-350`. Pass the normalized rectangle to both.
- Remove the identical armed/unarmed branches in `main.js:292-297`; the machine already selects box versus tool gesture on `BEGIN`.

No generic event bus, second state store, ECS, or renderer rewrite is needed for this seam.

## Practical room interaction proof

At level 0 in a clear valid region, choose Wall once and draw four successive
perimeter strokes without reopening the menu; each live preview and submitted
stroke use the same `wallRow` cells, and the tool remains ready. The later **Room
outline** tool can derive a 4-by-3 rectangle with ten distinct perimeter cells
and submit ordinary wall placements. To add a doorway with the current rules,
cancel the chosen unfinished wall blueprint first, then place the door in its
vacated cell. Current `placementProblem` rejects a door on an existing wall;
automatic wall-to-door conversion is not a shipped feature or an assumed rule.
A future room tool may explicitly reserve a door gap, but needs that product
behavior implemented and proved. A filled-floor tool for the same rectangle
would have twelve cells. This distinguishes a wall line, room perimeter and
filled area without moving construction authority into the HUD.

## Astra disposition

The pure geometry seam is useful but is only one part of the deeper UI module.
The occupied-target mismatch and dual native/Pixi right-click path demonstrate
that one physical gesture also needs one interpretation: active drawing tool
first, then ordinary inspection/selection/contextual orders. Keep the existing
XState owner for lifecycle and share geometric outputs between previews and
submission; a helper library alone does not establish consistent input behavior.
Do not require all proposed helpers before the next actual tool needs them.
The current repeat-placement correction remains independently shippable.
