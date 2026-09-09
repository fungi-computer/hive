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

Digging/filling solids or displacing air with water changes volume and remains
unsupported until a genuine remap/displacement law exists. Reject such a
candidate atomically; changing only its saved geometry identity is invalid.
The same world can have a vented water region and an air region without claiming
that this first air owner models sealed-water pressure or general phase exchange.

## Actual next joins

The numerical writer owns `src/engine/environment/air/**` in its isolated branch,
with focused laws and provenance. Root owns the building/material consumer: derive
completed walls, floor/roof faces and stair openings from current world facts;
provide an actual outside collar/replacement-air route; derive a finite source
from existing material settlement. The current old voxel binder reads terrain
only and seals all edges, so it is not that building join.

First acceptance requires the same room/source/interval with vent closed/open,
local upstairs smoke response and accounted exterior export, finite source debit,
failed-candidate rollback and exact replay/reopen. Measure computation, geometry
change, state/receipt storage and rendering separately. Rendered and hosted proof
must show that actual scene; no more expensive editor browsing or broad historical
CFD matrices are implied by this decision.
