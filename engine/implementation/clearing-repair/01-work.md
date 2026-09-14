# One work-attempt owner

[Packet index](README.md) · [Contacts](02-construction.md) · [Parties](03-parties.md)

## Actual source being replaced

`engine/src/sdk/work-system.ts` assembles provider claims and delegates to
`work-allocation.ts`. Keep the joint matcher, lower-bound correction, eight exact
assignments and 32 validation budget. The allocation itself is not a retry engine.
`delivery.ts`, `construction-work.ts`, `deconstruction-work.ts`,
`process-attendance.ts`, `games/colony-work.ts` and `colony-water-work.ts` each
currently retain actor associations and inspect outcomes differently.
`runtime/session.ts` retains only the previous step's action array/results;
`contracts.ts::ActionOutcome` has no attempt identity. This cannot safely correlate
later recovery by actor/destination resemblance.

Watchdog reference is Botanical `38966f9`, `packages/watchdog/src/effect.ts`:
private claims, exact settlement, cancellation intent before signalling, no
recovery on an unanswered probe. Its async executor is not a fixed-step colony
scheduler. The analogous game owner lives in native ECS, not another SQLite queue.

## Canonical representation

Add `engine/kernel/src/work_attempt.rs`, registered through existing component,
action, snapshot and record owners. Expose typed operations through the existing
SDK/contracts and WASM port. Do not introduce another host or scheduler.

Conceptual types (Rust enums/structs, exhaustive TS discriminated projections):

```rust
struct AttemptKey { task: EntityId, generation: u64 }
struct OperationKey { attempt: AttemptKey, sequence: u32 }
struct WorkAttempt {
    key: AttemptKey,
    worker: EntityId,
    party: EntityId,
    phase: AttemptPhase,
}
enum AttemptPhase {
    Ready,
    Executing { operation: OperationKey, activity: ActivityRef },
    Outcome { operation: OperationKey, result: WorkOutcome },
    Settling { operation: OperationKey, cause: InterruptCause },
}
enum WorkOutcome {
    Completed,
    Blocked { reason: WorkBlockReason },
    Interrupted { cause: InterruptCause },
}
```

`ActivityRef` refers to the current native route/excavation/construction/process or
single material operation; it does not duplicate progress or quantity. A request
accepted for movement stays Executing until arrival/block/interruption. A material
transfer may settle within the same native advance. Do not equate either action
admission or loss of Destination with successful physical completion.

Task intent remains in its existing domain order component. Allocate generations from one saved native monotonic counter; never reuse
keys after cancellation, task deletion/recreation or restore. Provider phase/input fields remain only when
they describe real domain progress. Remove provider actor/claim fields once its
consumer uses WorkAttempt. Native construction/process worker references become
references to the shared attempt; they may resolve its worker, not allocate one.
A terminal attempt outcome is consumed before that task starts another attempt.

Derived indexes at this mutation owner: worker -> active attempt, task -> attempt,
activity -> operation key. Rebuild on load; validate uniqueness and all references.
At most one pending outcome per live attempt; never append every tick to a new log.
Keep the result until explicit acknowledgement in the same candidate transition
that advances the domain task. This avoids the one-tick observation-loss trap.
Remove acknowledged attempt only after its terminal transition is durably retained. Region
command replay remains the external command receipt owner.

## Operations and admission

Expose `beginAttempt`, `executeAttempt`, `interruptAttempt`, `acknowledgeAttempt`
through existing native action parsing. Each parses once, validates relationships
and applies atomically with authored writes at existing native advance.

```text
beginAttempt(task, worker, firstPhysicalOperation):
  require task is open; worker and task same permitted party
  require no competing attempt and worker is undrafted/eligible
  allocate key from native saved generation counter with checked arithmetic
  admit first operation and create attempt atomically; reject both on failure

executeAttempt(key, sequence, physicalAction):
  require current key; no unresolved operation; exact expected sequence
  require physicalAction worker/target matches this attempt's permitted task
  invoke existing physical owner with operation key
  retain result or active native activity reference

acknowledgeAttempt(key, sequence):
  require exact terminal outcome
  consume outcome together with authored task transition
  release worker association; no quantity changes here
```

