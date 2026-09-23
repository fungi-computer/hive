# Durable region transactions

`openRegion` is the headless transaction owner for one bounded region on a native
SQLite host. Its first consumer is the original quarry program in
`world-presets/excavation-region.ts`, which composes the same voxel and material
owners used by the other engine consumers. The region module has no quarry,
Goblin, renderer, Cloudflare, Watchdog or model-provider dependency.

```ts
const region = openRegion({
  owner: {
    sql: ctx.storage.sql,
    transactionSync: (operation) => ctx.storage.transactionSync(operation),
  },
  region: "my-region",
  program: registeredProgram,
});
const receipt = region.dispatch(authenticatedPrincipal, {
  id: stableCommandId,
  expectedRevision,
  command: checkedContentCommand,
});
```

The host supplies a native synchronous transaction and SQL cursor materialization;
it authenticates and binds the principal before dispatch. A registered program
supplies initial state, pure state/command parsers, authorization and a synchronous
transition. These are trusted compiled functions, never executable saved data.
The program ID must change with its state or command meaning. Game definitions
determine whether tungsten can be dug and what a removed cell produces.

## Ownership and laws

- One transaction stores the candidate state, revision, scoped command result
  and ordered events. The program must include all of its coupled physical and
  work facts in that state; mutating an external game object bypasses this law.
- No canonical world object remains in the region closure. Authorization receives
  disposable values; execution receives a separately reconstructed candidate.
  Rejection or SQL failure discards it. SQLite rollback never pretends to undo
  an already published JavaScript mutation.
- The stable replay identity is region + authenticated principal + command ID.
  The complete parsed command and expected revision define its checked input.
  Retrying identical input returns its stored result; reusing the ID with different
  checked input conflicts. Replay precedes current action eligibility, since
  successful work can make its original action ineligible. Host authentication
  and revocation checks remain required before access to a principal's receipts.
- A stale expected revision or domain rejection has a durable rejected receipt.
  Malformed input, forbidden new actions, capacity and infrastructure errors do
  not claim an accepted effect. Concurrent expected-revision commands cannot both
  apply to the same revision.
- Events commit with state and have stable IDs and an increasing sequence.
  `readEvents(after, limit)` materializes a bounded page. An event is committed
  history, not proof of delivery to a receiver. Required delivery, receiver
  deduplication, acknowledgment and durable wake are separate host obligations.
- `readCommitted()` and `readEvents()` are detached trusted-host reads. They do
  not implement a player's fog of war, developer grant or an AI observation API.

## Explicit finite limits

Normalized limits are persisted with the region identity and checked on reopen.
Default and explicitly equivalent options agree; changing policy silently does
not. Versioned policy/state migration is a later explicit operation.

| Limit | Default | Maximum configurable value |
| --- | ---: | ---: |
| Encoded state | 256 KiB | 4 MiB |
| Checked command, result envelope, individual event envelope | 8 KiB each | 64 KiB each |
| Retained command receipts | 4,096 | 65,536 |
| Retained events | 4,096 | 65,536 |
| Aggregate accounted payload | 8 MiB | 64 MiB |

One transition emits at most 32 events; a read page contains at most 128.
The codec rejects non-data objects, accessors, sparse arrays, non-finite numbers,
excess depth and excess node count. Canonical keys use stable lexical ordering.

Accounted payload includes encoded state, receipt inputs/results/identities and
event envelopes. SQLite pages, indexes and fixed metadata have overhead beyond
that budget. These are admission limits, not measured performance claims.
There is currently no pruning or receipt expiry: new work fails when retention
fills, while existing retries remain recoverable. Production retention requires
an explicit delivery/replay policy before raising this consumer's capacity.

## Current proof and remaining join

`region.test.js` exercises nine laws using native Node SQLite, including rollback
after a real receipt insertion, policy drift, detached authorization, replay,
conservation and aggregate capacity. `tools/engine-do` is an isolated local
Wrangler/SQLite DO consumer of the same modules. Its proof injects rollback after
state/event writes, returns a failed acknowledgment after durable commit, kills
its own runtime twice and reopens the same SQLite data. It checks exact state,
events, scoped replay and one-winner concurrent admission.

The quarry directly excavates and produces surface spoil with a fixed tick of
zero. It does not implement Goblin pawn work, clock advancement, deep navigation,
water or air. Goblin's terrain/material/job/tick mutation must join this boundary
together; wrapping only its terrain snapshot would leave a torn game state.
Host Watchdog integration, request-free durable wake and exhausted-retry repair
remain next proof work. A passed local DO trace is not a hosted game backend or
completion of the Hive engine.
