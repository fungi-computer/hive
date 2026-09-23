# Unified transfer first checkpoint — 2026-09-08

Read-only Terra checkpoint at repository ref `24709e28cf313bf9a77f7b59d561c14cf30d1b86`. This reads the current work/brew and playability reviews, the accepted unified-work recut, `AGENTS.md`, current sprint status, and the immediate `model`, `resources`, `orders`, `jobs`, `activity`, construction, routine, world, persistence, HUD and view callers. It is not an implementation, test, browser, build, or release result.

## Decision: one material owner, one final wire cut before any brew

The smallest **landable** migration is a single coupled schema-v7 cut which moves both current consumers at once:

- construction wood: loose ground lot → reserved/carrying transfer → unfinished-site buffer → embedded finished-site ledger;
- harvested mugwort: ground lot → the same reserved/carrying transfer → finished-shelf container.

Do not ship a durable herb-only v7 followed by a wood-only v8. That would retain two persistence models, postpone the already-known collection-ID hazard, and make the later construction port another save migration. A writer may develop/review the material owner first, but the enabled runtime and saved schema land only when both old branches are removed. Brewing is gated on that deletion; it gets a future vessel destination through this owner and must not add a third haul/activity/claim family. No recipe, free stock, created keg, or Astra-owned ignored brewhouse art is part of this cut.

`src/materials.ts` is the narrow new authority. It owns positive integer `ItemLot`s, active `Transfer`s, construction embedding and the wood sink. A lot has exactly one location: `ground` cell, `hand` actor, or derived `container` reference. Containers are not a second mutable inventory: `construction-buffer:<site>` exists only for an unfinished site and has remaining recipe capacity; `shelf:<site>` exists only for a finished shelf and has its existing capacity of one mugwort. Contents, incoming reservations, carried appearance, site delivered progress and shelf occupancy are read-only queries of this owner.

Use closed typed requests, not a general job framework:

```ts
type Material = "wood" | "mugwort";
type SourcePolicy =
  | { kind: "eligible-ground"; material: Material }
  | { kind: "exact-lot"; lot: LotId };
type Transfer = {
  id: TransferId;
  actor: ActorId;
  job: JobId;
  step: "construction-materials" | "shelf-store";
  request: { source: SourcePolicy; quantity: PositiveInt; destination: ContainerId };
  phase:
    | { kind: "reserved"; sourceLot: LotId; quantity: PositiveInt }
    | { kind: "carrying"; lot: LotId };
};
```

Build supplies its buffer under `eligible-ground/wood`, then keeps its existing construct work. Shelf Store supplies an `exact-lot` mugwort request and completes when delivery settles. Thus source alternatives remain explicit rather than becoming a material-name conditional: the scheduler may choose a reachable loose-wood portion for a build, while a player Store order names one exact mugwort lot. A later brew uses `supply` into its real vessel/container; it has no `haulBeer`, cargo, or direct stock write.

## Current caller trace and deletion gate

Current wood is `resources.ts` (`piles`, `claims`, `cargo`, `Site.delivered`, `reserveWood`, `dropWood`, `dropCarried`, `refundWood`) → `jobs.ts` (`buildOption`, `deliveryOption`, `claimCandidate`) → `activity.ts` (`transferWood`) → construction work. Current herb is `orders.ts` Store admission → `jobs.ts` (`storeHerbOption`, `herbDeliveryOption`, shelf scans and claim branch) → `activity.ts` (`transferHerb`, `dropHerbStorage`) → `herbBundles`/`herbStorageClaims`. The scheduler currently gives cargo precedence, then herb carrying continuation, before its joint `libcolony` offer/serial commit; that precedence is retained as one carrying-transfer continuation pass.

The final v7 deletion inventory is:

| Delete as authoritative runtime state/branch | Replace with |
| --- | --- |
| `Clearing.piles`, `Actor.cargo`, `Clearing.claims`, `Site.delivered` | `materials.lots`, `materials.transfers`, buffer/embedding selectors |
| `Clearing.herbBundles`, `herbStorageClaims`, carried/stored bundle variants | mugwort lots and the same transfer/container selectors |
| `reserveWood`, `availableWood`, `neededWood`, `dropCarried`, commodity `refundWood` | checked reserve/pickup/deliver/interrupt/release-container operations |
| `transferWood`, `transferHerb`, `dropHerbStorage` and four pickup/delivery activity kinds | one typed transfer activity whose phase selects pickup or delivery |
| `buildOption` pile loop, `storeHerbOption`, `deliveryOption`, `herbDeliveryOption`, dual `claimCandidate` cases and separate busy/exclusion scans | one ready-transfer candidate query, one carrying continuation, one serial reservation commit after existing optimizer selection |
| harvest bundle construction and shelf deconstruction ejection | `createGroundLot` and `releaseContainer` |
| mutable caller reads in `world.js`, `construction.js`, `construction-view.js`, `view.js`, `hud.jsx`, and `ui-actions.ts` | material display/occupancy/delivered/carried queries; useful UI may retain “mugwort” wording without owning a bundle |
| v1–v6 current-field validators and fixtures as current schema | historical decode/migration only; v7 has one material/location/capacity/transfer validation family |

