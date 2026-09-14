# Shared contacts and floor replacement

[Packet index](README.md) · [Work attempts](01-work.md)

## Preserve the existing geometry meaning

`engine/src/sdk/placement.ts::structureOriginCell` maps a selected support cell:
floor/cover/stair keep y; wall/aperture/fixture use y+1. Physical floor at y is the
upward face at `(y+.5)*verticalMetres`. Fixture base y is at `(y-.5)*verticalMetres`.
Colony spacing is x/z=1m, y=.54m. Thus clicking support y13 for both correctly
places a floor at y13 and brewer at native y14. Do not change this convention.
`structure_geometry.rs::StaticInstance::Floor` is already a zero-bulk support
face. Fixture occupancy and surface finish are distinct. Simple floor-under-brewer
completion passed (`u7158`); the whole reported lock is not yet reproduced.

Current native staging binds Position once in `construction_work.rs`; delivery
routes to that exact Position. `world.rs::contact` permits transfers within 1.5m.
Fix candidate/admission disagreement without moving the staging container.

## Contact query contract

Add one native `transferContacts({worker, container})` query using the same
contact-pose resolution as transfer admission. Return an exhaustive result:

```ts
type TransferContacts =
  | { kind: 'ready'; targets: readonly MoveDestination[] }
  | { kind: 'blocked'; reason: 'sealed' | 'unavailable-frame' | 'no-contact' };
```

Wrong/missing IDs or malformed relationships are errors, not no-contact. Queries
are read-only and do not reserve capacity. Resolve portable containers via actual
holder custody. For terrain workers enumerate cell-center standing positions
within native reach of the container's immutable contact pose, using actual cell
spacing and worker clearance/traversal. Include the current valid position.
Use deterministic coordinate order. RouteToAny then selects the reachable target;
it must not launch one A* per target. Share the reach constant/predicate with final
transfer admission. Existing same-frame deck navigation uses the support surface
and its current frame; don't treat a deck as terrain. Mixed unsupported frame
transfer returns the explicit blocked result.

Bound requests at the existing per-step route/candidate owner. A worker/container
pair must not scan the map. Derive finite candidate bounds from reach and spacing;
reject unsupported configuration rather than silently truncate legal contacts.
Cache only by container pose/custody, worker traversal and affected topology facts.

Construction `constructionAccess` remains the native source of work contacts and
support/material readiness. The shared work owner passes targets to routeToAny.
Delivery uses transferContacts; it does not need to know whether the container is
a construction stage, pantry or station port. Process attendance uses its native
station-contact rule. Factor shared geometric enumeration/reach where identical,
without pretending distinct operation requirements are the same.

On loss of contact: finish/reject the exact active move, report blocked attempt,
retain task, release labor after custody reconciliation. Alternative contact is
selected on retry. Do not mutate Position to follow the worker, and do not move
existing contents just to create a new approachable stage.

## Replace a finish without demolishing support

Add a native replacement order using the existing ConstructionSite/material owner,
not a tear-down-then-build sequence. Proposed SDK action:

```ts
replaceFloor({ orderId, existingFloorId, desiredCatalog })
```

The requested catalog must be a floor definition; target is the existing floor's
support face. Same finish is an unchanged result with no cost/job. Different
finish creates a queued paid replacement tied to the original floor identity.
Keep the existing finished floor active during work. A second replacement of the
same face is rejected as conflicting intent until cancelled/settled. Finishes are
catalog data over this operation; prove another finish with a test definition,
not a second production art set invented solely for the test.

Preparation under `construction_work.rs` / existing structure owner:

```text
prepareFinishReplacement(order):
  require original floor identity/catalog still matches order's expected target
  require earned labor and exact material portions
  build replacement structure set: same floor id + same support face
  validate support, occupied contacts and field rebind against that set
  prepare material consumption and any declared salvage output together
  ensure all component/reference/capacity changes fit before publication
  return detached prepared replacement

commitPreparedReplacement(prepared):
  publish geometry/materials/floor catalog/order completion in one native advance
  publish scoped work result; Region commits snapshot/receipt before broadcast
```

