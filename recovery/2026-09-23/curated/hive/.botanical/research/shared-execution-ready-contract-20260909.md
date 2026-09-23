# Shared execution ready contract — 2026-09-09

Read-only source proposal after material recut2 acceptance. No source, proof, Git or live runtime changes. Anchors describe current working bytes, including retained care. This is a bounded execution extraction, not a new scheduler or permission to resume the earlier broad work queue.

## What actually exists

Kettle filling, mugwort watering and drinking already share one pail phase machine. `activity.ts:426-589` acquires a bound vessel, walks to a spring, draws an exact quantity, walks to a resolved target, settles, drops/releases the vessel, removes the operation and finishes the job. `water-delivery.ts:31-90` supplies quantities/target access; `:93-146` dispatches container pour, herb sink/establishment, or care sink/need gain. Three copies of this machine do not exist and should not be claimed as deleted.

Eating repeats the acquisition/attendance/completion orchestration across `activity.ts:590-622,706-742`: locate operation/job/custody, resolve origin access, walk, pick up, increment actor work, sink, remove operation, finish job. `needs.ts:31-88` already defines ration material/quantity/40 attendance ticks and nourishment effect, alongside the vessel-content hydration definition. `needs.ts:178-245` already preflights the care target/receipt and joins a physical sink to one durable care outcome and gain.

Admission is still split in `jobs.ts:1375-1470`: water inserts an operation, acquires its pail, and rolls the operation back if acquisition fails; eating acquires a portion and then inserts its operation. Water rebinding is another branch. Optimizer candidates in `jobs.ts:423-551,927-1001` resolve actual routes and sources; the joint libcolony assignment must continue to choose among these candidates. There is no reason for the new owner to select a second worker or rescan the entire world.

Current cancellation is materially safe but execution-specific. `activity.ts:94-126` parks water uses while canceling ordinary food use, removes consume operations, then resets actor activity. Water completion `:576-588` cancels the physical use and separately finishes/removes game state. `orders.ts:468-486` distinguishes parked/active water and food operation teardown. The accepted material owner already owns physical cancel/drop/claim retirement (`engine/materials/held-use.ts:378`), while `parkOperationVessel` at `:125` preserves a claim for reassignment. Reusing those operations is required; recreating their cleanup is not an executor.

Saved water progress is `model.ts:309-319` (`acquire/draw/pour`, bound vessel and drawn lot); food progress is split between `ConsumeOperation` at `:321-327`, actor work and transfer phase. Persistence repeats their semantic joins at `persistence.ts:2062-2204`, in addition to task/job checks at `:1245-1288`. Current physical relations already have the material owner; they must stay there.

## Supported owner and caller shape

Introduce one headless execution owner, initially for finite material use. It owns admitted execution identity, current step, attended ticks, executor attachment, exact resolved material bindings, interruption disposition and terminal settlement. It receives the existing configured material owner, not a copied inventory. It does not own wall-clock time, actor movement, pathfinding, job priority or optimizer assignment.

Before, assignment and activity callers do:

```ts
operations.push(waterOperation);
acquirePailForOperation(...); // caller compensates on failure
// per activity: resolve source -> walk -> pickup -> change phase
// -> draw -> remember output lot -> change phase -> resolve target
// -> settle -> cancel/drop pail -> remove operation -> finish job
```

After, the game submits the optimizer's resolved choice:

```ts
execution.admit(worldExecution, {
  id, job, executor, definition, resolvedInputs, target,
});
const outcome = execution.advance(worldExecution, id, currentTick, host);
// outcome: waiting/access-request, advanced, interrupted, or completed
```

The game adapter satisfies access requests using its existing movement owner and applies the returned job/activity projection. Callers never write step indices, drawn-lot IDs, progress counters or binding arrays. `interrupt(id, reason, legalDrop)` applies the definition's interruption disposition; `cancel(id, legalDrop)` is explicit permanent cancellation. `attach(id, executor, admittedAccess)` resumes a parked run through material rebinding. These are outcome operations, not exported preflight choreography.

The runtime host is a typed, synchronous integration boundary for current access and effect semantics. It is not saved code, arbitrary callbacks in definitions, a plugin registry or an event bus. Its endpoint query resolves an opaque game target to current access cells plus a physical container or an effect target. Navigation progresses outside the material owner. Refactor `accessWork` (`activity.ts:373-387`) so a blocked route returns an outcome; it currently calls `interruptWork` internally, which must not recursively cancel an executor while `advance` is using it.

## Small finite program, explicit differences

Use a closed sequence of the primitives already exercised here: acquire ordinary use, draw vessel contents, attend, settle, release use. Persist a definition ID/version and a checked step state; do not save closures. There is no branching language, user-authored control flow, concurrent-step scheduler or general optional-field entity. Each primitive's state is a discriminated union with required fields (for example a drawn-content state necessarily has its exact material lot ID). The executor derives carrying from material custody rather than storing another carrying flag.

