# Engine ownership audit and implementation correction

September 15, 2026. Updated source review of `85bfd7a5` in
`clearing-edge-integration`, including dirty native planner/allocation/world
changes and untracked `supply_delivery.rs`. The earlier audit read `7d31b478`;
status corrections below distinguish subsequent fixes from open findings. This
is source evidence, not a new performance measurement or hosted acceptance. It
refines [native work planning](07-native-work-planner.md) and the existing repair
sequence. It does not authorize a second engine rewrite.

The original three read-only reviews covered native execution/ECS, GamePack/DO
and client/art callers. Two further independent reviews examined creator-facing
authoring/composition and lifecycle/durability; the lead also traced diagonal
navigation and personally rechecked the consequential findings. The lead read the critical callers and evaluated the
recommendations. This is an architectural audit of execution paths, not a claim
to have checked every line, reproduced every defect or identified the cause of
every historical live incident. No runtime code changed during this audit.

## Decision

All automatic jobs share one Rust scheduler, one bounded candidate/matching
pipeline and one WorkAttempt lifecycle. Construction, brewing, gathering,
planting, digging and stockpile demand supply domain requirements to that owner.
They do not select workers, run Hungarian, own separate claims or run independent
pickup/deposit state machines. Manual movement, physics and unattended process
time remain their existing operations; they do not become artificial labor jobs.

Deep modules must own decisions and cleanup, not just contain moved functions.
Moving `impl Kernel` methods into child files still gives those files access to
Kernel internals. That can be a mechanical extraction step, but does not establish
encapsulation. New callers must use typed operations and results rather than reset
fields, repair indexes, infer physical outcomes or coordinate cleanup themselves.

## What Shiitake and Watchdog actually demonstrate

Reviewed Botanical candidate `38966f9f2eb7a5d9422bc667b214104225944681` at
`/mnt/fungi-extra/botanical-work/Botanical-agent-control-host`:

- `packages/shiitake/src/extensions.ts`: trusted static definitions activate into
  explicitly named contributions. They do not receive owner storage through the
  activation context. The active compaction handoff is a narrow callable.
- `packages/shiitake/src/internal/extension-admission.ts`: validate the roster
  before activation, reject duplicate identities and competing exclusive slot
  owners, freeze identity/grants, and own cleanup when activation fails. The
  declared maintenance contribution is explicitly unavailable in this source;
  this is not an unrestricted plugin platform.
- `packages/shiitake/src/internal/compaction/session-compaction.ts` and
  `test/compaction-real-caller.test.ts`: a concrete compaction caller supplies a
  borrowed view through the contribution while the session owner keeps its
  transition. Reading these tests is not a fresh execution claim.
- `packages/shiitake/src/internal/runtime-coordinator.ts`: one Watchdog runtime
  binds to the existing owner and wake capability. Extensions do not create a
  second queue or durability owner.
- `packages/watchdog/src/index.ts` and `README.md`: the caller supplies execution
  and host capabilities; private claim, settlement, recovery and cancellation
  stay inside Watchdog. Its transactional projection uses the same mutations.
- `wiki/3-resources/field-guide/{ownership-and-seams,software-shape}.md`: deep
  modules hide actual invariants; narrow wrappers, duplicate ownership and
  speculative frameworks fail the standard.

Apply those ownership principles to Hive. Do not copy Effect scopes, SQLite jobs,
permission manifests or asynchronous extension activation into each simulation
step. Rust simulation mechanisms are trusted compiled code. Their operations
remain deterministic and join the existing Region commitment.

## Small core, substantial optional mechanisms

The minimum host-independent core owns entity identity, admitted composition,
deterministic step order, current state and its capture/restore contract. The
Region host owns durable command receipts and atomic publication. A small public
surface does not imply that navigation, construction and fluids need trivial
implementations.

| Module owner | Facts and invariants kept private | Useful boundary |
| --- | --- | --- |
| World/Region | One candidate, committed revision, command identity and publication; composition identity and supported versions | Admit command, advance, capture/restore, observe |
| Work | Due/dirty queues, fairness, bounded global matching, task-worker association, operation outcomes and acknowledgement | Designate/cancel, advance within budget, inspect work |
| Materials | Lot custody/quantity, container contents/capacity, exact supply allocations, split identities, reservation indexes and release | Resolve demand, reserve, prepare transfer/consumption/output, publish, cancel allocation |
| Navigation | Traversal/contact witnesses, route progress, topology dependencies and route invalidation | Query legal contacts, prepare route, start/interrupt movement, inspect outcome |
| Construction/process/resource | Their own intent, progress, stage transitions and requirement generation | Derive bounded requirements; prepare/start domain operation; return typed outcome |
| Environment | Terrain edits, finite water, groundwater, bounded smoke, geometry/field invalidation and conservation | Query physical facts; prepare/apply coupled edit; advance fields |
| Presentation session | Client selection/gestures, pending command feedback, subscriptions, art cache and render-part/picking lifetime | Bind semantic commands, consume observation, draw, dispose |

