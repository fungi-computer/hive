# Systems games: reusable rules and approachable authoring

September 15, 2026. Personally researched by the integration owner at Levi's
request. Hive source baseline: `c1efcb0322fd9c6013679933afb2c06f2f1624fa`.
Read with [the ownership audit](08-engine-ownership-audit.md) and
[native work planning](07-native-work-planner.md). This refines the existing
eight-stage Clearing repair; it is not a new implementation queue or an engine
rewrite. Research and source inspection are not gameplay/performance acceptance.

## Judgment

Keep Rust physical mechanisms, TypeScript content and game rules, optional shared
work assignment, and one authoritative Region transaction. That direction fits
what these references demonstrate. Their success does **not** establish that our
current implementation is complete, performant or pleasant to author against.

Here, lawful means an action has consistent, explainable consequences, including
when interrupted. It does not mean simulating real physics, requiring every game
to obey the same fictional economy, or making every activity a colony job.
An admitted magic spell may create water; pouring an ordinary bucket may not
accidentally duplicate it. The game owns that distinction through explicit rules.

The central product criterion is how easily a creator can express and play a new
idea. Internal invariants should reduce the work the creator must understand.
If every recipe author manages claims, retries, cargo cleanup and save details,
we have exposed our implementation burden instead of providing an engine.

## Evidence and limits

