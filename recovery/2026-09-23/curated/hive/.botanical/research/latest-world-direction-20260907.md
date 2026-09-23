# Latest Levi world-direction batch — research/handoff receipt

2026-09-07. Future direction, except the separately completed original props
study. Game-delivery owns incorporation into tracked PROTOTYPE/ARCHITECTURE and
existing issues. This note preserves the discussion while the two-person
release and full-home proof advance. It creates no new implementation goal.

- **Content definitions:** assets + a workstation/tile definition + recipe +
  supported behavior/animation references should add ordinary content. Engine
  behavior unions must be exhaustive; a new recipe is not a new engine behavior.
  Authored configs need schema/cross-reference validation at admission. Retained
  `14cfa809480dec9b7f4586a9993354925345fa38:src/tables.js` has the explicit
  one-row-per-job/crop principle. See `hive-job-config.md` for actual limits.
- **Cozy storage:** chests, shelves with visible stocked contents, and bookshelves
  with visible individual books. Capacity, access and claims compose with hauling;
  linked filters share policy rather than ownership. `rimworld-storage.md`
  distinguishes Ludeon primary evidence from community mechanics details.
- **Flexible crafting:** Borderlands-like authored parts/material combinations
  and Isaac-like interacting effects. Spells combine ingredients/effects with
  explicit compatible synergies; resolved item/spell instances preserve their
  authored version/choices. Stacking order, repeated triggers and effect budgets
  need explicit rules. These are future hypotheses, not shipped recipes or a
  general script engine. Link existing crafting/knowledge/card issues.
- **Original props:** bubbling cauldrons, colored bottles, mugs/kegs, spills and
  hanging belt axes/flasks. Astra's `.botanical/props-study/README.md` records
  personally reviewed source/pixels and actual proof. The liquids are visual
  studies; later vessel quantities and conserved transfers need gameplay proof.
- **Occult minichess:** user screenshot establishes a 4x4 board; user reports that
  a threatened king may stay threatened and must actually be captured to lose.
  Capture-the-king/regicide rules, not assumed orthodox checkmate. Configurable
  fair but imperfect opponents and tested opening positions; casual repeatable
  play plus optional tactical puzzles. The current NullTale page is Fate Chess
  and describes Card/Dice/Direct control roles. Our embedded browser probe reached
  narrative interaction only, not a board move. See `fate-chess-play/README.md`.
- **Familiar:** Bramble is the first ethereal, otherworldly companion; more
  familiar choices/possibly several later. Awkward relationship, sometimes talks
  directly to the human player, teaches the game, plays minichess, and may later
  oversee delegated activity. Goblins are other chess opponents. Keep character
  relationship, knowledge and delegated control separate. Recommendation:
  companionship/tutorial/casual chess need not require paid automation.
- **Many faces:** Levi's metaphor is Vishnu's many faces: Shiitake powers personal
  companions and colony controllers, other factions and regional/global event
  actors. Each has distinct context, memory, loyalties and grants. A privileged
  world storyteller enters intentions as events; deterministic game authority
  owns movement, resources and outcomes. This is not an assumption of one
  omniscient shared conversation or a request for literal religious content.
- **Toolable world:** the future game should expose bounded, intelligible,
  revisioned world observations and typed commands to Shiitake's execute tool;
  conceptually MCP over DO-hosted game authority. Save state and AI observations
  are separate projections. Query relevant regions/actors/jobs, page larger
  results, inspect changes, submit idempotent commands and read long-job outcomes.
  Do not dump the whole growing world or let model code edit game state. Actual
  current host capabilities/limits are recorded in `shiitake-game-tools.md`.
- **Autonomous accounts/factions:** AI accounts can build nations, trade,
  negotiate, ally, compete and remember grudges. Persistent game identity and
  history outlive a controller/model switch; common model provider does not make
  two factions the same actor. Player/familiar grants and world-event authority
  remain distinct. Ordinary jobs continue between bounded AI planning decisions.
- **Essay context:** Levi supplied a long essay on self-sovereign agent societies,
  economic incentives, persistent identity and institutions (no author/link
  supplied). Its strongest game connection is persistent actors whose incentives
  support trading/cooperation as well as predation. Predictions of inevitable
  real-world sovereignty are forecasts, not facts established by the incident.
  Source research found OpenAI/Hugging Face's July2026 intrusion accounts;
  separate evaluation agents' persistent collaboration does not establish
  consciousness or personal recollection by this game session.

## Further direct feedback: identity, mushrooms and hair