`StoreHerbCommand` may remain as a player-facing intent during this slice, but it must resolve to a generic exact-lot transfer job/step at admission. It cannot retain a `StoreHerbJob`, `pickup-herb`, `store-herb`, bundle claim, or storage-specific scheduler/activity branch. `BuildJob` remains the domain construct job, but its material readiness is the generic construction-materials request, not a wood haul subtype.

## Transition laws the owner must localize

1. **Reserve atomically.** Preflight source amount, source eligibility, destination capacity/incoming capacity, job/step ownership, empty-hand constraint, source route and payload return route. Create both promises or neither. Existing joint `optimizeEligible` selection, priorities, personal scope and deterministic sorted claim commit stay in `jobs.ts`; the material owner does not replace libcolony or add another scheduler.
2. **Pick up exactly once.** A whole mugwort transfer moves the same lot ID to `hand`. A partial wood reservation atomically subtracts the source lot and allocates one positive carried lot; repeat settlement is a no-op/error by transfer phase. No automatic merging of live lots is introduced.
3. **Continue cargo first.** A carrying transfer remains after the pickup activity clears and is offered before new automatic work, independent of later Work preference changes. The actor has at most one carrying transfer. Failed destination/path revalidation interrupts through the owner and drops the actual held lot at the legal supported current cell.
4. **Deliver exactly once.** Change the held lot to the destination container and release both promises in the same transition. Shelf delivery completes its exact transfer job; construction delivery only advances actual buffer contents, allowing the existing build work after demand is truly present.
5. **Interrupt/cancel/draft safely.** Before pickup, release source and incoming promises but retain the unmet job. After pickup, drop the hand lot once and retain unmet work. Direct order, Draft, cancel, topology failure and paused command admission all call the same operation; never recreate a source quantity in addition to a carried drop.
6. **Teardown/embedding.** Canceling an unfinished build preflights legal ejection cells, resolves/release affected transfers, then ejects actual buffer lots and only then removes the site/job. Completing construction consumes buffer lots into its one embedded ledger. Deconstruction preflights removal/sleeper/container effects, wakes/interupts affected sleepers while retaining their rest jobs/routines, releases/ejects shelf contents, removes the site, creates authored salvage, and increments `consumedWood` by embedded input less salvage in one completion. The current wall/roof/door/bed salvage values and deconstruction work remain definition-owned.
7. **Conservation.** Claims/reservations are not physical quantity. For wood: `ground + hand + container buffers/shelves + embedded + consumedWood = felled * 6`. For mugwort: live lot quantity equals `harvestedHerbs` until a later explicit recipe transformation/loss ledger exists. No free recipe inputs or salvage may coexist with the embedded quantity they came from.
8. **Paused admission.** `step` continues to admit commands before its paused return, while movement, work and feed remain frozen. Commands which cancel, draft, direct-interrupt, or remove a destination must synchronously release/drop material and set `workDirty`; no reservation/route work runs merely because paused admission changed intent.

## Schema v7 and deterministic legacy normalization

Keep strict v1–v6 envelope schemas and their present rejection rules. First parse and relationally validate the historical representation (including claims/cargo/activity/path/topology) before conversion. Then normalize to v7 and validate all v7 material laws. Do not run the v7 normalizer on malformed legacy facts as a repair mechanism.

V7 persists `materials: { lots, transfers, embedded, nextLotId, consumedWood }`, removes runtime legacy ownership fields, and derives site delivery/shelf occupancy/cargo display. `Site` retains structural work/finished state but not `delivered`. The v7 snapshot still omits `commands`; restore clones normalized state with `commands: []` and `paused: true`, makes no load-time write, and preserves raw-invalid-save recovery plus IndexedDB CAS/replacement behavior.

