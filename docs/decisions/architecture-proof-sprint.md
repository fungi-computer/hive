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

## What the first playtest should feel like

The first ten minutes should offer a useful place to dig/build, an understandable
food/water/rest decision, visible work progressing and something the player can
finish or improve. A complete two-storey house is not the entry fee for seeing a
payoff. A first meal/drink and growing plant can land before a full inn does.

By roughly half an hour, aim for preparation, one physical visit, an understandable
problem or preference to address, a remembered social outcome and a reason to
improve the next visit. Those times are pacing hypotheses, not an enforced raid
timer. Fermentation and ordinary work leave room to plan, inspect the garden and
socialize; later chess adds optional play during that downtime.

After each release, judge whether Levi can identify the shortage without us
explaining it, make a layout or policy choice that changes the result, correct a
mistake, and return to a useful saved world. If the answer is no, correct that
slice before adding another obligation or a larger map.

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
files remain untouched. Levi then explicitly requested all-work takeover and
native Codex implementation. Delivery acknowledged release of Git/build/proof/
browser/deploy custody too; Astra is sole integrator. Native Terra core and controls
writers plus a read-only Sol reviewer are active on digging; Astra owns terrain
geometry/art and integration. No reference CFD simulation resumes.

The next implementation brief is **Release 1, shallow editable ground**, followed
by its safe backfill checkpoint. The first contract is authored flat terrain plus sparse removed voxels, each
0.54 m deep; one removed voxel yields one ordinary soil unit representing that
recoverable volume. Backfill uses the same materials/transfer owner. Subsequent lanes receive one
accepted outcome and exact files, not the whole horizon. Personal playtests after
each release decide refinements. No calendar ETA is credible before those first
working shapes; each useful interim ships independently on the same preview.

## Historical sprint decisions retained below

The following 2026-09-08 and older sequences are superseded by the current plan above.


## Current sprint: a small home worth returning to

Game CTO reviewed direction, 2026-09-08. This section supersedes the historical section and evidence retained below. It is sequencing direction, not a new source, proof, deployment, cost or deadline claim. Delivery's exact revision/release records establish what is playable.

**Outcome:** on the deliberately tiny map, the player can confidently place and inspect things, organize real supplies, make an honest brew, leave people working, and return to a useful result. A separate responsive map lab proves future geography without making a larger world the substitute for a satisfying home. Ship coherent improvements on the same preview as each becomes ready.

Current Delivery checkpoint `48dced7` has shipped the strict schema-12, repeatable
herbal-ale loop on the feature preview: finite inputs, station construction, pail
fill, preparation, fermentation, kegging, four attended servings, spent-grain
clearing and a second batch through the same physical custody. Serving currently
records a durable batch receipt but grants no personal inventory or needs effect.
The next coupled consumer is one-time mugwort establishment by carried water; it
does not wait for regional fluid simulation. The same checkpoint publishes the
recorded native gas/heat playback lab with explicit non-live labels. Levi's newer
Game CTO water, gas/heat and world-generation work remains isolated under
`.botanical/research/environment-round3-20260908/GOAL.md`; those experiments are
not retroactively represented by the older public recordings and do not expand
the live clearing or tracked physics runtime.

### Preserve current work and name its limits

Continue the existing controls/visual-geometry/picking correction and independent responsive World Lab work with their current writers. This reconciliation does not reopen the stopped upstairs house-building marathon or move active authors. Selection, persistent designation, direct orders, Draft/Go, level controls, view occlusion and physical contact remain distinct decisions. The intended click, preview and submitted target must agree; transparent sprite padding cannot intercept distant ground.

The retained Maps baseline describes diagnostic overview/local views sharing a geography recipe. A candidate worker or navigation diff is not hosted evidence. Keep exact selected-cell inspection distinct from approximate overview samples, signed coordinate and chunk-order invariance, bounded cancellable generation, stale-result rejection and explicit buffer ownership. World Lab neither owns the playable clearing nor overwrites its save.

