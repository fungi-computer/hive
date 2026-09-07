# A home between realms

Status: Game CTO synthesis for discussion with Levi, 2026-09-07. This combines existing accepted direction with explicitly identified design proposals. It does not implement a new system or reorder the active upstairs → brewing work. Source inspected: current model/command/job/activity/caller, the existing six decision records, and the retained game/ecology studies. Published floor-study revision at review: 008793c; local upstairs work remains separately reviewed. No new simulation test, benchmark, server or multiplayer claim accompanies this document.

## What the game is about

Build a peculiar home in a living world, welcome strange people, learn what they know, and venture out together. Bring back discoveries that change how the home works. Over time your inn, garden and workshop can become a refuge, a trading stop, a witch's enclave or the beginning of a small polity.

The Goblin Bed & Breakfast is a strong first expression of that idea. It gives rooms, food, beer, horticulture, sanitation, guests and relationships an immediate purpose. It is a starting livelihood and a place to care about, not a requirement that every player become a hotel manager forever.

The repeated pattern is **discover → learn → apply → share**, inside **home → preparation → journey → return → improvement**. Progress should be visible in people, land, buildings, practical capabilities and remembered history. The first ten minutes and roughly thirty-minute preparation/excitement/recovery arc remain playtest hypotheses, not a mandatory raid schedule or a promise of constant danger.

## One possible player story

1. You arrive with a familiar and make a habitable corner. Gather real materials, queue work, provide a bed, plant something and make a useful drink. Bramble teaches through the problem in front of you. The important first payoff is being able to watch your people make the place work.
2. A goblin comes looking for hospitality. What delights that guest may disgust a human. Bed, drink, food, access and cleanup matter because someone actually uses them. You improve the layout, decide which work people do, and earn a relationship or an invitation. Ordinary visitors can become recruits through their own circumstances.
3. The grounds begin supporting the house. Water routes, soil, shade, compost, growing conditions and storage affect the garden. Later waste treatment turns a nuisance into useful inputs. A dry stream, greenhouse or rotting log becomes a concrete design problem; a well-managed landscape remains changed after you leave.
4. A visitor, book, recovered sample or ancient garden teaches something valuable. A mushroom strain retains its identity; cultivation can preserve it. A book carries recorded know-how and provenance. You can teach another resident, trade the book, produce a better brew, or prepare for a journey. Knowledge has economic value because tools, materials, time and skill are still needed to use it.
5. You prepare a small party and leave home functioning. A goblin cave, caravan route or neighboring settlement offers useful materials, knowledge, people and relationships. The tension is what to carry, whom to trust, how far to press and when to return. Adventurers create customers for smiths, growers, healers, hosts and guides; every player need not take the same expedition.
6. The purple portals open another route. You enter an original otherworld, meet its wizard or the Devil, play an unsettling chess match, interpret a card, make a bargain or find unfamiliar life. A return might bring a new technique, an Arcana encounter or an ally. Back home, that discovery changes the garden, workshop, next expedition or social obligations.

This is a causal sandbox journey, not a fixed campaign script. A rare seed, a friendly goblin, a clean water system or a flourishing inn should remain meaningful alongside magical discoveries.

## The visitable otherworld

Levi's new direction is explicit: the purple-portal/wizard reference is a **realm people can enter**, analogous to a separate Minecraft dimension in concept. It is original Hive fiction, with no Harry Potter theme, characters or institutions.

Proposal: start its eventual playable expression with a small recognizable sanctuary or court and a persistent return portal. Familiar, Devil, wizard, chess, tarot and magical teaching have a natural place there, with more unsettling terrain beyond. The realm can later have its own ecology, resources, landmarks, inhabitants and atlas. Whether a particular realm is shared across players or instantiated remains open; neither choice should be encoded into every plant, item or job.

Use three distinct concepts:

