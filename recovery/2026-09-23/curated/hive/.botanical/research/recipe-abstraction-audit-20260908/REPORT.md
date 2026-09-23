# Brewing abstraction audit

Read-only independent Astra source/caller review, 2026-09-08. Root requested this after Levi challenged recipe-specific persistence. No tracked edits, tests, builds, Git mutations, model-runtime restart or deployment. Active Delivery and runtime writers retain custody. Final observed hashes are in `source-inventory.json`; HEAD advanced from `596c5ac` to `7ff7111` during inspection. This is a moving-source review, not an atomic freeze. Anchors below identify inspected responsibilities and may move during correction.

## Finding

Levi's concern is substantiated. `herbalAleTray` is currently a handwritten factory returning a real `ContainerSpec`, not another inventory and not a config-backed call. The name itself is harmless in content code. The problem is that recipe semantics have spread into shared materials accounting and save relations, so adding a supported recipe would require editing several mechanism owners.

The ordinary transfer mechanism really is shared: construction, storage and brew supply all emit the existing typed transfer candidate. This audit found repeated supply selection and recipe-specific promises, not a new authoritative beer inventory or third complete haul state machine. Keep the common lots/transfers and their proven laws.

## Source anchors

| Inspected owner | Actual finding |
| --- | --- |
| `src/recipes.ts:5–32` | `HERBAL_ALE_V1` holds quantities/timings, but `herbalAleTray(station)` separately builds capacity1/spent-grain-only policy and `brew-tray:` identity. Recipe requirements, catalyst/package roles and slot mapping are not one definition. |
| `src/construction.js:101–214` | Five slot policies are separate factories. The live correction adds `siteMaterialEndpoints`, consumed by resolution/save/teardown. That is a useful lifecycle catalogue, but it still assembles named brew factories plus the named recipe tray. `siteMaterialEndpointFor(site, material)` chooses the first accepting endpoint; material acceptance is not a unique role/slot identity. |
| `src/materials.ts:20,112–137,249–265,1166–1310` | Shared material owner imports `HERBAL_ALE_V1`. `checkHerbalAleBinding` repeats literal `{malt:2,water:2,mugwort:1,wood:1}`. Binding availability, output-capacity promises, admission and transformation know `barm`, `keg`, `tray` and the literal recipe. These are the clearest boundary leaks. |
| `src/model.ts:65–112,321` | Durable material binding/transformation shapes encode the one recipe and its four materials. `BrewProcess` is legitimately separate from physical lots and worker activities, but its recipe version is only implied by the binding. |
| `src/brewing.ts:61–168,178–267` | Useful domain owner already returns waiting/supply/ready, admits one process, advances attended PREPARE and unattended FERMENT. However it manually builds requirements and named binding fields. Definition timings are read directly while running. The current two-phase process should not be mislabeled a generic recipe engine. |
| `src/jobs.ts:107–200,284–370,498–578` | Construction supply, cache repair and brew supply repeat source classification/access/path/ranking. They converge on the same transfer candidate. Brew requires a single source fact holding the full requirement and requests the full recipe amount, so split stock/partly staged stock are not robustly handled by the same remaining-demand rule. This is source diagnosis, not a reproduced gameplay trace. |
| `src/persistence.ts:501–543,765–977,991` | Endpoint enumeration is being corrected. Recipe literals, required quantities, catalyst/package identities, output capacities and role inference still appear in schema/relations. Structural parsing must remain strict, but content validity and physical relational validity need their actual owners. |
| `src/construction.js:380–439` | Teardown aggregates material contents/transfers plus brew jobs/operations/bindings/processes. Blocking an occupied irreversible process is legitimate; construction should ask the process/material owners for a removal disposition rather than interpret recipe internals. |

I read the existing AGENTS composability rules, current sprint header, unified-work recut, architecture implementation plan, and retained first-brew/vessel review. They already require shared mechanisms and versioned content. This is a failure to carry the accepted boundary through all current consumers, not missing instructions to adopt a new ECS or monad library.

The retained Fallow artifact `.botanical/schema10-fill-kettle-final-20260908/fallow-release.json` is an older `399873b` scan: 110 complexity findings and 100 clone groups, with estimated coverage. It flags persistence validation and large callers. It is not a current brew scan and cannot validate this correction. A fresh affected-code disposition belongs to Delivery at its next stable checkpoint.

## Small corrective contract

Land serial recoverable checkpoints with the same writer. Finish the endpoint correction, then remove recipe semantics from the materials/save boundary before extending kegging/tapping. Do not restart the entire work migration or block independent maps/controls.

