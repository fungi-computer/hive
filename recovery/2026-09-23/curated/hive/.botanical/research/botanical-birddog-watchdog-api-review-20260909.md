# BirdDog and Watchdog API lessons for Hive

Read-only source review, September 9, 2026. This compares Botanical-next's current
Field Guide, BirdDog/Watchdog public APIs and their immediate Shiitake/local-host
callers with Hive's on-disk, still-unaccepted material extraction. It does not
re-review Shiitake, Woodstock, providers or the execute-tool path, and runs no
proofs.

## Patterns worth adopting

1. **Expose lifecycle outcomes and keep mutation machinery private.** Watchdog's
   public grammar is the closed `queued | running | settled` union and its public
   runtime is `ingest`, `read`, `readQueueHead`, `tick`, `cancel`, `purge` plus the
   narrow `transactional` projection
   (`Botanical-next/packages/watchdog/src/effect.ts:29-132,255-287`). Claim tokens,
   recovery counts, SQL rows, selection and exact-claim settlement stay behind
   `openSqliteState` (`src/internal/sqlite-store.ts:37-143,399-451`). Hive should
   keep the same shape principle: `src/engine/materials/index.ts:7-73` correctly
   removes the configured owner's `internal` surface and exposes physical verbs,
   four useful queries, and versioned snapshot/restore. Finish migrating Goblin
   through that entry. The current transitional facade still imports
   `owner.ts` directly and destructures many private queries/helpers
   (`src/materials.ts:33-74`); that cannot remain the supported engine seam.

2. **Offer a narrow join at the real atomic owner.** Watchdog does not expose SQL
   or a generic callback. `WatchdogTransactionalProjection` supplies only
   `readQueueHead`, `enqueueAcceptedJob`, and `recordCancellationIntent`; Shiitake
   invokes those inside its existing owner transaction
   (`packages/shiitake/src/internal/runtime-coordinator.ts:103-113,146-185`). For
   Hive, the analogous join is a synchronous world-command admission operation
   that validates scope/staleness and mutates accepted intent/result together in
   the one `WorldState` owner. It is not a new database transaction or scheduler.
   Material operations should continue making their whole physical mutation only
   after all checks, as `reserveTransfer`, `pickupTransfer`, `deliverTransfer` and
   `releaseContainer` do (`src/engine/materials/owner.ts:231-310,353-475,588-641`).

3. **Separate generic mechanism from the edge that gives payload meaning.**
   Watchdog stores `payload: unknown` and never interprets it
   (`watchdog/src/effect.ts:29-42`). BirdDog alone validates agent addresses/mail,
   maps accepted Session work to `queue = sessionId`, and decodes that payload
   after claim (`bird-dog/src/index.ts:10-48,81-96`;
   `bird-dog/src/effect.ts:113-141`). Hive should retain this division between a
   content-free material owner and Goblin planners: the engine owns lots,
   custody, capacity and phase; callers resolve endpoint reachability, recipe
   roles and game policy before submitting typed operations. The generic
   `createMaterialOwner<M>(definitions)` and resolved `ContainerSpec` are a good
   start (`src/engine/materials/types.ts:16-109,167-179`;
   `src/engine/materials/owner.ts:6-33`). Do not move `jobs.ts` route choice,
   brew definitions or UI reasons into that owner.

4. **Use stable identities to distinguish replay from conflict.** Watchdog
   accepts an identical `jobId` replay but rejects changed content, records one
   `cancellationId`, and settles only the exact private claim
   (`watchdog/src/internal/sqlite-store.ts:302-350,399-436`). Hive needs this law
   at its durable command/result boundary: retrying the same accepted command
   after a lost acknowledgement returns the stored result; reusing its ID for a
   different command conflicts; physical effects occur once. Existing sink and
   recipe receipt IDs are useful provenance (`src/materials.ts:428-507,860-979`),
   but `duplicate-sink`, `owner-busy` or `wrong-phase` alone do not establish
   exact replay. Keep retry identity above the physical owner unless a specific
   material operation itself needs a durable replay result.

5. **Make bounded continuation state explicit.** BirdDog writes deterministic
   per-recipient outbox keys before delivery, drains at most 64 rows, retries at
   most 20 times with capped backoff, and carries its cursor/earliest wake across
   pages (`bird-dog/src/effect.ts:66-76,158-174,192-290`). This is a useful model
   for controller-result or notification delivery after a committed world result:
   durable consequence first, bounded delivery later, stable key on replay. Its
   host contract also hides real assumptions: `list(limit, afterKey)` must be
   stable, ordered and exclusive; `put` must preserve a key; `post=true` means the
   receiver accepted responsibility. These are host/outbox laws, not simulation
   laws.

## Cancellation, retry and durability are deliberately different

Watchdog cancellation first stores intent, then interrupts the active Effect;
settlement gives recorded cancellation precedence over the executor's return
(`watchdog/src/effect.ts:308-318,393-435`). A queued cancellation becomes a
terminal row without execution. Disappearance recovery occurs only when
`isAlive` answers `false`; `true` or probe failure leaves the claim untouched,
and re-execution is limited by `maxRecoveries`
(`watchdog/src/effect.ts:325-359`; `src/internal/sqlite-store.ts:523-555`). BirdDog
then emits no reply for a cancelled job and durably retries other terminal replies
(`bird-dog/src/effect.ts:224-262`).

Hive cannot collapse physical cancellation into that grammar. A reserved transfer
can release; a carried lot must remain in unique custody and needs a legal drop;
pre-PREPARE recipe cancellation releases only its promise and leaves staged lots;
consumed inputs and settled outputs cannot be rolled back
(`src/engine/materials/owner.ts:543-584`; `src/materials.ts:982-1017`). Save/reload
must resume the exact transfer/process phase and world clock, rather than infer
"worker disappeared" and enqueue fresh physical work. Retries must re-check
current lots, capacity, access and ownership deterministically.

## What Hive should not transplant

- Do not put Watchdog, SQLite, Effect fibers, wall-clock wakes or an async outbox
  inside the fixed-step material/work simulation. They solve durable host work,
  not deterministic world evolution.
- Do not replace libcolony assignment or personal-order policy with Watchdog's
  priority/sequence queue. Watchdog claims one opaque ready row; it does not solve
  joint actor/job assignment, paths, custody continuation or resource conflicts.
- Do not use `AbortSignal` as the physical cancellation contract. The world owner
  must return a typed disposition that preserves quantity and custody.
- Do not requeue a saved `running` transfer because an actor/controller is absent.
  Watchdog's liveness recovery assumes an external execution claim; Hive's phase
  is already durable world truth.
- Do not let `unknown` payloads or BirdDog's free-form mail enter the material
  kernel. Parse controller input at the engine door and pass exhaustive physical
  operations inward. Mail/notification delivery cannot grant game authority or
  advance simulation time.
- Do not copy BirdDog's retry numbers, queue names or default lane as game policy.
  They are private host limits and agent correspondence choices, not material or
  work laws.

The useful adoption is the ownership shape: a small public state machine, private
claims/representation, one atomic seam into the surrounding owner, a semantic
edge module over a payload-blind mechanism, stable replay identities, and bounded
post-commit consequences. Hive should express those ideas in its existing
deterministic state and typed material/work vocabulary.
