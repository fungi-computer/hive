# Deconstruction-ready contract

## Current trace and minimum new caller

There is no current structure-selection caller. src/main.js creates createView and gives it the input callbacks at main.js:481. src/construction-view.js:drawSites renders sites, but its sprite helper sets eventMode = "none" (lines 68-72). A finished structure click consequently falls through src/view.js:147-166 to the ground handler and, while idle, only dispatches close-target at main.js:570-574. Trees and actors are the existing hit-tested comparison.

The minimum new trace is:

finished Site sprite pointertap
  -> createConstructionView input.site(site.id, screenPoint)
  -> main createView input.site -> hud.dispatch({kind:"inspect-site", ...})
  -> createHud routeUiAction/runAction -> inspectedTarget = {kind:"site", id, point}
  -> Site inspection card -> explicit Deconstruct button
  -> UiAction command {kind:"deconstruct", site:id}
  -> main effect/request({party:"home", actors:null}) -> queue/flushPending
  -> orders.admitCommands/acceptCommand -> DeconstructJob
  -> step -> assignWork -> DeconstructActivity travel/work
  -> safe sleeper interruption if necessary -> remove site -> salvage pile + sink

Only a finished site is interactive; its pointer target is disabled under placement, pan, and box gestures. It is not a replacement for the unfinished-blueprint Cancel control in Orders.

## One inspection target, separate selection and gesture state

Replace the separate inspectedId, treeId, and proposed selectedSiteId with one Jotai value:

- inspectedTarget: { kind: "actor" | "tree" | "site"; id: string; point?: ScreenPoint } | null
- selectedIds remains the independent roster multi-selection.
- XState remains the sole owner of tool, gesture, start/end, and commit state.

Actor, tree, and finished-site handlers set the one discriminant. Target panels derive their target only by matching kind/id against display facts. A small clearInspection helper sets it null for close, tool/panel changes, escape, reset, pan/camera intent, and replacement actions; this removes three parallel reset fields. Selecting a home actor may retain its actor inspection while updating selectedIds; selecting a visitor clears selectedIds and inspects that actor. Selecting a tree or site preserves roster multi-selection but replaces only inspectedTarget. Gesture actions do not store inspection state in XState.

## Typed job and colocated recipe values

Add one discriminant at each typed boundary:

- DeconstructCommand = Scope & { kind: "deconstruct"; site: string }
- DeconstructJob = JobBase & { kind: "deconstruct"; target: string }
- DeconstructActivity = ActivityBase & { kind: "deconstruct" }

Command, Job, Activity, body mode, UiCommand, UI router, orders/jobs/activity switches, and persistence unions must be exhaustive. Deconstruction uses existing build permission for automatic work; no new priority control is introduced.

Put deconstruction properties beside each existing BUILDINGS recipe, for example:

- wall: wood 1, ticks 32, deconstructTicks 32, salvageWood 1
- door: wood 2, ticks 48, deconstructTicks 48, salvageWood 1
- roof: wood 1, ticks 24, deconstructTicks 24, salvageWood 1
- bed: wood 2, ticks 48, deconstructTicks 48, salvageWood 1

commandProblem retains scope validation, then requires an extant finished site and rejects a duplicate deconstruct job for it. orderWork creates only the job, never a new site. jobOption uses approach(person, site, blockedCells(state)); no route gives a waiting reason. It creates the deconstruct activity with recipe.deconstructTicks, assigns it through the current optimizer, and begins normal travel. automaticWork maps this activity to build.

advanceWork resolves deconstruct to its Site and requires the same adjacent reachability used by build. workOnDeconstruction increments person.work only; site work/delivery and all claims/cargo stay unchanged until completion. If travel/adjacency/target validity fails, interruptWork resets the activity and preserves its job for retry. On completion, perform the sleeper handling below, remove the Site, finish only the deconstruct job, call dropWood(state, formerSite, recipe.salvageWood), and add recipe.wood - recipe.salvageWood to state.consumedWood. Removing first makes a wall cell eligible for its pile.

## Material conservation and cancellation

Add Clearing.consumedWood: a non-negative integer cumulative material sink, initialized to 0. At every valid checkpoint:

piles.sum(amount) + sites.sum(delivered) + actors.sum(cargo.amount) + consumedWood = felled * 6

Claims are excluded because they reserve existing pile material; they neither move nor consume it. Completed deconstruction is the only new sink transition. Wall/roof add salvage 1 and sink 0. Door/bed add salvage 1 and sink 1: this explicitly consumes one wood from their prior two-wood construction cost. No fractional resource, inventory teardown, tree/rock change, provenance ledger, or instant refund is permitted.

