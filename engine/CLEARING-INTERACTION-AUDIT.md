# Clearing interaction restoration audit — September 13

## Renewed player-flow review

Levi's current requirement is the Clearing's actual game interaction, not another
sidebar expansion. Re-read retained tool transitions, dominant-axis dragCells,
wallMask adjacency, contextual Target/BrewStationPanel and workPositions. The
retained corner-access rule explicitly prevents the last wall of an enclosure
being stranded. Preserve that behavior through current native contact ownership;
do not copy its old hard-coded level-1 restriction.

Placement candidate af518bc is NOT accepted: review found its point-only mode
falls back to null, which the caller incorrectly admits to the area gesture.
The existing writer is correcting that and reviewing upstairs anchor behavior.
Its grouping/rotation tests alone do not establish placement reliability. One
ghost sprite also does not complete footprint and connected-wall previews.

The completion bar remains a coherent player loop: order without selecting an
available worker, see and cancel the intended footprint, build connected shapes,
inspect the actual object, let workers supply/work independently, and recover
from a refused or blocked order without losing further input. Current work must
remove the superseded interaction path as each replacement lands.

Further review found that the current input caller ignored the committed line
designation and submitted raw rectangle endpoints. The placement writer is
correcting both preview and submission to consume the existing shape owner.
Ground preview without a structure anchor also remains in that correction.

Root corrected a separate server admission hazard: build-area size was checked
after allocating every cell. It is now checked from dimensions before allocation.
u6756 exited 0: maximum schema-valid coordinates reject before terrain queries,
a subsequent valid order succeeds, strict engine types and diff checks pass.
This is source-only; it is not evidence that this caused a particular live stall.

Placement source a760eb5 joined as 6e30349. Root review rejected an intermediate
per-cell command loop: one wall stroke must submit one area command with the
line's normalized endpoints, retaining native stroke orientation. The joined
caller does that. Root also bounded line allocation in the spatial owner.
The actual published wall control -> selected line endpoints -> command binder
-> Colony admission test proves previewed cells match admitted cells for a
diagonal drag. u6758 passed four tests but failed TypeScript because the new
test imported an undeclared client JS module from TS. The boundary test now lives
alongside the JS client tests; u6759 passed that test and strict types, then failed
diff whitespace only. Removing the trailing blank line passed diff check without
replaying tests. Both owned scopes are inactive/dead with empty ControlGroup.
No new browser or hosting acceptance is claimed. Full footprint/connected-wall
ghosts and meaningful contextual object cards still remain.

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

Client repairs published as preview c9a94c56-079e-4064-b9fd-aa002c2b44f8 from
6cbbb4f. Build u6751, preview u6752 and44-file exact HTTP readback u6753 passed.
Existing DO unchanged; no new-world requirement from this static release.
Hosted gameplay is still awaiting observation; HTTP parity is not a playtest.

Further client reliability correction: definitive public-host refusal statuses
400/401/403/404/405/413/422 now retire that command from the FIFO rather than
trigger reconnect/retry. Transport uncertainty retains same-ID retries; 408,
rate limiting and server failures are not reclassified as final refusal.
Rejected Region receipts preserve their reason when present. u6754 proves a
400 followed by a successful independent order without reconnect, plus the
existing lost-receipt identical-body retry law; strict types/diff pass. This
correction is source-only pending the next coherent client release.

## Construction-triggered slowdown reproduced and correction underway

The invited world e947's observed layout reproduces a substantial slowdown when
its finished wall/floors are built before ordering the four raised floors.
Saved local packet: .botanical/world-e947-diagnosis/profile-layout.jsonl.
Thirty steps averaged337.24ms, with230 route-cost calls consuming10001ms.
Native advance consumed9.1ms total; observation averaged2.15ms and snapshot/JSON
2.58ms. The layout reconstruction is not a copy of the remote world's hidden
work claims, but it establishes the construction-triggered search bottleneck.

Root correction is a disposable native memo for exact ordered route-cost batches
that contain an unavailable result. Keys include actor IDs, exact endpoints and
traversal settings; physical terrain revision and the complete obstacle index
invalidate all entries. Support-frame/in-flight queries bypass it. At most64
batches are retained, no saved schema change and no physical authority changes.
Do not reuse a per-target shared-budget failure for another batch, or treat any
cached estimate as execution permission. Both public route queries now reject
use after an attempt requires restore.

