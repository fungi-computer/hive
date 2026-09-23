# First workstation: brewing readiness contract

Read-only writer contract at source baseline `71ed9e7`. This is the smallest
honest post-upstairs outcome and does not gate upstairs or change current
runtime/docs/issues.

## Product decision boundary

Levi's accepted direction is one workstation composed of a kettle and
fermentation vessel, producing one honest herbal ale. Mugwort is flavouring,
never fermentable grain. The remaining recipe inputs are explicit product
choices before implementation: which grain, yeast, water source/quality, and
fuel; their quantities, work duration, fixed fermentation duration, storage
capacity, and serving rule remain unresolved proposals. No free stock, fluid or
weather engine, backend, or generic inventory framework is implied.

## Smallest simulation seam

Add one typed workstation site with a finite kettle/vessel capacity of one
batch, and one typed batch record with stable ID, recipe ID, ingredient lots,
finite quantities, owner/location, stage, work, fermentation-start tick and
completion tick. Keep ingredients as physical lots (or the existing narrow shelf
consumer where appropriate), not a backpack grid. A mixed shelf presents a
grouped item/count list; bulk/filter/priority/weight remain future policies and
pawn carry weight stays separate.

Stages are explicit and visible: waiting for ingredients → ingredient transfer
→ kettle work → fermenting on the fixed authoritative clock → kegged/ready →
served. Fermentation advances while actors do other work, but never while the
world is paused or offline. Completion creates exactly one physical keg/output
with provenance from the batch; it can be stored on the mixed shelf and served
by an ordinary typed command. No output is minted twice and no ingredient is
consumed before its atomic transfer is admitted.

## Command, job, activity, and custody trace

The player command must enter the existing `admitCommands`/fixed-step path. A
shared brew job is offered through the existing `assignWork` → libcolony
optimizer → claim-before-movement path, with ordinary reachable work positions
at the kettle and vessel. Activities should be closed variants for ingredient
pickup/transfer, kettle work, and kegging; fermentation itself is a simulation
boundary, not an invisible actor task. Work completion atomically settles input
lots, batch stage, station occupancy, and job completion. Draft/Go, cancellation,
route interruption, station removal, full shelf, missing input, and power/fuel
loss preserve unconsumed material and expose a waiting reason; carried material
drops through the existing custody law.

The resource owner must account every input lot, reservation, carried amount,
consumed amount, residue/waste if selected, and the single output. A full or
unreachable destination waits rather than deleting a keg. Deconstructing the
station interrupts/reconciles its batch according to the chosen safe boundary;
it cannot silently erase fermentation or ingredients.

## Save and proof contract

Bump the strict save schema only with a documented migration (old v1–v6 loads
remain unchanged; new schema writes brewing facts). Validate recipe/input IDs,
lot quantities, station/batch uniqueness, stage/tick ordering, claimed/carrying
custody, capacity, output uniqueness, and `nextId`/material conservation.
Restore is paused; no offline fermentation. Save/load must preserve a fermenting
batch and produce the same next stage/output at the same fixed tick. Invalid raw
saves remain recoverable until an explicit committed replacement.

Focused proof: admit one brew command; observe a real worker claim, route and
transfer inputs; assert visible kettle work; pause/save/reload mid-fermentation;
resume to one keg; store it on a mixed shelf; serve it once; interrupt/cancel a
second attempt and verify every lot/output remains conserved. Unit coverage must
exercise full shelf, missing input, station deconstruction, stale/canceled
claim, paused admission, equal-tick completion, and duplicate-output rejection.

## UI and art caller contract

HUD derives workstation/batch/stage/ingredient/output facts from the simulation
projection and emits typed commands; it does not maintain a parallel process
state. Inspector text must say the current stage and first waiting cause. Art
supplies one kettle, vessel, ingredient/work/fermenting cues, and a physical keg
sprite at existing scale; simulation supplies stage, direction, progress and
visibility. No new presentation framework or generic item UI is required.

## Explicit exclusions

No agriculture expansion, grain farming, yeast research tree, fluid simulation,
weather/heat dependency, animal products, multiplayer/backend, universal recipe
DSL, generic inventory, or additional workstation types belong in this outcome.
The unresolved input/source/quantity/timing decisions must be recorded before a
writer starts; brewing remains the next playable slice after the active upstairs
outcome, never an upstairs prerequisite.
