# ADR: home, expeditions, and a living world

**Status:** accepted Game CTO direction, 2026-09-07. Levi approved the study synthesis and requested this record; specific open choices below remain undecided.

**Source authority:** [Prototype](../../PROTOTYPE.md) and [Architecture](../../ARCHITECTURE.md). This record develops the study synthesis and latest direct Levi direction; it preserves their active release order. Game-delivery owns serial publication to `docs/decisions/home-expeditions-and-living-world.md`.

**Scope:** future product and source boundary. It does not authorize a current-game change, backend, live model, pricing, dungeon generation, ECS, plugin system, or second simulation engine.

### Reading this record

**Accepted direction** records direct product direction already supplied.

**Hypotheses** name coherent future experiments, not commitments or estimates.

**Future seams** preserve current ownership until a real caller earns a change.

**Minimum proofs** are falsifiable slices; passing one does not establish a broader system or scale claim.

## Context

The confirmed playable sequence remains two-person home, stairs/upstairs bed, then generated chunks and one local caravan returning to a persistent home while another person works. Gear, deep crafting, magic, caves, husbandry, and farming follow those foundations.

Levi's durable loop is:

```text
home → prepare persistent party → expedition → return resources/knowledge
     → craft/build/trade/recover → venture again
```

The same people, possessions, animals, knowledge, and consequences pass through every stage. A cave return is not a detached reward screen; home is not an adventure-game waiting room.

The four studies establish inspiration from original sources. Hive conclusions are inferences unless marked **Accepted direction**.

## Decision

### Accepted direction

1. A persistent person can work at home, join a party, return with their possessions/history, recover, and work or travel again. Party membership, location, activity, and controller change without cloning the actor.

2. Preparation and return are meaningful play: choose people, ready supplies, equipment, destination, and retreat; return materials, items, discoveries, relationships, and leads that build, craft, trade, furnish, heal, feed, or inform a next venture.

3. Home must remain valuable to builders, gardeners, crafters, traders, caretakers, and recovering adventurers. Dungeon participation is not a compulsory universal grind, and found gear cannot make crafted goods irrelevant.

4. Construction and orders remain inspectable: show proposal, valid/blocked/support/material reasons, admitted receipt, responsible person/party, and later physical work. Floor/cutaway visibility presents the same world facts; it is not UI-owned occupancy or a second floor model.

5. Each future item instance has one physical custody and explicit location: equipped, ready/packed, actor cargo, animal cargo, home storage, workstation, expedition site, or another declared owner. Claims reserve availability/capacity; they do not create material.

6. The approved deep inventory direction may distinguish hands, equipment, ready belt, rotatable pack footprint, and storage. These choices must be legible and avoid junk-heavy sorting; layout, capacity, weight, stack policy, and UI are open.

7. Discovery is a shared loop: discovery → learning → recording, teaching, or trade → application. Books are movable know-how with subject/provenance; learned practice is separate actor/faction/institution state. An ID is neither global knowledge nor permission to view a secret.

8. Procedural mushrooms grow in physical batches. Sampling identifies a batch's pre-fixed appearance/effect; stored mushrooms retain their batch. Known strains can later propagate through sample/culture, suitable medium, conditions, and horticultural work, producing distinct physical batches. Use an authoritative epoch/seed, never client wall time in deterministic ticks.

9. Original donkey, llama, cow, sheep, and chicken art is current direction. Later pack animals/husbandry can join care, feeding, breeding, loading, milking, shearing, and egg harvesting to the home/expedition economy. Deep farming and fictional in-game drug cultivation/crafting are future content only; effects, discovery, production, storage, consumption, trade, and consequences should connect to the same authored item/recipe systems.

10. Familiar and Devil may become recruitable player-delegated AI stewards, diegetically consorting with devils or making pacts. A pact gives personality plus player-granted authority, never a separate simulation power. Commands, resource rules, and world clock are the same as human control; delegated work is inspectable and ordinary standing/direct orders work after absence, cancellation, failure, or future budget exhaustion.

11. The privileged global storyteller differs from a player's Devil/familiar helper. Its separate world-event grant delivers intent into deterministic authority; a player helper has only player-scoped actor/party/resource grants. Neither bypasses normal validation and settlement.

