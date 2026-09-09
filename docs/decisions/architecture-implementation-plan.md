# Architecture implementation plan

## Opaque engine contracts and composed tools — September 9

Levi's standard is Watchdog's actual **payload-blind job engine**, not a
Shiitake-specific durability wrapper. Its public `WatchdogQueuedJobSchema` stores
`payload: Schema.Unknown`, queue and lane; `Watchdog.make` receives structural
storage, execution, liveness and wake capabilities. Watchdog owns private claims,
transactional admission, cancellation and settlement while its consumer supplies
payload meaning. Botanical Field Guide software-shape explicitly requires this
separation. Game CTO re-read current Watchdog `src/{index,effect}.ts` and README
on September 9; this is actual source guidance.

Apply that boundary across Hive. The world storage owner need not know that an
opaque material is tungsten, that Goblin puts it below a certain depth, or that
it requires a particular tool. Goblin definitions and deterministic registered
systems supply generation/discovery policy, excavation permission and supported
physical properties/interactions. The engine owns identity, storage, spatial
queries, bounds, invalidation, scheduling and lawful mutation. A material kernel
may require mass, capacity or transport coefficients; these are its typed
physical inputs, not a hard-coded table of Goblin nouns. Opacity at a generic
owner does not make conservation or valid references optional.

New content over supported primitives is data. New physical behavior can add a
versioned typed system handler registered by the consuming game. Saved plans
contain IDs and checked payloads, not closures, executable strings or callbacks.
The consumer validates payload meaning; the owner validates its lifecycle and
structural obligations. Systems propose changes through narrow owners, with
declared read/write dependencies and deterministic ordering. They cannot mutate
one another's maps or bypass material/energy balances. No universal event bus,
all-optional entity record or second game loop is implied by composability.

Current correction before world extraction acceptance: moving a fixed
air/soil/stone voxel recipe into an engine directory does not make storage
payload-blind. Separate the opaque voxel/edit/residency owner from that original
generated-world recipe; prove another material palette and distribution through
the same owner. Keep the first world's geography and codec identity compatible.
The material extraction supplies consumer definitions; work and geometry need
equally real consumer boundaries.

Watchdog remains intended reuse for durable host work in the later Cloudflare
host. Use its maintained operations when that consumer lands; do not reproduce
its lease/recovery machinery as a Hive scheduler. The fixed simulation clock and
libcolony still own in-world time and assignment. A durable host execution receipt
is distinct from a committed game command and eventual physical work completion.

### Debugging is an engine consumer

Optional diagnostic adapters read the owners' actual queries: geometry/surface/
hitbox overlays; selection volumes and traversal edges; work eligibility, claims
and cancellation reasons; material/source/sink balances; water/soil/gas/heat
fields and exchanges; generator/cache provenance; save/command receipts; and
separate candidate/path/optimizer/field/render/memory costs. Reuse existing
picking-debug work and accepted numerical diagnostics, not another world model.

The headless query/trace contract is independent of Pixi, React/Caps, CLI and MCP.
Consumers may render overlays, inspect a bounded trace or export a snapshot.
Rendering and original-asset authoring remain their own composable modules; the
original Three compiler/MCP is already a separate real consumer. Debug adapters
cannot create a second mutation authority or silently advance time. Use bounded
trace subscriptions with dispose/reset and visible overflow/retention limits;
instrumentation is optional and its enabled cost is measured. Do not build a
generic observability framework before a geometry/claim/field consumer needs it.

Public/player inspection and developer inspection are different grants. Normal
game and Shiitake tools obey visibility and remembered knowledge; X-ray cannot
expose a hidden underground dragon through pixels or data. A development MCP
connection gains full-world debug access only through an explicit host grant,
never because public asset creation shares the same transport. Repairs use
typed authoritative operations with receipts rather than editing debug snapshots.
All graphical debug consumers use public Caps.

