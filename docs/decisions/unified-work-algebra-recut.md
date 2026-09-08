# Unified work algebra: corrected completion contract

The [Excalibur reuse decision](excalibur-ecs-and-reuse-decision.md) is bounded
guidance for this owner: choose one measured derived index and one joint
optimizer, invalidate paused commands before observers, and delete replaced
parallel scans. No ECS dependency or generic framework follows.
The accepted fresh-only durable boundary is schema-v7: it migrated both live
wood and herb consumers together; an herb-only save intermediate was not a valid
completion checkpoint. It provides no v1–v6 readers or migrations. Old raw slots
remain recoverable/downloadable and can be replaced through New Clearing.

Game architecture recut, 2026-09-08, current source `32cd423`. This replaces the earlier suggestion that an indefinitely separate wood adapter could remain while brewing lands. Levi now explicitly requires **all current hauling—wood into construction and mugwort into shelves—to use the same resource, claim, transfer and work primitives**. Serial migration checkpoints are acceptable. The completed slice must delete the old parallel runtime paths; brewing then consumes the unified operations.

This is an ignored design handoff, not source implementation or a proof result. Delivery retains the coupled writer, Git and release custody. The architecture does not require an Effect/ECS library, another optimizer or a general scripting engine.

## What must actually be replaced

Current wood ownership is `piles`, actor `cargo`, `Site.delivered`, `claims`, `reserveWood`, `transferWood`, `dropCarried`, `deliveryOption`. Current herb ownership is `herbBundles`, `herbStorageClaims`, `transferHerb`, `dropHerbStorage`, `storeHerbOption`, `herbDeliveryOption`, and direct shelf ejection in deconstruction. Scheduler, cancellation, HUD, art selection and save validation branch on both representations. A facade that forwards to both complete implementations is only a temporary migration checkpoint.

Existing invariants are assets to preserve: wood conservation, bundle identity, carry-before-new-work, destination capacity, interrupt/drop behavior, personal versus shared work, actual libcolony matching, paused admission, strict fresh-v7 validation and raw old-slot recovery. The refactor replaces representation and duplicated transitions; it does not erase these behaviors or authorize a compatibility shim.

## Proposed data-only algebra

Distinguish **what a job requests**, **what operation is ready**, **which actor currently owns a claim**, and **where material physically exists**. One giant state enum cannot own all four.

```ts
type JobPlan = {
  definition: { id: DefinitionId; version: number };
  root: PlanNode;
};

type PlanNode =
  | { kind: "done" }
  | { kind: "sequence"; steps: readonly PlanNode[] }
  | { kind: "step"; key: StepKey; operation: Operation };

type Operation =
  | { kind: "supply"; demand: MaterialDemand }
  | { kind: "transfer"; request: TransferRequest }
  | { kind: "perform"; task: DomainWork }
  | { kind: "await-process"; process: ProcessBinding };

type DomainWork =
  | { kind: "fell"; tree: TreeId }
  | { kind: "construct"; site: SiteId }
  | { kind: "deconstruct"; site: SiteId }
  | { kind: "sow"; herb: HerbId }
  | { kind: "harvest"; herb: HerbId }
  | { kind: "rest"; actor: ActorId }
  | { kind: "prepare-recipe"; station: SiteId; recipe: RecipeRef };
```

These are API sketches, not unchecked string payloads. `MaterialDemand`, `TransferRequest` and all target/binding variants must themselves be closed typed records. A demand identifies a real destination buffer, item selector, quantity in the definition's fixed unit, and allowed source policy. A transfer request either names an exact existing lot or selects a source for an admitted demand; it never means “create this many items.” `ProcessBinding` refers to a prior named, typed result slot. Configured result references must point to an earlier compatible producer; no arbitrary expression evaluation.

`supply` is a reusable controller operation: discover an available portion, offer its transport to the existing scheduler, transfer it, and repeat until the destination has its required actual contents. It is not a worker activity that holds a pawn while waiting for materials. It counts actual delivered stock plus valid incoming capacity promises for planning, but it can only complete when the required real stock is present. `perform` dispatches to closed, domain-specific work effects. Felling a tree, changing a building's completion state and sowing a plant are different domain effects and should remain so. They all use the same activity lifecycle, routing, tick progression and completion contract.

The initial plan language supports sequencing. Do not implement arbitrary loops/condition code, speculative alternatives or general `parallel` syntax to sound compositional. `supply` has a specific bounded progress loop, with wake reasons and runtime work budget. Later independent branches may be added as an explicit `all` constructor once their resource and completion semantics are proved. No extra assignment service is implied by a plan interpreter.

