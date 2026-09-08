# Goblin Bed & Breakfast: parties, homes and a larger world

Architecture proposal, 2026-09-07. Starting playable revision:
`cb80c55fe9932c2e01c7570ed855266d03cb9695`.

This document plans implementation and records focused runtime evidence. The
current persistent Game CTO goal continuously reconciles retained plans, studies,
ADRs and issues into coherent architecture-focused sprints and oversees the
small-world demo until Levi accepts its core loops as fun and dependable. The
full-viewport two-person goal below is historical evidence, not a competing active
instruction. This document does not claim implementation of multiplayer,
streaming, large-world gameplay or a backend.

The accepted future product/source boundary is in the
[home, expeditions, and living world ADR](docs/decisions/home-expeditions-and-living-world.md).
Further accepted future seams are recorded in
[modular character art and technology gates](docs/decisions/modular-art-and-technology-gates.md).
The future environment/opening proof boundary is in
[environmental fields and openings](docs/decisions/environmental-fields-and-openings.md).
The current local-save/later durable-AI boundary is in
[local snapshots and durable AI jobs](docs/decisions/local-snapshots-and-durable-ai-jobs.md).
The accepted [architecture-proof sprint](docs/decisions/architecture-proof-sprint.md)
now records the current small-world sequence: trustworthy controls, one unified
goods/transfer owner, mixed storage, the first honest brew, then one ecology
consumer. The independent World Lab does not expand live gameplay.
The reviewed [world mapping and terrain LOD direction](docs/decisions/world-mapping-and-lod.md)
adds no runtime claim: 512² remains the lab baseline, while cross-scale coast/
ridge identity and seam proof precede any larger region or finite-globe choice.
The accepted audit reconciliation makes schema-v7 a coupled wood+herb landing
after the isolated helper; brewhouse local-served/hosted-HTTP parity and the
provider/slot/phase-only bed contact law remain distinct evidence boundaries.
The [Minecraft-inspired terrain and isometric world study](docs/decisions/minecraft-inspired-terrain-and-isometric-world-study.md)
adds future landform, cave and exposed-part rendering guidance without changing
the tiny live clearing or the current small-world sprint precedence.
The [authored-building procedural assembly study](docs/decisions/authored-building-procedural-assembly-study.md)
bounds future room/template composition without adding a runtime assembler or
bypassing ordinary construction.
The [home-between-realms synthesis](docs/decisions/a-home-between-realms.md) is a
future product/architecture proposal, while [Glomzy palette and night lighting](docs/decisions/glomzy-palette-and-night-lighting.md)
is a deferred art-study proposal; both preserve the active upstairs → brewing order.
The [architecture implementation plan](docs/decisions/architecture-implementation-plan.md)
is the master future handoff, with [current systems review and module plan](docs/decisions/current-systems-review-and-module-plan.md)
as its source-backed companion; neither changes the current runtime priority.
The newer [controls floor-priority recut](docs/decisions/controls-floor-priority-recut.md)
is the current precedence: finish controls, then delete parallel wood+herb
transfer ownership/validators before brewing; vertical/tower and cat-surface work
remain future direction.
The [Excalibur reuse/depth decisions](docs/decisions/excalibur-ecs-and-reuse-decision.md)
are later bounded guidance, linked with the [depth source review](docs/decisions/excalibur-depth-source-review.md);
they do not authorize an Excalibur dependency or general ECS migration.

## Delivery ownership

Astra is peer Game CTO and owns game direction, difficult architecture, staffing
and personal review of changed original art. The visible Sol `game-delivery` lead
already holds ordinary source, Git, build/proof scheduling and same-preview
publication custody. The earlier `016b1a02` transfer and Sedge art reservation are
historical handoffs, not current pending permissions. Later explicit per-file
art/implementation handoffs govern current writers. Routine source correction and
unchanged accepted art do not wait for another CTO approval.

Every substantial independent outcome has an accountable visible owner in **Game
Lanes**. A Terra/Sol PM owns the actual source/caller read, first working-shape
review, corrections, focused proof and final handoff to Game Delivery. Native
workers remain appropriate for bounded supporting work under that owner; they do
not replace the visible portfolio. Delivery coordinates ready work, conflicts and
serial integration rather than accumulating every PM decision. Small edits do not
need a new PM, and idle panes are not a reason to invent work.

Preserve active native writers until useful checkpoints. A visible PM may inspect
their files read-only now; when the native worker belongs to Delivery, Delivery
relays the PM's concrete corrections. Before successor writes, record actual
checkout/head, dirty and untracked inventory, useful evidence and remaining
behavior; preserve valuable bytes and explicitly release the old writer's custody.
Do not restart or transplant a working thread for appearance. Keep one writer per
coupled seam and one Git/deploy owner. Verify the live PM model, reasoning and
execution mode; names and successful prompt sends are insufficient. A real first
reply identifies owned files and the next check.

Levi's current restart direction allows ordinary Shiitake implementation,
including longer work and sustained goals, on the corrected `b2a6cd8` bundle.
Switch at natural handoffs using the existing visible owner, neutral
`fungi run --connect`, and tracked `run-and-notify.sh` /
`notify-herdr-agent.sh`, with the actual Hive invocation root and first response
checked. The launcher reports completion of an accepted **run**, not necessarily
completion of the durable goal. The goal backend landed at `e7aa4a0`; autonomous
PM/lead recovery and goal-terminal notification remain unproved while the recorded
mail settlement/wake gaps are open. Preserve Codex PM/Game Delivery coordination
roles for that concrete capability boundary. Human goal/footer controls are not a
worker-adoption gate. No new scheduler, provider, resource or Botanical source work
belongs in Hive.

Use native completion waits and meaningful source/review handoffs. After
acceptance, integrate the result or give the released owner the next authorized
outcome. Existing issues, PROTOTYPE/ARCHITECTURE and short custody logs retain the
facts. Preserve the Game CTO + Delivery / Game Lanes tabs, Botanical's separate
portfolio, live authors and user focus. Root goal status remains user-controlled;
a pause does not mark authorized game work complete. Broader resource, backend,
production and cross-repo decisions retain their authorization limits.

Baseline controls at `016b1a02b009e798165bd4ba11653093cf4ee1c6` remain
playable on the authorized preview while the next source slice develops.
Independent work begins with separating HUD display from guidance/notice logic,
and the requested original adult-witch/child lineup study. Their outputs join
through direct source/render inspection; game state remains the single simulation.

## Superseding near-term priority (Levi, 2026-09-07)

