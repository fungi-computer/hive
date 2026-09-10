# Durable Object engine authority and local snapshots

## Browser and DO hosts with sleeping regions — September 10

Direct Levi clarification: Hive targets both browser and Durable Object hosts.
Multiplayer remains a primary constraint. The world should feel alive when a
player returns, while avoiding continuous computation for every region ever
visited. This supersedes any reading of the older continuous-world language as
a requirement to keep every region ticking. This is architecture/product
direction; no new host, scheduler, package adoption or backend deployment follows
from this document. [Colyseus research and adoption assessment](colyseus-and-sleeping-world-research.md)
records the current source comparison and the first proposed evaluation.

### One simulation, alternative hosts

Keep simulation rules, deterministic random decisions, jobs, physical quantities,
geometry and supported time advancement independent of the renderer and host.
A browser Worker supplies local authority and storage for local play; a DO
supplies online authority, transactional storage and durable wake. Both expose
the same meaning of commands, committed results and permitted observations.
Rendering, camera, input feedback and interpolation belong to the client.
No online browser may independently settle items, physics or completed work.
A local save is not authenticated multiplayer history; existing anonymous data
remains recoverable without silently importing it into a competitive world.

Spatial simulation regions are distinct from render chunks and stored pages.
Keep tightly interacting terrain, actors, items and fields under one region
owner. Do not split water, gas and work into separate network services. The
first region covers the playable clearing and its supported vertical extent;
do not choose a large-world region size from unmeasured admission limits.
Separate region owners may advance concurrently, but inter-region transfers
still need scoped identities, current boundary admission and one custody record.
There is no global per-tick barrier or atomic transaction across all DOs.

### Four levels of temporal detail

| Situation | Work to perform |
| --- | --- |
| Unvisited, unchanged place | Regenerate pinned base terrain and resolve permitted dated world overlays when requested. Do not instantiate a DO merely because a map overview shows it. |
| Active interaction | Run bounded detailed work where people or agents are acting, or where unresolved effects matter to another active region. Drawing frequency and simulation frequency remain separate. |
| Quiet persisted place | Keep canonical stocks, changes, identities and a settled world-time frontier. Do not keep a tick loop alive. Use supported cheap elapsed-time rules when it is needed again. |
| Due external obligation | Wake only for a meaningful deadline or external request: a caravan arrival, cross-region transfer, or an effect another owner must observe. Internal crop readiness can wait until read if nothing else depends on it. |

Computational sleep is not game pause. An online world can accumulate elapsed
game time while its DO is absent; a paused local game need not do so. The host
owns time policy, not a browser timestamp. Multiplayer player departure, closing
a menu, disconnected sockets and process eviction are different events. A remote
player, agent, active export or other meaningful dependency may keep relevant
work active even with no local camera. None requires waking all neighboring
regions recursively.

### Catch up supported behavior, not missed frames

An elapsed-time operation starts from a committed frontier and ends at the next
relevant condition change or host-selected target, whichever comes first. Store
the attained frontier with resulting state. A retry cannot spend the same time,
inputs or output capacity twice. Later player edits cannot be applied retroactively
to time before their committed order. Large gaps are processed with bounded
event/quantity work, not `advanceTicks(elapsedSeconds * 20)` in a constructor.

* Plants, aging and food spoilage can evaluate accumulated growth or threshold
  times under recorded conditions. Weather, water supply and season changes split
  intervals; eight real hours never implies eight hours of ideal growing weather.
* A paid fermentation batch may reach its next phase using its actual finite
  inputs and recipe conditions. An attended phase cannot manufacture labor while
  asleep. Repeated crafting needs a declared offline work budget, real resources,
  worker capacity and output capacity; each worker's time is allocated once.
* Quiet water uses accounted basin/soil stores and cheap flow rules where supported;
  quiet gas uses connected room volumes and bounded ventilation/cooling. Changing
  connectivity, unknown forcing or an actively contested boundary requires more
  detail. Do not teleport water through solids, reset sealed smoke to ambient or
  refill a drained lake. Condensed and detailed models partition the same stock.
* Population, regrowth and background activity may use bounded aggregate rules.
  Named actors, unique items, player construction, extinction and established
  relationships persist. Cosmetic wandering can be created for presentation;
  actual births, deaths, stock and material changes need game-owned outcomes.
* Combat, spreading hazards and connected physical chains cannot all be replaced
  by a universal elapsed-time formula. Keep a bounded active resolution, define
  an explicit coarse rule, or mark the unsupported process suspended. Never claim
  physical history the chosen model did not establish.

Cheap approximation is explicitly permitted. Invariants still include unique
custody, nonnegative/capacity-bounded stocks, finite inputs and consistent history.
Detailed and coarse modes need not produce identical trajectories. They need
declared tolerances and coherent endpoints. Fixed logical event boundaries and
saved remainders should prevent repeated sleep/wake from becoming extra production
or erasing danger. The engine composes supported process handlers over the same
owners; it does not add a second offline inventory or arbitrary saved callbacks.

Cross-region incoming actions must first settle the receiving region to the
relevant causal frontier. A stale sleeping border cannot grant new water, accept
goods into a full store, or authorize passage through a changed wall. Transfers
pending delivery retain custody and durable retry; sleeping internal details do
not justify a transfer that is forgotten until a player logs in.