| Authored definition | Actual ordered work | Terminal effect | Interruption semantics |
| --- | --- | --- | --- |
| Fill kettle | acquire vessel, draw 2 water, reach kettle, pour, release vessel | physical container deposit | park vessel and current contents/step; reassign later |
| Water plant | acquire vessel, draw configured water quantity, reach plant, sink, release vessel | herb establishment linked to sink receipt | same park behavior; no establishment if target is stale |
| Drink | acquire vessel, draw 1 water, reach actor, sink, release vessel | hydration gain linked to sink receipt | same park behavior; target actor is the beneficiary, not any assigned worker |
| Eat ration | acquire 1 ration portion, attend 40 active ticks, sink | nourishment gain linked to sink receipt | cancel/drop ordinary use and restart attendance on a fresh admitted attempt, preserving current behavior |

Materials, amounts, vessel capability requirement, attendance and effect IDs become definitions. Pail/spring/kettle/herb names are game content references, not transport branches. Ground vs container source access is an endpoint difference. Whole reusable vessel vs consumable portion is a physical difference. Container deposit vs irreversible sink is a settlement difference. Park/reassign vs cancel/restart is a lifecycle difference. Preserve all four explicitly; do not make food keep a claim merely to fit the water machine, or reset drawn water to make all cancellation look alike.

Kettle work has no attendance delay today; water drinking currently has no separate 40-tick eating delay. Water acquisition can advance into drawing on an already-reached source during the same active tick; eating returns after pickup and starts attendance later. Define the per-primitive yield rule in the checked definitions/step contract and preserve these timing facts in the first migration. Paused ticks do not attend, draw, settle, or move. `clearing.ts:133-138` remains the one active tick advance and needs/work order.

## Settlement, endpoints and save authority

Material owner remains sole authority for quantities, capacity, reservations, carried lots, use bindings and sink/recipe receipts. Execution owns step progress and exactly-once transition to a terminal outcome. Game owns authored target legality, need/plant mutation, job membership, finite grant budgets and actual actor routes.

A settlement transition first resolves/revalidates the target and all effect preconditions, then calls the material mutation, then commits its already-checked game effect and execution advancement synchronously. There must be no failure-capable callback after sinking a ration/water portion and before recording its outcome. Extract the existing preflight-plus-infallible-commit behavior of `needs.ts:178-245` and `water-delivery.ts:128-145`, not a generic `emit` followed by a later effect consumer. The host/world transaction owns that joined commit; snapshots cannot observe a half-committed sink/effect. Container pouring is not another material sink or a fabricated receipt. A settled step must never be replayed after restore; any retained completion reference must refer to actual committed progress/receipt, not infer success from a missing item. Exact controller-command lost-ack replay remains a separate contract.

Persist execution step, its exact input/output references, attendance and attachment/park state in one versioned execution record. Actor work is then a projection for these four consumers, not another saved attendance authority. Restore first parses the current execution schema, calls shared material relations, then executor phase relations, then game job/actor/target/effect joins. Strict historical water/consume parsers and their old relation laws remain pinned before conversion. Convert old `phase`/`water`/actor work only after those old joins validate. A parked drawn pail resumes the destination step with the same contained lot; food attendance restores the exact existing value until interrupted. New current persistence must not reproduce the executor phase grammar.

## Deletion map and first implementation cut

The first working implementation cut should take **kettle fill plus ration eating end to end**, because they exercise both acquired-use shapes and both deposit/sink endings. A water-only abstraction would merely relocate the current machine. Keep plant watering/drinking on the current water path only until first-shape review, then move them as definition/effect configurations over the proven same sequence. All four migrated is the bounded consumer outcome, not the first two alone.

Concrete first-cut replacement sites:

- `jobs.ts:1375-1470`: replace water/food insertion, acquire compensation and rebind choreography with owner admission/attachment. Keep candidate/path evaluation and joint assignment at `:423-551,927-1001`.
- `activity.ts:426-622,706-742`: replace water machine and food acquire/attend orchestration with one execution advancement adapter. Existing walking and job-finished projection remain game-owned. Remove the old phase writes and `p.work` authority for migrated executions.
- `activity.ts:94-126,576-588` and `orders.ts:468-486`: route park/cancel/complete through execution outcome operations, deleting per-feature operation-array and physical-retirement choreography.
- `model.ts:309-327`: replace live legacy water/consume execution records after migration; preserve frozen wire types in persistence. Do not create a second operations array in parallel as the accepted endpoint.
- `persistence.ts:2062-2204`: replace current operation phase/attachment checks with shared execution relations. Retain game endpoint/job/definition checks and frozen predecessor validation. `needs.ts:178-245` and `water-delivery.ts:93-146` become typed game effect settlement handlers; quantity custody remains in materials.

First law: run an independent finite vessel-fill definition and an ordinary food-use definition through the same imported executor. Interrupt before pickup, after draw/after food pickup, and one tick before settlement; save/restore each stage; remove a target; retry. Assert exact material conservation, unchanged rejected transitions, drawn water retains the same lot through park/rebind, eating interruption restarts only attendance, and completion deposits/sinks/applies effect once. Then run actual WASM kettle and care laws with the new caller adapter. Repeated active-tick advance and repeated terminal retirement must not duplicate effect/job completion; paused advance must do nothing. First-shape review should see removed caller branches, one progress owner and both consumers on the supported entry before plant/drink migration expands.

No proof was run for this proposal. Root retains implementation custody and the separate world/deep-level work.