The actual-clearing minimap remains a small independent consumer at the next safe HUD/camera handoff: show real people, structures, selected level and camera extent; click recenters the camera without jobs or ticks. Do not give it a second generator or duplicate game state. Loaded terrain is not discovered knowledge. Later committed edit/tombstone → decoded-data eviction → regenerate/reload is a separate lab proof; actors/cargo crossing live chunks remains deferred behind tiny-map playability.

### Audit and consumer precedence

The accepted `u1567` Fallow run was a stable dirty-worktree scan, not a clean
`071a59e` audit. Preserve its scan-vs-HEAD distinctions, finding counts and
static-estimate labels; exit 0 is not a no-findings claim. The next landable
schema-v7 migration is coupled: after the isolated helper, migrate **both wood
and herb** transfer branches and validators, never an herb-only durable
intermediate. Keep materials laws in the ordinary required test command when
the runtime joins.

The brewhouse remains isolated authored art with local served interaction and
verified hosted HTTP byte parity; that is not a gameplay/build claim. Mixed
storage is complete only when stored wood can withdraw into ordinary
construction through the same owner. Bed contact stores provider, slot and phase
only, never a movement path or `leg`; Go waits or rejects while contact clears,
and historical overlap/egress remains proposed. The dead brewhouse bake anchor
and needless factory exports are separate narrow future cleanup; packed Stipe
remains a required Caps dependency.

### Playable packets and dependencies

| Packet                                        | Dependency and owner boundary                                                                                                | Player-visible exit                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trustworthy controls and spatial presentation | Current writer remains; reviewed geometry shared by actual picking/diagnostics, separate from simulation support/path policy | Select the visible intended thing, access Ground/Upper with buttons/keys, keep compatible tools armed, inspect without covering essential controls, and understand who stands in front/behind.                   |
| One goods/transfer owner                      | One coupled work/material/save writer; serial view/HUD handoff                                                               | Existing wood construction supply and herb shelving both reserve, pick up, carry, deliver, wait, drop and resume through the same laws. Save interruption preserves identities and quantities.                   |
| Mixed storage                                 | Full wood/herb migration closed; reuse its location/capacity/claim owner                                                     | One shelf holds multiple permitted goods, shows a simple grouped list and remaining capacity, and explains a rejected/full destination. No backpack puzzle UI or duplicate contents store.                       |
| First brewing                                 | Delivery records actual recipe, acquisition and economics; mixed storage and common transfer are usable                      | Obtain finite inputs, stage them at a real vessel, perform visible preparation, do another job during fermentation, then collect or serve exactly one batch through ordinary goods custody.                      |
| One ecology consumer                          | Brew/home play feedback; reuse the actual vessel/transfer/process seams                                                      | Establish one newly sown mugwort plant with a carried-water delivery: “needs water” becomes growth, then a useful harvest returns to storage/brewing. No recurring chore loop without evidence it improves play. |

These are serial gameplay dependencies, not a fixed calendar or a mandate to finish every row before publishing. Independent map/art/research work can proceed without broadening the coupled candidate. Delivery gives estimates after a useful first source/caller checkpoint.

### Historical goods-migration wording (superseded by the audit disposition)

The first source checkpoint can fully move existing herb Store through a generic transfer owner, with quantity splitting and destination promises designed for the immediate wood port. It does not satisfy completed unification. Then construction uses the same owner for partial wood pickup, supply, cancellation, embedding and salvage. A third beer hauling implementation rejects the candidate.

Preserve meaningful differences as data and explicit outcomes: wood carries up to its current two units, mugwort retains whole-bundle identity; supply delivery advances construction while storage delivery finishes its step. One transfer retains the destination obligation across reserved/carrying phases. Continued cargo precedes new automatic work, while personal/shared priority, Work flags, Draft interruption and actual libcolony matching remain intact. Claims never count as physical stock. Clearing an activity must not accidentally erase a live transfer.

