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

One DO class can host all four authored examples, each with its own world and
pack identity. Browser-local mode remains available. Before public deployment,
settle the ordinary host's visitor-to-world authorization using the existing
Fungi App/customer boundary; do not borrow Team credentials or expose global
account IDs. Local host qualification can use generated harness principals
without claiming this public join exists. No new public backend deployment is
part of the static four-game release.

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