- **Reusable characters:** Levi objects to hard-coded Rowan/Sedge/Bramble logic.
  Starting characters may be authored scenario instances, while behavior, UI,
  companionship and recruitment must resolve IDs, relationships and figure
  definitions. Use the actual Cairn library for identity/candidate names; do not
  make a display name an entity key. Cairn `words()` uses cryptographic randomness
  and a fungal/ranch vocabulary; it is not a seeded human-name generator. Record
  generated spawn values so replay does not regenerate different identities.
  The bounded source audit is `actor-content-cairn.md` when complete.
- **Mushrooms:** central cozy-dark content. Levi proposes Isaac-pill-like hidden
  effects identified by eating, with the appearance/effect mapping possibly
  changing each real-world day. The daily period is a design candidate, not an
  implemented rule. Astra recommends a shared world harvest epoch: fresh growth
  draws from that day's mapping, while harvested mushrooms keep their original
  effect and epoch. Stored food should not secretly become something else at
  midnight. A journal records observations and dates; books, conversation and
  trade can later transmit discoveries through the existing knowledge direction.
  Use a recorded authoritative epoch/seed, never client wall-clock calls inside
  deterministic ticks. Decide timezone, world-vs-global sharing, cultivation and
  whether identification travels with gifts before implementation. First effects
  should encourage curious experimentation and readable consequences. No real
  mushroom safety claim or real botanical identification system is implied.
  **Levi's subsequent clarification:** stored mushrooms retain their effect;
  mushrooms should be procedurally generated and grow in batches. Use a batch
  with stable appearance/effect, learned by sampling and then applied to the
  remaining batch. Effects are fixed before identification, not granted by
  knowing them. New daily batches may vary; existing gathered mushrooms retain
  their identity. Astra recommends existing patches also keep their batch while
  they remain, with newly generated growth carrying a new batch identity. Exact
  regrowth/cultivation rules remain a design question, not a shipped system.
  **Cultivation subsequently requested by Levi:** known mushrooms plus sufficient
  plant-growing skill should let the player propagate them in a suitable medium.
  Preserve the discovered strain/effect through cultivation; distinguish the
  strain identity from each physical harvest batch. Astra proposes sample/culture
  + growing bed/substrate + conditions + horticultural work, producing more of
  that strain. New wild daily strains can vary while established greenhouse
  cultures remain dependable. This connects naturally to trading live cultures,
  books of cultivation knowledge and the existing greenhouse/grafting direction.
  Exact skill thresholds, recipes, yields and conditions remain authored design
  work. No cultivation implementation is added to the current input/art slice.
- **Expressive witch hair:** Levi wants much larger hair, especially Sedge, with
  movement like the supplied witch references. Astra is personally iterating the
  original Three geometry and motion in `.botanical/animation-study/`, alongside
  kneeling one-arm construction and subtle human/cat idle motion. Review the
  silhouette, hands/tools and all facings at native and game scale; original art
  only. This is the current art pass, not a new character behavior engine.

## Shared discovery and knowledge loop — explicit product direction

Levi confirms that mushroom cultivation is an instance of a game-wide repeated
pattern: **discovery -> learning -> spreading that discovery**. Someone learns a
specific mushroom technique and records it in a book; the book should carry the
practical value of that discovery. Arrow making and other crafts follow the same
pattern. This is a central interlocking game direction, not a mushroom exception.

Astra proposes discovery -> understanding -> recording/teaching/trading ->
application as the recurring loop for strains, techniques, recipes, spells and
grafting. Books contain specific know-how, with its subject/strain/recipe and
authorship/provenance, rather than only a generic skill-stat bonus. A reader can
learn the technique and attempt it; practiced skill affects execution speed,
reliability and quality. Exact literacy/practice/teaching rules remain design
choices, not an imposed prerequisite ladder. Knowledge can survive or travel
without its discoverer, making libraries, tutors and caravans useful. A physical
book and an actor's learned knowledge can express the same discovered content;
do not create a separate mushroom-only discovery engine or a book-only recipe
truth. World knowledge must still respect which actor/faction has learned it;
knowing the ID of a discovery is not permission to see every faction's secrets.

Record with existing crafting/storage/knowledge/caravan owners (#8/#17 and their
related issues); no generalized research framework is added to the current home
input fixes. The future content authoring seam should make another ordinary
discoverable recipe content data over supported actions, not another engine fork.

## Drawing and repeat-build UX — current correction and near-term foundation