Delete authoritative runtime `piles`, actor `cargo`, `claims`, `herbBundles`, `herbStorageClaims` and `Site.delivered`, plus the separate pickup/delivery/drop and material-validation branches they support. Their new lots, containers, transfers and embedding ledger have one synchronous mutation owner. Read-only display selectors are acceptable; writable legacy mirrors are not. Old wire fields remain only for historical save conversion. Plant development keeps its own validation, not a generic bag of optional fields.

Keep strict v1–v6 parsing/rejection before deterministic conversion and validate the resulting new schema. Preserve paused restore, job progress, path/leg, scope/priority, raw recovery and no write merely from load. Old identities are only unique per collection: reserve existing herb identities, remap colliding wood/synthetic IDs deterministically and rewrite references/allocator together. Handle valid empty wood shells deliberately. Preflight teardown/refund placement before deleting its source. Per-material live + embedded/transformed + sink balances must remain equal to production; a single combined “item count” is insufficient. **This v1–v6 wording is historical; the next durable landing is schema-v7 for both wood and herb after the isolated helper.**

Mixed storage then selects one explicit bounded capacity policy, compatible grouping/stacking rules and visible contents representation. Capacity, carry limits and liquid containment are different policies. Existing goods exercise the first mixed list; future filtering/priorities and automatic storage demand enter only when separately needed. It must not silently make every shelf an unlimited vessel.

### The first brew is settled; preserve its shared owners

The shipped herbal-ale definition consumes two malt, two contained water, one whole mugwort and one fuel wood; it retains one barm and one physical keg and produces four ale servings plus one spent-grain tray output. Preparation and kegging are attended Craft work, fermentation advances on the authoritative game clock, and serving/clearing are definition-owned output actions over the same durable process and material receipts. The finite cache and spring provide actual inputs; no proof-only stock or completion-time keg is conjured. Mugwort supplies flavouring, not fermentable grain. The MF DOOM reference remains named inspiration, not a settled second recipe.

The station cannot disappear while inputs, process or output remain. Serving does not yet create a personal inventory or needs benefit: the batch ledger and physical output settle truthfully, and a future accepted consumer may use those servings through the same goods owner. Adding a second recipe should be definitions/assets over the checked slot, timing, retained-input and output-action mechanisms; a genuinely new physical behavior earns one typed primitive rather than another scheduler or material path.

Recipes over supported operations are versioned definitions/assets with checked references. New physical behavior earns a closed typed operation and invariant; no arbitrary callbacks, universal job engine or additional scheduler. Pin in-flight semantic recipes so changing configuration cannot rewrite an existing batch. Demonstrate a second recipe as data only when it is a real accepted playable recipe, not filler created for a test.

### Original brewhouse and authored structure research

Astra is personally authoring reusable original two-storey brewhouse art and a scene template. Its optional visual study proves appearance, reusable prop/room composition, levels/cutaway and readable workstation placement at native/game scale. It may portray a composed example; it does not claim that the simulation gathered materials, constructed it, brewed there or generated a village.

The reviewed [authored-building procedural assembly study](authored-building-procedural-assembly-study.md) verifies Minecraft Bedrock template pools/connectors and creator-described Gungeon/Isaac authored-room composition, with explicit edition and source limits. It supplies the bounded building-template contract; no runtime assembler is implemented by that research. A future runtime room template uses relative cells/levels, direction, entry/access and support requirements, versioned content references and fresh instance IDs. Player stamping calls the existing construction/admission owner and exposes conflicts/costs; it cannot inject finished sites or bypass jobs. Generated settlement initialization is a distinct one-time creation cause for finished structural/semantic records. It additionally needs site suitability, stable instance identity and canonical feature ownership across chunks; regeneration never replaces player changes or refills contents. Those runtime consumers are not prerequisites for publishing the isolated brewhouse study, and a successful study is not their acceptance.

### What the studies support—and do not prove