12. Separate controller and source-of-intent facts from admitted commands and from simulation activity/job/condition state. Player-directed, player-delegated, and world-directed name authority; fleeing, hauling, recovery, and conditions are domain states only where actual transitions need them. Do not create an actor mega-machine, a new XState-wide mandate, or an LLM control plane. Existing XState gesture ownership remains; structured activity states grow only from concrete transition/recovery needs.

### Hypotheses to test, not policy

- Procedural goblin caves/dungeons may be discovered across the world. Shared/instanced access, entry persistence, splitting, combat, loss, retreat, renewal, and faction response remain open.
- Recovery can include sleep, food, care, relationships, low-pressure work, and visible excursion effects. Stress, fear, injury, affliction, permanent loss, and command refusal are not inherited *Darkest Dungeon* requirements; cozy-dark tuning needs play evidence.
- Player shops/services may convert cave materials to requested gear, supplies, knowledge, or animal products. Demand, payment, quality, contracts, market scale, and pricing are not decided.
- Animals may carry supplies and provide milk, wool, or eggs after care/readiness. Breeding cadence, diet, shelter, disease, slaughter, yields, and trade value are content/product choices.
- Farming may join conditions → growth → harvest → storage/haul → recipe. Water, soil, light, pests, grafting, greenhouse needs, and fictional drug effects/recipes await authored design.

## Evidence and synthesis

### RollerCoaster Tycoon: visible construction and inspection

The [original manual](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf) documents footprint/orientation, invalidity/cost feedback, height/visibility controls, and inspection after testing. This establishes a player need for legible placement/consequences; it does not dictate Hive pause or right-click policy. Hive already intentionally admits commands while time is paused.

Chris Sawyer's [asset closeups](https://www.chrissawyergames.com/feature3.htm) describe 3D models pre-rendered for displayed scale, including source detail invisible at game scale. That supports original art composed for Hive's bake/presentation scale, not a requirement to reproduce the RCT renderer or its technical restrictions. RCT allowed quarter-turn camera rotation; a fixed isometric projection does not preclude rotation. Three-to-bake-to-Pixi remains useful only where image review proves it.

### Diablo: identity, ready gear, and finds

