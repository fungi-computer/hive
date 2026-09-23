# Current v7 joined-source review — 2026-09-08

Root's source/caller review, supporting visible Game Delivery/world-lab review.
This is a dirty, changing checkpoint at HEAD9c16db8, not a final candidate or an
executed proof. deconstruct-pm remains sole writer; Delivery owns correction,
acceptance/Git/proof/deploy. No additional approval tier follows.

Read hashes at the concrete checkpoint:

- activity.ts `bdf15525485fd3d1532e6ca7761a88ad863992e1e7bccdedd9891813aa03ff46`
- clearing.test.js `99d0fd821ca316ea824b12d2915454f26c1dbef8c421c653c5d5ecd4f56b9801`
- persistence.ts `92afdf9654a69e3905a43131aa8a1d6ffb3f78fd7025bfc875d60689f06e10dd`
- materials.ts `295b22f8c991ed416c499ff5c5a0d43ab00378358492c7d585575051af86329c`
- jobs.ts `9cad22023db8f1c3c2f64d306a14aa82e1468929369e3d543c752fe9de22d2d3`

## Concrete caller corrections

1. `activity.transfer` resolves a destination by `site.type === "shelf"`.
   Construction supply to an unfinished shelf targets `construction-buffer:id`,
   so substituting `shelf:id` causes `deliverTransfer` to reject it. Resolve the
   actual requested container ID and its current lifecycle. There is already a
   more accurate resolver in persistence; use one deep container-definition query
   across immediate consumers instead of duplicating prefix/type guesses.

2. `persistence.activityMatchesJob` handles transfer activity only inside
   `job.kind === "transfer"`. A live build job legitimately owns a transfer
   activity, created by `jobs.transferOption`. It reaches the later
   `task.kind !== job.kind` rejection. Therefore ordinary in-progress construction
   hauling can be rejected by snapshot/restore despite valid material custody.
   Recognize transfer activity plus its actual owning job/request, preserving
   both build-owned supply and explicit Store work. This is not a legacy shim.

3. Shelf deconstruction calls `releaseContainer`, discards its returned owners,
   then removes Store jobs/site. Other affected workers can retain task/assignment
   references to the removed job/transfer until their later tick. If they already
   advanced this tick, the completed frame can fail the save validator. Resolve
   those actor obligations during the same teardown transition. Material release
   already dropped goods; cleanup must not drop/refund them again.

4. The restore validator checks occupied quantity per container and individual
   request quantity, but not aggregate occupied+incoming capacity or summed
   reserved quantity per source lot. The kernel excludes these conflicts at
   runtime; external saves need the same material laws. Carrying quantity must
   equal the request, material must match the resolved destination, and a reserved
   transfer must have its matching live activity/assignment. Preserve the real
   taskless **carrying** boundary created by pickup/finishActivity; do not outlaw
   that valid continuation to simplify validation. Validate completed sites have
   exactly their embedding, as well as validating that every embedding has a site.

5. Follow-up caller observation: material ground-location constructors spread an
   arbitrary `Cell`-typed object (`...at`, `...drop.cell`). TypeScript permits a
   Site/Herb object wherever Cell is expected, so spread copies its id/type/work/
   stage fields into the strict saved location. The writer's activity-local
   `groundCell` projection addresses current call sites, but the deep material
   boundary should itself copy exactly x/z/level in all ground creation/drop/
   release/salvage operations. Callers should not have to remember to sanitize a
   structurally valid Cell before a material operation. A single private ground
   location constructor prevents the same bug in the next consumer; no broad
   geometry framework is needed. This finding postdates the hashes above.

## Preserve the existing game laws while porting data

The new clearing.test.js at this checkpoint contains five direct activity/
assignment tests and replaces actual libcolony with a sorted greedy fake. That
can support an explicitly isolated caller test, but cannot stand in for the
retained actual-WASM integration suite. No runtime optimizer replacement is
alleged. The replacement currently does not exercise step/admitCommands/route.

A bounded independent Terra read inventoried the following baseline outcomes at
`git show HEAD:src/clearing.test.js`. Port their meaningful assertions to lots,
transfers, containers and embedding; delete obsolete v1–v6 migration assertions,
not the game behavior. Retaining these focused deterministic laws is not a
request to restart the long home browser harness.

- **Topology and support:** sole stair (211), drafted Go (252), stair headroom
  (324), cross-level conflicts (481), shelter (541), edge travel cost (564),
  teardown dependencies (594), route closure (625), upper salvage/restore (712),
  floor delivery from below (784), closed upstairs outline (827).
- **Paused intent, Work, Draft and replay:** pause/reset (973), paused Draft
  interruption (991), release/preserve work (1030), routine exclusion (1047), Go
  preflight (1074), blocked Go/Undraft (1103), equal-tick replay (1128), paused
  admission (1280), Work/personal priorities (1749), deterministic replay (1829).
- **Rest and other jobs:** waiting work wakes (860), actual sheltered sleep
  (932), occupied-bed deconstruction/rest retention (1198), sow/growth/harvest
  (1335), plant cancellation (1674), night/dawn (1859), explicit rest precedence
  (1894), personal/shared optimizer assignments (1964), one bed/two sleepers
  (2103).
- **Cancellation and world legality:** queued/working/carried cancellation
  (881), reopening blueprint route (915), salvage/sink (1161), unreachable
  deconstruction waits (1235), cancel leaves structure (1262), reachable roof
  refund over wall (2172).

Source review alone establishes these concrete mismatches, not a passing result
or their entire consequences. The writer/reviewer should close them through the
actual supported command → fixed-step → save path and the real optimizer. Pure
terminal helper effects remain useful unit evidence with that narrower scope.

## Follow-up observed in the same writer's current source

After the initial report, root re-read the actual changes: construction now
exports `resolveMaterialDestination(sites,id)` and activity/persistence consume
its lifecycle-aware result; shelf teardown clears affected actor obligations;
activityMatchesJob now branches on transfer **activity** and validates its real
build/Store owner. The replacement test file has restored the shipped
public/vendor/libcolony JS/WASM loader and actual fixed-step helpers, and the
writer is still porting integration laws. These are concrete implementation
advances, not final review, passing full coverage or a release claim. Material
location normalization, complete relational checks and the preserved behavior
coverage remain with the same writer/reviewer until their actual checkpoint.
