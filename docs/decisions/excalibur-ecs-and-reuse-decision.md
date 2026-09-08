# Excalibur ECS: mechanisms to reuse in Hive

Game CTO decision, 2026-09-08. Research and implementation guidance; no runtime change, dependency adoption, benchmark or release claim. Delivery retains tracked source/docs/issues/Git/dist/deploy custody. Current controls continue first. This decision complements the existing module, unified-work, vertical-world and furniture-contact contracts; it does not replace their owners or restart their slices.

## Decision

Use ECS-style capability composition and maintained queries where they remove a concrete repeated branch or scan. Do not add the Excalibur engine or begin a general-purpose ECS rewrite. Its best contribution here is a clear example of retained query membership, system lifetimes and separate rendering/update policies. It is not evidence that an object-based ECS will make a hundred villagers, water fields or an always-running world fast.

The official documentation explicitly identifies composition/reuse rather than memory-cache optimization as the current ECS goal. Source inspection agrees: entities contain component objects, Maps and Sets, while queries retain matching object references. This is a useful architecture, with different tradeoffs from archetype tables or contiguous numeric component columns. [Official ECS overview](https://excaliburjs.com/docs/entity-component-system/)

Research pin: Excalibur main `4a23dd1674b1771a88bbbf9e7f20bcd772e264c4`. This is a development snapshot; its APIs are not asserted to match published v0.32.0. Root personally read the query, query manager, world lifecycle, component-removal path, action Promise, rental pool and raycast caller, plus Hive's immediate assignment/step callers. Three independent readers cover the mechanisms in greater detail below.

Hive source checkpoint: HEAD `9db4d31e8ffbd0f516a7314bc35612f97706f870`, with the separate controls candidate preserved. Read hashes: `src/jobs.ts` `69136556616d5452fae0a26c2a039ef6977160ed489b9fa8e494a0b33cc38614`; `src/clearing.ts` `7a7fd5fa786475bcc86d5432907844cb8f0cc2906b84a83cdbdadbd08fa506a7`.

## 1. Three different queries need three different mechanisms

| Question                     | Example                                                                               | Appropriate derived structure                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| What capabilities exist?     | Bodies with movement; workers with carrying; organisms with growth                    | Retained capability membership, usually changing on spawn/despawn or a capability change       |
| Who or what is eligible now? | An undrafted Haul-enabled member; an unclaimed lot; a shelf with enough free capacity | Owner-maintained field/relation indexes, or inexpensive filtering over a bounded candidate set |
| What is nearby?              | Supplies in a work region; prey near a predator; geometry near a swept arrow          | Cell/chunk buckets or another spatial broad phase, followed by exact domain checks             |

Excalibur's query manager reuses registered filters, retains matching entities in a Set and rebuilds the result array only after membership changes. Reverse component/tag-to-query indexes narrow reevaluation when structure changes. New queries still scan existing entities, and inserting an entity checks all registered queries. Numeric field changes do not update component membership. [Pinned query manager](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/query-manager.ts), [pinned query](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/query.ts)

For Hive, changing `drafted`, party membership, permission, lot location/quantity or a capacity claim must affect the relevant query through that field's actual owner. A retained `Worker` component query alone cannot notice those facts. Do not turn every changing quantity/threshold into component churn just to use one query API. Do not register a fresh arbitrary query for each actor, tile or mouse movement.

The first useful extraction is a small named index at an existing seam, not a query DSL. For example, the unified material owner can expose lots at a container and the claimed/free capacity of that container; the job owner can expose jobs by ID and personal queue order. Each index has one canonical source and rebuilds after load/reset. Indexes are not independently persisted truth. Existing maps should be reused where they already provide this lookup.

Readonly query results must not let consumers reorder shared membership. Deterministic decisions use authoritative queue priority and stable IDs, not incidental Set insertion or spatial-tree traversal order. Cache invalidation is part of the mutation operation, including accepted commands while paused. A tick-only refresh would break paused admission and inspection.

## 2. Apply cheap eligibility before expensive routes

The current `assignWork` already batches behind `workDirty` and uses the actual libcolony optimizer; keep both. However, shared job handling calls `jobOption` before `allowsAutomaticWork`. `jobOption` can compute paths and inspect resource destinations for a person who will subsequently be rejected. The chosen-assignment comparator also repeatedly searches the job array for queue rank. These are concrete places to improve; the word ECS does not remove their cost.

During the already-approved work unification, separate a cheap next-operation requirement from route construction. Derive permission from the **next operation**, not merely the high-level job name: an unsupplied build may require Haul, whereas a supplied site requires Build. Cargo continuation and explicit personal orders retain their accepted policy and priority. Do not accidentally apply automatic work preferences to those paths.

Waiting is an explicit result: if delivered stock plus live claims already covers the requirement, this job does not offer another pickup. Multiple piles remain alternative destinations for the same Haul operation; retain those alternatives through route evaluation rather than choosing one before reachability is known.

Illustrative candidate-collection fragment, not shipped code or a mandate for these names. The caller has already preserved continuation/personal priority and narrowed which workers may take automatic work:

```ts
const requirement = work.nextRequirement(jobId); // facts only; no path search
if (requirement.kind === "offer") {
  const workers = workQueries.automaticWorkers(partyId, requirement.workType);
  const candidates = localQueries.candidates(requirement, workRegion);

  const offers = routes.evaluateCandidates(workers, candidates, routeBudget);
  offered.push(...offers.ready);
}
// A budgeted search can remain pending; it has not proved "unreachable".
```

After candidate collection, the existing optimizer runs once for the joint batch; it is not invoked greedily once per job. Ordered matches go through the existing domain claim boundary, which rechecks live quantity, capacity and ownership before starting work. The query narrows candidates; the domain owner proves legality and settles the claim. Selected candidate count, route count, route expansions and claim conflicts must be observable separately from optimizer time. Compare work outcomes and deterministic tie behavior as well as timing. Avoid a global actor-by-job matrix once locality and work scope can narrow it.

## 3. Compose capabilities; preserve domain types and persistent identity

Excalibur's component model shows how an entity can gain independent capabilities without a large inheritance tree. This is useful for Hive's body/movement profiles, work capabilities, carrying and organism lifecycles. A human, cat and donkey can share body/navigation operations while their validated definitions choose different surfaces, loads and abilities. A familiar controller or an LLM controller should use the same command boundary as another authorized controller; it does not become a second physical simulation. [Official components](https://excaliburjs.com/docs/components/)

Do not flatten every state into optional fields on a universal Entity. Keep discriminated domain unions for physical location, traversal, activity and process state. Closed data definitions select supported capabilities and animation/asset IDs; validation rejects incompatible combinations and dependency cycles. Adding a component must not silently manufacture a tool, resource, permission or job.

Runtime handles may refer to durable entity/content IDs. Constructor names and process-local counters are not our save or network identity. Excalibur offers a serialization registry and custom serializers, but a convenience object serializer does not establish relational validity, version migrations or resource conservation. Hive keeps its versioned canonical records and existing identity plan, then rebuilds runtime objects/queries from validated state. [Official serialization registry](https://excaliburjs.com/docs/serialization/)

Representation remains domain-specific: sparse records for actors/items; compact numeric fields for active terrain/water/gas bricks where justified; derived render objects for visible assets. Do not allocate a JavaScript Entity for every air voxel. One rendering chunk is not one independent simulation World or Durable Object. Authority and chunk residency retain the boundaries in the existing world contracts.

## 4. Explicit update and lifetime boundaries

Excalibur distinguishes Update/Draw systems, numeric execution order and initialize/dispose hooks. Its World also flushes removals after Draw, while additions and forced removals can be immediate. This is not an atomic domain transaction or a dependency-aware parallel scheduler. [Pinned World](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/world.ts), [pinned system manager](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/system-manager.ts)

Hive keeps explicit fixed-step order in `clearing.step`, including command admission before its pause check. Each owner settles a valid domain operation and updates or invalidates its derived indexes before subsequent observers can query it. Deferred collection can protect an iteration, but must not expose half a pickup, duplicate goods or a removed support with stale references. Rendering never settles cargo, advances growth or releases a bed reservation. Do not introduce an event bus to obscure this ownership.

Runtime adapters own their subscriptions, caches and graphics, with one disposal path on reset/Continue/scene replacement. Disposing a view is distinct from destroying a bed or abandoning a job. Replacing a display must leave durable work intact and prevent stale callbacks from touching the new display. The existing Jotai display projections, XState gestures and single simulation owner remain complementary responsibilities.

Per-phase timing is worth borrowing. Measure candidate derivation, optimizer, pathfinding, activity/material settlement, persistence and rendering separately. Wall-clock measurements inform engineering; they never choose authoritative game outcomes. The reviewed engine's browser-oriented lifecycle does not demonstrate a drop-in Node/DO simulation host.

## 5. Other useful mechanisms

| Mechanism                             | Useful Hive application                                           | Required boundary                                                                           |
| ------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Sequence/parallel action composition  | Familiar flourishes, portal effects, UI choreography              | Presentation only; durable work uses the accepted serializable operation algebra            |
| Arena versus individual-object pools  | Temporary query buffers versus particles/projectile visuals       | Explicit lifetime, complete reset and capacity policy; persistent item identity is separate |
| Offscreen draw filtering              | Stop submitting invisible scenery and optional cosmetic animation | Camera visibility does not stop villagers, plants, fire or fermentation                     |
| Spatial broad phase plus exact checks | Work locality, fauna search, swept projectiles                    | Nearby/overlapping candidates do not establish reachability or a 3D collision               |

The source action queue's `toPromise` appends an in-memory callback; it does not save progress or compensate for material pickup. Nested runtime queues also do not automatically obey timing-preserving algebraic laws. Borrow the readable composition shape while retaining our explicit data plan and fixed-step interpretation. [Pinned action context](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/actions/action-context.ts#L490-L505)

Pool reset and bounds must be reviewed in the caller. Excalibur's rental pool defaults to no cleaning and grows on depletion; those choices do not establish a memory cap. A pooled visual may refer to an arrow ID, but recycling it cannot create ammunition or let an old reference control a new projectile. Frame scratch cannot escape into async saves or retained HUD facts. [Pinned rental pool](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/util/rental-pool.ts)

Excalibur's offscreen system is a Draw policy, with independent gameplay Update systems. For Hive, narrow visible chunks before per-object checks and include canopy/upper-structure bounds, not just anchors. Rendering visibility, loaded data and active simulation are three separate decisions. None of this by itself provides offline catch-up. [Pinned offscreen system](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/graphics/offscreen-system.ts)

For our regular cells, start spatial lookup with cell/chunk buckets; choose a more elaborate tree only for a demonstrated workload. Excalibur's tree is 2D, and its default ray caller can stop at the first traversed hit without sorting by distance. Cross-storey arrows need swept world-space geometry and the earliest valid collision along the trajectory, with deterministic ties. This is independent of painter order and screen-space picking. [Pinned raycast caller](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/collision/detection/dynamic-tree-collision-processor.ts#L71-L117)

## Delivery order and useful exits

1. Finish current floor controls under the existing writer. Record this synthesis and the prior Excalibur depth study at the next safe docs checkpoint; associate existing module/performance/material/world issues. No new study-management layer or blocking adoption spike.
2. In the existing unified work/material extraction, select one useful derived index and separate next-operation requirements from expensive candidate routing. Delete the replaced scans/parallel truth. Preserve personal/cargo priority, stable ties, libcolony and the accepted bed/contact policy. This is a concrete improvement within that seam, not a prerequisite to build a generic ECS framework.
3. Verify indexes against straightforward reference queries under actual add/change/remove, claim/cancel, location/capacity change, paused commands and load/reset. Reuse focused material/persistence laws. A cleared claim and a changed field must be visible before the next relevant query; no stale membership or duplicated resource output.
4. Compare meaningful useful-work fixtures at 5/25/50/100 actors when the scalable actor fixture exists, including scarce stock, obstacles and cancellation. Record candidate/path/allocation/phase costs. A tiny-map pass or an idle-entity count is not a scale claim. Choose sparse storage, spatial hierarchy or a focused ECS library only when that comparison identifies a replaced cost and validates the result.
5. Add presentation pooling/culling when their real consumer is ready. New cosmetic systems cannot extend the fixed-step owner or become prerequisites for controls, bed contact or work unification.

No upstream bug report is being filed from these reads. The supporting query note identifies a source-derived `any` removal edge, constructor-name query keys and publicly mutable cached results; these are lessons for our contracts, not reproduced findings against every release. Source inspection likewise does not establish performance numbers or server compatibility.

## Supporting read-only source reviews

- `.botanical/research/excalibur-ecs-query-review.md`: query membership, invalidation, costs and typing; SHA256 `f47532adeb97d46e8d93a1f3c6b2609d49f5ace0cffd877ad72ad64729160b6e`.
- `.botanical/research/excalibur-ecs-lifecycle-review.md`: phases, mutation/lifetime, identity and headless limits; SHA256 `7f645cef5325a5573ff600c511e36bcbbbeacee9cfa2504d45526fc52281515c`.
- `.botanical/research/excalibur-reusable-mechanisms-review.md`: actions, pools, culling and spatial callers; SHA256 `adb428a477fefe10b2a1dd0beb612d08aaa6ad3774380625c13bde57481886a5`.
- Earlier `.botanical/research/excalibur-depth-source-review.md`: depth/render study; the ECS work does not change its geometric ordering decision.

The three reader notes are evidence. This synthesis owns the Hive recommendation, especially the requirement that query updates also work for accepted paused commands rather than waiting for a tick.
