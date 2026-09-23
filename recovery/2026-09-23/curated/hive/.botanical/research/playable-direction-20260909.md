# Current plan: make the tiny clearing worth playing

Game CTO decision, 2026-09-09. Personally authored after reading production at
`bf12e99362845c16cd055f5bf877085f2425c460`, the current sprint and retained
system/game-study decisions, lab callers and numerical handoffs. Three bounded
read-only reviews checked the digging join, current economy and lab limits;
their work is returned and parked. This replaces the active sequence below,
including the stale schema-12 paragraph that still schedules plant watering.
Historical plans remain evidence. This document is a plan, not a new runtime,
hosted interaction, performance or full simulation-completion claim.

## Product outcome and actual baseline

**Build a strange little home, change the land to support it, welcome a goblin,
and use the proceeds and discoveries to improve the place.** The first complete
playtest should contain choosing, building, watching, correcting and a payoff.
The 15×15 clearing stays small. Bigger scenery cannot compensate for a weak loop.

Production already has paused shared orders, work preferences, Draft/Go, upstairs
construction, local saves, common goods/transfer custody, mixed shelves, brewing,
and one-time carried-water establishment of mugwort. Current `src/persistence.ts`
is schema 13. Delivery reports these on the existing feature preview; its release
records distinguish local interaction from hosted byte parity. No new browser
suite was run for this plan.

The important gaps are visible in source:

- `brewing.ts:attendRecipeOutput` consumes ale and records a receipt, but nobody
  receives a drink benefit or hospitality outcome. Four malt and eight water in
  `finite-sources.ts` support only two batches plus establishing their two new
  mugwort plants. There is no sustainable livelihood yet.
- `world.js` treats ground support as implicit and permits storeys 0/1;
  `view.js` draws a baked board; `camera.js` picks a selected plane. Digging needs
  real terrain, exposed faces and support queries in the playable caller.
- Beds remain ordinary route space, and the cat still chooses ground-only paths.
  The retained furniture/contact contract is relevant before overnight guests.
- `feed.js` supplies an initial demand and shelter approval. That is not yet a
  recurring physical visitor/storyteller loop. HUD guidance ends too early.

## What can be carried out of the labs

| Work | Established | Remaining game work |
| --- | --- | --- |
| World generation | Deterministic stepped geography, cave-feature and sparse-edit experiments, eviction/reload, bounded point queries; live browser World Lab | Terrain ownership in Clearing, edit-aware navigation/picking, compatible saves and a useful starting layout |
| Soil and excavation | One generated wet soil voxel removed with accounted wet spoil; real side/floor seepage; exact checkpoint continuation | Worker commands, physical spoil, connected hollows, backfill, field-to-pail units, browser terrain/render/save integration |
| Water motion | Separate shallow-water and native 2D wave reference behavior; recorded public playback | The bounded voxel-scale production model, spill/diversion and conservation across actual game edits |
| Air and heat | Recorded transport/plume experiments and narrower momentum/energy checks | Real openings, accounted fuel emissions, exposure, saved gameplay consequences and a bounded production update |
| Ecology and art | Mugwort water establishment in production; original animals, fire, foliage, brewhouse and mess studies | Environmental growth responses, physical guests/waste/animals; an art study is not its simulation |

The wet-pit experiment gained about 12.6 litres in 600 simulated seconds. It does
not demonstrate a rapidly flooding mine, connected ditches, backfill or player
digging. The full thermal reference remains incomplete and parked. Reference
restart overlays are uncompiled research. Keep all failures and accepted evidence.

## Release 1 — ground you can actually change

**Player exit:** designate a shallow pit or short trench while paused, watch a
worker dig from a safe edge, see real spoil and exposed earth, save/reload it,
and fill the excavation using actual available spoil. Publish the useful dry
dig checkpoint before waiting for flowing water; follow with backfill as a short
interim if needed. Do not call dry digging the complete environmental loop.

