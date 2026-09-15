# Native work planning: implementation contract

September 15, 2026. Design and partial foundation are under implementation;
runtime acceptance is outstanding. The source integration checkpoint for the
status below is `7d31b478`. This refines and takes precedence over the planning
pseudocode in [01-work](01-work.md). It does not claim that Colony runs the native
planner yet.

[Whole-engine ownership audit](08-engine-ownership-audit.md) owns the September 15
deep-module correction and cross-engine repair order. One shared scheduler is
settled; domain requirement contributions are not independent schedulers.

## 1. Outcome and boundary

One Rust planner owns automatic work from discovering requirements through
candidate generation, route validation, Hungarian selection and continuation.
TypeScript authors validated content and submit designations. Both Colony and
its performance pack run that same planner through `Kernel::advance_batch`.

Retain `work_attempt.rs`, `assign.rs`, existing physical modules, the Region
transaction and original rendering. Hungarian is already implemented using
`pathfinding::kuhn_munkres_min`. Move its calling pipeline; do not replace the
algorithm. A native solver receiving a TypeScript-produced matrix is not this
outcome. Do not export worker/job matrices to the host for routine planning.

The following are proposed new private types/functions. Existing operations named
below are reuse anchors, not claims that these proposed APIs already exist.

### Current implementation checkpoint

Do not infer completion from the presence of native planner files. At `7d31b478`:

- `work_planner.rs` defines the initial participation, policy, schedule, budget
  and fairness records;
- `work_candidates.rs` contains bounded lazy Hungarian correction and typed
  route outcomes, but `rebuild_indexes` still scans the complete external-ID map;
  those rebuilt maps are proof scaffolding, not the required maintained indexes;
- `supply_allocation.rs` and the material mutation owner enforce exact source
  portion and incoming destination-capacity reservations, including exclusion
  for the allocation performing its own transfer;
- the WorkAttempt owner can begin an attempt from a prepared route witness and
  update an allocation's portion identity when pickup splits a lot;
- `native_work_planner.rs::plan_construction_supply` can create construction
  allocations and initial routes, but it is not an accepted construction consumer: it
  does not yet reconcile route arrival, pickup, onward route, deposit and final
  acknowledgement, and it has no save/reload lifecycle proof;
- no native planner hook is active in `Kernel::advance_batch`; process, water,
  resource, tree, excavation, deconstruction, stockpile and recovery families
  have not moved to this planner; and
- Colony and its performance page still use the TypeScript automatic providers
  listed in the deletion checklist below.

The next accepted checkpoint must finish one real construction-supply lifecycle
without activating a partial competing scheduler. A compile pass or an isolated
matching/reservation test does not earn that checkpoint.

## 2. Ownership and files

| Responsibility | Owner and concrete change |
| --- | --- |
| Content compilation | `environment_definition.rs`, `staged_process.rs`: extend existing definitions with supported work requirements; preserve compiled recipe inputs/stages/outputs |
| Persistent player intent | Native ECS order components beside the existing construction, excavation, resource and process owners |
| Assignment lifecycle | Existing `WorkAttempt` and task/worker indexes; no additional worker claim in an order |
| Supply allocation | Native material owner gains exact portion/capacity reservations; replace TS DeliveryTask allocation and custody orchestration |
| Work scheduling | New private `work_planner.rs` module under the current Kernel: dirty/due work, bounded selection, reconciliation |
| Candidate discovery | Private `work_candidates.rs`: direct indexed ECS reads, capability/party filters and geometric lower bounds |
| Matching | Existing `assign.rs`; move lazy route validation from `sdk/work-allocation.ts` alongside it |
| Routes and contacts | Existing `route_query.rs`, `route_for`, terrain traversal and operation-specific contact functions; expose typed internal results |
| Durable acceptance | Existing candidate world/Region commit and receipt owners, including planner records |
| Human/AI inspection | Existing scoped observation/capability connection with native work summaries |

These are responsibility divisions, not new public packages. One writer owns
the coupled native stack and dispatch/registration changes at a time.

### Concrete Rust file shape

Do not implement the native planner by extending `world.rs` into another
scheduler. Keep the coupled implementation in these private modules:

- `work_planner.rs` owns saved scheduling policy, budgets, dirty/due review and
  deterministic fairness cursors;
- `work_candidates.rs` owns direct ECS membership/spatial queries, bounded pair
  generation and lazy route-corrected Hungarian matching;
- `supply_allocation.rs` owns exact source-portion and incoming-capacity
  reservation laws shared by every material mutator;
- `native_work_planner.rs` joins bounded domain requirements to the shared work
  owner. Construction/process/resource/dig modules derive their requirements;
  shared delivery reconciliation and matching have one implementation. Do not
  grow this file into a family-specific scheduler for each kind of work;
- existing domain modules such as `construction_work.rs`, `staged_process.rs`
  and `excavation_work.rs` remain physical fact and mutation owners. Resource
  operations currently inside `world.rs` should gain a cohesive private module
  as their consumer migrates; `resource_work.rs` is not an existing reuse anchor.

`world.rs` is the composition and transaction boundary. It may declare the
private modules, call one bounded planner hook from `advance_batch`, and expose
narrow internal mutation operations needed by those modules. It must not contain
candidate scans, requirement-family branches, Hungarian orchestration or the
automatic pickup/deposit state machine. If an implementation checkpoint adds
those responsibilities to `world.rs`, extract them before accepting that stage.
The narrow WorkAttempt publication/continuation seam may stay with the existing
WorkAttempt mutation owner only where it enforces the atomic physical transition;
planner decisions and family-specific policy do not belong there.

Moving an `impl Kernel` block into another file is only a source organization
step. Finish the boundary by hiding state, indexes, invalidation, continuation and
cleanup behind the responsible owner's operations. A domain module supplies a
typed requirement and physical outcome; it cannot choose workers or run a private
matcher. All contributions compete in one bounded scheduling window. Prove this
with construction and process supplies before freezing a public extension API.

## 3. Canonical records: intent, execution, supplies

Use existing ConstructionSite, FloorReplacement, excavation, deconstruction,
StagedProcess and ResourceSite records wherever they already own the fact. Move
authored dig/tree/resource orders into typed native components. Keep progress in
its domain owner: construction seconds, process stage/time, finite stock, resource
growth and extraction effort must each have one owner.

```rust
// Derived key into an existing domain owner; not a second saved task universe.
enum WorkRef {
    Excavate(EntityId), Construct(EntityId), ReplaceFinish(EntityId),
    Deconstruct(EntityId), Extract(EntityId), Establish(EntityId),
    Tend(EntityId), Attend(EntityId), Deliver(EntityId), FillVessel(EntityId),
}

// Common native order policy attached only to actual orders.
struct WorkPolicy { party: EntityId, priority: u8, enabled: bool }
struct WorkSchedule { next_review_tick: u64, last_considered: u64 }

// A concrete transport obligation; replaces authored DeliveryTask state.
struct SupplyAllocation {
    requirement: RequirementKey, // owner + input role + stage/request generation
    portion: PortionRef,        // existing lot identity plus exact amount
    destination: EntityId,
    reservation: ReservationId,
}
```

WorkAttempt remains the sole task-to-worker association. Domain order records
cannot contain a second `worker`, route, or completion counter. Delivery's actual
location is the material lot's container. Do not save another `held/dropped`
location that can disagree: derive those labels from lot custody and retained
operation outcome. A continuation can name the intended next operation and exact
allocation, but cannot manufacture evidence that pickup/delivery happened.

`RequirementKey` includes a generation so a later brew batch or crop stage cannot
inherit earlier completed demand. Domain owners advance that generation when the
requirement changes. Demand amount is derived from the recipe and physically
present/reserved supplies; it is not independently decremented by the planner.

Promote `hive.work-participation` to a native component with current automatic
eligibility. Worker membership is Body + compatible navigation + PartyMember +
WorkParticipation, with carrying capability required for hauling. Goblin guest,
Rowan/Sedge and visual IDs are not engine eligibility rules. Content chooses which
actors receive capabilities. Validate traversal/frame compatibility per operation.

## 4. Reservations and independent deliveries