- A **space** is a traversable coordinate namespace. A realm instance is one kind of space. A cave may be below the same homeland, while an instanced dungeon or otherworld may be another space.
- A **chunk** is a bounded storage/generation/residency region inside a space. Compute its key from global coordinates; do not keep a competing mutable chunk position on every actor.
- An **authority** is the sole writer for currently interacting state. One authority can own many chunks and, in the first realm proof, both home and the otherworld. Crossing a terrain boundary does not inherently migrate servers.

Older political use of "realm" means a kingdom/jurisdiction and must not become the world-coordinate key. Kingdoms, property, factions and access permissions may span terrain and authority boundaries.

The first portal changes where existing people are; carried items remain attached to the same people and IDs. It does not create a second party or generate a reward copy of their inventory. A portal edge initially permits named travelers only. Water, heat, smoke, projectiles, sound and vision do not cross merely because a purple graphic looks like an opening. Each additional transported quantity needs an explicit conserved boundary rule. First prove a stable return link; hazardous closure and stranding policies are later choices.

## What each inspiration contributes

These are design inferences from the retained studies, not promises to reproduce those games.

| Inspiration                                   | Role in this game                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RollerCoaster Tycoon                          | Pleasure in designing, watching, inspecting and improving a place. A preview explains the proposed change; measurements and visible outcomes explain what happened. |
| Rimworld, Prison Architect and Dwarf Fortress | Shared work designations, worker capabilities, personal overrides, drafting, spatial planning and persistent inhabitants.                                           |
| Stronghold Crusader                           | Layout creates causal possibilities: stores, paths, workshops, openings and resources change what people can do.                                                    |
| Oxygen Not Included                           | A few interacting, inspectable environmental quantities create useful problems. The goal is legible cause and effect, not a full chemistry simulator.               |
| Diablo and Darkest Dungeon                    | Preparation, distinct party members, finding useful things, choosing when to return, and a home that matters to recovery and the next trip.                         |
| RuneScape                                     | Practical skill and material chains let different professions support one another.                                                                                  |
| Minichess, tarot and the familiar             | Short optional play, characterful relationships, discovery and occult encounters during quieter periods.                                                            |
| Permaculture and water-engineering studies    | Persistent landscape interventions, finite resource flows, provenance, maintenance and long-lived ecological consequences.                                          |

The retained RCT study preserves manual/developer sources and evidence limits. Klei's [developer interview](https://www.gamedeveloper.com/design/layering-challenges-in-klei-s-survival-sim-i-oxygen-not-included-i-) supports deliberately simplified interacting simulations; it does not establish a reusable ONI solver. Existing expedition, environment and mapping ADRs retain the detailed reference trail. Ignored research inputs are review evidence, not claimed published documentation.

## Give the systems different jobs

| Owner                           | Authoritative facts                                                                                                      | Examples of consumers                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Definitions and entity creation | Versioned content definitions; creation authority samples and persists each instance ID, cause/seed and appearance once  | Ordinary visitors, children later, Arcana arrivals, animals         |
| Space/topology                  | Location, terrain edits, support, openings and traversal links                                                           | Movement, construction, digging, portals, maps                      |
| Goods/capacity/claims           | Each physical lot's location, amount, traits and reserved availability/capacity                                          | Brewing, food, shelves, bags, books, offerings, caravan cargo       |
| Labor                           | Outstanding scoped orders, worker eligibility, assignments and current activities                                        | Build, haul, clean, sow, serve, study, perform a ritual             |
| World processes                 | Unattended progress, prerequisites, references to resource-owned inputs/reservations, due work and intended outputs      | Fermentation, crop development, decay, compost processing           |
| Environmental fields            | Actual water, soil moisture, heat, gases, nutrients and contamination                                                    | Plants, people, buildings, fire, brewing, hygiene and spell effects |
| Knowledge and practice          | What an actor/institution has learned, evidence/provenance and practiced skill                                           | Recipe use, cultivation, teaching, spell interpretation             |
| Relations and organizations     | Membership, commitments, reputation, title and permissions                                                               | Guests, recruitment, trade, kingdoms, later laws/courts             |
| Encounters and rewards          | A uniquely identified opportunity and resolution state; effects settle through goods/knowledge/relations/creation owners | Chess rewards, card opportunities, visitors, dungeon discoveries    |
| Host/authority                  | Ordered command admission, clock, consistent commits, receipts and transfers                                             | Human UI, NPC policies, familiar, faction AI, storyteller           |
| Presentation                    | Selection, gesture phase, camera, windows and projections of committed facts                                             | Caps/Jotai/XState HUD, Pixi, cutaway, overlays, maps                |