These describe responsibility boundaries in the current codebase, not seven new
packages or independent runtimes. Keep existing good modules and deepen the seams
as their real consumers change. ECS holds canonical components; indexes and
render projections remain derived. Do not introduce a second entity model.

### Native composition and TypeScript authoring

Use ordinary Rust modules and typed component queries. The installed dependency
is `bevy_ecs`, not a Bevy App/plugin runtime. Keep its component storage and cached
queries. There is no demonstrated need for a new dynamic plugin loader, plugin
interpreter or a replacement scheduler framework.

At composition, choose supported mechanisms and their dependencies once. Validate
conflicting component mutation owners and missing dependencies before advancing.
Order physical steps explicitly, including the existing rule that arrival cannot
earn labor retroactively. Persist the selected composition/definition identity
through the existing versioned save contract. Disabled optional mechanisms create
no automatic work; another supported recipe uses the same compiled engine.

The authoring split remains:

- TypeScript GamePack supplies schemas, recipes, structure/resource definitions,
  durations, content, commands, visuals and bounded game-owned rules such as morale.
- Rust mechanisms execute common movement, matching, hauling, physical work and
  resource effects. A new recipe must not add a TS worker scan or assignment loop.
- Genuinely new physical behavior may require a Rust module and an explicit
  typed operation. Do not promise arbitrary new physics from configuration.
- Humans and AI use the same admitted semantic commands and scoped observations.
  Whistle describes commands; it owns neither simulation nor permissions.

Do not freeze a generic `Plugin` trait from this audit. Earn the contribution seam
with construction and brewing sharing supplies, then resource/dig work sharing
the same work owner. Keep the contribution types private until real callers agree.

### Requirement contribution is not scheduling

Illustrative private flow; names are not existing exports:

```text
accepted designation -> domain intent and affected-work wake

one work.advance(global_budget):
  reconcile retained operation outcomes fairly
  obtain one bounded cross-family window of due requirements
  domains resolve those requirements from native indexed facts
  materials derive finite supply portions where required
  shared candidate owner considers eligible workers
  shared Hungarian/route owner proposes and verifies assignments
  fresh domain/material admission prepares valid transitions
  work/material owners publish attempts and reservations atomically

physical owners advance their already-admitted operations
  -> retained Completed / Blocked / Interrupted outcome
next bounded work reconciliation consumes that exact outcome
```

Requirements carry stable owner/generation/role, priority and typed operation
meaning. Family modules supply contact and capability requirements; they cannot
capture a worker, retain their own reservation maps or privately run the matcher.
All families share the same budgets and fairness window. Enumeration is charged
by records actually visited, including rejected candidates. A small result limit
after a full scan is not bounded discovery.

The delivery lifecycle is shared by structure, process, storage and recovery:
route to source -> exact pickup -> route to destination -> exact deposit ->
acknowledge. Missing workers/materials leave intent waiting. Lost access returns
a typed blocked outcome and releases labor. Carried goods remain in their actual
carrier through Draft, cancellation and retry; recovery uses the same work owner.

## Personally verified source findings

### A. Native scheduler migration is unfinished

`world.rs::advance_batch` still never calls the native planner.
`work_candidates.rs` rebuilds party maps from all IDs;
`native_work_planner.rs` repeats source/worker scans. Dirty supply work now
collects multiple material requirements, treats shortages as waiting, and has
successful pickup/route/deposit/retirement reconciliation. The earlier lack of
any successful delivery continuation is superseded. Its failure reconciliation,
shared budgets and real production caller remain missing. The private helper
fixtures do not establish native activation. See section 1 of the native planner
packet and the additional findings below.

Correction: finish and review the shared work/material lifecycle with construction
and process consumers, then migrate all supported families and delete the TS
automatic pipeline in one coherent consumer cutover. Do not add a special
construction scheduler to make the first example pass.

### B. Work failure policy still leaks across domain implementations

`85bfd7a5` repairs excavation settlement for occupied support, lost reach and
changed target, and deconstruction now settles lost contact in stable-ID order.
Those earlier findings are partially fixed. Excavation still retains execution
on reserved support and some output/preparation failures. More seriously, its
changed-target outcome retains progress which becomes invalid on restore after
the attempt is acknowledged; see the additional findings below.

Correction: each physical owner reports an exhaustive operation outcome; the work
owner handles release/continuation/acknowledgement. Preserve earned progress in
the domain intent. Test one blocked worker returning to independent work, changed
target, occupied support and save/reload at the retained outcome. Do not add a
timeout or feature-specific worker-reset patch.

