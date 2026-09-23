# Realm synthesis architecture review

Read-only design check, 2026-09-07. This is a bounded future contract for the unified plan. It does not alter the current clearing, active upstairs work, issues, source, provider, or release sequence.

## Finding

Hive does not need one engine per feature or a universal entity framework. It needs small typed feature owners over a shared set of invariants: identity, location, authority, time, material custody, environment, knowledge, and durable outcomes.

Home construction, inn service, horticulture, brewing, ritual magic, chess, recruitment, faction response, expeditions, and the otherworld should enter through those seams. A new verb earns explicit typed command/process code. Authored definitions parameterize supported behavior and cannot execute arbitrary configuration scripts.

## Current implementation versus future contract

| Area | Actual current fact | Future contract or open gap |
| --- | --- | --- |
| World | `Clearing` is one aggregate; `Cell` has only x/z/level and `world.js` bounds it to a 15×15, two-level map ([model](../../src/model.ts#L3-L13), [world](../../src/world.js#L1-L34)). | Realm and chunk identity do not exist in gameplay. World Lab proves terrain generation only; it is not a realm/runtime proof. |
| People | Two scenario actors are created directly. `recruit` only appends an existing actor ID to the home party ([creation](../../src/clearing.ts#L20-L39), [recruit admission](../../src/orders.ts#L20-L31), [settlement](../../src/orders.ts#L329-L337)). | No candidate generation, spawn provenance, consent, relationship, faction, realm transfer, or controller grant exists. |
| Commands | A closed `Command` union is admitted in array order and applied commands enter tick-stamped history; switches use exhaustive `never` checks ([types](../../src/model.ts#L15-L39), [admission](../../src/orders.ts#L418-L430)). | Preserve this shape, but a later hosted authority needs principal/grant, observed revision, and idempotency receipt around commands. |
| Work | Commands create ordered typed jobs; the fixed step owns work and assignment in an explicit sequence ([jobs](../../src/model.ts#L41-L92), [step](../../src/clearing.ts#L118-L138)). | No brewery, inn service, teaching, ritual, portal, growing-tree, faction, or magic activity exists. A recipe row alone cannot add one. |
| Goods | Wood claims and cargo enforce one physical quantity path; mugwort separately models a one-location ground/carried/stored bundle ([claims](../../src/model.ts#L110-L143), [wood owner](../../src/resources.ts#L1-L70)). | There is no common mixed-good, capacity, workstation-input, water, mana, or cross-site transfer owner yet. |
| Save/time | One versioned IndexedDB snapshot restores paused; current play has no offline advancement or multi-owner settlement ([local-save ADR](../../docs/decisions/local-snapshots-and-durable-ai-jobs.md#L8-L22)). | Chunk eviction, realm residency, hosted authority, AI jobs, and historical catch-up remain future proofs. |
| Knowledge/social | Current actors have work toggles and rest, but no techniques, media, practice, relationships, reputation, titles, or factions ([actor](../../src/model.ts#L100-L111)). | The accepted distinctions exist in plans; none is an implemented system or scale claim. |

## Eight seams the unified design must preserve

### 1. Stable identity with one authoritative location

Actors, item lots, animals, plants, fungal colonies, books, portal sites, settlements, factions, and realms receive stable IDs from authority and retain them through save/load and travel.
A physical thing has one declared owner/location. A view, party, atlas, recipe, knowledge record, or portal destination cannot become a second inventory.
Location should become `RealmLocation { realmId, chunk, cell }`; `level` remains local storey, not an encoding for caves or the otherworld.

### 2. Intent, authority, commands, work, and outcomes stay distinct

Player UI, familiar/Devil AI, faction AI, and world storyteller are intent sources with different grants. They submit the same bounded commands to deterministic authority.
Command admission checks identity, permission, current revision, scope, target, and prerequisites before creating jobs or direct transitions. Dialogue, a tarot draw, or an AI message never mutates state by itself.
Jobs describe outstanding labor; activities describe a person's current execution; processes describe unattended world work such as fermentation or plant growth; committed events describe what already happened.

### 3. Materials, capacity, and claims settle atomically

Construction, brewing, food, water, horticulture, ritual offerings, equipment, and portal cargo use finite physical lots and named sources/sinks.
Claims reserve availability or destination capacity but are not material. A resource transaction revalidates claims, debits inputs once, creates outputs once, assigns exact custody, then commits an outcome.
Biological decay or environmental loss cannot bypass resource authority. It may reduce available stock and atomically adjust or invalidate affected claims/jobs with a visible waiting reason; it cannot silently erase claimed, carried, or stored goods.
Magic does not excuse conservation. A conjuration must name a transformed source, a transfer from another realm, or an explicitly authored world source/sink.

### 4. Environment is shared world state, not a per-feature bonus

Water, soil moisture, sunlight/shade, temperature, gas, nutrients, and contamination have one owner per region and named transfers. Plants, rooms, brewing, hygiene, fire, and decay query the same facts through bounded spatial views.
Terrain-generation `moisture` is suitability evidence, not irrigating water. A vent changes geometry/connectivity; presentation cutaway does not.
Realm boundaries namespace environmental fields. A portal link is not automatically a room opening and must not merge air, heat, water, path, or flood graphs.

### 5. One clock, explicit phase order, non-recursive events

The first otherworld shares the authoritative world tick and pause state. A new realm does not earn a second clock; differing time rates remain an explicit later product and authority decision.
Extend the current readable tick order deliberately. Domain code may return transaction proposals and committed facts; it must not synchronously publish an event that calls another module, which publishes another event, and recursively mutates the same tick.
Persist event IDs, causal source, tick, and affected IDs after the state transaction commits. A consumer processes each committed fact once through a cursor or a named later phase. A reaction that issues new intent enters the next explicit command boundary.
Chunk catch-up walks ordered clock/environment/custody boundaries. It cannot apply `elapsed × current rate` across changed conditions or advance a cursor past unavailable data.

### 6. Knowledge, media, practice, and technology are four facts

A technique/recipe/spell definition identifies know-how. An actor or institution may learn it; practical skill records experience; a physical book/card/tablet carries content and provenance; a technology breakthrough controls eligibility.
Possessing a book does not equal reading it, reading does not grant practiced skill, knowing a recipe does not supply tools/materials, and buying an advanced item does not unlock its manufacture.
Hidden mushroom effects, graft lineages, brewing recipes, portal rituals, and magical techniques can reuse this distinction without separate research engines. Visibility respects the knower's permission; an ID is not disclosure.

### 7. Species, realm, faction, relationship, party, and controller are orthogonal

A goblin from the otherworld may visit the inn without joining the home party. A human may serve a goblin faction. A familiar may advise a player without owning that player's actors. A shared model provider does not merge faction identities.
Reputation changes from committed service, trade, aid, theft, harm, or treaty outcomes. AI may propose a response, but cannot directly write goodwill.
`spawn`, `arrive/transfer`, `invite`, `recruit`, `draft`, and `grantControl` are different transitions. Recruitment changes affiliation or party membership of an existing person; it does not generate or duplicate that person.

### 8. Data composes supported capabilities; typed owners execute them

Validated definitions may select known item kinds, recipe inputs/outputs, workstation behavior, plant tolerances, ritual prerequisites, portal presentation, character appearance recipes, and faction dispositions.
Cross-reference validation rejects unknown IDs, impossible quantities, unsupported behavior names, incompatible art attachments, and recipes with no typed settlement path.
Closed code owns new verbs such as `brew`, `teach`, `drawTarot`, `playChessMove`, `performRitual`, `traversePortal`, or `summon`. Avoid a mega actor FSM, generic event bus, plugin runtime, or ECS adoption without a measured caller.

## Small typed-module pseudocode contract

This is a coordination contract, not a base class every feature must inherit:

```ts
type CommandEnvelope = {
  commandId: CommandId; principal: PrincipalId; grant: GrantId;
  observedRevision: number; command: DomainCommand;
};

type Proposal =
  | ResourceTxn | MoveTxn | ProcessTxn | KnowledgeTxn
  | RelationTxn | SpawnTxn | RealmTransferTxn;

type CommittedEvent = {
  eventId: EventId; tick: Tick; cause: CommandId | EventId;
  fact: DomainFact; affected: EntityId[];
};

function settleTick(world: WorldState, submitted: CommandEnvelope[]) {
  const receipts = admitInOrder(world, submitted);       // typed validation
  if (world.paused) return { world, receipts };
  world.clock.tick++;
  const proposals = collectDueProposals(world.readView()); // plain module calls
  for (const p of stableOrder(proposals)) settleAtomically(world, p);
  appendCommittedFacts(world);                            // no sync callbacks
  assignEligibleWork(world);
  return { world, receipts };
}
```

Feature owners should expose narrow functions such as `advanceBrewBatch`, `advancePlantPatch`, `quoteInnStay`, `applyKnowledgeTransfer`, and `preparePortalTransfer`. They read explicit views and return typed proposals or a blocked reason. Resource, space, authority, and persistence owners perform the cross-cutting commit.

## Portal ritual and transfer consumer

The purple-portal wizard scene should lead to a real, explorable, persistent **original otherworld realm**. It is a Hive realm concept, not a Harry Potter setting, skin, reference, or borrowed lore.

```ts
type PortalSite = {
  id: PortalId;
  ends: [RealmLocation, RealmLocation];
  state: "dormant" | "opening" | "active" | "collapsed";
  ritualDef: RitualDefId;
  environmentalCoupling: "none"; // first proof: traversal edge only
};

performRitual(actor, portal): Result<RitualJob> {
  require learnedTechnique(actor, portal.ritualDef);
  require practicalSkillAndFacility(actor, portal);
  return reserveExactInputsAndCreateTypedJob(actor, portal);
}

completeRitual(job): Result<PortalOpened> {
  return commitResourceAndProcessTxn(job.inputs, () => activate(job.portal));
}

traversePortal(actorId, portalId, commandId): Result<TransferReceipt> {
  require active(portalId) && actorAtMatchingEnd(actorId, portalId);
  require destinationChunkReadyAndWalkable(portalId);
  require authorizedAndTransferable(actorId);             // reconcile work/claims
  return atomicallyMoveSameActorAndOwnedCargo(commandId);  // no clone/reward copy
}
```

The destination uses its own `RealmId`, generator/version, chunk keys, edits, ecology, landmarks, and discovery state under the same gameplay authority and clock. Missing destination data returns `needs-data`; it never invents a safe tile. Closing a portal leaves travelers where they are and does not teleport them home.

The first portal transfers one actor and that actor's owned cargo only. Heat, smoke, liquids, light, projectiles, sound, followers, mounts, and bulk party transfer each require an explicit later consumer. If continuous environmental exchange is chosen later, a boundary-flux owner conserves it; geometry must not infer it from portal art.

A tarot or chess outcome may unlock a ritual technique, identify a destination, change a relationship, or submit a world-authorized encounter proposal. It cannot recursively spawn an actor during UI resolution. A summoned known being is a transfer of an existing stable ID; creation of a new being is a separate authorized `SpawnTxn` with persisted seed, provenance, appearance, initial location, and faction. Either being remains a visitor until a distinct invitation/recruitment transition succeeds.

For a future multi-owner server, realm transfer becomes a durable prepare/commit handoff with exactly one owner and an idempotent receipt. Do not build that protocol for the first locally authoritative realm.

## Main failure modes to reject in the root synthesis

- One `GameObject` bag of optional fields or one universal lifecycle/state machine for people, trees, items, rooms, spells, factions, and realms.
- Synchronous event listeners that mutate other domains recursively, making result order depend on subscription or call-stack order.
- Portal-as-cutscene, detached reward inventory, `level = -1`, or a fresh generated actor/item copy on each visit.
- A per-realm clock or pause rule introduced only because geography is different.
- Ritual, crafting, growth, or hospitality config that bypasses typed command, claim, resource, capacity, and outcome owners.
- Books that are the sole recipe truth, IDs that disclose secret knowledge, or skill collapsed into technology eligibility.
- Tarot “spawn,” recruitment, party membership, faction allegiance, species, relationship, and controller authority collapsed into one boolean.
- Faction dialogue or an AI model writing world facts, reputation, resources, movement, or portal outcomes outside normal admission and settlement.

The smallest coherent realm proof is one authored portal site, one finite ritual input, one learned technique, one existing actor with one carried item, and one generated destination chunk. Open once, cross once, persist/reload on the other side, return once, and show that actor/item IDs, custody, claims, command receipts, realm/chunk location, clock, and home work stayed authoritative throughout.