1. **Definitions own content facts.** Put station slot keys, capacity/acceptance/bulk and deposit/withdraw policy in checked building definitions. Put consumed requirements, retained catalyst/package roles, output/byproduct destinations, quantities and timings in the pinned recipe definition. A recipe chooses explicit slot keys; it does not resolve a role by the first container accepting a material. Preserve existing container IDs/save references during this correction or explicitly version/migrate them.

2. **One endpoint provider owns existence and lifecycle.** Resolve `(site, slotKey)` or an exact container ID into the existing `ContainerSpec`, access and permission facts. Unfinished construction and finished slots keep their distinct rules. Persistence enumerates real endpoints and validates references; teardown requests their disposition. Both use the same catalogue as transfer admission. Portable vessel interiors use the corresponding item definition; they are not copied into site contents.

3. **Recipe resolution produces a checked physical plan.** Resolve actual lots, exact consumed portions, retained exclusive items, output capacity promises, and phase effects from the pinned definition. Shared materials receives those resolved facts, not a recipe-specific parameter list. The kernel owns atomic reservation, availability/capacity, consume-into-provenance and idempotent output settlement. `barm/keg/tray` become definition roles; the material mechanism sees retained item IDs and destination/material/quantity records. Content IDs remain legitimate definition references and presentation lookups.

4. **All current material consumers close the boundary.** Existing `vessel-use` and recipe claims must participate in the same exclusion/accounting queries, so an item cannot be both a held-use vessel and recipe equipment. Preserve the meaningful distinction between moving a vessel and pouring contents. Do not rename recipe functions while leaving recipe branches inside available quantity, incoming capacity, transformation or generic save relations. Schema parses the supported typed states; domain validation checks the pinned recipe; materials validation checks physical relations once.

5. **Deepen the existing supply candidate operation.** Construction, repair and brew can supply a checked demand plus source policy and destination access; one owner computes remaining actual demand, selects eligible portions and builds the existing transfer candidate. Whole-lot identity and portion splitting are explicit policies. An exact player Store order remains an exact-lot request. Keep actual libcolony assignment, current personal/shared priority, Haul eligibility, carry continuation and topology owner; no second scheduler or generic callbacks.

6. **Keep process semantics explicit.** Attended work, unattended clock waiting and atomic transformations are different operations. The current process module can retain its narrow lifecycle while using pinned resolved definitions. It need not implement a universal plan language now. Any subsequent general process extraction must replace its current callers, including cancellation and save validation, rather than forward into permanent parallel brewing logic.

## Acceptance laws and deletion proof

- Existing wood construction and herb storage still use the same physical transfer owner; recipe supply does too. No old cargo/claim/inventory mirrors return.
- Several eligible partial lots and partly staged inputs can satisfy a portion demand without overfilling; whole-lot equipment retains identity. Incoming promises never count as already transformed ingredients.
- One reservation preflights all input portions, exclusive equipment, station occupancy and every output capacity claim atomically. Failure changes no quantity, reference or allocator.
- PREPARE cancellation releases promises while retaining staged lots and progress according to the accepted policy. After conversion, interruption cannot refund consumed ingredients. A worker leaving never releases the independent process's claims.
- Consume and settle use stable operation identity. Retries cannot consume or create twice; outputs stay in the real destination if external storage is full. Provenance remains valid after consumed lot IDs cease to be live.
- Physical balance is per material with transformed input/output and explicit sinks, not total item counts. Fuel is never counted in two sinks. Original pail, keg and retained catalyst IDs survive their permitted transitions.
- Save/reload preserves the exact recipe semantic version, phase, progress, references and claims; restore stays paused with no offline advancement. Changing current configuration cannot alter a running batch. Existing recovery/version policy stays explicit.
- Material acceptance validates an explicitly resolved slot. Two same-material slots cannot silently alias because of array order. Existence remains distinct from current permission and accessibility.
- Teardown gives the same answer from actual endpoint contents, incoming claims and process occupancy. It never removes the owner before its material disposition is known.
- At final source review, `materials.ts` no longer imports the concrete herbal-ale definition; generic quantity/capacity/schema relation loops no longer enumerate named recipe roles or repeat recipe quantities. Read the immediate callers and actual Fallow findings. Do not invent a second gameplay recipe solely to claim extensibility, and do not rerun the long house proof.

## Why the shallow abstraction kept returning

Observed process pattern: the vertical slice brief enumerated concrete kettle/hearth/barm/keg/tray semantics, while the generic boundary stayed an intention. The implementation localized repeated syntax and preserved behavior but left content decisions in multiple owners. Existing laws checked that this one recipe conserved resources; they did not require deletion of recipe knowledge from the shared kernel and validator. This is evidence about the artifacts/review exit, not a guess about individual motives or capability.

The corrective review question is concrete: **which content decision now has one home, and which existing callers lost knowledge of it?** A shorter loop or a function named `siteMaterialEndpoints` is progress only insofar as it makes that answer true.
