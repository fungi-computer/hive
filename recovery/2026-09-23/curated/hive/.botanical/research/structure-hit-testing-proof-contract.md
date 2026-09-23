# Structure hit-testing proof contract

Read-only acceptance contract for the current deployed structure picker. This is an observable contract, not an implementation proposal.

## First finding

`src/construction-view.js:127-157` now makes a finished active-level wall or roof non-interactive when cutaway covers it; an uncovered finished active-level site remains a static Pixi hit target. `src/main.js:572-580` routes the topmost site tap to `inspect-site`, while `src/main.js:582-672` owns pointer gestures when a tool is armed. Therefore a projected cell anchor is not itself proof of site selection: the browser trace must record the physical screen point and the runtime site selected there.

## Evidence inputs

Only these exact clipboard files were available:

- `/tmp/herdr-clipboard-images-1000/client-10-clipboard-1788813137322604002-0.png` — terminal/status pane, not game evidence.
- `/tmp/herdr-clipboard-images-1000/client-10-clipboard-1788820603193485249-0.png` — unrelated image, not game evidence.
- `/tmp/herdr-clipboard-images-1000/client-10-clipboard-1788825834741738163-0.png` — cropped upper bed/actor/wood visual.
- `/tmp/herdr-clipboard-images-1000/client-10-clipboard-1788825858047730070-0.png` — smaller cropped upper bed/actor visual.
- `/tmp/herdr-clipboard-images-1000/client-10-clipboard-1788826178424236737-0.png` — game view with a ground wall inspection panel.

The crops are visual context only; they do not establish a hit target without the runtime selection fact.

## Falsifiable matrix

| Case | Physical input and state | Required observation | Owner |
|---|---|---|---|
| Empty ground near every structure | In the active level, click a clear point adjacent to each finished wall, body, roof, floor, and bed footprint. | No structure inspection opens; selection site is null or the prior target is closed; no build/deconstruct/chop command is added. Record the screen point and state delta. | Browser trace; source guards are unit/source-checkable. |
| Visible wall/body | With no tool and the structure visibly exposed, click a non-overlapped body point. | The inspection identifies the runtime `site.id`, `type`, and `level` of the visible structure; no expected site ID is hardcoded. | Browser trace. |
| Bed/roof/floor overlap | In the upper fixture, test a visible bed-body point, roof point, and floor-edge point separately, recording their runtime footprints and screen points. | Each click selects the structure whose visible hit region received the event; an occluding roof/wall must not be reported as a bed. A failed bed click is a failed physical-point contract, not a guessed ID. | Browser trace; footprints/type validity are unit/source-checkable. |
| Cutaway on | Toggle the real cutaway control on and wait for the selection fact. | Covered finished roof and qualifying wall are non-hit-testable per `eventMode=none`; a visible inner bed/body can be selected at a recorded point if one is exposed. | Source check plus browser trace. |
| Cutaway off | Toggle cutaway off and repeat the same points. | Visible active-level cover may own the hit; the result must match the recorded topmost visual target, not an assumed cell center. | Browser trace. |
| Active level | Select Ground, then Upper, and click finished structures visible on each level. | The selected site has the clicked structure’s runtime level; no cross-level inspection is accepted. | Browser trace; level/eventMode conditions are source-checkable. |
| Off-level/support context | With the other level active, click an off-level structure that is only shown as support context. | It does not open an inspection unless the source explicitly makes that context interactive; record selection unchanged/null. | Browser trace; `activeLevel`/`supportContext` policy is source-checkable. |
| Armed Wall | Arm the real Wall tool, click/drag a clear cell and an existing structure, then right-click. | Pointer input is consumed by placement/gesture state; no structure inspection is opened. Right-click cancels/consumes the armed tool and creates no stray build order. | Browser trace; `groundPointerOwns`, `input.site`, and placement routing are source-checkable. |
| Armed Chop | Arm the real Chop tool, use a valid tree gesture and a structure/ground click, then right-click. | Only the valid tree designation path can create chop intent; structure clicks do not inspect a site, and right-click cancels/consumes the armed gesture without a false chop target. | Browser trace; tree/tool routing is source-checkable. |
| Unarmed right-click | With no tool and no drag, right-click clear ground and a visible structure. | Clear ground produces only the normal go/close behavior; a structure right-click follows the site inspection path; neither invents a fixed site ID. | Browser trace; `groundRight`/site routing is source-checkable. |
| Normal viewport | Run the matrix at the normal viewport. | Canvas and inspection panel remain physically reachable; record selected runtime IDs/types/levels and screenshots. | Browser trace. |
| 390px viewport | Repeat the minimal empty-ground, visible-bed/wall, cutaway, armed-tool/right-click cases at 390px. | Controls, canvas, and panel stay within the viewport; no overflow or occlusion is silently accepted as a selection. | Browser trace. |
| ID discipline | For every site assertion, read `window.__GOBLIN.state.sites` after the action and map the selected ID to its current object. | No remote/fixed `site-*` value is used as an acceptance target; deterministic IDs may be reported only as observed data. | Source/proof review. |

## Scope split

Unit/source checks can establish the `eventMode` conditions for active/off-level/cutaway sites, the z-order rule, footprint/type validity, tool ownership and right-click routing, and the absence of fixed site-ID assumptions. One focused browser trace must establish the physical hit result: empty-ground dismissal, visible wall/body and bed/roof/floor selection, cutaway on/off, active/off-level behavior, armed Wall/Chop/right-click consumption, and normal/390 containment with screenshots and page/console/request errors empty.

