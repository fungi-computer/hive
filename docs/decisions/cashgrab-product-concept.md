# Cashgrab.io: corporate fortresses as playable advertising

Status: recorded product concept; it does not replace the active Clearing sprint.

> **Corporate advertising you can shoot, loot and destroy.**

Cashgrab.io is a squad extraction game built on Hive. A player controls roughly
four raiders, enters a temporary shared map, steals valuable goods and tries to
extract alive. The tactical feel can borrow from XCOM and extraction games, but
the world runs in real time so movement, cannon fire, destruction and other
players remain part of one living match.

The central landmark is the Fungi Coliseum, advertising fungi.computer. Companies
lease the surrounding districts. They do not receive player squads. They author
fortified branded places for everyone else to raid: walls, guards, traps, towers,
cannons, treasure rooms and eventually programmable defenses. Paying more may
buy a larger bounded defense budget, but a stronger fortress must also yield more
loot, prestige or seasonal rewards. Difficult districts should attract raiders
rather than become irrelevant invulnerable advertisements.

A match resets its physical map and combat state. Sponsor designs, purchased
budgets and player progression may persist outside the match. Each match pins an
immutable sponsor-design version so a sponsor cannot change defenses underneath
an active raid. Sponsor content is admitted through typed game capabilities and
validated definitions. It does not receive arbitrary privileged code or direct
world mutation authority.

## First playable shape

The first credible match should prove the business joke and the engine together:

- one Fungi Coliseum and several visibly branded fortified districts;
- small four-character squads with shared selection, formation and action tools;
- physical cannon projectiles, cover, destructible walls, knockdown and loot;
- a clear enter, raid, carry and extract loop;
- bots filling unused squad slots so a match remains playable at low attendance;
- sponsor defense budgets that visibly trade danger for reward;
- a reset that produces a fresh match from pinned definitions and receipts.

Start around twelve squads of four, mixing humans and bots. A hundred human
squads would mean about four hundred controlled actors plus defenses and should
be treated as a measured later target. The first version should use one
authoritative match owner. Split regions or move a hot match to a larger host
only after measurements show that communication and coordination will repay the
cost. The engine API must remain host-independent so this scaling choice does
not leak into game content.

## Shared engine and product mechanisms

Cashgrab should dogfood the same reusable mechanisms as the current demos:

- Bevy ECS and Rust systems for movement, navigation, collision, projectiles,
  damage, destruction, inventory and deterministic world mutation;
- TypeScript definitions for sponsor content, loot tables, defense budgets and
  match rules;
- the shared client for selection, formations, targeting, camera and feedback;
- Whistle descriptions for the same typed actions used by humans, bots and
  Shiitake controllers, with Hive retaining admission and world truth;
- durable command identities, committed receipts and replayable world events;
- the common Three-to-pixel-art asset pipeline and its MCP authoring operations;
- the existing RTS cannon, projectile arc and impact work rather than a new
  combat implementation.

Cashgrab is a strong future consumer for destructible terrain, formation control,
physical projectiles and server-published capabilities. Those mechanisms should
be generalized when their current Clearing, RTS, survival or pirate consumers
need them. This concept is not permission to divert the current Clearing sprint
or create speculative framework layers.

Candidate plain-language pitch: **Companies pay to build fortresses. You drop in
to rob them.**