The [Diablo](https://ftp.blizzard.com/pub/misc/Diablo.PDF) and [Diablo II](https://download.blizzard.com/pub/misc/Diablo%20II%20Manual.pdf) manuals distinguish small ready belts from backpack capacity. The useful principle is an explicit readiness boundary beside deeper carrying capacity, not an action-RPG hotbar or Diablo loot tables.

A meaningful find needs a visible future: equip, ready, pack, store, install, consume, craft, or fulfil named demand. Semi-procedural gear can use authored parts/material choices, but random drops must not erase reasons to make, repair, commission, or sell gear.

### RuneScape: tangible production and specialization

Jagex's [RuneScape skills guide](https://www.runescape.com/game-guide/skills) is evidence for **RS3** chains such as mining → smithing/crafting and fishing → cooking. It does not establish identical Old School RuneScape rules/interfaces. The research note's OSRS fishing/cooking/smithing detail is community-maintained secondary evidence, useful only as examples of gather/process/use-or-trade.

One returned material can supply an adventurer kit, crafter recipe, home build, or shop order. Specialisation works where a service names inputs, knowledge/quality, destination, and exactly one physical-custody settlement. Cave loot, cargo, workshop inputs, stock, payment, and finished gear must not collapse into a global ledger.

### Darkest Dungeon: persistent history and recovery

Red Hook's [developer account](https://www.gamedeveloper.com/design/game-design-deep-dive-i-darkest-dungeon-s-i-affliction-system) describes legible pressure, individual recovery preferences, contextual signals, and accumulating hero history. The [original-game page](https://www.darkestdungeon.com/darkest-dungeon/) centres a team with concerns beyond combat. These support persistent people, inspectable effects, and home recovery; they do not require opaque rules or Darkest Dungeon's exact stress/loss mechanics.

## Existing architecture is the source boundary

Source inspection finds a real small shape: `main.js` submits intent; `orders.ts` validates/adopts ordered typed commands; `clearing.ts` runs the synchronous fixed tick; `jobs.ts` offers eligible work to pinned libcolony; `resources.ts` owns transfers/claims; `construction.js` owns literal recipes/footprints; Jotai provides display/selection preferences to `hud.jsx`, while the input seam in `keys.js`/`main.js` uses XState for gesture lifetime. Those owners are evidence, not rewrite placeholders.

The retained audit further shows `BUILDINGS` plus chop/build/rest are not a workstation-config runtime. Future ordinary recipes/job definitions should be data over supported verbs with schema/cross-reference validation. A novel activity—animal loading, milking, shearing, egg collection—must extend typed command/job/activity owners and prove a complete producer-to-outcome path. An asset/recipe row does not create behavior, animation, workstation rules, or a generic job DSL.

This ADR does not select a new ECS, plugin framework, or server runtime. Future measured workloads may justify changes to storage/query implementation. Preserve fixed-step authority, typed commands, exact claims, and libcolony assignment while those decisions are evaluated. A farm and a dungeon use the same simulation ownership. Event-driven updates, chunk residency, and offline accounting need measured workloads; none is a scale claim.

## Future seams and invariants

### Identity, location, custody, movement

- Stable IDs: actor, party, item instance, animal, mushroom strain/batch, book, job, claim, world/location. They persist across home, caravan, cave, chunk lifecycle, and eventual site transfer.
- One item has one declared custodian/location. A party is scope/travel intent, never duplicated inventory. An animal carries item IDs under this same rule.
- The first local caravan walks known cells, crosses a real chunk boundary, and returns cargo while home work continues. It preserves claims, jobs, IDs, and conservation; it proves neither remote transfer, shared caves, nor offline macro travel.
- Cross-site transfer needs a durable two-owner state machine only when two actual owners exist. Do not invent a protocol early.

### Content and activity boundaries

- Reuse movement, pickup, haul, delivery, cancellation, claims, and UI where a workstation/field/animal activity actually fits. A recipe can reference inputs/outputs and supported asset/animation behavior.
- A genuine new verb extends closed typed owners exhaustively. `loadAnimal`, `unloadAnimal`, `milk`, `shear`, and `collectEggs` need real readiness/care/target/custody semantics; they are not `build` labels.
- Cave returns use the same item/location/custody route as home materials. Farm growth, mushroom propagation, and animal care consume shared world facts; no separate engines.
- Stored mushrooms retain batch identity. A cultivated harvest has a new physical batch plus strain provenance. A book records know-how without becoming its exclusive truth.

### Interruption, recovery, and delegated activity

- An interruption has explicit authority/priority, job disposition, claim release/reassignment, carried-item custody, and recovery/resume rule. It must not silently destroy cargo or leave a reservation owned by a non-participant.
- Flee, retreat, direct player orders, caretaker work, and a future helper command are intent sources admitted through the same command authority. A stale LLM plan may be rejected because its observed revision, permission, target, custody, or job disposition no longer permits it.
- A pact record separates relationship/personality from verified principal, actor/party scope, resource/location scope, permitted command vocabulary, expiry/cancellation, and decision budget. Personality never widens grant.
- A future adapter binds player principal/current grant before filtered observation; it accepts fresh idempotent typed commands and returns accepted/replayed/rejected/conflict receipts plus long-work readback. A helper cannot nominate authority or see ungranted facts.
- The world settles helper commands exactly as player commands. Inspector/history exposes steward, grant, observation revision, command, receipt, work, resource effect, and waiting/rejection reason. Players retain ordinary orders, standing-order changes, and cancellation; no billing, model runtime, or backend is implied now.

## Minimum future proofs

1. **Animal custody:** load one owned item onto one cared-for pack animal, move it locally, unload once, and prove it never exists in actor/home/animal locations together. Reject failed care/readiness/capacity/custody checks visibly.

2. **Animal products:** first prove one product from one species through its authored care/readiness path into haul/storage and one use. Later milk, wool and eggs reuse this boundary where appropriate. A harvest cannot duplicate output by repeating a command; readiness replenishes according to the chosen husbandry rules. This does not establish the full breeding, nutrition or economy design.

3. **Mushroom knowledge:** sample one generated batch; retain appearance, effect, batch ID, and learned observation through storage/reload; propagate its known strain once into another physical batch. Knowledge changes what is known, never the stored effect.

4. **Cave return:** one persistent person leaves a known local entrance with one item, returns with one useful material/knowledge record, and uses it in a concrete home build/craft/storage outcome while another person works. Verify actor/item/claim identity, fixed-tick replay, and no reward inventory.

5. **Delegated order:** one player-granted familiar/Devil observes bounded scope, submits one existing permitted build/work command, harmlessly replays its ID, and reads the outcome. An out-of-grant request is typed rejection without a leak; human orders work before/after cancellation.

6. **Flee interruption:** an actor flees a mid-loaded haul to safety, then resumes or is reassigned. Prove cargo stays physically owned, the old reservation releases/reassigns exactly once, job disposition is explicit, and no cargo/reservation is lost or duplicated. This is a future proof only, not a flee implementation.

## Alternatives and tradeoffs

| Alternative | Decision and reason |
| --- | --- |
| Separate dungeon party/reward inventory | Reject: breaks persistent identity, custody, return stories, and home conversion. |
| Giant farm/dungeon/animal research engine | Reject: each needs a real consumer; existing commands/jobs/resources are the shared base. |
| All production as generic config rows | Reject: current source has no runtime. Ordinary recipes may be data; new verbs need code/proof. |
| Actor mega-state machine or XState-wide domain mandate | Reject: controller/intent, commands, and activity/job/condition states differ. Extend structured activity only for a real transition/recovery caller. |
| Devil has broad mutation rights | Reject: pact personality is not authority; normal validation keeps delegation inspectable. |
| Copy RCT/Diablo/RuneScape/Darkest Dungeon wholesale | Reject: evidence informs design, not Hive economy, pause, stress, renderer, or progression. |
| ECS/server/plugin rewrite before a demonstrated need | Defer: measure the concrete workload and inspect a caller first. A later storage or host change must preserve domain authority. |

## Feedback and pacing

The colony needs satisfying decisions while a shared world clock advances. Immediate feedback includes selection, placement previews and command receipts; job feedback includes visible carrying, construction and clear waiting reasons. Longer preparation/adventure/recovery arcs are a roughly half-hour play hypothesis, with lulls and peaks rather than a rigid raid schedule. The first ten minutes should teach through the familiar, complete something useful, and offer an understandable choice and payoff.

Optional occult mini-chess, tarot, companionship, gardening and crafting give players meaningful quieter activities. Those activities must be interruptible when the colony needs attention. The shared world does not freeze because someone opens a card table. Artificial delays, mandatory dungeon grinding, and forcing payment for basic competent standing orders would undermine this direction.

## Release order

1. Finish accepted two-person home and controls.
2. Build/use stairs and upstairs bed with level/cutaway comprehension.
3. Prove chunk continuity and save/evict/reload; then local caravan departure/return with real cargo while home work continues.
4. Choose one proof only after its real caller/content boundary exists; animal load/unload or cave return are stronger first cuts than broad husbandry, farming, combat, or AI stewardship.
5. Consider persistence/site transfer, grant-filtered delegation, broader production, and offline behavior only when the prior proof shows the actual needed seam.

## Open choices

- Entrance discovery; shared/instanced/renewable/persistent caves; party size; retreat; injury/loss/recovery; whether emotions ever constrain commands.
- Inventory rotation/footprint, ready-kit and animal capacity, and whether animals enter caves or only join caravans.
- Animal welfare/breeding/product cadence/nutrition/habitats; farming/cultivation conditions; mushroom epoch/timezone/regrowth/gift identification/thresholds.
- Shop/service demand, payment, custody settlement, pricing, and crafted-value balance.
- Pact vocabulary, personality expression, player controls, budget/expiry, storyteller authority, and the specific transitions that need a structured activity state.

## Primary sources

- [RollerCoaster Tycoon original manual](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf)
- [Chris Sawyer's asset closeups](https://www.chrissawyergames.com/feature3.htm)
- [Diablo original manual](https://ftp.blizzard.com/pub/misc/Diablo.PDF)
- [Diablo II original manual](https://download.blizzard.com/pub/misc/Diablo%20II%20Manual.pdf)
- [Jagex RuneScape skills guide (RS3)](https://www.runescape.com/game-guide/skills)
- [Red Hook developer account](https://www.gamedeveloper.com/design/game-design-deep-dive-i-darkest-dungeon-s-i-affliction-system)
- [Red Hook original-game page](https://www.darkestdungeon.com/darkest-dungeon/)

## Review note

Astra personally read the four completed study notes, current command/job/resource callers and this record. This decision preserves home → upstairs → caravan and current source owners. Its risks are mistaking hypotheses for shipped systems, inventing an engine before a caller, or claiming scale/offline behavior without measured proof.
