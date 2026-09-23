# Brewing readiness reconciliation — 2026-09-08

This is a readiness correction, not an executable recipe. The accepted order is schema-v7 closure for wood and mugwort first, then brewing as a consumer of the shipped material/transfer owner (`architecture-proof-sprint.md:22,43,56,62-64`; `unified-work-algebra-recut.md:196-203`). Current dirty `materials.ts`/`model.ts` are candidate evidence, not accepted runtime.

## Corrections to the old brief

1. **Batch cannot own live ingredients.** The old brief gives a batch “ingredient lots, finite quantities, owner/location” (`brewing-first-workstation-ready-contract.md:19-22`). That would copy the physical truth already owned by `ItemLot.location` and `ItemLot.quantity` (`model.ts:11-20`). **Replace with:** before transformation, exact lots remain located in the vessel and transfers remain the only incoming promises. Preparation atomically consumes admitted portions into a transformation ledger bound to the vessel. A process record may retain stable ID, pinned recipe/version, stage/progress, vessel reference, provenance ledger and completion identity; it must not retain a second live lot location or quantity.

2. **Do not assume one-batch capacity or a free keg.** “Capacity of one batch,” “kegged/ready,” and “exactly one physical keg” (`old brief:19,27-32,64-67`) exceed settled design. **Replace with:** a chosen finite vessel capacity gates staging and process admission. Completion occurs once into one defined output lot in vessel custody. A portable keg exists only if its definition and attainable finite input/existing container are selected; otherwise output remains withdrawable or serveable from the occupied vessel. Station teardown initially blocks while staged inputs, a running process, or output remains.

3. **Remove brewing-specific haul activities.** The old “ingredient pickup/transfer” and “kegging” activity variants (`old brief:37-43`) risk a third transport path. **Replace with:** recipe `supply` uses the common reserve/pickup/deliver/interruption owner; later storage or serving uses ordinary transfer. Brewing adds only typed preparation work and an unattended process primitive. `BeerCargo`, beer claims, pickup-beer branches, and direct lot writes reject the implementation (`unified-work-algebra-recut.md:82-103,201`).

4. **Split durable commits.** The old brief makes work completion settle inputs, batch, occupancy and job together (`old brief:42-43`). **Replace with:** each transfer settles separately; preparation atomically transforms staged portions and starts the process; the worker is released; the authoritative fixed clock advances it; completion mints output once in the same vessel. Cancellation preserves delivered untransformed lots and cannot rewind a running process (`unified-work-algebra-recut.md:176-183`). Do not add power-loss behavior; fuel is only a finite recipe input if selected.

5. **Save wording is stale.** The old “next schema” from v1-v6 (`old brief:54-62`) now conflicts with the mandatory coupled schema-v7 material migration. **Replace with:** finish and accept v7 first. Delivery has authority to name the later brewing save version and migration and does so below. Persist pinned recipe/plan identity, vessel/process stage and progress, consumed provenance ledger, and idempotent completion/output references; rebuild derived capacity and query indexes.

## Settled finite first-brew contract

Delivery settles the following first playable recipe. This is the implementation handoff after accepted v7 material closure and the bounded mixed-storage/withdrawal slice; it is not permission to add regional water, grain farming, trade, caravans or a generic crafting framework.

### Attainable physical inputs

The normal authored clearing contains one **ruined brewer cache** whose contents and IDs exist at clearing creation and never regenerate. Opening it is not free: repair consumes **2 wood** through the common construction-supply path and takes **24 attended work ticks**. Repair exposes four units of malted barley, one reusable barm crock, one empty four-serving oak keg and one reusable two-unit wooden pail. Tests and browser proof must use this ordinary source; they may not inject ingredient or package lots.

One visible spring contains **8 units of potable-for-this-recipe water**. The pail is the only first-slice carrier, holds two units and transfers water through the common custody/reservation path. Drawing decrements the spring; there is no recharge, groundwater, pipe or hidden fluid source. Existing chopped wood supplies construction and fuel. Existing harvested mugwort supplies flavouring and is not fermentable grain. The cache supports two batches of malt, the spring supports four batches of water, and the single keg limits portable output until it is emptied.

