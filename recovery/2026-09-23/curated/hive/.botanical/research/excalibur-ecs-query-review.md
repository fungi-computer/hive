# Excalibur ECS query mechanics: bounded source review

Read-only review, 2026-09-08. Implementation pinned to main commit `4a23dd1674b1771a88bbbf9e7f20bcd772e264c4`; this is a development snapshot, not a claim that these APIs match the published v0.32.0 release. Official documentation explicitly says memory-cache optimization is not this implementation's goal. No library adoption, production edits, benchmark, or runtime test was performed. [Official ECS documentation](https://excaliburjs.com/docs/entity-component-system/)

The useful lesson for Hive is maintained derived indexes with one mutation owner. Excalibur is not a ready-made answer to resource claims, spatial queries, or the cost of simulating a large population.

## 1. Queries retain membership; callers do not rescan the world on every read

`QueryManager.createQuery` reuses an existing query by its normalized string ID. Each query holds an entity `Set`; its `entities` getter rebuilds an array only after membership changes. Repeated unchanged reads return that same array. `all`, `any`, and `not` filters exist independently for component constructors and string tags; populated groups are combined conjunctively. There is no arbitrary field predicate or nested Boolean expression language.

The ID sorts and joins constructor **names** and tags, whereas actual membership checks use constructor identity. The source itself warns about same-name constructors and bundler renaming. Borrow reuse, not that identity scheme: Hive should use explicit stable query/index definitions rather than dynamic constructor-name strings. [Pinned query implementation](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/query.ts)

## 2. The indexes map changes to queries, not components to entity columns

`QueryManager` maintains `component constructor → interested queries` and `tag → interested queries`, including exclusions. It subscribes to each tracked entity's structural notifications. A component/tag change checks only associated queries for that entity; adding an entity checks every registered query. A newly created query initially scans every existing entity. Removing an entity visits all queries and unsubscribes its observers.

This is the transferable design: maintain affected membership at the authoritative mutation boundary. It is not an archetype table or sparse component store. There is no general query-removal/disposal method in the inspected manager, so this implementation also assumes a reasonably bounded query vocabulary. [Pinned query manager](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/query-manager.ts)

## 3. Costs are visible; ECS does not eliminate all scans

For `N` entities, `Q` registered queries, `F` filter terms, and `K` matching entities, source-level work is approximately:

- First query creation: `N` membership checks, each up to `F` map/set probes.
- Component/tag mutation: relevant queries only, with complete filter reevaluation for that entity.
- Entity insertion: `Q` membership checks; entity removal: `Q` set deletions.
- Reading dirty membership: allocation/copy of `K` references; iterating unchanged membership: `K` entities.

These describe loops, not measured performance or promised constant-time JavaScript internals. Entities store component objects in a `Map`, tags in a `Set`; `getById` uses an object index, but `getByName` scans the entity array. Entity removal splices that array. `processComponentRemovals` visits every entity even when few have queued changes. There is no spatial, nearest-neighbor, numeric-value, relation-join, or contiguous component-memory optimization in these query files. [Pinned entity manager](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/entity-manager.ts), [pinned entity storage](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/entity.ts)

## 4. Mutation and iteration semantics need an explicit contract

Entity addition is immediate. Entity removal marks inactive and normally queues physical removal. Component removal normally queues, then notifies query observers **before** deleting the component so cleanup can still read it. `World.update` updates entities/systems, finds inactive entities, then processes component and entity removals. Tag removal is actually immediate despite its deferred-removal comment. Component field changes do not notify structural queries.

The cached query array is a membership snapshot until a subsequent dirty getter rebuilds it; it still contains live mutable entities. It is publicly returned, and `getEntities(sort)` sorts the shared cached array in place. Membership rebuilding returns to Set insertion order. Public mutable sets/maps and forced removals can bypass normal guarantees. Hive should expose readonly query views and choose a single tick-boundary mutation contract, not copy these mixed timings as an implicit transaction system. [Pinned world update](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/world.ts), [pinned entity mutation API](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/entity.ts)

## 5. Source inspection exposes a removal edge worth learning from

In this pinned snapshot, the component `any` loop does not exclude `removedComponent`, although the `all` and `not` loops do. Since removal notification runs before actual map deletion, removing the only matching component from an `any: [A]` query can leave stale membership: the check still sees `A`, and there is no second post-deletion notification. This is a source-derived finding, not a reproduced runtime bug or a statement about every release.

Separately, removing a tag unconditionally removes and then rechecks membership. An entity matching `any: [a,b]` through remaining `b` can emit remove/add churn when `a` disappears. Therefore membership events cannot automatically be treated as domain events such as a job being canceled. Borrow differential membership maintenance, with laws for adding/removing the last `any` match and changes that leave membership unchanged. [Pinned any-component matching](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/query.ts#L189), [pinned removal dispatch](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/query-manager.ts#L166)

## 6. Type inference helps presence access, not game invariants

An all-component query derives `Entity<A | B>`; `get(A)` can then return `A` rather than `A | undefined`. Components not known through the generic remain optional. The current `QueryEntity` type for combined all/any filters is a union of the all-known entity and individual any-known entities; it does not encode the stronger intersection that every runtime result satisfies all terms plus some any term. Tags and exclusions do not narrow a domain type, and the default `Entity<any>` weakens presence guarantees.

No query type enforces job exhaustiveness, ownership, conservation, save validity, or legal commands. Retained references can also outlive component removal. Hive still needs discriminated domain unions, validated external inputs, and typechecking of actual dispatch callers. ECS presence inference does not repair an unchecked JavaScript caller. [Pinned query types](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/query.ts#L5), [pinned optional-access type](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/types.ts)

## 7. Apply the lesson to identified Hive scans, without a second world model

Root owns final local-caller selection. Candidate derived indexes are `siteById`, `sitesByCell`, `bundleById`, and bounded sets of unfinished sites or active workers. Field-dependent membership such as a ready herb, stored bundle, or free shelf must update when the actual authoritative field changes; Excalibur's structural component/tag notifications would not discover those changes by themselves. Spatial buckets and relation indexes should have named owners and explicit invalidation separately from component presence.

For the first accepted index, remove its repeated caller scans, rebuild it from canonical state after load/reset, and compare results against the straightforward reference query under mutations. Keep it derived rather than separately serialized authoritative state. Profile that changed workload before claiming scale improvement. Retain Hive's existing simulation, libcolony assignment, and Pixi owners. A broad engine/ECS replacement is not justified by this source study.
