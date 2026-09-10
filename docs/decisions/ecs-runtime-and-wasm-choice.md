# ECS, Rust/WASM and Hive's simulation boundary

King Bolete, September 10, 2026. Personal research and source review following
Levi's report that the faster clearing is still not playable. Levi explicitly
asked King to conduct this research personally. The later openness to Rust and
other compiled languages broadens the decision; it does not authorize a silent
whole-engine rewrite. No candidate has been installed into Hive, benchmarked by
us, or qualified in our Durable Object host by this study.

## Recommendation for discussion

We do not need to invent an ECS. **bitECS is the leading JavaScript candidate;
standalone Bevy ECS is the leading candidate if we deliberately move simulation
ownership into Rust/WASM. Flecs is the serious C alternative**, especially when
runtime component definitions and relationship queries are decisive.

The larger proposed split is TypeScript for host authority, public capabilities,
game definitions and presentation; Rust for coherent simulation mechanisms that
own and repeatedly process their data. Keep the original Three/bake/Pixi asset
pipeline. The current libcolony optimizer remains authoritative until an accepted
replacement; Levi's subsequent native-first proposal is assessed below. Do not
adopt a JavaScript ECS now
merely as a temporary step before an already-intended Rust migration.

This updates the older Excalibur recommendation from “borrow mechanisms” to a
concrete maintained-library shortlist. The earlier distinction between capability
membership, current eligibility and spatial proximity still applies. An ECS
does not supply all three automatically.

## JavaScript options personally checked

Registry versions below were read directly from npm on September 10. Repository
heads are review pins, not assertions that unreleased source matches a package.

| Candidate              | Actual evidence                                                                                                                                                          | Hive judgment                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **bitECS 0.4.0**       | Published December 6, 2025; zero runtime dependencies. Per-world query maps, sparse-set membership, object or numeric-array storage, observers and separate serializers. | Best JS fit: small functional API, explicit world, no required renderer or system scheduler.                                                          |
| **Koota 0.6.6**        | Published April 9, 2026; newer repository work continues. Useful relations and change tracking. Core and React entrypoints are separate.                                 | Strong browser ergonomics, but its global world registry and 16-world ceiling are a poor default for our DO host.                                     |
| **Miniplex 2.0.0**     | Published July 16, 2023; repository includes later work. Plain-object entities and retained query collections.                                                           | Easy object-model adoption; less compelling for a new data-oriented simulation foundation.                                                            |
| **Becsy 0.15.5**       | Published July 15, 2023. Rich system/query model. Docs restrict reuse of a component type across simultaneous worlds.                                                    | World/type lifecycle conflicts with our region ownership. Its threaded marketing is not proof: the inspected dispatcher rejects more than one thread. |
| **ECSY 0.4.3**         | Repository archived April 13, 2025.                                                                                                                                      | Do not start this dependency for the new engine.                                                                                                      |
| **Apecs 0.1.0**        | First npm publication September 7, 2026. Archetype columns, cached queries and published comparisons.                                                                    | Promising, but three days of publication history is too little to select our foundation from benchmark headlines.                                     |
| **TypeOnce ECS 0.1.0** | Published December 6, 2024; small typed, renderer-independent API.                                                                                                       | The inspected query implementation walks the world/component records; it does not establish the retained-query performance boundary we need.          |

