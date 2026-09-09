# Gameplay air: reuse the qualified owner in a real room

King Bolete, 2026-09-09. Implementation decision under the active Hive v0 goal;
not accepted runtime, performance or a newly deployed gas demonstration.

## Player outcome and ownership

Burn a finite charge downstairs, observe smoke reaching upstairs through the
stair opening, then open a vent and change local exposure. The same actual
building layout must feed physics and the voxel view. A room-wide smoke timer,
unpaid source callback or decorative plume does not prove this outcome.

The engine owns the field, face transport, bounded advancement, input validation,
reconstruction and conservative fixed-volume opening changes. Goblin supplies
building/material permeability, fuel yields, source locations and actor response.
The existing material/process owner charges fuel. One region transaction commits
that charge, the field successor, time, consequences and command receipt. A
failed solve cannot consume fuel or publish part of the candidate. Field time is
advanced by the existing host clock; neither a renderer nor the field creates a
timer, job engine or independent durable scheduler.

## Generated-room implementation recut, September 9

The read-only caller study against `0db583d` found the actual generated terrain
supports every column of the existing room and its exterior collar. All56
columns in local `[3,11) × [3,10)` have surface voxel y14 under frame y15;
all30 occupied site columns are supported. This is not a flat-map assumption:
12 other clearing columns are lower. Bounded source queries `u4352` and `u4359`
passed; no rendered or new numerical acceptance follows from those checks.
The full ignored study is at `air-view/.botanical/research/generated-brewhouse-air-handoff-20260909.md`,
SHA256 `51b4841a2ae7a5684bddb340574d571ea84d8a92bd88fa35fa471cc86696156d`.

One generated-room producer must replace the authored foundation in the live
room consumer. It reads parsed canonical terrain and the one registered
completed-site geometry source through `terrainGeometry`/`structureEnvironment`.
Numeric local coordinates translate through the admitted frame; world bounds
are `[-4,15,122]..[4,24,129]`,504 cells with136 solids. Source is
`cell:-2,15,124`, readings `cell:0,17,125` and `cell:-1,21,125`, and the upper
shutter comprises `z:0,19..22,127`. Verify metric, support across the entire
collar, expected site facts, source/readings in fluid cells and explicit lateral/
top ambient boundaries. Reject unsupported geometry rather than inventing a
new foundation, moving terrain or erasing foliage.

Co-save terrain and air in the existing strict Region state with finite fuel.
Reconstruct the same geometry at restore; reject mismatched field identity or
unsupported in-domain volume/support changes atomically. A supported external
excavation preserves the room volume and keeps its real spoil in terrain state.
The upper shutter remains a zero-volume rebind. Both active field owners receive
the same admitted advance interval and must agree on time at parse/commit; a
failed successor leaves both fields and fuel unchanged. No renderer clock or
second saved elapsed-time field. Do not add arbitrary site-edit controls to
qualify rejection: use the real producer/admission and existing Region boundary.

The worker and voxel view consume that same producer's terrain/frame/sites.
Replace the decorative flat slab using existing generated terrain presentation,
translate global field cells back through the frame, and retain original art.
Three trees in the outside collar stay visible; subvoxel vegetation is currently
permeable scenery, not displaced air. Registered starting-house geometry may
remain immutable content in this independent consumer. Inserting it into full
Clearing later requires actual embedded construction material facts; this chunk
must not claim pawn-built or paid construction. General fluid-volume remapping,
water displacing air, chemical combustion and a hosted backend remain outside
this bounded join. Existing numerical vent evidence and its failed beneficial-
ventilation expectation stay explicit; do not retune the scenario to hide it.

## Chosen existing method

Reuse the retained 3D Boussinesq caller, shared projection/private geometry and
MC-limited scalar transport. These already have duct, scalar-transport,
conservation and exact-restart evidence. Extract one maintained implementation;
keep original ignored sources as reference evidence, without a compatibility
export forest or a second live implementation for each room.

The relevant retained root is
`.botanical/research/environment-round3-20260908/gas-heat/` in the original Hive
checkout. Sources are `finite-low-mach-refactor-v1/{boussinesq-reference,
projection,geometry-owner}.mjs` and `transport-v2/checkpoint/{geometry,transport,
physics}.mjs`. Reference runs `u2755`, `u2792` and `u3023` qualify their recorded
cases; they do not qualify the new room, interactive vent or its runtime cost.
The read-only source audit is retained at
`hive-worktrees/sealed-floor/.botanical/research/gas-gameplay-ready-contract.md`.

