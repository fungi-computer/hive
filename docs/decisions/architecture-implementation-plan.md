# Architecture implementation plan

Game CTO plan, started 2026-09-07 and finalized 2026-09-08. Levi explicitly requests detailed plans for bounded implementers, including high-performance world generation and the interlocking living world. This selects architectural boundaries and orders the evidence required to adopt them. It is not approval to ship every future system in one sprint, adopt an unmeasured library, start paid resources or open large-world gameplay.

## Read this before assigning a writer

The product is a home in a living world: build it, welcome people, discover and learn, prepare for journeys, and bring something valuable back. Ecology, knowledge, relationships and magic change what the home can do. The small clearing remains the place to judge fun. The [product synthesis](a-home-between-realms.md) explains the journey; these companion contracts turn it into engineering decisions:

- [Simulation and content](simulation-and-content-contracts.md): facts/ownership, versioned definitions, goods/capacity, work/processes, cancellation, matching/path performance, UI, hosted authority, time and AI.
- [World generation and streaming](world-generation-and-streaming-contracts.md): pinned base generation, macro geography/drainage/biomes, signed coordinates, LOD, workers, byte budgets, durable patches and residency.
- [Living-world systems](living-world-system-contracts.md): water/heat/waste, plants/life cycles, wildlife and extinction, work groups/zones, relationships, titles/beliefs, knowledge/magic/realms.
- [Isometric ordering and structural support](isometric-order-and-structural-support.md): latest bed overlap diagnosis, footprint/part ordering, a bounded 3×3 post platform and later roof-collapse consequences.
- [Current systems review and module migration](current-systems-review-and-module-plan.md): fresh personally reviewed Fallow/source findings, confirmed picking and Go defects, deep module APIs and the first corrective landing packets.
- [Don't Starve systems study](dont-starve-systems-study.md): edition-specific horticulture, preparation, machines and otherworldly reference lessons; future consumers only.

Those documents give proposed API/data shapes with explicit maturity limits. Implement only the subset needed by the assigned consumer. Existing owners are replaced only when source/caller evidence establishes the need. Do not scaffold empty systems in anticipation of the complete game.

### Newer control/work precedence

The [controls floor-priority recut](controls-floor-priority-recut.md) is newer
than this master plan for current ordering: controls proceed first, then all wood
and herb transfer branches/validators converge under one owner and the old
parallel paths are deleted before brewing is complete. The [unified work algebra
recut](unified-work-algebra-recut.md) is the governing migration record. The
[vertical/tower contract](vertical-world-and-tower-ready-contract.md) remains
future direction, including cat-surface work; it does not interrupt controls or
World Lab.
The [Excalibur reuse decision](excalibur-ecs-and-reuse-decision.md) and [depth
review](excalibur-depth-source-review.md) are newer bounded guidance for the
unified-work, world/performance and rendering seams: one measured derived index,
one joint optimizer, paused-command invalidation before observers, and spatial
lookup kept separate. They do not add a dependency or general ECS.

## Current status and source baseline

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