cancelJob gets a deconstruct case that changes no site, pile, or sink. Its existing active-task pass calls interruptWork, so a canceled deconstruction produces no salvage and leaves the completed structure intact. Keep the existing build case exactly: cancelling an unfinished blueprint removes it and refundWood(site, site.delivered) returns delivered material, while interruptWork safely drops carried wood. Do not route deconstruction through cancel.

## Sleep and room behavior

Do not block wall, door, or roof deconstruction merely because a person sleeps. At deconstruction completion, calculate sheltered beds using the prospective site list with the selected site removed.

- If the selected site is an occupied bed, interruptWork its sleeper before removal.
- For any active sleep task whose bed is absent from prospective shelteredBeds, interruptWork that sleeper before removal. This covers an enclosing wall, door, or roof removal that exposes a sleeping room.
- Keep every affected rest job in state.jobs and do not change the actor routine flag. finishActivity, which interruptWork uses, clears only task/assignment/path/work and marks workDirty; it does not delete the rest job. A sleeper has no cargo by the existing task/cargo invariants, and no unrelated claim/cargo/material ownership changes.
- The retained rest job is reassigned only when a valid sheltered free bed exists; otherwise jobs.ts reports its existing waiting reason. Existing updateRoutine behavior remains: dawn finishes active routine sleep and removes routine rest jobs; night creates a routine rest job only for idle, cargo-free routine actors when a sheltered bed exists.

This is a wake-up, not a collapse system. Non-sleeping rooms can become unsheltered; no roofs, beds, walls, doors, pawns, jobs, piles, trees, rocks, or claims are cascaded, deleted, rebuilt, or refunded.

## Save/checkpoint migration and invariants

This addition changes the saved state, so write schema 2 while preserving local schema-1 saves.

- V2 savedClearingSchema requires consumedWood: nonNegative integer, and adds deconstruct to activitySchema, body mode, jobSchema, and commandSchema.
- Keep a strict V1 envelope/saved-state schema for the exact current shape. restoreSnapshot parses an explicit v1|v2 envelope union. For v1 it materializes consumedWood: 0 before validating the normalized V2 Clearing; for v2 it validates directly. The restored state remains paused as today.
- snapshotFor and saveWorld always emit V2. No load path overwrites or replaces a valid V1 record merely to migrate it.
- checkInvariants verifies the conservation equation, unique ids, and that every deconstruct job/activity references an extant finished site. A deconstruct task has its matching job/site, no claim, no cargo, and mode walk or deconstruct. Extend every assertNever rather than accepting an unknown variant.

## Falsifiable checks

- Source: old schema-1 saves restore with consumedWood 0; v2 round-trips; malformed/mismatched conservation, missing finished target, claim/cargo on a deconstruct task, or an unhandled union variant fails validation.
- Source: after building/deconstructing each type, conservation holds. Wall/roof sink 0; door/bed create one pile wood and increment consumedWood once.
- Source: cancel or path-interrupt a deconstruct: target/site/sink/piles are unchanged and its job retries unless explicitly canceled. Unfinished build cancellation still refunds delivered wood.
- Source: deconstruct an occupied bed, then an enclosing wall/door/roof around sleeping people: sleepers become idle via interruptWork, their rest jobs/routine flags remain, the selected site is removed only after work, and no collapse occurs.
- Browser: each finished wall/roof/door/bed opens Deconstruct; unfinished blueprints do not. The pawn visibly travels and works; no pile or sink change occurs until completion. Save during travel/work, reload paused, resume, and complete with conservation intact.

## Narrow writable boundary and serial order

Writable implementation boundary: src/model.ts, src/construction.js, src/resources.ts only if it hosts a shared conservation helper, src/orders.ts, src/jobs.ts, src/activity.ts, src/routine.ts only if a focused wake helper is colocated there, src/persistence.ts, src/ui-actions.ts, src/hud.jsx, src/view.js, src/construction-view.js, src/main.js, and focused source tests. Do not write runtime, docs, Git, dist, dependencies, providers, or unrelated gameplay.

Integrate: model and V1/V2 persistence normalization/invariants; recipe values and conservation transition; command/cancel/job/activity and sleeper wake-up; unified inspection/render/HUD; focused source and browser checks. No UI path may submit deconstruction before serialization accepts its state.
