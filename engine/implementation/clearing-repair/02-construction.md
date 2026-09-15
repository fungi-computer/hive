# Shared contacts and floor replacement

## Current audit: reject conflicting plans at the native boundary

September 14 source finding, not a reproduced diagnosis of the screenshot:
`construction_work.rs::plan_construction` constructs `StaticGeometry` containing
only the proposed instance, then creates its site/container. It does not compare
the candidate against committed structures and pending intents there.
`games/colony-building.ts` deduplicates catalog/coordinate/orientation-derived
IDs; a rotated stair or another catalog has a different ID. Physical conflicts
therefore are not established by this identity check. `prepare_structures`
checks combined geometry, terrain and support later, at physical completion.
`construction_status` resolves support for supplied pending sites; support alone
is not occupancy compatibility or a shared placement admission decision.

This permits intent that later cannot be completed. The screenshot's overlapping
planned stair art is consistent with this gap but does not prove which sites are
present, completed or incorrectly sorted. Inspect actual site targets/phases and
art-part IDs before claiming the pictured cause fixed. Native stair traversal
also recently needed correction because its own derived solid cells blocked its
swept transition; verify this independently of drawing and placement admission.

### One reusable placement decision

The existing native construction/geometry owner must expose a read-only typed
decision and use the same rules again during `plan_construction`. Preview uses
this decision; command submission rechecks against the current world and all
accepted pending intents, including earlier accepted operations in the batch.
No client-only collision checker, per-catalog placement exception or second
authoritative occupancy map. Derived intent indexes live at that owner and rebuild
from saved sites; pending occupancy never becomes real support or blocks movement.

```text
placementDecision(definition, canonicalTarget, party, currentIntent):
  normalize target and derive geometry from the existing definition owner
  validate bounds, permission and supported target kind
  compare occupied volume/faces with committed geometry and pending intents
  resolve support against committed anchors and compatible declared prerequisites
  return Ready | Waiting(prerequisites/reason) | Rejected(reason, conflicts)

admitPlan(request):
  repeat placementDecision inside the existing atomic world transition
  reject before creating site/container/demand if Rejected
  otherwise save accepted intent and its dependency information
```

Geometry rules must distinguish bulk occupancy, boundary faces, support/finish
faces and required stair clearance. Use canonical footprint/run/rise/orientation,
not sprite alpha or image bounds. Reject overlapping stair bodies, conflicting
fixtures, duplicate boundary occupation and incompatible pending structures even
when catalog/rotation/IDs differ. A floor finish beneath furniture remains legal;
a floor on a wall's valid top support remains legal. Adjacent stairs or floors
meeting at a valid landing are not automatically conflicts. Decorative rail art
must agree with declared physical placement/clearance but does not create it.

Do not treat successful `StaticGeometry::projection()` construction as the whole
admission rule. Its `BTreeSet` support/face indexes intentionally merge some equal
faces: that is correct for a physical query and insufficient for deciding whether
two durable intents are compatible. Placement needs one explicit compatibility
decision over canonical instances before those instances become derived sets.

### Complete compatibility ledger

The native owner must derive these facts for each instance: exclusive bulk cells,
exclusive fixture cells, exclusive boundary faces, finish faces, support faces,
stair entrance/landing contacts, stair swept crossings and required work/actor
clearance. Each fact carries the owning instance ID and role while admission is
decided. The ordinary physical projection may discard that provenance afterward.
Do not add a second saved occupancy grid.