Extend material mutation ownership, rather than making planner-local claims.
For a lot: reserved portions may not exceed remaining quantity. For a destination:
present goods plus incoming reservations may not exceed capacity. Every mutator
that consumes, splits, transfers, removes or reserves must preserve those laws.
Reservation identity names its allocation and party. Existing process role custody
and transport reservations must compose explicitly: arrival releases the incoming
transport reservation as the process's existing input binding takes ownership.

```text
prepareSupply(requirement, worker, source):
  missing = required - accepted_present - valid_incoming
  amount = min(missing, free_source, free_destination, worker_capacity, batch_size)
  require amount > 0 and current party/lot/filter compatibility
  prepare exact source portion + destination capacity reservation
  prepare WorkAttempt and first reachable operation
  publish all or none
```

Two workers can each reserve three wood for a six-wood stair and carry them in
parallel. There is no exclusive reservation of the entire stair during deliveries.
Construction labor itself keeps its existing concurrency rule. Failure to reserve
the second portion is a normal candidate rejection, never an exception after the
first worker's physical effects have committed.

On pickup, the canonical material owner updates the allocation's portion reference
if a split produced another lot ID. On interruption, release unused source and
incoming reservations. Carried goods stay in the actual carrier. Native recovery
work can deposit/drop them later under normal physical rules; no teleport, refund
or automatic movement that overrides Draft. A drafted actor may retain cargo.
Undraft schedules recovery before ordinary new carrying work. Cancellation does
not erase paid goods or earned domain progress.

The allocation entity is the delivery task named by `WorkAttempt`; it does not
store a worker. After matching, native admission creates the allocation and its
attempt together. Pickup and deposit use the existing attempt-owned material
transfer continuation:

```text
pickup(allocation attempt):
  require exact allocation portion, quantity and source
  transfer that portion to the attempt worker while excluding only this reservation
  if the transfer split the lot, replace allocation.portion with the committed moved-lot ID
  keep the final destination capacity reserved

deposit(allocation attempt):
  require exact allocation portion and quantity in the attempt worker
  require allocation.destination is the transfer destination
  transfer while excluding only this reservation
  mark allocation delivered after the physical transfer commits
```

There is no direct source-to-destination allocation delivery helper: routing,
pickup custody and deposit contact remain observable physical operations. Dropping
an interrupted carried portion moves the same lot and keeps the allocation valid.
Cancelling releases the reservation but does not move that lot. Ordinary transfer,
consumption, material output, removal and construction cancellation all recheck or
release affected active reservations at their existing mutation owner.

First real consumer acceptance: one worker gradually supplies a six-unit demand;
two workers also supply it concurrently from one lot, in bounded portions that
fit their free carrying capacity. Missing sources/workers leave valid waiting
intent. Exercise route arrival, exact pickup, onward route, deposit and attempt
acknowledgement, with save/restore mid-carry and preserved split-lot identities.
Then use the same delivery owner for process input. Do not copy the construction
draft's matching loop for brewing or fill a second feature-specific state machine.
The consolidated lifecycle scenario in section 11 owns the overlapping assertions.

## 5. Declarative water, brewing, resources and tree work

The existing process definition already supplies inputs, quantities, roles,
station ports, attended/elapsed stages and outputs. Keep it. A missing water input
produces an ordinary supply requirement. The source resolver may satisfy it from
an existing water lot or a native field-water withdrawal using an available vessel.
Vessel compatibility comes from declared vessel capability/definition, not the
literal item name `pail`. Preserve existing quantity-to-water accounting and 0–7
field levels; the planner does not define new water physics.

```text
brew request -> native StagedProcess
  for each missing input role: expose requirement
  water source needed:
    allocate eligible vessel and incoming destination capacity
    route to legal water contact
    withdraw bounded portions through existing FieldWater operation
    route to station port -> ordinary material transfer
  all inputs available: existing process admission binds exact inputs
  attended stage: expose attendance work
  elapsed stage: existing process clock advances without claiming a worker
  transition: existing process owner consumes/emits/produces atomically
```

Do not reserve a river cell's future water indefinitely. Final withdrawal rechecks
finite availability. A competing withdrawal can leave this allocation waiting or
partially supplied; recompute the remaining requirement from actual conserved
stock. Avoid repeated searches when no water demand exists.

