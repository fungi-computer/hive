# Clearing interaction restoration audit — September 13

Owner: King Bolete. Source review against current 0cbf8d2 and retained src/.
This is an implementation guide linked from CLEARING-CONSOLIDATION-PLAN.md,
not a declaration of gameplay or hosted acceptance. Levi reports carrying
reconnects and broken construction in the published Colony.

## Findings from actual callers

| Player flow | Retained implementation | Current gap and correction |
| --- | --- | --- |
| Choose a building and place repeatedly | src/ui-actions.ts:167 toolMachine has ready/dragging/fixed, PLACED returns ready, CANCEL_STROKE preserves tool. src/hud.jsx:1170 catalog shows cost/footprint, rotation and Done. | engine/src/client/client.js:350 renders every action as a sidebar button; four stair directions become four buttons. Restore a compact build catalog, one selected definition/orientation, persistent tool and explicit Done using current Caps. |
| Click a stair/floor/wall | src/main.js:831 submits picked placement to the construction request owner. | engine/src/presentation.ts:106 adds material/source to target; colony-building.ts strict target permits cell only. Real browser point commands fail validation. Hand-authored command tests bypass this boundary. Fix semantic target binding and test actual presentation output through GamePack. |
| Drag a wall or floor | src/construction-view.js:55 derives the dominant-axis line; main.js:831 submits the placement stroke. | terrainAreaPresentationCommand sends top-level area; colonyBuildCommand requires target.area. Restore shared point/line/rectangle acquisition with explicit argument binding. Dig/stockpile currently consume top-level area: change real callers coherently rather than globally renaming one field. |
| See what will be built | src/construction-view.js owns ghostLayer, footprint, placementProblem, progress bars and wallMask. | Current client mostly draws generic target diamonds. Restore original ghost art, footprint, orientation, joined wall appearance and readable placement reasons from the same placement facts. Cosmetic preview cannot grant admission. |
| Inspect an object | src/hud.jsx:1306 Target, :1501 BrewStationPanel; main.js site/source handlers retain clicked screen location. | Current world/selection groups are a flat command list. Restore contextual object cards and relevant actions; keep global tools in a compact tool strip/catalog. Stations, people, stockpiles and sites need their own composed views over shared observations. |
| Build around corners and upstairs | src/construction.js:403 workPositions includes diagonal corner reach and lower-floor access; comment explains stranded final wall corner. | Current colony-building picks the first cardinal contact at designation. Review native contact and delivery callers before migrating this rule. Designation, reachable work contact and resource availability are distinct decisions. Do not claim this caused every reported rejection. |
| Carry supplies while remaining connected | Current work-activity.ts produces delivery phases and remote-client.ts previously accepted only dig/build/chop. | Confirmed schema mismatch; 0cbf8d2 unifies activity decoding. Focused JSON transport law and strict types pass. Not yet verified hosted. |
| Understand rejection | Retained placementProblem and contextual notices explain the current action. | remote-client.ts:496 reduces rejected receipts to “remote command rejected”; generic non-OK responses enter retry handling. Preserve domain rejection details and distinguish final refusal, accepted queued work, and transport uncertainty. Only uncertain delivery retries the same ID. |

## Why the earlier checks missed real failures

The 200-cell diagnostic used session.command with hand-authored target.cell and
never used the browser binder; it also did not step each queued action to verify
native completion. It proves neither clicking nor complete stair construction.
Earlier claims that stairs were caused by reconnects were unsupported and are
withdrawn. The separate carrying schema defect is concrete. Blocked carrying
route resubmission is a source-review concern, not the proved reconnect cause.

## Coherent repair sequence

1. Repair actual point and drag command binding and complete activity parsing.
   Exercise published controls -> acquired targets -> command validation ->
   queued site -> real material/work result. Include an invalid placement that
   returns a useful reason and does not poison subsequent valid commands.
2. Restore the retained placement experience as one chunk: compact catalog,
   original footprint ghosts, rotate, normal drag line/rectangle, joined walls,
   repeat placement, Escape/right-click/Done, layer changes and input cancellation.
   One XState gesture owner; Jotai holds display choices. Whistle local custom
   presentation binds arguments on the same GamePack command; no second registry.
3. Restore contextual site/station/person/stockpile cards using public Caps and
   authoritative observations. Remove superseded sidebar action duplication.
4. Reconcile work contact, blocked-route and claim release behavior against
   retained construction/work callers, preserving native physical custody and
   durable receipts. A blueprint waits for workers/materials; it does not own a
   worker indefinitely. Retry blocked work on relevant change with bounded recovery.

Acceptance is a short real player flow: select tool, preview/rotate/place stairs,
drag joined walls, cancel a stroke, inspect a site, see concurrent deliveries,
receive an understandable refusal, and then successfully issue another order.
Observe that flow from two clients with current-format recovery. Reuse existing
physics evidence; do not substitute another large unit matrix for this flow.
Retained source supplies interaction/art behavior, not engineering authority:
Botanical Field Guide ownership-and-seams remains the standard. Keep the Rust
world/material/work and DO transaction owners.

## First caller correction

World-surface point binding now submits target.cell without local picking
material/source metadata; world-surface drags submit target.area. Terrain-only
and stockpile consumers retain their existing semantic inputs. The published
build controls are exercised through both binders into the real strict command.
The actual staircase supply/completion law now begins from its published UI
control rather than a hand-authored command.

u6748: 19 checks passed, one three-level fixture failed. The fixture still used
a four-cell stair run; actual native surfaces after completion are [1,15,-1]
and [1,17,-2], matching the current two-cell run/four-level rise. Correcting
only the subsequent floor/stair fixture to z=-2 yields u6750: three-level build,
finite supplies and recovery pass, strict types/diff pass. This does not establish
browser or hosted acceptance. Retained ghost/catalog/contextual UI remains open.