Keep explicit stable order for competing physical completions and test logically
equal worlds built in different insertion orders. Bevy membership order is not
the game's authoritative priority.

### C. Capacity accounting repeatedly serializes unrelated state

`world.rs::refresh_state_weight` walks every entity against registered schemas,
materializes values and recalculates the whole size. Normal `advance_batch` and
`construction_work.rs::advance_construction` call it, even with no active
construction. New allocation helpers also scan IDs where the existing `contents`
index already answers container membership.

Correction: record/accounting ownership maintains weights and dirty records at
accepted mutations, using conservative bounded accounting where exact encoded
size is not needed. Reuse `contents`; maintain reservation indexes at the material
owner. Rebuild on load/restore and verify against a slow reference in focused
tests. Preserve the hard state bound. Measure actual work before making a speedup
claim; do not remove accounting blindly.

### D. Incremental SQL writes hide full capture work

`region-program.ts::execute` calls `session.save`; `kernel-records.ts` captures
all records and reconstructs/JSON-parses the entity image to obtain metadata;
`session-record-store.ts::changedSessionRecords` compares all resulting bytes.
Only the final SQL writes are incremental. Native mutation staging can capture
again. This is a likely cost center requiring measurement, not permission to
acknowledge volatile state or remove rollback.

Correction: the native capture owner supplies metadata and revision-bound changed
records with deletions. Region still commits those records and the command receipt
together. Inspect and reuse existing record/transaction APIs; avoid a new event
framework or speculative rewrite of rollback. Prove rejection, retry, eviction
and current-format reload with the actual DO/Region adapter.

### E. Shared contracts have drifted across real callers

`c2cbf5d8` repairs the earlier 40/48 record-limit contradiction and generic host
identity/socket admission defects. Stored-session admission now imports the
same 48-record constant. These earlier findings must not be reported as still
unfixed. Runtime/hosted acceptance and the Pirates content's membership join are
separate from that source repair. Native/TypeScript ownership declarations still
drift; see the additional findings below.

Correction: use one capture-format contract across producer/storage consumers;
resolve connection identity before building its attachment; define explicit
supported admission for every current game pack. Do not solve this with alternate
parsers, guessed principals or an authority bypass. Qualify real non-Colony
command paths as well as the Colony party path.

Anchors: `tools/public-engine-host/worker.ts:270,290,497,928,936`,
`engine/src/runtime/kernel-records.ts:41`, `session-record-store.ts:17`.
The Pirates content also lacks matching party membership for its delivery tasks
(`engine/src/games/pirates.ts:53,117,133,201`; `sdk/delivery.ts:346`). Changing a
shared contract requires changing these real consumers together. Preserve its
ship-frame cargo behavior; do not substitute unrelated static-world fixtures.

### F. Expected scheduler overload becomes a world-level failure

`engine/src/runtime/session.ts:900-903` throws above 128 system actions, then
poisons the candidate at `1007-1009`. The failed durable occurrence can retry the
same unchanged work. Native WorkAttempt transition failures currently also fail
the entire batch (`world.rs::advance_batch`), protecting authored writes whose
matching physical operation did not happen.

Correction: shared scheduling budgets cover admissions AND continuations. Excess
ordinary work is deferred with fair saved progress; normal stale work is rejected
locally before publishing its coupled mutation. Keep transaction rollback for
actual invariant/commit failures. Never simply swallow an error after an authored
write. Prove more ready work than the step budget, continuing unrelated movement,
eventual fairness, interruption and reopen without duplicated effects.

### G. Authority is guessed from string values

`engine/src/runtime/session.ts:721-740` reads all membership/ownership rows for
each top-level action string or authored component string. A material ID or text
field is not necessarily an entity subject; a missing inferred party defaults
to host scope. This is brittle semantics and avoidable population-wide query work.

Correction: each typed action identifies its actual subjects; authored rules use
an explicitly granted execution scope. The native authority owner rechecks that
scope against indexed canonical ownership. Do not infer authority from arbitrary
strings or from a parser accepting their shape. Keep GamePack's existing duplicate
write-owner checks. Test identical text versus entity references and cross-party
rejection through the real command caller.

### H. Observation limits are applied after broad work

`engine/src/runtime/wasm-kernel.ts:773` parses all native render facts and then
slices to 512. `observation.ts:57` decorates those facts; combining authored
projections can exceed another limit (`visual-projection.ts:75`). The public
host rebuilds by revision and serializes ordinary facts per socket. Terrain and
capabilities already have useful revision-based omission.

Correction: native projection selects bounded relevant records before crossing
WASM; client residency does not disable offscreen simulation. Extend the existing
observation owner with explicit baseline/change/removal semantics, retaining
sequence/reconnect behavior and scoped AI observations. Measure projected bytes
and work separately from canonical storage. A crowded world must not hide actors
by arbitrary ID truncation or fail publication after decorating its facts.