| Existing/planned fact | New fact | Required decision |
| --- | --- | --- |
| floor finish on a horizontal face | ordinary floor on the same face | conflict; only the explicit replacement operation may change a finish |
| cover on a horizontal face | cover or floor on the same face | conflict unless a future definition explicitly declares a distinct physical layer; no current content does |
| fixture footprint cell | fixture footprint or stair bulk/clearance in that cell | conflict |
| fixture footprint cell | floor finish beneath that cell | compatible |
| wall or aperture boundary | wall or aperture on the same canonical face and height interval | conflict, even with another catalog, orientation or site ID |
| wall boundary | floor whose edge terminates at or is supported by that wall | compatible |
| stair bulk/swept corridor | another stair bulk/swept corridor | conflict; rotated and opposite-facing variants cannot interpenetrate |
| stair landing support | floor at the declared landing face | compatible |
| stair intermediate ramp/clearance | floor or cover cutting through that interval | conflict |
| stair required crossing | closed wall/aperture interval crossing the route | conflict; a side wall that does not cross the route may be compatible |
| committed solid terrain | fixture/stair/bulk or required work volume inside it | conflict unless the same atomic request supplies a validated excavation prerequisite; the current command does not |
| actor temporarily occupying otherwise valid work volume | construction intent | compatible but completion waits and releases labor |

Exact geometric contact, not a pair of catalog names, decides each row. New
structure kinds must declare these same small roles and pass the ledger; they do
not receive a new placement branch. If a relationship is neither declared nor
provably disjoint, reject the plan as an unsupported geometry combination rather
than accepting a permanently stuck job.

Every accepted site must have one canonical instance and one physical-intent
identity. Render parts, junction sprites, ghosts and progress overlays never add
occupancy. Multiple art parts for one stair must not be mistaken for multiple
sites; multiple sites cannot be collapsed into one visual owner to hide a conflict.

### Impossible versus waiting

No worker, temporary access loss or unavailable material is not an invalid plan.
Do not run paths for every worker during placement. Accept a supported pending
floor/wall/stair dependency when a valid construction sequence exists; unfinished
support is not current physical support. Reject an unrooted support cycle,
out-of-bounds geometry and an occupancy conflict. A bare unsupported placement
with no compatible declared support chain is rejected with a useful reason;
this supersedes the blanket waiting-for-support permission below. Allow a batch
to establish its own rooted prerequisites, regardless of input order.

Structural impossibility is evaluated against the current world and submitted
plans, not every hypothetical future excavation. Ordinary unreachable jobs may
wait for access changes and must release labor. A worker standing in a valid build
footprint temporarily delays completion; it does not make placement illegal.

**September 15 product decision: cancel structurally invalidated plans.** When a
world change or prerequisite cancellation makes an existing construction plan
structurally impossible, cancel that plan and any dependent plans left without a
valid support chain. Re-evaluate alternative support before cancelling. Do not
retain these plans as red ghosts for now; that is a possible later UX. This
supersedes the previous instruction to keep them visibly blocked.

Use the existing native cancellation owner in the same durable transaction as
the invalidating change. Settle interrupted attempts exactly once, release worker
and supply/capacity reservations, and stop outstanding material demand. Carried
materials remain with their carrier; delivered unused supplies remain physical
lots, released through the existing material owner before staging storage is
removed. Never erase, duplicate, refund already-consumed material, or mark work
completed merely because its plan was cancelled. Independent plans survive.

Traverse indexed structural dependencies deterministically to a fixed point. If
the bounded validation budget cannot finish, defer the initiating change without
committing a partially invalid world. Do not use this cascade for a missing
worker, missing ingredients, temporary occupancy, failed route search or exhausted
search budget. Those remain waiting work, with labor released as appropriate.
The ordinary command result/world projection reports cancelled plan IDs/reasons;
no new notification framework or red-plan editor is required.

Evaluate prerequisite/overlap work within a bounded local query. Exhaustion is
Deferred, not permission or permanent rejection. Concurrent conflicting commands
serialize at the native/Region owner; only one incompatible intent is admitted.
Batch results report accepted/unchanged/rejected/deferred targets explicitly;
duplicate input is idempotent and cannot charge twice. Define compatible batch
dependencies before mutation; conflicting targets receive stable reasons, never
an accidental winner selected by input array order.

