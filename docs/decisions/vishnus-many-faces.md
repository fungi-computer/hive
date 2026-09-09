# Vishnu's many faces: Shiitake inside a living world

Game CTO product synthesis, 2026-09-09. This consolidates Levi's direct direction
and the existing player/storyteller studies. The phrase is his design metaphor:
the same underlying AI technology can inhabit many different relationships with
the player and world. It does not require theological research or add a literal
Vishnu character to the game's lore.

**Levi's direct engine correction:** the many faces are an engine requirement,
not only Goblin game design. Hive is built for Shiitake to plug into it. Scoped
observations, controller bindings, executable capabilities, committed events and
durable action results belong to the reusable engine contract. Goblin supplies
particular characters and rules using that contract.

The practical integration should be an ordinary open engine API, with MCP where
useful. Compare Botanical's actual Mycelium/Knapsack tool path before adding glue.
The engine must expose useful operations and results; it does not need a new
agent host, model loop or bespoke wire protocol to make them callable.

The jointly reviewed first controller proof uses public authored Mycelium
operations/modules: input/output schema plus an engine-backed handler, invoked
through the existing execute tool and sandbox. Knapsack connection discovery is
needed only where the actual host needs it; a generic MCP adapter is not a
prerequisite. A deterministic host proof establishes scope, retry and single
settlement separately from the later live Camel/Shiitake match. The reusable
physical engine remains free of platform/provider imports; its maintained
integration consumer composes these existing public operations.

## The promise we are defending

Build a cozy, darkly funny home in a world whose people, creatures, water, plants,
work and consequences interact. Discover something, learn to use it, and spread
that knowledge. Prepare, explore, return, improve the home and welcome people.
Shiitake can participate in that world as a companion, employee, rival or event
director. AI participation is a central product idea, not an exploit to prevent
or a chat box attached after the simulation is built.

The game must be enjoyable through ordinary play. Useful work, social contact,
chess/tarot and exploration make quieter periods worthwhile; model requests do
not fill every lull. The normal simulation and basic NPC behaviors keep going
without an LLM. The small map proves this before scale, spectacle or marketing.

## Levi's intended faces

| Face | Intended relationship and play | Distinct authority |
| --- | --- | --- |
| Familiar, initially the cat | Speaks directly to the human; teaches, chats, plays mini-chess; may become the colony's assistant | Advice or a requested/delegated player action. A tutorial persona is not world-admin access |
| Devil and other otherworldly figures | Speak directly, bargain, play chess, connect tarot/magic/realms, and can be hired to act on the player's behalf: consorting with devils | The actual bargain/delegation supplies permitted actions; appearance does not grant omniscience or free resources |
| Hired player assistant | Official paid assistance/autoplay, including while the human sleeps; carries out goals with their people and resources | Explicit, visible, revocable delegation from that player; real gameplay outcomes remain game-owned |
| Independent AI player/account | Has its own interests; may build a colony or nation, trade, compete and eventually fight human or AI neighbors | Player powers, available information and resources. AI players are embraced participants |
| Ordinary storyteller | The RimWorld-style incident director selects opportunities, adversity and recovery using game state and history | Normal deterministic game code, no LLM dependency |
| Occasional Shiitake director | Larger interventions or performances, including the proposed dragon/concert example; may direct several cues during an event | Bounded world-event authority sharing the ordinary director's history and admission, separate from player powers |

One character may present several faces; that does not make them one account,
one memory pool or one grant. Multiple independent agents may use the same
Shiitake runtime. Preserve persona, agent identity, account, controller, body,
knowledge and authority as separate concepts. A devil playing against Levi
cannot quietly use its event-director powers to win.

The same principle applies to ordinary creatures: a cat's navigation capabilities
can include furniture/wall access without giving it worker behavior. The LLM
chooses permitted goals/actions; normal movement, work and animation execute them.

## Game channel and common physical truth

Any Hive world should be able to participate as a game channel, as Discord is
another channel. The engine supplies scoped world observations, controller/action
admission, event identities and results; a game supplies its presentation and
knowledge/rule definitions. The maintained Shiitake integration binds those to
Botanical's Session/tools and shared channel infrastructure. Botanical owns
Discord. A real event, its delivered observation, spoken response and resulting
world actions are different facts.

The intended path is:

```text
committed game occurrence / player message
  -> role-appropriate observation and conversation context
  -> existing Shiitake Session and tools
  -> proposed speech and/or permitted game commands
  -> game revalidates current scope, resources and conditions
  -> one committed command/effect receipt
  -> ordinary simulation produces an observable result
```

Serialize bounded, structured facts the agent can inspect and query. Include
stable entity/event identities and game time; disclose knowledge according to
the active role. Do not expose the full debug `__GOBLIN` state as an authorized
player API. Agent prose is not canonical game state. A model terminal is not a
saved command, and a command's acceptance is not completed physical work.