Primary sources: [bitECS](https://github.com/NateTheGreatt/bitECS),
[Koota](https://github.com/pmndrs/koota),
[Miniplex](https://github.com/hmans/miniplex),
[Becsy world rules](https://lastolivegames.github.io/becsy/guide/architecture/world),
[ECSY archive](https://github.com/ecsyjs/ecsy),
[Apecs](https://github.com/diffusionstudio/apecs),
[TypeOnce](https://github.com/typeonce-dev/ecs).

### Source findings that affect the choice

bitECS keeps the entity index, component map, cached query membership and dirty
query sets on the world. Component additions/removals maintain matching sets;
first registration still examines existing entities. Calling a query still does
term processing and hashing, so “cached” does not mean no overhead. Default
queries flush deferred removals. Callers must not reorder the returned shared
membership, or use incidental iteration order as durable job priority.
[World source](https://github.com/NateTheGreatt/bitECS/blob/1585cdb4ae9a6586aef5e4d9d30d7039e22cd543/src/core/World.ts),
[query source](https://github.com/NateTheGreatt/bitECS/blob/1585cdb4ae9a6586aef5e4d9d30d7039e22cd543/src/core/Query.ts).

Its 0.4 API removed automatic `Changed` queries. Mutation owners must explicitly
report writes or update dirty sets. A direct numeric-array write cannot magically
notify rendering, save projection or eligibility. Component stores and
relation factories containing stores must be created per authoritative region;
putting mutable component arrays at module scope would still share data even
though query bookkeeping is per world.
[Release notes](https://github.com/NateTheGreatt/bitECS/blob/1585cdb4ae9a6586aef5e4d9d30d7039e22cd543/docs/RELEASE_NOTES_0.4.0.md),
[relation source](https://github.com/NateTheGreatt/bitECS/blob/1585cdb4ae9a6586aef5e4d9d30d7039e22cd543/src/core/Relation.ts).

The serializer's default backing buffer is **100 MiB**. That is configurable,
not an unavoidable core allocation. We must supply a bounded buffer or keep our
existing canonical encoder. Snapshot and diff encoding do not implement atomic
world/command/result persistence; lossy replication thresholds must not become
physical-stock persistence rules.
[Serialization documentation](https://bitecs.dev/docs/serialization).

Koota's inspected source assigns four bits to world identity and retains world
objects in a module-global universe. The published 0.6.6 JavaScript independently
contains that same cap, registry and a `Number.prototype` method patch. Worlds
have explicit destruction, but the runtime cannot assume a DO eviction gives us
a reliable destructor callback. This is a concrete lifecycle mismatch to resolve
before server adoption, not a claim that its browser core cannot execute in a
Worker. Snapshot support also remains a proposed feature.
[World allocation](https://github.com/pmndrs/koota/blob/460a0c8cca7839debffab304ed83dd8bbd0a3d30/packages/core/src/world/utils/world-index.ts),
[packed identity](https://github.com/pmndrs/koota/blob/460a0c8cca7839debffab304ed83dd8bbd0a3d30/packages/core/src/entity/utils/pack-entity.ts),
[snapshot issue](https://github.com/pmndrs/koota/issues/90).

## Performance: what the external numbers actually mean

A September 6 comparison published by **Apecs's author** measured bitECS 0.4.0
on Apple M1/Node 20.19.0: a position/velocity update over 100,000 entities took
about **0.161 ms**; creating and deleting 100,000 entities took **36.4 ms**.
Its memory estimate for two small components was about **237 bytes/entity**.
These are microbenchmarks, using the minimum of three runs, not independent
Hive measurements. I read the benchmark adapter: the movement test does a
query and two simple arithmetic updates per entity. It has no routing, economy,
water, persistence or rendering. This supports taking bitECS seriously; it does
not support promising 100,000 complete villagers per frame.
[Pinned report and methodology](https://github.com/diffusionstudio/apecs/blob/1f66a8552f48e95d97b8fd3ef835691011b36c6d/bench/compare/REPORT.md),
[actual bitECS adapter](https://github.com/diffusionstudio/apecs/blob/1f66a8552f48e95d97b8fd3ef835691011b36c6d/bench/compare/adapters/bitecs.mjs).

Our current [matched clearing measurements](../performance/clearing-20260910.md)
and Levi's browser feedback remain the evidence for Hive. External ECS results
cannot be substituted for them. Engine storage overhead also argues against
representing every terrain/water/air sample as a full ECS entity.

Grand strategy is a relevant engine consumer. Armies, settlements, trade links,
characters and population groups can use shared capabilities and indexes.
Detailed nearby bodies and distant demographic groups need different rates and
representations. Queries narrow who runs; spatial indexes narrow interactions;
due work and active sets avoid processing unchanged records. Regions advance
under their existing authority with explicit transfers, not a mandatory global
tick. Selecting an ECS establishes none of these policies by itself.

## Rust and C through WebAssembly

**Bevy ECS** can be used as a standalone Rust crate. Its components, resources,
queries and system schedules do not require its renderer or asset system. The
published docs reviewed identify 0.19.1; repository main is already 0.20-dev, so
do not silently mix their APIs. Bevy also documents non-browser WASM support.
This makes it a credible Rust foundation; it is not our tested DO package yet.
[Standalone ECS](https://docs.rs/bevy_ecs/0.19.1/bevy_ecs/),
[non-browser WASM support](https://bevy.org/learn/migration-guides/0-15-to-0-16/#support-for-non-browser-wasm).

**Flecs** offers a C99 core, archetype storage, relationships, reflection and
runtime-created components and queries. Its project explicitly supports
Emscripten/browser builds. Those runtime definitions are particularly relevant
to our engine/content split. A useful JS-facing bulk API and headless DO loader
would still need qualification; browser examples are not that proof. Do not
adopt the complete explorer, its REST server, a new scripting language or
inheritance-based game content merely because they ship alongside the core.
[Flecs](https://github.com/SanderMertens/flecs),
[runtime and cached queries](https://www.flecs.dev/flecs/md_docs_2Queries.html).

**hecs** is a smaller Rust ECS with little scheduling policy. It is worth knowing
about, but Hive is currently missing enough lifecycle/query coordination that
rebuilding those features over the smallest crate is not automatically a win.
[hecs](https://github.com/Ralith/hecs).

Rust is not automatically faster than good JavaScript for every operation.
The expected advantages are compact owned storage, fewer transient JS objects,
predictable numeric loops and stronger boundaries between readers and writers.
WASM only retains these advantages if substantial work stays inside it. A JS
callback for every entity/property can erase the benefit. Keep opaque stable IDs
and batched commands/projections at the language boundary, and account for
copying, allocation, binary startup and restoring state when comparing costs.

The proposed ownership boundary is:

| Owner                                   | Responsibility                                                                                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript host                         | Existing authenticated/scoped command admission, DO storage transaction, committed revision/results, wake and transport.                                             |
| Rust/WASM simulation                    | Canonical working entity/component data; material/work/navigation/field operations migrated as complete owned mechanisms; deterministic execution and change output. |
| Goblin definitions and game composition | Species, recipes, resources, priorities, supported process configuration, storyteller policy and assets.                                                             |
| TypeScript client and authoring         | Caps, gestures, camera, original asset pipeline, render projections and controller/tool APIs.                                                                        |

This is a proposed eventual split, not permission to maintain duplicate JS and
Rust physical records. A migrated mechanism has one authoritative implementation
and current callers switch together. libcolony currently owns joint assignment;
the native-first proposal below can replace that implementation while preserving
the existing matching and game-policy responsibilities.

New content using supported behavior remains data. An entirely new fast
simulation primitive may require compiled Rust code. JS or Shiitake controllers
can still issue permitted orders through the public engine API. A design that
requires Rust for a new herb or recipe is wrong; promising arbitrary JS systems
the performance of native loops is also wrong. Runtime-defined custom component
storage and its query behavior need explicit qualification before promising a
general engine extension surface.

## Actual size and TypeScript authoring requirement

Levi's follow-up asks whether the performance benefit justifies the undertaking,
how much code exists, and explicitly retains **mostly TypeScript game authoring**.
This remains an architectural discussion, not an accepted rewrite assignment.

At integration `ca45aa3`, a tracked-source inventory counted physical lines,
including blanks, comments and declarations, in JS/TS source extensions:

| Scope | Non-test lines | Meaning for a possible migration |
| --- | ---: | --- |
| All `src/` | 51,020 | Includes game, engine, rendering, authoring and studies; not the port size. |
| Existing `src/engine/` | 12,332 | Already extracted mechanisms, including multiple environmental implementations. |
| Selected top-level simulation/game-rule files | 9,522 | 36 files covering work, construction, activity, orders, navigation, needs, field callers and related owners; still mixed, not all intended for Rust. |
| Tests under `src/` | 22,163 | Separate behavioral evidence; public-boundary tests can remain TypeScript. |

The engine row includes approximately 6,289 environment lines, 3,674 materials,
1,009 world geometry, 635 navigation and 725 region/work/colony lines. The selected
mixed-logic row excludes model declarations and the 2,206-line Clearing state
validator. World presets add another 5,181 non-test lines outside those two rows;
their game configuration and qualification fixtures must not be blindly ported.
The counts identify code to assess, not an estimate of equally many new Rust
lines. Dependencies, generated host declarations, assets, build output and proof
scripts are not a reason to enlarge the runtime rewrite.

The mixed-logic selection consists of jobs, finite-sources, construction, brewing,
activity, physical-completion, orders, navigation-space, needs, field-water,
clearing, exploration, field-water-source, materials, terrain-removals,
water-delivery, structure-environment, water-supply, structure-support,
terrain-yields, excavation, movement, world, game-space, job-cancellation,
room-space, actors, routine, activity-lifecycle, item-containers,
material-container-facts, herbs, matching, terrain, colony and resources, using
their current JS/TS paths.

**TypeScript authors must be able to write real game behavior**, including new
rules, authored state, economic policy, needs consequences and storyteller
systems. They must not be restricted to selecting precompiled Goblin recipes.
Proposed split:

- Rust owns selected reusable high-volume operations and their compact state.
  Dense terrain/water fields use chunk arrays; an ECS is not a requirement for
  every voxel. The assignment optimizer remains an explicit owned operation.
- TypeScript game systems read bounded projections or batches and submit typed
  operations at declared execution points. Authored game state joins the same
  candidate revision and durable commit as the engine state. Opaque game data is
  validated/versioned by its owning game system, not interpreted as Goblin rules
  by the engine. One physical fact still has one owner.
- TypeScript continues to own the public SDK, host integration, controller
  capabilities, UI and original asset/rendering pipeline. Untrusted player
  scripts retain the scoped execution/admission boundary; no writable WASM heap
  is exposed merely to simplify authoring.

Bevy's normal Rust component/system API does not itself provide this TypeScript
SDK. Qualify custom authored state, queries and a TS rule against the chosen
storage model before selecting a whole-engine ECS. A new game mechanic expressed
through supported operations should not require recompiling the engine. An
entirely new high-volume native algorithm may require an engine extension. No
claim that arbitrary per-entity TS callbacks gain Rust execution speed follows.

My judgment: a Rust-backed core is credible for the long-term engine, but a full
migration is not yet justified by measured Hive results. Our large existing JS
speedup came from removing work, and source review still finds avoidable scans,
allocation and render invalidation. A literal translation preserves those costs.
The difficult work is data ownership, bulk language boundaries, revision/save
encoding, failed-commit recovery and a useful authoring API, not translating
arithmetic. A complete core conversion should be budgeted as a multi-week
integration effort with uncertain scope, not an overnight optimization or a
delivery promise based on line count.

The smallest decision-quality outcome is a coherent existing expensive field
operation in Rust/WASM, called through the real TypeScript owner, with matching
finite-stock behavior and total boundary/restore/memory costs included. Use the
existing headless workload and then the existing DO host boundary; do not reopen
the cancelled browser witness or create a separate public math lab. Assess the
benefit to the whole tick before expanding to materials, navigation and work.
This proposal does not authorize starting those runs or keeping a permanent
parallel implementation.

## Native-first proposal: libcolony size and API sketches

Levi proposes starting a Rust migration with the existing C code, including
libcolony, and asks for pseudocode. Personally checked source at `4eedaac`:

| Current source | Physical lines | Responsibility |
| --- | ---: | --- |
| `vendor/libcolony/colony.h` | 392 | C++ cost function, optional assignment limiter and Hungarian matching algorithm; includes extensive documentation. |
| `vendor/libcolony/colony_js.cc` | 31 | Embind exports. |
| `vendor/libcolony/colony_js_post.js` | 63 | JS objects/string IDs to native assignments and back. |
| `src/colony.js` + `src/engine/colony/loader.ts` | 46 | Browser and headless optimizer loading/identity. |
| `src/matching.ts` | 34 | Explicit forbidden pairs and maximum-cardinality/minimum-cost intent. |
| `scripts/build-colony.sh` | 15 | Pinned optimized Emscripten build. |

Thus the shipped native source is **423 lines of C++**, with **158 lines** of
immediate JS/TS/build integration. This excludes generated glue, binaries and
tests. libcolony is preserved MIT upstream source by Marek Rogalski, not an
original Hive C simulation. Provenance is in
`public/vendor/libcolony/PROVENANCE.md`; our retained build changes its memory
configuration. Current browser build uses `-O3`, 16 MiB initial memory, a 1 MiB
stack and disabled memory growth. No Rust memory reduction is yet measured.

The other C/C++ files found are in ignored environmental research, including
Basilisk and SPlisHSPlasH checkouts, generated build sources, frozen copies and
small authored callers. For concrete examples, the basin caller is 105 lines,
the SPH reference caller 155, the sealed-heat caller 187 and a coarse-solve
algebra helper 176. These four samples total 623 lines; they are **not an
inventory total** for the research archives. They do not form a shipped native
water/gas subsystem. In particular,
`.botanical/research/environment-round3-20260908/gas-heat/basilisk-sealed-heat-v1/ADOPTION-DECISION.md`
explicitly rejects porting that expensive thermal solver caller into gameplay.
Current playable environment mechanisms are JS/TS. Preserve those experiments
as evidence; their existence is not a requirement to migrate them.

**Judgment:** assignment is a useful small first Rust integration because it has
a real game consumer, a narrow input/output and existing laws. It is not the
best standalone evidence of a large performance gain: the current algorithm
already runs as optimized WASM. Root has not attributed the remaining lag to
Hungarian matching. In `src/jobs.ts`, work is already dirty-gated; permissions,
candidate generation, pathfinding and settlement surround the native call.
Replacing a cubic matching algorithm with the same algorithm in Rust does not
change its asymptotic growth. Avoid multiplying the work by matching an entire
large world at once; any future partition must preserve contested resources and
the selected joint-assignment objective within its actual scope.

One concrete improvement to evaluate in the port is the language boundary:
`jobs.ts` calls native `compute_cost` for each offered edge, the JS wrapper builds
string-to-integer dictionaries, pushes individual Embind objects, reads results
individually, and `matching.ts` materializes forbidden matrix entries in JS.
Use one bounded numeric batch and explicit legal-edge semantics instead. That
reduces crossing/packing work in principle; it is not a measured speedup.

### Sketch A: small Rust module, same game ownership

All identifiers below are proposed pseudocode, not exported APIs. Public IDs
remain opaque/stable; indices are private batch-local handles. Validate bounded
counts, finite nonnegative times/costs, `0 <= retryRisk < 1`, positive priority,
indices and duplicate edges before the solver allocates. Stable input ordering
and a documented equal-cost rule are required; Rust iteration order is not a
game policy.

```rust
struct WorkOffer {
    actor_index: u32,
    task_index: u32,
    travel_ticks: f64,
    work_ticks: f64,
    retry_risk: f64,
    priority: f64,
}

fn match_work(batch: &OfferBatch, scratch: &mut MatchScratch)
    -> Result<MatchBatch, InputError>
{
    validate_batch(batch)?;
    scratch.prepare_costs(batch, |offer| {
        (offer.travel_ticks + offer.work_ticks)
            / (1.0 - offer.retry_risk) / offer.priority
    });
    // Missing edges are forbidden. Maximize legal matches first,
    // then minimize total cost; resolve equal optima deterministically.
    solve_joint_matching(scratch)
}
```

```ts
// Runs at the existing eligible-work reconsideration point.
// Changed membership alone does not prove permission or reachability.
function reconsiderWork(candidate, kernel) {
  const offers = prepareEligibleOffers(candidate);
  // Preserve personal orders, care precedence and cargo continuation.
  const batch = packOffersInStableOrder(offers);
  const selected = kernel.matchWork(batch.columns); // One bulk call.
  const proposals = batch.resolve(selected);

  // Matching chooses pairs; existing owners admit claims and activity.
  // Two different jobs may still compete for the same physical lot.
  return settleThroughWorkAndMaterialOwners(candidate, proposals);
}
```

A private scratch workspace can be reused. It contains no durable jobs or stock;
dropping it on eviction loses no acknowledged work. The solver cannot directly
move a body, reserve an item or finish a job. That stays in the one candidate
settlement path. The early port does not require adopting an ECS or rewriting
the 1,387-line `jobs.ts` wholesale. Once accepted, replace current callers and
remove obsolete native/glue/build paths; do not introduce a fallback optimizer.

### Sketch B: later composition, with TypeScript game behavior

```ts
// Proposed authoring shape. These are game functions, not Rust subclasses.
const goblin = defineGame({
  data: [goblinMaterials, recipes, species, needs],
  systems: [hospitalityRules, cropRules, ordinaryStoryteller],
});

function hospitalityRules(context) {
  const requests = context.changes.read("hospitality.serviceRequests");
  return requests.map(request => ({
    type: "work.request",
    process: "serve-drink",
    beneficiary: request.actor,
  }));
}
```

The engine composition validates operation/schema dependencies and explicit
system order. The game owns the versioned service-request data and rule. The
shared work/process/material owners validate and execute requests using actual
capacity, resources, eligibility and finite quantities. TS-authored state and
engine physical changes commit in the same region revision. Low-frequency TS
rules do not imply per-cell callbacks inside water transport.

The later Rust core may compose a maintained ECS for actors/items with separate
chunk arrays for water/terrain and a room/connectivity graph for air. The initial
assignment port proves neither that ECS choice nor this larger state boundary.

### Sketch C: existing durable host keeps the commit

```ts
// Conceptual sequence inside the existing Region command owner.
// Host authentication, input binding, revision checks and replay lookup
// occur before new execution. This is not a second scheduler or database.
owner.transactionSync(() => {
  const candidate = decodeDetachedCommittedState();
  const outcome = program.execute(candidate, checkedCommand);
  // program may call Rust matching synchronously on this candidate.
  if (outcome.status === "applied") {
    persistStateReceiptAndEvents(candidate, outcome);
  } else {
    persistRejectionReceipt(outcome); // Discard the candidate.
  }
});
// Only committed results become client/controller observations.
```

This abbreviates rejection/replay/error handling already owned by
`src/engine/region/index.ts`. No external I/O occurs in game callbacks. The
stateless matcher has no RAM state to roll back. A later persistent Rust world
requires detached preparation or explicit invalidation/reload on failed commit;
the existing SQLite transaction does not rewind a mutated WASM heap. Both a
browser simulation worker and a DO can use the same compiled algorithm. Their
authority/storage hosts remain different, and an online browser never settles
server-owned physical effects independently.

The proposed first outcome is the matcher plus bulk TS caller, existing matching/
personal-order/cargo laws, matched total-call cost and memory, and browser/DO
loading through existing host contracts. It is a bounded migration proposal,
not a started build, new browser test, or promise to fix water/gas lag. Numerical
and renderer performance work remains separately necessary.

## DO constraints survive the language choice

Cloudflare documents shared isolate globals, disposable object memory,
precompiled WASM imports, SIMD support and no Worker threading. Use per-region
worlds/memories; keep compiled code shareable. Do not count native multi-core ECS
benchmarks as per-DO throughput. Browser background execution can be added through
the same headless module; it does not change authoritative time or outcomes.
[DO memory](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/),
[WASM runtime](https://developers.cloudflare.com/workers/runtime-apis/webassembly/).

An ECS heap is working state, not a new durable database. Reuse our existing
Region receipts and host transaction design. Prepare a detached candidate or
have an explicit invalidation/reload path after failed commitment. Return
success and publish projections only for the committed revision. Neither Rust
borrowing, ECS deferred commands nor serializer snapshots prove crash recovery.
Alarms, cross-region handoff receipts and controller permissions remain explicit
host/engine contracts. We already have work in these areas; do not invent a
parallel persistence framework to adopt an ECS.

## Immediate correction work remains useful under either choice

Personal Hive source review at `cc09e06` identified costs an ECS installation
alone will not remove:

- `src/clearing.ts`: eager sheltered-bed routing even after its feed consumer can
  no longer use the answer; environment work still runs every tick.
- `src/navigation-space.ts`: serialized cache stamps and per-path-node scans of
  finished structure footprints. Geometry-owned occupancy indexes are missing.
- `src/jobs.ts`: broad candidate regeneration and expensive options evaluated
  before some cheap permissions; retain libcolony and personal/cargo policy.
- `src/exploration.ts`: signatures rebuilt for cached visibility and broad
  observer recomputation as bodies move. Retain fog-of-war semantics.
- Water/air owners: full-field work, diagnostic transfer data later discarded,
  and repeated paid-history admission. Keep conservation and actual receipts;
  distinguish them from optional diagnostics.
- `src/view.js` and `src/art.js`: evolving water height can invalidate a texture
  and trigger a runtime Three bake. Render invalidation should reflect visible
  changes and preserve geometry/picking, rather than every numeric change.
- HUD/camera/save callers: broad facts and snapshots rebuilt despite narrow
  changes. Mutation-owned revisions must replace expensive rediscovery.

These are source findings, not measured attribution of browser lag. Fix the
data ownership, work selection and invalidation at whichever implementation
boundary we choose. Do not spend the next sprint only rearranging entity types.

Before committing to a language migration, compare one real expensive existing
consumer with equivalent gameplay and finite-stock results, including boundary
cost and memory, then qualify the selected package in the existing local DO
host. No speculative million-idle-entity capacity claim. Levi has cancelled the
browser witness because he playtested it himself; this research does not reopen
that run. The next decision is JS-first repair versus a bounded Rust-core
replacement, discussed with Levi rather than silently chosen.

## Review provenance

Source pins: bitECS `1585cdb4ae9a6586aef5e4d9d30d7039e22cd543`;
Koota `460a0c8cca7839debffab304ed83dd8bbd0a3d30`;
Miniplex `7d1ff8fd499a465225e45fbd896a746dcd18ffb0`;
Becsy `3b8e8ff43bb0d4f3e7ea66460978992bc58a6dc7`;
Apecs `1f66a8552f48e95d97b8fd3ef835691011b36c6d`;
TypeOnce `0b83b000908cb274bc584b051b575a0fe9de5985`.

Public source/registry readbacks and the downloaded-but-unexecuted bitECS/Koota
packages are retained outside engine source in
`/tmp/hive-ecs-source-20260910-6vy73dw7`. This document retains the useful findings
and source links if that temporary directory disappears. No install scripts,
build, browser, benchmark, deployment or runtime migration ran for this study.
