# Scripted engine authoring: Godot, GameMaker and focused comparisons

**Read first:** the [packet's creator API rule](README.md#read-first-preserve-the-accepted-creator-api)
requires `.with()`, `.where()` and `.do()` wherever that composition fits. Apply
this to each capability instead of inventing separate public authoring patterns.
Named predicates/actions support the fluent model; underlying native operations
continue to enforce ownership and commit laws. New syntax needs a demonstrated
gap, not merely a new feature example.

September 15, 2026. Personal research and Hive source review at `d71902d8`.
The definition-building API and cross-behavior batching below are accepted design
direction, not an installed API or permission to restart paused implementation.
Read with [the creator study](09-systems-games-and-creator-study.md) and
[ownership audit](08-engine-ownership-audit.md).

Follow-through: [section 12](12-actor-lifecycle-relations-and-access.md) now owns
the exact actor creation, membership/ownership, access and cleanup contracts.
Its explicit operation roles replace inferred party scope. Keep the prepared
behavior/query contract below; do not invent another actor runtime to implement
the lifecycle or a separate registry for permission rules.

## Judgment

Hive should support ordinary TypeScript behavior over native Rust mechanisms.
Configuration is excellent for another recipe; it cannot express every new game.
A creator should be able to write a creature's decisions or an unusual cannon
effect without adding a Rust variant for that particular piece of content.
Native mechanisms still own movement, physical resources and their invariants.
Colony assignment is an optional mechanism, not a prerequisite for an individual
creature to request movement.

Keep the existing GamePack/system/command foundation. Improve its query and
behavior lifecycle rather than introducing a competing actor runtime. A game
entity is not a Durable Object, a network connection or an LLM agent. One Region
hosts many entities and their behavior.

## Accepted authoring contract: definitions and shared query batches

September 15 follow-through, accepted by Levi after inspecting the current engine
and Botanical APIs. This supersedes the returned-array, lifecycle-hook and earlier
builder sketches as the recommended creator surface. The ECS ownership laws below
remain binding. The following is target syntax, not a claim that it is exported:

```ts
const catLife = behavior("cat-life", scene => {
  const cats = scene.find(Cat);

  cats.where(inDanger).do(flee);
  cats.where(safe).do(wander);
});

const brewing = behavior("brewing", scene => {
  scene.find(BrewStation)
    .where(needsAnotherBatch)
    .do(brew(mugwortBeer));
});
```

### Actor definitions compose capabilities and behaviors

Final September 15 naming/composition decision: use `actor`, not `thing`.
Vishnu's "many actors, one world" is game vocabulary, not a promise of the
concurrency actor model. An actor definition composes capabilities, initial data
and behaviors; a spawned instance has stable identity and ECS state. A behavior
proposes decisions; shared systems evaluate and execute work. An inert food pack
is also an actor. No per-instance mailbox, thread, DO or independent update loop.

```ts
const beerTree = actor("beer-tree")
  .with(Body, treeBody)
  .with(Growth, perennialGrowth)
  .with(Contents, sapCapacity)
  .with(Production, beerFermentation)
  .behaves(grow, fermentSap, sprayWhenStruck);
```

This is accepted target vocabulary/composition, not an installed export. `with`
and `behaves` build a definition; they neither create world entities nor perform
physical work. Spawning uses the existing admitted entity creation owner. Definitions
must not share mutable initial component objects between instances.

The attachment seam needs explicit implementation laws, not a second system:

- Reusable behaviors declare required capabilities and reads. Validate them when
  the pack is prepared; report missing capabilities and conflicting definitions
  before starting the world. Never silently add physical capability from artwork.
- Attached behavior subjects are the instances carrying that attachment. A shared
  `grow` definition must not run once for each actor definition over every plant
  in the world. Compile attachments into stable membership selection, then batch
  across those selections. Related-entity queries remain separately declared.
- A reusable attached behavior must not need to close over the actor definition
  being constructed. Provide its typed subject selection through preparation.
  The exact TypeScript spelling for that selection must be reviewed alongside
  `scene.find(...)`; do not invent a second query DSL to avoid the question.
- Give behavior definitions and configured attachments stable identity. Reject an
  accidental duplicate attachment; intentional differently configured instances
  need explicit distinct identity. Do not depend on JS function/object identity
  for replay, cache keys or saved operation identity. Register shared definitions
  once and retain per-actor progress only in canonical components.
- Attachment does not grant write authority. Multiple behaviors may propose work
  to one capability owner; they do not each become component mutation owners.
  Existing GamePack write-owner checks must remain meaningful. Preparation must
  establish the single owner and explicit conflict policy for shared proposals.
- Named game concepts such as `Plant`, `BrewStation`, `Zombie` and `BeerTree` are
  game definitions/tags over capabilities, not closed engine type cases. Contents
  can belong to a barrel, stomach or tree; production can belong to a moving actor;
  growth can describe a plant, crystal or tumor. Do not encode those names in
  shared scheduling, transport, query planning or physical execution.

### Creator flexibility and handoff gate

The public building blocks cannot be a closed list of Goblin predicates/actions.
Authors can define components, deterministic predicates, action producers and
recipes in TypeScript, declaring their reads and producing supported operations.
Native Rust retains physical invariants. A genuinely new physical mechanism can
require a new native primitive; a new combination of supported mechanics should
not. "Production" does not require colony labor unless its recipe requests labor.

Use these consumers to keep the boundary honest:

- Zombie chase/bite/wander uses perception and movement without colony assignment.
- Survivor movement input retains the existing prediction/reconciliation path;
  bleeding may coexist with movement through separate owned operations.
- Food mold and plant growth use elapsed simulation time and game-defined rates,
  allowing infrequent due evaluation. They do not add a fixed amount per callback.
  Coupled growth/resource consumption must commit as one supported operation.
- Leaking contents use the transfer owner, preserving volume and mixture properties.
- Brewing requests an identifiable process once. Cannon shots and impact effects
  preserve order/event identity, ammunition and exactly-once physical settlement;
  event selection is not an ordinary persistent entity query. Do not create a
  second event bus or claim a `ProjectileImpact` component already exists.

First implement/review the existing cat through the real GamePack and native
movement path, including batched reads and interruption. Then cannon and brewing
exercise game-authored effects and shared process execution. Before broad migration,
show one unusual combination (for example the beer tree) using the same definitions,
without a content-name branch or new simulation owner. Reuse existing demos/tests;
do not begin a separate showcase project or block the playable repair on new art.

Consolidate actor-composition assertions into those consumer proofs: shared behavior
serves different actor definitions once per eligible subject; unrelated subjects
are excluded; duplicate/missing/conflicting attachments fail during preparation;
instances retain independent state across restore; destroying an actor leaves no
private loop or pending attachment execution. Also prove the phase/batching and
operation laws below. The "Edmund" criterion is approachable expressive authorship,
not a claim that any particular creator would adopt the engine.

The next implementer should follow this contract, not reopen broad API research.
Exact predicate/action helper types, attached-subject spelling and operation-specific
conflict policies remain bounded design tasks: review their first real caller before
expanding. Do not fill those seams with arbitrary priority numbers, silent overrides,
compatibility adapters or a general JavaScript interpreter. No runtime implementation,
performance result or deployment is claimed by this document update.

### Build definitions; evaluate decisions; commit through existing owners

- The `behavior` callback runs during GamePack preparation. `scene` is a scoped
  definition builder, not the renderer scene or a mutable world. `find` describes
  a typed ECS selection; `where` records a predicate; `do` records an action branch.
  No returned request array, explicit flush, or per-entity runtime is required.
  Internal collection during definition construction does not mutate simulation.
- Each filter produces an independent narrowed selection. Chained filters mean
  intersection; branching from `cats` does not change `cats`. At runtime predicates
  and action producers read the same decision view and produce requests, not effects.
- Reusable predicates/actions declare their component, lookup and outcome reads
  at definition time. Their bodies can be ordinary deterministic TypeScript.
  Do not infer dependencies by executing user code speculatively or pretend to
  compile arbitrary JavaScript predicates into native queries. Exact helper types
  must be checked against cat, cannon and brewing before expanding the surface.
- Simulation time and seeded randomness come through declared engine inputs.
  Saved behavioral state uses authored ECS components. Closure variables cannot
  become persistent actor state; asynchronous model/network calls do not enter
  this synchronous decision evaluation. Scoped views cannot outlive evaluation.
- The existing GamePack system path evaluates prepared behaviors. One integration
  owner gathers proposed component edits and physical requests, validates authority
  and submits through the existing native/Region commitment path. Preserve declared
  component write ownership; behavior composition cannot create duplicate writers.
  No new command registry, actor scheduler, event ledger or parallel executor.
- Overlapping branches may propose compatible actions. Competing exclusive requests
  for one actor require an explicit resolution policy or an ordinary conflict result;
  neither registration order nor last-write-wins silently chooses movement. The
  illustrative `safe` and `inDanger` predicates are complementary by game definition,
  not a special engine rule. A blocked flee is not an implicit fallback to wander.
- Existing operation identity and lifecycle must distinguish continuation, replacement
  and new work. Re-evaluation must not restart a route or repeatedly enqueue beer.
  Changed movement joins the interruption owner; native process requests retain
  identity through completion. Due decisions and retained outcomes join existing
  lifecycle ownership, with current-format restore and atomic durable commitment.
  These capabilities need caller proof; the friendly syntax does not establish them.
- Brewing requests the configured process. Rust owns task dependencies, finite
  materials, parallel deliveries, worker assignment, fermentation and completion.
  Do not move those mechanics into TypeScript predicates or per-tick callbacks.

### Batch across behaviors in one world decision step

A behavior is an authoring unit, not an isolated query engine. Prepare requirement
plans at GamePack installation; execute the portion needed by currently due
behaviors, using one coherent read view for that decision phase.

1. Reuse identical selections and component reads across due behaviors. A cat
   danger behavior and a cat hunger behavior can share cat positions without
   sharing their eligibility conditions or forcing an intersection of Threat
   and Hunger membership. Optional component absence must retain its meaning.
2. Share overlapping reads when useful, but do not fetch the union of the entire
   world's data as an optimization. Preserve native component/spatial indexes,
   requested fields, scope, stable entity identity and bounded residency.
3. Run arbitrary predicates against the fetched data. Separate conditions still
   cost evaluation; query batching does not eliminate all loops or predicate work.
   Never memoize arbitrary predicates as equivalent merely because they look alike.
4. A dependent search, such as food near the hungry cats selected in the first
   stage, forms a subsequent batched stage. Group those native spatial requests;
   do not turn each result into another unrestricted world query. Dependencies
   and stages are explicit, not callback recursion into an active Rust borrow.
5. All branches in the phase observe the same facts. Proposed effects do not alter
   another branch's reads. Dependent query stages refine data acquisition against
   that view, not simulate one branch's mutations before another. Existing create/
   remove overlays must also be accounted for when freezing the phase view.
6. Batching is local to one world runtime. No global tick barrier across DOs.
   Sleeping behaviors do not participate just to fill a batch. Apply fair bounded
   due-work handling through the existing lifecycle; expose waiting/deferred reasons.
7. Caches contain derived plans or phase-local results, never independent truth.
   Rebuild after restore; invalidate prepared definitions when the pack changes.
   Reuse result data beyond a phase only with canonical invalidation/version evidence.

### Collection-to-execution walkthrough

September 15 requested implementation walkthrough. Names below are pseudocode,
not extra public APIs or a second runtime. Fit these responsibilities into the
existing GamePack preparation, session step and native query bridge.

```ts
// During pack preparation; no world reads or physical execution here.
function prepareGame(pack) {
  const definitions = collectBehaviorDefinitions(pack);
  const attachments = collectActorAttachments(pack);
  validateCapabilitiesAndOwnership(definitions, attachments);
  return prepareSharedQueries({ definitions, attachments });
}
```

`find(Cat).where(inDanger).do(flee)` records a subject selection and a branch,
not a query result. Predicates/actions declare reads when defined:

```ts
const inDanger = condition({
  reads: [Threat],
  test: cat => cat.threat.level > 0,
});
// Conceptual recorded branch:
// { subjects: [Cat], conditions: [inDanger], action: flee }
```

The prepared plan holds stable definition/branch identity, attachment scope,
component membership, required fields/lookups, declared dependencies and operation
requirements. Preserve required versus optional reads: Cat+Threat and Cat+Hunger
must not accidentally become Cat+Threat+Hunger. Share underlying Position reads
where beneficial without changing either set of subjects.

```ts
// Inside the existing session decision phase.
function decide(world, preparedGame) {
  const due = world.behaviors.collectDue();
  const queries = preparedGame.queries.requiredBy(due);
  const facts = world.readBatch(queries);
  const proposals = preparedGame.evaluate(due, facts);
  return world.prepareActions(proposals);
}

function readBatch(queries) {
  const uniqueReads = shareRepeatedReads(queries);
  return native.readSelectedComponents(uniqueReads);
}
```

`world.behaviors` denotes responsibility within the existing lifecycle, not a new
actor service. Sharing keys derive from declared selection structure, scope,
parameters, fields and phase identity, never guessed equivalence of JavaScript
functions. Each caller receives its requested typed view. Use a bounded shared
native read per appropriate batch, not a JSON roundtrip per actor or predicate.

Dependent queries have an explicit next stage against the same read view:

```text
read hungry subjects and positions
    -> evaluate which need food
    -> collect bounded nearby-food searches
    -> batch native spatial searches
    -> produce eating/movement requests
```

No unbounded dependency recursion. Inspect/validate the prepared dependency graph;
query stages cannot execute physical effects to produce their next inputs. Native
execution outcomes arrive through the existing subsequent phase/event lifecycle.

```ts
const preparedActions = decide(world, preparedGame);
// Existing commitment responsibility, not a newly introduced commit API:
commitStep({
  authoredChanges: preparedActions.componentChanges,
  physicalRequests: preparedActions.operations,
});
```

Map implementation to `sdk/authoring.ts` (record/validate definitions),
`runtime/session.ts` (prepare/evaluate due plans and gather proposals), and
`runtime/wasm-kernel.ts` plus native query ownership (shared selected reads).
Keep declarations and hot evaluation in deep modules, not one giant session method.
`prepareActions` does not imply admission is already committed. Preserve the
existing native/Region transaction, results and replay boundary. Behavioral state,
request identity and physical effects cannot be acknowledged independently.

### Multi-task jobs and optional statecharts use the same owners

Rules describe decisions; jobs describe tasks; statecharts can describe genuinely
branching process progression. They are different authoring views, not three
schedulers. A linear recipe remains sufficient for a linear job:

```ts
const makeShield = job("make-shield")
  .task(cutLeather)
  .task(stitchShield, { continuation: "original-worker" })
  .task(finishShield);
```

Illustrative syntax, not an installed job builder. Each task defines requirements,
work and physical results through the native work contract. Cutting produces a
real unfinished item. Stitching may acquire its initiating worker identity once
started; waiting/resuming that stage retains the restriction. Other stages need
not inherit it. Cancellation preserves committed items and releases active claims
through their owner; actor loss follows the explicit task continuity policy rather
than guessing a substitute. See section 07's task-continuity rules.

```text
Cut leather --committed task completed--> Stitch shield
Stitch shield --committed task completed--> Finish shield
Finish shield --committed task completed--> Done
```

Missing leather, busy workers and temporary access failure wait within the task.
The chart does not recreate hauling, reservations, pathfinding or worker assignment.
It requests one identifiable task and consumes its retained completion outcome.
Chart progression owns only progression; the task owner owns physical execution.
If a compiled sequence/chart represents job progression, replace the superseded
progression fields/path rather than keeping a native job cursor and a second chart
cursor as competing truth.

Conceptual integration for the supported native profile:

```ts
function prepareGame(pack) {
  const rules = prepareBehaviors(pack.behaviors);
  const jobs = prepareJobCharts(pack.jobs);
  return prepareSharedQueries(rules, jobs);
}

const due = collectDueBehaviorsAndJobTransitions();
const facts = readSharedBatches(due);
const proposals = evaluate(due, facts);
prepareExistingOperations(proposals);
```

This shows shared responsibility, not a requirement to ship native jobs into TS.
Native task scheduling and native chart guards execute in Rust; prepare compatible
read requirements together where useful, retaining native access and avoiding
roundtrips merely to make the pseudocode literal. Due transitions come from native
retained events/deadlines, not polling every task each tick. Each owner decides
eligibility/admission; a shared read cache is not proof of free resources.

XState-compatible authoring is still a bounded compatibility evaluation. Do not
start a live XState interpreter per job. The intended native profile validates and
compiles a supported declarative subset of states, transitions, guards and task
requests into owned Rust progression. JavaScript runs at authoring/build time to
produce that data; arbitrary callbacks, promises, invoked actors and wall-clock
timers do not become native-compatible by appearing in a chart. Unsupported
constructs fail during preparation. Deterministic ordinary TypeScript behaviors
remain supported separately through the same decision/operation boundary.

Follow section 08's existing XState qualification before choosing an executor:
record supported semantics and compare actual transitions; JSON shape alone is not
compatibility. The pseudocode does not authorize a dependency upgrade, general
interpreter or two maintained authoritative executors. Browser gesture XState
remains distinct from authoritative job progression.

Completion event consumption, progression and next-task admission must recover
without duplicate effects after retry/reload. Extend the consolidated real job
proof with: waiting without worker monopolization, original-worker stitching,
physical intermediate-item preservation, and duplicate completion-event delivery.
Use a branching consumer only when needed to justify a statechart over the existing
sequence. Neither a simple recipe nor the current playable repair must wait for
full XState support.

### Actual integration work and acceptance

The source review identified real work, not a ready-made lazy runtime:

- `engine/src/sdk/authoring.ts` currently invokes imperative `run(context)` callbacks.
  Introduce the prepared definition evaluator into this existing system boundary;
  migrate the real callers instead of retaining a second authoring execution path.
- `engine/src/runtime/session.ts` enforces one component write owner and stages
  actions before `port.advance`. Its queries use queued pre-step writes, not all
  earlier system writes. Preserve explicit phase semantics. It also currently
  throws beyond 128 system actions per step: batching reads does not solve action
  pressure. Integrate bounded admission/deferred work without dropping requests,
  acknowledging uncommitted work or converting ordinary load into world failure.
- `engine/src/runtime/wasm-kernel.ts` currently serializes component query IDs and
  parses JSON rows per call. Shared prepared reads must replace repeated hot-path
  crossings; use measured bounded batch buffers/handles where appropriate. Do not
  claim zero-copy or promise speed from renaming the current query wrapper.
- `engine/src/games/colony-cat.ts` repeats destination and home-position searches
  and manages decision delays itself. Use it as the first actual migration, then
  cannon behavior and a brewing request. Native physical algorithms are retained;
  add only missing query/lifecycle support at their actual owner.

Consolidate acceptance into real-consumer scenarios: shared selections fetch once
per phase; different membership sets remain correct; dependent searches batch;
filter branches are independent; compatible requests coexist and conflicting ones
have explicit outcomes; continuation does not restart movement; flee interruption
and unreachable destinations settle; brewing does not duplicate batches; sleeping
actors avoid scans; save/reload retains identities and behavior state without a
parallel snapshot. Measure boundary calls, selected rows, bytes and decision work,
including overload/deferred behavior. Source review is not performance acceptance.

### Botanical comparison

Read-only sources inspected in `Botanical-lane-integration`:
`packages/mycelium/src/index.ts`, `packages/knapsack/src/index.ts` and their READMEs.
Mycelium separates operation/module definitions from runtime construction and
immutable capability leases, exposing a Promise facade over Effect internals.
Knapsack contributes sources while providers retain operation ownership. Adopt
that separation of definitions, preparation and owned execution. These packages
are not game-query optimizers and do not supply the batching described above.
Effect may support internal orchestration; it neither discovers arbitrary callback
reads nor grants durable game commitment. No mandatory Effect API for creators,
per-actor fibers, or new dependency installation is implied by this decision.

## Research scope and limits

Reviewed the linked official engine manuals and API examples, and the Hive
files below. GameMaker findings are a public-contract audit, not an inspection
of its proprietary runner. The supporting engines are focused comparisons,
not complete engine source audits. No performance measurements or proof of
DO compatibility were produced. None of these references establishes Hive's
crash durability or population capacity.

## Godot: reusable objects over native services

[Resources](https://docs.godotengine.org/en/stable/tutorials/scripting/resources.html)
separate reusable data from running nodes. Resources can contain subresources,
serialize and expose editable properties. For Hive, pack definitions and assets
should similarly compose before runtime; per-instance state must remain distinct
from shared defaults. Reusing a recipe must not share its running process state.

[Scene organization](https://docs.godotengine.org/en/stable/tutorials/best_practices/scene_organization.html)
emphasizes self-contained scenes and explicit external dependencies. Adopt that
test for a creature or station bundle: dependencies should be supplied, not found
through Clearing globals or a fixed scene path. We do not need to copy Godot's
inheritance tree or make Bevy entities into scene nodes.

[Low-level servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
provide native services beneath the scene layer. Godot allows bypassing scene
objects, with opaque resource handles, for demanding workloads. These are local
engine services, not network servers. Its warning about controlling the same
resource through competing layers reinforces our single-mutation-owner rule.

Apply that shape: friendly behavior operations and bulk operations must reach
the same native owner. An individual walk request and a formation's batch of
walk requests cannot become separate movement implementations. Do not expose
raw Bevy storage or long-lived borrowed pointers to TypeScript.

## GameMaker: the creator can find where the behavior lives

[Objects and instances](https://manual.gamemaker.io/monthly/en/Quick_Start_Guide/Objects_And_Instances.htm)
give creators recognizable lifecycle locations: initialize an instance, react
to an event, update behavior, draw it. Hive should offer equally clear entry
points for initialization, due decisions, command outcomes and impacts.
Authors should not manage the scheduler's internal maps or material cleanup.

The [nearest-instance operation](https://manual.gamemaker.io/beta/en/GameMaker_Language/GML_Reference/Asset_Management/Instances/instance_nearest.htm)
is an example of a useful direct query. Its documentation does not prove a
particular complexity or spatial index. Hive's equivalent must specify query
scope, eligibility, limits and tie ordering. Nearest is not reachable; neither
should silently mean a colony worker assignment.

[Event order](https://manual.gamemaker.io/lts/en/The_Asset_Editors/Object_Properties/Event_Order.htm)
guarantees phases but not instance order within each event across platforms.
We should copy the approachable event model while specifying our own deterministic
phase, system and entity ordering. A generic callback list does not supply that.

The [debugger](https://gamemaker.io/en/tutorials/debugger) makes live instance
state inspectable. Hive needs a similarly useful answer to "why is Sedge waiting?":
current behavior, native operation identity, most recent outcome and next wake.
This is an ordinary query projection, not a second job ledger.

## Defold: the closest scripting/native comparison

[Script components](https://defold.com/manuals/script/) expose lifecycle callbacks,
per-instance state, messages and hot reload. The manual explicitly recommends
reactive behavior over unnecessary per-frame polling. This is particularly
relevant to our current cat: waiting should normally cost a scheduled wake or
relevant notification, not a repeated world scan.

[Script properties](https://defold.com/manuals/script-properties/) expose defaults
and instance overrides; [native extensions](https://defold.com/manuals/extensions/)
provide an escape hatch when scripting is insufficient. Hive should likewise
support both TS game rules and native extensions, without claiming every new
high-volume mechanic will perform well in script. Lua/native costs are not a
benchmark for JS/Wasm.

Do not copy in-memory timers as durable state. Hive wakes need saved simulation
deadlines and named handlers; a closure or Promise waiting in RAM cannot own an
acknowledged future effect.

## LÖVE: a simplicity test

[LÖVE's API](https://love2d.org/wiki/love) centers on load, update and draw callbacks
over modules such as graphics and physics. Its lesson is a small understandable
surface that leaves room for ordinary code. A creator should not learn a universal
workflow language before making a character move or a projectile explode.

Hive needs more explicit persistence and authority than this callback surface
provides. Keep that work inside the engine/host instead of making every author
write it. Do not interpret LÖVE's simplicity as requiring every entity to tick.

## Source and Garry's Mod: multiplayer authorship

[Valve's networking explanation](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking)
distinguishes authoritative simulation, client prediction and interpolation.
These are separate from our local JS/Wasm calls. Remote clients receive selected
world information; a local behavior query should not use the network projection
or rebuild the entire world in JS.

[Garry's Mod realms](https://wiki.facepunch.com/gmod/States) make server and client
Lua environments explicit. Shared code is not shared memory. This is a useful
reference for user-authored multiplayer games: server rules, client effects and
shared definitions can coexist without making rendering authoritative.
It is not a ready-made persistent Region transaction or permission model.

## Unity Entities: one narrow lesson

[SystemAPI.Query](https://docs.unity3d.com/Packages/com.unity.entities@1.0/manual/systems-systemapi-query.html)
uses generated queries and type handles; its documentation describes their caching
and update requirements. The lesson is to prepare repeated access patterns rather
than rebuild generic object graphs repeatedly. Do not copy Unity's complete
GameObject/ECS integration or equate an entity command buffer with a database
transaction. This reference is the documented Entities 1.0 API, not a current
package adoption recommendation.

## Actual Hive source findings

- `engine/src/sdk/authoring.ts`: `component`, `query`, `system` and `command`
  already exist. Systems declare reads/writes and an optional `every` interval.
  Commands parse their input. This is useful foundation, not something to discard.
- `engine/src/runtime/session.ts:830-963`: systems run over a staged context,
  interval checks skip their callbacks, impacts can be consumed, writes/actions
  are collected before native `advance`. A system loop still visits registered
  systems; interval support is not a per-entity due-work index.
- `engine/src/runtime/wasm-kernel.ts:614`: a generic query serializes component
  IDs, receives JSON, parses it and creates JS row wrappers. Many other local
  bindings also use JSON. This is not zero-copy or a handle-based query ABI.
  Costs have not been measured in this audit; it is not proof that this is the
  current dominant lag source.
- `engine/src/games/colony-cat.ts:73`: runs every tick, builds a destination set,
  searches destination rows again for each cat and queries home positions. Its
  own saved deadline is checked after some of that work. It is a concrete consumer
  for due decisions, direct lookup and targeted outcomes.
- `engine/src/games/formations.ts:20`: cannon impacts already drive TS-authored
  health/morale changes and native displacement. Preserve this evidence that
  expressive game rules can use shared physical operations without colony labor.

## Accepted clarification: hooks are ECS authoring, not a second runtime

Levi confirmed this boundary on September 15 after the research discussion.
These ownership constraints survive the accepted definition-builder API above.
Hooks are optional implementation/authoring helpers, not a competing recommended
public interface. "Little actors" describes an author's mental model only.

- **Components hold per-entity state.** Mode, target, due simulation time and
  retained operation references use the existing authored-component/state owner.
  Hooks must not introduce parallel JS objects that own position, inventory,
  behavior progress or saved timers. Callback-local scratch data is temporary.
- **Systems execute behavior.** Extend the existing GamePack `system` execution
  path. Entity-level hooks, if useful, are dispatched by that path for matching
  due entities or retained outcomes. Do not add an actor registry, independent
  actor scheduler, per-entity event loop, second message bus or separate save log.
  Behavior wake scheduling is an extension of the existing simulation lifecycle,
  not a replacement or duplicate of native colony task assignment.
- **Definitions compose capabilities.** A content definition selects components,
  behavior and configuration. One immutable behavior definition serves many
  entities. New supported recipes/breeds normally add data; new decisions may
  use ordinary TS code through the existing operations. No instance inheritance
  hierarchy or universal entity object full of optional features is required.
- **Native operations keep ownership.** A hook submits a movement, transfer or
  other supported intent. The existing native owner executes it and identifies
  its outcome. Hooks do not implement competing pathfinding, material custody,
  reservation cleanup or worker/job pairing.
- **Batch execution remains first-class.** Ordinary systems may process groups
  directly. Per-entity hook syntax must not require one callback per entity per
  tick. Waiting entities are selected by due work or relevant outcomes; derived
  indexes are rebuilt from canonical state and updated by its mutation owner.
- **State machines use this same path.** An optional state-machine authoring
  helper stores its state through the component owner and emits existing
  operations. It does not acquire independent timers, persistence or physical
  mutation authority. Do not install a second actor runtime to support hooks.

Before extending the SDK, read `sdk/authoring.ts`, `runtime/session.ts` and the
cat/cannon callers listed above. Show which existing system the hooks simplify
and which caller bookkeeping disappears. The existing command, query, staged
write and Region commitment paths remain the integration points.

Acceptance must demonstrate: multiple entities share one behavior definition
while retaining independent component state; restoring state does not require a
parallel actor snapshot; destruction/cancellation leaves no independent timer
or subscription alive; native completion/interruption reaches the existing
system lifecycle; batch and hook authorship use the same mutation path and
defined ordering. Consolidate these assertions into the real cat/cannon lifecycle
proof rather than constructing a second demonstration runtime.

## Proposed contract to settle before implementation

1. **One saved behavior state.** Use the existing authored-component owner for
   behavior mode, target and due time. Do not add mutable JS instance fields that
   secretly become a second saved world. Shared configuration is separate.
2. **Explicit execution phases.** At a simulation boundary, deliver retained
   outcomes and due decisions in stable order. Stage behavior edits and operations;
   run native mechanics at the specified phase. Deliver resulting events at the
   next declared phase, avoiding recursive callbacks into an active Rust borrow.
   Existing overlay visibility must be documented before changing its semantics.
3. **Useful queries.** Prepare component queries once. Provide entity lookup and
   spatial predicates with bounded result sets. Return selected fields in batches.
   Derived indexes belong beside native mutation and rebuild after restore.
   Define whether limits apply before or after eligibility; never starve eligible
   candidates behind excluded entries.
4. **A measured local ABI.** Keep low-volume definitions/diagnostics readable.
   For hot reads, evaluate compact numeric buffers and handles rather than JSON
   rows. Prefer a bounded copied buffer initially over unsafe "zero-copy" lifetime
   tricks. Handles are temporary access tokens; saved state uses stable IDs.
   Compare call count, bytes, allocations and native work independently.
5. **Ordinary operations with outcomes.** A behavior requests movement, transfer
   or an effect. Its native owner supplies acceptance and completion/interruption
   outcomes with identity. It does not make the behavior poll position equality
   or reconstruct delivery bookkeeping. Requesting is not completing.
6. **One durable commitment.** Behavior state, due work, admitted physical changes
   and retained outcomes must survive together through the existing Region owner.
   The local staged-action code above alone does not prove crash atomicity. Verify
   that owner and its failure path before activating new scheduling. External
   model/network calls remain outside the deterministic step.
7. **Optional machines.** A small function, explicit state machine or XState-based
   authoring layer can use this same lifecycle. No mandatory statechart for every
   entity and no Rust interpreter for arbitrary TypeScript. Machine state is saved
   data; engine operations retain their own invariants. Machine timers/side effects
   must join the host lifecycle before claiming durable support.

The accepted creator shape is the definition builder above. Outcome delivery and
saved wakes remain lifecycle requirements, not a separate hook framework.

## Composition examples and proof obligations

September 15, accepted discussion with Levi. The examples below specify design
fit and review obligations; the helper names are pseudocode, not exported APIs.
They do not expand the current Clearing repair into implementing a backpack UI,
trading game or quest editor before delivery.

### Actors are things; capabilities supply shared behavior

A physical backpack is an actor with inventory. Inventory itself is a capability
provided by a module: canonical component data, queries, typed intents and shared
systems. The module registers its systems once; each actor has independent ECS
data. No actor receives a private inventory runtime or tick loop.

```ts
const backpack = actor("backpack")
  .with(portable)
  .with(inventory, {
    grid: { columns: 6, rows: 4 },
  });
```

A person carries or equips the backpack through the physical custody owner.
Dropping or transferring the backpack preserves its identity and its contents;
items remain inside that same container. A chest can compose the same inventory
capability. A person's pockets or abstract carrying space may attach inventory
directly to the person; a separate bag actor is needed when the bag has its own
identity, equipment relationship or lifecycle. Containment must reject cycles;
recursive mass accounting must count each physical object once.

Inventory builds on the existing lot/container/transfer owner, not a parallel
backpack contents list. Optional grid placement adds fit and occupancy constraints
to that owner. A sword's footprint differs from its world geometry. A pail keeps
its footprint while its contents affect carried mass. Client placement ghosts
are temporary UI state; Rust owns committed placement and custody. Equipment is
a separate attachment/usage concern, not implicitly granted by inventory.

### One creator shape, explicit operations underneath

Actor definitions compose with `.with()`. Shared behaviors select with `.where()`
and propose actions with `.do()`. Named predicates and action builders are useful
inside this model. A named action does not immediately mutate the world. UI and
headless commands enter the existing checked command boundary; behaviors use the
same prepared queries and intent execution described earlier in this document.

Do not invent an `access()` framework or unexplained `canManage` helper for an
example. Section 12 owns authentication, explicit operation roles and supported
access expressions. A `controlledBy(request.player)` predicate denotes a checked
relationship/identity expression, not team membership and not arbitrary JS
magically translated into Rust. The authenticated player comes from host context,
never an untrusted player field supplied by the client. Use the same authored
policy for availability and execution-time admission. A `.where()` selection is
not authority by itself. Ordinary TS gameplay predicates still execute within
the prepared decision phase; distinguish them from native access expressions.

### Trading: consent and one physical exchange

Illustrative behavior over an inventory selection:

```ts
inventories
  .where(contains(request.item))
  .where(controlledBy(request.player))
  .do(offerTrade({
    item: request.item,
    recipient: request.recipient,
  }));
```

Drag/drop supplies the requested item and recipient through the ordinary command
owner. Offering creates a durable offer recording exact item/quantity, source,
recipient and status; the item stays in its current custody. Acceptance rechecks
authority, consent, custody, quantity, capacity and optional grid placement in
one commit. It fails unchanged if the item was moved/consumed or the backpack is
full. The default offer does not silently reserve goods: any reservation policy
must use the existing claim owner and define release on decline/cancel/expiry.

For reciprocal trading, both parties approve the same offer revision. Editing
contributions clears approvals. The exchange commits all transfers and completion
together, with durable operation identity so repeated acceptance cannot duplicate
items. Do not implement this as independent remove/add behaviors. No transfer
permission follows merely from sharing a team or receiving an offer.

### Quests: templates and issued actors

A quest definition is a template. Each issued quest is an actor with explicit
issuer and recipient references, status, progression and any reward references.
It need not have a body or sprite. Its existence does not imply a private ticking
loop, network session or Durable Object. A recipient disconnecting does not remove
the quest or its people.

```ts
const terribleErrand = actor("terrible-errand")
  .with(quest, {
    title: "Dinner Is Served",
    objectives: [
      deliver({ material: moldyBread, quantity: 3, destination: "issuer" }),
      defeat({ target: monster, using: fryingPan }),
    ],
    order: "sequential",
  });

quests.where(isAccepted).where(currentObjectiveSatisfied).do(advanceObjective);
quests.where(allObjectivesFinished).do(completeQuest);
```

Issuing binds the declared issuer/recipient roles to real identities; role names
are not ambient globals. Objective selectors distinguish content definitions from
particular actor IDs. Objectives observe committed outcomes: actual delivered
quantity, a combat result with attacker/weapon identity, or another supported
fact. Scope contributions to the quest's participants and define when tracking
starts. Duplicate/replayed outcomes cannot count twice. Use indexed subscriptions
or the maintained observation lifecycle, not a full event-log scan every tick.
Progression and its consumed outcome position/identity survive the same durable
commit. Optional statecharts use the existing progression lifecycle.

Player-authored quests are validated data composed from game-supported objective
types, parameters and reward policies. This does not authorize uploaded arbitrary
code. Developers can author additional evaluators in TypeScript through the same
decision/intent boundary. Existing operation owners execute physical effects.

A reward from a player must name real goods and use explicit escrow/reservation
through the material owner. A definition mentioning a reward grants no ability to
mint it. A game-authorized spawn reward is a distinct policy. Completion and reward
settlement require idempotent durable identity; separately authored cosmetic or
spawn follow-ups consume a keyed completion outcome and cannot fire every tick.

### Where the fluent model stops

Use `.with()`, `.where()` and `.do()` wherever they fit; do not force ordered recipe
stages, atomic exchange internals, schemas or statechart transitions into unrelated
behavior chains. A brewing behavior starts a batch. Recipe data describes delivery,
attendance, waiting and output stages; the existing native work/progression owners
execute them. A creature's flee and wander actions share the movement conflict
policy; chaining predicates does not itself establish precedence.

### Evidence required before claiming the composition works

- **Movement:** wander, danger, flee, safe return; explicit conflict policy,
  retained route progress and no duplicate movement loop.
- **Spoilage:** shared capability progression and one authored transition;
  save/reload preserves amount, physical custody and once-only transformation.
- **Inventory/trade:** dropped bag retains contents; cycle rejection; concurrent
  acceptance exchanges once; full destination, revoked access or missing goods
  changes neither inventory; source and destination constraints are both checked.
- **Production:** concurrent deliveries, interrupted/resumed stage work, finite
  inputs and exactly-once output through the same scheduler/material owners.
- **Quest:** two independently issued instances, correct recipient/role matching,
  repeated outcomes, disconnect/reload, and exactly-once reward settlement.

These are cross-feature acceptance examples for the architecture, not claims of
completed implementation. Show authoring code, compiled query/intent ownership
and actual behavior together. Any example requiring a second scheduler or physical
truth store exposes a design gap; attractive fluent syntax does not resolve it.

## Tight feedback loop

First prove the API against the existing cat and cannon. Cat movement must handle
arrival, unreachable destination, interruption and current-format restore without
per-tick world scans. Cannon behavior must remain editable in TS and preserve
native collision/physical ownership. Then use the same lifecycle with a colony
task completion; do not reintroduce TS worker/job pairing.

Show the authoring source and playable effect together. Record boundary calls,
query result sizes and active versus waiting behavior cost. Check a small active
population and the existing larger worker workload; an idle-only result cannot
establish scale. Inspect current state and a wait reason through the ordinary
scoped observation path used by humans and AI controllers.

No new engine adoption, runtime rewrite, deployment or benchmark run was performed
for this study. Implement the accepted contract through these real consumers;
exact helper types and measured query plans still require that focused review.
