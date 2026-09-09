
## Native engine-core first packet — 2026-09-09

Native goal `01a084d5-3041-7f91-8ce8-f6f9a91ab26b` remains active through source acceptance and extraction checkpoint. Owned write boundary: persistence.ts, needs.ts, persistence.test.js, needs.test.js. Existing schema-15 candidate preserved; no Git, deploy, art, runtime-owner or asset-MCP changes.

Care: orders admits one pinned rest alongside automatic care; jobs.ts:careOption can retarget automatic need. Therefore shared careIntentsConflict compares actor and automatic-versus-pinned policy slot, not mutable need. Queue still suppresses redundant same-need admission. Save rejects two automatic or two pinned jobs, permits automatic + pinned. careFacts now selects active task job before queued order. No admission/scheduling priority changed.

Store: pickupTransfer splits a new held lot for portion requests, retaining original source in request. Save validates physical held ID/actor/quantity and owner source/destination. Whole-lot ID must remain exact; surviving original must match held material. A missing original remainder is permitted. Limitation: existing wire has no durable resolved material on exact-lot request or Store job, so historical material after source extinction cannot be independently authenticated. That requires the material owner's resolved request plus explicit save migration, not invented validator history.

Proof: scoped actual-WASM needs + persistence suites 67/67, ~5.7s, /tmp/hive-engine-care-proof.log; scoped typecheck passes. Existing blocked-rest test incorrectly expected finishedJobs unchanged after care completion; activity.ts:finishJob increments all completions, so assertion now requires exactly one increment. New laws cover both care admission orders/paused restore, duplicate policy slots, active display under reordered jobs, actual Chop→shelf→split Store→restore→completion and seven malformed custody/owner/request contrasts. No hosted parity/art claim.

Actual retained Fallow findings read: validateJobScopes cognitive 22, validateCarryingTransfer 10; larger existing hotspots validateMaterialBindings 94, validateReservedTransfer 44, validateTransferOwner 43, activityMatchesJob 44. No advisory-green claim or valid-entrypoint removal.

### Next source-grounded extraction checkpoint

Existing material mutation owner is materials.ts (reserve/pickup/deliver/interrupt, lots/transfers/claims/capacity), with resolved ContainerSpec. construction.js:siteMaterialEndpoints already supplies construction buffers and shelves. jobs.ts independently plans constructionTransferOption and storageTransferOption; activity.ts repeats endpoint discrimination; persistence.ts:relationContext constructs another endpoint catalogue. First extension should resolve endpoint policy/contact and item/carry facts once, then have these callers query it. Do not move packages or add a second inventory.

The independent finite ore depot should provide finite lots and endpoints through this owner, with a headless demand/carry/delivery caller exercising reserve→split pickup→cancel/retry→delivery→save/reload and unique custody/conservation. It must share current Goblin construction/shelf operations and resolved-request material validation, not only similar interface syntax. Required next coupled custody includes materials/model/endpoint providers/jobs/activity/persistence and affected laws; current packet does not authorize writing those files. Delete current duplicate selection and endpoint-type ladders as consumers migrate, preserve libcolony joint assignment and unattended brewing. Carry provenance needs a resolved material fact admitted by mutation owner and persisted under versioned migration before claiming malformed historical-material rejection after original exhaustion.

Final first-packet proof update: 68/68 focused laws in 5.0s after adding persistence.test.js coverage for automatic retarget-to-rest coexisting with pinned rest, plus invalid actor/pinned need/routine rejection. All four owned files now changed. Waiting for root source review and exact next coupled boundary; saved native goal stays active. Historical-material limitation above is unresolved, not claimed repaired by source-remainder comparison.

### Provenance follow-up source inspection

Current model.ts:SourcePolicy exact-lot stores only lot ID; Transfer.request has source/quantityPolicy/quantity. materials.ts:reserveTransfer (around 826) is the single admission point copying that request after resolving the live source. It is the appropriate owner to capture a resolved material fact without making every planner author another independent fact. pickupTransfer and deliverTransfer can then compare live held/source material against that captured obligation; persistence validates the same predicate. Carrying phase currently holds only lot ID, so deriving old material from a vanished original is impossible. Recipe bindings already capture consumed-role material, but Store has no equivalent record.