Legacy IDs are unique only inside their old collections. Normalize in this deterministic order:

1. Reserve each legacy herb-bundle ID as its migrated mugwort lot ID, in saved-array order, preserving identity and location.
2. Iterate nonzero legacy piles in saved-array order. Keep a pile ID only if it is unused in the new lot collection; otherwise allocate the first unused `lot-<n>` from `materials.nextLotId`, incrementing until free. Record mappings by the tagged key `(collection, oldId)`, never a bare old string.
3. Iterate cargo actors in lexical actor-ID order. Allocate a collision-safe new wood hand lot for each cargo, and a carrying transfer to its build buffer. Convert wood claims to reserved transfers using the pile mapping; convert herb claims to transfers using the preserved bundle mapping. Rewrite every activity/continuation reference to the transfer ID/phase.
4. Convert unfinished `site.delivered` to wood buffer lot(s); convert a finished site's required delivered wood to its embedded ledger. A v6 finished site must already meet its recipe under historical validation.
5. Legacy `amount: 0` piles are valid only when unreferenced under the old validator. Drop those shells deliberately before lot creation; a referenced zero pile is rejected, not converted to a zero or positive lot. Set `nextLotId` above all allocated `lot-<n>` IDs.

This handles a pile and herb bundle that both used `wood-7` without silently aliasing their lots, and makes repeated migration of identical input produce identical IDs. Historical field names may survive only inside v1–v6 decoder/migration fixtures, never as writable v7 state.

## First small writer packet, then the coupled landing

1. **First reviewable packet:** new `src/materials.ts` plus focused material-law tests and model type definitions only. Implement pure queries and atomic reserve/pickup/deliver/interrupt/container-release plans over explicit records, including split wood and exact mugwort. It is reviewed as the first shape; it does not add a second scheduler, UI store, framework, or a writable mirror of legacy state.
2. **Coupled landing packet:** wire that owner through `model.ts`, `clearing.ts`, `resources.ts`, `orders.ts`, `jobs.ts`, `activity.ts`, `construction.js`, `world.js`, `routine.ts`, `persistence.ts`, `view.js`, `construction-view.js`, `hud.jsx`, `ui-actions.ts`, `main.js`, and affected source tests. In the same landing, remove the inventory above and bump schema to v7. Delivery assigns one writer for this coupled seam and serializes HUD/view custody; no runtime half-port is released.
3. **Only after deletion proof:** select a finite recipe/station/vessel under a separate bounded packet. It may reuse `supply` and a typed prepare/ferment process; it cannot create a keg or any ingredient and cannot open a new transport branch.

## Focused acceptance checks (planned, not run)

| Area | Falsifiable check |
| --- | --- |
| Material laws | Two actors compete for scarce wood/source and single shelf capacity; only one transfer reserves. Partial wood splits once; whole mugwort preserves its lot ID. |
| Activity/routing | Both empty-to-source and loaded-to-destination routes are checked; carrying continuation outranks new work; Draft/cancel/blocked destination releases or drops exactly one real lot. |
| Construction/shelf | Unfinished cancel ejects buffer; finished construction embeds then salvages/sinks once; shelf teardown ejects contents; no active claim/cargo/dangling container after either. |
| Persistence | v1–v6 collision fixture, zero unreferenced wood shell, reserved/carrying transfers, buffer/embedded material, active path/work and paused restore all validate. Commands remain omitted and restore is paused/no-write. |
| UI/source | HUD, construction tint/progress, shelf fill, actor carry pose, occupancy/placement and inspector are derived selectors only; no old mutable field access remains outside historical migration. |
| Performance/Fallow | Preserve one `workDirty` pass, existing joint optimizer and serial reservation commit; measure candidate discovery, route calls, optimizer calls and material commits separately. Run installed Fallow once on the final touched source and classify any material ownership/import-cycle/complexity finding rather than suppressing it. |

One short post-pin browser trace is enough: chop one oak, observe a partial construction transfer then construction completion, harvest/store one mugwort on a shelf, pause/reload in one reserved or carrying state, and verify no console error at 390px. It is not evidence claimed by this checkpoint.

## Blocker and boundary

There is no technical source blocker. The real prerequisite is Delivery assigning one coupled writer and serializing the overlapping model/persistence/jobs/activity/HUD/view files; a herb-only durable save or a separate brewing haul is an acceptance blocker. Writable boundary after this checkpoint: the ignored file only; no source, art, runtime, build, Git, deploy, browser, or test action was taken here.