Levi reports that placing a wall stroke exits the wall tool, requiring menu and
Wall selection again for every side of a room. Expected: choose Wall once, draw
several strokes, keep its orientation/hover, and deliberately exit with Done,
Escape or right-click. Completing a gesture must not mean leaving the tool.
The current caller is `main.js` pointer-up -> `finish-placement` -> HUD machine
`CANCEL`; delivery owns correcting this in the active ordering slice.

Levi also requests a deeper shared drawing/selection UI module soon. Account for
actor selection boxes, area work designations, wall lines, hollow room rectangles
and filled floor areas with consistent live previews, selected-level picking,
target filtering, cancellation and repeat behavior. Distinguish tool lifetime
from individual gestures and geometric shapes from the action applied to their
targets. Existing XState owns phases, Jotai owns selection/display preferences,
camera owns coordinate transforms, and the simulation validates actual commands.
`drawing-tools-shape.md` will record the bounded current-source audit; no new UI
state system or shape framework is an assumed prerequisite for fixing repeat
placement. Room rectangles/terrain brushes are planned capabilities, not claimed
present in the current wall-line implementation.

## Saved room blueprints — Prison Architect reference

Levi explicitly wants Prison Architect-style reusable room blueprints: design or
copy a room once, then place that layout repeatedly. This belongs in the deeper
build-tools direction alongside room outlines and persistent stamping. Primary
sources checked: [Introversion's Quick Build change log](https://www.introversion.co.uk/prisonarchitect/builds)
describes template room stamping, rotation, worker construction and Clone in the
Quick Build menu; [Paradox's Free for Life page](https://www.paradoxinteractive.com/games/prison-architect/add-ons/prison-architect-free-for-life)
describes saving/reusing quick builds and dimensions/cost feedback while drawing.
These establish inspiration, not a claim to have played the current version.

Proposed Hive interaction: select a built or planned room/area -> save a named
layout with a thumbnail -> choose it -> preview the whole footprint and material
requirements -> rotate -> place repeated copies until explicit exit. Preview
blocked cells and unsupported floors; stamping creates ordinary editable work
plans. Workers still obtain materials, haul and build. Planning/sketching stays
distinct from actually authorizing those jobs, following the existing planning
mode direction. Do not silently demolish obstacles just because Prison Architect
can clear areas for quick builds.

The template contains relative positions (including relative storey), buildable
definition references and orientation. It is design content, not a duplicated
world snapshot. New placements get new site/job identities and preserve the
existing resource/claim owner; no cloned delivered materials, stock, occupants,
assignments or construction progress. Multi-cell footprint rotation and
roof-over-wall entries need actual source-aware handling, not screenshot copying.
First proof may cover one storey; eventual multi-level copies need real support,
stairs and active-level picking, and should not delay the first upstairs room.
Use current definition costs/requirements at placement, with missing content or
unknown techniques visibly explained rather than bypassed by an old template.

An optional later connection to the discovery/learning direction: architectural
plans can be recorded in books and exchanged. Basic personal layout saving is a
building convenience; exchanging a plan does not automatically grant every
advanced recipe it references. Exact book/trading rules remain proposals.

`room-blueprint-seam.md` records the bounded caller/footprint review when ready.
Capture this in existing drawing/Caps #12 and construction/upstairs planning;
blueprint sharing can link knowledge #17. This is planned, not part of the
current ordering hotfix or an authorization to create a second building engine.

## Colony work, paused orders and drafting — current product correction

Levi reports that ordinary chopping still requires too much person selection and
that orders cannot be issued while paused. These are current interaction defects,
not future-world wishes. The default is to designate work in the world, then let
eligible colony members take it. Select Chop, drag over trees, see the exact
eligible targets and commit once; the tool remains active for another stroke.
No selected person is required, and having someone selected must not silently
turn the same designation into that person's exclusive task.

Add a colony Work panel with a row per member and real current automatic-work
categories: Chop, Haul and Build. Gardening and other categories arrive with
their actual activities. These are scheduling preferences, not invented skill
or incapacity rules. Turning a category off prevents new automatic assignments;
let the current activity and an already committed haul finish. Deliberate,
clearly labeled personal priority orders may override these preferences.
Missing eligible workers must produce a readable waiting reason.

Pausing freezes simulation time, travel, work, needs, feed and ambient simulation.
It does not disable command admission: designations, direct orders, work settings,
recruitment, cancellation, drafting and movement instructions remain usable.
Explicit cancellation/interruption may release claims or set down carried wood;
that is a commanded transition, not a covert simulation tick. Several commands
at one paused tick must apply in order and replay deterministically. The existing
command owner, fixed-step owner and real libcolony assignment remain authoritative.

Levi explicitly corrected his terminology to **drafting**, distinct from
recruiting someone into the colony. Drafted members stop ordinary work and hold
position; select them and give a reachable Go here destination. They travel only
after time resumes, then hold until another order or Undraft. Undraft returns
them to eligible colony work. Drafting must preserve queued colony work/progress
and account for released claims/carried materials. It must also exclude routine
sleep and ordinary personal queues from silently pulling someone off their post.
This establishes direct control without requiring weapons, attacks or a combat
engine in this correction. An undrafted member may still receive a deliberate
Prioritize this task override; ordinary designation and direct control are
different intentions rather than different meanings of the same click.

RimWorld, Prison Architect and **Dwarf Fortress** are explicit interaction
references. Study designations, labor/work permissions, workshops, squads and
multi-floor navigation as appropriate; their controls are not assumed identical.
Reuse the existing XState gesture owner, Jotai UI state, camera transforms and
simulation commands. A tool's shape resolves world targets once for both preview
and submission. When a tool is armed, right-click exits it and must not also issue
a drafted move or personal order. Group selection remains a supported control;
future formations, priorities/schedules and multi-floor movement are not claimed
implemented by a first ground-level Draft/Go here action.

The source audit is `paused-colony-work-core.md`; root rejected its initial
planning-only paused whitelist. The latest explicit user intent governs: pause
stops time, not orders. Reference findings live in `colony-controls-references.md`
when complete. Delivery owns the coupled source/UI/replay implementation and
existing #1/#12 docs/issues. Root retains product decisions and changed-art review.

### Right-click and selection reference pass — current controls contract

**Levi accepted this interaction direction on 2026-09-07**, confirming that it
captures the key controls he remembers from RimWorld and Prison Architect.
This is product-direction approval for the current controls correction, not
acceptance of unimplemented or unproved behavior. Delivery may implement,
review and publish coherent parts under its existing custody without another
direction gate.

Levi explicitly requested actual Prison Architect/RimWorld controls and mod
research. Astra read the current Hive main/view/HUD/keymap callers, Introversion's
creator release notes, Achtung's author source and Allow Tool's author README.
The games/mods were not run. Introversion's historical alpha notes explicitly
record construction while paused, right-click and right-drag foundation
cancellation, and Tab cycling between overlapping objects:
https://www.introversion.co.uk/prisonarchitect/builds-alpha.html
Its later floor-signage tool uses left-drag to paint and right-drag to erase:
https://www.introversion.co.uk/prisonarchitect/builds
These are examples of mode-specific controls, not evidence of a single universal
Prison Architect right-click menu or every current guard-control binding.

Achtung's author controller explicitly branches on selected actors' draft state,
the clicked target, movement validity and configured menu mode:
https://github.com/pardeike/Achtung2/blob/master/Source/Controller.cs
Allow Tool explicitly provides select-similar, urgent hauling and bulk tools:
https://github.com/UnlimitedHugs/RimworldAllowTool
`rimworld-right-click-references.md` contains the bounded source review. Mod
behavior is not asserted to be vanilla RimWorld behavior; copying C# code,
formations, configurable menu modes or persistent forced-work policy is not
required. Draft/work semantics remain the explicit product decisions above.

Use this predictable hierarchy in Hive, with one action consuming a gesture:

| Context | Intended interaction |
| --- | --- |
| Ordinary left click / drag | Inspect or select; a box selects colony members. Shift adds/removes from selection. Selection alone issues no work. |
| No person selected; object targeted | Object actions include colony designations such as Mark for chopping; no person-selection prerequisite. |
| Undrafted people selected; work target right-clicked | Compact contextual menu with explicit Prioritize and Queue actions, retaining selection. Do not silently submit Chop just because the target is a tree. |
| All selected people drafted; clear reachable ground right-clicked | Issue Go here, retain selection, show the destination, and hold on arrival. |
| Mixed drafted/undrafted selection or ambiguous occupied target | Show the applicable actions and their actor scope; no automatic draft/undraft, membership change or silent command to an unexpected subset. |
| Build/Chop tool active | Left-drag previews the tool's applicable cells/targets and release commits once. Right-click cancels/exits the tool and is consumed; it never also moves a drafted person or orders work. |
| Context menu open | Dismiss it without losing the actor selection or dispatching an action to the map underneath. |

Keep replacement versus queued work visible in Now/Next and keep hotkey labels
consistent with the actual action. Shift applies to selection when selecting
and to queueing when choosing a work order. Do not claim waypoint queues until
they are actually modeled and visible. Show useful disabled reasons from the
authoritative command rules. The later Cancel designation/Deconstruct tools can
reuse shape targeting; a plain cancel gesture must never demolish finished work.
Keyboard and touch need explicit action access through the same controls, not a
right-click-only feature. Current narrow-screen proof remains layout evidence,
not a full touch-gameplay claim.

Closest current mismatch: `main.js` tree secondary handler immediately calls
`request(chop)` whenever selectedIds is nonempty, bypassing contextual choice;
the no-selection Target HUD disables both actions. Pixi tree rightclick and the
DOM canvas contextmenu also both participate in the same physical gesture.
The next source shape should resolve intent once before dispatch using existing
XState/selection/command owners, with preview and menu consuming actual target
facts. No new UI state engine or shadow game state is justified.

Behavioral proof should exercise the actual mouse: right-click an oak with no
selection; select an undrafted person and open/choose its menu without premature
mutation; verify queued versus replacement work; draft and right-click ground;
cancel an armed tool over both a target and ground with zero unintended orders;
preserve selection after each deliberate action. Repeat the command cases paused
with tick/travel/work/feed unchanged, then resume through the real assignment
and movement paths. Publish coherent parts through delivery's existing sequence.

## The Devil, demons and the otherworldly conversation

Levi explicitly requests original Devil and demon characters soon. The Devil is
a major recurring player in the world and someone the human player will play
chess against. Like the familiar, he can speak directly to the player, beyond
ordinary pawn-to-pawn conversation. Chess and tarot often inhabit this
otherworldly layer and may become a route to gaining or learning in-world magic.
This extends the existing familiar/chess/card/magic direction; it does not
authorize live AI or implement another controller/world authority. Dialogue
presentation does not itself grant a speaker unrestricted simulation commands.
Exact encounters, rewards and bargains remain product design rather than fixed
card mechanics. Record with #13 and the character art work.

Astra personally authored an isolated original Three-to-bake-to-Pixi first study
in `.botanical/devil-study`: a courtly Devil, a small winged chess-page imp and a
ram-horned porter, with eight-phase idle/walk/gesture poses and four facings.
These costume/personality choices are proposals, not additional user-specified
lore. The little 4x4 table and direct-player line illustrate the connection;
there is no playable chess or conversation AI in the study. Source and proof
remain separate from the current game and release ownership.

## Painterly foliage status and personal art custody

Levi asks where the grass/leaf billboards reached and asks Astra to take the art
personally. Status as inspected: recorded direction, **no animated foliage
study or shipped wind yet**. `src/art/clearing.js` still bakes static ground and
trees. Astra owns the next bounded grass/canopy motion art study after the Devil
first shape: anchored grass clumps, moving leaf masses over still trunks,
staggered coherent wind and native/game-scale silhouette/overhang review. Art
must demonstrate the intended soft painterly motion before a general foliage
system or world-wide rollout. Decoration need not create a simulation entity
per blade or run plant-growth work on animation frames. Record in existing #11.

## ECS and performant world queries — decision review

Levi asks whether a maintained JavaScript ECS would help and whether Astra could
design one. Root personally reviewed actual Hive callers, current bitECS and
Miniplex documentation, and Sol's `ecs-query-decision.md`. Recommendation: keep
the current controls work moving; measure the real assignment/path/topology and
render workloads before adopting component-query machinery. No ECS dependency,
world rewrite or claimed speedup has been selected/implemented. Fixed steps, explicit commands,
resource/claim authority and libcolony remain the owners. Distinguish component
membership queries from spatial occupancy, pathfinding, room connectivity,
assignment cost, rendering batches and chunk/offline simulation. A library can
own query bookkeeping without owning all those systems. Source-observed repeated
work is a reason to profile a representative workload, not proof of a bottleneck
or permission to delay the current accepted controls for a general engine.
The first comparison should include updates/removals, claim/material transitions
and replay, not just iterating immutable position components. Useful local
indexes can answer identity/stock queries; later chunk/cell indexes answer where
things are. Repeated room connectivity and route searches remain domain work.
Do not convert every terrain tile, grass blade or fluid cell into a separate
object merely to call the world ECS. Miniplex is a lower-migration object-query
candidate; bitECS supports both object and packed component arrays and is a
candidate for measured numeric workloads. Those are candidates, not adopted
dependencies or tested Hive speed rankings. Cached claim totals must never
authorize stock after another assignment has already reserved it. Keep this
with the existing scale/performance #6 and world/chunk #4 owners.

Current outcome remains the two-person home, repeat-tool ordering published `f6d1538`;
finish the accepted animation snapshot safely, then prioritize this coherent
colony-controls correction ahead of new deconstruction. Actor/content correction,
deconstruction and upstairs remain queued. Upstairs
and then chunk/caravan work retain their established order. The new world ideas
were delivered to game-delivery for existing issue/doc disposition, not inserted
into the current simulation or deployed as a backend.

## Current direct polish corrections

- Levi confirms larger expressive hair is much improved but wants a modest
  reduction. Astra's .botanical/hair-trim preserves the accepted look with a
  smaller lock silhouette and softer sway.
- Held tools must be gripped by handles. Shared workGear put axe/mallet heads
  at the palm; the same isolated art candidate corrects grip-space geometry for
  both humans. Source/native/game-scale evidence is separate from delivery.
- Caps/Stipe adoption must use actual house styling as-is: maintained preset,
  typography, surfaces and components, deleting old green/gold/serif HUD paint.
  Keep game geometry/pointer/layout and canvas art. The source audit is
  caps-house-style-audit.md; compiled Caps CSS already includes Stipe, while
  this host cannot directly execute Stipe's raw Tailwind/Daisy CSS input.
  Delivery owns the joined correction after its controls checkpoint.

## Adventure, home and player livelihoods — direct Levi direction

Levi adds original Diablo/Diablo II, RuneScape and Darkest Dungeon as reference
games, alongside the separately assigned original RollerCoaster Tycoon study.
Study where each fits rather than importing every system.

He explicitly wants Diablo-like dives into procedurally generated goblin caves/
dungeons whose entrances appear throughout the world, providing exploration and
interesting destinations during colony downtime. Return with resources and use
them to build and craft at home. He connects adventurers with player shops and
gear crafters as RP/economic roles (voice transcript 'deer' means gear here).
He explicitly agrees the party + dungeon + settlement parallels with Darkest
Dungeon are now clear. This is future direction, not a request to add combat/
dungeon generation to the current paused/shared/Work/Draft controls slice.

Astra recommendation: same persistent people/items/knowledge on expeditions and
at home; no duplicated dungeon actors or detached reward inventory. Prepare →
expedition → choose whether to push on or return → bring materials/knowledge
home → build/craft/trade/recover. Routine colony work continues under its normal
permissions while the player's selected expedition is away. Destination storage,
clock/authority transfer and remaining-party work need concrete proof at that
future slice, using the existing world/party ownership direction.

Keep crafters relevant: discoveries and materials should support making valuable
gear and supplies, with loot balance decided deliberately. Retreat/recovery,
loss severity, entry discovery and persistence, party splitting, shared vs
instanced dungeons, resource renewal, customer demand and sale contracts remain
open design choices. Cozy builders/shopkeepers should have a worthwhile role
without compulsory dungeon runs; that is Astra's recommendation, not a shipped
policy. No loot, combat, economy or procedural dungeon system shipped here.

Research is split: visible Terra RCT study through delivery; native Terra
Diablo design lessons and native Luna RuneScape source/progression note under
Astra; Astra personally reads Darkest Dungeon developer accounts for attachment,
expedition tension and home recovery. These outputs remain independent of the
current implementation queue and do not create new PM layers.

## Faction reputation / goodwill — direct Levi direction

Levi wants faction liking/disliking to respond to actions: attack goblins and
they should hate you; run a good goblin bed-and-breakfast and they should like
you. Tie this to the existing land/factions/RP direction, plus the new expedition
and shop economy. No implementation enters the current controls release.

Astra recommends party/settlement-to-faction relations, distinct from personal
relationships, species, legal land permission, title and physical control.
Separate goblin clans can respond differently to the same player. Actual service,
trade, aid, theft, raids and harm cause reputation changes through world events;
an AI speaker may react or propose a response but cannot write goodwill freely.
Reputation can influence visitors, trading terms, access, quests, diplomatic
responses and hostility. Severe grievances should not instantly vanish through
repeated cheap hospitality; scoring/decay, reconciliation, what becomes known,
clan alliances and response timing remain open policy choices. Never equate an
individual's species with a uniform faction allegiance or approval.