The first extraction is grounded in `visual-hit-geometry.js`: today it imports
Pixi, binds the actual alpha hit area, creates diagnostic spans and draws them
inside one module. `view.js` calls `picking.renderDebug` and `ui-actions.ts`
provides the checked picking-debug action. Preserve the useful property that
the visible outline comes from the actual hit geometry. Separate pure geometry
and diagnostic records from the optional Pixi drawing adapter as the common
geometry owner lands; do not create a second set of guessed click rectangles.
Its current 256-target drawing limit must become a reported truncation rather
than implying the overlay includes every target. Exported inspection records
must be detached values, not live display objects or writable simulation maps.

| First debug consumer | Authoritative facts it must expose | Acceptance |
| --- | --- | --- |
| Picking, placement and 3D selection | Actual hit silhouette, world surface, view transform, hit target and selection bounds; accepted/rejected target reason | Rotate all four views and change layers; the clicked object and visible outline agree. Debug rendering cannot intercept input or reveal unknown player data. |
| Material/work inspector | Lot custody, available versus claimed quantity, endpoint capacity and an operation's actual admission/interruption result | Inspect the same contested transfer in Goblin and the headless ore depot. Cancellation, retry and reload show the owner's changed facts without a second claim ledger. |
| Environmental balance view | Stored amounts, declared sources/sinks and actual per-step exchanges for water, soil, smoke and heat | Digging or ventilation changes both the visible field and the same numerical balance. Sampling a paused field does not run another solver step. |
| Generator and runtime costs | Recipe identity, signed cell/brick, generated base versus edit, residency/eviction and separately measured simulation/render work | Inspect an edited cell before and after eviction/reload; record bounded query size and diagnostic overhead on the frozen workload. |

Each diagnostic result identifies the world, tick/revision and scope it observes.
A trace is explicitly bounded and reports dropped events; closing its consumer
releases subscriptions and retained buffers. Paused reads are legal and cannot
change physical quantities, elapsed work or random state. No full-world scan,
serialization or trace allocation belongs in an ordinary frame when diagnostics
are disabled. An optional adapter may format the same records for Caps, CLI or
MCP, but transport choice does not define another inspection implementation.
These are acceptance requirements for the affected engine modules, not a claim
that the richer debugger is already implemented or remotely exposed.

Game CTO plan, started 2026-09-07 and finalized 2026-09-08. Levi explicitly requests detailed plans for bounded implementers, including high-performance world generation and the interlocking living world. This selects architectural boundaries and orders the evidence required to adopt them. It is not approval to ship every future system in one sprint, adopt an unmeasured library, start paid resources or open large-world gameplay.

## Current precedence — 2026-09-09

The [engine/asset/game decision](hive-engine-asset-pipeline-and-goblin-boundaries.md)
now governs module and product ownership. Hive supplies reusable physical-world,
material and execution mechanisms; Goblin supplies content and game policy; the
asset pipeline supplies original reusable visuals through a common authoring API.
Fungi host/account/billing integration remains a separate platform boundary.
Read the [current sprint](architecture-proof-sprint.md) and
[current source audit](current-systems-review-and-module-plan.md) for live status
and repair order. Engine capability/execution consolidation precedes publication
of the retained care candidate. Earlier control/brewing/Delivery sequences below
are historical and must not restart released work or refill retired Herdr lanes.

## Engine API design from the Botanical source review — September 9

Levi asked Game CTO to read the Botanical Field Guide and actual BirdDog,
Watchdog, Shiitake and Woodstock implementations. The useful standard is a
small domain interface over a deep owner, with one implementation and explicit
lifecycle. It is not a requirement to put every module in its own package or
replace fixed simulation steps with asynchronous jobs.

The Field Guide's software-shape and ownership-and-seams chapters require
closed domain unions, parsing at real boundaries, bounded work, atomic
transitions, and a net reduction in duplicated ownership. A relationship
between existing owners gets one typed integration boundary; it does not earn a
second queue, store or lifecycle. Function length is a review signal, not a
decomposition quota.

The checked examples establish concrete design lessons:

