# Deconstruction proof plan

## Scope and caller conflict

This is a post-pinned-build plan only; do not launch it during implementation. The current browser has no structure-click caller: src/construction-view.js creates site sprites with eventMode = "none", and src/view.js exposes actor/tree/ground callbacks only. Consequently the accepted contract's createConstructionView -> input.site -> main -> HUD inspection path must land before browser proof can begin.

Existing browser hooks:

- #stage canvas for coordinate clicks and art captures.
- window.__GOBLIN.artReady, .state, .selection, and .project for readiness, deterministic world facts, and projected canvas coordinates.
- #pause, #orders, #orders [data-action="cancel"][data-job], #notice, #score, #save-status, #continue, and #game.
- Existing order rows have no job-kind selector; identify the new job first from window.__GOBLIN.state.jobs, then use its existing data-job cancel control.

Required new stable hooks (add with the feature, not in this plan):

- [data-site-id="<site id>"] is not possible inside the Pixi canvas; click its window.__GOBLIN.project(state site position) coordinate on #stage canvas.
- [aria-label="Structure actions"] for the selected finished-site card.
- [data-action="deconstruct"][data-site="<site id>"] for its explicit action.
- [data-job-kind="deconstruct"][data-job="<job id>"] on the matching #orders row. It makes the shared job assertion independent of display wording.

Use window.__GOBLIN.state only as the existing browser diagnostic hook, never as a state-writing shortcut.

## Source laws (focused tests, not browser work)

1. Selection/action admission: a finished site alone can produce one shared deconstruct command/job (home party, actors null); missing, unfinished, duplicate, or wrong-party targets reject. Existing unfinished-build cancel still removes/refunds only its blueprint.
2. Accounting: at every transition, sum(piles.amount) + sum(sites.delivered) + sum(actors.cargo.amount) + consumedWood equals felled * 6. Completion yields wall/roof salvage 1 with sink delta 0, and door/bed salvage 1 with sink delta 1. Before completion, pile and sink deltas are zero.
3. Interruptions: cancel and route/adjacency loss leave target, pile total, and sink unchanged; cancelled work has no salvage. The job retry/cancel behavior is asserted without a browser-only maze.
4. Sleep/remodeling: removing an occupied bed interrupts its sleeper; removing an enclosure interrupts precisely sleepers whose active bed is not in prospective shelteredBeds. Their rest jobs and routine flags remain; their task/assignment clears; unrelated cargo/claims and all non-target structures remain. No collapse/cascade is introduced.
5. Persistence: v1 normalizes consumedWood to 0; v2 round-trips an active deconstruct activity/job with conservation valid. Restore is paused; resume completes exactly once.
6. Exhaustiveness: deconstruct is present in command/job/activity/body-mode schemas and all target/assert-never routes; malformed target, claim/cargo, or accounting data fails validation.

## One short browser trace after a pinned build

Prepare one pinned local-save fixture containing reachable finished wall, roof, door, and bed, enough open approach cells, and a shelter arrangement for the sleep case. Start at a 390 px-wide viewport with the app paused; attach console error/unhandled-rejection collection before load.

1. Wait for window.__GOBLIN.artReady and the paused status. For each finished site, project its state coordinate to #stage canvas, click it, and assert [aria-label="Structure actions"] plus [data-action="deconstruct"][data-site="<id>"]. This is the finished-selection smoke check; an unfinished blueprint is clicked once and must not expose that action.
2. Click the wall action. Assert its exact order row is [data-job-kind="deconstruct"] and state.jobs reports party home, actors null, target site id. Snapshot conservation components. Resume with #pause; capture one canvas frame while actor mode is walk and one while it is deconstruct. Before completion, assert target remains and piles/sink equal the snapshot.
3. Reload during wall work. Assert #save-status reports a load and the world is paused; resume with #continue or #pause as rendered. Complete the wall and assert one pile wood at the former cell, sink unchanged, and conservation holds.
4. Repeat the compact select/action/complete loop for roof, door, and bed. Assert roof again has salvage +1/sink +0; door and bed each have salvage +1/sink +1. Use state sums, not #score alone, because #score exposes loose wood/carried wood rather than consumedWood.
5. In the fixture's occupied-bed/enclosure scenario, begin the selected real deconstruction and let it complete. Assert the affected sleeper becomes idle, its rest job and routine flag remain, and no non-target site disappears. This is one browser confirmation; the exact prospective-shelter matrix remains source coverage.
6. At every checkpoint assert no captured console/page errors. Finish with the app at 390 px and one final canvas/HUD capture.

## Smallest one-run art-proof evidence matrix

| Checkpoint | Single falsifiable state/DOM assertion | Evidence |
| --- | --- | --- |
| 390 px paused fixture | #stage canvas visible; no errors; four finished site coordinate clicks each expose its data-site deconstruct action | initial HUD/canvas capture |
| wall travel/work | shared deconstruct row exists; actor mode progresses walk -> deconstruct; target/pile/sink unchanged mid-work | two canvas frames |
| wall reload | reload renders paused save status; same active job/site resumes once | save-status + resumed frame |
| four completions | each former cell pile delta is 1; sink deltas are wall 0, roof 0, door 1, bed 1; conservation holds | final state extract + canvas |
| sleep case | affected sleeper idle; rest job/routine retained; only selected site removed | final HUD/state extract |

Caller conflict: no current DOM selector can target a Pixi Site, and no current structure-actions/deconstruct/job-kind selector exists. The pinned feature must supply the three new DOM hooks above and the input.site callback; otherwise only source tests can prove the new outcome.