u6769 exhausted the game volume while compiling dependencies. Only its newly
created target directory was removed with Cargo clean (518.2MiB), preserving
source and .botanical. u6771 used /tmp/hive-route-cost-target without debug symbols;
its old-shape8 checks passed but review superseded that shape. Current exact-batch
u6772 passed9 focused native checks; existing compiler advisories remain. u6773
completed the WASM build successfully. The unchanged ordered-layout fixture then
passed as u6774: all three prerequisite structures finished; the subsequent30
steps averaged6.47ms (previous337.24ms). The same230 route-cost calls consumed
108ms total (previous10001ms). Observation averaged1.93ms and snapshot/JSON2.20ms.
Maximum step remains115.26ms: avoiding repeated unchanged searches does not remove
the first expensive search. This is local fixture evidence, not hosted recovery
or proof that every worker claim is correct. Both scopes are inactive/dead with
empty ControlGroups; no server/listener was opened. Saved result is
.botanical/world-e947-diagnosis/profile-fixed.jsonl.

Levi explicitly approved starting fresh rather than adding update/migration
machinery. Existing stored worlds were not deleted or modified. On September13,
source b41b029 was published: DO version d1844efc-a4aa-4afa-b81f-501ba34a7841,
implementation6128ef5d2cd812c19368dc66df18653a6441fbcc4b142ed9d4fb2bd9d38089df;
frontend preview856a7ae1-0558-4ddf-beb6-a171af9f3407. Build u6776 and uploads
u6777/u6778 exited0. First immediate HTTP readback u6779 saw13 mismatches/404s;
preserved readback-initial.json. Later unchanged readback u6780 matched44/44 files.
Fresh authenticated Colony observation returned200, revision0,10 facts in852ms.
This establishes fresh-world startup and served bytes, not a hosted construction
benchmark or rendered gameplay acceptance. Exact receipts and fresh-world URL:
.botanical/construction-route-release/. Existing old-hash worlds require New world;
previous DO e5467434 and frontend c9a94c56 remain rollback references.

## Shared gesture rejection and retained placement previews — source checkpoint

Root reviewed the ghost writer09cf164/f628543 and integrated its source, correcting
the arrow-factory construction bug before acceptance. Sprite lifetime checks cover
reuse/hide/disposal without destroying shared textures. The shared designation
owner now treats size/cross-level RangeErrors as expected rejection data. MOVE
retains the gesture, shrinking back clears rejection, END releases without
submitting, and the next BEGIN works. Unknown modes/programming errors still throw.
The actual pointer caller and previews consume this same decision; broad catches
and injected duplicate designation functions were removed.

u6782: eight laws passed; command test failed module resolution before execution.
Bundled unchanged command consumer passed u6783. Two changed MOVE/recovery laws
passed u6785. Initial audit u6784 flagged pointerUp complexity; splitting terrain
completion from entity selection removed the introduced finding. u6786 audit
passed new-only, retaining nine inherited dead-code issues,13 complexity findings
and one duplication group. No dependency/export deletion was made to hide them.

Not published or visually accepted. Root found an additional preview mismatch:
wall area commands infer orientation from the stroke when orientation is absent,
while ghosts still default north. Resolve that through an owned shared placement
rule before claiming the ghost preview matches the committed building. Full
retained footprints/joined walls/contextual cards and brewing remain incomplete.

Wall-preview source correction: SDK placementOrientation now owns fixed/stroke
alignment and explicit rotation. Goblin's single colonyPlacement definition maps
catalog entries to alignment and original visual IDs; both command and client
consume it. Removed the command-private strokeOrientation and page-private visual
map. u6788 passed four affected consumer/ghost laws, including actual emitted wall
actions on both axes, stair rotation and fixed floors. u6789 strict engine types
passed. Still no rendered acceptance or new publication from this source change.

Connected wall ghosts now consume the same canonical east/south/west/north mask
owner used by finished wall art. The preview joins every proposed cell to the
rest of its stroke and to observed finished or unfinished walls on the same
level; unrelated visuals and other levels do not influence it. The client keeps
bounded pooled sprites and accepts a per-cell visual without creating placement
authority. Focused u6864 passed all three placement-preview laws and strict engine
types. The runtime contract now declares the construction-access query already
used by allocation, so tests provide that capability explicitly rather than
casting through an undeclared method. This is reviewed source at 99b5ec6; no new
rendered or hosted acceptance is claimed.

## September13 construction support correction — owning implementation plan

Levi requires floor-on-wall, queued support dependencies, deterministic admission
and completion, and original stair/floor/wall art meeting at their actual surfaces.
This is not permission for a new support solver or collapse simulation.

Source findings:
- Rust structure_support::resolve already roots columns in terrain/completed
  surfaces and spans floors from original anchors, with max_span_steps6 in Goblin.
  prepare_structures invokes it before publishing physical geometry. Preserve it.
- StaticGeometry represents floors as upward faces, walls as occupied cells.
  A floor on the highest wall cell is not a bulk-volume collision.
- upper-placement.js currently offers only four empty neighbors of an anchor,
  explicitly excluding the anchor's own existing surface. That is a UI policy,
  not the native support decision, and cannot decide structural legality.
