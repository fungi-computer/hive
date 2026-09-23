# Lifecycle composition contract

Architecture decision check, 2026-09-07. This is a future ecology boundary, not current runtime or upstairs scope.

## Decision

Model death, decomposition, fungal growth, and reproduction as **separate typed processes over explicit capabilities and finite materials**.
Use validated authored definitions to choose supported species, thresholds, products, and process parameters.
Keep execution in closed, exhaustive code owners; a data row may parameterize a supported process but cannot invent a verb or run an arbitrary script.

Do not build one universal birth→growth→death→decay state machine. A tree, mushroom colony, cut log, stored herb, animal, and stone do not share one valid chronology.
Do not build an inheritance tree such as `LivingThing → Plant → Tree → DeadTree → Log`; death changes capabilities and material custody rather than changing a value's class.

## Current facts and the gap

- Current oaks have stable IDs, cells, work, and `felledAt`, but no age, development, vitality, biomass, provenance, or decay state ([model](../../src/model.ts#L125), [creation](../../src/clearing.ts#L32-L39)).
- Chopping currently sets `felledAt` and creates six anonymous units in a wood pile ([activity](../../src/activity.ts#L177-L185)). `Pile` stores only ID, cell, and amount ([model](../../src/model.ts#L152)); it cannot prove which tree supplied the wood or whether remaining dead biomass was already converted.
- Mugwort already separates a plant from its harvested physical bundle. The bundle has exactly one ground/carried/stored location ([model](../../src/model.ts#L127-L143)). That is a useful custody precedent, not a general lifecycle system.
- Wood claims are promises and explicitly excluded from physical totals; after pickup, actor cargo alone owns the wood ([model](../../src/model.ts#L110-L119), [resource transfer](../../src/resources.ts#L8-L49)). Interruptions drop carried material before releasing work ([activity](../../src/activity.ts#L50-L70)).
- The fixed simulation tick advances growth before work assignment, while rendering only reads it ([step](../../src/clearing.ts#L108-L138)). Strict persistence schemas enumerate current activities, items, and jobs ([persistence](../../src/persistence.ts#L293-L370)).

The present six-wood shortcut is valid for the tiny proof. It must not become the contract for a living tree, because keeping a convertible dead tree while also emitting its complete wood yield permits duplicate material.

## Compose facts that have different meanings

### Organism identity and provenance

A living tree retains one `PlantId`, species definition, origin/lineage, germination tick, and location throughout life.
Chronological age is elapsed authoritative world time since germination. It never proves successful growth.
Accumulated development advances only under viable historical conditions and determines coarse size or maturity bands.
Vitality records health, stress, damage, and alive/dead status. A tree can age while growth stops, and can die young without becoming mature.
Reproductive readiness is another capability: it may cycle seasonally on a mature organism and is not a stage between maturity and senescence.

### Dead substrate and physical material

Death records cause and tick and makes biomass available to death-specific outcomes; it does not automatically mint portable logs.
A fall event changes standing dead biomass into a located dead-log substrate, retaining `derivedFromPlantId`, species/material identity, and an atomic input/output ledger.
A harvest may partition the same finite biomass among stump, log, branch, fruit, seed, or residue lots. Inputs must equal outputs plus named sinks, and the source portion becomes spent exactly once.
Portable material has one owner/location. A standing snag, fallen log, ground stack, carried log, stored lumber, and incorporated building material are custody states or distinct lots, not simultaneous copies.

### Fungal colony

A fungal colony is a separate organism with its own stable ID, strain/lineage, development, vitality, and reproductive state.
It references a compatible substrate; the log does not “turn into a mushroom.” Colonization creates the relationship, then fungal consumption debits finite substrate material.
Fruiting can create a new physical mushroom batch with colony/strain/substrate provenance. Removing fruit does not remove the colony unless the authored species process says so.
When usable substrate reaches its boundary, emit spent substrate with remaining material and provenance; do not silently delete the object.

## Process and definition ownership

Definitions may declare supported capabilities such as perennial development, seasonal reproduction, dead-wood substrate, fungal colonization, or authored harvest yields.
Validation must reject unknown process names, impossible references, negative quantities, missing outputs, and a species definition that asks for behavior no typed owner implements.
Typed code owns `die`, `fall`, `harvest`, `colonize`, `decay`, `fruit`, and material transfer semantics, with exhaustive dispatch like the current `Job` and `Activity` unions.
Applicability is explicit: a tree can die/fall/reproduce; a dead log can decay but cannot be killed; a fungal colony can die/reproduce but is not harvested as timber; stone supports none of these unless a real future process says otherwise.
This is capability composition with closed behavior, not a generic lifecycle framework or configuration language.

## Environment, time, and locality

Decay and fungal development read shared local moisture, temperature, and oxygen facts. They do not own private duplicate weather or water values.
The same bounded spatial queries used by perennial patches should find substrate and colonies in affected cells, including one declared owner at chunk boundaries.
The same authoritative clock schedules meaningful boundaries: death, fall, colonization, decay band, fruit readiness, and substrate exhaustion. Rendering never advances them.
On an environmental or custody change, settle the old interval through that tick, apply the change, and schedule the next boundary.
Evicted patches persist capability state, material lots, references, due boundaries, and an `advancedThroughTick` cursor. Catch-up walks ordered condition and custody changes; it cannot apply `elapsed × current decay rate` across changed moisture, temperature, oxygen, or location.
Durable outcome events carry stable IDs and source/output references so replay, save/load, and chunk return cannot repeat a death yield or colonization debit.

## Claims and jobs are hard boundaries

The resource authority settles a transformation against the lot's current location and custody. A landscape decay query cannot directly mutate actor cargo or storage by spatial proximity.
A claim is a promise, not preservation. If decay changes claimed material, the same atomic outcome must adjust or invalidate affected claims, release invalid work, and expose the new waiting reason. A reservation must not indefinitely stop decay or spoilage. Storage and treatment can alter actual environmental/process rates through supported rules.
Moving a colonized log transfers the same lot and colony relationship, then changes the environment it reads. It does not clone either record.
Felling, gathering, hauling, stacking, inoculating, and harvesting fruit become ordinary typed jobs when their real consumer exists. Passive death and decay are simulation outcomes, not invisible jobs.
Cancellation and interruption preserve the exact substrate, output lots, cargo, and claims already completed, following current transfer ownership.

## Small future proof

Use one identified tree with finite standing biomass, one fallen-log location, one fungal strain, and one authored moisture/temperature/oxygen history.
Cause one typed death and fall; assert that the standing source becomes spent and exactly one provenance-bearing log receives its material.
Colonize the log, advance through a wet interval and a dry pause, fruit once into one physical batch, and finish with a finite spent-substrate lot plus named material sinks.
During the run, reserve material for one haul, trigger a decay boundary that changes eligibility or amount, and verify that the same outcome settles the claim/job without duplicating material or freezing decay. Claim a remaining usable portion and move it once; its identity/provenance and environment must follow its actual location.
Save and evict before the dry interval, reload later, and compare against uninterrupted fixed-tick execution: identities, provenance, material totals, colony state, due boundary, claims/custody, and durable outcomes match.

This proof establishes tree→dead log→fungal colony→spent substrate composition. It does not require a universal ecology FSM, per-object render ticks, arbitrary mod scripts, a new scheduler framework, or current-runtime implementation.
