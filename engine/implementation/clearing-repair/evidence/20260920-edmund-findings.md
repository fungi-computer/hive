# Edmund creator/API source comparison — 2026-09-20

Read-only study of Hive `cf9c7854a401cbb245d4b98bf0a32aa2515f81ae` in `/home/levi/src/hive-worktrees/living-terrain-integration`. No Hive source changes, packages, builds or performance claims. Read plans 08 creator section, 09, 10 accepted contract, 11 ownership audit, and 14 Edmund rule. Inspected current SDK, actual Colony/Formations/Survival consumers, native instantiation/process owners, and asset contracts. Downloaded and read the primary-source comparators below; no code copied into Hive.

## Main assessment

The accepted creator direction is appropriate: authored definitions, ordinary deterministic TypeScript decisions, and native owned physical operations. The shortfall is that the attractive vocabulary is ahead of the preparation/execution contract. Finishing the existing joins is more valuable than designing another fluent API. The clearest mismatch is `.behaves(...)`: it exists and is tested as data, but actor attachment does not cause runtime execution or restrict runtime subjects.

The game-maker opportunity should be tested as an edit-to-play loop, not another mechanism inventory: change one creature, buildable, recipe, and authored impact reaction through public imports; restart a local seeded scene; use the same pack with two browser clients; inspect rejection/waiting reasons; interrupt/reopen work without duplicating effects. Existing demos are enough. Charm and fast predictable rendering are prerequisites for this creator loop, not separate polish afterward.

## What exists now vs what remains planned

| Concern | Implemented source | Remaining gap |
| --- | --- | --- |
| Authored components/rules | `sdk/authoring.ts`: checked components, relations, systems, commands; `sdk/behavior.ts`: `predicate`, `action`, `behavior` compile to existing `SystemDefinition` | Dependency declarations do not yet describe a fully batched/indexed native decision view. |
| Actor composition | `actor().with().behaves()`, checked scalar initialization and `actorInput`, native template serialization | Behavior attachments are unused by preparation/runtime. No attached-subject membership join. |
| Buildables | `Buildable`, `compileBuildable`, `compileBuildableEnvironment`; actual bed/floor/wall definitions use these | Other structures still authored directly in environment catalog; UI/content placement registration remains manual. |
| Placement/actions | Schema-checked point/area/edge proposals; `constructionCandidates`, `constructionPlanActions`, native placement queries and plan/replace actions | Creator caller still coordinates existing sites, replacement generations and IDs; hardcoded game entrypoints still need edits. |
| Recipes | Environment process definitions have roles, stages, attended/elapsed timing, explicit consumption/output; `requestProcess` reaches native owner | Production currently requires a finished matching constructed station and sealed container. Beer-producing tree is a proposal, not supported arbitrary composition. |
| Spawn | Native atomic actor-template instantiation used for party join/bootstrap | Generic-sounding operation is coupled to party/player sequence and mandatory party slot. Ordinary enemy creation is not qualified by this operation. |
| Art | Versioned checked static pack, original baked textures, silhouettes, placement metadata, named parts with geometry | Visual references are strings and native footprints are authored separately. Bake-derived rendering metadata must not be mistaken for physical placement authority. |
| Public pack consumption | `WorkerRuntime` accepts injected pack map; same game rules feed local/server pack variants | SDK exports demos, worker entry embeds demo list, page embeds demo list, public host embeds demo switch. No one-descriptor outside-engine creator loop proven. |

Older docs explicitly saying actor/behavior are only target syntax are historically accurate but no longer sufficient description of current source. Conversely, presence of those exports does not establish completion of the accepted laws.

## Concrete findings

### 1. Actor behavior attachment is presently descriptive

`engine/src/sdk/behavior.ts:331-425` builds immutable actor definitions and validates attached behaviors against required subject components. `:396-421` stores those behavior refs. `engine/src/sdk/common.ts:233-260` serializes template ID/version/parameters/components, without behavioral attachment identity. `engine/src/runtime/session.ts:210-236,915-957` validates/executes only `pack.systems`. Searching engine source for `.behaviors` finds consumer assertions in tests, not runtime installation.

The real split is visible: `games/colony-cat.ts:179-195` exports `colonyCatSystem` and a `colonyCatActor` with `.behaves(...)` and unspecified initial components. `games/colony-actors.ts:68-83` defines a second `ColonyCatActor` for actual instantiation, without `.behaves(...)`. `games/colony.ts:328` separately registers the system. Formations and Survival similarly register their systems explicitly despite exported composed actor examples.

Consequence: an author can plausibly attach a behavior and observe no behavior unless they know to register the system elsewhere; adding it globally selects every matching component entity, including entities without that attachment. This directly misses packet 10's attached-subject law.

Smallest repair direction: one pack-preparation join that validates/install-deduplicates attached systems and compiles stable subject membership into the existing system path; actual cat uses one definition. Keep native instance identity and saved components. Do not add per-instance runtime loops.