These are code/data responsibilities within the simulation, not twelve services or twelve PMs. Add an owner only when a concrete consumer establishes its boundary. Existing wood and mugwort demonstrate custody, but there is not yet a general goods/process/knowledge engine.

## Reuse physical and knowledge facts, not entire feature state machines

A book is a physical item referring to recorded knowledge. Knowing its contents is a separate actor/institution fact. Practical skill is another fact. Technology eligibility can require a breakthrough, tools and infrastructure. Possessing a book does not mean reading it; reading it does not instantly supply skill; buying an advanced tool does not grant its manufacture. Copying and teaching are work with inputs, duration and provenance.

Daily mushroom novelty applies to newly generated strains/batches under explicit generation rules, not to a stored mushroom's already-established effect. Discovery can reveal a hidden trait; high-skill cultivation can propagate a strain under suitable conditions. The same knowledge/media pattern supports arrow making, tanning, brewing, grafting and spells. Secret content remains filtered by knowledge and permission, even when an item ID is known.

Tree growth, a corpse, a log and compost can share measured processes and resource settlement without sharing one giant `Alive/Dead/Decomposing` machine. A fungal colony is distinct from the log it consumes. Declining stock can invalidate a reservation with an explicit outcome; a claim must not freeze decomposition forever. Terrain moisture from noise is a generation signal, not actual water available for irrigation.

Use the same event and resource semantics for magic. A spell that redirects water calls the water-transfer owner. A heat spell changes the same heat field that a greenhouse or actor reads. An explicitly authored conjuration may draw on a magical source with persistent quantity/capacity and explicit debit/recharge rules; merely naming a source or budget does not establish accounting. It cannot be an untracked write that makes duplicated items free. Synergies follow typed effects and shared material traits. A bounded wet-plus-heat interaction can create accounted steam; no need for the spell module to know about brewing, plants and every individual creature.

## Data can add content; code owns new behavior

Pseudocode below specifies contracts. These functions/types are proposals, not existing APIs or a request to build a framework now. Placeholder quantities/timings are to be set by the actual brewing contract.

```ts
const recipes = {
  herbalAle: {
    station: "brew-kettle",
    technique: "herbal-brewing",
    inputs: ALE_INPUTS, // finite grain/water/flavouring/etc.
    behavior: "ferment", // an implemented, typed process
    work: { skill: "brewing", duration: ALE_WORK },
    process: { duration: ALE_TIME, conditions: ALE_CONDITIONS },
    output: "herbal-ale-batch",
    animation: "stir",
  },
};

const portalRitual = {
  station: "shrine",
  technique: "read-the-threshold",
  inputs: RITUAL_OFFERINGS,
  behavior: "open-portal", // another explicit typed handler
  work: { skill: "ritual", duration: RITUAL_WORK },
  // Endpoints belong to the persistent shrine/portal instance.
};
```

Both can reuse selecting eligible workers, reserving exact inputs, hauling, work interruption, persistent progress and readable inspectors. Fermentation has its own unattended process semantics; opening a portal has its own topology semantics. They do not become the same behavior merely because both consume ingredients. Adding a second supported brew is data. Adding a new physical behavior requires a small typed implementation and a real outcome proof. Validate content schemas and cross-references once on ingestion; trusted tick state uses discriminated unions and exhaustive handlers, not repeated Zod parsing or arbitrary `eval` callbacks.

The same limit applies to spell composition. A small vocabulary can create many combinations without permitting arbitrary scripts in every ingredient:

```ts
const emberSeed = {
  delivery: { kind: "projectile", shape: "orb" },
  effects: [{ kind: "add-heat", energy: EMBER_ENERGY }],
  cost: { source: "caster-reserve", amount: EMBER_COST },
  art: { trail: "embers", lightRamp: "witchfire" },
};
// A typed hit settles paid heat into the actual struck cell/material.
// Shared material rules decide drying, steam or ignition from that new state.
```

Delivery, effect and cost compatibility are checked when the spell is assembled. Runtime limits bound effect count, energy and recursive triggers. Procedural modifiers are persisted with the spell's identity. Balance budgets do not substitute for physical quantity accounting, and visual brightness does not itself create heat. Authored supernatural rules remain possible through explicit typed effects.

## One command path and visible settlement

```ts
type Intent =
  | { kind: "craft"; recipe: RecipeId; station: SiteId; scope: WorkScope }
  | { kind: "study"; actor: ActorId; book: ItemId }
  | { kind: "play-card"; actor: ActorId; card: ItemId; at: SiteId }
  | { kind: "recruit"; candidate: ActorId; party: PartyId }
  | { kind: "cross-portal"; actor: ActorId; portal: PortalId };

// A click, NPC policy or authorized familiar submits the same envelope.
submit({ id: commandId, principal, grant, intent });

function admit(envelope, world) {
  const principal = authenticate(envelope);
  const receiptKey = [principal.id, envelope.id];
  const prior = world.receipts.forPrincipal(principal).get(receiptKey);
  if (prior) return requireSameIntent(prior, envelope.intent);
  authorize(principal, envelope.grant, envelope.intent);
  const plan = handlers[envelope.intent.kind].plan(
    world.read(),
    envelope.intent,
  );
  // Plan is typed: rejected, waiting for a named condition, or ready.
  // Recheck relevant target versions/claims; do not reject every action merely
  // because the entire world's tick advanced since the UI/AI observed it.
  return world.settle(plan, receiptKey);
}

function fixedStep(world, admittedCommands) {
  world.admitInOrder(admittedCommands);
  if (world.paused) return; // local prototype planning rule
  world.clock.advanceOneTick();
  world.advanceDueEnvironment(); // explicit, bounded phase ordering
  world.advanceDueProcesses();
  world.advancePeopleAndActivities();
  world.matchDirtyWorkWithLibcolony();
  world.finishPhaseFacts(); // no synchronous listener recursion
}
```

The exact phase order must be specified/tested for each consumer; this future sketch does not silently reorder current `step`. A ready multi-record change is all-or-nothing within one authority: material, capacity, job/process result and its receipt agree. A planner never gets arbitrary references to another owner's mutable table. Use narrow owner APIs and stage touched records or write sets; do not clone an entire large world per command or delegate every outcome to a universal reducer.

There are no model/network/storage awaits inside a simulation phase. A hosted adapter serializes admission/settlement, atomically persists the candidate state changes plus command receipt and necessary event/outbox records, then exposes the committed revision. Failed storage does not leave an uncommitted JavaScript candidate as the live world. Current local browser autosave is different: applied commands become durable at the next successful snapshot, and Continue resumes paused. Do not relabel autosave as per-command durability.

Committed events describe facts such as `DrinkServed`, `TechniqueLearned` or `GuestRecruited`. Named later phases/cursors consume them idempotently to propose follow-up actions. Faction reputation uses witnessed or transmitted outcomes; access to the authority's global facts does not give every inhabitant omniscient knowledge. Do not make `onDrinkServed` immediately mutate reputation, recursively spawn a card, spawn a person and recruit them through a listener chain. Retain the durable outcomes/history needed for gameplay and bounded receipts; this is not a commitment to store every tick forever or make everything event-sourced.

## How chess, tarot, people and portals actually connect

```text
match finishes
  → settle one MatchResult(matchId)
  → reward policy offers a card, lead, piece or relationship outcome
  → later play/interpret a card through an ordinary command
  → create or reveal one Encounter(encounterId, cause=cardUseId)
  → an existing being arrives OR one new character is created
  → that person is a visitor with motives/relationships
  → a separate invitation/recruitment can add them to your party
```

