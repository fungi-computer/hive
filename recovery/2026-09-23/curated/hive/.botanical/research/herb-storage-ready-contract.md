# One-bundle mugwort storage: writer-ready contract

Reviewed at source `3895bd13` (current `3895bd1`). This is one physical
mugwort bundle and one finished shelf, not an inventory, filter, or storage
framework.

## Decision

- Add `shelf` as a one-cell `BuildingKind`, with capacity one and the smallest
  ordinary recipe: 1 wood, 24 build ticks, 24 deconstruct ticks, 1 salvage wood.
  It uses the existing site/build/deconstruct path; `footprint()` needs no new
  exception because only beds occupy two cells.
- Replace the ground-only `HerbBundle & Cell` with exactly one `location`:
  `{ kind: "ground", ...Cell }`, `{ kind: "carried", actor }`, or
  `{ kind: "stored", site }`. Its amount remains the literal `1`; herb
  location is never actor cargo and never duplicated as a site item list.
- Add `StoreHerbJob { kind: "store-herb"; bundle; shelf; scope; ... }` and
  the only matching shared command `{ kind: "store-herb"; bundle; shelf }`.
  `main.request()` supplies `{ party: "home", actors: null }`; no direct or
  selected-worker variant is introduced.
- Add `HerbStorageClaim { job; bundle; shelf }` keyed by actor in a separate,
  domain-specific `herbStorageClaims` record. This is deliberately not a union
  with wood `claims`: wood claims reserve quantities and convert to `cargo`,
  whereas this claim reserves one identity and a capacity-one shelf while that
  identity changes location. An actor may hold neither a wood claim/cargo nor an
  herb-storage claim at the same time.
- The claim is made atomically in `claimCandidate`, before walking, only when
  the bundle is ground, the finished shelf is empty, and no job/claim already
  names that bundle or shelf. `pickup-herb` routes onto the ground bundle;
  completing its 8 ticks changes only `location` to `carried` and retains the claim.
  The existing delivery-first assignment path then offers `store-herb`, which
  approaches the shelf and, after 8 ticks, changes location to `stored`, clears
  the claim, and finishes the job. Both activities map to automatic `Haul`; a committed carry
  follows the existing wood-delivery rule rather than being silently discarded
  when the toggle changes.

## Admission, waiting, and interruption laws

- A store command rejects a missing/non-ground bundle, unfinished/missing shelf,
  or a duplicate live store job for its bundle or shelf. A full shelf or a route
  failure is an admitted shared job with `Waiting for shelf space` or `No route
  to this shelf`; it holds no claim. This preserves the requested wait behavior
  without speculative ownership.
- `interruptWork` and cancellation/Draft/direct-work interruption first move a
  carried bundle to `{ kind: "ground", ...actorCell }`, then release that
  actor's herb claim. An unpicked bundle remains where it was. Missing target or
  blocked route follows the same release law. No new bundle ID is minted.
- At shelf deconstruction completion, first interrupt every actor with a storage
  claim for that shelf, remove its store jobs, and release their claims; then
  move any stored bundle at the shelf to ground at the just-vacated shelf cell,
  and remove the shelf. This is safe in either fixed-step actor order: a store
  completed earlier is ejected; one not completed is interrupted. The existing
  deconstruct wood/sleeper handling remains otherwise unchanged.

## Necessary caller changes

| Owner | Minimal change |
| --- | --- |
| `src/model.ts` | Add shelf, store command/job/activity discriminants, location union, and `herbStorageClaims`; retain wood `cargo` unchanged. |
| `src/construction.js`, `src/world.js` | Add shelf recipe; make bundle occupancy apply only to `ground` locations. |
| `src/resources.ts`, `src/jobs.ts`, `src/activity.ts`, `src/orders.ts` | Own claim/release/drop helpers, atomic offer/claim, pickup/store transitions, cancellation, and deconstruction ejection. Extend every real discriminated switch. |
| `src/persistence.ts` | V5-only strict schemas for shelf, location union, herb claim, store command/job/activity/body modes; v1–v3 remain their exact old schemas, while v4 ground bundles normalize to V5 `location: ground`. Validate cross-references, sole location, one stored bundle per finished shelf, claim/task/job agreement, no wood/herb concurrent reservation, and unchanged harvested-bundle conservation. |
| `src/hud.jsx`, `src/main.js`, `src/view.js` | Facts expose location immutably. Make only ground bundles inspectable; an inspected bundle lists finished shelves and sends `store-herb` for the chosen shelf. The site panel states stored mugwort. Render ground bundles at their ground cell, carried bundles through actor activity/status only, and stored bundle art at its shelf; no new tool or selection machine. |
| `src/construction-view.js` | Its generic one-cell build path already covers shelf after the recipe/art key exists; do not add a second placement gesture. |

The current ground-only assumptions requiring replacement are model
`HerbBundle` ([model.ts](../../src/model.ts)), world occupancy
([world.js](../../src/world.js)), bundle rendering ([view.js](../../src/view.js)),
HUD fact copying ([hud.jsx](../../src/hud.jsx)), and `checkHerbs` plus v4
normalization ([persistence.ts](../../src/persistence.ts)). Existing work
assignment already provides the required authority: it claims before walking
([jobs.ts](../../src/jobs.ts)) and fixed-step activities own completion
([activity.ts](../../src/activity.ts)).

## Required tests and one browser proof

1. Build a one-cell shelf; save/reload it. A second stored bundle is rejected by
   capacity invariants, while a full or unreachable store order waits unchanged.
2. Admit paused shared `store-herb`; assert the applied-command receipt,
   `actors: null`, and no movement. Resume: claim → pickup (carried) → shelf
   storage, with exactly the original bundle ID and amount one.
3. Cancel, Draft, direct interruption, blocked route, and stale target at both
   pre-pickup and carried phases: no claim remains; a carried bundle is ground at
   the actor cell; harvested quantity still equals all bundle identities.
4. Deconstruct an occupied shelf and a shelf with an in-flight storage claim;
   assert one ground bundle, no shelf/store job/claim reference, and normal wood
   salvage/conservation.
5. V5 writes only V5; v1–v3 normalize without herbs, v4 ground bundles normalize
   to ground locations, and malformed location/claim/capacity/task/nextId saves
   reject atomically without overwriting raw data.
6. Browser trace: build/finish shelf, harvest one mugwort, inspect its ground
   bundle, choose the shelf while paused, verify queued shared order, resume to
   visible stored bundle and shelf count, then deconstruct and verify its ground
   ejection. It must also assert Escape/right-click/build/chop behavior is
   unchanged.

No weather, gases, breeding, grafting, retrieval, item filters, multi-slot
storage, or generic inventory follows from this seam.