Deepen the existing world geometry owner. Base terrain plus durable edits owns
solid volume and exposed surfaces. Drawing, picking, build admission and movement
query it for their different purposes. A single `blocked` flag must not stand for
navigation, structural support and permeability. Editing a cell invalidates the
affected derived queries at one revision; neither the renderer nor minimap owns
terrain. The ghost, clicked face and admitted target must agree.

Use the reviewed metric: 1 m horizontal cells and 0.54 m vertical voxels; four
vertical voxels equal the existing 2.16 m storey. A shallow pit is not `level=-1`.
First work is from the rim, one voxel deep. Reject excavation beneath bodies,
active traversals, buildings, sources or loose goods until their displacement
rules exist. Backfill requires an empty, legal volume and actual material; it
cannot bury a pawn or erase fluid. Keep collapse, tunnelling and walking inside
holes out of this first release.

Dig completion settles one edit and its declared dry material yield together.
The materials owner creates/carries/stores spoil through the existing transfer
path. Establish the conversion from voxel volume to recoverable material once;
wet spoil later retains its water. Repeating a completion cannot mint more soil.

Use the same versioned terrain query/edit contract intended for generated worlds.
Existing saved clearings retain their authored flat base; loading never moves a
house onto a new seed. A generated starting patch is a later consumer, not a
reason to regenerate this map or abandon current saves.

## Release 2 — people with needs, then an inn for those people

Levi's direct correction is part of this plan: hunger, thirst and tiredness apply
to player characters and residents as well as guests. A customer cannot introduce
a one-off thirsty-guest flag. Social life is also a shared system, not a guest
approval counter pretending to be a relationship.

**First interim:** Rowan and Sedge need food, water and rest, satisfy those needs
through physical eating/drinking/sleeping, and explain their next action. Move the
current authoritative `Actor.rest` and its decrement/recovery callers into the
shared needs owner; remove the superseded representation as consumers migrate.
Add real edible starting rations and a finite replenishment route with the feature.
Do not activate hunger against a world where nothing can be eaten, or consume the
last establishment water before a player can reasonably learn the system.

**Guest interim:** a goblin with the same applicable needs physically arrives,
eats/drinks, uses a suitable bed, socializes and leaves a useful, finite barter
reward. A co-presence interaction creates a remembered reason for an opinion.
The player can inspect why the guest enjoyed or disliked the stay and improve it.

This closes the existing brewing loop before adding more production machinery.
Extend definition-owned creation and the existing actor/work owners for a guest;
do not introduce a separate guest simulation. Use the furniture-contact decision
for an exclusive bed slot, legal entry/exit and ordinary body occupancy. Apply
its geometry to bed rendering so floors and sleepers no longer disagree.

Needs describe physical state; preferences affect choices; mood summarizes current
conditions and memories; directed opinions/bonds describe relationships; hospitality
tracks a visit and its terms. Keep these separate. Guest, resident, prisoner and
human/LLM controller change access and policy, not the identity or physical needs
of the person. Need definitions declare applicable bodies, rates, thresholds and
supported satisfiers. New supported food is a definition over ordinary consumption;
a genuinely new physical effect earns a typed primitive.

Use existing work/movement/contact/material ownership for self-care and assistance.
An urgent need requests a safe work interruption; it cannot erase carried goods or
reservations. Draft suppresses ordinary automatic self-care but never freezes
physiology; display the unmet need. Hysteresis and cooldowns avoid eat/work/eat
thrashing. Update on the authoritative clock at bounded, staggered intervals,
never one timer or LLM per need. Generous early rates should support long stretches
of choosing and watching. Routine food/water/bed access should automate maintenance.

One hospitality outcome follows actual served material and completed services.
Cancelled service, a missing bed or repeated save/reload cannot award a successful
stay twice. First barter can replenish a declared finite amount of malt or useful
supplies; an arriving guest's stock is an explicit external arrival, not automatic
cache refill. Alcohol's nourishment/hydration, enjoyment and intoxication are
separate authored effects; ale is not silently the universal thirst solution.
Full money and faction politics are not required. Preserve a manual Serve action
with clear recipient/status; self-service checks the same stock and permission.