### I. Render and input owners still have partial duplicate behavior

- `engine/src/client/isometric-sorter.js:361` accepts scoped invalidation IDs but
  discards the entire static cache. The cache owner should invalidate incident
  relations/spatial buckets for changed subjects; view/camera-wide changes may
  legitimately invalidate globally. Callers should not manage graph edges.
- `client.js:1351-1370` uses sorted sprite picking then falls back to surface
  selection in raw subject order. Feed surface candidates through the same final
  visual-order policy, while retaining the distinction between alpha silhouettes
  and walkable physical surfaces.
- `terrain-layer.js:165` destroys/recreates all water sprites on each layer
  update. Reconcile keyed cells and let the layer dispose changed/removed entries.
  This is rendering allocation churn; it is not a reason to rewrite water physics.
- `performance-page.js:61` implements new-world as only `callback(false)`, while
  the shared reset caller sends start only for remote mode (`client.js:156`).
  Route local reset to the maintained runtime reset owner and verify the next
  authoritative world actually changes.

The reader proposed making sprite-order cycles fatal. That recommendation is
rejected: the user's accepted sorting contract requires deterministic cycle
resolution. Keep it playable, expose bounded diagnostics when useful, and repair
specific multipart constraints. Do not replace it with per-pixel rendering or an
error screen. Existing art, animations and shared floor/wall coordinates remain.

## Creator engine and shared behavior: September 15 follow-through

Levi's product direction is an engine that lets people make and share varied,
playful web games. A small colony, survival encounter, cannon battle and moving
ship are real consumers that must earn the shared boundaries. A platform for
uploading/hosting third-party games is a later product outcome, not supplied by
serializing a behavior graph. Do not begin another demo or platform rebuild to
complete this audit.

### Additional source findings, in repair order

1. **P1: changed-target acknowledgement can commit an unrestorable state.**
   `excavation_work.rs:121` retains `ExcavationWork` while publishing a blocked
   outcome. `games/colony-work.ts:893` acknowledges that outcome;
   `world.rs:4663` removes the attempt but leaves excavation progress. On restore,
   `excavation_work.rs:61` rejects parked progress whose expected material no
   longer matches. A later provider pass cannot repair an already-invalid saved
   boundary. Distinguish interrupted, still-valid progress from invalidated
   intent; reconcile the domain record and acknowledgement atomically. This is
   a source-derived failure sequence, not a reproduced user's-world incident.
2. **P1 before native supplies activate: preparation can bypass reservations.**
   `process_transition.rs:117` computes output capacity without incoming supply
   reservations, whereas ordinary output preparation at `world.rs:3900` includes
   them. Process consumption calls `material_consumption::prepare` directly at
   `process_transition.rs:74`; that helper has no allocation context.
   `world.rs:2098` also permits reserving a process-bound lot. Make source
   availability, process bindings and incoming space one material-owner decision
   for all prepare paths. Replacing a transport reservation with a process
   binding must be explicit and atomic. A shared capacity helper whose callers
   may omit reservations does not enforce the law.
3. **P1 before native supplies activate: failure and carrier capabilities are
   incomplete.** `supply_delivery.rs:29` reconciles only completed outcomes;
   blocked/interrupted allocations can keep incoming quantities reserved. Lost
   destination contact after pickup becomes an error at `:89`. Reconcile all
   terminal outcomes, retain carried goods, release the exact unused promises,
   and defer bounded recovery. `native_work_planner.rs:174` creates portions up to
   three before examining carrier capacity, then rejects smaller carriers at
   `:258`. Six goods and two capacity-two carriers must produce feasible trips.
   An upper batch preference cannot become a minimum required carrying capacity.
4. **P2: ordinary behavior outcomes can disappear before their consumer runs.**
   `runtime/session.ts:992` replaces ordinary action outcomes every step while
   authored systems may run every N steps (`:916`). The cat already needs special
   ordering to consume yesterday's rejection before its own due-time gate
   (`games/colony-cat.ts:90`). Give tracked activities owner-issued identity and
   retained terminal results until the owning rule consumes them. Reuse the
   current attempt/operation lifecycle; do not create a second per-actor result
   ledger or store every motion sample as a job. A slower behavior cadence must
   not lose completion or cause repeated orders.
5. **P2: optional mechanisms are coupled through the terrain definition.**
   Recipes already are data (`games/colony-environment.ts:46`,
   `staged_process.rs:123`). But `sdk/environment.ts:162` and
   `environment_definition.rs:31` attach processes to an aggregate requiring
   generated terrain, water and structures. Admit process/material/station
   catalogs independently; require environmental capabilities only for recipes
   that actually use them. A second recipe must not require a new planner or
   compiled game-specific Rust branch. The current brew command also hardcodes
   its recipe (`games/colony.ts:444`); recipe selection is content/schema work.
