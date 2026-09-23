# First engine composition shape — current source, 2026-09-09

The useful first extension seam is a finite-work system composed with the existing
material, movement and organism owners, then assembled into the existing
RegionProgram. It is not an editor plugin and it is not yet implemented. Merely
registering the current `advanceWork(Clearing)` as a plugin would preserve its
Goblin coupling and duplicate lifecycle ownership.

## Actual owners and order

`src/clearing.ts:126-153` currently admits commands, returns if paused, increments
tick, advances needs, updates routine, queues automatic care, advances each
actor's work/drafted movement, advances brewing, advances herbs, assigns work,
advances the cat, then applies the demand feed. Assignment therefore becomes
available after this tick's activity; new work cannot run earlier merely because
systems are packaged differently. Need decay precedes policy/selection. Brewing
and growth precede final assignment. Preserve actor iteration order too.

- Region (`src/engine/region/index.ts`): detached candidate, SQL state/receipt/event
  commit and command identity. No material or actor state copy.
- Materials (`src/engine/materials/index.ts`): lots, containers, claims, custody,
  capacities, bindings and irreversible material receipts. Already independent.
- Movement (`src/movement.js`, world access queries): actor route/leg/location.
  Actor anatomy/access rules remain typed inputs, not optional fields on a common
  entity. Capability membership, current eligibility and spatial access differ.
- Work policy/assignment (`src/jobs.ts:1218-1270`): candidate eligibility, personal
  order policy, joint offers and actual libcolony selection. `workDirty` is derived
  invalidation, not durable intent. Keep one optimizer; no per-plugin assignment.
- Execution (currently `activity.ts:94-155,435-630` and
  `jobs.ts:1375-1475`): operation admission, attachment, phase/progress and cleanup.
  These facts are split between operation, actor work, job and material calls.
- Organisms (`needs.ts:138-176,178-245,247-272`): need decay/contact and checked
  need effect settlement. Definitions at31-86 describe quantity/attendance/effect.
- Goblin content: station/plant eligibility and effect meanings
  (`water-delivery.ts:39-145`), routines, brew recipes, herbs, cat and demand feed.
  These are not universal inventory behavior.

## Concrete compositional entry

Proposed supported entry (names illustrative; signatures must be implemented):

```ts
createHabitatProgram({
  identity: { program: 'goblin-v2', content: 'goblin-content-v1' },
  materials: materialSystem(materialDefinitions),
  execution: finiteWorkSystem(workDefinitions),
  bodies: bodyNavigationSystem(bodyDefinitions, traversalDefinition),
  organisms: organismSystem(needDefinitions),
  content: goblinRules,
  optimizer, // structural capability; actual libcolony
}); // RegionProgram<checked composed state, checked command union>
```

This entry compiles a fixed integration, not a list of arbitrary tick callbacks.
System constructors own checked definitions, versioned state schema and outcome
operations. The assembler checks required capabilities/effect IDs and builds the
current deterministic tick order once. It rejects missing/conflicting ownership
or unknown definition references before initial state. A system cannot request a
second clock, write another system's arrays, or smuggle executable callbacks into
saved plans. No `ctx: Clearing`, mutable all-system map, priority scheduler, hook
bus or universal entity is supplied to modules.

Use explicit structural capability boundaries: execution asks movement to approach
an endpoint, materials to acquire/draw/settle/release, and an effect boundary to
preflight then synchronously commit a supported effect. The assembler closes
those capabilities over the candidate's existing canonical slices. There is one
saved owner per slice, not a private module state plus a serialized shadow.
System snapshots/restore validate their own facts; the assembler validates cross
references and program/content versions. Current `{clearing: SerializedClearing}`
remains canonical during the first migration; packaging alone does not authorize
a new save schema. Browser Continue policy stays outside this compiler, and the
existing region command receipt remains the host command result authority.

Typed fixed tick phases: intent admission (no time), active tick increment,
organism decay → routine/care intent → body work/movement → autonomous process/
growth → joint assignment → game ambient/demand. First cut preserves this exact
order in clearing.step; extracting the finite executor does not move the whole
clock into a new framework. The later assembler replaces that hardcoded call
site only once its modules accept owned slices/capabilities instead of Clearing.

## First deletion-focused migration

Start kettle filling plus ration eating, then migrate watering/drinking before
claiming the four-consumer outcome. Water already has ONE acquire/draw/pour
machine shared by kettle, plant and hydration. The duplicate is food versus water
admission/attachment/cleanup, not three independent water solvers.

1. Introduce `finiteWork.admit/advance/interrupt/cancel/attach` with checked closed
   work definitions: acquire ordinary use, optional draw vessel contents, optional
   attendance, deposit or sink, release. It owns step/progress/attachment; material
   custody remains material-owned. No arbitrary saved control-flow language.
2. Replace `jobs.ts:1375-1475` operation push/acquire/compensate branches with one
   admission operation returning attachment/projection. Keep candidate selection
   and libcolony at1218 onward. Delete superseded rollback choreography.
3. Replace `activity.ts:510-630` water/food phase and completion lifecycle with one
   executor advancement. Remove the separate consume pickup handling around705-
   741 as its acquisition moves. Preserve movement through its current owner;
   `accessWork` must return an access outcome rather than recursively cancel work.
4. Replace matching `activity.ts:94-155` and `orders.ts` cancellation choreography
   with executor outcome operations. Material cancel/drop remains atomic below.
5. Move current executor phase validation from `clearing-state.ts` to executor
   relations as consumers migrate; retain historical validation before migration
   and Goblin job/actor/effect joins. Do not simply add another validator.

Real differences stay typed: vessel vs consumed portion; deposit vs sink;
park/reassign for water vs cancel/restart attendance for food; actor beneficiary
vs plant/station target; water may progress through reached acquire/draw within a
single tick while food yields after pickup. Quantities, supported material/vessel
requirements, attendance, yield policy and effect IDs become definitions. Effect
preflight and material sink plus need/plant commit must remain one synchronous
joined transition, not a later event consumer.

## Independent second consumer and first law

Use a finite ore wash station: one body, five ore units, two-unit destination bin,
finite water vessel, configured wash attendance, and a station completion fact.
It imports the same material and finite-work implementations; it contains no
Goblin herbs, care jobs, kettle strings, art or Clearing imports. Existing five-unit
ore depot remains the material conservation reference; the new station is a
proposed work consumer, not already proven source. The independent consumer
cannot substitute for actual Goblin migration.

First law: interrupted after drawing water preserves the exact vessel/content
claim and resumes at the destination; interrupted ration attendance legally drops
its held portion and resets attendance on a new admission. Save/reload preserves
an uninterrupted attempt exactly; completion sinks/deposits once; stale endpoint
rejects before consumption; paused advance performs neither movement nor work.
Run both definitions through the same admission/advance/cancel implementation,
then prove Goblin kettle/eat callers no longer own those phases. This tests reuse
of behavior rather than resemblance of plugin declarations.

No source, runtime, build or proof changes in this read-only task. Existing
Goblin region/Watchdog checkpoints remain frozen. Soil/environment ownership and
canonical architecture decisions remain Root's.
