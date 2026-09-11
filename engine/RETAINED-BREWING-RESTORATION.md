# Retained brewing to staged-process boundary

This note maps the retained production path to the current shared owners. It does not propose a native `BrewProcess` or a second allocator.

## Current migration status — September 11

The retained behaviors below are the restoration requirements, not a claim that
the Rust engine already implements brewing. Native Colony currently has shared
supplies, containers/lots, paid fuel emissions and earned construction/dig work.
It lacks recipe bindings, retained-vessel/output promises and a staged process
owner. Native `material_output.rs` is presently an excavation completion helper,
not a public recipe output API. The proposed API below remains design work.

Retained source line numbers record the earlier inspected revision and have
drifted; resolve the named functions in the current retained source. Retained
cancellation/save behavior is not evidence of DO crash durability. Preserve its
useful semantics while moving multi-owner settlement into the native transaction.

## What the retained path already proves

`src/recipes.ts:5-64` is the content boundary. A recipe supplies consumed portions, retained whole lots, promise destinations, four timings (`prepare`, `ferment`, `keg`, `tap`), and output actions. `HERBAL_ALE_V1` keeps fuel in the consumed requirements, barm and keg in retained requirements, and declares ale/spent-grain promise destinations. Recipe values should remain authored TS data.

`src/brewing.ts:418-548` resolves those definitions against actual station endpoints and material lots. `brewStationReadiness` emits one missing supply requirement at a time, or a fully resolved `ResolvedRecipePlan`; `checkRecipePlan` is called before readiness returns `ready`. It is the useful narrow admission shape: the process receives lot identities and destinations resolved by the material owner, rather than reconstructing inventory.

`src/jobs.ts:537-633` supplies a missing requirement through the existing transfer candidate. `brewSupplyOption` chooses an available lot, computes source-to-station travel, and creates a normal job-owned transfer. `src/jobs.ts:1093-1380` admits that transfer before calling `admitBrew`, and starts the same navigation/activity path used by other work. There is no brew-specific haul or claim owner to preserve.

`src/brewing.ts:569-609` admits the process through `admitRecipePlan`, which binds the exact lots and appends a process record. Cancellation is only legal in `prepare`; `cancelPreparingBrew` calls `releaseUnpreparedRecipeBinding` and removes the process while staged material remains. `src/job-cancellation.ts:84-99` is the durable cancellation caller.

`src/activity.ts:455-493` is the attended contact owner. A worker must reach the station, then `attendBrew` advances prepare or keg. `src/clearing.ts:177-198` calls worker activity before `advanceBrewing`; `src/brewing.ts:793-804` advances fermenting unattended only after its transition tick (`enteredAt < state.tick`). A transition tick therefore never earns a ferment tick.

The attended prepare transition is an atomic join at `src/brewing.ts:722-762`: clone material state, call `completeRecipePrepare`, register the paid atmosphere release against that candidate state, and publish both only if the release is admitted. A blocked air/source-capacity result leaves inputs and the process in prepare. This is the smallest existing example of “finite fuel consumed plus physical emission obligation in one commit”.

`src/brewing.ts:764-790` owns the keg transition. `brewSettlementPlan` reconstructs the exact retained vessels and promised output destinations, then `settleRecipePlan` settles the transformation and removes the process together. `src/brewing.ts:300-378` and `src/activity.ts:493-535` consume settled output through the material settlement owner, one exact receipt at a time. Output-full behavior is represented as waiting, and `requiresOutputExhausted` prevents spent-grain disposal while ale remains.

## Current reusable owners and gaps