Suggested smallest follow-on shape: retain planner TransferRequest; give admitted Transfer an immutable resolved material field populated by reserveTransfer. Validate it at pickup, delivery and restore. Frozen historical parsers must remain unchanged; current migration can derive the field from actual source/held lot after validating predecessor relationships, explicitly acknowledging historical records cannot recover unknown provenance. This is a typed material fact, not an unbounded history log. New malformed laws should alter a carried material while preserving global quantity totals (swap another compatible lot), ensuring rejection comes from obligation rather than accidentally from conservation. No model/material/schema edits were made before coupled custody is assigned.

## Reusable material engine — coherent source checkpoint for root review

New bounded goal in native thread `01a084d5-3041-7f91-8ce8-f6f9a91ab26b` is active: extract actual shared material owner with Goblin construction/shelves and a five-ore Node consumer, durable obligations and cancellation/retry/save laws. This is not full Hive v0 or a care release. Root granted only material initialization in clearing.ts in addition to the coupled material custody.

Supported entry is `src/engine/materials/index.ts`; both the Goblin adapter and `scripts/ore-depot.mjs` import it. `src/materials.ts` no longer imports owner.ts or destructures internal helpers. It configures Goblin definitions, maps the existing game entry names to supported operations, selects water for authored pail operations, and retains the historical consumedWood accounting preflight/credit. All lot creation, splitting, movement, physical removal, embedding recovery, held-use mutation and resolved recipe settlement now stay inside the shared engine modules. One state and one lot allocator remain. Clearing calls createMaterialsState and still starts the allocator at 1; no clock/navigation/scenario change.

Internal modules are split by responsibility: definitions, types, queries/capacity, owner transfer/container mutation, held-use, recipe settlement, recovery, strict schema, physical relations. The supported entry exposes named outcomes and derived queries, not reservation preflight or allocation choreography. Zod owns strict definition and snapshot-envelope structure; semantic references and physical relationships remain domain checks. The same portable-interior derivation supplies the game and engine. Checked definitions are copied/frozen.

Reservation records resolvedMaterial. One phase predicate gates actual pickup/delivery/interruption/teardown and game restore; superseded carrying validator and generic reserved-source validator branches were removed. Game container capacity calls the same capacity law, including admitted recipe promises. Strict schema 15 and older shape/relationship validation precedes normalization to schema 16; old provenance that was never saved remains unauthenticated history. The migration derives only a checked surviving physical fact, never a claim that the predecessor stored the new obligation.

Standalone snapshot relations cover current binding/recipe/held-use shapes: unique owners/claims, bound-source quantity, portable interior, admitted output capacity, transformation inputs and consumed output references. A durable binding can own acquired hand custody after its transfer is retired; its positive wire fixture reloads and settles one sink, while a missing binding rejects. Authored recipe roles/effects and original material grants remain consumer constraints; game persistence retains those checks. Source introduction is trusted authoring, not an exposed controller mint action. Physical retry/no-double-delivery is not exact lost-ack command replay.

Proof completed and all sessions retained through exit 0:
- `run-u3746.scope`, invocation `aad598fbecc54a0a9773649da68932d1`: typecheck.
- `run-u3748.scope`, invocation `4f171160591c43ed897e3c5374e6f2ef`: 126/126 engine/materials/clearing/needs/persistence laws (~15.9 s).
- `run-u3747.scope`, invocation `14b86c22301942c6b24d3d990c452e0a`: Node ore proof, grant 5 = source 3 + bin 2. Covers overbooking rejection without mutation, split pickup, JSON reload, before/after pickup cancellation, failed/successful removed-bin release, retry and no duplicate completion. Also exhausts the original 3-unit remainder into an embedding while 2 remain held, restores absent-source custody, and rejects forged held material through resolvedMaterial.

The new standalone laws also prove an alternate drum/sap definition, caller-definition immutability, held-use receipt continuity, recipe prepare/settle/consume snapshots, malformed bindings/output receipts/capacity rejection, and preservation of an existing binding on conflicting vessel-acquisition identity. Existing real-WASM positive laws retain the two original save corrections and test schema-15 migration of an actual split Store transfer plus malformed/missing/forged current obligations.

Exact changed source inventory and hashes, plus retained proof outputs, are in `.botanical/research/material-engine-20260909/`. Files: model.ts; materials.ts; item-containers.ts; persistence.ts; clearing.ts (initialization only); materials.test.js; clearing.test.js; persistence.test.js; needs.test.js; new engine/materials/{types,definitions,queries,owner,held-use,settlement,recovery,schema,relations,index}.ts, materials.test.js and README.md; scripts/ore-depot.mjs. No jobs/activity/UI/art/terrain/world/asset-pipeline/Root dependency/Git/deploy edits.

