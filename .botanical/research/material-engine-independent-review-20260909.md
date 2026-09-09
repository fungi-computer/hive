# Material engine independent source review

Independent read-only review, September 9, 2026. The final reviewed bytes are
the hashes in `material-engine-20260909-recut2/source-inventory.json`. I read the
public `src/engine/materials/index.ts`, its private invariant owners, the actual
Goblin model/definition/adapter/save/construction entry, the immediate recipe,
held-use and transfer callers, and `scripts/ore-depot.mjs`. I ran no tests, Git,
browser or server commands.

## Verdict

Accepted for the bounded reusable-material first shape after four concrete
review findings were corrected. Goblin and the Node-only ore depot configure the
same owner and mutate the same lot/transfer/binding representation. No remaining
source blocker was found in this cut.

This is not acceptance of the full Hive engine, generic work execution,
controller command replay, water/air/world simulation, hosted behavior or a
population/performance claim. Root retains integration and final acceptance.

## Current source findings

- `engine/materials/index.ts:22-87` is the supported headless entry. It checks and
  freezes consumer material definitions, creates the one physical state, exposes
  narrow transfer/use/recipe/recovery operations and validates snapshots with
  consumer-supplied live endpoints. `materials.ts:31-85` is a Goblin naming and
  legacy-accounting adapter; `clearing.ts:25-67` creates that state once.
  `scripts/ore-depot.mjs:1-152` independently configures ore/slag and exercises
  the same reservation, split pickup, interruption, delivery and snapshot owner.
- Physical quantity and custody remain in `MaterialsState`; Goblin `model.ts:28-44`
  aliases the engine records rather than defining another inventory. Portable
  interiors derive once from checked content definitions
  (`definitions.ts:47-84`, `item-containers.ts:14-46`). The surviving
  `consumedWood` field is a save-compatible game aggregate: its adapter preflights
  accounting and delegates physical removal/recovery before crediting it
  (`materials.ts:121-188`). It does not mutate or duplicate lots.
- The earlier retained-lot admission flaw is closed. Admission now rejects a
  retained lot that overlaps consumed input, another retained role, an existing
  reservation/binding or hand custody before adding the recipe binding
  (`settlement.ts:95-163,219-239`). Reusing a settled transformation ID also
  rejects. Live output promises count against capacity and prevent endpoint
  embedding/release until pre-PREPARE cancellation removes the binding
  (`owner.ts:628-721`, `settlement.ts:165-217,528-542`).
- The earlier malformed output-consumption flaw is closed. Zero, negative,
  fractional, nonfinite and unsafe quantities reject before lot or receipt
  mutation (`settlement.ts:476-525`). Settlement remains a preflight followed by
  one output allocation/receipt mutation (`settlement.ts:400-473`); consumption
  uses settled role/material/destination facts and `availableQuantity`, so live
  transfer/use/recipe claims cannot be consumed through.
- The earlier ordinary-use cancellation leak is closed. Checked retirement
  refuses recipe IDs, active transfer custody and binding-only hand custody
  (`held-use.ts:183-209`). `interruptOperation` preflights a legal carried drop,
  interrupts the exact transfer or drops binding-only hand custody, and then
  removes only the ordinary claim in one call (`held-use.ts:377-407`). Vessel
  parking remains separate and deliberately preserves the claim for reassignment
  (`held-use.ts:124-180`). Goblin consume interruption and water completion use
  the atomic operation (`activity.ts:94-127,555-589`); order cancellation handles
  both active and already parked water custody (`orders.ts:424-505`).
- The earlier current-save duplicate physical authority is closed. The configured
  public `validateState` delegates to `validateMaterialRelations`
  (`index.ts:65-70`). Current Goblin save validation supplies the actual station,
  source, construction, terrain-buffer and portable-interior endpoint catalog to
  it (`persistence.ts:1900-1929,2816-2844`). It therefore shares aggregate
  claims, phase, hand/container, capacity, lot and embedding laws with the
  headless snapshot owner. The old duplicate-ID/carry/capacity/reservation/hand
  checks are now conditional on predecessor validation
  (`persistence.ts:1363-1625,2418-2587,2816-2844`). Current game checks remain
  where they add actor/job/operation, recipe-definition/staging, source,
  topology, receipt and production-conservation facts.
- The exact divergence used to find that issue is now rejected by the engine
  join: two otherwise valid actor care chains cannot bind the same one-unit
  ration portion. Engine relations aggregate binding and reservation quantity
  (`queries.ts:107-145,253-273`; `relations.ts:145-272`), rather than trusting
  each game operation in isolation.

## Accepted limits

- The whole-game current structural Zod wire remains in `persistence.ts` because
  it owns the versioned Clearing envelope and frozen predecessor migrations.
  Current physical *relations* now have one engine owner; historical validators
  intentionally preserve what older wires could establish. Schema-15 migration
  can derive `resolvedMaterial` only from its validated surviving lot, not prove
  provenance that the predecessor never stored (`persistence.ts:1064-1084,
  3143-3162`).
- Endpoint existence, route/reachability facts, recipe roles/effects/timing,
  authored finite grants and game conservation budgets remain consumer facts.
  The material owner checks resolved operations; it does not become a second
  scheduler or content system.
- Physical delivery retry is idempotent because completion removes its transfer;
  this packet does not persist exact command responses for lost acknowledgments.
  Recipe transformations, output consumptions and sinks do retain durable IDs
  and receipts.
- The retained recut1 Fallow report identifies large private factory/validator
  functions and duplicated local type/result scaffolding. Those are maintenance
  advisories, not evidence of a second runtime owner or a reason to widen this
  correction. The report predates recut2 and is not advisory-green evidence.

Reported evidence, not rerun here: 130/130 focused laws (`run-u3781`), TypeScript
(`run-u3778`) and Node ore proof (`run-u3780`) all exited zero. The ore proof
reports five units conserved as two stored plus three remaining.