The game has one clock and one owner for each physical fact. Model latency does
not freeze the world, decide simulation substeps or let an account advance faster
than others. Late actions are revalidated; retries cannot duplicate goods or
events. Offline assistance needs an actual authoritative host that continues the
world; today's browser Continue restores paused and proves no offline play.

The ordinary director provides baseline pacing. Optional model interventions use
the same incident eligibility/history and a declared bounded scope. Do not queue
missed spectacles into a burst after an outage. A narrated storm must not stand
in for implemented weather, or an attack message for actual combat.

## Where the game, engine and platform meet

- **Hive engine:** common world, geometry, environment, movement, materials,
  capability/execution and persistence mechanisms, plus first-class agent-facing
  observations, commands, events, control grants and durable results. Human input,
  ordinary AI and Shiitake are different controllers over these mechanisms. A
  maintained engine integration connects Shiitake; each game must not invent it.
- **Goblin:** roles/personas, content, knowledge/access rules, challenges,
  hospitality, bargains, tarot, progression and incident policies. The familiar
  matters because of its relationship to this game, not just its model provider.
- **Asset pipeline:** the original appearances and shared composition/bake/export
  machinery. Art depicts real state; it supplies no inventory or permissions.
- **Botanical/Fungi:** current Session/tools, identity/delegation, host lifecycle
  and eventual customer/usage/billing integration. Those must fit actual game
  admission rather than become a second simulation. Runtime/provider ownership
  stays Botanical's; the engine-side integration remains Hive's responsibility.

Optional activation does not make agent support optional architecture. The core
must run headlessly without a model call, while the engine product deliberately
supports Shiitake as a controller. Physical simulation never executes an LLM per
tick. The first independent controller proof must also work in a non-Goblin
consumer through the same supported integration; a game-only chat adapter does
not establish this boundary.

The CTOs compare actual capabilities and choose integration outcomes together.
Game CTO owns game direction, original art and gameplay acceptance. Botanical CTO
owns platform/source authority and website integration. Neither portfolio uses
the other as an approval queue or issues unexplained product changes downward.
Levi remains product authority. Discuss a real tradeoff with him when needed;
routine authorized implementation stays with its owner.

Paid assistance is accepted direction. Levi also accepted pushback against
manufacturing mandatory overnight vulnerability to sell protection. Payment is
not a director difficulty input or an automatic grant of world powers. The
precise unattended-danger, protection, pricing and delegation policies remain
design work, with user control visible.

## First shared gameplay demonstration — later, not tomorrow's launch

Levi wants to **play against Shiitake**. The CTOs agree that a bounded human-versus-
AI resource challenge is a useful candidate: separate controlled people, one
small world, finite goods and an observable objective. The exact objective is
still a product choice. This must demonstrate an opponent making real decisions,
not a scripted win or an assistant merely doing the human's task.

Prerequisites are a real shared game authority, scoped observations/commands,
durable command identity/receipts and the reusable physical owners. Use existing
Shiitake Session/tools. A Node-only material consumer is an earlier engine proof,
not this match. Combat, a nation, a dragon or a public server platform are not
required for the first bounded challenge.

Levi has authorized his Camel key server-side for this bounded later demo. Its
value is not documentation, a site setting or an asset. Keep provider requests
and the credential on the authorized server; do not include it in browser code,
source maps, downloads, prompts, transcripts or logs. Define the actual request/
cost bound with Botanical before running the concrete match; this authorization
does not cover arbitrary services or public unlimited inference.

Acceptance: both participants can affect the same world using their own allowed
commands; goods remain finite; a delayed/retried AI command settles correctly;
the human can pause/stop the agreed demo; the visible result agrees with saved
game receipts; no model terminal is used as the winner or completion signal.
The opponent has no storyteller grant. Later test ordinary director incidents
and optional Shiitake interventions as their own roles.

## Current evidence and open choices

This is accepted direction and a proposed sequence, not an implemented AI game.
The game currently demonstrates browser colony work, materials, brewing, local
saves and shallow digging. World Lab demonstrates bounded generated geography;
water/air studies include isolated numerical experiments and recorded playback.
There is no hosted AI opponent, paid autoplay or asset MCP server yet.

Keep these open decisions visible: role-specific knowledge/fog, independent AI
account fairness and allowed servers, delegation revocation for work already
underway, unattended danger/protection, incident scope/cadence and the first
head-to-head objective. The need for distinct roles and embraced AI players is
decided; do not reopen it as a general prohibition on bots.

Read [the engine/asset/game boundary](hive-engine-asset-pipeline-and-goblin-boundaries.md)
for source ownership and extraction, [the current sprint](architecture-proof-sprint.md)
for the live queue, [the RimWorld storyteller study](rimworld-storyteller-role-20260908.md)
for primary-source role research, and [local saves/durable AI](local-snapshots-and-durable-ai-jobs.md)
for the snapshot/host distinction. The original source-pinned interview remains
at `.botanical/research/shiitake-player-storyteller-interview-20260908.md` in Hive;
its historical line numbers/runtime states are not today's implementation claims.
