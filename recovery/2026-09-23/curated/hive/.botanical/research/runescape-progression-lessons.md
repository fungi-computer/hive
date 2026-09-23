# RuneScape progression lessons for adventurer/crafter coexistence

Read-only research, 2026-09-07. This is reference material for future Hive
direction, not a claim about the current game. Modern RuneScape and Old School
RuneScape are separate references below.

## Primary facts

Jagex’s current [RuneScape skills guide](https://www.runescape.com/game-guide/skills)
says skill actions award XP, higher levels unlock activities/equipment/locations,
and explicitly describes these chains:

- Mining obtains ore for Smithing, Crafting, Invention, or sale; Smithing turns
  ore into bars/items; higher levels unlock better materials and items.
- Fishing retrieves food; Cooking makes fish edible; Woodcutting produces logs
  for Fletching, Firemaking and Construction; Crafting makes jewellery, leather
  armour and battlestaves; Fletching makes bows, arrows, bolts and crossbows.

These are current RuneScape/RS3 descriptions, not proof that Old School uses
identical unlocks or interfaces. Jagex’s [Ironman guide](https://www.runescape.com/game-guide/ironman)
is useful for the social boundary: Ironman disables player trades and Grand
Exchange trades (apart from Bonds), framing gathering/crafting as a self-supply
choice rather than a universal requirement.

For Old School detail, the [community-maintained OSRS Fishing page](https://oldschool.runescape.wiki/w/Fishing)
says fish can be cooked into combat food or sold, and higher Fishing levels
open more fish and improve catch rate. The [OSRS Cooking page](https://oldschool.runescape.wiki/w/Cooking)
says raw fish are cooked at a fire/range and that players can gather their own
inputs or buy them through the Grand Exchange. The [OSRS Smithing page](https://oldschool.runescape.wiki/w/Smithing)
describes selecting an item at an anvil and continuing a chosen quantity until
the quantity, bars, level-up, or safety conditions stop the action. These wiki
details are secondary evidence, not Jagex specifications.

Jagex’s [Old School Bonds page](https://www.runescape.com/oldschool/bonds)
confirms direct player trade and Grand Exchange trade as distinct exchange
routes. It does not establish player-owned shops or local crafting services;
those remain Hive’s requested design direction.

## Two concrete decision loops

1. **Adventurer food loop (OSRS reference):** choose whether to catch fish,
   bank raw fish, cook locally, or sell catches; cooking level and available
   fire/range affect the route, while cooked fish becomes combat sustain. The
   choice trades immediate food, XP, travel/time, and gold. The underlying
   gather → process → use/trade chain is documented by the Fishing/Cooking
   pages above.
2. **Material crafter loop (Jagex skill reference):** choose whether to mine
   ore for personal Smithing/Crafting, sell the ore, or buy inputs and spend
   time making a higher-value item. Skill XP unlocks better outputs while
   equipment/location access changes what is feasible. This is directly grounded
   in Jagex’s skills descriptions; the economic optimization is an inference,
   not a claim about a particular market algorithm.

## Useful Hive lessons

- Let one physical resource support distinct outcomes: a cave return can feed
  the adventurer’s own gear, a crafter’s recipe, or a shop order. Skill/knowledge
  unlocks should widen available recipes and locations while preserving the
  player’s choice to gather, buy, commission, use, or trade.
- Make specialization useful through local services: a gear crafter can turn
  returned ore/leather into a requested item, while an adventurer supplies rare
  cave inputs. A service order should name required inputs, quality/knowledge
  requirements, destination and payment, then settle physical ownership once.
  This is a design recommendation, not an implemented Hive service system.
- Preserve multiple scales of progress: immediate item utility, visible skill
  knowledge, and access to new places/recipes. A small shop can therefore matter
  before a player reaches endgame gear, without requiring every actor to learn
  every trade.

The pitfall is turning RuneScape’s broad skill chain into a mandatory universal
grind or silently shared ledger. Hive should keep cave loot, workshop input,
finished gear, shop stock, payment, and actor cargo as separately owned facts;
the current claim/material rules are a better foundation than a global market
or assumed offline economy. Nothing here claims procedural goblin caves,
return simulation, player shops, gear crafter AI, server economics, or offline
progress currently exists.
