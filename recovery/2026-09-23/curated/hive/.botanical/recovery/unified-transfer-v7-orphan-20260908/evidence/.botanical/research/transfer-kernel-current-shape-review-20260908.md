# Transfer kernel current-shape pressure test

Read-only review, 2026-09-08. Pins: `materials.ts` `8d2f059c003fa0264c63a5c6343e3abf6c7345b5a28e3a5a343fbd7287ae43eb`; `model.ts` `23c05d71ef66f7075089b69aab69bec9c9e22388e2ea29f2a94886d4198c7666`; `jobs.ts` `0c0543dfc5e3e6a7cf5f308f40907d2327291f2a8c9a1256919abf1f3e2640be`; `resources.ts` `f1062149ba870631884a6e69421bb1505983f498f1f46281ade29bbd805e020f`. No test or final-migration claim.

## Current shape

The mutation kernel aligns with the checkpoint. `reserveTransfer` copies one request and owner, promises capacity with its quantity, and records the chosen source lot. `pickupTransfer` revalidates stale admission. A whole-lot pickup moves the same ID; a portion pickup subtracts once and allocates one positive carried lot. The destination obligation and incoming promise remain in `transfer.request` throughout carrying, and delivery validates the held lot before moving it and removing the transfer.

Interruption is also correctly drop-based rather than rollback-based. Before pickup it removes only the reservation. After pickup it validates the actual hand lot and a caller-resolved legal drop before either mutation, then moves that same lot once and removes the transfer. `releaseContainer` preflights every carried drop before changing contents. The original ground location is intentionally not retained after pickup: cancellation does not recreate stock there. For exact whole-lot work the source identity survives as the carried ID; for a portion, the remaining source and newly allocated carried ID are the two authoritative identities. Do not add a second provenance/location authority merely for reversal.

`quantityPolicy` is definition-driven inside the kernel; it contains no wood/mugwort branch. The remaining consumer leakage is adjacent but real: `constructionBuffer`/`shelfContainer` still define commodity acceptance in `materials.ts`, and the opaque ownership role is a closed `TransferStep = "construction-materials" | "shelf-store"` in `model.ts`. Move those two current container resolvers to their consumers and make the kernel compare an opaque owner-step token. Keep construction embedding/salvage specialized; this pressure test does not justify a universal process ledger.

## Confirmed current bug and binding fix

`jobs.ts:transferOption` resolves `request`, uses only its source policy, then discards it. `assignWork` reconstructs owner, source policy, quantity policy and quantity from `job.kind`. This leaves two policy switches and no single demand value spanning eligibility, routing and atomic commit. Return a resolved value containing `{ owner, request, destination, sourceLot }` with the candidate, route against it, and pass that exact value to `reserveTransfer`; reservation still revalidates current lot/capacity/access.

This duplication already causes a correctness failure: a build missing two units creates a quantity-two request, but `availablePortions` admits a reachable source with only one unit. Commit reconstructs quantity two and reservation rejects `source-insufficient`, although one unit can legally advance the buffer. Bind the chosen amount as `min(carry limit, remaining demand, available portion)` during candidate resolution. Also replace the shared early reason `"Wood is on its way"`; it is currently shown for mugwort transfers.

## Scheduler findings

Correction from the exact pinned braces: carrying continuation **is preserved**. Whether its route succeeds or calls `interruptWork`, the carrying branch ends with an unconditional `continue`, so no fresh job competes in that pass. Retain this shape.

The single per-actor `break` makes every worker offer only its first ready job. Two workers can both offer the same first shared job, leaving a second ready job invisible to the joint optimizer; the rewrite also omits the prior `workDirty` retry when commits leave idle workers. Restore separate personal-first and shared offer construction, preserve enough actor/job edges for `optimizeEligible`, and commit equal-resource conflicts in job priority then actor order. For wood, compare candidates by pickup plus loaded-delivery travel and retain that full cost; the current code selects the last route under an arbitrary `99999` threshold and reports only pickup travel.

## Future direction, not a present kernel bug

Mixed capacity and construction withdrawal are deliberately absent. All sources must currently be ground lots, and `shelfContainer` accepts one mugwort. The later mixed-shelf slice must resolve a multi-material bounded container and add a typed container-source withdrawal using the same custody/transfer phases. Do not weaken the current ground-source law or infer capacity from art to anticipate it.

These findings are an early correction for Shiitake, not an interruption or additional acceptance gate.
