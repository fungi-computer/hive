# Realm, magic, cards and delegated actors — direction inventory

Read-only synthesis, 2026-09-07. This file inventories current decisions and
open hypotheses for a later realm layer. It does not change the active home
implementation sequence.

## Approved direction

- The purple-portal/wizard image represents a visitable separate **realm**,
  analogous to a Nether-like otherworld. It is its own destination/world
  context, not a Harry Potter setting and not merely a character skin or a
  dungeon room. The image is direction for a future realm visit; its rules,
  geography and inhabitants remain to be authored.
- A visit preserves actor identity, possessions and learned spells. The
  destination uses the same cross-world identity transfer and permission
  boundary as other visits; a shrine does not create a second teleport
  authority. [ARCHITECTURE.md:197-200, 225-230](../../ARCHITECTURE.md),
  [PROTOTYPE.md:475-483](../../PROTOTYPE.md).
- The first playable home remains the authority and priority. Current order is
  tiny-map depth, two-person home, upstairs bedroom, then chunks/caravan and
  later homeland visits/background work. Brewing is the first workstation slice
  after upstairs. [PROTOTYPE.md:66-100](../../PROTOTYPE.md),
  [latest-world-direction-20260907.md:386-392](latest-world-direction-20260907.md).
- Magic belongs to the future discovery/learning loop, not a global unlock:
  discovery → learning → recording, teaching or trade → application. Books
  carry subject and provenance; an actor's learned practice is separate state.
  [PROTOTYPE.md:287-306](../../PROTOTYPE.md),
  [latest-world-direction-20260907.md:116-140](latest-world-direction-20260907.md).
- Occult minichess is a 4×4 capture-the-king/regicide game. A threatened king
  may remain threatened until captured. Fate Chess establishes Card/Dice/Direct
  asymmetry and narrative reference, not a board implementation or exact
  openings. [PROTOTYPE.md:336-341](../../PROTOTYPE.md),
  [fate-chess-play/README.md](fate-chess-play/README.md).
- Bramble is the first otherworldly familiar: tutorial/companion, direct player
  address, chess participant and possible later bounded delegate. The recurring
  Devil/demons are separate player-facing otherworldly characters and may be
  chess/tarot/magic interlocutors. Familiar, Devil and storyteller grants are
  distinct; dialogue never grants unrestricted simulation mutation.
  [PROTOTYPE.md:343-350](../../PROTOTYPE.md),
  [latest-world-direction-20260907.md:327-346](latest-world-direction-20260907.md).
- Shiitake/AI access, when eventually hosted, is a bounded principal/grant over
  filtered observations and typed idempotent commands. The world host remains
  the sole validator, simulator and writer; familiar, AI-colony and storyteller
  grants remain distinct. [shiitake-game-tools.md:62-100](shiitake-game-tools.md),
  [ARCHITECTURE.md:742-747](../../ARCHITECTURE.md).

## Open hypotheses

- Chess may award physical pieces/cards; wins may teach or grant magic; Major
  Arcana may create arrival or recruitment opportunities. These are connected
  hypotheses, not locked effects. [PROTOTYPE.md:319-358](../../PROTOTYPE.md).
- Tarot prototypes include Fool introducing the first person, Lovers creating a
  bonded pair, and rare Arcana creating opportunities to recruit powerful
  people. Ordinary visitors and other recruitment routes remain valid. A card
  cannot silently bypass consent, capacity, identity or party admission.
- Summoning and recruiting must remain separate concepts: a card/realm event can
  create an encounter or arrival opportunity, while recruitment is an explicit
  admission into a party/world with identity, permission and capacity checks.
  Exact bargains, rewards, card effects, family dynamics, shrine rules, realm
  geography and magic definitions are open.
- A first Major Arcana presentation should be one original Three-authored scene
  through the existing low-resolution bake, in one readable card shell, proved
  native and enlarged before a set. Technonomicon supplies layout/presentation
  lessons only; no external art, CSS, renderer or 22-card build is selected.
  [ARCHITECTURE.md:203-214](../../ARCHITECTURE.md),
  [technonomicon-cards.md:70-90](technonomicon-cards.md).
