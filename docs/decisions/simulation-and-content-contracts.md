# Simulation, content and work contracts

Status: Game CTO implementation direction, 2026-09-07. Companion to `architecture-implementation-plan.md`. Future names and pseudocode are contracts, not a request to prebuild every module. Current tiny-map runtime keeps its single simulation owner, actual libcolony optimizer, Jotai display/selection, XState gestures, boundary Zod and original art pipeline. No ECS, Effect conversion, second scheduler or general plugin engine is selected by this plan.

The [storyteller role](rimworld-storyteller-role-20260908.md) remains a future
game-owned incident director. Paid AI account/autoplay is separate; model output
cannot mutate time or bypass authoritative admission.

## Evidence and the first consumer

Current `model.ts` has closed command/job/activity unions; `orders.ts:admitCommands` is the admission seam; `clearing.ts:step` admits before the pause return. `jobs.ts:assignWork` is guarded by workDirty and calls the selected optimizer after constructing candidates. `resources.ts` and herb storage handle commodity-specific custody. `persistence.ts` validates schemas plus substantial relational invariants; it is a real complexity hotspot. Existing display projections are not authoritative world objects.

Brewing earns the next extraction: one recipe consumes finite inputs, uses shared work and storage, then runs an unattended process with one physical output. It must avoid a third copy of the wood/herb claim-carry-store implementation. Read the actual brewery readiness contract before assigning runtime; input acquisition, quantities and exact apparatus remain Delivery's bounded recipe decision. Do not implement all future workshop verbs first.

## Facts, decisions and views

Authoritative records answer what exists, where it is, what has happened, and which obligations are live. Decisions select a next legal transition from those facts. Views render/query them. Keep mutable references inside the owning simulation; UI or tool clients receive immutable projections with relevant revisions.

| Record/owner         | Durable truth                                                                 | Derived examples                       |
| -------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| Entity identity      | Instance ID, creation cause, definition/version, appearance/name sampled once | Roster labels, portraits               |
| Goods                | Lot/item amount, traits, condition and one physical location                  | Shelf list, inventory count, cargo art |
| Capacity/claims      | Concrete reserved inputs/capacity tied to an owning work obligation           | Availability, first waiting reason     |
| Work                 | Requested outcome, scope, policy priority, assignment/current step            | Offered candidates, queue UI           |
| Processes            | Stage/progress, recipe/version, held-input references, completion identity    | Remaining time, progress bar           |
| Knowledge            | Learned propositions/techniques, evidence/provenance                          | Available recipes, study suggestions   |
| Relations            | Membership, witnessed reputation, commitments, grants                         | Guest mood, recruit option             |
| Topology/environment | Current geometry/openings/quantities and their revisions                      | Walkability queries, cutaway, overlays |

Do not introduce a generic Entity with hundreds of optional flags. Use discriminated records and small components where multiple concrete consumers need them. Arrays/maps remain acceptable for small populations; a data-oriented representation is chosen per measured query. A shared identity does not imply one universal object layout.

## Content definitions are versioned data

```ts
type RecipeDef = {
  id: DefinitionId;
  semanticVersion: number;
  stationKind: StationKind;
  learnedTechnique?: TechniqueRef;
  inputs: readonly IngredientRequirement[];
  behavior: "ferment"; // first implemented process only
  work: WorkRequirement;
  process: FermentationParameters;
  output: OutputDefinition;
};
// Presentation definitions separately map recipe IDs to icon/pose + asset revision.
type Batch = {
  id: BatchId;
  recipe: DefinitionRef;
  plan: ResolvedEssentialPlan;
  state: BatchState;
  completionKey: CompletionKey;
};
type BatchState =
  | { kind: "staging"; vessel: ContainerId; inputs: readonly LotPortionRef[] }
  | {
      kind: "running";
      vessel: ContainerId;
      material: TransformationLedger;
      progress: Progress;
    }
  | { kind: "ready"; vessel: ContainerId; outputLot: ItemId };
```