A wrapper around arbitrary physical actions is NOT authority. Use a closed mapping
of supported work operation variants to native handlers and validate their actual
worker, task, contact/material references. External clients cannot submit these
internal actions; they submit GamePack commands. Content IDs remain definitions.
Wrong key/sequence rejects without side effect; exact external replay returns the
Region receipt. No coordinate matching or blanket Error -> blocked conversion.

Native long-running work advances under its current scheduler and work budgets.
Its completed/blocked transitions publish the scoped outcome through this owner.
The outcome has typed reasons: access lost, missing inputs, capacity unavailable,
unsupported structure, worker unavailable. Programmer/schema/custody defects stay
errors and invalidate the detached resident on failed commit.

## Scheduling and retries

Recut PreparedWorkProvider into explicit stages, hiding provider representation:

```ts
interface WorkProvider {
  reconcile(context: WorkContext): void; // consumes exact native outcomes
  discover(context: WorkContext): readonly ReadyTask[];
  next(task: TaskId, worker: EntityId, facts: WorkFacts): WorkOperation;
}
```

WorkContext is the existing scoped context with typed attempt operations, not a
service locator. Providers cannot write WorkAttempt directly. `ReadyTask` carries
party and task identity plus legal contacts; no worker ownership field.

Order per step: reconcile results/interruption; update ready/block indexes from
committed facts; build bounded eligible candidates; match; submit begin/execute.
If a release commits only at end of this step, use the freed worker next step;
do not pretend queued native mutations already happened. Within the batch, the
shared owner prevents duplicate begin requests and native admission rechecks.
No physical progress while paused, even during cleanup. Paused commands may save
intent/drafted state and enqueue the interruption for the next permitted advance.

Preserve budget exhaustion as Deferred, separate from Unreachable. Ready discovery
rotates a durable/stable bounded cursor so untouched work cannot starve. Index
blocked orders by relevant material container/structure and local navigation
revision. Pair-specific reachability/capability blocks only that worker-task pair.
A topology change elsewhere is not reason to recompute all paths; bounded local
navigation invalidation plus fair deferred retry must cover changes opening a
previously unreachable route. Unreachable with no sound local dependency uses a
bounded fair retry queue, never permanent exclusion or every-tick global search.

## Drafting, interruption and cargo

Manual Draft is an intent in the same world transaction: validate party, mark
control mode, interrupt that worker's exact attempt. Stop only the route/activity
owned by that key, not a newer manual destination. A stale cancellation cannot
stop newer movement. Undraft clears manual mode; work resumes from current facts.

Interrupting does not undo admitted effects. First settle the issued native
operation; for synchronous local native steps this is known at candidate end,
not a reason to spawn async cleanup. For external lost ack, consult Region receipt.

If a task's goods remain in the actor's real container, shared delivery retains
its obligation/reservation while releasing the labor claim. Represent that as a
held delivery obligation referring to lot/holder/task, not an active worker
attempt. Held quantity still counts against carrying capacity and destination
outstanding demand. Other workers cannot steal it. An undrafted holder can accept
a cleanup/delivery attempt later; a drafted holder may explicitly drop/transfer.
No automatic movement overrides a drafted actor. Once a drop/transfer commits,
update source/reservation from the real lot result. If the whole order is
cancelled, release demand after admitted effects settle; leave the lot in place.

Missing actor/lot references are validation defects unless a supported destruction
operation emitted a typed disposition. Do not continue forever on missing rows.

## Migration/deletion checklist