That is a proposed causal chain, not a fixed reward table. Replaying an already-settled match/card command cannot mint the reward again. Repeatable matches need an explicit sustainable reward policy. Chess stays optional and interruptible; exploration, hospitality, trade or study can offer alternate routes to knowledge and opportunities.

Levi's 4x4 capture-the-king game remains the rule direction. The Fool introducing a starting person, Lovers introducing a bonded pair, and rarer Arcana inviting powerful people are content hypotheses. The new realm makes their encounters spatial and social. A Major Arcana opportunity does not make its powerful character automatically loyal.

Keep the verbs separate: `spawn` creates an ID with persistent cause/seed/definition; `arrive` transfers an existing being; `invite/recruit` changes membership under accepted terms; `draft` changes ordinary work participation; `grantControl` gives an AI/player specific authority. Cairn-backed IDs and authored/generated names stay separate; travel reuses the existing ID. No particular Cairn name-generation API is assumed here.

For an eventual first local portal, both spaces can stay under one writer and clock:

```ts
type Place = { space: SpaceId; cell: WorldCell };
// Chunk is derived from space + global cell. Carried items refer to actor ID.

function crossPortal(tx, actorId, portalId) {
  const portal = tx.portals.requireActive(portalId);
  tx.travel.requireActorAtEntry(actorId, portal);
  tx.travel.requireAuthorizedDestination(actorId, portal);
  const landing = tx.spaces.lookupLanding(portal.destination);
  if (!landing.ready) return { kind: "needs-data", chunk: landing.chunk };
  tx.travel.validateLanding(actorId, landing);
  tx.work.resolveSourceObligations(actorId); // finish, reject, or explicit interruption
  tx.goods.requireOnlyTransferableCargo(actorId); // no reserved build deliveries
  tx.positions.moveExisting(actorId, landing.place);
  // Transferable carried items still say carriedBy=actorId; no new instances.
  tx.record({ kind: "Arrived", actorId, place: landing.place });
}
```

Here `tx` is staged state: a failed precondition changes nothing, and success is committed once with its command receipt. In-flight work cargo/claims must be resolved through the actual interruption policy, not silently taken from someone else's build. Preloading a destination can make travel smooth; missing terrain waits explicitly. Crossing normal chunks should remain visually seamless. A portal can have a deliberate visual transition without disguising identity loss or regenerating the visited space.

When the destination has another server owner, use a durable transfer identity, source escrow/freeze, destination acceptance and a recoverable acknowledgment/finalization. There may be a safe pending interval; never two active copies. An unknown outcome is reconciled with the destination, not treated as permission to blindly roll back a completed arrival. Local atomic transfer does not prove this distributed protocol.

## Scale, state management and always-alive play

The same rule code must work without DOM/Pixi. Jotai owns selection/preferences and focused display projections; XState owns gesture phases or a justified bounded protocol; typed activity/process owners execute the simulation. The UI never reconstructs the world from its display model. A familiar/Devil/AI nation uses filtered revisioned observations and ordinary commands; text in a book, dialogue or tool response is content, not a grant of authority. Watchdog may later supervise durable AI work, but it never decides movement, resource settlement or simulation time.

Measure rather than promise 50/100 people or infinite detailed ecology. Query only eligible nearby work; batch dirty assignment through the existing optimizer; use topology-revision caches and spatial indexes where they help. Environmental arrays/worklists, due-process queues and bounded resident chunks address different costs. Retain detailed interaction around active people and changing boundaries, using explicit tested coarse models elsewhere. Never invent elapsed progress from current temperature after historical conditions changed.

Realm spaces initially share the same timeline. Hosted participants cannot privately accelerate it. Offline catch-up has a committed cursor, bounded work and no commands applied retroactively ahead of unfinished history. If exact detail is too expensive, define and prove the named coarse behavior rather than claiming a dormant world was fully simulated. Basic standing orders keep working without paid AI. Pricing, shared-realm access, offline danger and differential realm time remain product choices, not code assumptions.

