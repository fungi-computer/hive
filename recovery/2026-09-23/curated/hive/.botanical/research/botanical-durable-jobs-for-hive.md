# Current Botanical durable jobs: boundary for Hive

Read-only source study, 2026-09-07. Botanical-next read at
`a96c67c351d4a1935d4b9c3573eefb0611c69749`; its status has only untracked
`.fungi/`. Read its `AGENTS.md`, current direction, and Software Shape Field
Guide before this check. This is current source evidence, not a production or
adoption claim.

## What Watchdog actually owns

`packages/watchdog/README.md` describes a payload-blind durable job engine. The
current implementation corroborates it: `src/internal/sqlite-store.ts:231-267`
creates owner-local SQLite rows with queued/running/settled state, private claim
token, recovery count, cancellation identity, and terminal outcome. Its public
Effect surface is `ingest/read/readQueueHead/tick/cancel/purge` plus a synchronous
transactional projection (`src/effect.ts:250-277`).

One `tick` serializes inside a runtime (`tickState`), inspects a prior running
claim, atomically selects and claims one queued row, executes the opaque payload,
then exact-settles against the claim token (`src/effect.ts:307-436`; store
operations at `sqlite-store.ts:321-404`). A concurrent tick returns `busy`.
`generic-tick-lifecycle.test.ts:21-94` proves finalization precedes durable
settlement and that a failed post-settlement wake does not undo that settlement.

This gives durable lifecycle ownership and idempotent *row* ingestion/settlement,
not exactly-once arbitrary side effects. Re-executing a disappeared claim can
repeat a model/tool action. A tool intent/outcome can be recorded by Shiitake,
but no reviewed source makes an external tool effect transactional with the
Watchdog row.

## Real Shiitake caller trace

1. A decoded Session prompt reaches
   `coordinator.ts:356-394:acceptAndWakeCommand`.
2. `woodstock/session-store.ts:857-907:acceptSessionCommand` runs under the
   same `owner.transactionSync`: it finds a matching `(sessionId, requestId)`
   and returns replay, or appends the command/receipt/work pointer and invokes
   the enqueue callback. Same request ID with different text conflicts.
3. `runtime-coordinator.ts:123-126` converts that accepted work through
   `BirdDog.agentJobFromInput` and calls Watchdog's transactional enqueue inside
   that owner transaction. `shiitake/test/watchdog-owner-store.test.ts:72-145`
   proves the session command and opaque queued job appear together, a replay
   adds no writes, and the runtime later settles the stored job. Separate Watchdog disappearance tests construct a fresh runtime; this join test does not.
4. Only after new acceptance does the coordinator request a wake
   (`coordinator.ts:380-388`). The Cloudflare adapter's `runtimeHost`
   (`cloudflare.ts:60-124`) schedules reconciliation with `waitUntil`, allows
   one active run, and records a single rerun request while it is active.
5. `runtime-reconciliation.ts:56-81` calls `watchdog.tick`. The claimed job is
   decoded by BirdDog, loaded from Woodstock, contract-checked, then executed by
   `accepted-run-executor.ts:38-86`. `run-scope.ts:51-111` acquires the model
   and Mycelium tool lease and runs Mule/Pi with compaction; terminal mapping
   returns completed/cancelled/failed. Watchdog exact-settles, then BirdDog may
   fan out the durable result.

`cloudflare-adapter.test.ts:16-57` proves this host composition with native
owner storage and a queued `waitUntil` task. That is a fixture proof, not a
hosted/provider production journey.

## Claim, cancellation, disappearance, and retry limits

- Watchdog enqueues a duplicate only when all job fields match; otherwise the
  store rejects it (`sqlite-store.ts:270-299`). Cancellation is durably recorded
  before interrupting a matching live Effect fiber (`effect.ts:295-305`);
  `generic-active-cancellation.test.ts:9-81` proves a cancelled terminal row.
- A disappeared running claim is acted on only when `isAlive` answers `false`.
  An exception/unanswered probe leaves it running. With a bounded recovery
  budget it requeues; otherwise it settles `interrupted`
  (`effect.ts:312-347`, `generic-disappearance-recovery.test.ts:82-134`).