Parse untrusted saves, commands, tool arguments and content at boundaries. Validate ID uniqueness, referenced definitions/assets/poses, numeric ranges/units, supported behaviors and forbidden dependency-cycle classes there; ordinary mutual relationships are not forbidden cycles. Compile validated content into typed runtime tables. A recipe addition can be an asset/config addition when its behavior already exists. A new behavior adds an exhaustive handler and focused outcome proof. No eval, arbitrary JavaScript callbacks or string whitelist that merely pretends to validate a rich command.

An in-flight batch pins its semantic recipe/behavior version and resolved essential plan: amounts, rate/duration, thresholds, output rule and rolled modifiers. The save must include or immutably resolve the needed semantic content. Updating a definition must retain that version or migrate the batch explicitly; it must not change costs halfway through work. Asset/icon/pose revisions are separate and do not fork batch semantics. The same applies to mushroom strains, spells and procedural gear. Human-friendly names can change without changing IDs. Cairn integration follows its actual reviewed API; names never substitute for identity.

A future mod package declares namespaced definitions, dependencies and compatibility versions. Trusted bundled extensions can implement typed handlers with narrow owner capabilities. Player-supplied executable mods require an actual isolation/resource/permission design later; accepting JSON does not imply arbitrary code is safe, and separate worlds with incompatible rules cannot freely trade items without a compatibility decision. No hot-loading an arrest handler while an unresolved custody operation is halfway committed.

## Physical goods and containers

One item/lot owns its physical location. Shelf lists, character inventory and workstation displays derive their contents from that relation. A container does not keep a second independently mutable item array.

```ts
type ItemLocation =
  | { kind: "ground"; at: Place }
  | { kind: "contained"; container: ContainerId; position: ContainerPosition };
// Actor hands/equipment, shelf space, a vessel or backpack may be containers.
// Introduce only the ground/hand/shelf/vessel positions the first consumer needs.

type GoodsLot = {
  id: ItemId;
  definition: DefinitionRef;
  quantity: Quantity;
  traits: LotTraits;
  location: ItemLocation;
};
```

Quantity carries its base unit. Count, mass and volume are different; concentration is a derived ratio/trait over tracked amounts, not another additive inventory unit. Use integer/fixed units plus explicit remainders where fractional change is needed. Check overflow before adoption of a dense integer format. Quality/contamination/strain differences prevent inappropriate merging. Splitting produces an identified new portion with provenance and a balanced quantity change; merging retains defined identity history and cannot erase a known strain or claim. Explicit physical references must be retargeted or forbid merging while reserved.

The first shelf derives a mixed simple list and uses one selected integer capacity measure. Optional grouping, filters, weight/bulk and a backpack's later rotated grid need their own consumers; they are distinct policies over the same custody. Held logs are separate from pack storage. Equipment occupies named slots and may provide a container, such as a belt/backpack. Unequipping a full pack transfers the same container and contents or rejects for a stated reason; it cannot delete or spill an arbitrary duplicate list. Nested containers need cycle rejection, bounded nesting and an explicit capacity/mass aggregation rule before introduction.

Capacity reservations account for actual incoming portions and already stored contents. Weight is not automatically the right limit for every shelf; initial bulk/count policy is a gameplay decision. Capacity does not make uncarriable mass carryable. Containers with liquids also need explicit mixing/transfer rules; a keg, a potion and floor liquid share resource quantities without requiring the first brewery to solve regional fluid dynamics.

## Claims promise; they do not move or preserve matter

A claim refers to exact source portions, destination capacity and its owner job/step/actor when assigned. Source availability is quantity minus valid reservations. Location remains on the lot. Each selected haul atomically reserves its concrete source portion and destination capacity or changes nothing. Multiple haul transactions can accumulate ingredients; only fermentation start requires all exact inputs present together. A job may exist waiting for inputs; that waiting job does not reserve nonexistent stock.

Acquire competing claims through the one authority in deterministic order. Candidate optimizer results are proposals: revalidate source/capacity and path constraints at assignment. A lost conflict returns a named waiting/dirty outcome; it cannot yield negative stock. Reserve enough to make the current step safe, not every future ingredient in a five-year plan. Claim expiry/reassignment is an explicit simulation transition, not wall-clock cleanup by another worker.