- colony-building.ts selects the first currently clear neighbor before recording
  the plan, or rejects with no clear working surface. Native ConstructionSite
  persists that contact and uses it as the material container Position. Thus
  changing a work contact later is NOT a harmless field rewrite: it can move goods.
- plan_construction validates instance bounds/contact but not the complete planned
  layout. complete_construction calls prepare_structures; on blocked geometry it
  returns false while advance_construction retains the working worker. Admission,
  waiting reasons and worker release are therefore incompletely joined.
- Finished visuals use south0/east1/north2/west3; ghost facing still uses north0.
  Generic wall bindings also always select direction0 and omit retained wallJoints.
  Alignment arithmetic passing is not proof of artwork alignment.

Implementation order and invariants:
1. Keep Rust geometry/support as authority. Add a non-mutating construction
   assessment over canonical finished structures plus the candidate/plan set.
   Return typed fit/support reasons, distinguishing currently supported from
   planned-supported/waiting. Reuse resolve; do not make a TypeScript support graph.
   Unsupported cycles cannot root themselves. Finished floors do not reset span
   distance. The existing six-cell policy remains data, not a per-floor wall rule.
2. Separate blueprint location from reachable work contact and physical staging
   custody. A queued blueprint must not require an available worker. Decide and
   document the staging-location lifetime before removing contact from planning:
   never relocate an occupied material buffer merely because a worker path changed.
   Empty/unbound staging may bind when a legal contact becomes available; hauling
   and work then consume that actual physical location through their existing owners.
3. Shared work provider consumes current assessment and current path eligibility.
   Completion rechecks fit/support/water/actor collision with the same native owner.
   A blocked finish releases attendance, preserves earned work/material identity,
   and records waiting; it never returns a success merely because the job was old.
   Reconsider after relevant geometry/material changes, not futile heavy searches
   every tick. Runtime caches remain disposable and revision-owned.
4. Publish bounded assessment/blueprint surfaces through existing observation;
   client targeting can acquire completed AND planned support planes, including
   the wall top itself. The UI displays the server's waiting reason. Client
   prediction is a preview, not a second permission authority.
5. Restore original art anchor/facing/footprint and wall-neighbor joint selection
   using the same physical placement coordinates. Personally inspect a wall with
   top floor and stairs meeting its landing before visual acceptance or publication.

Required focused witnesses: grounded wall plus floor on its top; six-cell span
and unsupported seventh cell; wall-then-floor and floor-then-wall nonconflicting
blueprints reaching the same final geometry; missing/cancelled support waits and
releases worker; unsupported cycles stay pending; another worker can continue;
save/reload retains plans/effort/physical lots; no occupied staging relocation;
completion blocked by water/actor does not consume/duplicate materials. Conflicting
commands still respect the authoritative order—determinism does not mean mutually
exclusive orders can both win. No fresh complete-support claim from source review.

Implementation checkpoint: existing native helper now owns construction readiness
in isolated hive-construction-readiness, branch engine/construction-readiness-20260913
from e9d3663. Its first complete pin 320256a is NOT accepted: it rebuilds complete
support geometry once per pending site, converts every assessment failure into an
ordinary invalid status, and exposes no player-facing waiting reason. The recut
must compile the committed support facts once per physical revision, assess each
candidate without allowing unfinished plans to support one another, and propagate
real native failures. A one-tick delay after an earlier site completes is safe;
repeated full support solves per job per tick are not.

The same review confirmed that the current ConstructionSite Position is the first
clear adjacent cell found at designation time. Construction work routing and the
generic delivery provider both treat that arbitrary cell as the permanent target.
This couples structural legality, material custody and worker access: a lawful
blueprint can remain unreachable when another side is open. The clean break keeps
the blueprint's physical cells and occupied material buffer authoritative while a
native construction-access query supplies bounded current approach choices. An
occupied buffer never teleports when access changes. Empty staging may bind through
the construction owner; hauling and attendance use that one chosen physical stage.

Root retains staging/blueprint admission and original-art joins. Upper placement no longer excludes the selected
supporting top itself; u6793 passed three focused candidate/pointer/cache checks.
This corrects target acquisition, not physical support/worker eligibility; those
remain native-owned. No new deployment or floor-on-wall playtest claimed.

Original wall-joint source restored through reusable gridConnectionMasks: same-level
east/south/west/north adjacency is indexed once, then Goblin chooses the existing
48 stage/mask atlas bindings. No new art, physics or support fact is created. Moved
construction presentation out of Colony's inline closure into its own owner.
u6795 passed order/level adjacency and actual Colony-to-original-bank path checks.
Initial strict-type u6794 rejected an overly broad ReadContext parameter; narrowed
to the actual query capability and u6796 passed. u6797 audit flagged mixed visual
geometry/stage complexity; separated geometric origin/top calculation, then u6798
passed new-only. Existing advisories remain. Original art composition and joined
ghost previews still need visual acceptance; this is not a public release.