The support face never disappears, so furniture does not temporarily lose support.
Keep floor physical identity; its catalog/finish changes on completion. The work
order/staging container has a different temporary identity. Use its own supplies;
never reopen a sealed finished construction container to fake staging. Salvage
is explicit recipe data routed through existing finite output ownership; if there
is nowhere to put it, block before consuming anything. No implicit duplicate refund.
Cancel before completion leaves the old finish and staged goods intact. Another
world edit removing the target invalidates the expected replacement and releases
its attempt/demand lawfully. Concurrent same-face replacements serialize at owner.

## UI and inspection

`colony-building.ts`, `sdk/placement.ts`, placement preview and the server command
consume one floor-operation resolver: empty supported face -> build; same finish
-> unchanged; different finished floor -> replace; queued conflicting operation
-> conflict; unsupported -> queued waiting-for-support where designation is legal.
Furniture above the face is not itself a rejection. Valid designation can wait for
worker access. Unsupported/out-of-bounds malformed geometry remains a clear result.
A rectangle reports each cell's outcome; do not silently discard failures or show
successful completion for merely accepted plans. Clicking terrain through furniture
while the floor tool is active is intentional target acquisition, not ordinary
entity selection. Preserve the existing XState drag plane and ghost owner.

Inspector displays queued/working/blocked reason from shared attempt/readiness;
no UI timer guesses, no inspection-only actor claim. Party ownership applies to
floor replacement permission and all supplied materials. Bare terrain stays shared
world geometry; another player's finished floor is not editable by default.

## Required source proofs

Actual brewer AND bed remain in place during floor creation/replacement. Their
entity/port IDs, contents and support stay valid. Obstruct a known staging contact
only after confirming assignment; prove obstruction actually committed, not just
queued. If another legal contact exists, delivery completes from it. If none
exists, exact assigned worker becomes free and a different job can use them.
Reopen access and original order completes once. Save/reload at staged, working
and completion frontier; no double cost/salvage. Compare material totals, not only
phase labels. Reference [J/C acceptance IDs](05-delivery.md).

## Concrete new records and source interfaces

`FloorReplacement` is a versioned native record attached to the replacement work
order/staging entity: `{targetFloor, expectedCatalog, desiredCatalog, supportCell,
phase: queued|working|completed|cancelled}`. Existing construction progress/material
staging owns labor/cost; do not add another progress counter. Owner-party belongs
to the order. Expected target uses physical identity+catalog, not the world's whole
revision. A later same-face mutation is revalidated at final preparation. Store
order intent, not the prepared geometry token. Prepared replacement exists only
inside one candidate step; after restart reconstruct it from canonical intent.

The prepared result must include validated future structure index/field binding,
material debits/outputs, floor catalog update, order terminal transition and shared
attempt result. Publish no earlier subset. Reuse existing native prepare/apply
structure pipeline, preserving station port entities/contact poses and checking
actor support. A finish-only change with identical support/occupied faces must
not invalidate a valid route or rebuild water unnecessarily; reuse unchanged
geometry projection when physical equality is proven by the owner.

Implement shared enumeration in `engine/kernel/src/interaction_contact.rs`:
`standing_contacts_within_reach` uses metric/traversal/frame arguments;
`within_transfer_reach` is the exact predicate used by both query and transfer.
Construction and process retain their operation-specific target predicates and
reuse enumeration only where the same geometric meaning holds. Add transferContacts
to KernelPort (`contracts.ts`), wasm-kernel.ts parser, lib.rs export and world.rs
native method; thread through Session context with declared reads. Query input
is precisely worker/container IDs, not a user-chosen reach radius or a guessed
container position. Other callers cannot increase native reach through JSON.
