# Interlocking runtime failure review

Read-only architecture review, 2026-09-07. This is a lower-level future contract, not an implementation request. It changes no tracked file, current upstairs work, issue, save, test, provider, or deployment.

## Decision in one page

Preserve the current path—typed command → ordered job → claim before movement → activity/process → physical outcome—but give cross-owner changes one explicit transaction boundary.

Brewing should earn the first narrow shared-goods and unattended-process seam. It should not introduce a universal event bus, inventory framework, job DSL, ECS, second scheduler, or whole-world transactional clone.

The durable invariants are:

1. A physical amount has one location/owner at a time; claims reserve it and never duplicate it.
2. A command receipt proves admission or rejection, not eventual job completion.
3. A multi-record outcome commits all touched material, capacity, process, job, receipt, and fact records together.
4. Cancellation preserves completed work and physical custody; each process stage declares what remains recoverable.
5. Every running batch pins the semantic content revision that created it.
6. Knowledge, physical media, practical skill, and effect discovery remain separate records.
7. Effects and AI intentions reach state only through typed domain admission and owning transactions.
8. A region advances only through history it actually knows; missing frontier data stops catch-up honestly.
9. Local and inter-region moves preserve stable IDs and exactly one active owner.

## Actual source constraints and debt

| Finding | Consequence for the next seam |
| --- | --- |
| `Command`/`Job`/`Activity` are closed discriminated unions and current switches are exhaustive ([model](../../src/model.ts#L15-L92), [orders](../../src/orders.ts#L329-L415), [activity](../../src/activity.ts#L366-L393)). | Extend typed owners for a real brew behavior; do not replace them with string callbacks. |
| Admission mutates the clearing in submitted array order and returns only `applied` or `rejected`; applied commands enter volatile tick-stamped history ([orders](../../src/orders.ts#L17-L18), [admission](../../src/orders.ts#L418-L430)). | There is no durable command ID, payload conflict check, receipt, or completion readback yet. |
| Snapshots deliberately omit command history, validate strict schemas/invariants, and restore paused ([snapshot](../../src/persistence.ts#L1729-L1759)). | Existing local autosave is not an idempotent-command ledger. A hosted receipt cannot be promised by reusing `commands`. |
| Wood is an amount in piles/site/cargo; actor-indexed claims reserve it and are excluded from physical totals ([model](../../src/model.ts#L110-L124), [resources](../../src/resources.ts#L8-L49)). | Preserve this conservation law. A future goods claim should not become another scheduler. |
| Mugwort is a separate one-location bundle path with its own actor-indexed storage claim ([model](../../src/model.ts#L134-L143), [claiming](../../src/jobs.ts#L377-L428)). | A third copied grain/yeast/keg path would be real duplication. Brewing earns a narrow mixed-goods path. |
| Shelf availability is currently “no stored bundle and no shelf claim,” and persistence permits one stored bundle per shelf ([jobs](../../src/jobs.ts#L180-L225), [invariants](../../src/persistence.ts#L1450-L1463)). | Mixed shelf contents require a list plus one declared capacity metric and capacity reservations, not another boolean or pack grid. |
| Interruption drops wood cargo and carried herbs, releases their claims, and leaves the job unless cancel removes it ([activity](../../src/activity.ts#L31-L70), [cancel](../../src/orders.ts#L135-L172)). | Keep one explicit disposition for claimed, carried, delivered, transformed, and completed goods. |
| Site completion and save validation consult current `BUILDINGS[site.type]` values ([activity](../../src/activity.ts#L187-L197), [persistence](../../src/persistence.ts#L1472-L1504)). | Mutable recipe semantics can reinterpret old work. Brew batches must pin their semantic recipe revision/resolved plan. Do not broadly retrofit construction before a caller. |
| Material conservation is a current wood-specific equation; harvested-herb conservation is another separate equation ([wood](../../src/persistence.ts#L1508-L1522), [herbs](../../src/persistence.ts#L1634-L1643)). | Brewing needs per-kind/transaction ledgers that can prove inputs, process holdings, sinks, and one output without one giant global equation. |
| Every queued autosave and replacement clones the whole current clearing; `snapshotFor` clones it again ([caller](../../src/main.js#L225-L249), [snapshot](../../src/persistence.ts#L1729-L1737)). | This is appropriate for 15×15. It is not a region-scale write strategy; later authority needs touched-record writes and region snapshots. |
| `Cell` has no space/chunk identity and `Clearing` stores all actors/items/jobs together ([model](../../src/model.ts#L3-L13), [clearing](../../src/model.ts#L159-L194)). | Cross-region or portal transfer is entirely future; do not disguise it as a cell mutation. |
| `assignWork` already batches dirty work, offers candidates to libcolony, then rechecks/claims chosen matches ([assignment](../../src/jobs.ts#L444-L572)). | Keep libcolony as the assignment chooser and claims as resource authority. Add eligible candidates and claim variants, not a reservation scheduler. |

## 1. Transaction and receipt contract

A command planner reads immutable/narrow views and returns a typed plan with expected versions for only the records it touches. It never retains mutable references.

```ts
type CommandKey = { principal: PrincipalId; commandId: CommandId };
type Receipt =
  | { kind: "rejected"; reason: Rejection; observedRevision: Revision }
  | { kind: "admitted"; revision: Revision; jobId?: JobId; processId?: ProcessId }
  | { kind: "conflict"; reason: "command-id-reused-with-different-payload" };

type WritePlan = {
  cause: CommandKey | EventId;
  expected: Record<EntityId, EntityRevision>;
  resourceOps: ResourceOp[];
  claimOps: ClaimOp[];
  transitions: DomainTransition[];
  facts: DomainFact[];
};
```

Authenticate before receipt lookup. Key idempotency by authenticated principal plus command ID; store a canonical payload hash. The same key/body returns the same permitted receipt, while the same key with another body is a conflict. Receipt access still requires authorization so the key cannot disclose another principal's activity.

Admission rejection changes nothing. Admission success may create a job/process and commits its initial receipt once. `waiting`, `assigned`, `working`, `completed`, `canceled`, and `failed` are later job/process facts, not rewrites of the admission receipt.

At admission and commit of an immediate transaction, recheck affected entity versions, claim availability, destination capacity, spatial prerequisites, and the authorization required for that transition. Unrelated world ticks do not invalidate the command. Already-admitted long work follows its stored authority unless an explicit revocation/cancellation policy says otherwise; it is not silently reauthorized every tick. A conflict returns the named changed prerequisite or leaves an accepted job waiting; it does not partially apply.

Within one authority, apply a `WritePlan` atomically to a small write set, validate local/cross-reference balances, persist the new revision with receipt and necessary outbox facts, then publish it. Do not `structuredClone` the whole future world per command.

The local browser contract remains weaker and honest: admission mutates memory and becomes durable only at the next successful snapshot. A future hosted contract may persist admission+receipt atomically; neither should borrow the other's durability wording.

## 2. Facts and phases, without an event bus

The fixed step owns explicit phase order. Plain domain functions return typed plans/facts; they do not call subscribers that synchronously mutate other domains.

Facts such as `BatchStarted`, `DrinkServed`, `TechniqueLearned`, `ClaimInvalidated`, or `ActorArrived` are appended after their state transition commits. Named later phases/cursors may consume each fact once and propose another command/plan. A reaction never runs through an unbounded same-stack chain.

If two effects become due on the same tick, order them by documented phase then stable cause/entity ID. Each later consumer must define whether it observes pre-phase or committed post-phase state. Brewing only needs ordering among accepted cancellation, input transfer, work completion, and fermentation completion; it need not settle global fire/faction rules now.

Command admission at completed tick T remains ordered before T+1 advances, matching the current pause contract. This makes “cancel just before completion” decidable. Do not silently reorder the current activity/growth/assignment phases while introducing the batch owner.

Retain only durable facts with gameplay, audit, catch-up, or handoff consumers. This contract is not event sourcing and does not require storing every tick.

## 3. One physical goods and capacity seam

The first goods model can stay deliberately small:

```ts
type LotLocation =
  | { kind: "ground"; at: Place }
  | { kind: "carried"; actor: ActorId; job: JobId | null }
  | { kind: "stored"; container: ContainerId }
  | { kind: "process"; process: ProcessId };

type ItemLot = {
  id: LotId; item: ItemDefRef; quantity: number;
  location: LotLocation; provenance: Provenance;
};

type GoodsClaim = {
  id: ClaimId; job: JobId; lot: LotId; quantity: number;
  destination: ContainerId | ProcessId;
  sourceRevision: EntityRevision; destinationRevision: EntityRevision;
};

type Container = {
  id: ContainerId; contents: LotId[];
  capacity: number; reservedCapacity: CapacityClaim[];
};
```

One quantity exists in exactly one lot/location. Splitting a lot atomically reduces the source and creates a new provenance-linked lot; merging requires compatible item semantics and preserves bounded provenance. A claim points at stock/capacity and is excluded from physical totals.

The shelf is a simple mixed list. The first brew contract must choose one integer space rule for its actual item kinds. It does not choose weight, bulk, filters, priorities, or backpack geometry for the game.

Pickup atomically converts the stock claim into carried ownership while retaining any destination-capacity promise. Delivery converts carried ownership into stored/process ownership. Failed routing or interruption leaves material at the actor's valid source-region cell and releases/recomputes claims through the resource owner.

Fermentation start atomically consumes the process-held ingredient portions into the batch material ledger. Those portions cannot remain separately available as lots; abort/completion accounts for their material exactly once.

Environmental loss or decay does not freeze behind claims. Its resource transaction debits the affected physical lot, adjusts or invalidates claims that no longer fit, marks work dirty, and supplies a visible job reason in the same commit. Spatial/environment systems may request this mutation; only resource authority changes the lot.

Carried and stored goods can decay only through their declared location owner's rules. A landscape scan cannot delete an actor's cargo or a shelf's lot because it happens to overlap the same cell.

## 4. Cancellation and invalidation matrix

Cancellation is a typed command against current job/process identity. It differs from actor interruption, target invalidation, resource decay, station removal, authority revocation, and completed work.

| State at settlement | Required disposition |
| --- | --- |
| Job waiting; claims not picked up | Remove/cancel the job, release source and capacity claims, preserve every lot. |
| Worker en route with claim | Interrupt activity, release claims, keep job only for interruption; remove it for explicit cancellation. |
| Worker carrying job-bound lot | Drop/return through resource authority at a valid source-space location; never convert it to personal expedition cargo. |
| Ingredient delivered to process but transformation not started | Lot remains process-owned and recoverable. Cancel releases undelivered claims and creates one explicit recover/return disposition. |
| Kettle work partly complete | Preserve work and inputs if merely interrupted. Explicit cancellation chooses the authored recovery path; it cannot restore ingredients already transformed. |
| Fermentation started | No actor job is running. Ordinary job cancellation cannot rewind it. A later `abort-process` behavior must name recoverable output/waste; omit it from the first brew if undecided. |
| Fermentation completes | Atomically mark completion and create exactly one output lot guarded by `outputLotId`; replay observes that ID. |
| Output waiting at station | Storage failure leaves it station-owned. It never disappears because the shelf filled. |
| Station deconstruction requested with held inputs/active batch/output | Smallest safe rule: reject/block with the first named process reason. Recovery/relocation earns a later typed consumer. |
| Resource/environment invalidates a claim | Resource owner adjusts claim and job reason atomically; assignment becomes dirty. The claim does not pause biology. |
| Actor crosses region/portal | Resolve job-bound cargo/claim at the source before transfer; only personal/expedition cargo crosses. |

For same-tick conflict, accepted commands settle in input order before time advances. Later due transitions revalidate. Once a process completion transaction commits, a following cancellation sees `completed`; it cannot remint inputs or erase output.

## 5. Content and save-version contract

Separate presentation revision from semantic simulation revision. Changing a label, icon, or animation need not fork behavior; changing quantities, compatibility, timing, effect operations, or outputs does.

Every admitted long-lived job/process stores a `DefinitionRef { id, semanticVersion }`. It also stores the resolved quantities, condition thresholds, duration/deadline, and output rule needed to finish deterministically. Existing batches never switch to the newest recipe after reload or content update.

The save records a content manifest for referenced semantic versions. Load either resolves the exact immutable definition or applies a documented migration that materializes an equivalent resolved plan. Missing required content yields a recoverable blocked/invalid result; never reinterpret it with a similarly named current definition.

Definitions are schema- and cross-reference-validated once at ingestion: IDs unique, quantities finite/nonnegative, inputs/outputs known, facility and technique references valid, and behavior/effect kind implemented. Trusted tick state uses typed values. No `eval`, arbitrary callback, or mod script enters settlement.

Outputs retain recipe/process revision and input/batch provenance required by a real quality, discovery, trade, or knowledge consumer. Do not retain unbounded ancestral graphs before one exists.

Current v1–v6 save migrations and construction semantics remain intact. Brewing adds the next explicit schema shape; it is not permission to rewrite every historical parser or version every current oak.

## 6. Knowledge, hidden effects, and practical skill

Use separate records:

- `KnowledgeSubject`: versioned technique/recipe/strain/spell fact.
- `LearnedFact`: knower, subject revision, learned tick, evidence/source, confidence if selected.
- `MediaContent`: a physical book/sample/card's referenced subjects and authorship/provenance.
- `PracticalSkill`: actor/institution capability from practice/training.
- `DiscoveryState`: who may see an already-fixed hidden trait/effect.
- `TechnologyEligibility`: explicit breakthrough/tradition gate, separate from possession and skill.

Moving or trading a book changes item custody only. Reading/teaching is work that may create a `LearnedFact`; it does not create skill, tools, materials, or a second book. Information may copy, but its provenance and permissions still have owners.

A mushroom or magical batch receives its hidden effect and semantic version when the authoritative generation rule creates it. Identification changes visibility/knowledge, never the stored batch effect. Cultivation creates a new physical batch with strain provenance; it does not move the original.

Knowledge admission checks the acting person's learned subject, practical prerequisites, facility, and physical inputs separately and reports the first missing condition. Knowing an ID is not authorization to read another actor/faction's fact.

## 7. Typed effect composition

An effect definition is data over a closed operation union, for example `TransferWater`, `AddHeat`, `ApplyCondition`, `RevealSubject`, or `OpenPortal`. Each operation carries resolved units, bounds, targeting rule, cause ID, and semantic version.

The effect owner validates compatibility and budgets, then asks the owning resource/environment/knowledge/space module for a `WritePlan`. It never edits their tables directly. A heat effect debits a defined source if its supernatural rule requires one and credits the shared heat field; a water spell uses the same conserved water transfer as a channel or pump.

Synergy is another typed resolver over committed traits/effects. It returns bounded proposals for a named later phase. Runtime limits cap effect count and cause depth; cause IDs prevent replay. Avoid callbacks such as `onWet -> castHeat -> onSteam -> cast...` and avoid a universal publish/subscribe bus.

Visual glow, smoke, cards, and dialogue read committed effects; they cannot instantiate physics, knowledge, items, or authority.

## 8. AI capability and command boundary

An AI/familiar/faction controller receives a filtered observation containing authority revision, permitted regions/entities/jobs, paged results, and only knowledge its principal may see. It never receives mutable state or an implicit global grant.

A grant records authenticated principal, controller identity, allowed command kinds, actor/party/resource/region scope, issue/revision, expiry/revocation, and decision budget. Personality, relationship, faction role, model provider, and text content cannot widen it.

AI output is a proposal until admitted through the same `CommandKey`, typed intent, target-version checks, and receipt path as human UI. Stale observations cause specific revalidation/conflict, not blind execution or rejection solely because unrelated ticks advanced.

Model/network/storage work happens outside simulation phases. A long model task may be supervised by Watchdog later, but Watchdog claim tokens do not replace game jobs, libcolony, item claims, movement, or fixed time.

Revocation blocks new commands. Already-admitted ordinary work follows one explicit grant policy; safest default is to continue under the authority that admitted it until a separate authorized cancel command settles. Never silently abandon cargo because a model session ended.

The privileged storyteller has a separate event/encounter grant. Faction AI changes reputation or creates consequences only from witnessed/transmitted committed facts, not omniscient access or prose output.

## 9. Region transfer, history, and catch-up frontier

A place is `{ spaceId, globalCell }`; chunk derives from it. Region/chunk is a storage and residency owner, not another position stored on the actor. IDs survive moves.

Within one authority, local region or portal transfer is one transaction: validate source position/permission, settle job-bound claims/cargo at source, ensure destination data and landing are ready, move the same actor, keep eligible actor-owned cargo references, and append one arrival fact. Failure changes neither side.

Cross-authority transfer is later: one durable transfer ID, source escrow/freeze, destination acceptance, and recoverable finalization. Retries return the recorded stage. At every stage exactly one owner may activate the actor/item; timeout or unknown outcome requires reconciliation, never a blind duplicate or rollback.

Each persisted region records:

```ts
type RegionProgress = {
  revision: Revision;
  advancedThroughTick: Tick;
  knownHistoryThroughTick: Tick;   // dependency frontier
  nextDue: DueBoundary[];
  inbound: BoundaryFact[];
  outbound: BoundaryFact[];
};
```

The catch-up target comes from authoritative world time, never client wall time. A region advances only to `min(targetTick, knownHistoryThroughTick)` and only while required neighbor/environment/resource facts are available. If the frontier is behind, persist the cursor and return `needs-data`/`catching-up`; do not guess walkability, water, growth, decay, AI work, or portal outcomes.

History stores meaningful ordered boundaries—weather/season changes, route/opening edits, transfers, disturbances, claims that affect local stock—not every render or fixed tick. Compact history into a validated checkpoint only after all dependent consumer cursors cross it. Cross-region exchanges use one transfer ID and one ledger owner so unload/reload counts them once.

Region persistence is base generation identity/version plus durable edits/state, due work, frontier, and boundary ledgers. Commit dirty state before eviction. Views and atlas/minimap projections may be rebuilt; they are not authoritative copies.

Current local saves intentionally do no offline work. A future host may map elapsed service time to target world ticks, then perform bounded catch-up. It may not insert AI commands retroactively before the observation/admission tick or advance the frontier beyond unfinished batches.

Use per-region snapshots and touched-record transactions as scale grows. Do not clone or validate every world record to change one brew batch, and do not infer success merely because a coarse region can skip stable spans.

## 10. Exact seams the first brew should earn

1. One `ItemLot` path for the selected grain/yeast/flavour/water representation and keg output; construction wood may stay on its current path.
2. One mixed shelf/container with a simple contents list, chosen integer capacity, and atomically reserved remaining space.
3. One `GoodsClaim` claimed through current assignment after libcolony chooses a worker; no alternate scheduler.
4. One process-held input location so delivery removes an ingredient from ground/shelf/cargo exactly once.
5. One `BrewBatch` with stable ID, station, pinned recipe revision/resolved plan, delivered-input ledger, work, stage, `startedAt`, `dueAt`, and optional guarded `outputLotId`.
6. One explicit transaction owner for input transfer, fermentation start, completion/output, cancellation, and station blocking.
7. One fixed-tick due transition that advances while people do other work, but never while paused or offline in the current local save.
8. One strict new save schema/migration and focused invariant set: location exclusivity, lot/claim/capacity totals, station/batch uniqueness, tick order, recipe revision, and one output.
9. One simulation projection for shelf and batch inspectors with the first waiting reason; the HUD stores no duplicate stage.

The first batch should reserve and haul ingredients incrementally; delivered inputs become process-owned. Fermentation begins only after all exact inputs and kettle work settle. Output remains station-owned until an ordinary store/serve transfer succeeds, so a full shelf cannot delete it or block process completion indefinitely.

This seam deliberately excludes crop farming, fluid networks, weight/bulk/filter policy, pack grids, generalized effects, portals, hosted receipts, offline fermentation, distributed transfers, and a content plugin runtime. Those later consumers reuse the proved laws rather than arriving inside the brewery.

## Failure conditions implementers should reject visibly

- The same lot appears on ground and in actor, shelf, batch, caravan, or portal cargo.
- Source claims plus picked-up quantities exceed stock, or stored lots plus capacity claims exceed the selected container capacity.
- A job/process references current recipe data after starting under another semantic revision.
- Cancellation refunds transformed inputs, deletes process-held inputs, or mints a second output.
- Environmental decay freezes forever because stock is claimed, or silently consumes a claim without job invalidation.
- Event subscription/call-stack order changes same-tick outcomes.
- An effect definition calls arbitrary code or directly mutates another owner's state.
- A physical book transfer also grants learned knowledge or practiced skill.
- AI dialogue, model completion, grant expiry, or Watchdog settlement directly edits simulation state or abandons cargo.
- A region crosses its dependency frontier, applies today's rate over unknown history, or compacts history before dependents consume it.
- A portal/region move clones identity or lets source and destination activate the same actor/item.
- Saving one changed region clones or rewrites the entire future world, or a minimap/display cache becomes the recovery source.
