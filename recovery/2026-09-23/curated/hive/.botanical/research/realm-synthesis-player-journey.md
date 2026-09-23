# Hive: a player journey from inn to the Purple Portal Realm

**Status.** Product synthesis from the retained studies and the accepted
[home/expeditions direction](../../docs/decisions/home-expeditions-and-living-world.md).
This is a player-story proposal, not a claim that its future systems are
shipped or that they need a new runtime.

## The reason to play

Hive is about making a peculiar, cozy-dark inn and its grounds into a place
where strange people can belong, recover, make useful things, and dare to go
somewhere unsettling. The player does not merely accumulate a colony or clear
a dungeon: they make the home capable of receiving a person back changed, then
decide what that change makes possible. A goblin guest, a damp garden, a
half-learned recipe, a tired caravan, a familiar with a limited promise, and a
door glowing violet all become reasons to improve the same lived-in place.

The lasting sandbox motive is to build a community with a history and choose
how it reaches outward: hospitable inn, careful garden and workshop, odd
arcane salon, dependable caravan stop, or a mixture. Progress is visible in
rooms that work, people with remembered roles, physical supplies and books,
known routes, and relationships—not in a detached reward screen.

## A six-beat player journey

1. **Make a habitable corner.** Two people turn a tiny rough house into an inn
   worth using: clear space, build stairs and an upstairs bed, keep food and
   wood where workers can reach them, and give a visitor somewhere to sit or
   sleep. The player learns by ordering a real action and watching a person
   carry it through.
2. **Make the grounds sustain the house.** A garden needs a finite water source,
   tending, harvest and storage. A crop, mushroom batch, or gathered herb
   becomes a carried ingredient. Brewing, cooking, craft and furnishing turn
   that material into a named use—comfort, a travel supply, a requested good,
   or an invitation—not abstract income.
3. **Make a small cast.** Visitors, goblins, workers, and later recruits arrive
   as particular people with a place, cargo and a reason to stay. Recruitment
   or spawning must be an authored arrival/event with needs and consequences,
   not a population counter. Ordinary residents keep shared jobs while a
   drafted person can receive a direct order.
4. **Make knowledge and magic social.** A found book, map, recipe, plant sample,
   tarot reading or chess-like ritual changes what a person or institution
   knows, while the physical book/item still has an owner. A familiar or Devil
   can be a characterful delegated steward only within a player-granted scope;
   its orders use the same claims, clock and visible receipts as everyone else.
5. **Risk a departure that matters.** Prepare a named person or party with a
   compact ready kit, then send them by a local caravan route or into a cave.
   The decision is how far to press, what to carry, whom to trust, and when to
   retreat. Home continues to run; the expedition returns with a material,
   piece of knowledge, relationship, or problem that is useful there.
6. **Choose the strange routes outward.** A purple portal can lead to a
   visitable Wizard Realm: a distinct, authored otherworld with its own people,
   places and factions, rather than a school-wizard theme or a separate loot
   game. It must obey the same identity, custody, preparation, return, and
   faction-event rules as a caravan or dungeon. The purple realm broadens the
   home story; it does not replace the inn as the place where discoveries are
   understood, made useful, and lived with.

The rhythm is home → prepare → depart → return → convert/recover → choose the
next connection. Tarot, chess, gardening, companion scenes and brewing make
the quiet half active; caves, caravans, factions and portal journeys provide
the pressure that gives the quiet half weight.

## What the retained studies actually support