- Realm visits, shrines and later AI should consume the established world/party
  ownership seam. They should not introduce a generic plugin bus, a second
  clock, a live model scheduler, or a separate teleport authority.
  [ARCHITECTURE.md:154-160, 197-200](../../ARCHITECTURE.md).

## Big-picture plan and pseudocode

1. Finish and measure the everyday home, upstairs bed and brewing slice.
2. Establish stable actor/party/world IDs and ownership before caravan/chunk
   crossing; learned spells reference stable definitions plus actor learning
   progress.
3. Prototype one original Major Arcana card and one 4×4 capture-the-king game
   as isolated presentation/content studies. Keep rewards as typed proposals.
4. Add one familiar/Devil encounter as authored dialogue and event input, then
   prove one filtered delegated familiar action through the world authority.
5. Add one realm visit through the same identity transfer used by homeland
   visits. A shrine is a destination/permission affordance, not a new authority.

```text
discover(actor, subject, source):
    record discovery(subject, provenance=source)

learn(actor, discovery):
    actor.knowledge += learnedPractice(discovery)

record_or_teach(actor, discovery, medium):
    createBookOrTeachingEvent(discovery, provenance=actor, medium)

playOccultMatch(participants, board4x4, role):
    result = captureTheKing(board4x4, role)       # Card/Dice/Direct are choices
    return rewardProposal(result)                 # card/piece/encounter, not auto-recruit

resolveCardOrRealmOpportunity(world, actor, opportunity):
    event = world.validateEvent(opportunity)
    if event.arrival:
        candidate = createOrTransferIdentity(event)
        return world.offerAdmission(candidate, consent, capacity, permissions)

visitRealm(world, party, shrine):
    world.validateDestinationAndGrant(party, shrine)
    transferSameIdentitiesPossessionsKnowledge(party)
    realmWorld = authoritativeDestinationWorld(shrine.realm)
    return realmWorld.acceptVisit(party)

game.command(principal, grant, revision, intent):
    observation = filteredObservation(principal, grant, revision)
    return world.validateAndCommit(intent, observation.revision)
```

## Contradictions and stale sequencing to resolve

- Older expansion language can read as if generated chunks follow automatically
  after the current slice. The superseding direction explicitly says the next
  choice is another bounded everyday-home outcome and that tiny-map fun changes
  sequencing; chunks/caravan wait for the gate. [PROTOTYPE.md:66-90](../../PROTOTYPE.md).
- The architecture implementation table puts upstairs before local caravan,
  then visits/background work. Any paragraph implying chunks, realm travel or
  magic should be implemented immediately after a smaller art/content study is
  stale against that order. [ARCHITECTURE.md:751-760](../../ARCHITECTURE.md).
- Brewing is explicitly next after the upstairs outcome, while broad magic,
  cards, shrines, cults and realm systems remain loose direction. Do not let an
  occult prototype reorder the tiny-map, upstairs, brewing or caravan gates.
  [PROTOTYPE.md:40-48, 87-103](../../PROTOTYPE.md).
- Fate Chess's inspected run reached narrative interaction but no board move;
  its narrative layer and sandbox board must remain separate evidence. Do not
  treat its promotional material as a proved Hive rule. [fate-chess-play/README.md](fate-chess-play/README.md).
- The current Shiitake route has no demonstrated game authorization boundary;
  its compaction permissions are not familiar, nation or storyteller grants.
  Treat AI grants as a future host/product contract, not current gameplay or an
  MCP/DO implementation. [shiitake-game-tools.md:45-60, 75-91](shiitake-game-tools.md).

The practical synthesis is a later realm/content layer over the existing world
authority: cards and conversations can propose encounters, learning and
admission; only explicit world commands settle identity, travel, recruitment,
knowledge and rewards.