First social content is a shared meal/drink, friendly conversation, disagreement
and a visible memory. Resolve only bounded nearby opportunities with persisted
randomness and cooldowns. A shared meal requires two actual portions and compatible
places; its social success follows attendance and consumption. Relationship
values are derived from applicable memories and durable bonds, not an independently
incremented guest score. Friendship can inform a later invitation; recruitment
remains explicit. Marriage, rituals, custody and courts use these foundations
later. See the current needs/social source study in
[living-world-system-contracts](living-world-system-contracts.md).

Extend the familiar's existing guidance into real shortages and next actions:
where the pail is, why growth waits, what the next batch needs, and whether the
guest can reach a bed. Keep guidance derived from the world rather than a second
tutorial progression simulator. Offer a small starter layout as a New Clearing
playtest option only if it removes setup repetition; do not rewrite existing saves.

## Release 3 — a garden whose water you can manage

**Player exit:** collect water in a hollow, cut a short channel to move it, fill
the existing pail there, and drink, establish plants or brew with it. Then connect soil
moisture to one clear growth decision: an adequately wet bed helps; a waterlogged
bed can be worse. Add one useful food crop through the shared cultivation rules
when this replaces reliance on arrival rations; no second herb-specific lifecycle.
Good layout reduces repeated hauling rather than adding chores.

I own the water/world integration decision. Start with conservative cell/face
transfers near the actual voxel scale, finite initialized water and explicit
boundaries. Prove adjacent hollows, an opened/closed channel and overflow in the
same production module before its playable join. Outdoor hollows may explicitly
use vented atmosphere; they do not wait for sealed cave pressure.

Resolve physical units first: current water goods use positive integer portions,
while the soil reference uses kg/litres. Define the physical size of a portion and
preserve sub-portion field remainders. One atomic draw/pour operation moves water
between field and vessel; no rounding it away and no second source inventory.
Extend conservation from the old finite-spring assumption to field + pore water
+ vessel + wet spoil + declared consumption and boundary exchanges. Existing
pail/Haul/plant/kettle consumers keep their owners. Environment-fed establishment
uses the same plant transition; it must not also debit a carried-water operation.

Start updates every two/four existing 20 Hz game ticks (10/5 Hz), with bounded
stability work and slower soil updates. These are targets to measure, not achieved
performance. Cosmetic interpolation can be smoother without moving physical stock.
Choose authored permeability/rates for readable gameplay and state that scaling;
do not tune against centimetre-grid or millimetre-wave accuracy.

## Release 4 — a brewhouse that changes its indoor environment

**Player exit:** brewing downstairs warms the house but smoke can spoil the loft;
opening a high vent or changing the layout measurably improves it. Temperature
and smoke overlays explain why. A first consequence can be poorer rest, reversible
by ventilation, before adding suffocation or lethal fires.

Use the same placed geometry and explicit face/opening facts. Shelter flood-fill
currently treats doors as sealed while movement treats them as traversable; it is
not an airflow solver. Define actual door/vent state for environmental queries.
Start an ambient-backed, low-speed voxel model with stated outdoor exchange,
not an assertion of fully compressed gas or accurate chemistry. Model smoke as a
transported gameplay constituent, separate from temperature/energy.

Fuel settlement owns one finite emissions budget. Current brewing consumes fuel
at preparation completion; heat before that point requires changing the process
settlement deliberately, not silently charging wood twice. Pause, interruption
and reload preserve remaining fuel/heat/smoke budget. The room renderer only reads
conditions. This also establishes the owner later used by greenhouse heating,
compost heat, fire and dwarven vents.

## Next after those releases — depth with a reason

1. **A productive garden cycle:** redirect spent grain into one compost process
   and use the result on one crop. Add a renewable crop input or tree regeneration
   only with a real production consumer. Separate moisture, fertility and heat;
   saturated is not automatically fertile. Shared process/material/lifecycle rules
   should replace special cases as a second supported consumer lands.