Retained RCT, Stronghold, RuneScape, Diablo and Darkest Dungeon notes support readable cost/commit/response, physical production and preparation/return rhythms. The colony-control studies support separating selection, designation, direct work and drafting. Coverage is bounded: no comprehensive DF/Prison Architect review, RimWorld right-click evidence is largely mod-author material, detailed shelf behavior is not uniformly primary, the Darkest Dungeon talk was not watched, and RuneScape/Don't Starve editions are distinguished.

ONI/RimWorld/Dubs notes support coupled conditions, overlays and service tiers, not a verified current solver. Water-history, compost and beaver research offers conditional, site-specific mechanisms and tradeoffs; it does not establish universal restoration, safe treatment or greenhouse performance. Millison material was selectively read rather than all videos watched. Minecraft/RimWorld landform studies separate deliberate shape, density/cave geometry and ecology; generation-time aquifers are not a live fluid solver, and planar roof grids are not stacked Hive volume.

Thus the proposed first ecology addition is one finite-source, physical-vessel watering operation for plant establishment. Confirm representation after brewing, explicitly migrate existing plants, and show the limiting condition. Regional flow, groundwater, gases/heat, fire, sewage/compost, climate, perennial forests, animals/beavers, caves, realms, tarot, factions and multiplayer remain durable future direction.

### Prove usefulness, deletion and cost

Review actual handlers and immediate callers; retain visible Fallow findings and remove superseded paths rather than hiding complexity. Use focused deterministic laws for competing source/capacity, partial/whole pickup, interruption, teardown, corrupt/old saves and exact output settlement. One short real-input trace through the changed loop plus exact served parity is sufficient; preserve prior failures and scope limits.

Measure useful work separately: candidate/path/matching/commit counts and times, input/HUD/render/save costs, and map generation/assembly/draw/resident/in-flight/scratch bytes. An optimizer microbenchmark, lab map or offscreen sprite does not prove 100 active people or offline simulation.

Ask Levi: can he understand and correct a shortage without explanation; do the first ten minutes offer meaningful choices; is watching work satisfying; does storage reduce friction; and does fermentation create useful downtime rather than waiting? Return to those answers before adding area or chores. Delivery retains serial Git/proof/publication and visible PM outcome ownership; Astra retains architecture/product and changed original-art review. No extra management framework or blanket art gate for routine source work follows.

## Historical status and prior plan

Status: Game CTO reviewed direction for Delivery publication, 2026-09-07.
Authority: Levi requests review of all plans and a separate large-world generation
page before permitting gameplay expansion. This supersedes automatic
home → upstairs → caravan sequencing; it preserves the active upstairs writer.
Source baseline: shipped feature 765c3282982d2ee6b07d5bea67bc21d08e4c2011.
The inspected worktree also contains unaccepted upstairs changes. No source,
build, performance test, world page or deployment is claimed by this ADR.

## Decision and committed sprint exits

Keep the 15×15 game as the place to judge whether ordinary play is satisfying.
Separately prove that its next world substrate can scale. These are independent
release tracks with one Delivery owner and serial integration, not a map-size
increase concealed inside a home update.

| Outcome                                          | Concrete exit                                                                                                                                                                                                                                                        | What that establishes                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Finish the active upstairs bedroom               | Gather its actual materials, build legal stairs/floors, carry material up, build and sleep in the upstairs bed; block the sole approach; pause/reload an in-progress traversal/work state. Review actual floor picking and stairwell cutaway.                        | Shared topology, work positions, resource custody, interruption and save across levels.                 |
| Publish a separate `/world-lab`                  | Generate a seeded large region overview, inspect it in the original isometric presentation, pan/jump across signed chunk coordinates, regenerate in another request order, and inspect generation/frame/residency measurements. Gameplay stays on the tiny clearing. | Deterministic terrain generation, coordinate/projection consistency and bounded generation/render work. |
| Establish a real simulation performance baseline | Run the actual simulation, routes, claims and selected WASM optimizer with 5/25/50/100 actors under useful workloads. Record outcomes and phase costs separately from browser display costs.                                                                         | Where population scaling actually costs time and memory; an evidence-based next optimization.           |

