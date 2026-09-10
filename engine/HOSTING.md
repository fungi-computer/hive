# Shared client to durable worlds

King Bolete · September 10 · next source boundary after the four-game release.

The live d3b914a client uses `runtime/browser-client.ts`: its interval sends
`step` to a local Worker. That is valid local authority. It must not become the
online clock. `runtime/region-program.ts` already separates player commands from
host-only step and rebuilds a detached candidate for each committed operation.
`tools/fresh-engine-do` proves this with actual native SQLite restart/replay.
It is a protected test host, not a public game service.

## Reuse and changes

Keep `RuntimeConnection`'s send/subscribe/dispose shape and the shared client.
Rename transport-neutral command/event types out of `worker.ts` when adding the
second consumer; do not duplicate them. Local mode keeps Worker ownership.
Online mode forwards admitted intent, observes committed frames and never runs a
second GameSession. Client interpolation stays cosmetic.

The server chooses the immutable game pack and owns world identity, revision,
clock and reset/restore permission. Never forward browser `step`, arbitrary pack
bytes, proof secrets or the harness fault endpoint. A browser save is an export,
not permission to overwrite someone else's world. The online Continue operation
reopens the authorized world; local Continue continues to restore local saves.
Expose that semantic difference honestly in the shared UI.

Initial server implementation should use the existing Region commit owner and
GameSession, not WorkerRuntime plus a second independent mutable world. Produce
render and presentation facts from the committed session through one bounded
projection owner. A failed commit cannot publish candidate frames. Keep a
rebuildable projection cache by committed revision; invalidate on commit failure.

Store command identity and its exact payload before acknowledging admission.
A connection retry reuses that identity, never creates a new physical command.
Revision conflict refreshes observations; it does not silently reissue a command
with a different expected revision. Server-produced frame sequence and epoch
must survive reconnect interpretation without making old packets look fresh.

## Clock and sleep

Only the host admits step. While active, schedule bounded fixed steps and cap
catch-up; do not turn every render frame into a SQLite transaction. Select the
actual batching interval from a measured moving fixture. The durable wake and
next due work must share the owner transaction; an in-memory timer alone cannot
acknowledge future work. Sleeping and explicit pause remain distinct. No global
tick barrier, infinite catch-up, or million-player capacity claim follows.

## First online consumer and authority

Levi explicitly authorized public DO demos on September 10. All four public
examples will use the same DO host and Rust/WASM simulation, with a separate
private world per example and browser-held random bearer capability. The browser
owns controls and rendering; the server owns time, state and command receipts.
Browser-local execution remains an explicit option. This anonymous demo capability
is not a Fungi account or the future App/customer join; no Team credentials or
global account IDs are borrowed. Reopening with the same capability resumes the
same world. New world generates a new capability rather than resetting another
world. The host stops advancing abandoned worlds after its bounded activity lease.

The public host and remote client are implemented locally. Native public-host
restart qualification and hosted publication remain outstanding; the live
8f4042d release still runs in browser Workers. The earlier static-only deployment
boundary is superseded by Levi's explicit public DO instruction.

Acceptance: two connections observing one authorized world see the same commit;
an unauthorized connection cannot read/reset it; a lost response replays its
receipt; restart resumes bounded host time without duplicate material effects;
shared controls render actual committed frames. The current u5008 proves native
restart/replay for the raft, not this complete networked-client outcome.

## Clock receipt boundary found in current source

`src/engine/region/index.ts` defaults to 4096 retained receipts and refuses new
commands once full; it has no pruning API. At 30 steps/second this is about
136 seconds before other commands are counted. The local native witness is
bounded and valid, but naively connecting the browser cadence to Region.dispatch
is not a viable persistent host. Raising the cap only postpones exhaustion.

Host advancement needs a durable monotonic frontier (the committed scheduled
occurrence/tick range) in the same transaction as world state and re-armed wake.
Retry of an already-covered range observes that frontier and cannot repeat it.
Player command receipts remain separate and need an explicit bounded replay
retention protocol before general long-running public play. Do not silently
remove receipts and allow an old command ID to execute again. This is a required
host design correction, not a reason to change the proven small-world simulation
or claim the current proof host is production-ready.

### First clock implementation boundary