Acceptance: two actor definitions share one attached behavior; a third has the same capability set without attachment; each eligible instance executes once, the third never executes; missing/duplicate/conflicting attachments fail before world start; restore retains independent actor state. Read the real consumer, not just the returned `.behaviors` array.

### 2. Read reuse exists, but bounded decision batching remains incomplete

`runtime/session.ts:831-839` caches same component-set queries across the whole decision step, and `sdk/behavior.ts:250-267` also caches branch rows locally. This is real progress. Do not repeat the stale claim that every predicate makes another identical native query.

But `games/colony-cat.ts:66-71,129-133` scans cached complete Destination/Position arrays by ID; `:146` calls `terrainSurfaces` once per due cat. Cache reuse reduces boundary calls but does not make repeated linear lookups or per-actor fact calls disappear. Native reads still cross JSON in `runtime/wasm-kernel.ts:633-646`. `sdk/behavior.ts:267-284` rejects undeclared native fact doors, but only as immediate calls, not a preparation/fetch/evaluate protocol.

Component-read enforcement is also uneven: commands reject undeclared query components at `session.ts:414-419`; system `phaseQuery` does not check against `activeReads` (the latter is used for world-pose/route read gates). This is a dependency-contract gap for trusted author code, not evidence of a player authorization exploit.

`exclusive` action conflict detection at `behavior.ts:289-306` resets per behavior run. It proves intra-behavior branch conflicts only. Do not infer that two separate composed behaviors receive explicit movement conflict resolution from this check. Native request outcomes require separate review.

Acceptance: measure native query counts, returned rows, repeated keyed lookups, authored evaluation time and physical path cost separately with actual moving/due actors. Do not claim a performance result from source inspection or idle populations.

### 3. Instantiation is still a party-specific capability

`contracts.ts:472-488` requires `partySlot` and `peopleSlots`; `sdk/party.ts:33-39` exports `instantiateActors`. `kernel/src/lifecycle.rs:20-88` synthesizes `player:{sequence}` and `party:{sequence}`, validates party binding and `next_party_sequence`, makes every actor ID relative to that party, and requires the party slot. This is useful atomic party creation. It does not yet serve an enemy spawn or world-event birth independently of creating a player/party.

Reuse template validation/preparation and the existing durable commit owner when earning ordinary creation. Keep party join as a composition caller and remove duplicate generic-looking orchestration. Explicit creation cause and idempotent receipt belong to the existing operation owner. A generic `spawn` spelling by itself is not the missing implementation.

### 4. The buildable seam is useful but not a complete one-file creator flow

`games/colony-actors.ts:86-119` puts footprint/cost/work/salvage/art reference together for real bed/floor/wall. `sdk/construction.ts:54-106` compiles into the existing native structure catalog and excludes construction-created actors from ordinary spawn templates. `games/colony-environment.ts:163` uses the compiler. `games/colony-building.ts:48-107` normalizes proposals and returns typed actions. `kernel/src/world.rs:5888-5889` routes plan actions into the existing construction owner.

This is the correct direction and should be preserved. Yet `games/colony-placement.ts:20-31` still manually lists every structure, and `games/colony-building.ts:59-61` lists UI content entries separately. `games/colony-construction-visuals.ts:20-51` assumes conventions for `.finished`, `.frame`, `.stakes` and per-shape projection. The odd bone bed at `sdk/construction.test.ts:86-114` proves compilation output, not an end-to-end displayed, selected, built custom asset.

Acceptance: register a new buildable once in content; use an already-supported art family; build, rotate, select, cancel/rebuild and remove it through the existing preview/native owner; no engine/client switch on its ID, no new geometry formula. Then qualify genuinely custom art through the bake contract.

### 5. Production on arbitrary capabilities remains unearned

The real herbal-ale recipe at `games/colony-environment.ts:49-70` cleanly declares input roles and stages. `games/colony.ts:413-424` requests it through `requestProcess`. But `kernel/src/process_transition.rs:74-84` demands a finished ConstructionSite, matching station catalog and SealedContainer. The accepted beer-tree example is an eventual composition probe, not currently authorable from installed generic Growth/Production capabilities.

Preserve that honest distinction. First qualify a second ordinary recipe on current supported stations with no native edits. Then add the unusual consumer by exposing only its demonstrated process-host/contact/custody requirement through the existing native owner. Do not insert a beer-tree branch or invent a broad process framework in advance.

### 6. Game pack registration is not yet a product boundary

`sdk/index.ts:12-18` exports example packs and runtime implementation together. `runtime/worker-entry.ts:11-26` already accepts an injected pack map, but `:37-42` embeds four packs. `client/page.js` and `tools/public-engine-host/worker.ts:97-107` embed additional game choices. The right extraction is one checked pack/build descriptor passed into existing hosts, not a dynamic plugin service. Browser/host differences may configure bootstrap/principal handling without authoring all rules twice.