- **Shiitake** exposes an addressed `Session` with commands, reads and owned
  observation. Its Promise interface uses the same Effect implementation.
  Model, storage and host capabilities enter at construction. Hive should have
  a typed supported consumer interface; renderer, game UI and AI adapters must
  not coordinate private simulation fields or maintain alternate engines.
- **Woodstock** is deliberately private inside Shiitake. Its command admission
  joins the request receipt and work pointer in one owner transaction. Exact
  retry reuses the acceptance; changed input with the same identity conflicts.
  Hive's physical owner likewise owns admission, custody and completion laws.
  An HTTP/MCP success or a caller's retry cache cannot substitute for them.
- **Watchdog** publishes generic work lifecycle operations and accepts an
  executor. It does not interpret the work payload. Hive should separate the
  shared execution/transfer rules from recipe, plant and character meaning.
  Watchdog's durable host scheduling is not a replacement for libcolony or the
  deterministic movement/work/field clock.
- **BirdDog** owns addressed agent correspondence over generic work, including
  its outbox boundary. That is an example of composing two existing owners
  without teaching the lower owner about agents. Hive's controller integration
  translates committed game events and allowed actions; transport delivery
  cannot apply physical effects or turn a retry into another action.

### Immediate acceptance rules for the extraction

1. Separate the supported engine entry from private implementation helpers.
   Moving fifty helpers into a factory and re-exporting them all is not a
   finished public API. Compatibility imports can remain during a recoverable
   checkpoint, but source review must identify their removal or internal scope.
2. A game/UI/controller requests an outcome such as storing a lot. The engine's
   work/material owners coordinate reservation, travel, pickup, delivery and
   interruption. A low-level transfer API may serve the executor; each game
   feature must not become another executor itself.
3. One resolved material definition and one container derivation supply every
   current consumer. Admission records the resolved physical obligation;
   mutation and restore use the same phase/custody predicates. Persistence
   retains game references and historical migration checks, not a second copy
   of transfer rules. Missing historical evidence is not manufactured on load.
4. Keep ordinary typed outcomes explicit: accepted work is distinct from
   completed work; unavailable stock, full destination, stale intent and
   interruption are not generic errors or silent returns. Retry semantics
   belong to the operation whose effect could repeat.
5. Read models are projections of the owner. Shiitake's `watch` registers
   observation before taking its baseline and returns cleanup with the stream;
   that is the model to follow when Hive joins live baseline/change observation.
   Do not add a general event bus or a second saved UI state to emulate it.
6. Keep snapshots/version migration, query invalidation, active claims and
   temporary resource cleanup local to their actual owners. A private deep
   module can deserve extensive laws without becoming a public package.

The first caller proof remains Goblin construction/storage plus the independent
five-unit ore depot using the same material implementation. Its caller should
need neither Goblin imports nor manual edits to internal arrays. The later
controller proof authors public Mycelium schema/handler operations over that
engine interface and invokes them through the existing execute tool/sandbox.
This review does not add an engine dependency on BirdDog, Watchdog, Woodstock,
Effect, a server framework or a new scheduler. Each real integration must show
which existing ownership it removes and which lifecycle it preserves.

Source trace: Botanical `packages/shiitake/src/client.ts` (`ShiitakeSession`),
`internal/coordinator.ts` (`acceptAndWakeCommand`, `watchSession`),
`internal/woodstock/session-store.ts` (`acceptSessionCommand`), and
`src/internal/run-scope.ts` (`acquiredTools`); BirdDog and Watchdog public
`src/index.ts` contracts. Woodstock's accepted private-module ADR explains why
its durable complexity is not another public package. This is source/design
evidence, not a new execution or hosted proof of those packages.

## Read this before assigning a writer

The product is a home in a living world: build it, welcome people, discover and learn, prepare for journeys, and bring something valuable back. Ecology, knowledge, relationships and magic change what the home can do. The small clearing remains the place to judge fun. The [product synthesis](a-home-between-realms.md) explains the journey; these companion contracts turn it into engineering decisions:

- [Simulation and content](simulation-and-content-contracts.md): facts/ownership, versioned definitions, goods/capacity, work/processes, cancellation, matching/path performance, UI, hosted authority, time and AI.
- [World generation and streaming](world-generation-and-streaming-contracts.md): pinned base generation, macro geography/drainage/biomes, signed coordinates, LOD, workers, byte budgets, durable patches and residency.
- [Living-world systems](living-world-system-contracts.md): water/heat/waste, plants/life cycles, wildlife and extinction, work groups/zones, relationships, titles/beliefs, knowledge/magic/realms.
- [Isometric ordering and structural support](isometric-order-and-structural-support.md): latest bed overlap diagnosis, footprint/part ordering, a bounded 3×3 post platform and later roof-collapse consequences.
- [Current systems review and module migration](current-systems-review-and-module-plan.md): fresh personally reviewed Fallow/source findings, confirmed picking and Go defects, deep module APIs and the first corrective landing packets.
- [Don't Starve systems study](dont-starve-systems-study.md): edition-specific horticulture, preparation, machines and otherworldly reference lessons; future consumers only.

Those documents give proposed API/data shapes with explicit maturity limits. Implement only the subset needed by the assigned consumer. Existing owners are replaced only when source/caller evidence establishes the need. Do not scaffold empty systems in anticipation of the complete game.

### Historical control/work precedence (2026-09-08)

The [controls floor-priority recut](controls-floor-priority-recut.md) is newer
than this master plan for current ordering: controls proceed first, then all wood
and herb transfer branches/validators converge under one owner and the old
parallel paths are deleted before brewing is complete. The [unified work algebra
recut](unified-work-algebra-recut.md) is the governing migration record. The
[vertical/tower contract](vertical-world-and-tower-ready-contract.md) remains
future direction, including cat-surface work; it does not interrupt controls or
World Lab.
The accepted architecture-audit disposition supersedes any herb-only durable
intermediate: schema-v7 must migrate wood and herb together after the isolated
helper. Materials laws belong in the ordinary required test command.
The [Excalibur reuse decision](excalibur-ecs-and-reuse-decision.md) and [depth
review](excalibur-depth-source-review.md) are newer bounded guidance for the
unified-work, world/performance and rendering seams: one measured derived index,
one joint optimizer, paused-command invalidation before observers, and spatial
lookup kept separate. They do not add a dependency or general ECS.

## Historical status and source baseline (2026-09-08)

During this planning pass, Delivery published upstairs candidate `32cd4235e22a6f7d456c3100d87fa8abd89475cd` on the existing feature preview. Local HEAD was independently read at that revision. Delivery reports exact hosted asset parity and preserved local topology/material/save laws. The final browser trace reached the earned-material upstairs fixture; later complete sleep/save/reload browser assertions were not finished, and the long trace was stopped under Levi's publish-and-move-on direction. This plan neither reruns nor upgrades that evidence claim.

Existing runtime has a tiny two-person home, typed work/claims, work preferences, Draft/Go, persistent local saves, herbs/shelf storage and upstairs source. World Lab source is a provisional independent planar sampler/canvas caller; no browser/benchmark was run in this pass. Generic brewing goods/processes, work groups, social simulation, ecosystems, realms and hosting are future consumers. Older top-plan schema/custody/automatic-caravan paragraphs are historical and must be marked superseded without deleting their evidence.

### Architecture decisions to preserve

1. One authority owns interacting simulation facts. UI, maps, shaders and LLMs do not mutate parallel copies.
2. Generated terrain is immutable under a pinned recipe; player/world changes are durable overlays. Reload never resurrects a cut tree or refills a drained pond.
3. Space, storage chunk, simulation region, political territory, work group and travel party are distinct.
4. Physical goods have one location and balanced quantities. Claims promise availability; they do not duplicate goods or suspend decay.
5. Work and unattended processes are separate. People can leave a brewing vessel while its batch continues on the world clock.
6. Config adds content over supported typed behaviors. New behavior gets an exhaustive implementation, not an arbitrary callback or a global event subscription.
7. Knowledge, books, practice, status, affiliation and control grants are separate facts. Their effects enter the existing owner that can validate them.
8. Region/actor simulation, generation and rendering have separate measured budgets. Larger screenshots and optimizer microbenchmarks do not prove capacity.
9. Distant approximations have explicit conversion/history laws. No silent loss of individual identity, water, work or populations at an LOD boundary.
10. Every new system earns adoption through one persistent useful effect in the existing game and a bounded failure proof.

## Concrete source map

| Existing seam                                           | Preserve/use                                                        | First justified extension                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/model.ts`, `orders.ts`, `clearing.ts`              | Closed command/job/activity data and admission before pause         | One brew command/process; later explicit command IDs at an external-retry boundary    |
| `src/jobs.ts`, `matching.ts`                            | workDirty, actual selected optimizer, claim revalidation            | New eligible resource/work candidates; measured indexes and group filters             |
| `src/activity.ts`, `resources.ts`, herb-storage callers | Actual interruption/drop/material ownership                         | Narrow brew goods/claim path replacing a prospective third commodity clone            |
| `src/persistence.ts`, main save caller                  | Boundary schemas, relational checks, atomic local snapshot/recovery | Brew state/semantic-plan migration; later region checkpoint/write-set persistence     |
| `src/world.js`, `movement.js`, `art/scale.js`           | Valid cells, support/openings, movement and projection              | Shared global-address/data-needed query after upstairs; excavation units later        |
| `src/world-lab/terrain.js`, `main.js`                   | Pure signed generator and first consumer                            | Real measurements, bounded Worker, complete recipe identity, durable patch experiment |
| `src/hud.jsx`, store/machine callers, `view.js`         | Declarative projections, one gesture owner, actual picking          | Process/zone/reason inspectors; no reconstructed world from display state             |
| `src/art.js`, `src/art/*`, isolated studies             | Original Three → low-resolution bake → Pixi                         | Actual needed props/poses and palette comparison; bounded appearance caching          |

These are source entry points, not a second writer's blanket file grant. Delivery chooses the smallest actual file boundary after opening current callers. Generated/vendor libcolony ownership and provenance remain unchanged.

## Delivery sequence and parallel capacity

The next planned new gameplay loop is **one honest brew**. Current defects come first: the latest personal audit confirms padded-sprite picking and a missing-topology Go caller, in addition to bed-ordering/contact problems. Delivery has authority to land the compact picking/Go correction now while the bed's actual render/contact first shape is prepared. The module migration record governs those repairs and the checked input/work/save boundaries before brewing. The new post/platform request has its own support/art contract, while destructive collapse stays future. The existing independent World Lab and actual-simulation performance tracks remain valid when their owners and review capacity are available. New social/royalty/animal ideas are durable future contracts, not additions to that brew.

| Packet                                  | Dependency and useful result                                                       | Owned concern / exit proof                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current picking and Go defects          | Immediately from published upstairs                                                | Cached visible-silhouette picking, real wall body versus transparent ground, active-floor/tool routing; topology-aware Go up/down and blocked stairs. Distinct file custody, one serial integration and short pointer/law proof. |
| Bed/contact and checked module boundary | Exact pose fixture; independent of ordinary unchanged-art repairs                  | Render parts/order and explicit contact semantics, then actual checked UI handler/effect/input dispatch and mandatory navigation context. No forwarding-whitelist substitute or broad proof freeze.                              |
| Brew definition and finite sourcing     | After upstairs; choose one recipe/input origin and real vessel/container economics | Delivery records exact ingredients/capacity/time/serve scope. Missing inputs must be an actual acquisition path, never proof-only stock.                                                                                         |
| Brew goods and process                  | First selected recipe                                                              | One coupled writer integrates incremental claims, real transfers, preparation, unattended batch and one output in vessel custody. Save/reload/cancel/full shelf laws; second supported recipe as data.                           |
| World Lab first diagnostic              | Independent of brewing                                                             | Same seed/complete arrays across signed seams/request order; actual overview/input/residency timings, inspectable coast/ridge/LOD. No actors/physics claim.                                                                      |
| Bounded generation worker               | Measured synchronous lab                                                           | One Worker, cooperative cancellation, stale-result rejection, explicit in-flight/result/scratch byte limits, no UI stall from giant requests.                                                                                    |
| Real population baseline                | One frozen simulation revision and legal fixture                                   | 5/25/50/100 useful-work runs with matching/path/state costs, claims, fairness and finite materials; disclose map/workload limits.                                                                                                |
| Persistent generated edits              | Lab base identity and real save boundary                                           | Modify/tombstone, commit, truly evict decoded data, regenerate/reload; failed/stale save cannot erase newer changes.                                                                                                             |
| First hospitality/knowledge connection  | Brew/store/serve and existing people                                               | One actual visit/service outcome, later one learned technique in a physical medium. Relations do not auto-recruit; books do not auto-grant skill.                                                                                |
| Groups and zones                        | Work/claim core plus a real castle/forest need                                     | One active policy per person, stage-aware source/work/delivery filtering, personal refinement, mid-haul policy change and explicit direct/escape override. Later include in scale fixture.                                       |
| Finite ecology experiment               | Topology/openings/quantities; independent diagnostic first                         | One route diverts conserved water into a pond/soil response; separate smoke/vent experiment. Solver/units and visual cause/effect reviewed before gameplay.                                                                      |
| First living/social consumers           | Appropriate preceding quantity/work owner                                          | One plant process or prey habitat response; separately one social encounter/repair. Each has persistent consequence; neither requires a whole nation.                                                                            |
| Occult opportunity and realm identity   | Knowledge/encounter/item facts, real location migration                            | One card/match settlement or alternate acquisition; one existing actor/cargo crosses and returns while home work continues. No duplicate people or rewards.                                                                      |
| Streamed gameplay / hosting             | Tiny-map fun acceptance plus actual crossing/edit/eviction evidence                | Controlled chunk fixture, then two clients/one owner, then recoverable two-owner travel/offline history. Each is a separate release decision.                                                                                    |

Rows after the current brew/lab/performance commitments are dependency guidance. Delivery can reorder independent first consumers when the product need is clearer; it cannot skip custody/history proofs or silently expand the live map. Planet topology, complete gases, breeding/genetics, court systems, all religions and full combat are not one milestone.

Independent ready work can include original art studies, source/UX research, pure terrain/worker files, and frozen-source performance fixtures. Coupled simulation/resource/save and shared caller integrations remain serial with one writer. Avoid broad builds/proofs while another candidate is frozen. Levi's request to reduce long proof load remains in force: short laws plus one focused interaction outcome; use larger studies only for a specific unresolved asset/behavior question.

## Decisions implementers must not guess

| Decision                                 | Default direction / decision owner                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First brew inputs, duration and capacity | Delivery selects a finite, reviewable recipe under existing scope; return only a real new product conflict to Astra. A portable keg cannot be conjured from grain. |
| New shelf storage                        | Mixed simple list, one explicit initial capacity metric. Pack grids, arbitrary nesting and liquid mixing require actual consumers.                                 |
| Recipe edits during work                 | Pin semantic version/resolved plan; presentation revisions independent. Missing old semantics requires recovery/migration.                                         |
| Work-group merge                         | One active ordinary-work policy initially. No undocumented union/intersection of multiple groups.                                                                  |
| Policy versus travel                     | Work-site, source, delivery and movement rules are separate. Direct/emergency exceptions are explicit and preserve permissions/custody.                            |
| Social and belief effects                | Typed named consumer and witnessed event. No dialogue-driven implicit mutation; no title/religion granting generic control.                                        |
| Animal LOD                               | Cohort↔individual conversion is balanced; important individuals persist. No hidden respawn after local extinction.                                                 |
| World size/sphere/vertical units         | Measured diagnostic and topology/unit decision before save/gameplay adoption; current sample bounds are not a planet.                                              |
| Water/air solver accuracy                | Small conservative experiment with units/stability/boundary tests. Actual method adoption requires evidence, not an attractive animated study.                     |
| Cross-authority ambiguity                | Keep entities pending/frozen and reconcile. Never duplicate or time out into competing active owners.                                                              |
| Shared Caps change                       | Agree exact shared-file custody with Botanical; game-specific composition remains game-owned.                                                                      |

## Proof contracts that can fail the plan

Every packet names its initial state, authorized trigger, real consumer, observable result, interruption/corruption case, durable outcome, and measurement limits. Independent source review reads the handler plus immediate caller and challenges the brief. Art decisions use actual native/game-scale pixels and relevant motion. Tests are not a substitute for those readings.

Cross-system conservation uses the relevant quantity law: sources plus initial amount equal remaining stock, holdings, outputs and declared sinks. It is not one universal equation pretending all chemistry has been modeled. Track references and transformations across custody. Durable command deduplication, process completion identity and transfer recovery are separate laws.

Performance targets remain provisional: 50 ms is the simulated tick cadence, not an allowed 50 ms main-thread CPU stall. For a 60 fps desktop display, initially budget at most about 4 ms of main-thread simulation CPU in an affected frame, measure UI/render/save costs separately within the 16.7 ms frame, and expose backlog rather than running unlimited catch-up ticks in one frame. A later worker boundary must prove equivalent authority and input behavior. Aim for p95 input feedback under 100 ms and bounded decoded/GPU/WASM/queued memory. Record machine/browser/revision, work offered/completed, p50/p95/worst, warm/cold and phase breakdown. Do not combine local software-rendered proof timing with real device capacity claims. No fixed world/population promise comes from these targets.

When a target fails, identify the dominant cost and one optimization: candidate narrowing, connectivity caching, dirty work, representation choice, bounded generation, texture reuse or query selection. Verify the same behavior and fairness afterward. Introducing an ECS, Effect, worker pool or replacement optimizer requires evidence of the capability/cost it solves and a deletion plan for the replaced path.

## Worker handoff requirements

A bounded brief uses an existing issue, states one useful outcome, gives actual source/caller anchors and exact file custody, identifies adopted contract sections, and names its smallest first working checkpoint. The writer must report any needed decision before inventing semantics. The reviewer checks the immediate caller, failure disposition and disproportional machinery. Delivery integrates serially, keeps source hashes/evidence scope honest, and publishes coherent same-preview results.

No new PM hierarchy, board or status framework is needed. Luna carries bounded implementation/discovery; Terra checks direction and final candidate; Sol handles harder invariants. Astra retains difficult architecture and personal original-art review. Routine source acceptance remains Delivery's; unchanged accepted art does not earn another approval gate. Native readers in this pass performed source/document research only, with no browser/proof/build/runtime work.

## Durable issue associations and historical notes

Publish these six architecture records plus the reviewed Don't Starve study under `docs/decisions` and link this entry from PROTOTYPE/ARCHITECTURE. Associate existing #1 code health, #3 upstairs/render/support, #4 worldgen/streaming, #5 authority/offline, #6 performance/groups, #7/#14 goods/brewing, #8/#17 knowledge/controller, #10 ecology/water, #11 art/light, #12 interaction, #13 occult, #15 factions/status/beliefs and #16 capabilities. #18 owns husbandry/pack animals; connect wildlife/ecosystem direction there and to #10/#14, creating a bounded child only if Delivery assigns an actual independent outcome. Do not create one issue per speculative noun.

The source/research notes used for this plan remain ignored provenance, not claimed published papers: worldgen-current-source-and-risks, interlocking-runtime-failure-review, architecture-implementation-inventory, work-groups-and-areas-reference-study, social-interactions-and-households-reference-study and royalty-and-belief-reference-study. Companion records retain primary source links and distinguish game/mod mechanics from Hive design inferences. No mod compatibility or benchmark was tested in this planning pass.