Boussinesq uses temperature variation to drive buoyancy while treating carrier
air as incompressible. Its small-variation assumption is explicit in the
[OpenFOAM solver source](https://github.com/OpenFOAM/OpenFOAM-2.2.x/blob/master/applications/solvers/heatTransfer/buoyantBoussinesqSimpleFoam/buoyantBoussinesqSimpleFoam.C#L24-L40).
The first gameplay model is warm room air and dilute smoke. Resolved flames,
oxygen depletion, compression, flooding, radiation, solid heat storage and total
chemical/internal/kinetic/potential energy conservation are outside this owner.
Smoke is an accounted tracer; sensible heat is a signed anomaly. The existing
ambient inflow is explicitly 293.15 K and smoke-free, not simulated weather.

## Initial numerical admission

Before new consumer qualification, freeze these implementation targets:

- One control volume per actual 1 m × 0.54 m × 1 m voxel; at most 1024 total cells
  including solids. No fine-grid production proof or language port.
- At every admitted scalar stage, absolute temperature deviation from 293.15 K
  is at most 5%, and smoke mass is at most 1% of reference carrier mass per cell.
  These are chosen scope limits, not measured physical error guarantees.
- At most six seconds per explicit advance, a maximum 0.2-second numerical step,
  and at most 512 combined accepted/rejected trials. Pressure iterations and
  geometry work have explicit finite limits too. A bound violation rejects the
  detached candidate; it cannot drop time, clamp stock or fabricate a source.
- Replace the research callback/event loop with validated interval source facts
  and representable request-local time summation. Split real source/vent changes
  at their actual clock boundary. Retain exact current-method save/reopen.
- Preserve the existing paired source/boundary ledgers and their explicit numeric
  drift checks. New scene exposure accuracy and production timing are separate
  criteria to freeze from the actual building layout before its comparison.

These bounds can be recut for a demonstrated caller conflict before changing the
qualification workload. They are not a claim of achieving the proposed 5 Hz
production cadence or a few milliseconds per update.

## Opening changes and coupled state

The first supported geometry edit opens or closes zero-volume faces while fluid
cells and their volumes remain identical. Preserve cell stocks, all accumulated
source/boundary totals and time by stable identity. Transfer retained face
velocities by identity, initialize new faces without invented flow, then admit
the shared continuity constraint. Closing a flowing opening can dissipate
resolved motion; report the kinetic change under the declared face metric.
Do not reset every velocity or secretly turn projection error into room heat.
Check compatibility and the pressure gauge in every resulting component.

The opening-only baseline did not support changes to fluid membership. The
dry-volume candidate below supplies a bounded whole-voxel remap; displacement
by water still needs a coupled volume law. Changing only the saved geometry
identity remains invalid.
The same world can have a vented water region and an air region without claiming
that this first air owner models sealed-water pressure or general phase exchange.

## Actual next joins

The shared air owner and generated-room producer are integrated through
`8257657`/`66c5b6f`. That independent consumer still owns separate room material,
opening and burn state. Current Goblin Clearing is schema20 and has no air field
or emissions record. Its main simulation and save cannot inherit the room's
acceptance merely by displaying that room.

Root's current source read identifies these remaining boundaries:

- `brewing.attendBrew` calls the existing material owner's
  `completeRecipePrepare` before entering fermentation. That transformation
  already records the one consumed wood portion under the recipe's fuel role.
  A shared finite-emissions mechanism must bind one budget to that paid input;
  another independent hearth debit or an unbacked Light command is not the join.
  Before preparation completes, cancellation creates no emissions obligation.
  Afterward, pause/retry/reload must retain it independently of worker animation.
  The six-second warm-room yield is game content, not wood's chemical energy.
  Current committed brewing cannot be canceled; its station process/binding
  already blocks removal. The 240-tick ferment interval outlasts the proposed
  120-tick source, so that case needs no second station claim. Retire an active
  source schedule only after its totals are recorded; retain checked paid-input
  provenance so reloading cannot emit the same transformation twice.
- The current room site array is authored content, not full Clearing `Site`
  records with construction work and embedded material. The proposed starting
  house must have explicit finite starting-stock provenance if used in a game
  scenario. Fabricated felling history or a pawn-built claim is not acceptable.
- The main `commitTicks` already evaluates a detached candidate. Future source,
  air, terrain, process and saved-state changes must publish there together.
  Use the canonical physical field time; the current terrain-to-game-tick law
  allows `1e-8` seconds of representation error. Do not replace it with exact
  floating-point equality to `tick * STEP_SECONDS`, or introduce another timer.
- The qualified opening-only baseline rejects changed fluid/solid membership.
  Root's dry-volume candidate below extends that owner for walls and dry digging.
  Its numerical qualification and real completion caller remain necessary;
  freezing the whole room footprint against player edits is not an accepted
  solution for the main game. The independent immutable-room consumer retains
  its narrower contract while Root resolves this boundary.

Sol's corrected ignored read-only trace is
`generated-room/.botanical/generated-room/FULL-GAME-AIR-JOIN-TRACE.md`, SHA256
`d311ed1ef556bad6c44698350b61b918da8a66a53ae9e0bfa46b06a859203c92`.
Root independently read the paid-input, cancellation, removal and clock callers;
the trace's stable-room scenario is a proposal, not accepted main-game policy.

This is the next source design work, not a release of a new air writer, new
solver, starting-house scenario or additional numerical run. The independent
field/pail native proof passed u4514; it does not qualify air. The same registered
geometry and outside air route must eventually serve physics and the main view.

First acceptance requires the same room/source/interval with vent closed/open,
local upstairs smoke response and accounted exterior export, finite source debit,
failed-candidate rollback and exact replay/reopen. Measure computation, geometry
change, state/receipt storage and rendering separately. Rendered and hosted proof
must show that actual scene; no more expensive editor browsing or broad historical
CFD matrices are implied by this decision.

## Dry volume-change source boundary — September 9

Root owns isolated `engine/air-displacement-20260909`, based on `c38cfa1`.
Meitner's read-only AIR-VOLUME-EDIT-PROPOSAL is accepted as a bounded direction,
not as full wet-hole or main-game acceptance. The same air rebind owner now has
a candidate whole-voxel displacement primitive: at most four monotone changed
cells per actual physical edit, unchanged grid/model/explicit opening masks,
shortest real-face routes to declared outdoors, deepest removals first and
reachable additions first. This keeps smoke/heat localized to a real path and
accounts the actual boundary parcel instead of deleting the new wall's contents
or conjuring ambient air at a dug cell. Every failure is detached and atomic.

One shared quantity-arithmetic owner serves both finite field exchange and air
boundary increments. It preserves the earlier operand-scale roundoff rule; the
existing whole-field tolerance is not permission to lose a small transfer.
There is no new transport solver, fine grid, density model or compatibility shim.

Remaining caller decisions stay explicit: sealed volume edits need a real vent
or a different pressure model; wet pits need non-overlapping liquid/air volume;
the producer must mask underground and unknown outside faces; owed fuel
emissions cannot lose their real receiver. The proposed560-cell first-layer
domain is a declared future consumer, not a reset of the accepted504-cell room.
A completed construction edit needs a preflight/commit path that reports its
blocked physical condition without repeatedly failing unrelated whole ticks.
The current four-cell event cap is not an all-actor or120-tick batch cap.

Unchanged joined `dd3b340` passed u4552:15 air laws, two affected field laws,
one compact Node SQLite event/replay law, strict public air and current app types.
The command exited1 at Fallow on a new moderate estimated-coverage advisory for
`membership` (CC11/cognitive12), which Root retains after source disposition;
there is no green audit claim. This qualifies bounded dry edit behavior and
its present callers, not a rendered wall, main-game air save, wet displacement,
air DO restart or performance. Accepted field/pail u4514 remains separate.

The actual completion read exposed a needed result boundary before qualification:
a sealed displacement now returns explicit `blocked/no-outdoor-route`, with no
candidate state. Successful rebinds return `applied`; malformed definition,
numerical and work-limit failures still throw. The registered room caller and
public typed consumer narrow that result. Future work completion can retain one
waiting job without hiding engine failures as ordinary scheduling. This does
not yet implement the shared main-game completion owner; its progress/material/
cleanup ordering remains a separate accepted-readiness join.
