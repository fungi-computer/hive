# Work and brewing: current source readiness

Read-only, 2026-09-08. Read current `resources.ts`, `herbs.ts`, `jobs.ts`, `activity.ts`, `model.ts`, persistence and immediate cancellation/construction callers. Planning inputs: [accepted unified-work recut](../../docs/decisions/unified-work-algebra-recut.md), [older brewing readiness](brewing-first-workstation-ready-contract.md), and current simulation/content contracts. No runtime, tests, proof, or release claim.

## Decision and smallest first checkpoint

**Finish all wood construction and herb shelving migration before brewing.** Start with the accepted recut's smallest real consumer: one generic lot/container/transfer owner, fully used by existing Store, pickup, carry, interruption, shelf ejection and save/restore. This is a source checkpoint, not completed unification. Implement quantity splitting and incoming capacity in this owner from the outset so the subsequent wood port uses the same transitions. Do not create a herb-specific implementation behind a generic name.

Then port construction supply, partial wood pickup, delivery, cancellation, embedding and salvage. Complete the joined caller/deletion gate before brewing. Serial commits are acceptable; a permanent wood adapter is not. Do not implement every proposed plan constructor first: current Build needs `supply → perform(construct)` and Store needs exact-lot `transfer`. Stable step keys and checked operation handlers suffice; process waiting joins when the recipe is settled.

**Dependency:** removing `herbBundles`, `cargo` or `Site.delivered` changes active view/HUD callers. Core design and isolated implementation can proceed under exact custody, but no coherent runtime landing can assume those callers are available. Delivery must arrange serial handoff to their existing writer. Never attach mirrored writable legacy fields to state to avoid that handoff.

## Existing differences that must become explicit policy

- **Quantity/identity:** wood reserves at most two units, subtracts from a pile, and merges dropped quantities by cell. Mugwort transfers one indivisible bundle with unchanged ID. Preserve stable herb identity; represent partial wood pickup as an atomic split. Avoid automatic lot merging until compatible traits/provenance and reservation remapping are defined; visual pile grouping may remain derived.
- **Obligation lifetime:** wood deletes its source claim after pickup and moves its delivery promise into `actor.cargo`; herb keeps `herbStorageClaims` throughout carry. Replace both with a transfer whose phase changes from reserved source portion to carried lot while retaining destination capacity. Clearing an activity is not cancellation of that obligation.
- **Completion:** wood delivery advances a Build demand; it does not finish the job. Herb delivery completes Store. Domain completion remains a checked step result, not a commodity branch in transport.
- **Capacity/access:** construction admits only its remaining recipe quantity; shelf currently holds one mugwort and reserves that space atomically. Full-shelf Store can be admitted and wait; reservation belongs to assignment. Pickup works on the ground lot's cell, delivery at a legal work position. Preserve both 8-tick transfer phases, real topology and payload-aware route queries.
- **Scheduling:** continuation cargo precedes new work and survives changed Work preferences; Draft/cancel drops it. Personal queues outrank shared work; new automatic transport requires Haul, assembly requires Build. Preserve one active actor per job and the existing joint libcolony matching/serial claim commit.

## Callable owner and data

Use one material record family: positive integer lots with one `ground | hand | container` location; containers with typed role/capacity; transfers with actor/job/stable step and `reserved | carrying` phase. Contents, carried appearance and incoming totals are queries. Finished construction has an embedded-material ledger, not simultaneously available stock.

```ts
availablePortion(materials, selector): PortionResult;
remainingDemand(materials, destination, required): DemandResult;
reserveTransfer(state, actor, jobStep, request, navigation): Result<TransferId>;
pickupTransfer(state, transfer, navigation): TransferResult;
deliverTransfer(state, transfer, navigation): TransferResult;
interruptTransfer(state, actor, cause, navigation): void;
settleConstruction(state, site, effectId): Result<void>;
releaseContainer(state, container, disposition, navigation): Result<void>;
```

Each mutation prevalidates source quantity, destination promise, identity, phase and required access before committing all touched facts synchronously. Repeated phase settlement cannot move/split twice. Interruption releases an unpicked promise or drops the actual carried lot, never both source refund and cargo. Preflight teardown/drop locations before removing the site: current `cancelJob` removes it before `refundWood` can throw. This is a transaction hazard, not a newly demonstrated reachable failure.

One exhaustive ready-operation interpreter feeds existing `jobs.ts`; activity routes/times work and invokes the owner. Pure clock queries move below activity/routine to break their import cycle. Definitions are bounded serializable data, validated by Zod plus semantic reference checks; no callbacks, second scheduler or runtime monad framework.

## Strict migration and conservation

Keep v1–v6 wire schemas and their rejection guarantees. Validate old references/phase/topology before normalization; then convert and validate the new representation. Any persisted intermediate representation needs an explicit schema version. Restore remains paused, commands omitted, original raw recovery retained, and load performs no write; IndexedDB revision/replacement semantics stay intact.

Map old claims to reserved transfers without subtracting stock. Cargo becomes a carried lot plus transfer. Herb IDs/locations map directly; supplied unfinished sites become buffer contents, finished sites become embedding. Preserve work, path/leg, assignment, job scope/priority and source/sink totals.

**New migration hazard:** old IDs are unique per collection, not globally. A valid pile and herb bundle can share a string. Reserve herb identities, deterministically remap conflicting wood/synthetic IDs, rewrite every reference and update the allocator; a supposedly unique prefix alone is insufficient. Valid zero-amount unreferenced wood shells must normalize deliberately rather than become invalid positive lots.

Per-material conservation is explicit: wood live lots + embedded wood + consumed wood equals `6 × felled`; mugwort live quantities plus future explicit transformations/losses equals harvested production. Claims count in neither physical total. Ground drop/ejection may share a cell with other goods; placement exclusion is not a save-location invariant. Upper goods still require a supported surface. No recipe-cost salvage may leave embedded inputs available.

## Required deletion and caller closure

Delete runtime `piles`, actor `cargo`, `claims`, `herbBundles`, `herbStorageClaims`, authoritative `Site.delivered`; `reserveWood`, `transferWood`, `transferHerb`, `dropCarried`, `dropHerbStorage`, separate delivery candidates and claim branches. Replace direct harvest creation, construction cancellation/ejection/salvage, busy-job/exclusion scans, and duplicated material validators. Old wire names may remain in historical migration only. Plant growth/stage validation remains a plant responsibility.

`orders`, initial state, placement/removal, view, construction rendering, HUD projections/inspector and save fixtures must consume the new owner. Read-only selectors can preserve useful display shapes, not old mutable truth. Exit laws cover partial wood/whole herb, scarce source/full destination, carried interruption, both teardown paths, upper drops and exact paused restoration. One focused joined UI trace suffices; no long house-building marathon.

## Brewing readiness verdict

**Not yet implementation-ready as a recipe.** Accepted: kettle/vessel, mugwort as flavouring, finite inputs, attended preparation then unattended fixed-clock fermentation, one output in vessel custody, pause/save/resume. Current definitions contain only wood/mugwort and seven building types.

Grain, yeast, water source/quality, fuel, acquisition, amounts, work/fermentation times, station cost/capacity and serving economics remain explicitly unresolved in both current docs and the older readiness note. Delivery already has authority to choose a finite reviewable recipe; no new approval gate follows. A real acquisition path must precede consumption. Portable keg packaging must be an input/existing container; completion cannot invent it. Start with occupied-vessel output and block station removal while inputs/batch/output remain until teardown is supported. Mixed shelf capacity is a separate explicit policy change, not something transport unification silently grants.