Source is frozen for root personal/independent review. Goal remains active through corrections and integration handoff. No hosted-parity, renderer, population-performance, full work-executor composition or engine-completion claim. Existing retained Fallow hotspots were read; the new modules need the current source review rather than an advisory-green claim.

### Refreshed freeze: inherited recipe preflight contradictions closed

Read-only checkpoint audit found retained-lot admission could claim another transfer's reserved lot; the shared availableQuantity rule now rejects it, including hand cargo. Consumed/retained overlap rejects, as does readmission of an already settled transformation ID. The same promised-capacity ownership prevents embedding or releasing a recipe's live output destination until its binding is explicitly canceled. These are corrections to current material admission/cancellation, not expanded caller work or controller command replay. A valid canceled recipe releases its endpoint normally.

New direct laws prove all those failure paths leave state unchanged, and successful cancellation/settlement still round-trip. Refreshed source freeze is `.botanical/research/material-engine-20260909-recut1/`; the first freeze inventory/logs are preserved unchanged. Exact file inventory is unchanged.

Completed final proofs, all exit 0: typecheck `run-u3751.scope` / `7b15429f15b14d37a5be330ff2cce023`; 128/128 focused laws `run-u3752.scope` / `d7de94e87a2b481d9e447873e6e68aa5` (~19.3 s, no performance claim); Node ore proof `run-u3753.scope` / `550cad9cf64249d3af3ef30b6daa3950`, reported 5 = 3 source + 2 stored. Goal remains active awaiting root personal and independent review. No further source/caller expansion while this refreshed checkpoint is reviewed.

### Frozen checkpoint Fallow disposition

One owned Fallow 3.20.0 scan of `src/engine/materials` completed exit 0: `run-u3761.scope` / `397f207fe0344b92a969306aaa9dfcf0`. Raw report is `material-engine-20260909-recut1/fallow.json`. No source edits or suppressions. Isolated-root scan warns that node_modules is absent; dependency/entrypoint and coverage estimates are limited by that root. Actual public callers remain Goblin materials.ts and the Node ore script, with model/item-container type/definition imports outside the scan.

Reported: zero cycles/re-export cycles; 11 check issues (one unused test file, ten private-module type re-exports); 48 complexity findings across 279 functions, of which 16 critical/12 high/20 moderate; nine clone groups, 20 instances, 413/3295 duplicated lines (12.53%). The CRAP severity uses estimated zero coverage and is not a measurement of our executed 128-law suite. The unused test is explicitly executed by the focused proof and must remain. The owner/queries type re-exports are plausible cleanup candidates, not public-type deletion authority from this scan; public types and external game imports must be checked before removal.

Actual responsibility splits worth correction: relations.ts `validateMaterialRelations` (CC43/cognitive66) combines endpoint assembly, transfer joins, aggregate claims, hand custody, embeddings and capacity. `validateBindings` (CC34/cognitive55) combines binding shape semantics, recipe transformation joins and output receipts. These should become private named validators around one assembled index/context, retaining one restore entry and the shared runtime phase/capacity predicates. owner.ts `phaseProblem` (CC27/cognitive33) can separate reserved and carrying predicates behind its one authoritative dispatcher; reserveTransfer (CC24/cognitive23) can separate admitted owner/source/destination resolution from the atomic mutation. Do not expose this choreography to clients or move it into a second validator.

Most clone groups are generic local type aliases, result/integer helpers, and destructure/return lists. One substantive duplicate is recipe promise bulk accumulation: queries.ts ~235 versus settlement.ts ~324, where settlement intentionally excludes its own binding. A single private accumulation rule with an explicit excluded binding would preserve that distinction. Recovery ground/container consumption shares quantity arithmetic but has different source permission checks; shared checked arithmetic is reasonable, merging custody paths blindly is not. Pickup/delivery actor preflight duplication is small and phase-specific. These findings are disclosed, not claimed green, and source stays frozen until Root/reviewer concrete correction.

Independent reviewer concurrently reported two atomicity blockers: duplicate retained lot IDs under different roles and nonpositive recipe-output consumption quantities. Root notified; disposition is pending before any source correction.

### Reviewer corrections — second refreshed freeze

