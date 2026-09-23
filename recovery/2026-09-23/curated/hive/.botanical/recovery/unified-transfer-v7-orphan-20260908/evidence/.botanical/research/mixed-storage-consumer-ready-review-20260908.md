# Mixed storage after the coupled v7 migration

Read-only readiness, 2026-09-08. Inspected `materials.ts` SHA256 `33b194e3459fee06e4ac88b5a56d787379abbe4e75668a1656f2d14f787f3fb4`, `model.ts`, [first checkpoint](unified-transfer-first-checkpoint-20260908.md), [storage references](rimworld-storage.md), and [brewing readiness](brewing-first-workstation-ready-contract.md). The inspected model still contains legacy runtime fields beside the accepted new types: this is not a claim that coupled v7 has shipped. **These are post-v7 changes; do not interrupt its writer or expand its gate.**

## Concrete missing capability

The accepted owner already provides unique lot custody, source reservations, partial pickup, whole-lot identity, incoming destination reservations, interruption and container release. It is intentionally narrow:

- `ContainerSpec.material` is singular; `shelfContainer`/`validateContainer` require exactly one mugwort.
- `availableQuantity`, `availablePortions`, `reserveTransfer` and `pickupTransfer` accept ground sources only. Putting wood on a shelf without withdrawal would make it unavailable to construction; brewing ingredients would become trapped similarly.
- `ownerMatchesRequest` couples step names to wood/ground versus exact-one shelf requests. Mugwort indivisibility is hardcoded in reserve/pickup.
- `releaseContainer` discovers incoming transfers only. It cannot yet reconcile reservations extracting contents from a container.

Simply increasing capacity or adding `vessel` to the role union is insufficient.

## Proposed simple capacity policy

**Proposed defaults, not settled:** one shelf has **6 space units**; one wood unit costs **2**, one tied mugwort bundle costs **1**. Thus three wood, six herb bundles, or two wood plus two bundles fit. Keep current hand limits: up to two wood units or one whole herb bundle per trip. Use checked integer arithmetic.

Show grouped rows (`Wood ×2`, `Mugwort ×2`) and `Space 6/6`, with incoming space identified separately. Grouping does not merge lots or their identity. This is abstract bulk, not kilograms, stack count or backpack geometry. Weight can later constrain carrying; liquids need a containing vessel and volume units. Six shelf spaces do not mean six litres, and a shelf cannot contain loose beer. Ludeon's primary storage announcement supports useful compact storage, not these Hive numbers; detailed RimWorld filters/linking remain secondary evidence.

## API change without another owner

Replace the singular material/capacity tuple with checked content policy:

```ts
type CapacityPolicy =
  | { kind: "bulk"; limit: PositiveInt }
  | { kind: "recipe"; required: readonly MaterialAmount[] };
type ContainerSpec = {
  id: ContainerId;
  role: "construction-buffer" | "shelf" | "vessel";
  accepts: readonly Material[];
  capacity: CapacityPolicy;
  withdrawal: "available" | "operation-owned";
};
```

Item definitions own bulk contribution, carry amount and whole-unit divisibility. Reserve/deliver fold actual contents plus incoming promises through one capacity evaluator. Keep construction's remaining per-material recipe demand separate from shelf bulk; `embedConstruction` must consume required materials, not assume capacity equals recipe quantity. Do not add shelf-versus-beer transfer handlers.

Bind a job's stable step to its checked transfer request/demand in the actual work owner; replace `ownerMatchesRequest`'s commodity assumptions with that binding check. Source selection names allowed origins (`ground`, accessible storage, or an exact container/lot) and excludes the destination itself, embedded construction stock and operation-owned inputs. The request remains serializable; no callback predicate or second scheduler.

Add source-origin evidence to reserved transfers: ground position or container ID. Revalidate it at pickup through current geometry/access. Ground pickup occurs on its cell; shelf withdrawal uses a legal work position. Full pickup preserves mugwort ID; partial wood pickup splits once. Do not obtain ingredients by deconstructing shelves or temporarily dropping everything through a second haul path.

## Reservation, teardown and process boundaries

Reserve source portion and real destination capacity atomically or neither. Pending outbound stock still occupies its source until actual pickup; do not credit imagined future free space. A full-container swap can legitimately wait for an explicit staging space: report this instead of claiming guaranteed progress. No actor holds a source reservation while waiting to acquire destination capacity. Retain only a bounded current transfer, not reservations for every future recipe ingredient.

Container release must find incoming promises and **reserved outbound portions**. Before deleting the container, preflight all required drops, release/interrupt affected transfers, eject actual contents once and notify their owning jobs to retry. Already-carried outbound goods no longer belong to that source and continue toward their destination. Refuse removal if required safe placement cannot be established.

For brewing, a vessel's staged inputs/running batch/output reserve its real capacity; ordinary withdrawals cannot steal them. Preparation/output settlement remains a typed process effect in the existing material owner. Completed output is withdrawable only through its supported container/packaging model. Exact liquid units, mixture compatibility and packaging are recipe decisions still outstanding; no liquid engine is required for mixed shelves.

## First consumer, compatibility and short exit

After v7 closes, use **one mixed shelf receiving wood and two distinct mugwort bundles, then supplying wood to an ordinary wall**. This immediately proves container-source transport without waiting for brewing. Add generic Store quantity/target and container inspection; preserve existing herb Store as an ingress alias only. Remove single-bundle/single-order-per-shelf assumptions from admission, current validators and display. Competing jobs are bounded by physical portions/capacity, not a blanket shelf lock.

Version the changed capacity/source semantics explicitly; preserve v1–v7 strict historical reads, identity/collision mapping, incoming reservations, paused restore and no load-time write. Expanding a shelf policy must not recreate stored lots. Do not introduce writable contents arrays, a second claim collection or automatic lot merging.

Rendering reads actual container contents: show a bounded composition of log/bundle props and overflow count, with empty appearance only when truly empty. Existing filled-with-one-herb art cannot represent a mixed shelf truthfully; batch changed original pixels for Astra's review.

Focused laws: last-space competition; partial wood and intact herb withdrawal; no self-transfer; source teardown before pickup versus after pickup; full destination without leaked claims; unsupported drops rejected; exact saved reservations/cargo; unchanged per-material totals. One short UI trace stores mixed goods, builds using stored wood, pauses/reloads a transfer and inspects accurate contents. No full-home marathon or backpack system.