### Current jobs expressed with the common operations

```ts
build(site, definition) = sequence([
  step(
    "materials",
    supply({
      destination: constructionBuffer(site.id),
      required: definition.materials,
      sourcePolicy: "eligible-loose-stock",
    }),
  ),
  step("assemble", perform({ kind: "construct", site: site.id })),
]);

store(bundle, shelf) = step(
  "move",
  transfer({
    source: { kind: "exact-lot", lot: bundle.id },
    quantity: 1,
    destination: shelfContainer(shelf.id),
  }),
);

brew(station, recipe) = sequence([
  step(
    "ingredients",
    supply({
      destination: vesselContainer(station.id),
      required: recipe.inputs,
      sourcePolicy: recipe.sourcePolicy,
    }),
  ),
  step(
    "prepare",
    perform({
      kind: "prepare-recipe",
      station: station.id,
      recipe: recipe.ref,
    }),
  ),
  step("ferment", awaitProcess({ outputOf: "prepare" })),
]);
```

There is no `haulWood`, `haulHerb` or `haulBeer` operation in this algebra. Art can still choose a log or bundle attachment from actual carried item appearance. The same transfer operation supplies build buffers, shelves and vessels. The first brew has finite admitted inputs, real vessel capacity, pinned conversion and an explicit output location; it does not wait for a complete fluid-field simulation.

### Typed configuration boundary

Author JSON/config contains definition IDs, numeric values/units, versioned recipe references, supported selectors, work categories, pose/asset keys and this closed syntax. It contains no functions, module paths to import, arbitrary predicates or callbacks. Zod validates shape/ranges/unknown keys; compilation then validates referenced assets and definitions, result-slot types, destination capabilities, allowed operation kinds, bounded plan size/depth and semantic cycles. TypeScript exhaustiveness covers the actual interpreter/handler, not merely a whitelist forwarding into unchecked JS.

Pin in-flight semantic definitions and resolved plan values. Presentation revisions do not alter costs. A new recipe using existing operations is config plus assets. A new physical operation requires a typed handler, schema/version decision and domain laws. This is extensibility with a finite language, not a configuration-shaped escape hatch around ownership.

## One physical representation and one transfer state machine

```ts
type ItemLot = {
  id: LotId;
  definition: ItemDefinitionRef;
  quantity: PositiveInteger;
  traits: PersistedLotTraits;
  location:
    | ({ kind: "ground" } & Cell)
    | { kind: "hand"; actor: ActorId }
    | { kind: "container"; container: ContainerId };
};

type Container = {
  id: ContainerId;
  owner: { kind: "site"; site: SiteId };
  role: "construction-buffer" | "shelf" | "vessel";
  capacity: CapacityPolicy;
};

type Transfer = {
  id: TransferId;
  job: JobId;
  step: StepKey;
  attempt: number;
  actor: ActorId;
  phase:
    | { kind: "reserved"; source: Portion; destination: CapacityReservation }
    | { kind: "carrying"; lot: LotId; destination: CapacityReservation };
};
```

Container contents are derived from lot locations; no separately writable contents array. An actor's cargo is derived from hand-located lots plus its active transfer, not a second physical quantity. Actor-to-transfer and destination-to-incoming indexes are derived from the one transfer store. A phase is a discriminated union because a reserved source portion and a held lot are not the same fact. An active transfer remains present across pickup and carry; wood no longer converts its obligation into a special cargo object while herbs retain a different claim type.

The first hand limit preserves existing behavior: one active carried obligation per actor, up to the item's configured carry amount. Do not silently add multiple hands/bags to make unification easier. Keep current shelf capacity one until a separate capacity product change; it already uses the generic policy. A simple mixed list can be enabled through that policy later without another item store.

### Construction stock is not counted twice

Unfinished construction owns real input lots in its buffer. On completed construction, those exact portions become an embedded-material ledger for the finished structure and cease to be separately available lots. `Site.delivered` is deleted as authoritative material state; a `deliveredMaterials(site)` query derives unfinished contents or finished embedding for existing displays and progress logic. This query is not a writable adapter.

Deconstruction consumes the embedded ledger, emits the authored salvage lot(s), and records non-salvaged quantities in the appropriate sink ledger in one completion. Canceling unfinished construction releases its untransformed buffer contents once at valid physical drop locations. Neither operation may create stock from a recipe cost while leaving the original material live. Current timber accounting therefore remains equivalent to `loose + held + stored + construction inputs + embedded + consumed == 6 × felled`, with no claim quantity included in the physical side. Mugwort accounting remains produced quantities distributed among live lots and explicit transformed/lost quantities.