Reviewed developer articles, official product descriptions, maintained modding
documentation and selected public mod source. All five gameplay RimWorld DLCs
listed on its [Steam DLC page](https://store.steampowered.com/dlc/294100/RimWorld/)
were included: Royalty, Ideology, Biotech, Anomaly and Odyssey. Soundtracks and
Name in Game are not additional simulation systems.

Save Our Ship 2 source was read at Git tree/ref
`9eecc59b4485efb3408360d5526fdd841f180d33`, `Source/1.6`. Only the files named below
were inspected; this is not a complete mod audit. No proprietary game kernel was
available or claimed inspected. Satisfactory's Factory Tick reference is older
modding documentation, not a verified description of its current native build.
Historical Factorio/Paradox articles establish design decisions at their dates,
not current performance numbers or a promise about every later version.

## RimWorld and its expansions

| Reference | Verified design behavior | Hive lesson and limit |
| --- | --- | --- |
| Base game / shared work | The SOS2 job below directly consumes RimWorld's reservation, movement, carrying, wait and progress primitives. | Reuse execution steps. A game-specific activity should not implement its own navigation or cargo cleanup. This source does not prove RimWorld uses our matching algorithm or DO durability. |
| Royalty | Titles, psycasts and quests add ways to affect the colony. Later changes made psychic progression available through different routes and refined generated quests. | Separate a capability from how it is acquired. A quest/director may request ordinary world actions and inspect their results; it is not another physical simulation. |
| Ideology | Beliefs change preferred ways of living; the release explicitly supports running with either expansion, both, or neither. | Game policy can value the same physical fact differently. A preference against an act is distinct from physical impossibility and player permission. Optional content must declare dependencies. |
| Biotech | Genes change capacities and tradeoffs; families, mechanoids and pollution connect to colony life. Later updates deliberately integrated Biotech with Ideology. | Body, capability, controller and social meaning are separate. A robot and goblin can share hauling while having different needs. Cross-system interaction must be deliberately implemented and tested. |
| Anomaly | Capture, containment, research and harvesting compose a loop; exploiting a captive raises its risk of escape. | One persistent physical subject can participate in several activities. A confined creature is not merely an input that vanishes on starting a recipe. New behavior and authored incidents remain legitimate game code. |
| Odyssey | A mobile base travels between places, biomes and orbital sites. | Location must not be synonymous with a permanent home map. Preserve entity identity, relationships and cargo when location changes. This is a design pressure, not evidence that distributed region transfer is already solved. |

Primary sources: [Royalty quest refinement](https://ludeon.com/blog/2020/04/update-1-1-2609-improves-quest-generation-and-more/),
[psychic progression changes](https://ludeon.com/blog/2020/05/update-may-2020/),
[Ideology product description](https://store.steampowered.com/app/1392840/RimWorld__Ideology/),
[Ideology release](https://ludeon.com/blog/2021/07/ideology-expansion-released/),
[Biotech design](https://ludeon.com/blog/2022/10/biotech-expansion-announced-update-1-4-on-unstable-branch/),
[cross-expansion integration](https://ludeon.com/blog/2022/11/1-4-content-update-in-testing-with-cross-expansion-integration/),
[Anomaly containment](https://ludeon.com/blog/2024/03/anomaly-preview-2-containment-facilities-creatures-and-release-date/),
[Odyssey announcement](https://ludeon.com/blog/2025/06/announcing-odyssey-and-update-1-6/).

These feature descriptions motivate boundaries; they do not prove Ludeon's
internal modules have those exact boundaries. Nor should Hive ship every feature
in this table before Clearing becomes playable.

## Large mods reveal both reusable mechanisms and missing seams

### Save Our Ship 2

The [maintainer's README](https://github.com/KentHaeger/SaveOurShip2/blob/9eecc59b4485efb3408360d5526fdd841f180d33/README.md)
describes continued colony life aboard ships and names Harmony and Vehicle
Framework dependencies. Its Odyssey integration is explicitly unfinished there.

The actual [torpedo-loading job](https://github.com/KentHaeger/SaveOurShip2/blob/9eecc59b4485efb3408360d5526fdd841f180d33/Source/1.6/Jobs/JobDriver_LoadTorpedoTube.cs)
reserves targets, walks to ammunition, carries it, approaches the tube, waits with
a progress bar, and loads it. This is concrete reuse across very different
content. Its final callback loads the shell then destroys the carried item;
copying that callback does not establish atomic durable commitment in Hive.
Our material/operation owner must commit the corresponding transfer and result.

[Life support](https://github.com/KentHaeger/SaveOurShip2/blob/9eecc59b4485efb3408360d5526fdd841f180d33/Source/1.6/Comp/CompShipLifeSupport.cs)
samples power/switch state periodically and marks breathability dirty on relevant
signals. [ShipMapComp](https://github.com/KentHaeger/SaveOurShip2/blob/9eecc59b4485efb3408360d5526fdd841f180d33/Source/1.6/Comp/ShipMapComp.cs)
holds cached heat networks and breathability work, with dirty checks and tick
gating. This supports using coarse meaningful environmental facts and targeted
invalidation. It supplies neither a bounded 3D cave solver nor DO scaling proof.

[Harmony patches](https://github.com/KentHaeger/SaveOurShip2/blob/9eecc59b4485efb3408360d5526fdd841f180d33/Source/1.6/HarmonyPatches.cs)
intercept UI, room/roof, map and other behavior. Their breadth exposes extension
pressure; it is not by itself proof that the mod is poor code. Hive should expose
the needed supported operation when a real consumer requires it, rather than
expecting authors to patch world internals or inventing all potential hooks now.

### Vanilla Expanded Framework

Its [maintained author documentation](https://github.com/Vanilla-Expanded/VanillaExpandedFramework/wiki)
describes shared animal/building/weapon and other behaviors, optional features,
and a superseded item processor replaced by its pipe-system processor. Useful
reuse is a maintained behavior library with consumer examples, not just common
base classes.

The [powered-stat component example](https://github.com/Vanilla-Expanded/VanillaExpandedFramework/wiki/Stats-When-Powered)
lets a definition change a building's stats with power. It also asks the author
to specify affected cache clearing. That is an instructive tradeoff: composition
is accessible, but forgetting invalidation can produce stale behavior. Hive's
supported native mutations should own their derived-index/cache invalidation;
ordinary recipe authors should not have to name internal caches.

## Factorio: predictable approximations and a real authoring boundary

[FFF 374](https://www.factorio.com/blog/post/fff-374) explains robot assignment by
estimated arrival time, including queued work and spatial indexing of estimated
finish locations. It explicitly tolerates imperfect estimates. Hive should keep
bounded joint Hungarian assignment and maintained indexes as planned; this does
not justify another algorithm swap. Flying robots avoid our voxel reachability
problem, so their distance estimate cannot replace legal paths for goblins.

[FFF 324](https://www.factorio.com/blog/post/fff-324) discusses sleeping entities
and memory costs. Apply the principle to due/dirty scheduling and contiguous
working data; do not turn every waiting intent into a full query each tick.
Wake rules must cover accepted edits, material changes and retained results.

[FFF 416](https://factorio.com/blog/post/fff-416) replaced local pipe propagation
with shared fluid segments to remove opaque build-order/throughput behavior.
[FFF 430](https://factorio.com/blog/post/fff-430) then added limitations and visual
feedback after the first simplification made pipelines dominate other transport.
The lesson is to preserve useful decisions and make limits visible. We do not
copy that historical article's numerical pipe limits into Hive.

For Hive, reservoirs/pipes, open voxel water and smoke are distinct consumers.
Shared-pipe availability does not permit teleporting open water through a cave
or wall. Keep finite free water and groundwater accounting, with bounded active
work. Smoke should use the already agreed cheap game model. This study authorizes
no new environmental solver, universal material network, or disabling rivers.

Factorio's [documented data lifecycle](https://lua-api.factorio.com/latest/auxiliary/data-lifecycle.html)
separates definition loading from runtime control, defines mod ordering, and
specifies when state is restored. Hive likewise needs one compiled definition
identity and explicit composition order. We should use existing TypeScript,
Zod and Rust decoding; copying Lua stages or a custom expression language would
add machinery without satisfying a missing consumer.

## Satisfactory: recipes are simple because machinery owns execution

The ContentLib authors document [recipes](https://docs.ficsit.app/contentlib/latest/Features/Recipes.html)
in terms of ingredients, products, producer and duration; the representation also
covers building recipes. That is the right level of authoring for another
supported item. The machinery still implements the actual physical operations.

The [modding project's introduction](https://docs.ficsit.app/) exposes Blueprint,
C++ and optional JSON authoring. That demonstrates useful layers of expressivity,
not that every mechanic is data. Its older [Factory Tick explanation](https://docs.ficsit.app/satisfactory-modding/v3.7.0/Development/Satisfactory/FactoryTick.html)
separates factory processing from ordinary presentation and warns about thread
and time assumptions. We borrow that separation, not unverified current threading
details or a promise of equivalent throughput on a DO.

Hive must distinguish attended labor, unattended process time and transport.
Fermentation may progress with no worker; hauling requires actual carrying;
crafting may require the same author. A linear recipe is sufficient for brewing.
A persistent intermediate item between independently assignable tasks needs the
existing planned job/result composition, not a private brew scheduler.

## Stellaris: expressive content, consistent semantics

The developers' [anomaly-authoring diary](https://store.steampowered.com/news/posts/?appids=281990&enddate=1462438865)
shows authored content, reusable triggers/effects and explicit target scopes.
This is the model for story rules and event directors over world operations.
It does not make every colony task a scripted event or an entire country a pawn.

[Dev Diary 240](https://store.steampowered.com/news/posts/?appids=281990&enddate=1644494727&feed=steam_community_announcements)
is an especially direct warning: nominally similar weighting fields had different
implementations and meanings, while some expressions were reparsed when used.
The developers consolidated evaluation and resolved expression kinds at load.
They also described inconsistent duplicate-definition behavior and improved
overwrite diagnostics. Hive should resolve references at pack admission, give
shared concepts one meaning, and reject ambiguous duplicate ownership. A future
explicit replacement must identify what it replaces; incidental file order is
not an adequate rule. No new language is needed for this.

## Compare with actual Hive source

| Source inspected at baseline | What exists | Disposition |
| --- | --- | --- |
| `engine/kernel/src/staged_process.rs` | Authored inputs, whole-lot/portion policies, attended/elapsed stages, outputs and a compiled catalog | Keep. It already expresses substantial brewing behavior as definitions. |
| `engine/src/sdk/authoring.ts` | Zod command parsing; declared system reads/writes; normal TS rule functions | Keep the authoring split. This is not an arbitrary TS-to-Rust compiler. |
| `engine/src/games/formations.ts` | Native impacts feed game health/morale and admitted displacement | Useful example of custom rules. Targeted reads should replace full victim scans when this consumer is repaired. |
| `engine/src/games/colony-work.ts:1018` and `colony.ts:344` | TS phases/providers still choose current work; Colony installs that work system | Migration remains incomplete. Native physical code and a native matcher do not prove native scheduling. |
| `engine/kernel/src/world.rs::advance_batch` and `native_work_planner.rs` | Partial native mechanisms; the complete all-family planner is not active at this baseline | Finish the current cutover and delete its old callers before claiming it. |
| Native job branch `a2c022b8`, `engine/kernel/src/job.rs` | Task continuity helper and ECS component shape, tested in isolation | Unaccepted candidate. The reported physical transformation and snapshot join are absent. The helper test does not prove binding is atomic with real labor. |

The existing [ownership audit's creator section](08-engine-ownership-audit.md#creator-acceptance-the-edmund-mcmillen-question)
already identifies pack-registration friction, overly broad rule queries, missing
general physical lifecycle operations and art constraints. This study confirms
that repair direction. It does not establish that those repairs have landed.

## Corrections to apply within the current work

1. **Authorship survives the task.** An unfinished item owns its recipe identity,
   progress and author when crafting binds an author. Cancelling/recreating a task,
   moving the item or reloading cannot erase that fact. A task consults it rather
   than keeping a competing author. For work without a persistent workpiece,
   continuity can live on the task's owned execution state. A worker lease always
   releases when its attempt ends. Implement the required open/bound cases first;
   other policy variants do not earn extra runtime machinery without a consumer.
2. **Partial work is world state.** Felling creates a real trunk. Later cutting
   consumes that exact trunk. A result records what was produced, while current
   custody/location/quantity comes from the material owner. Historical results
   cannot force an already moved or split item back to its old state.
3. **Composition has one meaning.** Compile supported definitions once, resolve
   references, and diagnose conflicting identities/owners. Scope, eligibility,
   worker availability and physical admission remain distinct. The same transfer
   rule serves construction, brewing, storage and the other current consumers.
4. **Optional means operationally optional.** An individual zombie behavior may
   use navigation and tracked execution without loading colony assignment. A
   recipe machine may use process time without inventing a worker. Existing
   Survival/Formations/Pirates callers are the tests; no fifth demo is needed.
5. **Reasons are part of the operation result.** Current work inspection must
   distinguish missing supplies, no eligible worker, waiting for the author,
   blocked contact and cancelled invalid geometry. Humans see those facts through
   contextual UI; AI receives the same permitted meaning through observation.
   Neither should infer them from a frozen sprite or inspect scheduler internals.
6. **Performance includes hidden work.** Charge discovery, rejected candidates,
   cache invalidation, commitment/capture and observation, as well as the matcher.
   Keep the goal's productive 32/100-worker and bounded 200-worker evidence with
   functioning water. Another game's scale is no measurement of ours.

These refine stages 2–5 and the existing evidence; they do not add a requirement
to implement every DLC feature, all modifier algebra, dynamic native modules or
a new workflow interpreter before publishing the Clearing.

## The Edmund McMillen test

We cannot predict his choice of engine. The developers' [Super Meat Boy
postmortem](https://www.gamedeveloper.com/audio/postmortem-team-meat-s-i-super-meat-boy-i-)
credits the in-game level editor and an exporter carrying animation and sound
cues. The practical target is direct creative feedback with dependable behavior.

**Current verdict: not yet demonstrated.** A strong internal architecture is
necessary for this project, but a creator should not need to understand it to
change an ordinary recipe or invent a strange cannon effect.

Use the existing Colony and Formations examples for the creator qualification
already scheduled after the coupled Clearing cutover:

| Exercise | What the author should change | Failure signal |
| --- | --- | --- |
| Another brew recipe | Ingredients, stages, products, art/feedback bindings | Worker scans, reservations or a new scheduler in recipe code |
| Interrupt an authored craft | Declarative continuation choice and visible unfinished item | Losing progress/author on cancellation or requiring manual cleanup |
| A strange cannon interaction | An ordinary TS rule over an impact/result and supported typed effects | Editing collision internals for a damage formula, or duplicate rewards on retry |
| Individual movement behavior | Intent selection over the shared navigation/execution owner | Installing colony labor merely to move/chase/retreat |
| A new small pack | One documented registration and public imports | Editing transport dispatch and repeating the same game list in several places |
| Adjust appearance and feel | Existing art/animation/sound bindings, local preview | Routine content edits require Rust compilation or a hosted deployment |

Record the actual edit-to-visible time, files touched and errors encountered.
Seconds for a warm supported content edit is a target, not a measured claim.
Use deterministic local reset for iteration; arbitrary hot replacement of a
running durable world's definitions is not required. Preserve faithful original
art in this sprint. Future asset import should serve an actual creator, rather
than requiring every game to author Three scenes or use voxel terrain.

An illustrative content brief, not a newly promised API:

```text
make_leather_shield:
  skin carcass -> physical hide          [any eligible actor]
  tan exact hide -> physical leather    [any eligible actor; recipe conditions]
  carry leather to work area            [shared transport]
  shape leather -> unfinished shield    [bind author with first committed labor]
  finish that shield                    [same author; game-defined quality rule]

cancel after shaping:
  stop the attempt and release its reservations
  retain unfinished shield, progress, author and physical custody
resume later:
  consult that same workpiece and admit a new attempt for its author
```

Quality timing is a game rule that still needs an explicit choice for its first
consumer: skill at start, skill at completion or accumulated contribution are
different semantics. Do not silently choose one inside generic scheduling. The
engine preserves the required author/progress facts and atomic physical effects.

The next acceptance remains the real resource → trunk → logs lifecycle and shared
construction/brewing supplies, with interruption and reopen, followed by all
current-family cutover and the playable hosted Clearing. A polished research
document is not a substitute for that result.