These are the sprint's committed proof outcomes, not a calendar guarantee that
all future foundations can be delivered in five days. Delivery estimates the
World Lab after its first actual generator/caller checkpoint and reports coherent
interims on the same preview. A measured shortfall is a finding to fix or a
supported workload limit to disclose, never a successful capacity claim.

The next playable slice after upstairs remains **beer brewing**, with mixed
shelf storage only as its necessary goods consumer. Its readiness contract can
advance independently now; its runtime starts when the coupled home writer is
free. Do not require world expansion or completion of unrelated lab work before
brewing. Do not bundle a brewery, caravan, fluids, multiplayer and a new inventory
framework into the current upstairs candidate.

## Findings from plans and actual source

1. **World-scale architecture is specified but unexercised.** `world.js` still
   owns SIZE=15 and finite inside/blocker scans; `art/scale.js` centres projection
   on SIZE; the cut-earth `art/clearing.js` bake is one authored board. The current
   game cannot become streamed simply by raising SIZE. The lab should establish
   a real reusable terrain/coordinate consumer before changing gameplay topology.
2. **Population capacity is unmeasured.** `jobs.ts:assignWork` already batches
   assignment behind workDirty and uses the actual optimizer; that is valuable.
   Its nested actor/job/pile/route queries and per-actor blocker derivations still
   need whole-workload measurement. Limiting emitted matches does not itself
   bound the work spent searching candidates. The isolated small optimizer probe
   is not a 100-person simulation benchmark.
3. **Historical storage finding (superseded by the coupled v7 disposition).** `model.ts`, `jobs.ts`,
   `activity.ts` and persistence contain a separate mugwort bundle/storage path
   beside construction wood. Another item kind should not require a third copy
   of the whole claim/pickup/carry/store chain. Brewing earns a narrow goods and
   capacity owner; the old proposal that construction wood can remain on its
   existing path is historical. A shelf is a mixed grouped list, not a pack
   grid. Bulk/weight/filter policy and exact capacities remain proposals.
4. **A timed workstation process does not exist yet.** BUILDINGS is construction
   data, and herb growth is a specific fixed-tick owner. Brewing should establish
   one recipe-driven batch whose consumed inputs, work, fermentation and output
   survive interruption/save. The actor can do something else while it ferments.
   New recipes over that supported behavior should be data; new behaviors still
   extend explicit typed owners. No job DSL or universal actor state machine.
5. **Save and display surfaces need a focused deletion review before new goods.**
   `persistence.ts` has historical schemas plus substantial relational invariants;
   HUD projection manually maintains identity across many entity fields. Keep
   boundary Zod and legitimate custody checks. Classify scheduler/display caches
   before persisting more of them, inspect all consumers before removing fields,
   and measure panel commits before changing selectors. Equal-tick outcomes and
   focus behavior, not line-count targets, decide acceptance.
6. **The roadmap mixes historic and current status.** PROTOTYPE still names the
   old two-person goal/schema; Architecture and the living-world ADR still have
   automatic caravan ordering and old source custody in later sections. The new
   record should mark those sequences superseded and update the top-level current
   baseline without erasing historical evidence or old advisory dispositions.

No evidence from this pass justifies adding an ECS, Effect migration, a second
optimizer, a generic event bus or a new state-management library. Existing
Jotai/XState/Zod have explicit owners. Revisit a maintained primitive against an
observed missing capability or cost, not a library checklist.

## World Lab: first working scope

Use a distinct page and separate local world namespace. It must not import the
Clearing scheduler, overwrite the game's save slot, spawn playable actors or
change live build/path rules. Its new terrain module is production-intended code
with this page as its first consumer; it must remain usable without Pixi/DOM so
the later game and a future host can use exactly the same generation rules.

- Expose seed and generator version, a 512×512 region overview first, and a
  1024×1024 diagnostic preset after the first bounded measurement. Overview pixels
  describe sampled terrain; they are not hundreds of thousands of scene objects.
  Changing seed/region cancels or supersedes queued generation. Report real time
  and buffer counts; never preallocate the entire signed world coordinate domain.