Cancellation, Draft, death later, path loss, deconstruction and disconnect have separate meanings. Existing Draft can interrupt work without cancelling the shared job. Drop/release through one owned interruption path, keeping the same material and no claim stranded. Pausing stops simulation advancement but not authorized planning commands. An AI connection disappearing does not inherently drop a pawn's physical cargo or cancel all standing orders.

Decay, contamination and destruction can change claimed stock. They must atomically invalidate or adjust affected claims and wake the requesting job. Claims do not make food immortal. A deconstructed shelf ejects its actual contents through resource custody; it does not redraw hidden duplicates. Distinguish unspent-input refund from transformed material and authored salvage.

## Work and unattended processes

Use the existing typed activity model and bounded work steps. A first fermentation chain is:

```text
order → waiting for exact inputs/capacity → reserve → haul
      → preparation work → process running → output waiting/available → complete
```

These are explanatory stages, not a requirement for a universal workflow graph. First-brew decision: staged ingredient lots are physically contained by the station's real vessel. At fermentation start, those live portions are atomically consumed into the running batch's quantity/provenance ledger; they cease to be separately available lots. That ledger is physically bound to the same vessel and counted once. The worker is released. Completion turns the ledger into exactly one output lot in that vessel, marks the batch ready and does not depend on an external shelf. Later store/serve work transfers it through ordinary custody. If a portable keg is required, its container/packaging is a real finite input or existing vessel, not wood conjured by fermentation.

The first station blocks deconstruction while it contains staged inputs, a running batch or output. Empty it through ordinary transfers first. Explicit abort/recovery can be a later supported behavior. Stage laws: unpicked claims release; carried goods drop/return through resource custody; delivered untransformed lots remain recoverable; a transformed ledger cannot refund original ingredients; ordinary job cancellation cannot rewind fermentation; completed output remains physical. Draft interrupts a worker, while fermentation continues on the current world clock. An abort must define balanced waste/recovery before it can be exposed.

Persist enough stage-specific facts to resolve interruption. Forbid impossible combinations such as a running batch with neither input custody nor consumption disposition, two outputs sharing one completion identity, or a cancelled step retaining a live claim. A discriminated `BatchState` excludes invalid fields at compile time; boundary relational validation checks references and balances at load.

```ts
function completeFerment(tx, batchId) {
  const batch = tx.processes.requireDue(batchId);
  if (tx.processes.wasSettled(batch.completionKey)) return;
  tx.processes.requireRunningLedger(batch);
  const vessel = tx.capacity.requireReservedBatchVessel(batch);
  const outputLot = tx.goods.settleRecipeTransformation(batch, vessel);
  tx.processes.markReadyOnce(batch.completionKey, outputLot.id);
  tx.work.releaseObligations(batch);
}
```

`tx` stages touched records under explicit owner APIs; it is not a whole-world clone or a new general transaction library mandate. Failure leaves old authoritative facts intact. Success settles input/output/claims/process result together. On the current local prototype it becomes crash-durable at the next committed snapshot; future hosted completion persists state plus completion status/fact. It does not rewrite the immutable admission receipt for the original order.

Temperature-dependent progress later needs accumulated condition history or event intervals. A single completion timestamp is sufficient only for a process whose rate truly stays fixed. If a process rate changes, integrate to the change tick first, update the rate, then compute the new due work. Do not multiply time away by the greenhouse temperature at return.

## Commands, receipts and phase order

Separate command admission from eventual job completion. `EnqueueCraft` can return an accepted job ID while its materials are still missing. Retry returns that same receipt/job, not a second order. Rejected and needs-data outcomes are explicit; the handler specifies whether any waiting order was durably created. UI and AI must not guess from a disabled button.

Authenticate first. Scope idempotency to world and principal plus command ID, bind it to the canonical payload, and reject a changed payload under the same ID. Read a prior receipt only through that principal's authorization. Immediate player/AI actions validate grants at admission/commit; admitted delayed work follows its stored authority unless an explicit revocation/cancel policy says otherwise. Environmental transitions may have no principal grant and validate their typed physical preconditions. Keep receipts/tombstones for the replay window or use monotonic client sequence watermarks; deleting all receipts and accepting an ancient command as new breaks deduplication.

