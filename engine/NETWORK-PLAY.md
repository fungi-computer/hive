# Responsive online play: source comparison and correction plan

King Bolete, September 10, 2026. Research and source review, not an implemented
networking replacement or measured improvement. Levi reports colony/formations
fail to fetch and survival/raft feel janky and slow. This contradicts acceptable
sustained play despite earlier individual-action acceptance. Repair takes priority.

## What established implementations do

- [Colyseus state synchronization](https://docs.colyseus.io/state): server-owned
  state, client intent messages, initial state then property deltas at a separate
  patch cadence. Adopt the separation; do not replace canonical Rust state with a
  second mutable schema owner merely to use its serializer.
- [Colyseus netcode](https://docs.colyseus.io/netcode) and
  [prediction](https://docs.colyseus.io/netcode/client-prediction): current docs
  describe sequenced inputs and reconciliation. These APIs are version-specific;
  the netcode page describes sponsor-only source access. This study does not
  establish a standalone drop-in package compatible with our DO/Region owner.
- [Gaffer snapshot interpolation](https://gafferongames.com/post/snapshot_interpolation/):
  buffer timestamped observations and render between samples; arrival jitter
  persists even at high send rates. Too little buffering causes starvation.
  Its UDP-specific advice is not directly transplanted into browser WebSockets.
- [Mirror NetworkTransform](https://mirror-networking.gitbook.io/docs/manual/components/network-transform)
  and [snapshot interpolation](https://mirror-networking.gitbook.io/docs/manual/components/network-transform/snapshot-interpolation):
  explicitly relate buffering to send interval and network conditions. Reuse the
  algorithmic lessons; this Unity implementation is not a JS dependency.
- [Gambetta prediction/reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html):
  predict controlled motion, acknowledge processed inputs, rebuild from server
  state and replay unacknowledged inputs. Prediction is disposable presentation,
  never authority for eating, cargo, damage or saved effects.
- [Colyseus reconnect](https://docs.colyseus.io/room/reconnection): retain connection
  identity and listeners, use bounded backoff and explicit rejoin when recovery
  fails. Reconnection is not silently creating a replacement world.
- [Cloudflare WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/):
  DOs support persistent bidirectional connections and hibernation. Hibernation
  discards RAM while preserving connections; attachments reconstruct connection
  metadata. Active recurring simulation events still wake the owner. A socket
  does not make uncommitted state durable or eliminate network latency.

## Current Hive source findings

At2657489, client/connection-choice.js sets pollMs250. runtime/remote-client.ts
schedules the next observation after the preceding request settles, then waits
that interval. Effective sample spacing includes request duration. pump also
waits for an in-flight observation before sending queued intent. Host simulation
has250ms steps. client/interpolation.js defaults to66ms delay; client/client.js
uses that default for both browser and online execution. The buffer clamps to
latest time and marks starvation, then reanchors on another sample. This is a
credible structural cause of stop/start motion, not yet a measured attribution of
all user-visible lag. Increasing the delay alone trades stutter for more latency.

Four fresh curl observations to the real host returned200, roughly0.57–0.62s
including fresh-world startup. They do not reproduce Levi's retained-world
failure or measure warm ticks/frame cost. An earlier urllib probe returned403;
its result was superseded by curl, not counted as four broken worlds.

Failure-path concern for source correction: outer worker fetch returns the
stub.fetch promise inside try without awaiting it; later rejection bypasses that
catch. Region fetch awaits ready before its error/CORS handling. Either can hide
a server failure behind a browser fetch/CORS error. This is source-supported,
not proof of the particular failure Levi saw. Preserve old saves; do not silently
reset them, clear tokens or claim New world fixes the cause.

## Chosen next shape

Keep Rust/GameSession and Region durable mutation ownership. Replace routine
HTTP observation polling with an authenticated DO WebSocket stream through those
same owners. Browser WebSocket authentication needs a bounded admission exchange
or initial auth message, since it cannot set arbitrary Authorization headers;
do not put the long-lived world capability in the URL. Origin checking is not
identity. No world facts before authentication. This auth join must be explicit.

Commands carry existing durable IDs; acceptance receipts and physical completion
remain distinct. A processed-input acknowledgement for prediction must identify
physical processing, not merely command admission. Publish observations after
commit. Reconnect starts from a committed full observation and reconciles pending
command IDs; lost publication is recoverable without repeating physical effects.
Bound per-connection queues and drop superseded visual snapshots under backlog,
not durable results. Do not persist every render frame.

Separate simulation steps, publication cadence and display frames. Evaluate a
10–20Hz active motion/publication target as a proposal, not a performance claim.
Slower needs/jobs need not run at that rate. Do not merely send the same4Hz pose
more frequently. Existing step/durability ownership must remain correct when
cadence changes; inactive regions retain durable wake rules.

For remote units, interpolate buffered server-time samples using arrival jitter
and bounded catch-up; handle teleport/pause/reconnect as discontinuities. For
moving decks, interpolate parent pose and supported local pose consistently,
then compose; avoid independently smoothing incompatible world positions.
Start linear; add velocity-aware interpolation only if visible evidence warrants.

For colony/formation commands: show selection and destination markers immediately;
show accepted/rejected orders explicitly. For direct survival motion: use the
same movement kernel for bounded local prediction and replay unacknowledged
inputs. Never implement another TypeScript movement rule or predict inventory
settlement. Ship destination movement can begin with buffered authority; direct
steering later uses the same controlled-motion mechanism.

## Bounded delivery order

1. Fix observable load/error/reconnect behavior and reproduce retained-world
   failure without deleting user data. Distinguish network, authority, unsupported
   world, server failure; retain diagnostic cause server-side without secrets.
2. One shared connection owner: immediate input delivery and committed push
   observations with existing receipt/retry semantics, replacing polling in all
   four public consumers together. No four game-specific network loops.
3. Correct shared sample buffering and direct-control prediction boundary. Prove
   input sequence handling under delayed/stale replies and no duplicate resources.
4. One sustained public interaction per control style, with controlled delay/jitter
   cases and brief recorded motion. Track input-to-visible response, snapshot gaps,
   starvation, correction distance and server step duration separately. A successful
   click or200response is insufficient playability evidence. Reuse earlier physical
   conservation tests; no historical browser matrix.

Dependency decision: native Cloudflare WebSocket support fits the current host.
Colyseus is a strong reference and candidate only after actual independent module,
license and lifecycle fit is verified. No adoption or full migration is authorized
by this research alone. This correction does not require rewriting the Rust ECS,
art pipeline or game rules. It also cannot promise responsiveness solely from
switching transports: prediction, sampling and server cost all matter.