| Consumer | Domain state retained | Generic code removed |
| --- | --- | --- |
| delivery.ts | source/destination/material/quantity, held obligation | actor claim, rejectedMove, coordinate scans, ad hoc release/retry |
| construction-work.ts | native site progress/materials | ConstructionApproach actor ownership and local rejected predicate |
| deconstruction-work.ts | salvage/time and legal teardown requirements | matchingRejectedMove and generic actor retry ownership |
| process-attendance.ts | process/stage/material bindings | duplicate attendance claim and movement outcome scan |
| colony-work.ts dig/tree/resource | designation, target, earned domain progress | worker claim and move/operation matching branches |
| colony-water-work.ts | request, vessel and conserved field exchange identity | independent approaching-actor claim/move rejection policy |

Do not delete field-water operation receipts, process-bound portions or excavation
progress as 'duplication': those are physical owners. Migrate all listed consumers
before declaring consolidation complete. Tests must exercise actual operations,
not only fake provider arrays. See [acceptance IDs](05-delivery.md).

## Serialization and exact handoff details (implementation binding)

Use one monotonic native `next_work_generation: u64` in kernel snapshot metadata,
not a different new counter on every provider component. `beginAttempt` allocates
it and increments with checked arithmetic. Task IDs may be removed/recreated without reusing attempt
identity. Use the returned key from begin, not caller-invented IDs.
Make `beginAttempt` include its first typed physical operation so claim + operation
admission succeed or reject together. Multi-assignment batching allocates keys in
stable assignment order. Add the counter to `record_bundle.rs` metadata and the
existing monolithic snapshot path together; never derive it from live max after
old attempts have been deleted. Overflow rejects, never wraps.

Expose a bounded native `workAttempts(taskIds)` projection returning keys, worker,
party and phase/outcome. It is NOT `ctx.outcomes` with another filter. The ECS
WorkAttempt plus its operation outcome is canonical saved native state. Persist
ActivityRef's discriminant and stable activity target/operation key on native
route, excavation, construction and process activity records. Rebuild native
worker/task/activity indexes from these references on both record hydrate and
snapshot restore; reject orphan or competing references. No TypeScript map owns
these indexes. Declare/rebuild on paused command admission too.

Long-running activity completion writes WorkAttempt::Outcome during native
advance N. It is saved with all physical effects in Region transition N. During
step N+1 the scoped work query sees that retained outcome. Provider queues its
authored task transition and acknowledgeAttempt; native advance validates and
commits them together. A crash before/after either commit restores the same
outcome or its acknowledged successor, with no reissued completed operation.
An acknowledgement alone without the matching task transition is invalid trusted
composition; add the transition to a narrow shared reconcile operation rather
than letting each provider separately clear fields. Carry canonical next provider
stage in the authored write that native validates with the ack. Same-step terminal
material operations follow the same retained-outcome path.

Delivery's retained obligation representation belongs to the existing DeliveryTask:
`custody = source | held(lot,holder) | delivered | dropped(lot,groundContainer)`.
Use a versioned discriminated codec in its owning module; retire phase/actor
combinations that previously represented the same facts. Demand retains source,
destination, material and quantity. A held holder reference is physical custody,
not an assigned worker claim. Derive holder from native lot custody and validate
it; no authoritative duplicate lot location. Persist only the obligation's lot
reference and disposition; don't store a second mutable holder if derivable.
Reserve outstanding quantity at that same delivery/supply owner, including held
obligations. Dropping updates obligation source only after the exact native result.
The final concrete codec must choose these variants, not a union of all old flags.

Exact source changes: add action variants to `contracts.ts`, runtime/actions.ts,
SDK authoring wrappers and Rust dispatch in world.rs/lib.rs; add projection to
KernelPort, runtime/wasm-kernel.ts and Session context. Update native component
schema/record validation in components.rs/record_bundle.rs and all real fixtures.
No raw client `work-*` actions; host Region permits players only named scoped game
commands. Provider execution is trusted composition, but native task/actor/party
relations are always checked. Definitions cannot smuggle a host scope.