Cloudflare's [coordination guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/#model-your-durable-objects-around-your-atom-of-coordination) supports grouping interacting state by logical coordination unit. The application still must choose the unit, persist correctly and prove handoffs; one DO per rendered terrain chunk is not an architectural requirement. A globe/minimap/realm atlas reads the same footprint-aware terrain source plus persistent changes and discovery permissions; coarse display is not another world generator or evidence that every cell is resident.

## Proofs that earn the larger game

1. **Finish upstairs, then one honest brew.** Those remain the current priority. Brewing establishes mixed goods/capacity, finite input sourcing, reusable hauling/work, unattended fermentation, one output and exact restore. A second recipe using that behavior must be data, not a copied activity pipeline.
2. **Give the brew a person to serve.** One actual visitor request and a visible bed/drink/relationship outcome establish hospitality. One visit may offer a recruitment conversation or useful lead; no whole market or faction simulation is required.
3. **Make one discovery teachable.** A known technique/strain, physical book/sample and a learner establish discovery, study, skill prerequisites and provenance. The reader can use it; possession alone grants neither practiced skill nor manufactured goods.
4. **Close one ecological loop.** A finite water source, player-built route and actual growing response establish geometry → water → plant consequences. A later waste/compost consumer shares resource and environmental owners; do not add every gas, organism and appliance at once.
5. **Connect one occult opportunity.** One original card/match outcome or alternate non-chess acquisition leads to one interpretable technique or encounter and a separate recruitment decision. It must survive duplicate commands/reload without duplicate rewards or people.
6. **Cross and return once.** One small home/otherworld pair, an existing person and real carried item, a saved change on the far side, and ongoing home work prove local realm identity. This can be a bounded diagnostic before opening large-world gameplay; access in the main game still follows Levi's tiny-map fun direction.
7. **Expand and host on demonstrated foundations.** World Lab and 5/25/50/100-actor measurements remain independent tracks. Real chunk crossing/save/eviction/caravan return then earns larger gameplay. Two clients in one authority precede two-owner visits and recoverable transfers; live Shiitake/DO/purchases require their separately authorized implementation scopes.

Steps 2–6 are the proposed connection order for discussion, not a new seven-feature sprint or committed schedule. Independent content/art/research may run in parallel; coupled simulation/Git/deploy ownership stays with Delivery. The integration test for each new system is a persistent useful effect in an existing loop, not simply a new panel or a larger map.

## What still needs a decision

The visual direction should reinforce this same world: familiar earthy materials by day, a welcoming warm home at night, and uncanny colored light in the otherworld. Levi's new Glomzy 07 reference is proposed as a base palette, with authored day/night/magic ramps studied together. Current game night is still a tint overlay; the shipped original fire study is baked lighting, not an implemented runtime LUT. The companion palette/night review specifies that comparison separately; this adds no art dependency to the upstairs or brewing release.

Exact card effects/repeat rewards; the first realm's sharing/access policy; portal return and danger rules; recruitment bargains; knowledge copying/secrecy economics; quantitative food/water/waste rules; spell effect vocabulary/costs and synergy bounds. Current prototype source has no realm-aware location, generic goods/process engine, social model or knowledge system. Existing commodity-specific storage branches and growing persistence/display validation deserve the next focused extraction when brewing supplies the real caller. This synthesis does not declare the foundation finished or erase recorded complexity/duplication advisories.

Delivery publication: one reader-facing record under existing docs/decisions, linked as the product/architecture synthesis from PROTOTYPE and ARCHITECTURE; associate existing #4/#5/#6/#8/#10/#13/#14/#15/#16/#17 rather than creating a new management board. Mark stale automatic-caravan sequences and historical schema/custody claims as superseded without erasing their evidence. Update new realm direction and the concept-room-versus-character distinction. Preserve original art, current scopes and upstairs/brewing work.
