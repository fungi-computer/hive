# Living-world system contracts

## Current needs, hospitality and social decision — 2026-09-09

Levi explicitly requires shared hunger, thirst, tiredness and later social needs
for player characters and other residents, not a thirsty-customer special case.
He requested RimWorld, Hospitality, prisoner-management and social-mod research.
Astra personally read the primary material below and the immediate Hive callers.
This expands the architecture of the planned inn release, not the current runtime.
The earlier opinion/bond/knowledge sections remain applicable.

### Findings from the actual sources

- **Hospitality** composes guest services with ordinary pawn needs. Its
  `Pawn_NeedsTracker_Patch.ShouldHaveNeed` enables joy, comfort, beauty and room-size
  needs for guests. `JobGiver_BuyFood` consults `pawn.needs.food` to determine
  priority and delegates acquisition to a job. Its author describes beds,
  entertainment, trade, relationships and recruitment. We adopt shared personal
  state plus service/access policy; we do not need runtime Harmony patching.
  [Author description](https://github.com/OrionFive/Hospitality/blob/develop/Steam%20description%20EN.txt),
  [needs caller](https://github.com/OrionFive/Hospitality/blob/6b6769769e8ed556d18f4a67606e1a1eb5d4fb30/Source/Source/Patches/Pawn_NeedsTracker_Patch.cs),
  [food caller](https://github.com/OrionFive/Hospitality/blob/6b6769769e8ed556d18f4a67606e1a1eb5d4fb30/Source/Source/JobGiver_BuyFood.cs).
- **Prison Labor** extends work assignment, schedules, supervision and prisoner
  access. Its `Need_Motivation` reads existing food/rest categories, and its food
  delivery patch skips warden delivery when the prisoner can obtain food. Those
  are separable nutrition, assistance and access decisions. In Hive, confinement
  must not create another hunger or haul implementation. Prison Labor is a useful
  candidate for Levi's remembered mod, not a confirmed identification of it.
  [Author description](https://github.com/Aviuz/PrisonLabor),
  [motivation](https://github.com/Aviuz/PrisonLabor/blob/f75a4dbcbb7d967062bf21901099484754eba88c/Source/Core/Needs/Need_Motivation.cs),
  [food access caller](https://github.com/Aviuz/PrisonLabor/blob/f75a4dbcbb7d967062bf21901099484754eba88c/Source/HarmonyPatches/Patches_Food/StopIfPrisonerCanGetFoodByHimself.cs).
- **Locks** was created to let prisoners use doors without leaving them open
  and losing indoor temperature. The important distinction for Hive is permission
  to operate a door versus the door's current physical opening. An allowed zone
  is not a wall and a room label is not ventilation geometry.
  [Author repository](https://github.com/Aviuz/Locks).
- **Dubs Bad Hygiene** explicitly adds hygiene-related needs and infrastructure;
  its thirst add-on provides drinking-water consumers. Author options support
  selecting which bodies have needs. That supports a needs applicability contract
  and shared water services; it does not mean every being must eat or drink, or
  that vanilla thirst behavior has been established by this study.
  [Thirst author page](https://steamcommunity.com/sharedfiles/filedetails/?id=2582878800),
  [author options](https://github.com/Dubwise56/Dubs-Bad-Hygiene/wiki/Mod-Options).
- **RimWorld social direction** explicitly separates changing opinions,
  relationships, context-dependent interactions, fights, marriage/divorce and
  returning people. That is a richer model than a single friendship bar.
  [Tynan's developer account](https://ludeon.com/blog/2016/01/progress-continues/).
- **Vanilla Social Interactions Expanded** has a concrete meal-together caller
  which checks appropriate food and distinct usable nearby seats, including
  reservation, danger and access. Its teaching worker weights opportunities using
  opinion and a relevant skill gap, then changes skill on actual interaction.
  This is a useful connection between social life and Hive's discover/learn/share
  direction. Readability can use **Interaction Bubbles**, whose documented purpose
  is presenting social interactions. Speech must project a settled event.
  [Meal caller](https://github.com/Vanilla-Expanded/VanillaSocialInteractionsExpanded/blob/d6541b905d28f633c8e1ac232a6e9e6a0ff434f3/1.6/Source/VanillaSocialInteractionsExpanded/GatheringWorkers/GatheringWorker_MealTogether.cs),
  [teaching caller](https://github.com/Vanilla-Expanded/VanillaSocialInteractionsExpanded/blob/d6541b905d28f633c8e1ac232a6e9e6a0ff434f3/1.6/Source/VanillaSocialInteractionsExpanded/Interactions/InteractionWorker_Teaching.cs),
  [Interaction Bubbles](https://github.com/Jaxe-Dev/Bubbles).

Read scope: selected public source/callers and author descriptions, not a running
RimWorld installation, complete game decompilation, mod compatibility test or a
promise to clone their balancing. GitHub trees were pinned at Hospitality
`6b676976`, Prison Labor `f75a4dbc`, and VSIE `d6541b90`. Some author README wording
is historical; the recommendations above rely on the named behavior, not a claim
about every current workshop release.

### Five facts with five owners

| Fact                   | Owner and rule                                                                                            | First consumers                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Hunger, thirst, rest   | Needs owner: applicable definitions, current amount, rate/threshold state and advancement tick            | Residents, player characters, guests; later prisoners/animals where applicable |
| Physical means of care | Materials and contact: actual food/water quantities, container access, bed/seat reservation and use       | Eat, drink, sleep, assisted delivery, service                                  |
| Mood                   | Derived current needs/conditions plus applicable memories; never another food quantity                    | Readable discomfort, satisfaction and later behavior weights                   |
| Social history         | Bounded memories with cause/participants/witnesses; directed opinions derived from them and durable bonds | Chat, shared meals, disagreements, trust and invitations                       |
| Status and permissions | Membership, visitor terms, allowed areas, control grants and later custody remain separate                | Resident/guest/prisoner access, self-service, work policy, AI/human controls   |

A guest joining the colony preserves the same person, needs and memories. An AI
controller changes decision authority, not metabolism. An incarcerated person
still needs the same food; a lock changes the available means of reaching it.
Food preferences/physiology are definitions or traits, not hard-coded actor names.
Goblins may enjoy a mess that humans dislike without being universally immune to
smoke, bad water or every disease.

### First implementation boundary

Current implementation decisions (Astra, 2026-09-09, after shipped digging
`449e9b8`): one schema-15 physical-care checkpoint precedes a new inn visitor.
Rowan and the already-present, unrecruited Sedge use the same applicable needs;
joining the colony preserves those values and active care. Care intent belongs
to the actor, independently of membership in a work party. The ordinary optimizer
may assign a non-member their own care; it does not thereby grant shared work or
player control. Food uses an operation-owned ordinary use transfer, while drinking
extends the existing pail operation with an actor target. No new cargo or pantry
buffer is introduced. The same needs owner credits checked material consumption
or actual reserved sleep contact. Bed reservation is exclusive between active
sleepers; a full furniture-navigation redesign is a later joined outcome.

The repaired reclaimed cache supplies six finite rations and access to the pail.
The spring budget becomes sixteen portions: the original eight plus an explicit,
once-only eight-portion care introduction. Conversion validates the complete old
schema-14 state and its original budgets first. Introduction cannot edit an old
source lot that may already have moved, consumed or disappeared, refill on load,
or bypass a pending source placement. Content definitions own these supplies;
the generic material kernel does not recognize a ration or named spring grant.
The first source review must settle provenance, capacity and historical-reader
compatibility before the rest of the migration expands.

Initial nourishment/hydration are 100. At normal speed, the authored rate from
100 to the request threshold of 35 takes ten minutes for food and six for water;
one actual portion restores 60, capped at 100. These are first-playtest balancing
choices, not real human metabolism. Existing rest starts/rates migrate faithfully;
sleep targets a recover threshold of 90. Nonurgent care begins at an idle boundary
and commits through the physical action. Draft continues depletion but suppresses
self-care. This checkpoint has no starvation death, collapse or forced undrafting.
Shortages show the physical cause and next action. Later crop/guest replenishment
remains necessary for a sustainable inn; six rations are not an endless food loop.

Migrate existing `Actor.rest`, `clearing.step` rest decrement, sleep recovery and
`routine.updateRoutine` decisions together. The new need state cannot coexist
indefinitely with an independently mutable rest meter. Keep need advancement
separate from choosing a response and executing physical work.

Initial definitions cover nourishment, hydration and rest, with a small closed set
of supported rate/effect primitives. Definitions select applicable bodies and
authored thresholds. Finite current values and last advanced tick are canonical;
UI percentages and urgency labels are derived. Comfort/recreation/hygiene can
join later without changing every actor caller. Do not build arbitrary saved
callbacks or an unrestricted needs scripting language.

Self-care is ordinary intent over the existing scheduler and movement owner.
Accessible, permitted, suitable, unclaimed food/water/contact is selected using
those owners. The same condition can be satisfied by self-service or by a caregiver
bringing the actual lot. A failed route, reserved cup or denied pantry means the
need remains unmet and the reason is visible. Work priorities do not authorize
stealing, teleporting food or bypassing locks.

The future contract is conceptually:

```text
fixed tick advances a person's applicable needs
  -> policy chooses work or one self-care intent
  -> ordinary assignment/reservations/movement execute it
  -> actual eating/drinking/contact produces a checked outcome
  -> needs apply that outcome once
  -> witnessed social/mood consequences are recorded
  -> hospitality evaluates this visit using those facts
```

This is an ownership sketch, not an invented runtime API. Item removal and need
gain must settle atomically or through one durable pending receipt; there can be
no crash/reload gap that eats a meal without credit or credits it twice. Shared
meal participants each consume their own portion. Bed rest accrues only while
the reserved contact is genuinely in use. Consumption and visit settlement have
different receipt identities and rules.

The ordinary clock is sufficient: stagger needs/social opportunity checks and
integrate changes over known ticks, with no per-agent timers. Preserve changed
rate boundaries rather than retroactively applying a new modifier to elapsed time.
Pause freezes physiology, thought decay and interaction time; admitted plans can
still change. Continue resumes paused with no offline advancement today.

Use enter/recover thresholds and minimum commitment to avoid oscillation. Normal
needs interrupt at a safe activity/edge boundary and reconcile cargo via its owner.
Draft suppresses routine self-care but not need depletion, with visible warnings;
automatic emergency undrafting or collapse is a separate design choice. Start
with forgiving, reversible consequences. Needs should create reasons to build a
working kitchen/water/bed arrangement, not require repeated manual feeding clicks.

### First social slice and later depth

Keep current mood, A's opinion of B, reciprocal bonds and organizational membership
separate. Evaluate a bounded set of nearby, awake, eligible participants. Persist
randomness and cooldowns so reload cannot reroll every exchange. A friendly chat,
an insult or a shared meal produces a memory with its actual cause and witnesses.
An attempted meal that was cancelled is not a successful communal dinner.

A Needs panel shows levels, rates and actionable causes. A Social panel shows
known relationships and reasons, with speech bubbles for actual interactions.
The guest inspector adds bed/food/service permissions and visit outcome to that
same person display. It must not hide special guest nutrition behind an inn menu.

First playable social payoff: Rowan and a goblin share food or drink, have one
conversation, remember it and carry that relationship into the next visit.
Disagreement and repair use the same memory path. Later friendship, romance,
marriage and separation add durable bond transitions; belief, titles and customs
modify expectations; teaching records actual learning; recruitment changes
membership explicitly. No meal instantly creates a marriage or transfers control.
Prisons and wardens later reuse care, access, work and social rules; arrest,
captivity/escape and court authority do not enter this first release.

### Acceptance and initial provisioning

One focused scenario must show a resident and guest using the same applicable
needs and food/water owner. Two people cannot consume the same final portion.
Blocked access requests care or reports failure; freeing it lets the existing
intent proceed. Paused reload during service, interrupted carrying, occupied
beds, a cancelled shared meal and repeated outcome delivery preserve resources,
need levels and memories. Changing guest to member never resets them.

Provide a real edible initial lot and finite water adequate for the first learning
period; budget food, drinking, plant establishment and brewing together. Current
eight-water/two-batch provisioning predates thirst. A schema migration cannot
silently invent refills; if extra starter provisions are granted, record their
explicit one-time cause. Guest barter or a real crop then supplies replenishment.
Keep unmet needs legible without imposing starvation before the player can act.

Two residents plus one guest is the first workload. Validate bounded updates and
nearby social candidates under useful work before extrapolating to 100 people.
Relations caches are derived: rebuild after load and invalidate relevant committed
changes, rather than making cached opinions a second persistent truth.

## Retained cross-system contracts

Status: Game CTO future architecture, 2026-09-07. This incorporates Levi's water/horticulture/waste, groups/zones, social relationships, royalty/beliefs and animal-ecosystem direction. It preserves the tiny-map fun gate and upstairs → brewing. None of these later systems enters the current runtime by virtue of this document. Read with the simulation/content and world-generation contracts.

The [RimWorld storyteller role](rimworld-storyteller-role-20260908.md) is the
newer bounded incident-director precedence: deterministic no-LLM everyday
direction, with occasional Shiitake interventions using the same authority,
history and pressure. Its first proof is a physical visiting party/defer, with
persistent identity and one game-owned lifecycle; it is not Sedge recruitment.

## Compose a causal world

The common chain is physical geometry → local conditions → living processes/choices → physical and social outcomes. Geometry owns a channel or opening; environmental fields own what flows through it; organisms own their growth/behavior; goods own harvested/dead material; social systems own witnessed meaning. UI, shaders and dialogue report outcomes. They never supply missing simulation facts.

Example: a beaver builds a dam from real material, changing channel conductance. Water backs up under the water model, infiltrates where soil permits, and alters growing conditions. Vegetation changes food/cover. Animals move or reproduce under their own rules. People can remove the dam or adapt their garden. There is no permanent `beaverNearby = fertilityBonus` substituting for that chain.

## Finite water in a large world — current direction, 2026-09-10

Levi reaffirmed a continuous Minecraft-style world processed by many region DOs,
including deep caves and multiple upper floors. He explicitly asked whether soil
absorbs forever and whether rivers run out. The tiny clearing qualifies local
mechanisms; it does not replace that world or prove its distributed capacity.
The following is the selected design direction, not an implemented watershed,
weather or cross-DO release.

Water moves between finite stores. A soil cell has a pore capacity, retained
moisture and permitted exchange rates. Saturated soil can transmit water when a
connected destination has room, but cannot delete an unlimited incoming supply.
Blocked drainage leaves surface water pooling or backing up. Crop-available
moisture, waterlogging, fertility and contamination are distinct facts; saturation
is not an unconditional crop bonus.

Rivers receive upstream flow, precipitation runoff and groundwater discharge.
They may flow continuously when replenishment balances discharge. Drought,
pumping or diversion can reduce flow or dry a reach. Lakes have stored volume,
basin geometry and outlets: inflow raises the level, a reached outlet spills,
withdrawal or evaporation lowers it. Groundwater storage can recharge, discharge
to streams and springs, or enter a newly connected excavation. These relationships
are consistent with the [USGS water-budget account](https://www.usgs.gov/publication/cir1308)
and [streamflow explanation](https://www.usgs.gov/water-science-school/science/streamflow-and-water-cycle).
They inform gameplay rules, not calibrated hydrology coefficients.

The common balance is `next stored = stored + received - sent`, with transfers
bounded by available stock and destination capacity. Infiltration changes custody
from surface to soil; it is not consumption. Evaporation or plant transpiration
must have a named atmosphere/weather destination, or an explicitly recorded
external boundary while that broader model is absent. Rainfall is a bounded,
dated input from that broader owner, never an unrecorded refill. A fully closed
planetary moisture cycle is not a prerequisite for the first playable rain input,
and must not be claimed by an external-input ledger alone.

World generation establishes the initial terrain, drainage connectivity, basin
identities, sea level and water stores. Subsequent changes belong to persisted
state. Loading or regenerating a chunk cannot refill a drained lake. Initial sea
level is not a rule that fills every excavated cell beneath it; there must be a
real connected water source and an accounted transfer.

Use cheap catchment and reservoir balances for large quiet areas, with detailed
voxel exchanges where shape affects play: active shores, channels, dams, gardens,
wells and caves. Oceans use large regional reservoir records; ordinary buckets
have negligible level effect without requiring a per-voxel ocean update. Their
shore exchanges still have a finite owner and quantity. Numerical representation
must preserve small withdrawals against large stores, rather than round them
away. Do not introduce an infinite sea tile or silently clamp the balance.

Coarse and detailed representations must partition one stock. Materializing a
local area allocates its water from the coarse owner; dematerialization reconciles
its committed remainder. Neither representation may retain a second spendable
copy. Catchment updates remain scheduled when unseen; camera residency is not
simulation authority. Digging, changed openings, incoming water and weather can
wake affected local work. Rates, equilibrium approximations and sampling error
need named workload evidence before capacity or timing claims.

A river can cross many simulation regions. Their shared boundary needs one
transfer identity, durable ownership while in flight, idempotent receipt and
recovery without an incoming player request. Missing or unresident neighbors are
not closed walls or ambient drains. Do not equate render bricks with DOs or require
every DO in the world to finish the same tick before any can advance. Stable
region membership, boundary versions, per-region work/storage budgets and bounded
history belong to the [world ownership contract](world-generation-and-streaming-contracts.md)
and [durable host contract](local-snapshots-and-durable-ai-jobs.md).

Actual source at `341b772` enforces finite water capacity, retention, exchange and
saved balances, and groups connected air cells into mixing bands with explicit
openings. It does not implement replenishing rivers, regional aquifer accounts,
rainfall, evaporation, or neighboring DO exchange. Goblin's finite environmental
collar currently closes its lateral/bottom water and gas boundaries. Local Region
transactions/restart evidence does not qualify world stitching; the Goblin DO
caller has not joined the separate quarry alarm/wake proof. The current public
game still owns simulation in the browser.

Finish the combined playable clearing first, including its measured workload.
The first distributed hydrology acceptance then requires neighboring regions in
that voxel world, actual boundary flow and a restart/retry with conserved water
and no duplicated effect. Later catchment/rain inputs must use those owners.
A beaver dam or irrigation channel should change storage, infiltration and
downstream flow through these mechanisms, not apply a permanent fertility flag.

## Water, heat and atmosphere: retained first numerical experiments

Use conserved quantities and explicit connections before a detailed chemistry model. Candidate first water prototype: a small finite-volume surface-cell graph with terrain elevation, cell area, water volume and opening/channel conductance. Water-surface height derives from volume and geometry. Flux proposals read the same old state; apply balanced deltas only after shared source/destination limits are resolved. This is an experiment to validate, not a selected Navier–Stokes, groundwater or pressurized-pipe solver.

```ts
function waterSubstep(region, dt) {
  const proposed = proposeEdgeFluxes(region.previous, dt);
  const limited = capByDonorStockAndReceiverCapacity(proposed);
  const balanced = quantizeWithAccountedRemainders(limited);
  applyEachEdgeOnce(region.next, balanced); // donor -= q; receiver += q
  settleExplicitSourcesAndSinks(region.next, dt);
}
```

Limit total outgoing flux per donor, not each edge independently; four neighbors cannot each take the same last unit. Resolve total incoming capacity too. A conservative first limiter can ignore capacity freed by simultaneous outgoing flow, favoring correctness over throughput. Rounding assigns residuals deterministically without creating/destroying water. Edge ordering, dt/substeps, stability, maximum throughput and equilibrium tests are part of the solver contract. An arbitrary per-frame lerp is not physical transport. Do not promise incompressible realism or pressure propagation from this prototype.

Connections have stable IDs, endpoints, aperture/conductance and boundary revisions. Count an edge once across a chunk border. Closed barriers block the relevant transport; a drawn cutaway does not open them. Ponds can fill, spill, drain and remain changed after save/reload. There are no infinite source tiles unless explicitly authored as an external reservoir with a visible source ledger.

Infiltration debits surface water and credits soil storage. Percolation credits an aquifer/basin account, evapotranspiration credits an atmospheric/external sink, and outflow goes to a named downstream account. Stored water, hydraulic head, nutrient mass and contamination are separate. A groundwater recovery model can begin at catchment scale with explicit coefficients/storage; it is not proven by wet soil changing color. Weather is an external forcing input with recorded epochs and volumes/energy, not a new noise sample that refills every cell on load.

First heat/smoke experiment remains the accepted two-level fire → smoke → opening → vent → exposure. A finite-volume air-cell/compartment graph is a candidate: thermal energy and heat capacity determine temperature; smoke amount and air volume determine concentration. Fixed-volume dilute smoke is a declared approximation, not complete gas pressure/oxygen chemistry. Choose vertical exchange/convection and boundary supply explicitly. Energy transfers through walls/exchangers without automatically transferring material. If a room aggregate is used, it is a representation of the same state with conversion laws, not a second room-temperature authority competing with cell fields.

Fire consumes accounted fuel and creates authored heat/smoke/ash outputs. Oxygen demand, ignition thresholds and spreading require their own next experiment. A heat spell feeds the same energy owner; a purple flame graphic does not imply a different chemistry. Greenhouses read sunlight, heat loss, ventilation, water and species tolerances from these fields. An inspector must explain overheating or poor growth through those actual inputs.

Early irrigation uses gravity channels, terraces and cisterns. Later pipes have segment capacity/connectivity and powered pumps; a covered pipe can occupy a declared shallow utility position in a ground cell while cover remains separate. Expose/repair/remove/cover are work over the same pipe identity and contents. X-ray is a view of those records. Pressure networks, venting, contamination transfer and failures must be tested before claiming pipes simulate all water physics.

## Waste, compost and productive horticulture

Surface mess is an owned quantity/condition at a location. Cleaning transfers recoverable solids/liquid into a real vessel or specified disposal sink and leaves any declared residue. A decal is the visual projection, not the waste inventory. Filth and odor/comfort effects can be lighter abstractions, but their relationship to physical waste must be documented. Goblin preferences can differ from human preferences without granting universal toxin/pathogen immunity.

Separate collection, separation/grinding, storage, transport, biological processing and heat exchange. Compost processing consumes defined feedstock/moisture/gas inputs and yields transformed material, heat and emissions. Direct compost-process air carries its constituents into a greenhouse; a sealed exchanger transfers energy to a different circuit without transferring those constituents. Pumping requires an explicit source/cost. Treatment changes tracked properties at defined rates; it does not toggle all wastewater instantly potable.

Horticulture data should expose requirements and outputs: temperature/light/water/nutrients/substrate, growth/fruiting stages, stress and reproduction parameters. Start with one new process consumer at a time. A tree, herb, fungal colony and animal can use the same clock, quantity and condition-query primitives while retaining different life stages and behaviors.

Persist a living instance's species/strain, chronological age, developmental stage/progress, vitality/stress and provenance separately. Age alone does not imply maturity or death. Environmental changes integrate progress up to the change tick before changing rates. Growth consumes authored resources or credits explicit external sources; it is not free biomass generated by loading a texture. Death atomically retires the living process and credits authored product lots or a substrate ledger with balanced quantities/provenance. One tree may yield several lots; an identity retained as dead substrate has a typed state that no longer participates as living. Reconcile any biomass claims in that transaction. Fungi are distinct organisms using that substrate; mushrooms do not become a stage flag owned by the log. Decomposition has accounted products/sinks and can invalidate material claims.

Propagation declares its mechanism: a clone can preserve donor strain under the recipe/skill/conditions; sexual seed creates an offspring identity/genotype from parent provenance. Grafting retains rootstock and scion identities/provenance as a compatible attachment on one persistent plant; it does not globally unlock every fruit tree. New daily mushroom batches may have newly seeded traits; established stored strains retain their effects, and a cultivation recipe explicitly states whether it clones or generates offspring. Sampling and publication reveal knowledge, not change the mushroom's effect on identification.

## Animal ecosystem and local extinction

Use species definitions for diet, habitat suitability, movement, reproduction and behavior capabilities. Predators, prey, grazers, scavengers and engineers are combinations of supported roles, not a separate simulation for every species. A donkey's pack capacity, cow's milk process, sheep's wool and chicken's eggs use the same goods/work/knowledge interfaces as other production, with real animal/food/condition constraints. Taming, ownership, training, allowed areas and relationship bonds remain separate facts.

Near interacting people, materialize identifiable animals with actual location, state and behavior. Predation/hunting uses ordinary movement/action/physical outcome rules. Animals choose goals through bounded species policies, not an LLM per animal and not a full scan of every prey on the planet. Spatial habitat/neighbor queries narrow candidates. A fence is topology; an allowed area is management guidance/policy and needs an explicit obedience/escape interpretation.

Distant ecology may use **cohorts**: species/strain, age/sex classes where relevant, count, habitat region, condition and committed progress. This is a proposed coarse model, not a claim that coarse counts reproduce every individual encounter. Its births, deaths, food consumption and migration use explicit bounded updates and declared approximation rules. Population cannot simply grow to a noise-derived maximum each visit.

Materialization is a transaction at a shared known habitat/history frontier: debit a cohort partition and create that many identified active animals using a persisted seed/counter. Partition exact count and sufficient age/sex/condition/reproductive statistics plus already accrued food/water effects; do not reset them to species defaults. Dematerialization merges the same sufficient state only for eligible anonymous wildlife with no durable external references. It cannot erase a named, tamed, injured, hunted, carried, pregnant-if-modeled, bonded or claimed individual. Such animals remain persistent individuals even when not rendered. Aggregate migration between habitats debits/credits once; loading adjacent chunks cannot spawn the same cohort twice. Individual and coarse representations cannot both consume the same food or count the same animal. Distant deaths credit a coarse carrion/nutrient account or an explicit scavenging/decomposition sink instead of simply disappearing.

```ts
materializeWildlife(tx, cohortId, count, habitat) {
  const cohort = tx.populations.requireAvailable(cohortId, count);
  tx.history.requireSameKnownFrontier(cohort, habitat);
  const sites = tx.habitat.requireLoadedSafeSites(habitat, count);
  const identities = tx.populationSeeds.reserveDraws(cohortId, count);
  const partition = tx.populations.partitionAndDebit(cohort, count);
  tx.animals.createFromPartition(partition, identities, sites);
}
```

Distinguish local absence/extirpation (no local individuals/cohorts) from reproductive nonviability (animals remain but no modeled viable breeding stock). Derive both at a stated habitat boundary and committed tick; neither is a free-standing mutable extinct flag. Recovery requires actual reproduction or a recorded migrant source. Regional extinction can persist when neighboring populations are gone or routes/habitat are unsuitable. Do not promise global extinction semantics without a bounded world population registry. For the player, surveys and sightings supply confidence/last-seen information; the UI should not expose omniscient population counts through fog unless it is an explicit debug view.

Predator-prey balance needs damping, refuges, bounded reproduction, food limits and migration conditions chosen through a small ecosystem experiment. Avoid a single global predator/prey equation pretending to explain every local event. Testing must expose overshoot/collapse as well as recovery. A player may overhunt; clear evidence and response options make that a readable consequence rather than an unexplained despawn.

First animal proof: one bounded habitat, one prey species, food/water, harvesting/death, reproduction and immigration from a real neighbor account. Show local depletion and recovery with conservation through reload/materialization. Add a predator afterward. A beaver then supplies an engineering consumer of the already-proved water/topology/resource rules. This is several later slices, not a farm/predator/fluids release bundle.

## Work groups, zones and a castle that runs itself

Levi's king example establishes a new architectural requirement. Organization, household, travel party, work group, work zone and movement restriction are different records. One person can remain king, belong to a household and travel in a party while changing work-group assignment. None of these display labels automatically grants command authority or land ownership.

First future work-policy model: one active ordinary-work group per actor, with named policy defaults. Other memberships may exist socially but do not silently merge scheduler policies. Personal Work settings refine the group. A group forbid cannot be overridden by checking the personal box. Supporting multiple simultaneous work policies later requires an explicit precedence model and inspector.

Policy precedence is explicit: physical/topology/capability/ownership authorization are hard gates; active group allow/zones define ordinary offers; personal settings can narrow eligibility and adjust priorities within those offers. Belief/title rules declare whether they contribute preference, priority, refusal or an actual authorization prerequisite; they cannot silently promote one into another. Direct/emergency commands carry named override scopes for selected soft policies only. Use `ZoneConstraint = unrestricted | unionOf(nonemptyZoneIds) | nowhere`; an empty list is invalid, never an ambiguous shorthand. Within each location category the named zones form a union; work/source/delivery/travel constraints all apply to their respective stages.

```ts
type WorkPolicy = {
  allowedTypes: WorkTypeSet;
  priority: PriorityTable;
  workZones: ZoneSet;
  sourceZones: ZoneSet;
  deliveryZones: ZoneSet;
  routineTravelZones: ZoneSet;
};
effectiveEligibility =
  capability &&
  personalAllowedWork &&
  groupAllowedWork &&
  allowedWorkAndTransferLocations &&
  reachableUnderCurrentTravelPolicy;
```

The Castle Household can exclude forestry entirely and allow castle service/research inside its area. A forester group cuts outside; a hauling group bridges forest and castle through allowed stores. A local workbench does not authorize the king to walk to a distant ingredient pile: each pickup, work and delivery stage is checked. Work location and travel are separate, so a social visit to the inn need not expand ordinary work eligibility.

Policies filter offers before expensive path/matching work. Scope job indexes by group/work capability/region; this provides both sensible behavior and fewer candidate pairs. A forbidden job remains available to other eligible groups. Work inspector shows the exact refusing rule and stage, such as “Castle Household excludes Forestry” or “pickup outside allowed source zones.” Policies that leave work uncovered should be visible; do not silently ignore a prohibition to keep throughput high.

Zones are versioned spatial predicates with level/volume meaning. Compile only resident-region membership masks/indexes; do not allocate a planet-sized boolean grid. Reassigning a person or editing a zone invalidates relevant offers/routes. An active worker reaches a safe interruption boundary and reconciles cargo/claims through existing custody; a policy edit cannot teleport or delete a delivery. Physical barriers, action authorization and safe resource settlement remain hard constraints.

Direct orders/Draft/Go can explicitly override ordinary work preferences under a named policy and visible result. They cannot override physical impossibility or another owner's permissions. Emergency flight has a documented exception to routine work/travel zones, with one interruption disposition; it is not a random scheduler loophole. For restricted animal areas, choose whether they are a steering preference or enforceable path rule; fences are still the real barrier.

Useful reference findings: Fluffy's [Work Tab](https://github.com/fluffy-mods/WorkTab) demonstrates finer tasks/priorities/schedules and warns about deadlocked priorities; [Better Pawn Control](https://github.com/voult2/BetterPawnControl) demonstrates named bulk policies; [Colony Groups](https://steamcommunity.com/sharedfiles/filedetails/?id=2345493945) is a mod example of grouping. These are design references, not verified current installation recommendations or evidence vanilla Rimworld supplies Hive's proposed stage-aware work zones.

First proof: a king and forester, one castle/forest/staging store, opposite policies, actual work/haul outcomes and readable rejection reasons. Edit a zone mid-haul, issue a direct Go, and exercise one safe flight/interruption. Only later include those policies in the 25/50/100-actor benchmark. Policy functionality does not itself prove population capacity.

## Small interactions, relationships and households

Use sparse **directed opinions** (A's view of B), durable **bonds** (relationship commitments), **memories** with witnesses/provenance, and separate household/organization membership. Choose opinion as a derived/cached projection of applicable memories and durable bond summaries, invalidated when those facts change; do not independently accumulate a second sentiment value. Mood is a bounded derived condition from applicable memories/needs, not the social graph itself. Anger can affect behavior decisions through named policies; it cannot directly corrupt an assignment or erase custody.

Create social opportunities from real co-presence: shared meals, work, care, travel, rituals, hospitality and significant events. Use spatial/household/party indexes and staggered fixed-tick opportunities. Sample a bounded number of eligible interactions with persisted randomness and cooldowns. Do not scan all pairs every tick, and do not generate a paragraph for each pawn every frame. At 100 actors, sparse meaningful contact is a better design than artificial universal awareness.

```ts
resolveInteraction(tx, opportunity) {
  tx.social.requireCurrentParticipantsAndContext(opportunity);
  const outcome = socialRules.resolve(opportunity, tx.random.forCause(opportunity.id));
  if (outcome.requiresPhysicalAction) {
    return tx.intents.enqueueOnce(outcome.intent, opportunity.id);
  }
  tx.social.applyDirectedMemories(outcome);
  tx.social.applyExplicitBondTransition(outcome);
  tx.facts.recordWitnessed(outcome);
}
```

The immediate branch settles conversation-only social facts. A fight, meal, ceremony or departure requires a later typed physical action and real activity/time. Attendance, injury, consumption and their witnessed memories follow committed physical results, not the initial proposal; a failed feast cannot create memories that everyone ate. Remote letters or telepathy require an explicit medium/channel and delivery outcome rather than bypassing the opportunity rule. Conversation text/bubbles project settled outcomes. Optional LLM dialogue can personalize phrasing within known facts; it cannot create a marriage, debt, insult penalty or promise solely by saying it happened. A player's explicit conversational action still goes through typed admission.

Friendship can make recruitment more likely under authored terms; invitation remains separate. Marriage/proposal/consent and ceremony are explicit bond/event transitions. They can produce preferences for a shared household/bed, attendance work and witnessed memories. They do not transfer property, inventory or control of a spouse. Divorce, estrangement or household moves change the relevant bond/preferences, not the person's identity. Travel retains those identities and references; leaving a map does not reset relationships.

Keep recent memories bounded by retention/decay policy, compacting into sufficient summaries only where future rules can still be evaluated. Enduring bonds, parentage when modeled, debts and offices are separate durable records and cannot vanish because a presentation log rolls over. Opinion/history is filtered by permission and witness knowledge. Factions learn through members/reports, not every global event automatically.

Reference boundary: Ludeon's [social-system post](https://ludeon.com/blog/2016/01/progress-continues/) establishes opinions, interactions and relationship events; [Hospitality](https://github.com/OrionFive/Hospitality) connects guests and recruitment; [Interaction Bubbles](https://github.com/Jaxe-Dev/Bubbles) surfaces existing social logs rather than owning social simulation. Version/DLC/mod compatibility is not claimed. First Hive proof should be one co-presence interaction, disagreement and repair, then an explicit recruitment opportunity. Marriage is a follow-on bond/ceremony consumer.

## Titles, offices and belief as typed policy inputs

Keep these distinct: title/honor bestowed by an issuer; office with appointment/duties; territorial ownership/control; belief affiliation and conviction; work-group policy; action/AI capability grant. A king title can create social expectations without granting universal server privileges. Belief can change preferences without automatically changing faction allegiance. One group may contain several beliefs.

Belief definitions can declare typed preferences/precepts, ritual definitions, role eligibility and knowledge/food/apparel expectations. Each declaration names the existing consumer and its kind of effect: preference, mood consequence, refusal, role prerequisite or ritual condition. Do not make an arbitrary string precept rewrite every domain. Resolve policy precedence in an inspector; explicit inability/authorization, work-group forbids and personal preferences have different meanings. Initial implementation should support a tiny vocabulary, not all possible theology.

Rooms provide common queries for size, shelter, furnishings, access and quality. A throne-room expectation, wedding feast and shrine ritual query that owner. Items such as formal clothes, books, instruments and relics use ordinary custody/quality. A religious food preference reads the actual meal definition; serving a disliked drink can become a witnessed social event. Ritual attendance is scheduled work/activity with capacity/material/time, followed by one settled outcome.

Titles or offices may issue a scoped service entitlement: issuer, beneficiary, allowed service, cost, uses/cooldown and expiry. This is a gameplay record. Invoking it still requires ordinary player/AI command authority and the service's physical prerequisites. Honor is not an API permission token. Magical training can use a finite focus resource, study/meditation activity and learned technique; social status does not bypass resource settlement.

Belief reform, conversion and office changes create new explicit state/version transitions; they do not retroactively rewrite memories or running ritual semantics. Relics are unique physical items with provenance, so a shrine cannot duplicate one to satisfy two ceremonies. Contested land/office, arrest and later courts are typed applications of membership/permission/commitment and physical custody rules. They are not a replacement for those foundations.

Sources: [Royalty launch](https://ludeon.com/blog/2020/02/rimworld-free-update-1-1-and-royalty-expansion-released/), [meditation update](https://ludeon.com/blog/2020/05/update-may-2020/), [Ideology](https://store.steampowered.com/app/1392840/RimWorld__Ideology/) and [mixed-ideology development](https://ludeon.com/blog/2021/09/update-1-3-3117-makes-multi-ideoligion-colonies-more-viable/). We borrow interlocking roles/preferences/rituals, not a claim to reproduce every title restriction or current balancing table.

First belief proof: two residents with differing preferences attend or decline one ordinary feast, producing readable memories without duplicating food/work. First title proof later: one appointment, one room/duty expectation and one bounded entitlement with ordinary authorization. Full religions, noble hierarchies and courts are separate later content, not one overlay milestone.

## Knowledge, magic, tarot and the otherworld

Knowledge subjects, practical skill and physical media use the same distinctions for brewing, horticulture, animal care and magic. A book's text/technique references are versioned; reading grants recorded learning through work, practice changes skill, copying creates a physical medium with provenance/cost. A recipe can require both knowledge and available equipment. Tech tiers are eligibility gates over demonstrated prerequisites, not a global boolean set by owning an advanced item.

Spell definitions compose a bounded delivery type, typed payloads, finite costs and presentation. Persist rolled modifiers. Check compatible components and effect/recursion budgets at assembly; revalidate physical targets at execution. Water transfer, heat, displacement or social influence call explicit owners and expose their outcomes. A new psychic influence rule needs its own typed social semantics and authority; a text prompt cannot invent a new effect. Infinite multiplier loops and replayed cast IDs must not mint energy/items.

Chess is optional, interruptible and has its own match/rules state. A completed match produces one outcome; a reward settlement may grant a card, lead or relationship consequence through existing owners. A card use creates/reveals a persistent encounter, subject to its consumption/cooldown policy. A powerful figure may arrive or be created once, then decide whether to join under separate terms. No universal rule says every card is consumed, every match pays currency or every summoned being is loyal; those remain content decisions.

The visitable purple realm is a distinct space, initially under the same authority/clock as home. It can host wizard/Devil/familiar encounters, magical learning and unfamiliar ecology. A portal site owns persistent endpoints/access, and transfer preserves the same people and eligible possessions exactly once through the normal custody transaction. Job-bound deliveries are resolved at the source. Unattended field/network/commodity flows through portals are disabled unless an explicit transport rule is later proven. Names, character style and fiction remain original.

## What makes this achievable

Depth comes from a bounded set of shared, observable rules. Each new species, belief, recipe or encounter should reuse most existing owners. Accurate whole-planet per-organism physics, unlimited recursive spell effects and unconstrained AI decisions are not commitments. Distant approximations need stated conversion/conservation rules; capacity claims need measured workloads.

The release discipline is one new consumer with a persistent useful consequence: a drink, a working water route, a taught technique, a changed relationship or an animal population response. Parallel research/art/independent substrate work can continue, but the coupled economy/ecology does not receive ten systems at once. Readability, fairness and a satisfying small home remain product constraints on simulation detail.