The cache and spring are authored onboarding sources, not claims about the future economy. Later malting, grain crops, wells, trade and container manufacture must replace or extend them through separate accepted loops; their absence cannot be hidden by refilling these sources.

### Station and capacity

The first workstation is one ground-level **brew hearth** occupying a 2×2 footprint, matching the accepted 1.42×1.32 hearth/vessel composition. It costs **6 wood** and **48 attended build ticks**, has one reserved front work slot and one side supply/access slot, and admits one batch at a time. It owns four explicit destinations:

- kettle: capacity 5 ingredient units, accepting water, malted barley and mugwort;
- hearth: capacity 1 wood fuel;
- culture slot: exactly one barm crock, claimed but not consumed;
- package slot: exactly one empty keg, preserving that container's identity.

The separately accepted hollow-kettle art is the future shared art source for the brewhouse and standalone study. Liquid, fire and paddle read actual process state; steam is noninteractive. The existing closed fermenter remains sufficient. Art parts are not selectable entities and do not define physical capacity or access.

### `herbal-ale-v1`

The pinned recipe consumes **2 malted barley + 2 water + 1 mugwort + 1 wood fuel**, requires the one barm crock as a non-consumed catalyst, and requires the empty keg before preparation starts. Common transfer stages every source lot; brewing adds no pickup, carrying, keg-haul or storage branch.

An assigned brewer performs **40 fixed preparation ticks**. Completion atomically consumes the staged portions into one process ledger bound to the station, records exact source provenance, claims the barm and keg, lights the hearth and releases the worker. Fermentation then advances for **240 committed fixed ticks** without a worker. Pause freezes it; restore resumes from the exact saved tick with no offline progress. The player can send the brewer to ordinary work while fermentation advances.

After fermentation, **20 attended kegging ticks** settle exactly once into the same keg ID: four physical `herbal-ale` servings in that keg plus one physical `spent-grain` unit in the station's one-unit by-product tray. This explicit transformation ledger accounts for consumed water, malt, mugwort and fuel; it must not pretend output-unit counts are conserved input materials. Admission reserves empty output/by-product capacity. If that capacity is invalidated, the batch remains visibly ready-to-settle rather than deleting or duplicating goods.

The filled keg is an ordinary portable container and can be moved through the common transfer owner to a mixed shelf whose accepted capacity policy can actually hold it. A **Tap keg** job takes **12 attended ticks**, consumes exactly one serving and records the named drink event; it adds no invented mood, hunger or medical effect. After four servings the same keg becomes empty and reusable. There is no sale price, passive income or infinite tavern stock in this slice.

### Cancellation, teardown and persistence

Before preparation commits, canceling preserves staged lots and releases claims through ordinary transfer teardown. Interrupting preparation preserves its work and exact staged inputs. Once preparation commits, cancellation cannot reconstruct ingredients; unattended fermentation continues on the world clock. Drafting or path failure affects only active worker obligations. Station removal is blocked while it contains staged inputs, a process, claimed culture/package, ale or spent grain.

Brewing writes schema v8 and reads valid v7/v8 only; v1-v6 slots remain invalid and retain raw-download/New Clearing recovery. The eventual implementation must persist pinned recipe/version, station/process stage and ticks, exact provenance/consumption ledger, catalyst and keg claims, by-product/output identities and idempotent settlement receipt. Derived capacities and work queries rebuild after atomic validation.

### Bounded acceptance trace

In a normal clearing, earn wood; repair and empty the finite cache through common transfer; build the 2×2 station; harvest mugwort; draw exactly two water in the pail; stage every input and the empty keg; perform preparation; assign the brewer another ordinary job during fermentation; pause/save/restore at an exact intermediate tick; finish and keg once; store the filled keg on an admitted mixed shelf; tap one serving; then verify source depletion, remaining three servings, reusable barm/pail, physical spent grain and per-material/process conservation. A full shelf, blocked work slot, interruption and teardown must leave every identity in exactly one valid location with a readable reason.

The dependency gate remains accepted common transfer closure for both current consumers, including mixed storage and stored-wood withdrawal. Brewing may add recipe/process/container definitions and the two work stages above, but no third haul owner, arbitrary callbacks, second scheduler, free fixture stock or duplicate commodity state.