6. **P2: native/TS declarations and game entrypoints are duplicated.**
   Native physical membership in `registry.rs:253` includes staged process,
   process binding and supply allocation, absent from TS `RESERVED_COMPONENTS`
   (`contracts.ts:10`). Native enforcement remains; the public declarations are
   inconsistent. Consolidate native registration and structural wire metadata
   at one maintained owner, generating TS declarations/parsers as appropriate;
   domain validation stays native. Separately, `sdk/index.ts:10` exports example
   games, and browser worker, public host and page maintain separate pack lists.
   Use one build-time pack descriptor in those existing entrypoints. Prove an
   ordinary fifth pack needs no shared-client game-ID branch. This does not
   establish safe public code uploads or a dynamic plugin loader.
7. **P2: reported step time omits substantial end-to-end work.**
   `runtime/worker.ts:149` ends the `stepCpuMs` interval before
   `captureAccepted()` and `emitObservation()`. Capture still serializes the
   world; observation does additional queries/decoration/serialization. Preserve
   the metric as simulation-step time, and measure capture, observation, transfer
   and rendering separately in the existing performance page. Do not infer
   playability from that number alone. No new timings were collected here.

### The extension boundary is behavior, coordination and execution

One shared world and ECS hold canonical state. Compiled Rust mechanisms expose
small operations, queries and definitions. GamePack composes them at startup;
their dependencies, mutation ownership, schedule order and saved versions are
checked once. There is no requirement for one crate per mechanism or dynamic
native loading. An omitted mechanism contributes no automatic work.

| Responsibility | Engine behavior | Actual consumers |
| --- | --- | --- |
| Individual decision | Choose/change an intention from admitted facts and game policy | Cat wandering, formation retreat, future zombie behavior |
| Group coordination | Bounded candidate discovery, route costs, joint assignment and work priority | Colony labor, pirate cargo; tactical position allocation may reuse it later |
| Shared execution | Start/interrupt a tracked activity, route/progress, exact outcome and recovery | Automatic workers and individually controlled actors |
| Materials | Physical ground/container custody, capacity, reservations and exact effects | Stockpiles, brewer, carried cargo, ammunition |
| Optional construction/production | Durable plans, prerequisites, earned effort and process definitions | Colony; survival crafting/building where selected |
| Game | Content, rules, commands, party roles, visuals, sound and UI composition | Goblin, Survival, Formations, Pirates |

A zombie pursuing a target and a colonist approaching a wall use the same
movement/contact/result mechanisms. Choosing which colonist serves which wall
is optional group assignment. A survival game with NPC crafting may select the
work mechanism too. Do not hardcode a "Colony" capability test into core execution.
Continuous direct input uses the existing movement stream, with its own sequence
and interruption contract; it does not allocate an ordinary work job per sample.

Acceptance must demonstrate the dependency direction. In one consolidated
existing-consumer scenario, run an individually directed actor with navigation
and tracked execution while group assignment, construction and production are
omitted. Start, interrupt and restore its activity and consume its retained
outcome without a fabricated job, stockpile or colony party. Ordinary controller
authorization still applies. Then exercise the same execution owner through a
group-assigned worker. Omitting group assignment must create no work queue or
run candidate discovery/matching; it cannot merely hide its UI. This is a required
future qualification, not a current runtime claim. It need not require separate
WASM binaries or one crate/package per capability.

Keep `WorkAttempt` as the current keyed execution reuse anchor. It currently
combines task-worker association with operation tracking. When generalizing to
individual behavior, identify those two facts explicitly and give each one
owner; an optional group assignment references the execution identity. Do not
add an independent `ZombieAttempt` or `BehaviorAttempt` alongside it. Party
authorization comes from the existing grant/ownership boundary; using an
individual behavior does not confer host authority.

The optional colony bundle composes work, materials, construction and production.
It does not own separate movement, inventory, rendering, time or durable storage.
Goblin remains a game pack supplying content and player experience. A game may
use containers/crafting without automatic group assignment. Processes which
require physical stations still declare that dependency explicitly.

### XState authoring: useful direction, compatibility is not yet proved

The earlier conversational example `defineHiveMachine` is pseudocode, not an
existing export. The existing package pins XState **5.32.6**. The cited v6
serialization APIs are alpha and not this installed contract. Do not start an
XState v6 upgrade, Statig dependency or Rust interpreter from that example.

We support TypeScript authoring and evaluating a portable XState-compatible
definition for Rust execution. This audit does **not** establish a compatible
executor or choose a statechart crate. Full XState behavior includes transition
priority, hierarchy, internal events, entry/exit order, context assignments,
timers and invoked actors. Matching the JSON spelling alone is not compatibility.
Statig's Rust state definitions do not import arbitrary XState configurations.

The supported split is:

- Native material, navigation and execution invariants remain private Rust
  mechanisms. Engine authors can use exhaustive enums/event transitions; tiny
  internal machines need no runtime interpreter merely for consistency.
- Authored workflows may express branching and policy over those operations.
  The current linear recipe definition already covers brewing stages; replacing
  it with a larger graph is justified only by an actual branching consumer.
- Ordinary trusted TypeScript rules remain a first-class surface for game-owned
  calculations (health, morale, score). They submit typed native effects; they
  do not resume worker scans, allocation or a second physical tick.
- XState remains the actual browser gesture owner. An authoritative workflow
  has one runtime owner; a diagram/client projection never advances its truth.

Qualify two existing behavior consumers (cat move/retry and formation retreat)
against a common tracked-operation boundary first. Compare actual XState v5
pure transitions in the TS session with a Rust execution profile of the same
data definition. This is one bounded library/API decision, not two maintained
production runtimes. Pure XState transitions return next state plus actions,
which fits prepared effects; named JS guards/parameter functions may still run,
so they must remain deterministic and have no physical side effects.

Before committing to native chart execution, record the exact supported config
fields and semantics, and reject unsupported constructs during pack compilation.
TypeScript runs during build to export checked data; Rust does not parse arbitrary
TypeScript source. Native actions/guards have schema-checked parameters and map
to installed capability operations. Unknown names, callbacks, actor invocations,
history/parallel behavior or dynamic expressions are rejected unless explicitly
implemented and covered; none are silently dropped or guessed. Do not build a
new expression language to preserve arbitrary closures.

For either execution location:

1. Keep workflow state/context and pending operation references in the existing
   capture/transaction, with exact definition identity. Copy no quantities,
   positions or claims into workflow context as competing truth.
2. Consume targeted events/results and simulation-clock due work. No full-world
   machine broadcast or one wall-clock timer per character. Pause/reload keep
   due work and definition bindings coherent.
3. Prepare each transition and its effects against the same candidate. A guard
   passing does not reserve anything; native effect admission may still reject.
   A long action yields a pending operation, not an immediate completion. Commit
   next state, admitted intent and result acknowledgement together; physical
   completion comes from its operation owner. Recovery does not rerun entry
   actions blindly.
4. Charge internal transitions and due-event delivery to bounded execution;
   defer ordinary overload without losing work. A nonterminating immediate-event
   loop is a definition/execution error, not an infinite fixed-step loop.
5. Compare ordered effects, next state, ignored/handled events and simulation
   deadlines against the pinned XState reference for every supported semantic.
   Then test actual admission failure, interruption and reopen through Region.