Tree chopping needs its existing felled/extraction stages moved as data plus native
effort, not an immediate resource-extract action that skips the animation/work
duration. Extend the existing finite-resource definition with required stages,
duration and output policy. Herbs use the existing resource-stage definitions.
Native facts select original animation/progress; animation never finishes a job.
Dig yields stay on the ground under the existing material owner, with hauling a
separate lower-priority requirement.

## 6. Scheduling and direct ECS access

Build derived indexes at canonical mutation owners:

- eligible actors by party/capability/frame and spatial bucket;
- ready/due tasks by party, priority, last-considered value and stable ID;
- available stock by party/material/container and spatial bucket;
- allocations by requirement/source/destination; attempts by task and worker;
- task dependencies on target geometry, input role and support/contact revision.

The current `rebuild_indexes(world, ids)` and allocation/source scans are unfinished
groundwork. Reuse the existing container `contents` index; maintain reservation
and work indexes at accepted mutations. Full reconstruction belongs to load/restore
and focused reference checks, never the normal planner step. Apply bounds before
pair expansion and charge records visited, not just the size of returned results.

Retain Bevy QueryState/component membership for direct native iteration where
appropriate. Maintain additional indexes only for these distinct queries. Do not
serialize entire ECS rows, sort all entities, then deserialize them in Rust again.

Mutation owners enqueue affected IDs into a deduplicated dirty set. Ownership,
Draft, task creation/cancellation, stock/capacity changes, process-stage changes,
route outcomes and relevant geometry edits are wake causes. Moving active actors
does not invalidate every waiting task. Indexes update on accepted commands even
when physical time is paused. On resume, those orders are immediately discoverable.

Persist semantic fairness cursors and next-review ticks. Rebuild derived indexes
in stable order after load. Due retries use the current eight-tick interval as the
initial policy; dependency changes may wake a task earlier. Coalesce repeated wakes.
Persist bounded dirty continuation when a committed change cannot be fully
processed in its tick, or reconstruct it from saved revisions/due records with
identical ordering. Do not silently lose the remainder on eviction.

## 7. Bounded joint assignment

Keep the existing maximum eight newly admitted assignments and 32 route validations
per step. Initial new work limits: 32 task reviews, 256 eligible worker rows,
4096 candidate pairs, 64 supply/contact expansions and at most eight Hungarian
passes per step. These are explicit tuning defaults, not capacity measurements.
Each expansion also uses its existing cell/record bound; charge actual records
visited so an expansion cannot hide a full-map scan.

Rotate party selection by a saved stable cursor, then priority and least recently
considered task. Include all work families in one candidate pool. Already active
attempts retain workers. Cap matrix rows/columns as well as sparse edges: the
current Hungarian adapter builds a dense matrix including dummy columns, so edge
count alone is insufficient. Use at most 256 workers and 32 tasks per planning
window; a larger population continues through deterministic windows.

```text
window = next_fair_ready_window(budget)
pairs = native_indexed_candidates(window, budget)
costs = geometric_lower_bounds(pairs)
repeat within matcher/route budget:
  proposal = existing_hungarian(costs)
  choose unverified proposals by task priority/fairness, then stable IDs
  route = native_route_to_any_actual_contact(selected_pair, shared_budget)
  reachable: record exact cost and reusable prepared route witness
  no-path: remove pair for the witnessed topology/eligibility version
  deferred: retain task; do not cache as unreachable
  rerun only for invalid pair or material detour under existing 1.5x/+4m rule
admit at most eight verified pairs after fresh stock/contact/authority checks
advance window cursors even when every proposal was blocked
```

Costs remain metres through this port so the existing +4m correction is meaningful.
Priority controls task selection; do not silently mix seconds with metres or claim
global optimality. Hungarian optimizes the bounded candidate matrix. Measure the
window's throughput/fairness and small-case assignment quality against an exhaustive
oracle; no guarantee of an optimum over all workers and every job.

Existing A* uses a 4096-expansion local limit. Introduce typed internal
`Reachable | NoPath | Deferred` and a shared expansion allowance (initially 16384
per planning step) into the existing search owner. Budget exhaustion currently
shares string errors with no-route; that distinction must be fixed in all changed
callers. Reuse the accepted route witness at dispatch when dependencies still
match, avoiding a second identical search. If the witness is stale, defer/replan.
Do not add an independent pathfinder, region flattening, or per-pair world clone.