### Durable sleep and practical acceptance

Persist canonical state, model/content version, time frontier, required schedules,
resource commitments, region generation and pending transfer/replay facts before
publishing them. Derived queries, render data and patch encoders are disposable.
Do not depend on an unload/dispose callback to save. DOs can discard memory and
restart without such a callback. [Cloudflare lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

The host's durable wake owner must arrange the earliest externally necessary event.
No blanket recurring alarm is required for every dormant field or plant. DO
alarms can be delivered more than once, so advancing a time interval and settling
its obligation must remain replay-safe. [Alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/).
The current Goblin proof host has no autonomous alarm join; this paragraph is a
required host behavior, not a claim that it already exists.

First proposed catch-up consumer: leave one paid passive brew and a planted crop,
close the region, then reopen after an authored elapsed interval. It should show
plausible progress with finite inputs and no missed-tick replay. A duplicate
reopen must not produce another output. One receiving-region transfer checks that
external obligations are not lost through sleep. This is a later bounded
qualification, not a new test launch or a promise that offline policy is implemented.
Whether unattended settlements can suffer severe losses, and which work players
may automate while absent, remains game-policy tuning; it is not settled by
choosing DOs or a networking library.

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

## Account-bound Goblin entry — agreed peer boundary, September 9

This is a planning response to Botanical's existing
`issues/marketing-launch/08-connect-fungi-accounts-to-goblin.md`, not an account
writer, backend launch or replacement for the active physical work. The game
source trace is retained at ignored generated-room
`.botanical/generated-room/ACCOUNTS-SOURCE-TRACE.md`. Its Hive anchors were read
at4f45e24; its Botanical reads came from the retained dirty97fd33c root and must
not be mistaken for current accepted App-host availability. Botanical owns that
current capability comparison.

Current Hive `main.js` owns browser simulation and periodically writes the one
`hive-local-world/world/current` IndexedDB slot. That slot has no account or
world principal. The local Goblin DO harness has one constant DO name and proof
secrets; it is not an authenticated customer game service. The engine Region
already owns durable state/revision/event/receipt, but intentionally trusts the
host to construct its principal. Its full checkpoint/debug read is not a player
observation. The existing public Mycelium consumer captures a host-selected
principal and actor but its rest/dig observation is narrower than the full HUD.

The agreed first product boundary is one private clearing owned by its signed-in
player. Botanical supplies an **opaque, pairwise App-scoped customer identity**
through its public App authority path. Global user IDs, personal Teams, game
parties and pawns are different facts; none substitutes for that customer
authority. The customer-to-permitted-world relation and stable role/body grant
belong to the game host. Better Auth remains Botanical's identity owner.

This uses Botanical's existing
`wiki/3-resources/decisions/adr-app-platform-and-joint-ui-backend-contracts-v1.md`
(public customer identity) and
`adr-app-instance-runtime-identity-and-lifecycle-v1.md` (Instance identity).
The public App runtime remains **Deployment-owned**. Player/world ownership is
game data inside that runtime, not a new account-owned App Instance kind or an
invented shared Team Installation. Do not expose global user IDs to App code,
invent a privileged Hub endpoint or accept a client-selected owner. A separate
game-origin page cannot rely on Hub's host-only cookie.

That host must authorize startup/read, command, receipt replay and reopen for
the requested world, then route to its existing Region/DO owner. Use stable
host-constructed principals rather than growing the proof harness's global
`goblin-player` role into multiplayer identity. Reads must expose the entitled
player view; world knowledge and debug grants still apply. In account mode the
browser becomes a projection/command client and stops independently advancing
or confirming that server-owned world. Rebuildable local caches must be keyed
by the selected App customer and world and cannot authenticate access. This work
reuses the existing engine command/receipt boundary and durable wake contract.

Preserve anonymous `world/current` bytes unassociated and unchanged across
login and account switches. Signing into another account must never adopt,
upload, overwrite or display that local clearing as the new account's world.
Keep raw download/recovery available. Any future import is an explicit action
into a separately created private world, validated with the supported game
codec, idempotently acknowledged before changing local bytes. Older unsupported
formats remain raw recovery data; this proposal does not add a migration shim.
An anonymous snapshot proves no earned multiplayer history, so do not import it
into a shared economy or overwrite an existing account world by default.

First joint acceptance should demonstrate two accounts on the same browser:
owned-world startup, cross-account read/command/replay denial, sign-out removal
of access, lost-ack retry and exact DO reopen, while the anonymous local bytes
remain intact. Botanical's September 9 source comparison identifies the current
implementation gap: accepted e5 authenticates the actor for Team/Notes admission
but sends no player subject to the backend. Current Agar/Media work captures
Computer-operation authority but rejects backend Instances and supplies no
public customer/world entry. These are peer-reported current-source limits,
not conclusions from the older retained-root trace above.

Therefore qualify generic public App/customer admission and its actual browser
and backend caller before connecting Goblin. The authority choice is settled;
the producer is not accepted yet. Botanical owns that host capability under
issue08; Game CTO owns world membership, projections and game integration.
This decision authorizes no game identity/backend writer or heavy run, and does
not displace field-water work. No new identity database or custom agent protocol
is required.