Units are per item/material dimension. Summing one log and one herb into a generic “total items” does not establish conservation. Quantity, capacity contribution and carry limits are distinct. Initially use safe bounded integers and explicit conversion tables. A beverage conversion later accounts input/output/waste in its selected physical model rather than claiming herb count equals liquid volume.

### Required transfer laws

1. **Unique location:** every live lot has exactly one physical location. Referenced container/actor exists; aliases and inventory UI lists are not additional stock.
2. **Reservation exclusion:** source reserved quantities never exceed available source stock; incoming reservations plus occupied capacity never exceed destination policy. One atomic reservation creates both promises or neither.
3. **Exact pickup:** full pickup moves the same lot ID. Partial pickup deterministically splits a claimed portion into one new carried lot, subtracts the source quantity and records the resulting lot ID in the transfer phase together. Remaining claims still refer to valid remaining stock. A repeated pickup settlement cannot split twice.
4. **Exact delivery:** the held lot changes location once, the transfer releases capacity/source references, and the step records its completed effect identity in one transition. A replay returns the settled result rather than delivering again.
5. **Interruption:** before pickup, release promises and retain job demand. After pickup, drop the actual held lot at the actor's legal current cell, clear promises and retain unfinished requested work. Do not refund an original source quantity as well as dropping the held lot.
6. **Loss and invalidation:** destroyed/decayed stock invalidates affected reservations and wakes jobs; a promise does not immortalize an item. Invalid/full/unreachable destination yields waiting or safe drop according to phase, not silent loss.
7. **Completion and teardown:** extraction of stock, embedding/transformation, output creation and completion identity are committed together. Container teardown first resolves/ejects actual contents and related claims; then it removes the container and site. No dangling references or free salvage.

One synchronous owner mutates those records inside the fixed step. It preflights fallible conditions before the first mutation, or applies a small touched-record plan. No world-wide `structuredClone` for every transition, no async operations inside a material commit and no event subscriber that independently edits the same quantity.

### Floor stockpiles and later machine movement

A painted stockpile zone owns only its cells, accepted-goods filters and
destination priority. Lots within it remain physically located on ground cells;
the zone never owns a second contents list or pooled inventory. Removing,
shrinking or changing a zone leaves every existing lot in place and recoverable,
while newly disallowed goods may become ordinary relocation candidates. A desired
stock quota is policy and must stay distinct from a hard per-cell or container
capacity, so editing a quota cannot make valid physical stock corrupt. Filter,
priority and cell edits wake ordinary automatic demand/revalidation; the zone
editor never moves lots directly.

The common destination algebra may cover either one checked physical ground cell
or a container slot. A floor transfer resolves and validates the exact cell before
reserving its incoming space; a zone ID is policy and is never the physical
destination. The material owner checks actual occupied space plus incoming
reservations at that destination and supplies the same withdrawal path to
construction, shelves, vessels and later machines. Zone totals and grouped
rendering are derived views; they do not merge lot identities or grant one full
cell extra capacity. Storage priority ranks destinations separately from job
urgency, and equal-priority placement must not churn.

Later powered belts, hoppers and hoists advance real lots through the same custody
and reservation owner. They use authoritative fixed-tick progress, bounded buffers
and backpressure: a full output retains stock and stops upstream intake, while
power loss freezes progress without deletion. A moving lot has one authoritative
saved segment/buffer location and progress, never a ground/container copy plus a
second moving item. One lot consumes at most one movement budget per tick
regardless of how many segment records are iterated. Machinery never impersonates
a pawn or gains a parallel inventory/claim store.

Floor-stockpile presentation and exact ordering are a separate natural post-v7
decision alongside mixed shelves and brewing, not part of the current schema-v7
migration. Dwarven conveyors remain later technology and do not gate the first
brew or justify a new scheduler/framework.

## Execution, sequencing and concurrency

Persist only current plan position, named result bindings, current leaf/transfer/work progress, definition identity and completed effect identities needed for retry. A finished job can retire its plan once no unresolved effect/receipt requires it. The runtime does not retain a closure, generator stack, Promise or serialized XState interpreter object. Save data is understood by the game, not by a library's private runtime.

Keep job priority as the existing authoritative order. The plan interpreter exposes ready work to `jobs.ts`/libcolony; the scheduler still chooses actors and commits claims. Carried transfers are continuation obligations ahead of new automatic work. Ordinary Work flags gate new automatic transfer as Haul and construction as Build; current personal orders bypass preferences as before. Draft interrupts ordinary work and safely drops through the generic transfer path. A plan step waiting for materials/time holds no actor unless the specific domain operation requires attendance.