- Shiitake deliberately supplies `isAlive: () => false`
  (`runtime-coordinator.ts:83-95`). This is not a general liveness probe:
  Cloudflare's one-owner host serializes active reconciliation and reruns, while
  Watchdog rejects overlapping ticks. Thus an idle fresh reconciler seeing a
  running row treats it as a disappeared predecessor.
- Normal accepted Session work has no recovery field: Woodstock passes only
  job/session/command IDs (`session-store.ts:901-905`), and BirdDog adds recovery
  only if that field exists (`bird-dog/src/effect.ts:112-132`). Current normal
  Shiitake recovery therefore settles a disappeared model/tool run as
  `interrupted`; it does not replay it. A caller that explicitly adds
  `maxRecoveries` authorizes rerun and must make its own effects safe or accept
  ambiguity. Live provider retry is a separate in-run policy, not Watchdog
  recovery (`shiitake/test/runtime-core-live-retry.test.ts:50-182`).

## Agent Host is a separate, non-durable caller

`services/agent-host` does not enqueue Watchdog jobs. Its Effect core has one
in-memory connected browser and a dropping queue of one request
(`effect.ts:141-177, 206-357`); the browser claims then
`browser.ts:86-113:handleBrowserRequest` calls Whistle directly. That source
explicitly says post-claim cancellation cannot undo a Whistle side effect.
Disconnect after dispatch is `browser_execution_indeterminate`, and settlements
are idempotent only without a durable receipt ledger (`effect.ts:91-95,
179-189`). The test proves one execution plus indeterminate/ignored late result
(`agent-host.test.ts:235-311`). Do not mistake this connection claim for durable
job persistence.

## Hive boundary: reuse decision by runtime

Hive's `src/orders.ts` jobs are fixed-step simulation state: ordered job arrays,
actor activities/path progress, cargo and wood claims all live in `Clearing`
(`src/model.ts`, `src/jobs.ts`, `src/activity.ts`). They are not service tasks;
their owner is the local simulation and its snapshot. The next local-save slice
selects asynchronous browser IndexedDB through the maintained `idb` wrapper; it is not implemented by this study and introduces no offline clock.

For browser-local save now, do **not** import Watchdog: its actual interface
requires synchronous `WatchdogSqliteOwner.sql.exec` and `transactionSync`
(`watchdog/src/effect.ts`), an executor, liveness answer and wake capability. Shiitake additionally requires a host that binds/schedules a reconciler (`RuntimeHost` in its own contracts). IndexedDB is asynchronous; the game
has a fixed ticker and no durable server executor. Reuse only demonstrated
principles: one authoritative snapshot, atomic command/state transition,
explicit cancellation/outcome, bounded retained history, and no replay of an
uncertain external effect.

For a later server-owned AI action, Watchdog is a concrete candidate only if one
single-owner service already provides that synchronous SQLite transaction and a
serialized wake/lifecycle. Keep game command admission and world effects in the owning simulation;
translate a specifically accepted AI/service action into opaque payload at that
boundary. Before any recovery budget, prove whether the action has no external
effect, an idempotency key/receipt, or an `outcome_unknown` terminal policy.

Actual gaps: no browser Watchdog adapter, no IndexedDB owner adapter, no game
server executor/host, no durable offline browser delivery, and no proved policy
for replaying an AI-issued game action after side-effect ambiguity. These are
future seams, not blockers for the small local-world save.

Deletion check: adding Watchdog before a service executor would retain Hive's
simulation jobs and add a second scheduler, persistence model, and wake owner.
No local ownership disappears, so current browser save should remain the narrow
snapshot boundary.

Astra personally read Watchdog public/Effect/store code, four lifecycle test sources, and the actual Shiitake coordinator, accepted executor, run scope, Cloudflare adapter, Woodstock acceptance and BirdDog translation. This is source review, not a newly run Botanical test suite. The accepted Watchdog ADR contains target pseudocode; the implementation above owns API and current recovery claims.

Immediate save acceptance: job admission/cancellation and material ownership belong to the same committed snapshot revision; resume the last committed checkpoint rather than re-executing a completed job; show Saved only after commit; preserve a prior recoverable save on failure; reject stale-tab overwrites. Periodic autosave permits rollback to its last successful checkpoint after a crash, so do not describe every visible order as durably acknowledged. Future external AI requests need domain receipts/idempotency and reconciliation at the game authority in addition to Watchdog lifecycle settlement.
