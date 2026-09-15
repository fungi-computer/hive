# Engine ownership audit and implementation correction

September 15, 2026. Current source review of `7d31b478` in
`clearing-edge-integration`, including the preserved prepared-route continuation
edit in `world.rs`. This is source evidence, not a new performance measurement or
hosted acceptance. It refines [native work planning](07-native-work-planner.md)
and the existing repair sequence. It does not authorize a second engine rewrite.

Three parallel read-only reviews covered native execution/ECS, GamePack/DO and
client/art callers. The lead read the critical callers and evaluated the
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

`world.rs::advance_batch` never calls the native planner. `work_candidates.rs`
rebuilds party maps from all IDs; `native_work_planner.rs` repeats source/worker
scans, handles only its first missing material role, and errors for short supply
or too few workers. Its allocation/route start lacks pickup-through-deposit
reconciliation. These are inactive groundwork defects, not a description of a
successfully migrated live Colony. See section 1 of the native planner packet.

Correction: finish and review the shared work/material lifecycle with construction
and process consumers, then migrate all supported families and delete the TS
automatic pipeline in one coherent consumer cutover. Do not add a special
construction scheduler to make the first example pass.

### B. Work failure policy still leaks across domain implementations

`excavation_work.rs::advance_excavation` retains execution on occupied support,
lost reach, blocked physical preparation and some capacity failures. Its changed
target branch removes `ExcavationWork` without settling the associated attempt.
This can keep labor claimed without progress. Construction already demonstrates
typed blocked settlement for several equivalent failures.

Correction: each physical owner reports an exhaustive operation outcome; the work
owner handles release/continuation/acknowledgement. Preserve earned progress in
the domain intent. Test one blocked worker returning to independent work, changed
target, occupied support and save/reload at the retained outcome. Do not add a
timeout or feature-specific worker-reset patch.

`deconstruction_work.rs:62-73` also retains attempts on lost contact and processes
its ECS query in storage order, unlike the stable-ID ordering in excavation and
construction. Establish explicit stable order for competing physical completions;
test logically equal worlds built in different insertion orders. Bevy membership
order is not the game's authoritative priority.

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

Native `record_bundle.rs` and TS `kernel-records.ts` admit 48 records; stored
session header admission admits 40. A valid native capture can therefore be
rejected by the next layer. The public host's generic socket branch uses local
`tokenHash` before its declaration. Participant-table creation is Colony-only,
while the generic principal resolver reads that table for other game packs.

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