The first migration preserves current one-active-actor-per-job behavior. Multiple independent jobs can run concurrently. Allowing several actors to supply one job later requires an explicit demand-level incoming quantity/capacity invariant and several transfer child IDs; it is not obtained by wrapping the job in `Promise.all`. Independent static read/validation work can run together. Competing reservations remain serial commits in deterministic order, even if their candidate discovery was computed independently.

`sequence` means later effects cannot begin before earlier obligations settle. It does **not** mean the whole multi-minute job is one atomic transaction. Each pickup, delivery, work completion and process start has its own durable boundary. A failed future step does not undo already delivered or transformed material. Support/topology changes revalidate routes and interactions through the mandatory world navigation context; an operation is not allowed to reuse a path merely because its plan was valid at admission.

### Retry, cancel, checkpoints

- Retry a waiting selection using its stable job/step identity and a deterministic retry/wake policy; no per-frame spin or wall-clock-dependent simulation decisions. Resource/topology/policy changes wake eligible work. New assignment attempts do not reset target work progress or duplicate leaf completion.
- A transfer settlement key is tied to its persistent transfer/phase identity, not a newly generated ID on each retry. While active, the phase excludes the old operation; after settlement, the owning leaf/result receipt prevents replay from recreating it. Retention/compaction must respect unresolved commands and snapshots.
- Cancel future job work and release active transfer according to phase. Delivered but untransformed ingredients remain physical and recoverable. Completed domain work stays complete. Running fermentation is a process with a physical ledger; deleting the requesting job does not rewind it. First brewing may block station deconstruction while inputs/batch/output exist.
- Save at a completed deterministic transition boundary. Restore paused with exact lot identities, remaining amounts, transfer phases, job position, carried obligation and target progress. Never “recover” by recreating a source pile from recipe inputs. Browser autosave remains weaker than future hosted transactional admission; the job algebra alone does not provide server durability.
- Persisted stable leaf keys come from the pinned semantic definition, and transfer IDs/result bindings are authoritative data. Do not derive effect IDs from mutable tree-array positions or compiler reassociation: otherwise equivalent-looking plan refactoring changes retry identity.

## Where algebra helps—and where the laws do not apply