Reuse the current `RegionProgram` parse/authorize/execute and state/event commit
path. Do not implement another SQL world writer. Add a bounded host-owned
ordered occurrence stream at that owner: one registered clock principal, next
sequence, last canonical request and last result. Its storage is constant-size.
The previous sequence with identical bytes can return its receipt; conflicting
bytes reject. Older sequences reject as retired and never execute. Gaps reject.
A caller observing a retired occurrence refreshes the committed clock frontier;
it does not mint a replacement occurrence. Ordinary player command receipts keep
their existing semantics until a separate explicit retention contract is joined.

An occurrence contains a bounded range of fixed simulation steps. Its application,
frontier update and next durable wake commit together. Native alarms can repeat
the occurrence after interruption; they cannot choose a new sequence solely
because a process restarted. If the commit fails, the detached session is dropped.
Extract the shared existing commit responsibility before adding this caller, so
receipt/event/storage limits still have one enforcement path. Qualify unchanged
frontier on fault, same-occurrence replay, retired-occurrence rejection and two
consecutive ranges with no skipped or duplicated physical steps. No live clock
implementation or storage-format change has landed from this plan.

### Host wake join: source review checkpoint

The current `tools/fresh-engine-do/worker.ts` has `fetch` only. Its native
restart proofs do not establish request-free advancement. The new ordered
occurrence owner is also not an alarm implementation by itself.

Botanical's current `packages/shiitake/src/cloudflare.ts` supplies the relevant
host pattern: storage transaction encloses mutation and alarm arming, followed
by reconciliation; failed reconciliation retains a wake. Hive must qualify that
composition with its synchronous Region transaction on actual native storage,
not assume SQLite rollback also restores a mutated WASM instance. The current
session program already creates and disposes a detached WASM candidate.

The next host slice must retain a due occurrence (sequence, exact request and
scheduled deadline) durably before execution. Its successful Region settlement,
replacement due occurrence and alarm re-arm must form one native commit. A
restarted alarm reads that record; it never creates a new command ID to repair an
unknown result. Player input racing the captured expected revision may reject
that occurrence. The host records that rejection, reads current state and prepares
the next occurrence; it must not silently rewrite the rejected occurrence's bytes.

Start with one active world and a bounded fixed-step range. Pause cancels future
advancement through the same owner; resume installs due work and its wake before
acknowledgement. No real-time catch-up claim follows until its bounded policy is
implemented. A source reader must trace nesting/rollback of the async native
storage transaction around the synchronous Region transaction before launching
the witness. If unsupported, recut the host transaction boundary explicitly;
do not add a post-commit alarm and call the crash gap solved.

The first native witness must stop the owned runtime after durable admission,
restart without sending a game request, and observe the alarm's committed result.
Repeat around lost acknowledgement and assert one physical advancement, retained
next wake and finite goods. The existing generated-principal proof host remains
the test consumer. Public customer authorization and publication remain separate.

Current official host reference checked September10:
https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
confirms direct SQLite operations participate in an enclosing asynchronous storage
transaction, while transactionSync callbacks must remain synchronous. The intended
host joins Region's synchronous dispatch, durable next occurrence and awaited
setAlarm inside that outer transaction. This is documented API fit; the actual
nested native rollback/wake witness is still required. Alarm retries are finite,
and reconstruction must preserve an existing pending alarm rather than overwrite
its deadline: https://developers.cloudflare.com/durable-objects/api/alarms/ .

### Public host packaging checkpoint

`tools/public-engine-host/prepare.mjs <output> <frontend-origin>` creates an
ignored deployment configuration and a SHA256 inventory over engine source,
Region source, the host and generated WASM. It does not install dependencies or
publish. The immutable hash becomes the Region program identity; unsupported
old-world versions require New world under the clean-break policy.

September 10: u5065 (`wrangler deploy --dry-run`) exited 0 and its owned scope
closed. The actual host packages at 1726.74 KiB / 410.23 KiB gzip with the
PublicEngineRegion SQLite binding. This proves packaging, not hosted operation.
The reviewed host reads committed state from SQLite and disposes detached WASM
candidates; no authoritative RAM state survives an outer transaction failure.
Native public-host restart evidence remains pending.
