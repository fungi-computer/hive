# ECS query decision — 2026-09-07

Reviewed current Hive bytes (SHA-256): `model.ts` `5a0e9491`, `jobs.ts`
`c283111f`, `matching.ts` `47d92568`, `world.js` `d96f036c`, `activity.ts`
`4601e02b`, `resources.ts` `961fb09b`, `view.js` `6f9fe5bf`,
`construction.js` `1d7145d6`, `movement.js` `0fdba8ae`, and `ARCHITECTURE.md`
`bae310d2`.

## Recommendation

Astra read the callers and primary library docs and concurs with measuring the
domain workload before selecting an ECS. Two source-review qualifications:
**pass-local claim/stock totals are snapshots**; earlier accepted assignments
change them within the same commit pass. Reserve/commit must revalidate against
the actual resource owner (or update an index through that same mutation), never
authorize a second reservation from stale totals. Also, bitECS explicitly allows
both array-of-objects and separate component arrays; it does **not** require
flattening every discriminated record. Stable domain ID versus numeric runtime
entity ID and component-membership updates are the concrete adoption seams.
Neither candidate has been installed or benchmarked for Hive by this review.

Do not add an ECS package or one-shot a custom ECS for the current controls/home
work. There is no measured entity-query bottleneck. Keep the fixed-step world
authority and add small derived indexes only where the representative benchmark
shows a cost. An ECS trial becomes justified if component-presence iteration or
high-churn entity membership is then material; Miniplex is the lower-migration
candidate for this object-rich model, while bitECS is a larger data-layout and ID
migration.

## Findings

1. **The evident scaling work is path/topology/relationship work, not component
   membership.** `assignWork` is already gated by `workDirty`
   (`src/jobs.ts:182-193`), but a dirty pass considers ordered jobs against idle
   actors (`:209-269`). Each build option scans piles and can run a person-to-pile
   BFS plus four approach BFS searches from pile to site (`:43-83` and
   `src/movement.js:4-32`). Rest options recompute shelter and routes
   (`src/jobs.ts:115-128`); `shelteredBeds` itself floods the clearing, rebuilds
   blockers, scans sites, and routes entrances to beds (`src/construction.js:65-133`).
   These costs are structurally repeated, but current 5/50/100 timing is
   **unmeasured**. The preserved five-person/100-task libcolony run proves the
   selected native caller works; it is not a scheduler/path timing result
   (`ARCHITECTURE.md:737-750`).

2. **The smallest useful structures are domain projections.** At the start of a
   dirty `assignWork` pass, derive one short-lived index containing
   `tree/site/pile/job by id`, per-pile claimed totals, per-site reserved/carried
   totals, and the current blocked-cell set. Pass it through `jobOption`,
   `buildOption`, resource availability, and assignment commit. This removes the
   repeated `.find` and claim/actor scans at `src/jobs.ts:49,100,144-165,272-282`,
   `src/resources.ts:11-28`, and `src/activity.ts:111-139` without creating a
   second durable owner. Add a topology revision and cache `blockedCells`,
   `indoors`, and `shelteredBeds` only if the benchmark identifies those floods
   and paths; later chunk residency needs a chunk/cell spatial index regardless
   of ECS. Preserve `jobs` as the ordered priority store, as the current model
   requires (`src/model.ts:89-105`; `ARCHITECTURE.md:281-291`). The Pixi caller
   already owns render maps by ID (`src/view.js:168-195`) and its remaining scans
   are not demonstrated hot work.

3. **An ECS library removes only entity/component membership bookkeeping.**
   bitECS 0.4.0 currently uses numeric entity IDs, plain component stores,
   `addComponent(world, eid, component)`, and direct `query(world, terms)`; the
   old `defineComponent`/`defineQuery` API was removed in the 0.4 rewrite.
   Miniplex core 2.0.0 keeps normal object entities and indexed reusable
   `world.with(...)`/`without(...)` queries. Its value-based `where(...)` is not
   reactive: callers must `reindex(entity)`, which its docs describe as
   potentially expensive, and component presence must change through
   `addComponent`/`removeComponent`. Either library can maintain subsets such as
   active actors or notify a renderer when membership changes. Neither owns wood
   conservation and claims, ordered job priority, party/actor authorization,
   pathfinding or topology, libcolony edge generation/matching, stable product
   IDs, chunk residency, persistence, or Durable Object command authority. A
   bitECS adoption would additionally need a stable-string-ID-to-recycled-EID
   boundary and an explicit choice about which current records remain objects versus
   separate component stores. A home-grown generic ECS would recreate the same membership machinery
   without removing any of those domain responsibilities.

4. **Use a mutation-inclusive benchmark as the adoption gate.** Build deterministic
   5, 50, and 100 actor fixtures with proportional ready chop/build/rest jobs,
   scarce shared piles, blocked and reachable targets, and the real
   `Module.optimize`. Time separately: (a) a dirty `assignWork` pass including
   candidate paths, the dense eligible matrix, native matching, stable commits,
   and claims; (b) ordinary `advanceWork` ticks; and (c) churn that adds/removes
   jobs, sites, and piles, transitions actors idle/walk/work, performs
   claim→pickup→cargo→delivery, cancels before and after pickup, and changes wall
   topology. Include the view projection separately so render costs do not get
   attributed to simulation. Compare current state, the small derived-index
   version, and only then thin Miniplex/bitECS adapters. Measure p50/p95 wall time
   against a predeclared slice of the 50 ms fixed-step budget, plus allocations;
   include adapter, reindex, add/remove-component, and stable-ID mapping costs.
   Require identical final state, assignments, material totals, and replay at
   equal ticks. A query-only loop would not answer the adoption question.

## Current primary sources

- [bitECS 0.4 API](https://bitecs.dev/api) and [0.4.0 release notes](https://github.com/NateTheGreatt/bitECS/blob/main/docs/RELEASE_NOTES_0.4.0.md)
- [bitECS package manifest (current source: 0.4.0)](https://github.com/NateTheGreatt/bitECS/blob/main/package.json)
- [Miniplex core README](https://github.com/hmans/miniplex/blob/main/packages/core/README.md) and [core package manifest (current source: 2.0.0)](https://github.com/hmans/miniplex/blob/main/packages/core/package.json)