For a pure `Result<A,E>`, `map` transforms success and `flatMap` sequences a result-dependent next validation. Identity and associativity require pure functions and the same error/observation semantics. These are the ordinary monad laws documented by [GHC's Control.Monad](https://downloads.haskell.org/ghc/9.10.1.20250417/docs/libraries/base-4.20.1.0-186f/Control-Monad.html). We can use that lawful structure for compilation and admission-plan validation. Naming a mutable multi-tick simulation object `Monad` does not confer those laws.

`sequence(done, p) = p`, `sequence(p, done) = p`, and reassociating sequence are useful **plan denotation** laws if stable effect IDs, step order, timing/wake rules and emitted observations stay identical. They are not byte-for-byte AST equality. Runtime commits remain explicitly ordered. Do not flatten through a timer, compensation or observation boundary if doing so changes visible semantics.

Applicative composition fits independent config validations and fixed-shape read queries; it can accumulate all validation errors. Result-dependent selection needs sequential composition. [McBride and Paterson's original paper](https://www.staff.city.ac.uk/~ross/papers/Applicative.pdf) explains this distinction. Applicative does not mean commutative or automatically parallel: scarce-stock reservations and capacity writes cannot be reordered simply because syntax supports composition. Use a distinct accumulating validation type rather than claiming its error behavior is the same as fail-fast Result.

Fold the data-only syntax with separate interpreters for dependency inspection, referenced-asset collection, estimates and executable readiness. The execution interpreter must suspend at explicit effects; it is not a recursive fold that eagerly performs an entire job in one tick. Pure inventory totals can fold quantity maps using bounded integer addition; ordered reservation/settlement is an order-sensitive state transition, not a freely parallelizable sum. Do not build a general free-monad runtime to obtain these benefits: closed serializable nodes plus tested interpreters are sufficient for current consumers.

## Migration checkpoints and mandatory deletion gate

1. **Contracts and generic transfer implementation.** Add checked lot/container/transfer types, strict current schema and the generic transition owner with its pure queries. Port existing mugwort shelf transport completely through it in an isolated source checkpoint. Preserve bundle IDs and real carry art. Temporary wood paths may exist only with a documented remaining deletion checklist; this checkpoint is not the completed unification release.
2. **Construction transport migration.** Port wood sources, carry, incoming promises, site buffers, cancellation, embedding and salvage to the same implementation. Build planning uses `supply`; exact mugwort storage uses `transfer`. Remove old production `piles`/`cargo`/`claims`/`herbBundles`/`herbStorageClaims`/`Site.delivered` ownership as each is represented in the new model. Old names may remain in historical evidence, not live schemas, compatibility selectors or migration shims.
3. **Whole current caller and fresh-v7 save closure.** Scheduler has one transfer continuation branch and one reservation path; activity has one pickup/delivery/interruption implementation; HUD/render derive physical carried/stored appearance; deconstruction goes through container/embedding settlement; validation has one transfer/location/capacity family. Strict v7 validation preserves paused state and conservation. There is no v1–v6 decode/migrate path: invalid old slots remain raw-downloadable/recoverable until explicit New Clearing replacement. Delete transitional adapters and duplicate validators. This checkpoint, not the first herb port, satisfies Levi's unification request.
4. **Brewing consumer.** Only after that gate, add the finite configured recipe and supported unattended process primitive. It must use the already-shipped supply/transfer/claim owner. A new `BeerCargo`, `beerClaims`, `pickup-beer` branch, copy of a haul job or direct material write outside the owner rejects the candidate.

The live-consumer cutover needs stable IDs rather than replacement names. Wood cargo that lacked a persistent lot ID receives one deterministically in a collision-free namespace as the current runtime representation is replaced; its obligation becomes a carrying transfer without duplicating source quantity. Live delivered material becomes unfinished construction-buffer lots or a finished embedding ledger according to actual site lifecycle, and live herb bundle identity/location is retained. This is source/runtime migration into fresh v7, not a decoder for an old saved slot.

The proof gate covers both migrated live consumers with the same transition laws: two actors competing for scarce stock/capacity; partial wood pickup; whole-bundle pickup; paused fresh-v7 saves before/after pickup and delivery; Draft/drop; blocked destination; site cancellation and shelf teardown; exact salvage/embedding balance; resumed work with no duplicate output; strict v7 restore preserving values. Separately prove old slots remain recoverable/downloadable and New Clearing replaces them without interpreting v1–v6. Include compile-time exhaustive handlers and config rejection laws. Measure useful candidate/route/assignment/commit counts separately; preserving libcolony is mandatory and an idle-actor benchmark does not establish capacity.

No full-home browser marathon is required to prove the refactor. Use deterministic actual-WASM laws plus one focused real UI trace through both wood construction hauling and herb shelving on the pinned build, then the ordinary short hosted parity/interaction check. Preserve earlier failed evidence. One writer owns this coupled seam throughout; independent rendering/input work needs exact non-overlapping custody or serial integration.

## Root review and delivery order

Astra personally read this recut and the current material/body/job, movement, construction-removal and save callers. Accepted as the corrected architecture direction; no runtime implementation or new proof is claimed. The controls repair proceeds first. Delivery chooses small serial migration checkpoints, while the completion gate remains **both existing haul consumers migrated and duplicate ownership deleted before brewing**.

The plan compiler must reject duplicate leaf keys and normalize empty/nested sequencing before admission, preserving stable leaf identities. Normalizing syntax cannot add an extra simulation tick, change a receipt identity or reorder work. The sequence laws above describe that restricted interpretation; they are not a claim that all stateful game actions commute or form a lawful monad.

Keep physical drop/placement queries behind the material/navigation boundary. Current upper-floor drops already use a logical cell; later wall tops and excavation will require a particular supporting surface. Haul callers must ask for the legal drop location of the body's actual supported/traversing state rather than writing `{x, z, level: 0}` or assuming the actor's last endpoint is its current physical position. This is a future navigation compatibility requirement, not a requirement to implement jumping or terrain before unifying current transport. The first migration preserves the current supported-cell semantics and explicitly versions any later location schema change.

A transfer candidate has two travel questions: can this body reach the source with its current movement profile, and can it reach the destination with the proposed payload? Query the same navigation owner with the appropriate profile for each leg. A source reachable empty-handed does not prove a loaded log, pack animal or carried vessel fits the return route. Revalidate at pickup and when topology/load changes; retain or release the physical lot and promises through the same transfer transitions. Current carry limits can initially produce the same route profile, while the interface and later tests must not assume that equivalence permanently. This also keeps path cost supplied to the existing optimizer consistent with the actual work offered.