- `src/engine/materials/owner.ts` owns lot identity, vessel/container custody, availability, capacity, transfer admission, and mutation. `src/engine/materials/settlement.ts:admitRecipePlan`, `completeRecipePrepare`, `settleRecipePlan`, and output consumption already provide the required atomic material operations.
- `src/engine/work/owner.ts` plus `src/engine/work/progress.ts` owns generic acquire/attend/draw/deliver progress for finite work. It parks or releases material custody on interruption. It does not own a recipe transition whose inputs, retained vessels, environmental obligation, and output promises must commit together.
- `src/jobs.ts` and `src/activity.ts` own candidate selection, navigation, contact, and attended worker ticks. They must continue to submit work to the process owner; a process boundary must not allocate workers or create a second transfer path.
- `src/brewing.ts` currently owns the recipe-specific process record, staged supply sequence, prepare/fuel/air join, unattended ferment clock, keg settlement, and output actions. The reusable missing mechanism is a definition-driven staged process state/transition owner, not a game-name branch and not a universal optional ECS entity.
- Native custody already lives in Rust. `engine/kernel/src/components.rs:35-55` defines the canonical `Container`, `Lot`, and `LotWater` facts; `registry.rs` registers/serializes/query-restores them. `engine/kernel/src/world.rs:2005-2090` owns transfer admission and mutation: sealed-source/destination checks, capacity, contact, lot splitting, carried-water conservation, lot identity allocation, and `contents` indexes. `world.rs:1427-1500` plus `material_output.rs:34-72` provide detached material-output preparation and publication; `complete_excavation` prepares output before terrain mutation and publishes only after the terrain commit is admitted. The SDK delivery/work systems submit candidates and commands, but do not replace these native owners.
- Native `engine/kernel/src/excavation_work.rs` and `construction_work.rs` own validated actor admission, saved progress, stationary/contact checks, bounded earned effort, detached completion preparation, and retry on expected capacity/geometry blockage. `construction_work.rs:construction_materials_ready` is a useful exact-lot/capacity check, but it is construction-specific. The missing native process primitive is a versioned recipe/process binding that references existing entity lots/containers, validates multiple consumed and retained lots, and performs a detached multi-owner transition; it must extend the Rust `Lot`/`Container`/transfer/output owners rather than wrap or duplicate the retained TS material state. `engine/src/sdk/work-system.ts`/`work-allocation.ts` remain scheduling consumers and must not become physical owners.

## Smallest generic process boundary

Keep recipe/stage values in `src/recipes.ts` (or the next equivalent content definition). Add one typed staged-process owner around existing material operations with data shaped like:

```text
admit(definitionId, resolvedMaterialPlan, station/container binding)
  -> process { id, definitionId, stage, progress, bindingId, enteredAt }
attend(process, contact, delta)
  -> pending | waiting(reason) | transition(receipt) | complete(receipt)
advanceUnattended(process, tick)
  -> pending | transition(receipt) | ready-for-attendance
cancel(process)
  -> released-before-first-transition | blocked-after-consumption
```

A stage definition selects `attended` or `unattended`, duration, and one typed transition operation. Transition operations are configured recipe data plus existing owner calls: consume the bound portions, retain/rebind vessels, register any finite environmental obligation, and create promise capacity in one detached candidate before publishing. The operation must never store a callback in saved state and must not accept caller-selected effort, quantities, or output identity.

The actual owner call order for the retained brew is:

```text
recipe definition -> station/material endpoint resolution
  -> existing transfer admission for each missing requirement
  -> material owner admitRecipePlan (bind exact lots/vessels/promises)
  -> attended prepare progress at validated station contact
  -> detached candidate: completeRecipePrepare + paid atmosphere release
  -> publish material + release + process stage=unattended
  -> tick-gated unattended progress
  -> detached settlement plan + material owner settleRecipePlan
  -> publish output lots and remove process
```

This boundary can express a second recipe by authored definitions and typed transition operations. It should not hardcode `prepare`, `ferment`, `keg`, `fuel`, or brewery IDs into a shared Rust kernel. In native form, the process record should bind a validated definition ID plus exact Rust entity/lot IDs; transition preparation should call the existing `world.rs` transfer/capacity and `material_output.rs` preparation/index owners, then publish all affected ECS facts atomically. The TS recipe remains content/configuration, while Rust remains the sole native custody and mutation authority.

## Required laws

- Fuel and smoke/heat obligation are one transaction: if emission admission or output capacity fails, no consumed portion, process stage, or ledger changes.
- A blocked attended transition retains the process, exact bound lots, worker/job intent, and progress; a retry does not duplicate fuel, output, or atmospheric release.
- Cancellation before the first consuming transition releases the binding and leaves staged lots available. After a consuming transition, cancellation follows the recipe definition: it cannot silently recreate consumed fuel or erase an owed environmental/output obligation.
- Fermentation survives worker release/replacement and save/reload because it is unattended process progress, not actor work. Keg/output attendance may be reassigned without resetting process progress.
- Full output is a durable waiting state. It retains finished transformation/output lots and does not consume another lot or remove the process; output actions retry through the existing material owner.
- Completion is idempotent: a repeated tick or restored command cannot settle the same binding twice, reseal a vessel twice, or duplicate output. Exact binding IDs and transformation receipts enforce this.
- A transfer supplies only the process binding’s missing requirement. No process path may clone a lot, reserve it outside the material owner, or create a brew-specific haul/cargo record.
- Save/reload validates definition identity/version, stage/progress bounds, binding existence, retained lot identity/quantity, environmental obligation linkage, and output destination/capacity relations before reattaching owner state.