Keep the map deliberately tiny until a repeatable everyday home loop is fun:
depth before area. Versioned local Save/Continue/New/downloadable backup is
shipped on the feature preview. Draft/Undraft plus reachable Go/hold for one
selected home member, with paused admission and ordinary-work resumption after
Undraft, and deconstruction are also shipped there. Its strict Zod schema v4
persists that intent at the untrusted persistence boundary and reads existing
v1/v2/v3 saves without rewriting them merely on load; restore is paused and
never advances the world offline. The optional Devil, animal, and fire studies
are also shipped. The next playable choice remains another bounded everyday-home
outcome, not automatic map growth. Draft/Go adds neither combat nor a framework.
Generated chunks and the local caravan
remain later direction; the tiny-map-fun gate changes sequencing, not their
durable value.

The one-mugwort candidate—explicit shared Sow, fixed-tick planted/growing/ready
stages, then Harvest into a real bundle—has local source/browser proof and is
shipped on that feature preview. Weather, gases, breeding, grafting, and a
generic farming framework remain outside this slice.

## Durable work issues

These issues preserve Levi's direction; an open issue is not a shipped feature.

- [Two-person home with real shared work](https://github.com/fungi-computer/hive/issues/1)
- [Adult witch and child character study](https://github.com/fungi-computer/hive/issues/2)
- [Upper-floor home and camera views](https://github.com/fungi-computer/hive/issues/3)
- [Chunk-loaded world with local save and caravan return](https://github.com/fungi-computer/hive/issues/4)
- [Persistent homelands, offline helpers, and nations](https://github.com/fungi-computer/hive/issues/5)
- [Measure colony scale to 50–100 people](https://github.com/fungi-computer/hive/issues/6)
- [Paper-doll gear, rotatable packs, and hauling arms](https://github.com/fungi-computer/hive/issues/7)
- [Leather processing and physical knowledge books](https://github.com/fungi-computer/hive/issues/8)
- [Crafted arrows with swept multi-level collision](https://github.com/fungi-computer/hive/issues/9)
- [Zen garden and fishing pond from excavated terrain](https://github.com/fungi-computer/hive/issues/10)
- [Authored magical palette, lighting, grass, and leaves](https://github.com/fungi-computer/hive/issues/11)

- [Colony controls and Caps UI: selection, work designation, and planning](https://github.com/fungi-computer/hive/issues/12) — active UX/source pass

- [Loose world direction: occult chess, tarot, magic, shrines, and cults](https://github.com/fungi-computer/hive/issues/13)
- [Witch gardens, greenhouses, grafting, and brewed ingredients](https://github.com/fungi-computer/hive/issues/14)
- [Land, factions, offices, and physical roleplay authority](https://github.com/fungi-computer/hive/issues/15)
- [Versioned composable domain capabilities for modded servers](https://github.com/fungi-computer/hive/issues/16)
- [Cultural knowledge transfer and controller authority](https://github.com/fungi-computer/hive/issues/17)

## Latest direct Levi direction

Game delivery reports and playable feedback now go directly to Levi; routine
Botanical CTO reporting and checkpoint waits are retired. Astra personally
reviews all delegated 3D models at native/game scale, across facings and in motion
before they reach the preview. Lower-model execution never delegates art acceptance.

Levi selects **Caps as it exists** for the HUD; Caps improvements await his
separate direction. Hive consumes pinned local Caps/Stipe tarballs with React
18.3.1, satisfying Caps' declared peers. Caps owns Button/Checkbox behavior,
OpenTUI owns physical keyboard matching, and Hive owns world selection,
designation and scoped commands. Joined-game proof owns focus and disabled-
activation claims; the earlier locator-only probe does not.

Controls need a deeper colony/tycoon UX pass: distinguish multi-person selection
(normal, modified and box selection) from click-drag work designations such as
Chop. Designations become shared jobs; direct contextual orders and queued orders
capture selected actor IDs. Keep inspectors for detail, rather than requiring
an inspector for every task. Check primary references and a small real interaction
before broad UI expansion. No desktop/window framework is implied.

Only after the tiny-map-fun gate is met,
multiple floors are a later playable foundation: build stairs and an upstairs bed
and actually use it. The Sweeney Todd
barber shop above a meat kitchen gives vertical openings a concrete later use.
Keep shared floor/opening geometry ready for traversal, falling objects and later
projectiles; the chair and processing chain do not gate the first upstairs room.

After the active upstairs outcome, the first workstation is one kettle plus
fermentation vessel for one honest herbal ale: visible ingredient/work/fermentation
state, deterministic fixed-clock fermentation, and one physical keg/output that
can be stored and served. Mugwort is flavouring, not fermentable grain. Preserve
the specific “Fig Leaf Bi-Carbonate” MF DOOM MM..FOOD nod through authored names,
recipe art, and menu details; additional concrete recipes remain proposals. Grain,
yeast, water, fuel, quantities and timings remain unresolved proposals; no free
stock, fluid/weather engine or backend is implied. The shelf direction is mixed
contents shown as a simple grouped item/count list, never backpack packing;
bulk/filter/priority/weight are proposals and pawn carry weight remains separate.
After mixed storage and the first brew, a proposed environmental-workpiece slice
turns a standing tree into a persistent felled trunk, then applies further
authoritative fixed-tick work to produce logs. Falling animation reads the
simulation-owned direction, phase and impact geometry; possible crushing and the
woodcutter skill needed to control direction remain unsettled. Logs may later
branch into useful firewood or timber, and one bulk **fell and process**
designation may carry the dependency chain without forcing repeated clicks.
Intermediate workpiece identity, progress and material provenance survive
cancel/save/reload and use the common goods/transfer owner. This is not current
schema-v7 runtime or a new hauling branch; yields, tools and physics are open,
and no animation callback settles impact. The sequence is a proposed useful
consumer after storage/brewing, not a requirement that every ingredient gain a
long production chain.
Later hygiene may draw on medieval wells, carried water, basins, latrines/waste,
then baths, shaving/barber service and Dwarven pumps/pipes. Preserve the narrow
utility seam: shallow trench + lay pipe + backfill in one top-ground cell, with
Expose/Repair/Remove/Cover; cover removal preserves pipe/content and the normal
surface returns. A Utilities/X-ray view reveals network/floor/flow/breaks without
altering simulation. Current levels are logical storeys, not volumetric terrain;
this remains future direction after brewing, not an upstairs/runtime/framework
requirement.

Future living-landscape work keeps geographic climate potential separate from
persisted ecological condition and coarse map aggregates. Water, heat and
material stores stay finite; trees, grafts, fungi and derived goods retain
identity/provenance; lifecycle behavior is composed from typed dimensions, not
a giant FSM. Decay may invalidate or adjust reservations atomically with a
visible job reason rather than freezing the material. Local saves remain paused
and do not advance growth offline; no ecology runtime is selected here.

Presentation needs Sims-like front-wall cutaway modes, separate roofs/storeys,
and optional tree/canopy fading during construction. Terrain editing, building,
and planning marks are distinct player modes. Planning marks have no wood or
work commitment until converted to actual blueprints; hiding foliage never removes
its collision. Four camera views follow the first usable floor controls.

Levi's excavation/water destination is a personally built Zen garden and fishing
pond. The first water target is diverting a stream into a pond with flow control
and a drain. Avoid manual source-block or bucket puzzles: use a finite conserved amount,
gravity, connected-surface leveling, and a pond fill-level order that creates
real hauling work, with later inlet, drain, and pump options. A candidate model
is active wet-cell simulation with sleeping settled regions and actual cross-Z
openings; explicit sources and sinks own all additions/removals, and unloaded
boundaries never silently discard or duplicate water. Pressure/connected vessels,
stable levels, chunk crossing, and offline accounting require proof. First prove
basin/fill/breach/drain plus conservation and reload; only then broaden fluids,
fishing, or garden presentation. The simple CA discussion at
[W-shadow](https://w-shadow.com/blog/2009/09/01/simple-fluid-simulation/) and
[Red Blob Games terrain from noise](https://www.redblobgames.com/maps/terrain-from-noise/)
are references, not selected or copied implementations.

Rich nature and witch gardening remain connected future hypotheses: deep plant
cultivation, grafting, greenhouses, mint, and gathered animal ingredients such
as eye of newt could feed a chain of conditions → growth → harvest → storage/
hauling → recipe. Rootstock/cutting compatibility needs design; there is no
universal graft-anything claim. Small cultivation and recipe work can be proved
independently; pond-driven moisture joins after the water conservation proof.
Neither expands the current home goal.

## Loose occult-world and card direction

Levi adds Null Tale's art, [Chess of Death / Fate Chess](https://nulltale.itch.io/chess-of-death)
and LutLight2D as inspiration beside the accepted original references. The
Witcher’s Gwent is the reference for a memorable game within a game. Possibilities:
a small occult chess-like guest game; collectible pieces and tarot; winning
matches to earn cards; cards granting/teaching magic; Major Arcana causing powerful,
hard-to-recruit people to appear. Shrines, teleporting to another player's shrine
and cult-building belong to this loose world direction. These are connected
hypotheses, not locked mechanics or additions to the active home goal.

A possible loop is chess → cards/pieces → magic/encounters → recruits/shrines/cults.
Keep collectible physical ownership consistent with later inventory and caravans;
a shrine trip would use the same cross-world identity transfer and destination
permission as other visits. No separate teleport authority or live model scheduler
is requested. Original art only; references and uploaded images are inspiration.

Tarot can be one explicit character-arrival path without becoming the sole
recruitment authority. Candidate prototypes include a starting Fool introducing
the first person, a later Lovers card introducing a bonded pair, and rare Arcana
creating opportunities to recruit powerful people. The card creates an arrival
or opportunity through the same identity/party admission boundaries; it does not
silently bypass consent, capacity or physical-world rules. Exact card effects and
future family/children dynamics remain separate later design questions.

Levi's [Technonomicon cards](https://technonomicon-red.vercel.app/) and
[repository](https://github.com/technomancy-dev/technonomicon) are a further
presentation reference. Start with one original Three-authored Major Arcana
subject scene, bake it through the fixed low-resolution path, and render it in
one shared readable card layout with title/number, illustration, symbols, and
short text. Prove one card at native and enlarged presentation before authoring
a whole set; card UI uses Caps as-is where its components apply. This does not
add an Astro app or a second art engine to the game. Deployment/repository age
parity is still unverified.

## The experience we are building toward

A player develops a persistent witchy homeland with roughly five controlled
people, divided into working and traveling parties. Another player can arrive
with their own caravan, possessions, learned spells and history. The visited
world remains a place with its own buildings, supplies and permissions.
Characters retain their identities when traveling; visiting does not clone them.

Working assumption: homelands have separately identified world spaces connected
by travel. A continuously shared geography is not required for the first visit.
Within a homeland, terrain can expand through chunk generation and loading.
Five people is the initial player-roster target, not a hard limit on all entities
or a fixed-size data representation.

Levi explicitly extends the ambition to 50–100 controlled people and small
AI-managed nations spanning many chunks. Retain stable identities and party/job
scope without a five-entry array or a five-person global acceptance ceiling.
Higher population is a benchmark and control-design requirement, not a measured
capacity claim today. Squads, standing orders and settlement-level intent should
eventually reduce command burden; they still feed the existing game authority.

Pacing has three connected bands: immediate colony decisions in seconds;
visible jobs, building/crafting and optional short chess matches in minutes; and
standing-order/offline projects over longer spans. Chess remains interruptible
so the player can return to the colony, and connects to guests, knowledge, cards,
spells and recruiting rather than owning a separate clock. One authoritative
world clock serves every multiplayer client; the current local speed control is
only a prototype convenience. Profile input/render responsiveness separately
from assignment/path/state work and offline scheduling, and never infer
50/100-person capacity from the two-person correctness fixture.

Pacing experiments should test an approximately 30-minute preparation/downtime
→ tension → exciting-event → recovery arc, with a compelling first ten minutes:
Bramble orientation, one useful crafted or built outcome, a visitor choice and
a visible preparation payoff. This is not a fixed raid alarm, a periodic reset
or a second clock. Raids, visitors, storms, caravans and rituals are alternative
event pressures; lulls support building, gardening and interruptible chess or
cards. Keep exact timings as measured playtest hypotheses.

Future GTA-RP-inspired land and faction play keeps account/character identity,
party membership and organization membership distinct. Realm offices are local
organization records rather than global actor flags. Property title, physical
control and use/build/access permission are separate, and parcels may span both
terrain chunks and simulation regions without becoming either one's mutable
authority. Laws and recognized authority are local. Arrests eventually compose
reachable restraint, escort and confinement actions with existing identity and
physical ownership; they are not remote teleport commands. Persist meaningful
transfers, arrests and relationships without ticking every dormant political
record. Leasing/rent/fiefs are hypotheses, while offline captivity,
release/escape and abuse limits remain unresolved later product decisions.

Elixir Plug supplies a useful API-shape reference only: small consistent typed
feature interfaces compose explicit accepted/short-circuit results. It is not a
selected language, runtime or service. For example, territory/warrant rules and
later court policy can decide an arrest request before the existing authorized
escort activity; each module retains its state and transition ownership. Wait
for concrete consumers before extracting the seam. A universal per-tick
middleware bus or general plugin framework would blur the simulation hot path
and domain authority, and arbitrary mods may still require core changes.
The shipped local persistence boundary is a real untrusted-byte boundary. The
current Draft/Go candidate writes strict Zod schema v3 and reads v1/v2 without
rewriting them merely on load. Future network or mod-data boundaries need their
own selected validation shape. Trusted in-process jobs and activities remain
native discriminated unions with exhaustive real handlers; do not add a parallel
internal parser or repeatedly parse tick state.

Levi accepts dependable basic guard/retreat/shelter standing orders and offline
protection for everyone. Paid AI may add richer stewardship, custom instructions,
situational planning, diplomacy and alerts, but receives only the information,
permissions, actions and authoritative world time available to human control.
Service failure or exhausted budget falls back to ordinary orders. Pricing and
practical-advantage tuning remain unresolved economy work; no paid service,
billing, model call or backend is authorized by this direction.

Future population identity reserves humans for player-controlled characters or
characters delegated to that player's AI stewardship. Autonomous nonplayer
populations use other peoples such as goblins, ghouls and elves. Original elf
art belongs in a later bounded visitor study; neither population enforcement nor
elf assets enter the current home release.

Name controller authority independently of species: **player-directed** means
live player input, **player-delegated** means a player's AI steward acting with
that player's authority, and **world-directed** means simulation-owned control.
Controller, species, culture, faction and knowledge remain orthogonal records.
Elven cultures can specialize in nature practices and dwarven cultures in machine
practices, but knowledge transfer should record the learned practice, source and
transfer event instead of mutating a global racial unlock. Teaching, trade,
observation and durable media are candidate transfer paths for later prototypes.

Levi also requests a readable Rowan name label, Bramble guiding early play, and
an early demonstration of constructing and using a second-floor bedroom.
Those belong in the first implementation sequence below.

## One simulation owner, several kinds of data

Keep the existing synchronous fixed-step simulation. Player commands, later
AI commands and storyteller events are inputs; the simulation owns outcomes.
The browser displays its state. A future server uses the same domain code.

```mermaid
flowchart LR
  Players[Player commands] --> Host[World host: order, authorize, persist]
  Story[Simulated storyteller events] --> Host
  Host --> Sim[Fixed-step game and libcolony]
  Sim --> State[World state]
  State --> View[Read-only presentation]
  View --> HUD[Declarative HUD and Bramble hints]
  View --> Pixi[Pixi scene and camera]
  Host --> Save[Native storage transactions]
```

The host and simulation are parts of one authority, not independent state
writers. Persistence and transport do not reimplement job settlement.

| Concept | Owns | Does not own |
| --- | --- | --- |
| World authority | Sole active writer for all actors, parties, jobs, claims and material in this world, regardless of chunk residency; its tick and admitted commands | A person's permanent player identity |
| Actor record | Stable ID, position, activity, needs and carried material | Another copy of party membership |
| Party record | Member IDs, scoped orders and travel intent | Copies of its people or their inventories |
| Job record | Kind, party/actor scope and stable target reference | A second mutable copy of order or activity status |
| Terrain chunk | Terrain and local object records in a spatial region | A separate game clock or automatic server boundary |
| Resource claim | A promise against available stock/destination capacity | Additional physical material |
| Renderer | Sprites, camera, selection, visibility | Work progress, inventory or elapsed game time |

Record rows describe field ownership under that one writer, not separate
services. Loading a chunk never gives it authority over a person.
Use typed ID records/maps for actor and party lookup. The first two-person
implementation keeps one typed ordered job array as both storage and priority;
add a job lookup index only when a measured caller needs it. Chunk membership and occupancy indexes
are derived references. Do not store the same actor in two mutable records.
Introduce unique item instances when equipment needs individual identity; learned
spells can reference stable definitions and actor-owned learning progress without
becoming transferable item instances. Current wood can remain a typed quantity
with one location.

This is enough data orientation for these slices. A generic ECS, job language,
plugin registry or event-sourcing engine has no demonstrated consumer yet.

## Future definitions, knowledge and physical content

When a real workstation, culture or craft chain exists, its authored definition
may reference assets, recipe inputs/outputs and already-supported behavior or
animation. Admission validates schema and cross-references. Adding an ordinary
recipe must not require a new engine branch; adding a genuinely new behavior must
extend the closed command/job/activity owners exhaustively and prove one
producer-to-completion path. The current `BUILDINGS` map and chop/build/rest
variants are the concrete baseline, not evidence that a workstation-config or
general scripting system exists.

Physical storage is a location/capacity owner alongside piles, cargo and sites.
Its filters decide admission, while claims reserve a concrete free slot or
quantity; linked shelves may share policy but never capacity or material. Books
are movable item instances carrying identified practices/provenance, while an
actor, faction or institution's learned knowledge is separate state. The future
product loop is discovery → learning → recording/teaching/trade → application;
visibility remains grant-scoped, so an ID is neither universal knowledge nor
permission to read another faction's secret. Mushroom batches/strains and a
later greenhouse culture are consumers of this same seam, not a second discovery
engine. Exact literacy, practice, secrecy, cultivation and storage policy await
their first concrete consumer.

Before an ECS decision, measure deterministic 5/50/100 actor fixtures separately
for dirty assignment/path/topology work, ordinary activity ticks, mutation churn,
render projection and allocation. First compare small pass-local derived indexes
and topology-revision caches while preserving replay, claims and material totals;
only then compare a thin Miniplex or bitECS adapter if component-membership cost
is material. Neither library owns spatial topology, pathing, ordered priority,
claims or command authority, and no ECS dependency is selected now.

## Parties and composable work

Commands capture their party and selected actor scope. A person can work only
on authorized jobs for their current party and command scope. Reprioritization
changes waiting order; it does not silently interrupt a current haul. Explicit
cancellation and departure use the same activity cleanup/material rules.

Keep persistent orders separate from their currently executable activity.
Construction derives hauling and work from the site's real remaining material
and work. A later workstation should reuse these operations, adding its recipe
and domain outcome rather than copying movement, pickup, cancellation and UI.

One scheduler pass offers eligible actor/job edges to the real pinned
`Module.optimize`. Use a shared task ID for an exclusive job across actors and
exactly one edge per actor/job pair. Deterministically select one feasible
source/path payload per pair before emission and keep that payload in a lookup
keyed by the pair; do not encode its alternatives as duplicate edges. Never call
the optimizer independently for each person and then
pretend it coordinated their assignments.

Player priority constrains eligibility before matching. Specify and test the
small admission policy with examples: one worker retains first-ready behavior;
several workers may fill several ready orders; an explicit actor assignment is
respected; a waiting order does not stall unrelated ready work. Avoid introducing
a second optimizer to encode those rules.

Commit returned assignments in a stable order, rechecking and claiming scarce
source stock, destination capacity and exclusive work before travel begins.
An assignment that cannot claim its resources waits for a later tick.
libcolony matches people and tasks; it does not know two tasks want the same log.

Claims do not add to material totals:

```text
physical piles + actor cargo + material held by sites = produced - consumed
available pile quantity = physical pile quantity - outstanding pickup claims
```

Pickup transfers material from pile to actor and releases its source claim;
the destination obligation remains until delivery/cancellation. Delivery moves
the material into the site. A cancellation must preserve recoverable material,
including the reviewed roof-over-wall case. Account for finished construction
either as retained material or consumed material, consistently, never both.

For the first caravan, admit departure only after local work is finished or
explicitly canceled. Pre-pickup cancellation deletes a claim without changing
the pile's physical quantity. Post-pickup cancellation returns committed cargo
to a reachable origin pile and releases destination capacity; merely deleting
the claim cannot move wood. Then load selected caravan supplies through a real
hauling order. A later explicit reauthorization could allow already-carried
supplies to travel; do not silently convert cargo committed to someone else's work.
Keep body collision soft initially; competing stock/jobs already require claims,
but exclusive doorway occupancy needs its own actual gameplay requirement.

## Chunks, generation and the camera

Retain global integer `{x, z, level}` positions within a named world. Start with
16 by 16 horizontal chunk cells: the authored 15 by 15 home fits inside one,
and crossing its edge is easy to prove. This is a tunable storage/render choice,
not a limit on a room, journey or homeland. The ground art remains 32 by 16
native pixels per diamond; chunk size and sprite size are independent.

Use floor division for chunk lookup. With width 16, x=-1 belongs to chunk -1,
local x=15. Positions, generated IDs and ownership do not change when a chunk
loads or unloads. Generated IDs derive from stable world/feature locations;
dynamic IDs use a persisted world-owned allocator with a world namespace.

Separate three lifecycles:

- **Visible:** instantiate terrain and sprites for the camera plus overhang.
- **Resident:** keep decoded data needed by active actors, work, navigation and
  construction queries. Dirty data cannot be evicted before a successful save.
- **Simulating:** advance the people and work in active regions, even offscreen.
  Dormant unoccupied terrain requires storage, not continuous per-tile ticks.

Home work pins its necessary data. Moving the camera away can remove its render
objects, but must not stop its worker. Use a third unoccupied modified chunk to
prove actual data eviction; do not require eviction of a chunk still needed by
the person working at home.

Generate only absent base terrain, using world seed, generator version and
stable coordinate-based randomness. A future visual/performance experiment may
combine layered/fractal noise with separate elevation, moisture, climate,
terrain, and water-connectivity signals; the recipe is not fixed. Neighbor
request order must not affect the result. Border sampling/feature ownership
prevents seams and duplicated trees. Player edits override deterministic base
terrain and preserve removals/tombstones, so revisiting cannot restore chopped
trees or collected wood. Caves require volumetric data rather than a painted
surface. Global seed/coordinates, edits, and cave representation must be proved
before treating this as a worldgen implementation.

World queries distinguish known walkable, known blocked and missing data.
Pathfinding searches a bounded loaded corridor and returns a route segment,
needs-data, search-budget-exhausted or no-route-in-that-domain outcome.
Missing data is not a reason to drop carried wood or declare a job impossible.
A journey retains its destination while segments load. Initially reuse bounded
BFS; choose A*/hierarchical routing only against a measured larger journey.

Room and footprint queries also cross chunk boundaries. Pin a bounded complete
construction region and known exterior border; if its continuation is unknown,
report pending rather than treating a residency edge as outdoors. Cache these
derived results on relevant topology changes and share them with UI/jobs.

Decouple the movable view transform from the fixed art-bake camera. Projection,
picking, ghosts, paths, names and cutaway use the same camera origin and selected
level. Render near that origin rather than feeding very large coordinates into
graphics math. Preserve the existing art scale and pixel alignment.

The current cut-earth clearing image cannot repeat as terrain. Adapt the
original geometry into seamless ground tiles/patches; retain the home as authored
terrain. Keep depth-bearing props and people in shared visible sorting layers:
nesting each chunk's bodies in a container prevents sprites in different chunks
from interleaving correctly. Include offscreen roots with visible canopies.

## A real upper floor, early

Define `level` as an integer walkable storey for this cut, initially 0 and 1.
Use one shared art storey-height constant, calibrated against existing walls
(about 2.16 geometry units) and thatch (about 2.5). A geometry height passed to
the current projection is not already a logical floor number. Preserve the
approved ground-floor art while measuring the first upper-floor cutaway.

Add material-built **floor** and **stair** definitions. Roof provides cover;
floor provides a supported walking surface and cover below, subject to an
explicit stair opening. Surface, standing-object and overhead occupancy must
replace the current roof-versus-everything overlap shortcut.

Use one modest supported upper platform over a finished lower enclosure; reject
unsupported extensions. This is a declared construction rule, not a structural
physics solver. Floors/stairs need legal lower construction positions so the
first landing can be built before it is reachable from above. Ordinary upstairs
furniture requires upstairs work positions. Current x/z-only work adjacency
must include storey and the actual allowed construction position.

A finished stair adds a directed pair of traversal edges between its lower
entrance and supported upper landing. Ordinary neighbors stay on one level.
Revalidate those edges/endpoints during travel; render continuous ascent without
changing logical positions to fractional cells. Selected-floor picking, visible
footprints and floor cutaway must make upper placement unambiguous.

Prove gathered wood becomes floor/stairs, then carried bed materials go up those
stairs, the bed is built upstairs, and an actor actually sleeps there. Its two
cells need support, enclosure and cover. Block the sole stair approach and prove
a later delivery/rest order cannot work or sleep through the floor. Shelter
and a particular actor's access are separate queries. General ramps, elevators,
terrain excavation and arbitrary structural collapse remain outside this proof.

## Readable UI and Bramble's introduction

The next goal makes the world fill the viewport. Remove the surrounding title,
sign, boxed workbench/footer and instruction strip; rehouse useful controls in
compact overlays. Keep time/fake-storyteller status at the edge, a roster for
selection, a build palette, a selected-character inspector and a target action
menu. Orders, rest and routines belong to their relevant actor/party context.
Use a small explicit set of windows and their focus/close behavior, not a generic
desktop environment. Overlay input must not also place a blueprint underneath.

The view camera may pan/zoom independently of the art-bake camera. Use one uniform
world-to-screen transform and its inverse for picking, ghosts and anchored labels;
do not stretch the fixed 640 by 400 art into a different aspect ratio. Names and
controls remain readable when the view changes. Ordinary play fills `100dvh`;
browser Fullscreen API remains optional and user-triggered.

Levi explicitly selects OpenTUI Keymap for hotkeys. The interim uses the pinned
`@opentui/keymap@0.5.10` HTML adapter, one binding definition and its active-binding
formatting for HUD hints. The retained Botanical browser integration was inspected
at `366dc8c1339cf5f5fbd07ffefc6eba8c8fa42c9d`; current Botanical-next has the accepted
physical/semantic ownership ADR, not a claimed already-integrated keymap caller.
Game actions remain local; no Whistle/runtime migration is part of this game.

The requested floor controls should distinguish active storey from cutaway/roof
visibility. Four quarter-turn views are the intended later rotation interface.
Rotating projection requires inverse picking, view-relative depth sorting and
matching directional bakes for props, joins and figures. It never mutates world
positions. The original Three geometry is the source for those extra views.

Click a person or roster portrait to inspect/select them. A target context menu
offers valid actions for that selection. Capture actor IDs when an order is
submitted, so later selection cannot retarget it. Distinguish an immediate direct
order from a queued order and shared construction designation. Interruption uses
the same physical-cargo/claim cleanup rules as cancellation; it cannot discard
wood or claim someone else's current work. Keep keyboard focus on stable controls
as the underlying activity changes. Touch must have an explicit route to those
same target actions rather than depending on a secondary mouse button.

One authored outsider is visibly present before recruitment. Inviting them
changes party membership of that existing actor, after the multi-person scheduler
and material ownership work. It must not create a copied pawn or parallel single-
person simulation. Two people prove the foundation used by the intended five;
the roster representation has no two-person hard limit.

First fix the reported ROWAN name label: legible lettering at native/intended
scale, contrasting backing or outline, stable positioning and a label overlay
that scenery cannot cover. Check the actual ground and upper-floor backgrounds,
desktop and narrow layout. Keep world labels small enough to preserve the art.

Require stable keyed DOM updates and a cached read-only HUD snapshot. React is
the preferred maintained declarative candidate: the first panel migration must
demonstrate deletion of whole-list `innerHTML` replacement, selector/property
wiring and manual reconciliation, without adding another world-state owner.
Judge that actual diff and bundle impact before expanding the migration. Stable
order IDs preserve focus. Pixi keeps its retained display objects and direct
animation updates; UI components do not own simulation ticks or resource state.

Bramble gives short contextual hints based on actual progress: select someone,
place an order, chop for a waiting blueprint, watch hauling, finish shelter and
use the bed; later explain the floor selector/stairs when relevant. Advance hints
on observed outcomes, not fixed delays. Allow dismissal/replay and avoid repeated
interruptions. This is deterministic presentation over existing facts, not an
LLM/chat integration, another job queue or a second tutorial simulation.

Future drawing keeps tool lifetime apart from one gesture and geometry apart
from the action applied to resolved targets. Wall lines, room outlines/fills,
area designations and selection boxes may share level-aware preview/cancellation
rules without becoming a new UI state system. A room blueprint stores only a
relative layout and definition references; each placement resolves current
requirements and creates fresh sites/jobs. It cannot copy delivered materials,
claims, actors or construction progress, and it never silently demolishes a
blocked footprint. First prove one-storey stamping before multi-level copies.

## Next-round art and inventory notes

Levi requests painterly animated grass/leaves. Start with a small original
Three-to-sprite wind study: grass clumps and leaf canopies have a few authored
wind poses, staggered phases and stable placement. Trunks can stay still while
canopies move. Keep pixel scale, depth, overhang and transparent sorting readable;
do not add a general foliage engine before the motion looks good in the game.

He also requests Diablo-style rotatable backpack packing, with hand-held work
cargo separate from that grid. Stable item instances eventually have exactly one
location: ground, backpack placement, equipment/hand slot, construction/work input,
or explicit consumed output. Rotation and footprint determine packing; mass is a
separate rule. World tile size does not determine inventory-grid size. Large logs
can occupy hauling capacity/arms without being compressed into backpack squares.
The current quantity-based wood transfers and future item movement share the same
conservation rule; claims promise transfers and never create a second item. This
direction does not require nested bags, equipment balance, ammo varieties or a
general container framework in the current two-person home.

Equipment should have a readable paper-doll panel with compatible drop targets:
head, body, hands and feet, plus worn storage such as a backpack and belt. A bag
provides its own storage layout rather than silently increasing a global integer.
Removing it must move the bag with its contents or explain why that move cannot
fit; never discard overflow. Gear definitions describe slots, footprints and
effects; particular items retain identity, material and condition. UI drag ghosts
are proposals until one simulation command transfers the item successfully.

Levi wants deep authored crafting, early leather processing followed by refined
methods, and knowledge exchanged through physical books. Research actual mod
mechanics before choosing a small first chain. A book, recipe knowledge and a
person's skill are distinct facts; copying, teaching and use should become
explicit work rather than a global unlock triggered by owning a book. These are
future product considerations, not a new crafting system in the controls release.

NullTale/LutLight2D is a requested lighting reference. Its Unity URP implementation
uses authored color ramps/LUTs and lighting intensity for palette replacement.
Explore that technique with the existing original baked sprites and a separate
world-light field; keep UI colors and simulation visibility independent of the
presentation shader. Spooky moonlight, emissive mushrooms and magical lanterns
should first be a small rendered night study.
[Upstream reference](https://github.com/NullTale/LutLight2D).

## Persistence and future multiplayer hosting

The first local persistence proof should use IndexedDB through the maintained
[idb API](https://github.com/jakearchibald/idb), with native transactions across
changed chunk records and the world/actor/job checkpoint. Prepare a coherent
snapshot before asynchronous writing; acknowledge its revision only after commit.
Do not serialize Pixi objects, caches or connections. Store schema/generator
versions and validate imported/stored representations with a maintained schema
decoder. Do not build a generic database abstraction or migration framework.

Keep the active simulation synchronous and typed. Effect is a candidate owner
for actual storage/network/cancellation lifecycles as those arrive; it does not
replace native transactions or become a real-time scheduler for walking and work.
Prefer one boundary schema owner when persistence/transport are implemented,
rather than independent shape parsers in every caller. Pin and prove adopted
dependencies in that implementation slice; this plan installs none.

For hosted multiplayer, start with **one homeland/site authority containing
multiple chunks and everyone currently interacting there**. Cloudflare recommends
coordinating at the logical unit whose state must agree. A terrain boundary is
not automatically a server migration. Large-world sharding remains a workload
decision, not a reason to distribute the first house across several DOs.
[Cloudflare design guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/#model-your-durable-objects-around-your-atom-of-coordination).

A SQLite-backed DO is the proposed first hosted authority. Its attached storage
can commit local state atomically; that transaction does not span another DO or
roll back a mutated JavaScript object. On a failed commit, discard/reload the
uncommitted candidate before continuing. Keep simulation transitions synchronous
and network/model awaits outside them.
[Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

Clients submit intent for their authorized actors; the host orders/validates it
and publishes authoritative revisions. Use command identities to suppress
duplicate effects on reconnect, with bounded retention/checkpoints. Hibernating
WebSockets are the candidate multiplayer transport. Local UI selection is private;
shared speed/pause/reset belongs to the world's policy, not any visiting client.
First prove two clients in one authority before independently hosted homelands.
[WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Permanent player ownership and current simulation authority are different.
When a wife visits her husband's world, her people/items/abilities retain their
IDs and ownership while the destination becomes their sole active writer.
Later cross-world handoff must survive retries and crashes without two active
copies or lost cargo. That needs a small durable transfer state machine proven
between two actual owners; it is not implemented by a same-world chunk crossing.
Do not invent its wire protocol before the two-site caller exists.

A guest initially controls their own people. Building, taking shared supplies,
trading or affecting residents needs explicit world permissions. Spell execution
uses host-validated ability state and game rules, not arbitrary client code.
Authentication, spell mechanics and those permissions are later implementation
slices, not features this architecture pass has delivered.

## Time while away, timers and AI

Store the last committed simulation tick and its wall-clock mapping. Online
worlds advance through the same fixed-step rules. On wake, process elapsed work
in bounded batches, saving progress and never moving the cursor past work that
was not performed. The current browser frame accumulator clamps long delays and
must not be reused as offline catch-up. Persist enough pending work to continue
after interruption. New commands must not be applied retroactively ahead of an
unprocessed backlog.

DO alarms request a wake; they are at-least-once delivery, not the simulation
clock or exactly-once outcomes. Ordinary recurring JS timers prevent hibernation.
A per-DO alarm may represent the next due meaningful activity while durable game
state records all pending work. Do not keep every wilderness tile ticking or
promise exact wall-clock callbacks.
[Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/),
[lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

Before optimizing an offline interval into deadline arithmetic, prove equivalence
to the fixed-step path for the affected work/needs/dependencies. Distant caravan
travel may eventually use a coarser explicit travel model; the first local proof
walks real cells and does not claim an equivalent offline macro model.

Optional paid automation can fund defined activity/AI decision budgets with
cancellation and expiry. Persistence, active simulation and model calls have
different costs. Pricing and entitlements are product work after measuring the
service; no payment or model integration belongs in the first local milestone.
AI actors issue the same authorized commands as humans. Shiitake remains the
future storyteller; its event delivery timing never owns movement or resources.

Autonomous factions retain identity, memory, loyalties and history independently
of controller/model provider. Controller, player account, actor, species, culture,
faction and knowledge remain distinct records: player-directed, player-delegated
and world-directed name authority rather than species; elves can originate nature
practices and dwarves machine practices without a global racial unlock. A future
game-tool adapter exposes only bounded, revisioned, grant-filtered observations
and typed idempotent commands, plus bounded long-work readback. It does not dump
world state or let model code mutate it. Familiar, faction and storyteller grants
are separately authorized but settle through the same world command authority.
This is a host/product boundary for a future persistent world, not an MCP/DO
implementation or authorization for live AI in the home candidate.

## Implementation sequence and evidence

| Slice | Observable result | Source responsibilities and decisive proof |
| --- | --- | --- |
| 1. Full-viewport two-person home | The world fills the window. Inspect Rowan, issue direct/queued contextual work, recruit an outsider and have both share supplies correctly. Names are readable and Bramble explains the loop. | First review the new surface/inspector and an actual chop outcome. Type `clearing/jobs/resources` and definitions, add actor/party IDs and claims, adapt `main/hud/view`. Two people/two orders/one scarce pile cannot duplicate material; cancellation refunds reachable wood; existing home/rest/pause/replay and keyboard-focus checks remain valid. |
| 2. Upper-floor bedroom | Build a modest loft, carry materials upstairs, build and use its bed. | Extend `world/movement/construction/art/home` and view together. Explicit stair edges/work positions, supported footprints, correct cutaway/picking, and blocked-stair negative case. Review intended-scale pixels before more vertical content. |
| 3. Local caravan and streamed terrain | One person leaves with earned cargo, crosses a chunk boundary and returns while the other keeps working at home. | Replace finite-grid/data/camera assumptions through `world/movement/construction/view/art/clearing/scale`. Keep home data pinned offscreen; save/evict/reload a third modified unoccupied chunk. Restart from a committed snapshot and preserve actors, cargo, jobs, stumps and construction. |
| 4. Same-world multiplayer host | Two clients control their own people against one authoritative world. | First resolve hosted optimizer memory/runtime fit. Then local DO storage/socket proof, duplicate commands, reconnect and eviction; remote deployment requires its own concrete authorized backend candidate. |
| 5. Homeland visits and background work | A caravan enters another persistent home; its identities and possessions survive departure/arrival and offline work. | Actual two-owner transfer recovery, permissions and bounded catch-up parity. Add spell demonstrations and paid AI only as separately bounded consumers of these foundations. |

These are coherent increments, not parallel writers for coupled game seams.
Astra owns the core implementation; bounded reviews inspect the actual first
source/rendered shape. UI presentation and later hosting research can proceed
independently where they do not depend on an unresolved model change.

## Later combat reference: one bow, real arrows

Levi proposes Combat Extended as a reference for eventual combat. Its current
Development source was inspected at
`c63c9656c0837371014b45519bfd6becfa0bc4ac`. It is a C#/Unity/RimWorld mod with
CC BY-NC-SA 4.0 licensing; it is a mechanics reference, not a dependency or a
source of shipped code/assets for this original game.
[Upstream source](https://github.com/CombatExtended-Continued/CombatExtended/tree/c63c9656c0837371014b45519bfd6becfa0bc4ac).

After the home/upper-floor work, the first useful combat experiment is crafting
arrows at one simple workstation and ordering an actor to shoot a stationary
target. Consume a real arrow, sample seeded aim error at launch, advance its
position/velocity on fixed simulation ticks and sweep the traveled segment
against world-space collision shapes. The earliest physical impact owns the hit;
the sprite's screen overlap does not. Swept collision prevents a fast arrow
passing through a thin wall between ticks. Rendering interpolates that state.
Use simple explicit body and wall bounds consistent with floor height before
adding body parts, armor, suppression, injuries or spell content. A wall between
bow and target, a moving target and a different launch height are the useful
follow-up cases. This experiment is a separate playable cut, not a prerequisite
for the current controls/recruitment goal or permission to build all of CE.

Keep projectile state and RNG in the same simulation authority as jobs. Later
multiplayer clients can display predicted motion, but only the world host settles
ammunition and impacts. Chunk residency must cover an active projectile's bounded
flight; physics never silently advances through unknown terrain. These are
ownership constraints, not a new network protocol in the local demo.

Only after that real arrow caller exists, a projectile pool may reuse a bounded
set of storage/display slots. Every launch still gets a fresh logical shot ID and
resets all transient position, velocity, swept-collision and trail state. Pooling,
renderer batching and visible culling answer different measured costs; none may
merge authoritative ammunition consumption or hit settlement into sprite state.

Slice 3 has three internal checkpoints: first global coordinates, deterministic
border generation and correct camera/depth/picking; then atomic save and eviction
of the third unoccupied modified chunk while home remains pinned; then departure,
crossing and return with real cargo while the second person works. Keep each
working checkpoint reviewable instead of hiding failures inside one large change.

For the local caravan slice, the required proof includes:

- Real libcolony assignment across the roster, unique actor/job edges and claims;
  cancellation/reprioritization/departure keep one material owner.
- Positive/negative chunk boundaries round-trip; opposite chunk-generation orders
  produce the same borders and unique features.
- Missing data waits safely. Routes and a two-level home's room/stair queries
  work across storage borders exactly as within one chunk.
- Camera changes do not alter outcomes. A bounded resident/render cache stops
  growing after a long outward-and-return journey; dirty-save failure prevents
  eviction instead of losing the player's changes.
- Pause/reset plus save/reload preserve the declared local behavior; replay and
  resumed work agree at equal ticks. Tutorial dismissal and label readability
  are proved separately from simulation.
- Intended-scale normal/narrow pixels, actual browser input, motion and hosted
  static-preview parity after implementation. Layout proof does not imply a
  complete touch-control audit.

## What the architecture pass actually proved

The existing seven-test/home/study evidence remains the accepted baseline, not
a new full-suite run. The source review found the roof-refund and HUD-focus
defects recorded in ignored `.botanical/foundation-review/`. The controls interim
now fixes HUD focus through keyed React updates and removed-control focus return,
proved across a real job-status change. The roof-refund defect remains for the
shared-material work in the active two-person goal.
Fallow's 27 complexity advisories, three clone groups, `drawSites` cognitive 41
and shared art-bundle warning remain disclosed. Decompose appearance, lifetime
and topology by concept when extending those responsibilities; do not hide
findings or split functions merely to reduce a metric.

The pinned optimizer was exercised with two-person matching and exclusive task
IDs. Duplicate entries for one actor/task pair are returned twice by the wrapper,
so caller edge uniqueness is an actual interface requirement. Probe source is
`.botanical/architecture-pass/optimizer-probe.mjs`.

The same unmodified JS/WASM also returned the correct two-person assignment in
local workerd through a small startup adapter using its `instantiateWasm` hook.
Versions: Wrangler 4.127.1, workerd 1.20260828.1, Miniflare 5.20260828.0-alpha.
The installed runtime rejected compatibility date 2026-09-07; the disposable
probe used its supported 2026-09-04 date. The production config was not changed.

**Hosted fit remains unresolved:** the release exposes 327,680,000 bytes
(312.5 MiB) of Wasm linear address space, while Workers documents a 128 MB
isolate memory limit. Local API success does not establish production memory
accounting or capacity. Resolve this with a focused platform-fit measurement;
if the release's memory configuration must change, rebuild the selected upstream
source with explicit provenance and re-prove its interface, never substitute an
optimizer or silently modify vendor bytes. Full DO simulation, persistence,
hibernation and remote deployment have not been proved by this spike.
[Workers memory limits](https://developers.cloudflare.com/workers/platform/limits/#memory),
[Wasm integration](https://developers.cloudflare.com/workers/runtime-apis/webassembly/).

Follow-up source inspection confirms this is a configurable release choice:
the pinned Makefile sets `INITIAL_MEMORY=327680000` and `TOTAL_STACK=160000000`.
The header documents Hungarian assignment and allocates its main double matrix
as `value[NX][NY]`. For five people and 100 unique candidate tasks, that matrix
is 4,000 bytes; this figure excludes other algorithm/glue/runtime allocations.
The unchanged header, Embind bridge and JS post-wrapper have now been rebuilt
with portable Emscripten 3.1.46, `INITIAL_MEMORY=16777216`,
`TOTAL_STACK=1048576`, `ALLOW_MEMORY_GROWTH=0` and `STACK_OVERFLOW_CHECK=2`.
Local workerd accepted the actual five-person/100-task caller, running 100
assignments with a constant 16 MiB linear memory. The controls interim integrates
those exact generated bytes; seven simulation tests and the actual built-browser
chop/haul/build input proof pass with the 16 MiB heap. This does not establish
hosted DO service capacity. The rebuild, setup command, runtime caller and result
are preserved in ignored `.botanical/architecture-pass/libcolony-rebuild/`.
Unchanged upstream sources are retained in `vendor/libcolony/`; the reproducible
compiler command is `scripts/build-colony.sh`. Current and original release
hashes are recorded in `public/vendor/libcolony/PROVENANCE.md`.
[Pinned Makefile](https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/Makefile#L6-L7),
[algorithm source](https://github.com/mafik/libcolony/blob/867b2147fc0e8bfa28e873d576c5e4b186ec3b2f/src/colony.h#L64-L72).

Ignored `.botanical/architecture-pass/host-probe/README.md` links the preserved
failed/successful attempts and scope cleanup. Local topology/installed-Pixi
inspection also confirmed the finite grid, constant/state blocker mismatch and
sibling-only depth sorting. Its brief completed Node check was not scope-wrapped;
that exception is recorded in `chunk-notes.md`, not retroactively relabeled.
No production code, application dependencies, provider resources or preview
artifacts were changed by the architecture pass. The portable build SDK lives
only in ignored scratch and does not alter host profiles or system packages.