An authority transaction owns ordered commands and narrow read versions. A stale UI revision need not reject an unrelated safe command, but the actual target/capacity preconditions must hold at settlement. There is no asynchronous network/model call inside a simulation transition. A hosted adapter serializes state application and persistence; storage failure cannot expose a mutated candidate as committed. Multiple awaited handlers must not interleave merely because the platform is described as single-threaded.

Current `step` order is preserved until a consumer justifies a reviewed change. Future phase scheduling explicitly states which revision each phase reads, when outcomes apply and which next phases become dirty. Events describe committed facts. Consumers may propose later transitions; synchronous listeners cannot recursively mutate unrelated domains until an unbounded chain completes. Bound event retention and consumer cursors; not every tick needs a permanent event log.

## Assignment and route performance

The Hungarian/matching optimizer is one cost inside the pipeline. Candidate discovery, repeated reachability and resource scans may dominate. Retain existing workDirty batching and selected optimizer until a measured replacement is justified.

Candidate narrowing order: work type/scope/allowed work → availability and priority → spatial/topological region → inexpensive distance estimate → bounded exact approaches/routes → authoritative claims. Index jobs by type/readiness/region and resources by kind/availability/region when measured scans justify them. Maintain indexes as derived views and verify them against authoritative records. Avoid a full actors×jobs×piles×routes Cartesian search for every tick.

Bound candidate expansion with deterministic operation budgets and stable tie-breaks. A top-k shortlist is an approximation, so retain aging and periodic widening for repeatedly skipped work; show why a job waits. Personal overrides, urgency and fairness precede arbitrary proximity. Report offered pair counts and rejected candidates; a smaller heap does not prove a fair scheduler. Paused admission can mark work dirty while assignment/motion waits for resume.

Route cache keys include topology revision, movement capability and actual endpoints/approach policy. Invalidate relevant connectivity after walls, stairs, doors, water restrictions or excavation change. Cache static connectivity separately from transient actor occupancy. One narrow doorway must not trap the entire scheduler in path recomputation. Cross-region path queries use coarse portals then a detailed corridor; needs-data is distinct from unreachable. Avoid running every full pathfinder for every potential assignment.

Use a due-work queue for timed processes and dirty sets for changed eligibility/fields. If deterministic budgets spread work across ticks, persist/reconstruct the continuation consistently. Do not choose simulation behavior based on performance.now elapsed on each machine. Wall time may control presentation/loading effort; authoritative scheduling decisions need an explicit reproducible order.

## UI, art and observations

Simulation produces focused display facts; Jotai selects stable slices. XState owns gestures such as ready/dragging/cancelled, not a monolithic Actor×Job×Mood×Combat×Network machine. Selection and camera changes cannot mutate jobs accidentally. Shape selection derives one target set from geometry and selected level; preview and committed command use the same derivation/validation contract.

Caps owns shared visual primitives; game UI owns menus, inspectors and composition. Coordinate shared component edits with Botanical before assigning a writer. Workbench success alone does not prove the packed game consumer. New process inspectors show inputs, progress, output custody and the first actual waiting reason with stable focus. Avoid full-world JSON serialization as a display invalidation mechanism.

Original Three geometry produces only the needed appearance/pose recipes through the low-resolution bake, cached under appearance/asset-version keys. Do not bake the Cartesian product of every head/body/outfit. Physical tool/item IDs drive the correct art attachment/pose; decorative images never supply inventory. Palette/LUT/foliage studies remain independent presentation work with native/game-scale review by Astra. Offscreen rendering can stop; simulation obligations cannot.

## Focused proofs and deletion expectations

Brewing: finite input origin; mixed capacity conflict; interrupted pickup keeps identity; transformed input is not refunded twice; paused mid-process exact restore; full output destination; one completion/output; second supported recipe added as data. Test outcome balances and observable state, not private helper call counts.

Review touched persistence/activity/HUD hotspots by responsibility before expansion. Extract the actual invariant/owner and remove competing code; do not place a second framework beside the old branch indefinitely. Migration must read old saves without silently rewriting them, preserve recoverable originals, and reject impossible references with a useful recovery path. No broad refactor is earned by a line-count warning alone.

Performance: actual 5/25/50/100-actor useful workloads with scarce materials, topology changes, waiting work and cancellation. Record candidate/path/assignment/activity/save/projection/render costs separately, completed work and fairness. Setup time is outside samples. Tests passing at 100 idle actors are not colony capacity evidence. Preserve the selected optimizer and finite conserved fixture inputs.