## Primary-source comparisons

### OpenRA: finish definition preparation, cache useful runtime capabilities

Pin `f3ec7f8e1593b482f85fd101652deb740c33dee6`, checkout `/tmp/hive-edmund-study-openra-20260920`.

The dog definition composes movement, health, attack, conditions and body animation in one content record; different art and behavior refer to existing capabilities. [Actual content](https://github.com/OpenRA/OpenRA/blob/f3ec7f8e1593b482f85fd101652deb740c33dee6/mods/ra/rules/infantry.yaml#L1-L68).

ActorInfo constructs checked trait definitions and caches dependency-resolved construction order; missing/cyclic dependencies produce explicit preparation errors. [Preparation owner](https://github.com/OpenRA/OpenRA/blob/f3ec7f8e1593b482f85fd101652deb740c33dee6/OpenRA.Game/GameRules/ActorInfo.cs#L109-L184).

Actor creation actually creates these traits and caches capability-specific arrays/interfaces once for hot use. [Execution join](https://github.com/OpenRA/OpenRA/blob/f3ec7f8e1593b482f85fd101652deb740c33dee6/OpenRA.Game/Actor.cs#L148-L210). World separates physical ticking from rendering ticks. [World phases](https://github.com/OpenRA/OpenRA/blob/f3ec7f8e1593b482f85fd101652deb740c33dee6/OpenRA.Game/World.cs#L413-L462).

Inference for Hive: composition is valuable when attachment causes the right execution and prepares hot data once. Our TS fluent definitions are fine; add the missing concrete preparation join. Do not copy C# inheritance trees, per-actor ticks, or assume OpenRA's simulation/save model proves DO transaction durability. OpenRA is primarily an RTS composition comparison, not proof of arbitrary multi-level voxel sprite ordering.

### Luanti: explicit geometry contracts and engine-owned due time

Pin `b4eb8b91e611c3d83f7557c39b4f1caab9406e57`, checkout `/tmp/hive-edmund-study-luanti-20260920`.

Registration validates content and feeds one native registration path; custom entity behavior remains ordinary Lua. [Registration](https://github.com/luanti-org/luanti/blob/b4eb8b91e611c3d83f7557c39b4f1caab9406e57/builtin/game/register.lua#L118-L145). Node definitions distinguish render geometry, selection geometry and collision geometry, with documented defaults rather than assuming pictures are physics. [Geometry contract](https://github.com/luanti-org/luanti/blob/b4eb8b91e611c3d83f7557c39b4f1caab9406e57/doc/lua_api.md#L10953-L10985).

Persistent node timers serialize state and return only due entries from an ordered timer store; mods need not scan every node every frame. [Due owner](https://github.com/luanti-org/luanti/blob/b4eb8b91e611c3d83f7557c39b4f1caab9406e57/src/nodetimer.cpp#L112-L133). Its active-block policy deliberately ties simulation activation to player proximity. [Actual dispatch](https://github.com/luanti-org/luanti/blob/b4eb8b91e611c3d83f7557c39b4f1caab9406e57/src/serverenvironment.cpp#L966-L1001).

Inference for Hive: keep convenient authored deadlines/elapsed time over one engine due-work owner and keep art/physical geometry roles explicit. Do not copy player-proximity suspension: Hive explicitly separates visibility from simulation activation and needs ongoing shared-world work. Do not infer exactly-once durable physical commitment from Luanti timer persistence.

## Proposed sequence and concrete creator success

1. Fix renderer correctness/retention with existing art; visible confidence is part of the creator contract. Separate physical support/occupancy, visual ordering volumes and pixel picking; they share coordinates and identity but answer different questions.
2. Finish actor preparation using the real cat and its one actual spawn definition. Install attachments once, maintain their membership, validate reads/conflicts, keep phase query reuse; prove behavior attachment rather than only configuration structure.
3. Finish one registered buildable flow through existing catalog, targeting, admission, work and art. Consolidate current structure consumers where the same rules apply; remove the manual parallel registries that the new compiler supersedes.
4. Qualify Colony/Formations from one external pack entry using public imports, same original bake/export owner, and existing local/DO hosts. Record files touched and edit-to-play time for a recipe, creature rule, damage rule and asset binding. No Rust rebuild for supported content changes.
5. Qualify a surprising combination only after ordinary flows work. A new impact modifier plus one additional reaction is supported authored policy over native impacts; a moving production host or enemy birth may expose a missing primitive and should report that fact honestly. The API is successful when ownership work stays in Hive and the creator's rule remains small.

Concrete outcomes that would justify 'game-maker of the web' progress: an author can alter a cat's behavior once, add a bone-bed definition once, configure another brew without understanding material claims, and change cannon damage without Rust; local preview shows the result in seconds; publishing the same pack enables a second browser and scoped AI controller; interrupted operations explain their state and survive reopen without duplicated goods. None of the timing/product outcomes were measured by this read-only study.
