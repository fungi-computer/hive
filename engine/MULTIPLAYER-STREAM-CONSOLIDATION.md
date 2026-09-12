# Multiplayer: one world owner, simple commands, replaceable views

September 12, 2026. Source study and implementation direction under
[Clearing consolidation](CLEARING-CONSOLIDATION-PLAN.md), not a new engine rewrite.
Hive source reviewed at ea63b3f. No runtime change or new performance result is
claimed by this document.

## Decision

Levi's comparison to Shiitake is sound. Clients should connect to an authoritative
world, submit permitted intent, and display its observations. They should not
coordinate world commitment, physical work and socket recovery through scattered
flags. Human players, NPC controllers, saved scripts and Shiitake use the same
world operations with their respective grants.

Keep the existing Rust simulation, Region transaction/receipt owner and coalescing
publisher. Simplify their real callers. Do not introduce a universal event bus,
another command scheduler, a second client queue, or a new replication framework.
HTTP commands plus WebSocket observations are acceptable; two transports do not
require two competing lifecycle owners. Changing both to WebSocket is not itself
a correctness fix.

## What Townies teaches us

Reviewed public revision
[d3b6f8a](https://github.com/Brayden/townies/tree/d3b6f8a2b0845a6321a582f853cbaa1703e6be18).
This is source review, not a claim about its deployed revision or measured capacity.

| Pattern | Hive consequence |
| --- | --- |
| One town DO owns active gameplay; account/directory storage is separate. | Keep a legible authority boundary for the small shared colony. |
| A joining client receives a baseline; later messages update public and personal views. | Reconnection restores a view, without restarting gameplay. |
| Explicit device takeover uses movement epochs. | Separate player/body control from socket presence; opening another tab must not silently fight the first controller. |
| Server checks movement, proximity, supplies and work rewards. | Client animation and optimistic feedback cannot award resources. |
| Built-Worker tests exercise multiple clients and authorization. | Acceptance must include two real participants, not just two renderers. |

Sources: [Town owner](https://github.com/Brayden/townies/blob/d3b6f8a2b0845a6321a582f853cbaa1703e6be18/server/towns/Town.ts),
[realtime](https://github.com/Brayden/townies/blob/d3b6f8a2b0845a6321a582f853cbaa1703e6be18/server/towns/realtime.ts),
[movement control](https://github.com/Brayden/townies/blob/d3b6f8a2b0845a6321a582f853cbaa1703e6be18/db/movementControl.ts),
[multiplayer tests](https://github.com/Brayden/townies/blob/d3b6f8a2b0845a6321a582f853cbaa1703e6be18/tests/town-websockets.mjs).

Do not copy its recovery shortcut: a socket sequence is recorded before execution,
duplicates receive 409, and reconnect rejects pending requests. That cannot recover
the original result after a lost response. Hive's durable command receipts are
worth keeping. Nor should we copy broad `any` patches or an unbounded promise queue.
See [client connection](https://github.com/Brayden/townies/blob/d3b6f8a2b0845a6321a582f853cbaa1703e6be18/app/game/town-connection.ts).

## What Shiitake and Woodstock actually do

Personally read the current Botanical working source under
`/home/levi/src/Botanical-next`; its Git base is 97fd33c, with working changes.
Do not attribute all inspected bytes to that base commit. Source hashes are saved
in `.botanical/consolidation-audit/stream-source-hashes.json` in this worktree.

The public Session API is small: command, read, subscribe, watch and close.
`watch` registers before reading its baseline, then follows changes after that
cursor. This prevents a change from falling between initial load and subscription.
Clients receive bounded updates, or an explicit replacement baseline when history
continuity is unavailable.

Woodstock is not literally a flat, immutable record of every streamed token. Its
current implementation stores a Session entry tree and selected lineage, supports
compaction, and completes a durable streaming placeholder in place. Completed
messages and run terminals are durable; live assistant progress is replaceable.
Public projections have row and byte limits. The implementation currently reads
the selected path before paging; that is not a game-scale storage-cost guarantee.

The process-local observation kernel sends coalesced wake hints. Durable state is
the truth; missed hints can be repaired by reading again. A slow observer gets a
reset instead of an ever-growing backlog. Closing an observer does not cancel
accepted work. Watchdog owns execution state separately; clients receive a status
projection instead of manipulating its queue and claim internals.

Read anchors, relative to Botanical:

- `packages/shiitake/src/client.ts`: SessionSnapshot, SessionFrame, SessionWatch.
- `packages/shiitake/src/internal/coordinator.ts`: subscriptionFrames,
  subscribeSession, watchSession and acceptAndWakeCommand.
- `packages/shiitake/src/internal/observation-kernel.ts`: bounded coalesced hints,
  registration before reads, observer teardown.
- `packages/shiitake/src/internal/woodstock/session-store.ts`: appendSessionEntry,
  completeSessionLeaf, readSelectedPath and transactional command admission.
- `packages/shiitake/src/internal/woodstock/client-projection.ts`: bounded public
  pages, strict-after cursors, compaction horizon and explicit reset.
- `packages/shiitake/src/internal/session-status.ts` and
  `runtime-coordinator.ts`: activity derived from the execution owner.

Borrow these ownership rules. Do not import the private Session/message-tree store
into Hive or pretend it is already a generic world event-store package.

## Hive already has the important durable piece

`src/engine/region/index.ts` dispatches inside the owner's transaction. It checks
principal/command ID and canonical request bytes; a replay returns the stored
receipt. State/record changes and the result commit together. The host owns alarm
work and the disposable native resident. Failed mutation/commit discards the
resident rather than assuming SQLite rolled RAM back.

`engine/src/runtime/region-program.ts` currently saves session metadata and changed
kernel records; its transition returns `events: []`. Therefore current Region
events CANNOT rebuild this game's world. A log of commands alone would also need
the exact ticks, ordering, definitions, randomness and kernel version to reproduce
it. We should not turn a connection cleanup into that persistence rewrite.

Keep current committed records as the restart baseline. If replayable domain events
are later needed, commit those facts through the same owner and prove their actual
consumer. Do not persist every render frame or replay the entire world history on
join. A future checkpoint-plus-event-tail design needs a demonstrated benefit and
bounded restore work; it is not a prerequisite for two people playing together.

The public host already has a bounded coalescing publication request and a
revision-keyed observation cache. Preserve those. Each connection can receive a
complete terrain baseline or a reference to the one already sent. Those references
are useful bandwidth work, but missing references require a fresh baseline.

### Exact current wire behavior

Commands are HTTP POSTs; committed view observations arrive as JSON over WebSocket.
The host schedules 100 ms simulation steps and requests publication after alarms
and commands, with coalescing. This is a configured cadence, not a measured 10 Hz
delivery guarantee. `buildObservation` sends complete projected entity facts
(capped at 512), presentation facts/controls, terrain marks, environmental visuals,
and recent cosmetic cues. These arrays are not change-only deltas.

`terrainWireForRevision` omits terrain and structure surfaces when the connection
already has their revision. It still sends the full projected exterior-water list.
A changed terrain revision sends the complete projected surface arrays again,
even though `TerrainPresentationOwner` already knows which columns changed.
The wire does not carry the whole saved world, hidden kernel state or all solid
underground voxels. It does resend much of the display state, including unchanged
parts. Calling it an efficient event/delta stream would be false.

Relevant source: `engine/src/runtime/observation.ts`, `terrain-wire.ts`,
`terrain-presentation.ts`; `tools/public-engine-host/worker.ts` observationPayload,
sendObservation, commandExclusive and alarm; `protocol.ts` STEP_MS. Payload cost
and contribution to the reported stalls have not been measured by this study.

After the admission/recovery repair, the same observation owner should send keyed
entity changes/removals and changed terrain columns between explicit baselines.
Reuse existing terrain change facts; retain complete baselines for joining and
resynchronization. Coalesce replaceable water/pose updates and avoid retransmitting
unchanged UI definitions. Scope payloads to authorized subscribed space when larger
world consumers arrive. Require measured byte/projection-cost improvement before
claiming a performance win. None of this needs a new durable world event log.

## The complexity that has not earned its place

In `engine/src/runtime/remote-client.ts`, an applied HTTP receipt sets
`awaitRevision`; the next command cannot run until a socket observation reaches
that revision. Yet ordinary requests deliberately omit an implicit expected world
revision. Thus an observation delay can block later independent commands even
after the previous result is known.

The same function coordinates `blocked`, socket/reconnect flags, pending readiness,
retry counters and that revision barrier. Recovery exhaustion leaves the command
path blocked while `send` still accepts more intents up to 16. The UI can then
overwrite its synchronous refusal with a submitted message. This is a concrete
source-supported failure path, not proof of the exact cause of Levi's incident.

The host also has a serial promise chain for exclusive resident access. Exclusive
access is necessary; an unbounded admission backlog is not. Audit and bound that
existing owner before adding another queue. A socket disconnect must not cancel
an accepted physical job, and a slow observer must not hold the simulation open.

Current public host dispatches demo commands as `${pack}-player` after token
admission. That is a shared demo authority, not completed separate player grants.
Townies-style participant/control ownership remains required for actual distinct
players and AI agents. Do not claim account multiplayer from two sockets sharing
the token. Use the existing agreed public customer boundary when implementing it.

## Narrow target for the existing client repair

The following names describe responsibilities, not a new package API:

```ts
// The existing world owner handles commands in authoritative order.
submit(principal, immutableCommand) {
  // Existing host command path owns resident begin/accept/discard and alarm joins;
  // Region inside it checks permission, replays or applies, and stores the result.
  const receipt = existingHostCommand(principal, immutableCommand);
  publisher.markDirty(); // post-commit hint; failure cannot undo the receipt
  return receipt;
}

// A client keeps one disposable view and one command submission owner.
onReceipt(receipt) {
  submissions.settle(receipt.commandId, receipt);
  // Accepted intent may still be waiting for a worker to complete it.
  // Release the next independent command; don't wait for a render frame.
}

onView(frame) {
  if (frame.revision < view.revision) return;
  view.replaceOrApplyChecked(frame); // baseline/reference checks belong here
  renderer.updateTargets(view);      // interpolation doesn't mutate the world
}
```

1. Keep one bounded FIFO for ordinary commands. Local acceptance, known committed
   result and physical job completion are distinct facts. Return typed refusal
   when unavailable/full; don't report submission after refusal. Remove the
   unconditional receipt-to-observation barrier. A command genuinely dependent
   on a prior result expresses that dependency, rather than pausing every command.
2. On an unknown HTTP outcome, retry the exact same ID and bytes against Region.
   Do not require a socket handshake to resolve an HTTP receipt. Exhaustion is an
   explicit uncertain/unavailable state with a recovery action, not false failure
   or silent acceptance of more mutations. Preserve pending identity across a
   disconnect; page reload persistence, if promised, needs its own real proof.
3. Keep one observation baseline and bounded replaceable updates. Reconnect reads
   a fresh authoritative view. Register-before-read/serialized watch avoids the
   join race. Durable replay is useful for facts that must be delivered; ordinary
   poses can skip straight to the latest state. Start with existing full views and
   terrain references, not a new generic patch language.
4. Separate connection state from gesture state and world-work state using closed
   states in their actual owners. UI projects these facts. Camera, selection and
   cutaway remain usable while mutations are unavailable. Don't build one giant
   cross-product state machine.
5. Preserve working direct-control input sequences, acknowledgement/reconciliation
   and remote interpolation in the shared client. High-rate input has different
   coalescing semantics from a paid dig/build command. No new netcode rewrite and
   no optimistic inventory, digging completion or water simulation in the client.

## Keep the feedback loop on the game

This refines milestone 1 of Clearing consolidation. First implement and review the
actual admission/view caller cleanup alongside the already-planned movement/work
repair. Focused laws must show that a withheld view does not block a known command
result, an unknown result reuses its ID, unavailable input is honestly refused,
and a reconnect installs a coherent baseline without cancelling jobs. Confirm
direct-input ordering and current terrain reference recovery still hold.

Then use the existing two-client Colony scenario: dig, haul, full storage, blocked
deep target, other work progresses, recover a route, reconnect. Include one lost
response and one delayed observer. Keep the fixed performance/20-minute finish
line in GAS-REPAIR-PLAN.md. This study adds no historical test matrix and does not
qualify the remaining gameplay, separate-player authority, or capacity by itself.