Long searches that repeatedly exceed a local bound remain visibly deferred with
attempt counters; this design does not claim to solve arbitrary cross-region
travel. Such a demonstrated workload needs a separately reviewed routing extension.

## 8. Tick ordering, failure and durability

Commands are admitted at the existing atomic native/Region boundary. Within an
active step: apply accepted commands, update affected indexes, reconcile retained
outcomes, discover/assign bounded new work, then advance existing physical work
and movement in their declared order. A worker arriving this tick earns no labor
for time already spent travelling. Immediate operations have a bounded continuation
count; the planner cannot recursively drain an entire crafting chain in one tick.

Continuing attempts and cancellation have a separate bounded service queue from
new assignment so a backlog cannot starve cleanup. Begin with 256 retained outcome
reconciliations per step and a persistent fair cursor. Physical owners publish
terminal outcomes once; planner advances domain intent and acknowledges that exact
operation in the same candidate transaction.

Expected blocked operations return typed status. Programmer/schema/ownership
violations fail the detached candidate and prevent acknowledgement. Region commits
world, reservations, attempts, scheduler state and command receipt before publishing
success. No new SQL scheduler or external job service. Native temporary prepared
values are not durable evidence and never survive across transactions.

Restore validates references, single worker ownership, amounts, capacities, task
generations and supported versions; rebuilds indexes; then resumes exact outcomes.
Construction plans made structurally impossible are cancelled through the native
owner in the same transaction as the invalidating change, including dependent
plans without alternative support. Follow the September 15 cancellation policy in
[02-construction](02-construction.md#impossible-versus-waiting). Release reservations
and attempts without losing carried or delivered materials. Red blocked-plan UX
is deferred. Ordinary missing supplies/workers or temporary access loss remain
valid waiting work; restore does not require every task to be executable.
Reject incompatible overlapping intents, structurally invalid live construction
plans and malformed links; do not silently repair saves on load.

## 9. Commands, observations and other games

TypeScript GamePack commands parse game inputs, establish their permitted party
scope and emit native designation/policy operations. Native admission rechecks
authority. Keep Whistle's existing neutral schema/availability and parser. A
controller reads the same native task summaries as the UI, scoped by the existing
observation owner: task kind/target, pending/working/blocked, reason, progress,
required/available/incoming materials and currently assigned party members.

Players designate without selecting a worker. Draft/Go is immediate player control
through the existing native attempt operations; native manual-result reconciliation
replaces `manualRouteProvider`. Selection does not Draft. Undraft returns the actor
to native eligibility. Disconnecting changes no party work ownership.

RTS, survival and pirate packs may omit automatic work policy. Their native manual
movement and physical systems continue through the same Kernel. Supported new
production recipes are TypeScript definition changes. A new physical behavior
requires a reviewed typed native operation; this is not a general saved callback VM.

## 10. Implementable sequence and deletion gates

1. **Native planner foundation:** work participation/policy/schedule records,
   typed route results, budget/fairness mechanics and direct ECS indexes. Port
   lazy matching with synthetic native fixtures. Replace the full-ID rebuild on
   the active path with mutation-maintained indexes. No game cutover claim.
2. **Real supplies and water:** native allocation/capacity ownership and existing
   operation continuation. Demonstrate two simultaneous deliveries and field fill,
   cancellation/Draft and interrupted cargo in a real Kernel fixture.
3. **Production/construction:** requirements derived from actual process and
   structure catalogs, attendance, finish replacement and deconstruction. Prove
   the complete existing brewing recipe with its original materials/ports.
4. **Dig/tree/resource:** migrate their actual stage/progress/intent and commands,
   including original durations, ground yields and plant water requirements.
5. **Single consumer cutover:** replace Colony's TS work system with compiled
   native policy; performance inherits the same pack. Update UI/AI summaries and
   manual result handling. Remove all obsolete provider imports and definitions.
6. **Qualify and publish:** real productive workloads, gameplay, recovery and
   focused rendered/hosted evidence; coherent client/backend release.

Keep intermediate native code under development without activating a competing
planner in Colony. One atomic GamePack cutover activates native ownership after
all supported work families are ready. No permanent dual scheduler or fallback.
Version the changed current records and reject unsupported formats explicitly;
do not silently reset existing player worlds or write migration adapters.

Deletion checklist: remove the automatic provider phases from `colony-work.ts`
(`resourceWorkProvider`, `treeWorkProvider`, `digProvider`,
`colonyGroundStockPhase`, `colonySiteSuppliesPhase`, and the automatic water
demand phases), `colony-water-work.ts`, `sdk/work-system.ts`,
`sdk/work-allocation.ts`, `sdk/site-supplies.ts`, `sdk/process-supply.ts`,
`sdk/process-attendance.ts`, and the automatic portions of `sdk/delivery.ts`,
`sdk/construction-work.ts`, `sdk/deconstruction-work.ts`, and `sdk/stockpile.ts`.
Replace `manualRouteProvider` with native manual-result reconciliation. Preserve
definitions, command schemas, intent admission, presentation/projections and the
existing native physical operations. `deliverySystem` is also consumed by the
Pirates pack, so separate its reusable physical/custody operations from its
TypeScript automatic planner before deleting the latter. The performance pack
uses the same `colonyPack`; do not create a performance-only planner or cutover.
Audit imports across all four games and recut provider-specific tests around the
single native lifecycle scenario described below.

## 11. Evidence that earns completion

### Consolidate overlapping scenario tests (September 15)

The following evidence list is not a request for one new integration test per
bullet. Maintain one multi-step, multi-assertion construction/work lifecycle
scenario: a two-storey room, stairs and brewer; two concurrent deliveries;
cancellation of a prerequisite; only structurally invalid dependents cancelled;
conserved carried/delivered stock; workers resuming independent work;
Draft/Undraft; save/reload; and a second player's independent party.
Assert named invariants at each transition, not only at the final state. Use
bounded advancement until explicit milestones, with useful failure diagnostics.

Inventory existing tests before implementing this scenario. In particular,
`colony-construction.test.ts` already combines deconstruction, conservation and
reload, and separately exercises wall/upper-floor support. `colony-work.test.ts`
already covers interruption acknowledgement and resource reload. Extend and
consolidate overlapping lifecycle coverage when the native cutover lands instead
of adding another collection of equivalent fixtures. Remove superseded scenarios
only after their meaningful assertions have a new home. Retain focused tests
for distinct algorithms, malformed input, crash boundaries and geometric edge
cases; those are not duplicates merely because they mention cancellation.

Run the shared scenario through the real command/session/native owners. Reuse its
fixture and assertions for consumer parity where applicable, without duplicating
the scenario implementation. A local save/reload assertion does not replace a
DO crash/receipt test or establish hosted multiplayer behavior. Do not turn the
entire performance suite into this one sequential scenario.

- Same accepted commands and seed produce the same assignments/effects through
  save/reload and input-order-independent internal indexes.
- Every supported work family uses the one native pipeline; no automatic TS
  worker/job scan or candidate matrix survives the consumer cutover.
- Two workers independently deliver finite portions; exact cancellation/retry and
  lost acknowledgement preserve total material and unique custody.
- Full brew, chop, dig, plant, build, floor replacement and deconstruct workloads
  finish through real consumers; blocked contacts free workers for other jobs.
- No demand produces zero supply/water-contact searches. Unreachable work,
  exhausted budgets and a later opened stair route exercise distinct outcomes.
- Two parties in one DO cannot spend each other's materials or occupy each other's
  attempts; disconnect/reconnect preserves ongoing party work and manual control.
- Measure 32 and 100 productive workers for a sustained run, plus a bounded
  200-worker stress case. Report median/p95/max, scheduling counters, path expansions,
  native/JS boundary bytes, memory, save/observation and render costs separately.
- Target 100-worker simulation p95 below 25ms on the recorded local machine,
  with UI interaction tested separately. This is a release target, not an estimate
  or an established guarantee. Investigate misses; never relax the workload to pass.

No additional artwork is needed to prove this planner. Original work animation,
carry/drop cues and visible progress are required consumers of its authoritative
facts. Passing unit tests alone does not establish hosted playability.