Admission is an atomic state transition, not a later worker check. Rejection
creates no ConstructionSite, container, material demand, claim, WorkAttempt,
projection or receipt that says accepted. Multi-target commands first normalize
and evaluate the whole set against committed state and one another, then publish
only the documented per-target result semantics. Reversing input order must not
change which geometry set is accepted. A stale preview is expected and harmless:
submission rechecks at the current revision and returns the conflicting owner and
typed reason.

Current-format restore must rebuild the pending-instance index from ordinary live
ConstructionSite records and validate the same compatibility ledger before the
world becomes available. Finished sites belong to committed geometry, never the
pending set. FloorReplacement staging sites are replacement intent and must not be
counted as a second ordinary floor. Cancelled/completed replacement records and
cancelled construction are likewise excluded. Crafted saves containing overlapping
pending sites, duplicate finish intents, missing definitions, unrooted dependency
cycles or a pending/committed conflict are rejected without starting the world.

### Required implementation proof

- Same stair twice, rotated intersecting stairs, two catalogs sharing occupied
  space, and crossing stairs at different levels with/without actual clearance.
- Every row of the compatibility ledger, including duplicate floor/cover faces,
  stair intermediate-floor rejection, legal floor-under-fixture, legal landing
  floor, wall beside a stair and a wall actually crossing the stair route.
- Finished and pending conflicts, including two players' concurrent requests.
- Floor under brewer/bed, floor on wall, adjacent stair landing, all orientations,
  multiple storeys; cancellation of planned support and a cycle without anchors.
- Preview and native admission agree at one revision; stale preview gets an
  explicit rejection and leaves no site, supply demand, claim or material debit.
- Building order permutations cannot create a final geometry that direct placement
  rejects. Interrupted access frees workers and later resumes exactly once.
- Render actual canonical sites with explicit planned/finished styling and one
  declared set of parts per site. Inspect actors between stair rails, upper floor
  contact and cutaways; distinguish draw-order bugs from invalid geometry.
- Save/recovery rebuilds intent indexes and prerequisites; no phantom reservations.
- Valid pending current-format save/reload retains the same decision; crafted
  conflicting pending state fails restore before any tick, projection or command.
- One canonical stair site projects one visual owner with its declared parts;
  the pictured pile-up cannot be produced by repeatedly rotating/placing stairs.

These checks apply to reusable geometry categories, not named timber-stair hacks.

### September 15 implementation checkpoint (partial)

The first native admission slice now builds the candidate together with committed
structures and all unfinished ordinary ConstructionSite instances before staging
a new site. It explicitly rejects a second Floor/Cover claimant on one horizontal
face because the physical projection intentionally deduplicates those faces. It
also excludes FloorReplacement staging from ordinary pending geometry and runs the
same combined validation during current-format restore. Focused source laws cover
rotated intersecting stairs, duplicate floors, floor under a fixture, a rooted
stair-landing floor, unrooted plans and rejection without a new site/container.

This is not completion of C4. Source review found these remaining gaps:

- stair required crossings/clearance are not yet a first-class compatibility
  fact, so a boundary face crossing the usable stair route and an intermediate
  floor require explicit laws and any necessary native fact correction;
- the client ghost and command now share a target-specific native batch decision;
  the advisory result carries the runtime construction-geometry epoch, while
  final `plan-constructions` admission rechecks the complete selection atomically;
- a crafted conflicting pending save is not yet an accepted restore test;
- no actual multiplayer race or rendered repeated-placement witness has passed.

Do not describe this checkpoint as universal placement validity until those rows
pass. In particular, `StaticGeometry::projection()` catching two stair bulk cells
does not by itself prove every wall/stair corridor relationship.

September 14: [Grid-edge buildings](06-edge-buildings-and-art-parts.md) supersedes
cell-centered wall/aperture placement below. Floor/fixture datums and the shared
contact/work ownership remain; new edge contacts must follow that packet.

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