2. **A useful basement:** one traversable lower room with a safe stair/ramp and
   return route, followed by a small generated cave. This earns headroom, signed
   vertical coordinates, access and water hazards. Collapse needs its own readable
   warning, support and rescue rules; it is not a surprise side effect of Release 1.
3. **A living rhythm:** a modest ordinary storyteller schedules physical visits
   and a small weather/supply complication with recovery time. A familiar chess
   match offers optional downtime play. LLM intervention, tarot recruitment and
   the visitable purple realm remain later consumers of real outcomes and travel.
4. **Expand only after home works:** start a new tiny clearing on a chosen patch
   of the existing generator, with an authored safe home site and preserved edits.
   Then earn one nearby outing and return. Keep global atlas/caves/LOD work bounded
   until that consumer needs it; no planet population or seamless multiplayer claim.

These are an ordered follow-on horizon, not parallel assignments now. Retained
forests, fungi strains, animals/beavers, food chains, hygiene, pipes/automation,
kingdoms, religion and AI players still fit the existing contracts. They do not
all become prerequisites for making the inn pleasant to play.

## Why this sequence uses the studies

RCT contributes inspecting and improving a place; RimWorld/Prison Architect/DF
contribute shared work and understandable commands; Stronghold contributes layout
and production; ONI contributes visible causes and environmental tradeoffs;
permaculture contributes persistent water/soil interventions. Diablo/Darkest
Dungeon contribute preparation and a meaningful return home once there is a home
worth returning to. Chess/tarot supplies characterful downtime later. These are
design lessons from the retained studies, not claims that all those games or their
algorithms were exhaustively studied.

## Architecture and delivery rules for this plan

Each release has one coupled production owner. Reuse `orders` for admission,
`jobs`/libcolony for assignment, `movement` for traversal, `materials` for physical
custody, and the fixed `step` for time. Deep modules own terrain edits, field
exchange, contact and outcome settlement where those decisions now lack an owner.
Definitions supply supported content. A third haul path, render-owned physics,
parallel inventory or generic framework is a failed implementation shape.

All derived views use the same world revision. Saves retain canonical facts and
strict relations; caches rebuild. Preserve current valid saves with explicit
migration at each actual schema change and raw recovery. The old v1–v6 readers
remain prohibited. Gas and water stock on a boundary need a named disposition;
chunk eviction never drains a pond or refills stock.

Review the first working source and caller before adding polish. For each release,
check cancellation, retry, pause/reload, quantities and touched spatial conflicts;
read Fallow findings on the changed modules. One short real-input trace and normal
preview parity follow. Reuse existing evidence; no repeated complete-house build
or expensive reference run. The live lab becomes a small debug view of the actual
production module when that module joins; recordings retain their honest labels.

Performance acceptance targets the actual two-resident clearing doing useful work,
with a guest and active environmental patch as introduced. Measure simulation,
field update, render/input and save cost separately. Begin with few-millisecond
field updates and check tail latency under edits; report misses rather than
claiming capacity from idle cells. Rust/WASM is available for an observed hot
kernel after measuring this workload; a language port is not a release goal.

## Custody and the next action

Levi's 2026-09-09 instruction puts this plan and returned source decisions with
Astra personally. Delivery returned the settled handoff at `bf12e99`: world-lab
released its nine-file committed slosh boundary; deconstruct-pm released the
committed ecology/main/HUD boundary; game-systems-pm has no remaining dirty docs.
Their sessions are parked and preserved. Delivery found no running proof/build/
deploy subprocess. The unrelated modified `scripts/prove.mjs` and 19 untracked
files remain untouched. Delivery explicitly released plan/docs/source decisions
to Astra and retains only Git/build/deploy until explicitly transferred. No new
runtime writer or reference simulation is launched by this planning handoff.

The next implementation brief is **Release 1, shallow editable ground**, followed
by its safe backfill checkpoint. Before a writer starts I will settle the terrain
and spoil contract against the preserved source. Subsequent lanes receive one
accepted outcome and exact files, not the whole horizon. Personal playtests after
each release decide refinements. No calendar ETA is credible before those first
working shapes; each useful interim ships independently on the same preview.