- Start with the documented 16×16 chunk candidate and global signed coordinates.
  Use mathematical floor division, stable feature ownership, and coordinate-based
  randomness. A seed/generator-version change changes the generated world identity.
  Compare exact chunk bytes/checksums across opposite request order and unload/
  regeneration, including x=-1/local15 and a distant coordinate jump.
- Layer elevation, moisture and terrain classification from one deterministic
  sampling recipe. Show diagnostic layers beside the composite isometric view.
  A water mask is terrain classification, not flowing water, drainage or a fluid
  simulation. Do not claim caves from a surface height map. The first sampler
  does not dictate the eventual volumetric excavation representation.
- Render only camera-intersecting chunks plus bounded overhang; use a bounded
  resident window/cache and a bounded generation queue. Choose counts from the
  first source/viewport measurement (a 5×5 window is a candidate). Separate
  rendering disposal from decoded terrain residency. Preserve cross-chunk prop
  sorting and visible canopy overhang; one monolithic ground bake cannot tile.
- Exercise origin-relative projection and inverse picking with the same helper
  intended for the game. Do not duplicate the fixed SIZE transform. Coordinate
  extraction into a shared caller is serial with the upstairs camera owner;
  independent terrain/worker/page files can proceed first.
- Prefer existing maintained noise/platform primitives for commodity mechanics;
  inspect the selected implementation and license before adding a dependency.
  A single native Worker is a candidate for generation responsiveness, with a
  bounded request queue and stale-result rejection; no worker-pool framework.

First checkpoint: adjacent positive/negative chunks, one seed, one inspectable
layer and correct pick round-trip. Then overview/camera culling and measurement;
then original seamless terrain presentation reviewed at game scale. Publish
useful intermediate results rather than wait for final scenery variety.

An optional follow-on inside the isolated lab is one diagnostic terrain edit or
feature tombstone, saved into a separate IndexedDB namespace and recovered after
actual decoded-data eviction and page reload. It must use the intended base+
patch shape and commit-before-evict rule. An in-memory repaint surviving a camera
pan is not durable edit proof. This checkpoint may ship separately; it does not
add gameplay and is not required to finish the first world-generation page.

## Measurement that can falsify the plan

For the World Lab record browser/device/renderer, revision/seed, generation time,
frame intervals during continuous pan, input response, visible/resident chunks,
explicit terrain/texture bytes and allocations/disposals. A repeated out-and-back
journey must settle to the configured cache budget rather than retain every
visited chunk. Test cancellation during a seed change. Avoid reporting JS heap
alone as total memory: WASM, textures and decoded buffers have distinct costs.

For population use an immutable coherent source revision and the actual `step`,
`assignWork`, `optimizeEligible`, movement and resource owners. Fixtures need
ready work, unreachable/waiting work, scarce-material contention, steady walking/
work, a topology change and cancellation. Complete useful outcomes; an idle crowd
or repeated raw Hungarian call is not representative. Keep fixture setup out of
timed samples. Record p50/p95/worst tick and assignment/path/state times, memory,
completed jobs, starvation/wait reasons, unique ownership and equal-tick replay.
Record each fixture's finite topology, task count and offered optimizer-pair count;
this is scheduler workload evidence, not physical population capacity.
Measure HUD publishing/component commits and rendering separately; reusing art
for a diagnostic crowd does not add recruitable people to the playable clearing.

Initial desktop targets are responsive input below 100 ms and ordinary simulation
work well inside the existing 50 ms tick; steady display aims for 60 fps. These
are targets to measure on named hardware, not outcomes already achieved. Mobile,
headless software rendering and hosted runtime fit get separate labels. An
oversized assignment pass should produce a bounded optimization decision before
an ECS rewrite; preserve priority/fairness and scarce claims when reducing work.

## Brewing is the next content-extension proof