## Hosted authority, AI and recoverable time

These are later contracts; local Save/Continue still restores paused with no offline advancement. First prove two clients against one authoritative simulation before distributing physical interactions. A coordination region can contain many storage chunks and several small spaces. Its membership/owner epoch is explicit. A national boundary, camera rectangle or work group does not create a server owner.

The intended host adapter can use a Durable Object for a bounded coordination unit. [Cloudflare's guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/#model-your-durable-objects-around-your-atom-of-coordination) supports this shape; it does not choose our unit or make cross-object operations atomic. No per-cell/per-pawn/per-render-chunk DOs or one global world lock. Hot interacting regions remain together initially. Splitting continuously coupled water/combat across authorities requires a separately proved boundary protocol; it is not earned by entity portal transfer.

The adapter authenticates, routes to current owner epoch, admits bounded commands, commits touched records/receipt/outbox in its storage transaction, then publishes revisioned projections. `busy`/`catching-up`/`needs-data` are explicit outcomes. A second connection cannot advance an independent copy. Client predictions remain presentation with authoritative reconciliation; resources/claims/encounters are never settled twice to hide latency.

```ts
type RegionProgress = {
  ownerEpoch: number;
  committedTick: Tick;
  knownInputsThrough: Tick;
  revision: Revision;
  nextDue: DueRecord[];
  boundaryCursors: BoundaryCursor[];
};
```

Hosted target time comes from a service-controlled monotonic world-clock mapping. A region may advance only through known boundary/forcing history. It advances to at most `min(targetTick, knownInputsThrough)`, using deterministic work quotas and persisted continuation. Exact quiet intervals can skip to the next due boundary only when the relevant rates/conditions are constant or a proved aggregate integrator applies. Weather, open/closed vents, inflows, resource claims and disturbances can split those intervals. Never apply today's temperature over a week of unknown conditions.

Commands received while historical catch-up is incomplete get a durable `received/pending` intake record bound to principal, payload and effective tick; this is not ordinary work admission and does not claim a job exists. After catch-up reaches that tick, authority and physical validation transition the record exactly once to admitted or rejected. Retries return the same record/state. Neither the client nor an AI may insert commands retroactively to undo already elapsed danger. UI can show caught-up state/frontier and pending commands. If dependencies are missing, obtain them or expose the delay; do not assert that a fully simulated world stayed alive while it was frozen. Cross-region dependency cycles need bounded lookahead/interaction grouping or an explicit numerical exchange scheme; a frontier field alone does not resolve deadlock.

Persist completed progress and its wake requirement together where the host permits. On restart derive the next due wake from committed state. Durable Object alarms are at-least-once wakeups with retry limits, not a guaranteed 20 Hz clock; a duplicate wake must be harmless and long overdue work must remain recoverable after retry exhaustion. Use an earliest-due wake for many processes, not one host alarm per crop. [Alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/). No permanent busy timer for every dormant chunk.

Historical summaries are compacted only after dependent cursors have consumed them or an equivalent checkpoint contains everything needed. Bound receipt/event/history retention without losing unresolved transfers or completion deduplication. Storage/network failure leaves the prior committed checkpoint authoritative. Current whole-clearing local snapshots are reasonable at 15×15; region/touched-record persistence is a later migration with its own crash tests.

## Realm, caravan and cross-owner transfer protocol

Within one authority, portal/chunk moves validate source and destination, resolve job-bound claims/cargo and move existing identities in one transaction. Caravans add party supplies, animals and container graphs without copying each participant's inventory. The first party departure is all-or-none for a bounded roster; partial departure/split-party behavior is a later explicit product rule. Home continues through its own admitted work while the camera follows the party.

For separate authorities, specify a durable transfer with payload digest, source/destination, owner epochs, entity/container closure, admission tick and state. Suggested first protocol:

1. Source atomically validates and freezes the exact transferable closure under `transferId`; source still retains recoverable escrow but cannot simulate it as active. Prepared transfers cannot unilaterally unfreeze on timeout.
2. Destination verifies the authenticated source's durable prepared record, payload and owner epoch. It then atomically records either `accepted` with the active entities or terminal `rejected`, after validating compatible content/landing/grants. A later retry cannot change that decision or payload.
3. If accepted, destination is the sole active simulation owner. Lost acknowledgment leaves source frozen; reconnect/retry reads destination's recorded decision. Routing metadata is a hint and must respect owner epochs; it does not activate another copy.
4. Source finalizes its inactive record after observed acceptance, or restores escrow only after destination's durable terminal rejection. A cancellation after preparation requests that same destination decision; it cannot race acceptance by locally restoring. Cleanup preserves decision tombstones for the reconciliation/replay window.

Time and restoration are part of escrow, not left to retries. For the first protocol experiment, prepared entities enter explicit transfer stasis: needs, perishables and personal due effects pause at the recorded preparation tick until the destination decision. On activation shift suspended deadlines by the recorded interval. This is a disclosed recovery simplification and potential stasis exploit, so general player-initiated cross-owner travel must not ship until a product decision accepts that rule or replaces it with a proved transit-history simulation. Never apply present destination weather over an unknown transit interval. Source preparation reserves a restoration cell/container closure until finalization; ordinary construction/storage cannot consume it. World-driven destruction of that reservation needs an explicit persistent fallback escrow/landing rule before being supported. Destination rejection does not permit restoring into an invalid occupied cell.

This is a deliberately blocking safety-first protocol candidate between trusted authorities. If either owner is unavailable the party may remain pending; availability and failover require a separate ownership-epoch design. Timeout triggers reconciliation only. An unknown outcome never authorizes source rollback that could duplicate an already-arrived party. Test crashes before/after every durable stage, conflicting retries, source cancellation versus acceptance, repeated/delayed messages, stale owner epochs, time suspension/resumption and occupied/destroyed restoration space. Physical cross-owner flow, projectile travel and jurisdiction changes each need their own semantics. Keep a first realm under one owner until this complexity is justified.

## Shiitake observations and control grants

Expose small query tools over authorized committed facts: inspect entity, list nearby work, read own group policy, query known supplies/conditions, read changed observations since a cursor, submit typed intent, inspect receipt/job. Paginate and cap response/entity/event counts, with schema version, region revision and observation tick. A filtered world summary can orient a planner; it must not serialize the whole map every decision. Redacted hidden facts stay hidden when a caller requests a known ID.

A familiar, Devil, clerk, faction leader or storyteller is a persona plus an explicit control grant. The grant names issuer/principal, controlled entities or groups, verbs, region/space scope, resource/action budgets, expiry and revocation policy. Initial group grants pin a membership snapshot; dynamic membership is a separately explicit grant mode, with visible membership changes and per-command authorization against the current revision. Resource/action budget debit is atomic with idempotent command admission, so retry cannot spend twice and concurrent commands cannot overspend. Receipts retain grant ID/revision. An already-admitted game-owned standing policy follows its stored revocation policy; a planner's new command after grant expiry is rejected. Roles do not widen grants implicitly. Player-delegated AI and world-directed event AI use distinct permissions; an ordinary companion cannot spawn creatures or edit reputations simply by adopting the storyteller persona.

Shiitake model/tool work runs outside the deterministic step. The planner chooses goals or standing policies at a bounded cadence; ordinary NPC/work routines carry out movement, hauling and repeated work cheaply. Wake a planner for meaningful exceptions/events rather than every tick. Tools submit the same commands as humans and receive accepted/rejected/pending receipts. Text in a book or dialogue is game content, not an instruction that grants new tools or access.

Watchdog may own durable external AI tasks only after its actual host transaction/claim/recovery contract is integrated. Its claimed/completed row does not prove the game action happened; reconcile the game's command receipt. Whistle or another Botanical transport can deliver observations only through its reviewed actual API; this document does not invent that integration. Reuse ordinary supported primitives at a real boundary rather than copying Botanical services into Hive.

Basic standing orders and reasonable unattended protection remain game behavior, independent of a paid model subscription. Optional AI can improve planning, explanations and convenience under the same game rules. Pricing, enforcement, online danger and shared-space hosting require explicit product decisions; no new purchases or backend deployment is authorized by these plans.