All four concrete independent findings corrected. Recipe admission rejects duplicate retained physical lot IDs even across distinct roles; output consumption validates positive safe integer quantity before mutation (zero, negative, fractional, NaN, infinity and unsafe integer laws). Related quantity entrypoints were read once: introduction/reserve/move/sinks/removal already preflight quantities; salvage intentionally admits safe zero; recipe settlement joins quantities to already admitted promises. No arbitrary state corruption contract was invented.

Ordinary use cancellation now owns exact transfer interruption, legal held drop (including durable binding-only hand custody) and claim retirement atomically. Recipe IDs reject. Checked retire remains a narrow idempotent release that refuses active transfer/hand custody and recipe bindings. Park remains explicitly claim-preserving for reassignment. Actual activity water completion and consume interruption use atomic cancellation; orders water cancellation now calls it for both active and parked uses. Root granted that exact orders join. The remaining orders consume retire is a checked idempotent cleanup after interruptWork already cancels its active ordinary use; it does not coordinate physical transfer/drop.

Current Goblin save relations call the configured public validateState with resolved endpoints. Engine owns aggregate physical claims, current phase, current hand/container/capacity relations and lot validity. Historical calls retain pinned predecessor predicates and old checks. Game still owns actor existence/location, actual jobs/operations, authored recipe roles/staging/production receipts, source grants, terrain and conservation. Current duplicate physical checks were bypassed at these migrated boundaries; game-defined quantity/material requirements remain their own semantic constraints. The new real-WASM law starts from a valid ration-use save, preserves total supplies, adds a second otherwise joined care chain against one exact portion, and rejects specifically source overbooked. Error assertions now name shared owner errors; the missing-job fixture gained a valid endpoint so it still specifically proves missing-job rejection.

Frozen inventory and logs: `.botanical/research/material-engine-20260909-recut2/`. Prior freezes unchanged. Inventory adds activity.ts and the narrowly granted orders.ts; no other boundary expansion. Final typecheck exit 0 `run-u3778.scope` / `3a0c42f08e2449c6ba9586d7f4172a3b`; 130/130 focused laws exit 0 `run-u3781.scope` / `ae8405d36c534a7689d0585965a112b3`; Node ore exit 0 `run-u3780.scope` / `e1fe604cc72149efa5dcc64e306b0bc1`, 5 = 2 stored + 3 remaining. Failed intermediate rejection-message run retained separately; no failure hidden. All sessions polled through completion. Fallow report remains explicitly on recut1 bytes, with findings/disposition above; no new advisory-green claim.

Source frozen for final narrow reviewer reread and Root acceptance. Native bounded goal stays active through integration handoff.

### Accepted integration handoff and custody release

Root personally accepted recut2 after reading final ordinary-use cancellation, output-consumption preflight, activity/orders callers, current-versus-historical persistence, and independent Sol review. Root verified all 24 inventory hashes and accepted the 130-law/typecheck/ore evidence. The bounded reusable material extraction objective is satisfied: existing Goblin consumers and the independent Node ore depot use the same actual material owner, durable resolved material and cancellation/retry/save laws are proved, and reviewed source is handed off. Root now owns all coupled source, Git, build and proof custody. No hosted or full-engine completion claim.

Released exact modified source inventory:
- `src/model.ts`
- `src/materials.ts`
- `src/item-containers.ts`
- `src/persistence.ts`
- `src/clearing.ts`
- `src/materials.test.js`
- `src/needs.test.js`
- `src/persistence.test.js`
- `src/clearing.test.js`
- `scripts/ore-depot.mjs`
- `src/engine/materials/README.md`
- `src/engine/materials/definitions.ts`
- `src/engine/materials/held-use.ts`
- `src/engine/materials/index.ts`
- `src/engine/materials/materials.test.js`
- `src/engine/materials/owner.ts`
- `src/engine/materials/queries.ts`
- `src/engine/materials/recovery.ts`
- `src/engine/materials/relations.ts`
- `src/engine/materials/schema.ts`
- `src/engine/materials/settlement.ts`
- `src/engine/materials/types.ts`
- `src/activity.ts`
- `src/orders.ts`

Also release the unmodified grants for src/material-endpoints.ts (if present), src/construction.js, src/finite-sources.ts, src/jobs.ts and src/water-delivery.ts, and all directly associated material laws; no residual writer custody remains. Root’s full engine goal and later work/care/Fallow outcomes remain active separately. No further source edits or proofs by this PM.