Reference sources: [XState v5 pure transitions](https://stately.ai/docs/transitions),
[guards](https://stately.ai/docs/guards),
[persistence behavior](https://stately.ai/docs/persistence),
[Statig](https://github.com/mdeloof/statig).
These document library behavior; no Hive runtime or performance was proved here.

### Concrete delivery sequence

Keep the current eight-stage Clearing goal. This review adds completion criteria
within it, not a ninth framework stage ahead of a playable game:

1. Repair coupled work/material preparation and complete all delivery outcomes.
   Prove construction plus process supply against the real native advance and
   Region path. Use capacity-two carriers, six required units, concurrent
   portions, blocked destination, changed-target acknowledgement and competing
   process output/incoming space. Reopen at each committed interruption boundary.
2. Finish one native planner and migrate current work families; remove TS
   automatic provider orchestration. Model floor stockpiles as policy over actual
   visible ground lots, following section 10 of the planner packet.
3. Prove reuse with Pirates' existing moving-deck cargo and Colony deliveries.
   Separate process catalog admission from unrelated terrain requirements at
   this real consumer boundary. Keep individual intentions distinct from group
   assignment; retain one shared execution/receipt path.
4. Repair diagonals and current client/render/performance gaps. Measure full
   productive steps including capture and observation. Preserve water/gas and
   current art rather than shrinking the workload to claim capacity.
5. Freeze creator-facing behavior definitions only after the two real consumers
   establish the operation/result seam. Native chart qualification can follow
   on that seam; it cannot hold Clearing hostage to implementing all XState.
6. Use the existing build/preview pipeline for the coherent accepted game. Then
   consolidate pack entrypoints so authoring a second recipe or another small
   game changes content/rules, not shared transport and client dispatch.

The authoring acceptance question is concrete: can someone add another recipe,
an individual behavior and a new pack through those documented surfaces, using
the existing native operations, without reproducing their lifecycle? Source
review should name the removed caller orchestration, not celebrate file count.

### Creator acceptance: the Edmund McMillen question

**Assessment: the current plan repairs necessary mechanisms but does not yet
establish an engine another game creator should adopt.** We cannot predict
McMillen's personal choice in 2027. Use the question to test creative freedom,
iteration and trust, rather than interpreting another list of engine features
as product readiness. These criteria refine the existing work and subsequent
authoring qualification; they do not open another rewrite or editor project.

The developers' [Super Meat Boy postmortem](https://www.gamedeveloper.com/audio/postmortem-team-meat-s-i-super-meat-boy-i-)
credits an in-game visual level editor and a Flash exporter that brought over
animation and sound cues. McMillen's [Binding of Isaac postmortem](https://www.gamedeveloper.com/business/postmortem-mcmillen-and-himsl-s-i-the-binding-of-isaac-i-)
describes a weeklong game jam becoming a playable idea. Our inference is that
quick experiments, expressive rules and faithful artwork are useful acceptance
criteria. These accounts do not endorse Hive, Rust, XState or our deployment model.

#### What the actual creator surface currently permits and prevents

- `games/formations.ts:18` already demonstrates a good division: native impacts
  feed authored health/morale changes and admitted knockback. Keep that creative
  policy in the game. Requiring Rust for another damage formula would make the
  public surface less useful. Its full victim scan is not a pattern to repeat
  per projectile; targeted reads and batched effects must earn their boundary.
- `sdk/authoring.ts:8` currently describes scalar/reference component fields;
  `GamePack` accepts executable systems and schema-checked commands. It is more
  expressive than a recipe editor, but this is not an established arbitrary
  TypeScript-to-Rust compiler. A chart format must not become the only way to
  express game rules. Save data contains state and definition references, never
  serialized closures; installed pack code owns the rule implementation.
- `kernel/src/authored_entities.rs` correctly prevents authored record edits
  from inventing/removing physical capabilities. That protection leaves a
  creator-facing question: which admitted operation spawns an ordinary enemy,
  retires its body and applies its configured rewards? Party joining, construction
  and projectile creation are not proof of a reusable enemy lifecycle. Qualify
  the existing physical owners before designing that operation. Do not solve it
  by allowing arbitrary writes to native components or treating every spawn as
  a player joining a colony.
- `sdk/index.ts` exports the example games; browser worker and public host repeat
  game lists. The injected runtime already accepts a pack map, so consolidate
  those maintained entrypoints instead of inventing a dynamic plugin service.
  A creator should supply one pack registration, not edit engine transport.
- Existing presentation has useful visual/activity bindings, but terrain marks,
  effect kinds and game-specific client branches still constrain it. Preserve
  the original Three-to-Pixi pipeline and shared asset contract. That contract
  must not eventually require a hand-drawn game to manufacture Three scenes or
  require every game to have voxel floors. Additional asset input formats and
  camera profiles are later, actual-consumer work, not new artwork for this repair.

#### Composition must admit surprising mechanics

Definitions cover supported content; normal TypeScript implements game-owned
rules; Rust extensions add genuinely new physical operations. Keep all three
levels available. A small core is an ownership decision, not a promise that every
game fits a closed menu of recipes, jobs and state-machine actions.

For example, use the existing cannon to ask whether an item can alter damage,
another react to the resulting hit, and a third change what happens on defeat.
These are proposed authoring probes, not implemented features. Physical impact,
game damage and a target's defeat are different facts. A game-owned combat module
can own health and compose named modifiers/reactions in explicit order; each item
must not become a competing health writer. Preserve cause identity and consumed
outcome position through the existing transaction so reopening cannot award the
same reward twice. Reactions can schedule later operations, with bounded work;
an item combination cannot create an unbounded same-step callback cascade.

An effect that changes a projectile before flight needs an admitted launch
configuration or operation. A reaction after an impact cannot retroactively
change that collision. Specify this timing at the owning operation rather than
introducing unrestricted hooks into native physics. Begin with the actual cannon
and existing outcome frontiers, not a universal effects bus or damage framework.

The author may define a game where ammunition is free or enemies multiply. Native
conservation prevents *accidental* duplication of modeled goods; it must not make
deliberate game-defined creation impossible. Explicit creation authority belongs
to an admitted mechanic and never to an untrusted player's arbitrary component
write. Keep trusted pack implementation distinct from player commands and saved
player scripts. The browser, DO host and AI controller still use the same world
truth and admitted operation owner.

#### The creator loop is an acceptance result

After the coupled Clearing repair, qualify the public surface through the
existing Colony and Formations consumers. Do not add another hosted demo:

1. Starting from the documented pack entrypoint, run locally without Cloudflare
   credentials. Change a recipe, an actor rule, a cannon parameter and an existing
   animation/sound binding. Record elapsed edit-to-visible-result time and which
   files must change. A warm content/rule edit should be a seconds-scale loop;
   this is a target, not measured current performance. Ordinary supported edits
   must not require a Rust rebuild or remote deployment.
2. Use the existing scene/art authoring tools to place a test arrangement, play,
   and restart it from a known seed. A deliberate development-scene restart is
   sufficient initially; arbitrary live-code replacement inside a saved shared
   world is not a prerequisite. Preserve current public worlds and explicit
   definition/version binding.
3. Add two interacting game rules through the documented surface, then interrupt
   and reopen their real operation. Inspect the cause, pending operation and
   final result. Report any shared-engine edit honestly: this is where an absent
   operation is discovered, not a reason to hide orchestration in a demo file.
4. Run an existing pack from outside engine implementation directories using its
   public imports and one build descriptor. Identify remaining internal imports
   and game-ID branches. This is a consumer qualification, not a fifth product.
5. Publish the same accepted rules through the existing DO host and join from a
   second browser. Input response, visible effects and readable failure/waiting
   reasons count alongside state agreement. A creator should inspect why an actor
   is waiting without reading the job scheduler or a raw world dump.

Record actual friction and remove it where its owner lives. Do not build a large
editor, generic scripting language, plugin marketplace or all-genre renderer to
pass a speculative checklist. Finish the current small game, then require each
reusable seam to make its next real content change easier. The proposed product
advantage is quickly shared web games with reliable multiplayer, optional durable
worlds and human/AI participants. Offline experimentation remains a real mode;
adopting a multiplayer feature must not mean authoring the game twice.

## Retained mechanisms that earn their place

- Bevy canonical components and cached `QueryState`; existing `contents` and
  route indexes. Rust is already more than a JS matrix solver, but planner
  migration and true encapsulation remain unfinished.
- WorkAttempt generation/operation identity and retained outcomes; deepen its
  transition owner and remove provider choreography.
- Prepared material consumption/output with private witnesses and revision
  checks; extend those owners instead of moving quantities in the scheduler.
- Current finite 0-7 water, paged field working state and bounded local smoke
  queue (`terrain_water/field.rs`, `terrain_atmosphere.rs:223`). Gas is already
  simplified in this source. Worldwide rivers and region handoffs remain separate
  capability/performance questions, not established by a local bounded queue.
- Region resident begin/accept/discard, command receipts and SQL commitment.
  Empty semantic event output in this bridge does not mean world state is volatile.
- GamePack content and declared authored read/write ownership, shared browser/DO
  WASM, and legitimate TS needs/morale rules. Rules should issue changed intent;
  repeated retreat movement each tick (`games/formations.ts:57`) is a caller to fix.
- Shared original Three bake/Pixi art, multipart visual owner, spatial sprite
  sorter and Whistle semantic commands with local acquisition bindings.

## Required proof by owner

| Owner | Focused proof that demonstrates the boundary |
| --- | --- |
| Work/material | Consolidated construction + brew supply + blocked dig + Draft/cancel/reload scenario; one worker many trips, two workers concurrent portions, over-budget ready work, two parties |
| Allocation | Live split/deposit/consume sequence plus malformed relationship fixtures; aggregate reservations, material/party/generation/endpoints and retired receipt lifetime all agree |
| Index/accounting | Paused commands and restore rebuild correct indexes; mutation-maintained totals agree with a slow reference; ordinary steps avoid global rebuilds |
| Host/capture | Real adapter connect/authenticate/command for every maintained pack; valid >40-record capture; failed commit/retry/reopen retains exact effects and receipts |
| Projection/client | View crossing, baseline/reconnect/removal, dense relevant entities, surface picking, local reset and stable water sprite identity |
| Rendering | Retained multipart overlaps and deterministic cycle handling; scoped invalidation work counts; final original-art visual inspection |

Do not expand these rows into duplicated scenario suites. Reuse existing tests and
the consolidated lifecycle fixture, preserving distinct crash and algorithm laws.

## Repair order and acceptance discipline

1. Freeze the ownership corrections here and remove conflicting packet guidance.
   Preserve partial source as groundwork; do not count it as completed migration.
2. Fix retained-outcome/worker-release semantics and material allocation lifecycle
   in the coupled native work lane. Complete two simultaneous deliveries and
   construction/process reuse before expanding through the remaining families.
3. In an independent lane, repair current connection/principal/capture-contract
   contradictions. Keep its host files separate from the native work writer.
4. During the native cutover, deepen component/index/accounting ownership and
   eliminate full scans introduced by the new planner. Complete all current
   automatic work consumers, including Pirates delivery and Colony performance.
5. Address capture/projection/render hot paths through their existing owners using
   focused measurements. Preserve durability and original presentation behavior.
6. Run consolidated real gameplay and productive-worker evidence, then release
   the coherent client/backend to the existing preview under standing authority.

Each change must name the caller simplification, deleted competing ownership,
private invariants and lifecycle proof. No acceptance for merely moving methods,
adding wrappers or passing isolated algorithm tests. Keep focused algorithms and
crash tests; consolidate overlapping gameplay scenarios as already required by
section 11 of the native planner packet.
