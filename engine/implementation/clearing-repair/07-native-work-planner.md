# Native work planning: implementation contract

September 15, 2026. Design and staged implementation are underway. The source
integration checkpoint for the status below is `a8d4caa9`. This refines and takes
precedence over the planning pseudocode in [01-work](01-work.md). Construction and
staged processes now run through the first accepted native planner slice; the
whole Colony cutover remains incomplete.

[Whole-engine ownership audit](08-engine-ownership-audit.md) owns the September 15
deep-module correction and cross-engine repair order. One shared scheduler is
settled; domain requirement contributions are not independent schedulers.

[Lifecycle and access contract, section F1](12-actor-lifecycle-relations-and-access.md#f1-native-work-pool-replacement)
owns the subsequent party-to-work-pool field correction: explicit pool, configured
membership relation and initiating player, with current operation permission.
It supersedes party-equality authorization in older examples here, without
changing this document's single native scheduler, matching or material ownership.

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

Do not infer whole-game completion from the active native planner. At `a8d4caa9`:

- `work_planner.rs` defines the initial participation, policy, schedule, budget
  and fairness records;
- `work_candidates.rs` contains bounded lazy Hungarian correction, typed route
  outcomes and mutation-maintained worker/task indexes. Load and restore rebuild
  them once; authored changes, party creation, construction and process lifecycle
  mutations update the affected identity. Repeated planning does not rebuild them;
- `supply_allocation.rs` and the material mutation owner enforce exact source
  portion and incoming destination-capacity reservations, including exclusion
  for the allocation performing its own transfer;
- the WorkAttempt owner can begin an attempt from a prepared route witness and
  update an allocation's portion identity when pickup splits a lot;
- `native_work_planner.rs` owns the shared finite-supply allocation, lazy route
  validation and pickup/delivery/reconciliation lifecycle for construction and
  staged process inputs. Focused Kernel laws prove two concurrent carriers,
  capacity splitting, interruption with retained cargo, and mid-carry save/restore.
  Supply worker discovery now uses the maintained party index; material-source
  discovery still scans canonical IDs and remains the next index correction;
- construction and attended processes contribute typed labor requirements. One
  bounded tick-owned solver now considers ready labor and finite supply together,
  uses the maintained candidate indexes, validates exact routes lazily and admits
  at most eight assignments from at most 4,096 candidate pairs;
- planner-capable batches participate in the existing save/restore candidate
  boundary. A failed automatic admission rolls back schedules, allocations and
  attempts together. Only the highest due priority tier enters a window; lower
  tiers remain due and receive later windows instead of being silently advanced;
- missing construction contact and unavailable process inputs remain waiting
  states. Process input admission happens only before its first stage and cannot
  restart after a later attended/elapsed transition;
- Colony removed the TypeScript construction and process provider calls, so its
  ordinary session and performance pack reach this same active native hook through
  `Kernel::advance_batch`;
- deconstruction designations are native order records. Their contact discovery,
  free-capacity eligibility, route pricing, assignment, physical continuation and
  terminal reconciliation now use that same planner and WorkAttempt owner. Colony
  submits one semantic plan action and no longer has a deconstruction provider;
- focused native planner laws cover combined supply/labor, concurrent carriers,
  small carrier capacity, interruption, priority fairness, rollback and restore.
  The complete kernel proof at this checkpoint passed 365 tests; existing compiler
  warnings remain disclosed rather than treated as new failures; and
- water, resource, tree, excavation, stockpile hauling and manual
  route reconciliation still use TypeScript providers listed in the deletion
  checklist below. Material-source discovery also still scans canonical IDs.

The next accepted checkpoint must add canonical durable Job/Task composition and
one real tree → felled trunk → logs lifecycle, then migrate excavation/resources
into the same tick-owned review without activating another scheduler. A compile
pass or an isolated record test does not earn that checkpoint.

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

### Transition ownership and reuse beyond colonies

See the [shield job and statechart walkthrough](10-scripted-engine-authoring-audit.md#multi-task-jobs-and-optional-statecharts-use-the-same-owners)
for the creator-facing fit. It preserves these native task/continuity laws and
does not require charts for linear recipes.

The [accepted definition-builder and shared-query contract](10-scripted-engine-authoring-audit.md#accepted-authoring-contract-definitions-and-shared-query-batches)
owns the creator-facing API. Behaviors compose over one existing execution path;
cross-behavior read batching does not reintroduce TypeScript worker/job assignment
or change native task, resource and durable commitment ownership.

Follow the [creator/behavior audit](08-engine-ownership-audit.md#creator-engine-and-shared-behavior-september-15-follow-through).
Individual behavior chooses an intention; optional group assignment chooses
actors for shared work; the existing keyed execution owner carries out activities
and retains their outcomes. A survival game may use either decision mechanism
over the same movement/material/contact owners. No Colony, zombie or pirate
copy of the executor, cancellation path or result ledger is permitted.

Retain `WorkAttempt` as the current shared identity/result anchor and distinguish
its task-worker relationship from the operation it tracks when generalizing it.
Processes, construction and deliveries retain only their distinct domain facts.
They do not duplicate the active worker, route progress or reservation state.
The colony extension is a composition of reusable work/construction/production
mechanisms; Goblin characters, recipes, artwork and UI remain game content.

Each lifecycle owns its closed events, allowed transitions, guards, next state,
failure policy and cleanup together. Make authoritative phase fields private to
that owner and expose read projections. `world.rs` and the planner call useful
operations; they cannot reset phase fields or coordinate collections of cleanup
writes. Moving an unrestricted `impl Kernel` block to another file alone does
not satisfy this requirement.

Conceptual flow, not new public API names:

```text
owner.prepare(current, typed_event, authoritative_facts)
  -> prepared_transition(next_state, exact_effects)
  | domain_rejection(reason)

transaction validates coupled prepared changes
  -> publish next state + material/route effects + result consumption together
  -> accepted resident and observations only after successful durable commit
```

Preparation must account for competing changes in the same batch. No effect hook
may independently change the ECS. The existing material prepare/publish owners
are the starting point. Put reservation/binding accounting inside all their
entrypoints, including process consumption/output; a caller cannot opt out.
Local expected blockage returns a typed outcome; an invariant/commit failure
still discards the candidate. No acknowledged state may require a future tick
to become valid for restore.

Required corrections before native activation:

- Reconcile completed, blocked and interrupted deliveries under the same bounded
  queue; release unused promises and labor while preserving actual carried lots.
- When acknowledgement follows an invalidated dig target, remove or retire the
  invalid execution progress in the same transition. Paused valid progress and
  structurally invalid intent are different domain outcomes.
- Treat carry batch size as an upper preference. Derive admitted portion sizes
  from eligible carriers and source/destination capacity; smaller carriers must
  still make progress on larger demands. Preserve joint assignment and exact
  source-portion exclusion across simultaneous deliveries.
- A behavior running less frequently than physics must still receive its exact
  retained result. Reuse the keyed lifecycle for tracked operations; do not
  perpetuate the previous-step-only `context.outcomes` pattern as a durable API.

XState-compatible TypeScript authoring is a qualified extension direction, not
permission to implement a generic interpreter during this migration. The audit
specifies the native-profile/actual-XState comparison and its two real consumers.
No `defineHiveMachine` API or chart runtime has been accepted. Keep existing
linear process definitions for supported recipes; allow ordinary game-owned TS
rules without returning engine scheduling to TS. This packet does not require
Statig, SCXML or a statechart library for small private Rust enum transitions.

## 3. Canonical records: intent, execution, supplies

Use existing ConstructionSite, FloorReplacement, excavation, deconstruction,
StagedProcess and ResourceSite records wherever they already own the fact. Move
authored dig/tree/resource orders into typed native components. Keep progress in
its domain owner: construction seconds, process stage/time, finite stock, resource
growth and extraction effort must each have one owner.

### Jobs compose tasks; physical results separate them

A `Job` is durable player intent and dependency state. A `Task` is one independently
schedulable unit of work. `WorkAttempt` remains one worker performing one task.
Never retain a worker merely because its task belongs to a larger job. A job may
expose several ready independent tasks, but every task competes through the same
bounded planner and has its own exact operation/result identity.

Use a physical boundary, not a hidden stage, whenever completing work changes what
the world can haul, store, trade, target, abandon or destroy. The completion
transaction publishes the physical result and settles that task together. A later
task refers to that exact committed result identity. Cancelling the job removes
future intent and releases its reservations/attempts; it never erases or rewinds
already published matter.

The first required consumer is tree processing:

```text
job "make logs from this tree"
  task fell-standing-resource(tree)
    completion: standing resource -> stump + physical felled-trunk item
  task chop-item(result(fell, "trunk"))
    completion: consume exact felled-trunk item -> physical log lot(s)
```

The felled trunk has ordinary identity, position/custody, definition, footprint,
volume/mass and carry requirements. It can remain in the woods indefinitely. The
player may cancel future chopping; stockpile policy may produce a separate haul
task; a later strong actor, team, cart or donkey may move it. Chopping resolves its
contact and location when that separate task is planned. Do not encode the trunk
as `TreePhase::Felled`, internal extraction progress, a visual-only record or a
reserved future output. Rust does not know the word tree: Goblin definitions bind
a standing resource to one supported physical transformation and bind the trunk
item to another. Boulders, carcasses and wreckage use the same mechanics.

The Colony cutover therefore deletes `ColonyTreeOrder`, its `stage/seconds/actor`
state, and `treeWorkProvider`. The designate command submits one native job for
the selected finite resource; cancellation addresses that job. Standing/stump
presentation derives from the source resource's actual remaining quantity and
Goblin's visual definition. The fallen visual derives from the physical trunk
lot's definition and location. Performance completion counts depleted sources and
real output lots, not a copied `ColonyTree.phase`. If a small game-owned marker is
still useful for species or art selection, it contains only that content identity
and never duplicates physical or work lifecycle state.

This is the first-class multi-task mechanism also used by construction and brewing.
It is a small closed, versioned plan of typed task definitions and result bindings,
not a callback graph, universal state machine or scheduler inside each recipe.
Definitions may sequence supported tasks and name their physical results. The
native job owner materializes only newly ready tasks, within a bounded continuation
budget, after their dependencies have actually committed.

The task identity is never the domain target identity. `chop trunk-7`, `supply
site-4` and `attend batch-2` are task records whose operations refer to those
physical targets. `WorkAttempt.task` always names the task record. It must not name
the tree, trunk, construction site or process merely because an early single-step
implementation used that entity as both concepts. Domain owners validate the
operation's target and perform its mutation; the job owner validates dependency,
result binding and task lifecycle. This lets separate jobs or stages lawfully touch
one target without sharing progress, retry identity or worker custody.

Admission compiles the complete bounded plan and creates all of its stable step
records atomically. A pending step is observable but contributes no labor until
its dependencies and result bindings resolve. Readiness is derived rather than a
second writable fact. A terminal step stores either its committed result bindings
or cancellation; job completion is derived from its terminal steps and may be
published as a checked summary in the same transaction. A `supply` step is a
bounded controller: it creates independently schedulable delivery child tasks as
capacity and material portions are reserved. The controller itself never holds a
worker.

Conceptual native records, to be fitted to the existing component registry rather
than copied verbatim:

```rust
struct Job {
    version: u8,
    definition: DefinitionRef,
    party: EntityId,
    tasks: Vec<EntityId>,              // stable admitted order; no copied Task records
    state: JobState,                 // active | completed | cancelled
}

struct Task {
    version: u8,
    job: EntityId,
    step: StepKey,                   // stable within pinned definition
    operation: TypedWorkOperation,
    state: TaskState,                // pending | completed(results) | cancelled
}

struct TaskResultBinding {
    slot: ResultSlot,
    entity: EntityId,                // reference to ordinary committed matter
}
```

`Job` and `Task` are canonical native ECS components on distinct job and task
entities. `Job.tasks` contains stable task identities, not embedded copies of task
records. `TaskState::Completed` contains that task's exact result bindings; there
is no second result map in `Kernel` or another result entity for the same fact.
`WorkAttempt.task` names the task entity directly. The native save owner persists
these components and rebuilds the derived ready-task index. Because the current
generic registry schema describes only primitive authored fields, dedicated
snapshot arrays may encode the canonical ECS Job/Task components as WorkAttempt
already does. They are serialization, not live maps or a second runtime owner;
never keep embedded Task copies in a live Job record or a separate results store.

The initial admitted shape is equivalent to the following closed records. Names
are illustrative; fit them to the existing native registry and action parser
without exporting Rust representation details to game code.

```rust
struct JobPlan {
    definition: DefinitionRef,
    party: EntityId,
    steps: Vec<StepSpec>,             // bounded and stable-keyed
}

struct StepSpec {
    key: StepKey,
    after: Option<StepKey>,           // sequence only in the first compiler
    operation: TypedWorkOperation,
}

enum EntityBinding {
    Exact(EntityId),
    Result { step: StepKey, slot: ResultSlot },
}
```

The trusted GamePack command compiles content definitions and selected targets
into this closed plan, then submits one native create-job operation through the
existing durable command transaction. Rust validates the whole plan before any
record appears: definition/version, party authority, unique step keys, backward
dependencies, compatible result slots, supported operation variants and the
fixed plan bound. It allocates stable job/task identities once. Command replay
therefore returns the existing committed job rather than creating a second one.
No browser callback or TypeScript system resumes the plan after admission.

`TaskResult` is a reference/binding, not inventory. The referenced entity remains
owned by its physical component and custody owner. A task result is created in the
same transaction as the physical entity or not at all. Replaying completion returns
the same binding. A dependent task pins the compatible result slot and resolves its
current location only when considered. Removing or transforming the physical item
invalidates or completes dependent intent through the job owner; it cannot cause a
replacement item to be synthesized.

The first compiler needs only `step`, `sequence` and the already-proved bounded
supply expansion. Add independent `all` only for an actual job whose tasks can run
concurrently under explicit resource-conflict rules. No loops, callbacks, arbitrary
conditions or recursive same-tick execution. Plan admission rejects duplicate step
keys, forward/incompatible result bindings, unsupported operations and excessive
size/depth. Pinned definition version plus stable step/result keys supply durable
retry identity.

### Task continuity and authored workpieces

Worker eligibility, the current WorkAttempt lease and durable task continuity are
three different facts. A task definition selects one closed continuity policy:

```rust
enum ContinuationPolicy {
    AnyEligible,                 // any currently eligible actor may resume
    PreferStarter,              // scheduling preference only; never blocks another actor
    BindOnFirstProgress,        // first committed labor binds this task to that actor
    AssignedActor(EntityId),    // explicit player/content decision before work starts
}

```

`WorkAttempt` remains the temporary exclusive lease while an actor executes a
task. Ending an attempt always releases that lease. For `BindOnFirstProgress`,
the same transaction that first commits meaningful labor records the author.
For an unfinished physical workpiece, the workpiece's owning module retains
that author together with its recipe identity and progress; tasks consult that
fact and do not store a competing author. For work without such a persistent
workpiece, binding can live on the task's owned execution state. The
[comparative study](09-systems-games-and-creator-study.md) explains this correction.

Later candidate discovery and actual admission honor the binding. Cancelling a
task and creating another for the same unfinished shield cannot erase its author
or reset its progress. Moving or storing it also cannot change authorship. Only
an explicitly supported game operation can reassign or salvage the workpiece.
Waiting for an absent bound actor does not retain an active worker attempt,
route or unrelated task reservation. The workpiece still occupies its actual
physical storage/bench space until moved; releasing labor cannot erase occupancy.

Quality-sensitive authored crafting is the first intended consumer. Once leather
and other inputs become an unfinished shield, that workpiece is an ordinary
physical entity with custody, position, recipe identity and progress. The shield
task may bind to its first leatherworker while separate supply and haul tasks stay
open to other eligible workers. Cancelling preserves or salvages the workpiece as
the recipe defines; it never silently returns pristine ingredients. Construction,
digging, tree felling and ordinary hauling default to `AnyEligible` unless their
definitions demonstrate a real continuity requirement.

This also keeps multi-stage animal processing composable: slaughter or skinning
may be one open task producing an exact carcass/hide result; tanning may be a
later open task; crafting a quality-bearing leather shield may bind only when its
own workpiece receives first labor. The parent job never becomes actor-owned.
Skill/tool requirements are evaluated for the current task before assignment and
again on admission. Continuity does not waive eligibility, and a worker becoming
ineligible leaves the task visibly waiting rather than letting another worker
silently change authorship.

Qualify open and author-bound work with actual physical progress, interruption,
task cancellation/recreation, hauling and restore. An isolated setter test does
not prove that binding and labor commit together. Quality timing is defined by
the game's first crafting consumer; the scheduler must not silently decide
whether start skill, finish skill or accumulated contribution determines quality.
Other policy variants do not require new machinery ahead of these real consumers.

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

### Simple bulk contents — accepted September 15 correction

This section supersedes the earlier per-ingredient mixture ledger, all-integer
property arithmetic, million-unit scale, rational/remainder bookkeeping and
exact-name clean-water proposals. Levi wants a small game simulation that can
produce a dirty mop bucket of goblin piss, shit and beer. This is the accepted
design; it is not a claim that the current kernel implements mixing.

#### Engine mechanics and game definitions

Rust owns physical storage, capacity, mixing, splitting, transfer, references and
atomic publication. Goblin supplies the definitions and gameplay meaning in
TypeScript. Compile definitions once at the existing GamePack admission boundary;
execute supported operations in Rust. Do not introduce a TypeScript per-tick
mixture loop, saved callbacks, expression language or separate scheduler.

**Engine blindness law:** the native engine knows only validated property IDs and
numeric amounts. It can conserve, mix, split, query and transform those amounts,
but it does not know that `filth` is dirt, `pathogens` are dangerous, `alcohol`
belongs in beer or a pail contains piss. Goblin definitions give those IDs their
meaning, author concentration predicates and name what the player sees. Those
definitions compile into bounded native tables; they do not run arbitrary
TypeScript during a tick. A pirate game can supply different properties without
forking the storage or transfer engine.

- Discrete goods retain integer counts, kind and custody: bread, tools, logs,
  pails and kegs. Their declared volume per unit determines storage occupancy.
- Bulk contents have a volume and a small definition-bounded set of additive
  property amounts. Examples for Goblin are filth, pathogens, nutrients and
  alcohol. Rust does not hardcode these property IDs or biological meanings.
- Game material definitions specify the properties contributed per unit of bulk
  volume. Work/process definitions specify supported input tests and changes.
  Concentration tests read property amount divided by bulk volume. An additional
  property or ingredient using these operations is definition data; a genuinely
  new behavior requires a deliberately added typed primitive.
- Only additive amounts use this mechanism. Names, color, temperature and pH
  cannot be naively added or proportionally split as amounts. They are outside
  this slice; do not build a generic property algebra for hypothetical consumers.

Illustrative shapes, not a parallel public API:

```ts
// Defined by the game, validated/compiled by the engine.
const properties = ["filth", "pathogens", "nutrients", "alcohol"];
const ingredient = {
  id: "goblin-urine",
  // Authored game-scale amounts per volume unit; numbers are tuning data.
  propertyAmountsPerVolume: { filth: 2, nutrients: 1 },
};

// Native canonical contents, attached to one actual Container entity.
type BulkContents = {
  volume: number;
  amounts: Readonly<Record<string, number>>;
};
```

A vessel is an ordinary discrete lot with Container capability. Its outside
volume is distinct from its internal capacity. A Lot+Container has quantity one;
its contents do not get counted again in its parent's occupied volume. Pails,
jars and kegs share these mechanics without item-name checks or WaterVessel
markers. A stockpile filter means wanted here; capacity means physically fits.

One open compartment has at most one `BulkContents` record on that container.
Bulk is not represented as several hidden ingredient `Lot` entities and is not a
second contents index. The existing container is its custody and identity owner.
Adding dirty liquid
mixes with what is already there; the caller cannot request just the clean water
back. Discrete items in the compartment remain individually retrievable. A loose
solid does not dissolve merely because it fits: an explicit cleaning/processing
operation consumes the relevant mess/material and adds its authored bulk volume
and properties. This is gameplay transformation, not a particle simulation.

#### Numbers and pouring

Use ordinary finite nonnegative Rust `f64` values for bulk volume and property
amounts. Fractions such as half a unit of pathogen load are allowed. Keep discrete
item counts and existing 0--7 terrain-water levels integer. Bulk volume uses the
same declared storage-volume unit as container capacity and item occupancy;
convert field portions through the existing water/volume owner. Do not assume
one water level equals one litre or invent a million-unit scale. The authored
unit conversion must be shared by field withdrawal, storage and pouring back.

Properties are total amounts, not concentrations or booleans. Doubling volume
with clean water leaves the pathogen amount unchanged and halves concentration.
There is no independently mutable clean flag. A full pail can always pour out;
incoming-capacity checks apply to the receiver, not the donor.

```text
preparePour(source, destination, requestedVolume):
    validate finite positive request <= source.volume
    validate custody, permission, current claims and receiving free volume
    ratio = requestedVolume / source.volume
    moved.volume = requestedVolume
    for property in stable compiled property order:
        moved.amount[property] = source.amount[property] if emptying source
                                 else source.amount[property] * ratio
        sourceAfter.amount[property] = source.amount[property] - moved.amount[property]
        destinationAfter.amount[property] = destination.amount[property] + moved.amount[property]
    sourceAfter.volume = source.volume - moved.volume
    destinationAfter.volume = destination.volume + moved.volume
    validate all prepared results are finite, nonnegative and within capacity
    if emptying source: move all remaining amounts and retire empty contents
    publish both changes + work progress + receipt in the existing transaction
```

Calculate each moved amount once. Debit and credit that value; never round each
side separately. Zero-volume state must have zero property amounts. Do not delete
small residues through epsilon cleanup or silently clamp invalid input. Reject
nonfinite/overflowing candidates before any mutation. Mathematical conservation
is approximate to floating-point precision; do not advertise exact arithmetic.
Use a documented scale-aware tolerance in numerical conservation assertions,
not as permission to create capacity or remove contamination in runtime code.
No rational denominators, remainder ledger or per-bacterium identity is needed.
Stable operation order and the same maintained Rust operations own replay;
floating point by itself is not evidence of nondeterministic replay.

Example: 8 volume units containing pathogen amount 1 pour into two equal buckets.
Each gets volume 4 and pathogen amount 0.5. Recombine them to recover volume 8 and
amount 1. Arbitrary thirds receive the same proportional treatment within normal
floating-point precision. Saving midway preserves the actual numbers.

#### Game rules and honest presentation

The game configures drinking/brewing requirements using supported property
concentration thresholds. Generic supply queries and final admission must use
the same predicate; a mixture named water can still fail. A successful treatment
changes only the configured properties through the process owner. For example,
a game recipe may reduce pathogens but leave filth; it must not silently turn
all contents into clean water. Recipes still own finite inputs, time and outputs.
Keep those concrete operations small instead of building a chemistry interpreter.

The UI may say **bucket of goblin piss, shit & beer**. A bounded set of game-owned
flavor tags can supply that label, joined in stable order when mixed and copied
on split, or the player can nickname the batch. Tags carry no ingredient amounts,
authority, safety or recipe eligibility. Do not retain an unlimited origin history
or generate a new material definition for every combination. Player/AI observation
reads the same actual volume and properties; labels never replace those facts.

#### Integration sequence and stop conditions

1. Finish the existing volume foundation first. One owner computes occupied and
   reserved volume, including each reservation's own material volume. Migrate
   output, transfer, carry admission, construction/salvage, process destinations,
   stockpile capacity and restore validation together. Declare required material
   definitions and reject missing references; no fallback unit-volume defaults.
2. Add bulk storage/transfer at that material owner and one real pail consumer.
   Replace the current special `LotWater` carrier at this cutover; do not retain
   parallel water-lot and bulk-content truths. Extend the maintained component
   registry with one bounded structured bulk record rather than encoding property
   maps into strings or creating one auxiliary ECS entity per property.
   Route changes through the current Region/WorkAttempt transaction and receipt.
   Resolve claims against the actual contents at final admission; do not create
   a second inventory or claim owner. A mix that invalidates an input requirement
   releases/blocks the affected work through its existing lifecycle. Draft retains
   physical contents and releases only the appropriate work reservations.
3. Join supply and brewing to the same property-aware input rule. The automatic
   scheduler remains the single Rust scheduler; it asks the material owner to
   resolve/prepare operations rather than inspecting property maps itself.
4. Join field withdrawal/pour through the existing accepted water transfer. Until
   fields carry these properties, reject a contaminated pour into a field rather
   than dropping the properties. Do not claim river pollution from bucket tests.
   A later field join must carry the same property amounts along accepted flows,
   with no second water solver, whole-world scans or per-particle simulation.

First consolidated scenario: mix clean liquid, dirty mop contents and beer in a
real held container; split an odd amount, mix again, save/restore mid-haul and
complete the same delivery. Assert fractional properties, dilution, preserved
volume/properties within documented numerical tolerance, capacity including
concurrent reservations, Draft custody, and retry without duplicated transfer.
Assert ordinary bread/tools remain distinct, polluted supply fails the recipe's
actual predicate, and full-container pouring out succeeds. A second ingredient
and a game-defined property ID must work without editing the Rust dispatcher.
Add focused rejection cases for invalid numeric inputs and stale capacity/claims.
Reuse existing lifecycle coverage rather than cloning the full scenario per rule.

Current source checkpoint: the material-vessel-catalog lane returned clean commit
`efb2e833d058af48a84495405dd869cd31586799` for the volume foundation. It is an
unaccepted candidate pending Root's focused source and behavioral review. Its
reported cargo check is compilation evidence only; it does not establish mixture,
capacity, replay or hosted acceptance. Do not resume the superseded ingredient
ledger implementation when lowering the model.

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

Tree work is the first job/task composition proof above. Felling and chopping have
separate authored durations and native task progress. Felling atomically publishes
a real trunk item and stump; chopping later consumes that exact item into logs.
Animation reads each current task and never completes it. Do not extend one native
resource-extraction stage enum to hide the intermediate trunk. Herbs keep their
existing resource-stage definitions because tending does not create an independently
haulable intermediate at every timer boundary. Dig yields stay on the ground under
the existing material owner, with hauling a separate lower-priority task.

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
4. **Dig/tree/resource:** migrate their actual progress/intent and commands,
   including original durations, ground yields and plant water requirements. Prove
   first-class multi-task jobs with separate fell and chop tasks joined by a real
   felled-trunk item; no hidden tree stage or automatic matter teleportation.
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

### Floor storage is policy over physical ground

The current implementation that installs `Container` capacity on every
`StockpileCell` is superseded. A painted stockpile cell is saved policy and a
presentation mark: zone identity, owning party, accepted-goods filter and
priority. It does not own contents and does not increase ground capacity. The
paint remains visible by default and belongs to the independently toggleable
**Storage areas** presentation layer.

Every loose item remains in an ordinary positioned `GroundStock` pile. The
material/ground-placement owner, not the stockpile command, decides whether a
compatible stack has space, whether the delivered portion joins that physical
pile, or whether the cell is unavailable. Incoming reservations name the exact
ground cell and count against the same ordinary stack limit. They never reserve
capacity on the policy entity. Removing, shrinking or changing a zone leaves
physical piles in place and changes only future destination eligibility.

A real shelf, rack, vessel or machine buffer is a real container and retains its
own physical capacity. A storage provider built over a painted stockpile cell
inherits that cell's filter and priority by default. The provider becomes the
physical destination while it exists; the paint remains beneath it and resumes
ordinary floor storage if the provider is removed. An explicit provider policy
may override inheritance later. Policy resolution is a query; it does not copy
zone settings during construction or create a second contents list.

The first implementation must replace tests that assert hidden cell-container
contents with laws proving: designation moves nothing; a pile remains rendered
and pickable; compatible delivery creates or uses ordinary ground stock; an
incompatible stack is unavailable; the ordinary stack limit also bounds incoming
reservations; zone edits leave lots in place; shelf inheritance resolves live;
and save/reload preserves the same lot, pile, policy and reservation identities.
Do not activate native stockpile planning until its exact-cell ground deposit,
cancellation and blocked/interrupted recovery all share the material owner.

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