Before runtime, Delivery selects one honest finite ingredient acquisition path,
recipe and brewing timing; grain/yeast/water/fuel sourcing remains an unresolved
entry decision, not permission to conjure inputs. Scope the initial resource
path without requiring complete agriculture, fluid transport or combustion.
Mugwort is flavouring. “Fig Leaf Bi-Carbonate” is the later soda/MM..FOOD nod,
not the name or recipe specification of the first herbal ale.

The useful chain is ingredients → mixed shelf → reserved transfer → workstation
work → unattended fixed-tick fermentation → one physical output → store/serve.
Prove last-space competition, full-destination waiting, cancellation/drop,
consumed-input accounting, one output, exact restore and no offline advancement.
Choose a narrow location/capacity API using these actual consumers. A second
recipe over the supported brew behavior should require definition data rather
than copying activity logic; that is the concrete extensibility check.

Normalize old saves into the selected new durable shape using the existing
parser/transaction owner. Preserve real activity/claim/custody facts; remove a
recomputable cache only after proving the next scheduling decisions still agree.
Do not turn this into an upstairs-blocking migration rewrite. The shelf and
workstation inspector consumes one simulation-derived view and emits ordinary
typed commands, with focused updates and stable focus across process changes.

## The expansion gate after the lab

A pretty large world is insufficient. Before unlocking large-world gameplay,
prove one persistent person with actual cargo crosses a real chunk boundary and
returns while another keeps working at home. Home remains resident offscreen;
a third modified unoccupied chunk is saved, evicted and reloaded. Restart must
preserve actors, items, stumps, jobs and construction. Missing terrain has an
explicit needs-data outcome, not an invented free route or destroyed cargo.
Topology, supported rooms and stair openings must also work across a chunk edge.
This controlled integration test is separate from opening the world to play;
Levi's tiny-map fun gate still controls that product transition.

Only after that consumer comes same-world two-client authority, then two-owner
visits/recovery and offline catch-up. A local tool-client using ordinary commands
can later prove AI control boundaries; model calls, Watchdog, DO deployment and
billing remain separate work. The worldgen page proves none of them.

## Delivery, issue custody and review

Game-delivery retains sole Git/deploy and coupled-source integration. Keep the
existing upstairs writer uninterrupted. Assign a genuinely independent World Lab
owner to new terrain/page/worker files, and a bounded performance reader/runner
to frozen-source fixtures. Shared Caps implementation changes require an agreed component/file boundary with
the Botanical CTO and exactly one shared writer; current game composition uses
packed Caps/Stipe and remains game-owned. Do not fork shared primitives into the
game. Each portfolio checks an accepted shared change in its actual consumer.
The systems lane can finish brewing/commodity readiness
and reconcile docs; it is not a second runtime writer. Do not give one PM all
three execution responsibilities. New visible assignments use the supported
Shiitake role where available, otherwise record the current role-capability gap.
Astra retains original art direction/review. Delivery accepts routine source,
corrections and proofs without another CTO gate; shared camera/Vite/package
edits integrate serially. Ordinary gameplay releases need not await lab art.

Publish this reviewed draft under existing docs/decisions and link it from both
plans. Update #3 (upstairs), #4 (world lab versus gameplay expansion), #6 (real
population measurements), #7/#14 (mixed storage/brewing), and current ownership/
status paragraphs. A lab child issue under #4 is useful if Delivery gives it an
independent owner; no new board/report framework. Preserve the other ideas in
#2/#8–11/#13/#15–19 and existing ADRs with their first-consumer proof boundaries.

Review inputs: PROTOTYPE, ARCHITECTURE, all four current decision records, the
19 open issue bodies plus current #4/#6/#14 comments, direct current source/caller
inspection, and the independent notes `sprint-architecture-audit.md` and
`world-lab-ready-audit.md`. No implementation test or benchmark was run for this
planning review. Current complexity/duplication advisories remain evidence to
address by responsibility as those callers change, not a zero-findings claim.
