# Durable Object engine authority and local snapshots

## Current decision — September 9

**Direct user requirement:** Hive's engine will run in Cloudflare Durable
Objects. Durability under eviction, crash, retry and restart is a primary
constraint on current engine design. This supersedes the September 7
"later-server" framing below and the browser/IndexedDB rationale for deferring
Watchdog evaluation. It does not authorize a new production backend deployment.

The engine may compute in bounded RAM, including typed arrays or WASM memory.
Confirmed world history cannot depend on keeping that process alive. Cloudflare
explicitly distinguishes instance memory from persistent storage, and documents
memory loss on eviction/hibernation. Its SQLite storage provides owner-local
transactions; those transactions do not automatically persist JavaScript maps.
[Instance memory](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/),
[SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

### Actual source at this decision

- `src/engine/world/voxel-world.mjs` holds canonical edits/revision in `changes`
  and derives `byBrick`/decoded `cache`; `edit()` mutates RAM and `save()` returns
  data. It has no durable store or committed-command receipt. The opaque store's
  13 laws and independent quarry establish bounded mutation, serialization and
  regeneration, not process-loss durability.
- `src/engine/materials/index.ts` supplies shared operations and validated
  snapshot/restore. Its mutable state is supplied by its consumer. Material
  laws preserve custody inside that state; no host transaction is implied.
- `src/main.js` applies commands and publishes before asynchronous local save;
  its ticker advances the simulation and schedules periodic snapshots.
  `src/persistence.ts` omits command history from saved state. This is the
  existing browser demo's explicit save model, not the future server contract.

No current engine acceptance may label these existing source checkpoints
DO-durable. The reusable physical code remains valuable; the missing authority
boundary must become a real consumer before engine completion.

### Ownership and commitment

1. **One bounded simulation region, one DO authority initially.** The region
   owns terrain edits, actors, lots, claims, processes, physical fields and its
   committed clock. Render chunks and cache bricks do not each require a DO.
   There is no implicit transaction across DOs. Cross-region custody will need
   a separately proved transfer/receipt boundary before it can move resources;
   independent saves or two concurrent owners are insufficient.
2. **One coherent durable transition.** Admit a checked command under stable
   scoped identity. Commit its accepted intent or immediate effect, world/work
   updates, tick/revision, command result and required outgoing event records
   together. Admission is distinct from later job completion. Each later
   completion also commits its quantity/phase/effect/event facts together.
   Return the prior result for the same identity and same checked input;
   conflicting reuse rejects. A simulation revision alone is not this receipt.
3. **Publish committed facts.** A failed storage transaction must leave the
   authoritative projection unchanged. Compute against a private candidate or
   a proved rollback mechanism; SQL rollback does not undo mutated JS arrays.
   Preserve platform output gates and do not opt into unconfirmed writes for
   command success. Pending client feedback can remain explicitly pending.
4. **Persist only the truth and necessary continuation.** Keep generator/content
   versions, sparse edits, finite water/gas/heat/soil state, item custody,
   jobs/claims/process phases, stable ID/RNG state, clock, receipts and required
   wake/event obligations. Regenerate untouched terrain and rebuild route,
   spatial, capability and render caches. A field frontier may be rebuilt only
   if doing so preserves the declared deterministic continuation. There is no
   shutdown callback on which correctness may depend.
5. **Bound work and storage.** Batch a declared number of fixed steps and changed
   pages under one commit; do not issue a database write per neighbor/cell or
   serialize the entire possible world each tick. Persist the committed tick
   and any target/cursor needed to continue. Uncommitted computation may be
   retried; acknowledged effects may not disappear. Quantify write bytes/rows,
   commit latency, recovery cost and RAM alongside solver timing. Receipt/event
   retention needs a declared replay window and safe compaction; deleting a
   receipt must not silently turn an old retry into a new command.
6. **Wake from durable work.** Timers, live promises and an open client are not
   durable schedules. Restore pending work and repair its wake using the host's
   alarm/recovery owner. Duplicate alarm delivery must not duplicate physics or
   process completion. Cloudflare alarms are at-least-once and automatic error
   retries are bounded, so progress/rearming must be explicit. Browser Continue
   still restores paused; hosted offline progress uses the single clock and
   bounded advancement, not an unlimited catch-up loop in a constructor.
   [Alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/).

   Prove the commit-to-wake boundary without a subsequent client request. A
   saved due row plus repair only when somebody reopens the DO can preserve
   work yet leave it asleep indefinitely. Qualify the actual storage/alarm
   arrangement, including a crash during rearming and exhaustion of automatic
   retries; do not assume `waitUntil` or constructor repair closes that gap.

### Reevaluate and reuse Botanical

Current source, under `/home/levi/src/Botanical-next`, was reread for this decision:

- `packages/watchdog/src/index.ts`: `Watchdog.make` accepts a structural
  SQLite/transaction owner, liveness, executor and wake capabilities. It exposes
  ingestion, read, bounded lifecycle ticks, cancellation and a transactional
  enqueue/cancel projection. Qualify this existing owner for Hive host jobs;
  the old browser storage choice is not a reason to build a replacement.
- `packages/watchdog/src/internal/sqlite-store.ts`: stable job/body duplicate
  checks and exact claim-token settlement fence stale workers. Execution can
  happen before durable settlement: retry still needs the game command's own
  receipt. Watchdog does not install DO storage, alarms or exactly-once external
  effects for its consumer.
  Its public synchronous transaction projection joins enqueue/read/cancel, but
  supplies no terminal-write hook. Recovering a host job after the physical
  commit must read/replay the region receipt and then settle the host job;
  it must not repeat the physical effect to catch up. Recovery uses an answered
  false liveness result and exact claim/recovery fencing, not a timed lease.
  Unknown liveness cannot justify starting another executor.
- `packages/shiitake/src/internal/woodstock/session-store.ts` and
  `internal/runtime-coordinator.ts`: request acceptance and Watchdog work pointer
  join one transaction. The private Session implementation stays private; reuse
  its lesson and public Watchdog transaction capability rather than copying it.
- `apps/hub/src/agent-computers.ts`: mutation, input-checked replay receipt and
  outgoing projection record share one owner transaction. `src/team-do.ts`
  restores pending delivery and repairs an absent wake. This is actual DO
  source to consult for the host adapter, not proof Hive has adopted it.
  That Hub caller pre-arms a durable wake before mutation; adopt only a proved
  ordering for Hive. Hub also supersedes older pending projection snapshots.
  Game event/transfer obligations cannot inherit that loss policy: replaceable
  UI snapshots, replayable observations and required external effects have
  different retention rules. Reuse a committed event cursor where sufficient,
  instead of adding an outbox for every observer.
- **Botanical CTO's first checked correction:** Shiitake's current
  `packages/shiitake/src/cloudflare.ts:61-125` coalesces reconciliation through
  `waitUntil`; its `ShiitakeDO` exposes `fetch` and has no `alarm()` handler.
  `internal/runtime-coordinator.ts:133-134` requests recovery on reopen. Neither
  proves autonomous wake after a crash without another request. Game CTO read
  these actual callers and accepts the distinction: the region DO must own
  proved durable wake/rearming, not inherit an imaginary scheduler.
- **Retained-history correction from Botanical:** native `AgentDO` alarms were
  retained when the old external WatchdogDO liveness sidecar was removed. Later
  `packages/fungi-computer/do-host/src/alarm-clock.ts` multiplexed module wake
  deadlines into the one native alarm and rearmed after module ticks. The
  current waitUntil-only adapter is a rebuild acceptance gap, not a decision to
  abandon durable wake. Compare this retained owner and its fixes before adding
  scheduling code. The checked records are Botanical's
  `.botanical/cto/logs/retained-shiitake-alarm-review.md` and
  `shiitake-alarm-rebuild-history.md`; their limits include failed alarm writes,
  omitted failed deadline queries and hung module ticks. Source/test history
  does not itself prove Hive's request-free recovery.
- BirdDog delivery may repeat after send-before-delete failure. Shiitake's
  settlement/outbox reconciliation is a repair path, not a single atomic world
  commit. Mycelium's live sandbox fibers are execution resources, not durable
  game state. Stable event IDs and receiver deduplication remain necessary.

Watchdog owns host job lifecycle where used; Hive's deterministic step and
libcolony still own physical simulation and pawn assignment. A supported DO
adapter supplies storage, wake and recovery to the same headless owners. Hosting
imports stay outside numerical/material modules without deferring their
transactional contract. Botanical CTO read this contract and agrees with the
first-region/excavation target and request-free recovery requirement. The checked
peer comparison is retained at Botanical's
`.botanical/cto/logs/hive-do-peer-reply-20260909.md`, including two independent
source audits. This is agreement on the target, not acceptance of an unbuilt
Hive adapter. Both explicitly distinguish SQL rollback from candidate RAM
rollback. The current Field Guide's
`wiki/3-resources/field-guide/ownership-and-seams.md` requires this single owner
and explicit failure/retry contract.

### First required proof

Use an actual local Durable Object runtime and persistent storage, with the
same extracted physical owners used by Goblin. First join an excavation with
its finite material result in one region. Destroy/recreate the instance before
commit, after commit but before reply, and after event delivery but before its
acknowledgement. Retry the original command and duplicate the wake. Require:

- No acknowledged excavation or admitted work is lost.
- Terrain and its resulting material agree; quantity/custody stay conserved.
- The prior command result is returned and completion does not occur twice.
- Failed commitment leaves no newer published in-memory truth.
- Pending events recover without losing the obligation; duplicate delivery is
  harmless at the receiver.
- Clock, work phases and field state reconstruct without an old closure/cache.

Then use the same boundary for material/work completion and the water/air joins;
do not build a separate durable wrapper for each game feature. A plain in-memory
fake may support unit laws, but cannot replace the actual DO storage/restart
proof. Keep local runtime proof, deployed hosting and a live Shiitake match as
distinct evidence. The engine goal remains unfinished until these exits close.

## Historical local-save decision — September 7

**Status:** accepted local-save direction plus a later-server target assessment,
2026-09-07. Botanical Watchdog source provenance:
`a96c67c351d4a1935d4b9c3573eefb0611c69749`. This note changes no current
runtime dependency or scheduler.

## Current local browser save

The current local-save boundary remains a versioned asynchronous IndexedDB
snapshot through `idb`, not Watchdog. One committed snapshot atomically contains
world state, admitted jobs/cancellation disposition, and material/claim facts.
Continue restores that committed state paused; it does not replay a completed
action or advance the world offline. New Clearing, downloadable backup, migration
and recovery remain the separately directed local-save surface.

A writer must compare its base revision and lose when stale; `Saved` appears only
after the snapshot transaction commits. A failed save preserves the prior
recoverable checkpoint. Periodic autosave may lose changes since its last
successfully committed checkpoint after a crash, so a visible order is not
automatically a durable acknowledgement. Exact snapshot schema and invariants
remain for the promised dedicated design note.

## Later Watchdog target, not current adoption

Watchdog is a strong later server/AI job owner only where one service already
provides its required synchronous SQLite transaction, serialized execution,
liveness answer, and wake/reconciliation capability. Its observed API/lifecycle
is payload-blind durable-row ingestion, claim, cancellation, execution and
claim-token settlement. That is not a pawn scheduler, browser IndexedDB adapter,
current dependency, or replacement for fixed-step simulation jobs.

Watchdog row settlement/interruption recovery does not prove exactly-once external
effects: a disappeared claim may leave a model/tool action ambiguous. A future AI
command therefore still needs domain-level accepted/replayed/rejected receipts,
idempotency where possible, and reconciliation or an explicit outcome-unknown
policy at the owning game authority. Watchdog lifecycle settlement alone is
insufficient.

## Boundary

Keep game command admission, materials, cancellation and world effects in the
owning simulation. Translate a specifically accepted future service action into a
durable payload only at a real server boundary. Do not add Watchdog, SQLite,
liveness probes, wakes, an external executor, or a second scheduler to the
current local browser save.