| Reference evidence | Useful Hive inference | Do not inherit |
| --- | --- | --- |
| The original [RCT manual](https://cdn.akamai.steamstatic.com/steam/apps/285310/manuals/rollercoaster_tycoon.pdf) documents constrained placement, invalidity/cost feedback and inspection after testing. | Every order, build, garden or service should show proposal → receipt → visible work/result, so watching the inn is satisfying. | RCT's pause/build rule, theme-park economy, renderer, or a universal right-click rule. |
| [Diablo](https://ftp.blizzard.com/pub/misc/Diablo.PDF) and [Diablo II](https://download.blizzard.com/pub/misc/Diablo%20II%20Manual.pdf) distinguish ready belt capacity from a deeper backpack. | Preparation needs an understandable ready-kit/cargo boundary, and a find needs a named place: equip, carry, store, install, craft, or serve. | Action-RPG combat, junk drops, or Diablo's loot tables. |
| Red Hook's [developer account](https://www.gamedeveloper.com/design/game-design-deep-dive-i-darkest-dungeon-s-i-affliction-system) describes legible pressure, individual recovery preferences and accumulating hero history. | Persistent residents can leave, return, recover and retain history; home care has gameplay meaning. | Mandatory stress, opaque refusal, permanent loss, or Darkest Dungeon's tuning. |
| Jagex's [skills guide](https://www.runescape.com/game-guide/skills) documents chains such as mining → smithing/crafting and fishing → cooking. | One physical return can feed a workshop, travel kit, home improvement or a requested service; specialization creates interdependence. | Universal skill grinding, a global ledger, or a market simulation. |
| The [Stronghold Crusader manual](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/40970/manuals/Stronghold_Crusader_HD_Manual_-_English.pdf) shows inspectable stores, routes and material chains. | Space, storage and delivery make the inn's ecology and later defenses readable; rooms and routes should alter actual possibilities. | RTS war scope, one popularity score, or a death spiral. |
| Klei's public [ONI discussion](https://www.gamedeveloper.com/design/layering-challenges-in-klei-s-survival-sim-i-oxygen-not-included-i-) describes interacting simulations with deliberate simplification. | A few conserved, diagnosable conditions—water, smoke/air, heat, plant state—can make gardening and rooms consequential. | Full fluid chemistry, an ONI solver, or simulation for its own sake. |

All entries in the middle column are Hive proposals. The studies provide design
patterns and boundaries; they do not establish this game’s combat, economy,
multiplayer, procedural world, faction, or AI behavior.

## Five tensions to resolve deliberately

1. **Care versus danger.** Expeditions need stakes, but the inn must remain a
   rewarding choice for builders, gardeners, crafters, hosts and recovering
   people. Do not make dungeon participation the only efficient progression.
2. **Useful scarcity versus chores.** Water, smoke, storage and cleanliness are
   interesting when a named condition stops a named outcome and has a visible,
   recoverable fix. Constant hygiene hauling, invisible decay, or free teleport
   pipes would both flatten the intended loop.
3. **Physical truth versus friction.** One item needs one custodian across
   actor, animal, home, caravan, dungeon and portal. That must remain legible
   without turning every return into inventory Tetris or a reward inventory.
4. **Magic/AI personality versus authority.** Tarot, Devils, familiars and the
   portal realm can be uncanny and playful, but no helper may silently create
   material, widen knowledge, bypass player permission, or hide a failed job.
5. **Breadth versus a lived first map.** Recruitment, factions, dungeons,
   caravans and the wizard realm need a concrete reason to connect before they
   scale. Avoid a portal/realm that becomes a superior loot farm or a faction
   system that reduces people to species reputation.

## Two tiny-map connection proofs

### 1. Garden-to-inn service

On the existing tiny home map, collect one finite water item at a well, have an
ordinary worker deliver it to one garden patch, harvest one physical herb, and
brew one named drink at one simple station. A specific visitor consumes it or
accepts it as an order; the player can inspect the water, ingredient, brew,
worker and visitor outcome. The visitor then uses the upstairs bed or offers a
single concrete lead. This proves water → labor → crop → custody → craft →
hospitality/recruitment without a market, multiplayer, broad farming, or a
hygiene simulation.

### 2. One portal return

A named resident prepares one carried item at the inn, enters a clearly purple
portal to one tiny authored Wizard Realm room, completes one non-combat
interaction with one wizard/faction representative, and returns with one
physical object or recorded piece of knowledge. At home that return unlocks
one visible use: a recipe, a tarot/chess interaction, a crafted tool, or a
new invitation. Inspect the same person, item custody, command receipts and
relationship before/after. This proves a visitable realm and a home return;
it does **not** prove general portals, dungeons, caravans, procedural worlds,
faction diplomacy, AI delegation, or multiplayer.

## Product guardrail

Build the smallest home loop until it is pleasant to watch and revise. Each
new route—caravan, cave, portal, or delegated helper—earns entry only by
bringing one persistent person or thing back into that loop with a visible new
choice.
