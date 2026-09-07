# Goblin Bed & Breakfast — survival colony prototype

## Game CTO custody (Levi, 2026-09-07)

Levi delegates game delivery to Astra: choose playable slices, delegate bounded
execution, review the first useful source/rendered shape, correct it, review the
final candidate, integrate serially and refresh the same authorized preview.
Routine source/art decisions within his accepted direction are Game CTO decisions;
they do not wait on another CTO acknowledgment. Escalate changed product/ownership
choices, cross-repo decisions and additional resource/production permissions.
The no-main-merge, no-backend-deploy and no-purchase limits remain unchanged.

The visible Sol/high `game-delivery` lead owns ready work, file custody, PM briefs,
early source/caller review, routine corrections and final acceptance, proof
scheduling, and serial Git/same-preview publication. Astra transfers that custody
at the reviewed 15-test typed simulation checkpoint over baseline `016b1a02`;
the uncommitted candidate is preserved in the ignored handoff recovery archive.
Astra retains game direction, difficult architecture and personal review of
changed original art, with `src/art.js` and `src/art/figures.js` reserved until
the Sedge work-pose batch is handed over. There is always one writer per coupled
seam and one Git/deploy owner. Routine delivery has no second CTO approval gate.

Use Luna for bounded execution, Terra for direction/final review, and Sol for
harder correctness. Substantial PMs report to game-delivery and have bounded
persistent delivery goals; small native workers need no extra PM. Game CTO and
delivery occupy their own `Game CTO + Delivery` tab; game PMs use `Game Lanes`.
Botanical agents stay separate. This Sol Codex lead is a temporary role-capability
fallback because the landing Shiitake one-shot runner lacks persistent PM
goal/mail continuity. Use Shiitake for supported new roles; do not build that
integration in Hive. Preserve live authors and user focus.

The accepted future product/source boundary is in the
[home, expeditions, and living world ADR](docs/decisions/home-expeditions-and-living-world.md).
Further accepted future seams are recorded in
[modular character art and technology gates](docs/decisions/modular-art-and-technology-gates.md).
The future environment/opening proof boundary is in
[environmental fields and openings](docs/decisions/environmental-fields-and-openings.md).

The active goal remains the full-viewport **two-person home**, based on playable
`016b1a02b009e798165bd4ba11653093cf4ee1c6`. First independent work: a Luna
HUD pass separates home/notice/Bramble messages from the display snapshot without
changing behavior. A separately requested adult-witch/child art study extends the
optional lineup beside the preserved original `/study`; it does not add child
simulation or a new game engine. Game-delivery owns routine actor/job/material
integration after the explicit handoff and escalates actual architecture choices.
Inspect small working results before adding more work; keep source and render
proof proportional. No new management tier or status framework is required.

Next playable order: two-person home, then stairs/upstairs bed, then generated
chunks and a local caravan returning to a persistent home while another person
works. Gear/crafting/magic variety can grow after those foundations. Five people
is the first roster target, not an engine cap: Levi also wants eventual 50–100
people and AI-managed nations. Those scales require measured active-simulation,
pathfinding, assignment and rendering budgets; they are not proved by this demo.

Performance and satisfying pacing are core, but not a license for artificial
waits. One authoritative world clock must eventually serve every visitor; the
current local speed control remains a prototype convenience until multiplayer
defines shared pause/speed policy. Mix immediate colony decisions (seconds),
visible jobs/building/crafting and optional interruptible chess (minutes), and
standing-order/offline projects (longer). Measure input/render responsiveness,
assignment/path/state work and offline scheduling separately. A two-person law
test cannot establish 50/100-person capacity.

Prototype pacing should also test roughly 30-minute arcs: preparation or
downtime, rising tension, an exciting event, then recovery. That is a player-
feedback hypothesis, not a fixed raid alarm or periodic world reset. Raids are
only one event beside visitors, storms, caravans and rituals; quieter spans make
room for building, gardening and optional interruptible chess or cards. The
first ten minutes should orient the player through Bramble, deliver one useful
crafted or built outcome, present a visitor choice and show a visible payoff for
preparation. Exact timing stays adjustable and does not change the current home.

Future multiplayer roleplay may connect rulers, knights, land barons, property,
laws, arrests and persistent relationships. Character/account identity remains
distinct from party and organization membership; offices belong to a realm,
while property title, physical control and use/build/access permission are
separate facts. Parcels may cross chunks and simulation regions. Arrest is
eventual physical reach/restraint/escort/confinement work, not remote teleport;
offline captivity, release/escape and abuse limits remain unresolved product
decisions. Do not globally tick dormant political records or implement these
systems ahead of the current home, upstairs room and caravan priorities.

Elixir Plug is a design reference for small, consistent, composable typed feature
interfaces—not a selected language, runtime or service. A future arrest request
can pass territory/warrant rules and later court policy, returning explicit
accepted or short-circuited results before existing authorized escort activity.
Feature modules retain their own state and transition authority. Do not add a
universal per-tick middleware bus or a plugin framework before concrete features
establish the seam, and do not promise arbitrary mods never require core changes.
At a future real save/network/mod-data boundary, one selected Zod schema may
validate serialized untrusted data and supply its inferred TypeScript type.
Trusted in-process jobs/actions stay real discriminated unions with exhaustive
handlers; do not add an internal parser, parallel schema or Zod dependency now.

Levi accepts dependable basic guard/retreat/shelter standing orders and offline
protection for everyone. Paid AI may later add richer stewardship, custom
instructions, situational planning, diplomacy and alerts, using the same
information, permissions, actions and world time as human control. Failure or an
exhausted budget leaves ordinary orders working. Actual pricing and practical
advantage tuning remain unresolved; no billing, model or backend enters this goal.

Future population direction reserves humans for player-controlled characters or
characters delegated to that player's AI stewardship. Autonomous nonplayer
populations should use other peoples such as goblins, ghouls and elves. Prepare
original elf artwork in a later bounded visitor study; do not add elves, new
population rules or art scope to the current two-person home deployment.

Use controller terms that do not overload the human species: **player-directed**
for live player control, **player-delegated** for an AI steward acting under that
player's authority, and **world-directed** for game-simulation control. Controller,
species, culture, faction and knowledge are separate facts. Elven cultures are
nature-oriented knowledge sources; dwarven cultures are machine-oriented knowledge
sources. Characters and societies should exchange explicit learned practices with
provenance through teaching, trade, observation or durable media rather than gain
global culture flags. Exact knowledge mechanics are future design.

Future world generation should combine layered/fractal noise with separate
elevation, moisture, climate, terrain, and water-connectivity signals. Global
seed and coordinates must make chunk borders continuous; player edits override
the deterministic base, and caves require volumetric data rather than a painted
surface. The exact recipe remains a visual/performance experiment, not a fixed
algorithm or current implementation claim.

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
separate direction. Hive consumes the pinned local package tarballs with
React 18.3.1, satisfying Caps' React 18 peers. Caps owns its Button/Checkbox
behavior, OpenTUI remains keyboard owner, and Hive owns world selection,
designation and commands. Joined game proof—not the earlier locator-only probe—
covers focus recovery and blocked disabled-button activation.

Controls need a deeper colony/tycoon UX pass: distinguish multi-person selection
(normal, modified and box selection) from click-drag work designations such as
Chop. Designations become shared jobs; direct contextual orders and queued orders
capture selected actor IDs. Keep inspectors for detail, rather than requiring
an inspector for every task. Check primary references and a small real interaction
before broad UI expansion. No desktop/window framework is implied.

Multiple floors are the next playable foundation after the active two-person
home: build stairs and an upstairs bed and actually use it. The Sweeney Todd
barber shop above a meat kitchen gives vertical openings a concrete later use.
Keep shared floor/opening geometry ready for traversal, falling objects and later
projectiles; the chair and processing chain do not gate the first upstairs room.

Presentation needs Sims-like front-wall cutaway modes, separate roofs/storeys,
and optional tree/canopy fading during construction. Terrain editing, building,
and planning marks are distinct player modes. Planning marks have no wood or
work commitment until converted to actual blueprints; hiding foliage never removes
its collision. Four camera views follow the first usable floor controls.

Later drawing tools should keep shape, selected level, target filter, preview,
commit and cancellation separate: actor boxes select people; area tools select
work targets; wall strokes select a line; room tools can select hollow rectangles
or filled floors. A saved room blueprint is a reusable relative layout (including
relative storey, definition references and orientation), not a copied world
snapshot. Stamping previews current material/blocked/support reasons and creates
new ordinary sites/jobs—never cloned delivered stock, occupants, assignments or
progress. Personal layout saving is a building convenience; exchanging a plan
through a book/trade path is a later proposal and does not grant unknown recipes.

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

## Consolidated later content and knowledge direction

Levi directs one reusable loop for future strains, techniques, recipes, spells,
grafting and crafted goods: **discovery → learning → recording, teaching or
trade → application**. A book is durable, movable know-how with a subject and
provenance; learning stays with its reader, while practice can affect execution
without making ownership of a book a global unlock. A physical book and an
actor's learned practice express the same discovery rather than competing
mushroom-only or book-only truth. What literacy, partial learning, secrecy,
attribution, permissions and institutional ownership mean remains unresolved.

Levi also directs cozy physical storage and authored craft content: chests and
shelves visibly hold stock, and bookcases visibly hold books. Storage capacity,
filters and claims constrain hauling but do not create another inventory or
duplicate material; linked storage, if later useful, shares policy rather than
ownership. A future authored definition may combine asset references, a recipe
and supported behavior/animation references, but only a concrete workstation or
practice may establish that schema. New ordinary content should be data over
exhaustive supported behavior, with admission/cross-reference validation; it is
not permission for a script engine, generic job language or current-home work.

Mushroom cultures are one concrete application. Levi directs procedurally
generated batches whose sampled appearance/effect is fixed before it is learned;
stored harvests retain their batch identity rather than changing at midnight.
Known strains can later be propagated with a sample/culture, suitable medium,
conditions and horticultural work, preserving the strain while producing new
physical batches. Astra recommends recording an authoritative harvest epoch or
seed rather than reading client wall time in deterministic ticks. Timezone,
world-versus-global sharing, regrowth, gift identification and exact cultivation
thresholds remain unresolved. None makes a real botanical/safety claim or enters
the active home candidate.

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

Levi's specific minichess direction is a 4×4 board with capture-the-king
(regicide) loss, not an assumed orthodox checkmate rule: a threatened king may
remain threatened until captured. Fair-but-imperfect opponents, opening
positions, puzzles and reward structure are future design choices. The inspected
Fate Chess reference established narrative interaction and named asymmetric
Card/Dice/Direct roles, not an observed board move or a rule set to copy.

Bramble is the first otherworldly familiar: an awkward companion/tutorial who
can address the human player, play minichess and later receive bounded delegated
activity. Levi also directs a recurring Devil and demons as distinct player-facing
otherworldly characters around chess, tarot and possible magic learning. These
relationship grants are separate from one another and from the privileged
world-storyteller grant: storyteller intent enters deterministic world authority
as events, while no speaker receives unrestricted simulation mutation. Exact
encounters, bargains, rewards and delegated familiar authority remain proposals.

Tarot may also call distinctive people into the world or party. A starting Fool
could introduce the first person; a later Lovers card could introduce a bonded
pair; rarer Arcana could create powerful recruitment opportunities. These are
prototypes, not guaranteed card effects. Ordinary visitors, relationships and
other recruitment routes must remain valid, and future family/children dynamics
need their own design rather than being implied by a card spawn. No such spawning
enters the current home candidate.

Levi's [Technonomicon cards](https://technonomicon-red.vercel.app/) and
[repository](https://github.com/technomancy-dev/technonomicon) are a further
presentation reference. Start with one original Three-authored Major Arcana
subject scene, bake it through the fixed low-resolution path, and render it in
one shared readable card layout with title/number, illustration, symbols, and
short text. Prove one card at native and enlarged presentation before authoring
a whole set; card UI uses Caps as-is where its components apply. This does not
add an Astro app or a second art engine to the game. Deployment/repository age
parity is still unverified.

## Active polish goal (Levi, 2026-09-07)

Levi requests a pacing goal and authorizes polishing the game into a full-screen
colony experience. The persistent goal is **a full-viewport, two-person home**:
recruit a visible outsider, select either person, issue direct or queued orders,
and have both share real chopping, hauling, construction and rest. Replace the
surrounding page chrome with a compact roster, build controls and contextual
character/target windows over the world. Preserve pixel proportions; resizing
must transform camera, picking, placement and labels together. Browser fullscreen
is an optional user action; the ordinary page itself fills the viewport.

The first rendered checkpoint is the new game surface, a readable Rowan label,
character inspection and an actual contextual chop command reaching earned wood.
The joined milestone adds stable actor/job identities, explicit order scope,
scarce-material claims, recruitment and Bramble's dismissible outcome-based
guidance. Check real input, keyboard focus, narrow layout, cancellation/refunds,
pause/reset/replay, built dist and hosted parity. Astra now owns product/art review and preview delivery, with bounded independent
source review and direct Levi feedback.

Levi explicitly requests periodic preview refreshes so he can play and give
feedback during this goal. Publish coherent playable checkpoints on the SAME
authorized preview, beginning with the new controls before recruitment is done.
Report the exact pushed commit, changes and suggested interactions each time;
prove the built candidate and hosted interaction. Do not wait for the entire
goal to finish or request repeated deployment permission. Initial source/art
review and later final acceptance remain scoped to what was actually reviewed.

An upstairs bedroom remains the next playable milestone. Levi also selects
Combat Extended as a research reference for later physical projectiles: crafted
arrows, aim/trajectory and collision with bodies/cover. This does not adopt its
code/assets or expand this goal into combat, multiplayer or a world framework.
After an actual arrow caller exists, test bounded projectile storage and sprite
reuse with a fresh logical shot ID and a complete reset of transient flight,
collision-sweep and trail state on every launch. Pooling reusable slots, batching
compatible drawing and culling non-visible objects are separate optimizations;
authoritative ammunition and hit settlement remain separate world facts.
The existing static-preview custody and all no-main/production/backend/purchase
limits remain in force.

The two-person controls direction is accepted under game-delivery custody, but
is not a shipped claim until the joined candidate's source and hosted proof are
accepted. Its current candidate uses React 18.3.1, Caps, derived Jotai
display facts, one small XState tool/gesture lifecycle, and the actual
`@opentui/keymap/html` 0.5.10 adapter. Bindings and displayed hints share the
keymap definition. Rowan can recruit Sedge, select either or both people, issue
personal direct/queued work, and submit shared rectangular Chop designations.
Use `npm run prove:two-person -- URL EVIDENCE_DIRECTORY` through the shared
proof runner. Astra personally accepted the changed Rowan/Sedge native pixels,
facings and sampled motion for this interim.

The interim's actual controls proof covers contextual chopping, waiting wood,
hauling/construction, retained order focus across a real status change, focus
after closing a window, zero paused HUD mutations, camera-aware picking, drag
cancellation on camera changes, held-key handling, native checkbox behavior and
narrow layout. The reviewed vendor build exposes 16,777,216 bytes in-browser.
Root's independent Fallow evidence remains visible: inherited `drawSites`
cognitive 41; `hudModel` cognitive 33 mixes guidance/notice/display derivation
and must be separated by concept before the second actor is added. Flat action
routing and declarative JSX are understood shapes, not blanket clean metrics.
The upstream wrapper is both an external `em++ --post-js` input and part of the
generated runtime; that reported clone is retained with its original bytes.

Levi's notes for the next round, recorded without expanding this interim:

- Sims-like floor up/down controls with visible active storey, distinct wall/roof
  visibility controls and later four quarter-turn views. Camera rotation changes
  projection/picking/depth and selects matching original directional bakes; it
  does not rotate the saved world or tasks. The usable floor selector accompanies
  actual upstairs construction.
- Soft, painterly wind in original animated grass clumps and separate leaf
  canopies, baked from a few Three geometry poses with staggered phases. Begin
  with a small visual study; decorative wind is not a simulation scheduler.
- Diablo-like backpack packing with rotatable item footprints. Backpack contents,
  equipped gear and visible hauling cargo are distinct locations with one owner
  per physical item. Large logs may occupy the arms without occupying backpack
  cells. Item-grid size is independent of world-tile size; weight and fit are
  separate constraints. No duplicate inventory ledger or general container engine
  is introduced into the controls interim.
- A paper-doll equipment panel: drag a helmet onto the head, gloves onto hands,
  and other gear into readable compatible slots. Backpacks and belts can provide
  distinct storage areas; removing one must preserve its contents. Equipped gear,
  packed items and arm-carried logs retain one physical owner.
- Deep authored craftable gear and material processing, beginning with simple
  leather work and later refined methods. Physical books can carry knowledge
  between people and caravans. Research relevant RimWorld mods before choosing
  the first small crafting/knowledge loop; no crafting engine is added now.
- NullTale/LutLight2D is a lighting reference for spooky magical color at night.
  Investigate authored palette ramps and a light field within the existing
  original sprite pipeline; the Unity package is not a browser dependency.

Levi correctly challenged libcolony's release memory size. Its pinned source
uses the Hungarian algorithm and hard-codes a 327,680,000-byte initial memory
with a 160,000,000-byte stack inside it. A 16 MiB source build with a 1 MiB stack
has passed the actual five-person/100-task API in local workerd. That source build
is now integrated in the browser game: seven simulation tests and the reviewed
built controls proof pass, with a measured 16,777,216-byte heap. Hosted browser
parity is the interim release gate; DO service capacity is still unproved.
Preserve the actual selected algorithm/API and record toolchain/build provenance.
Do not replace the optimizer or call local runtime success hosted memory proof.

## Current architecture direction (Levi, 2026-09-07)

The home demo at `cb80c55fe9932c2e01c7570ed855266d03cb9695` is fully accepted
for its bounded slice. Levi authorized the architecture pass preceding the polish
goal above. [ARCHITECTURE.md](ARCHITECTURE.md) records the proposed
source changes, order of work, focused evidence and unresolved hosting fit.
That pass changed planning documents, not the accepted game or preview.

Near-term foundations must accommodate roughly five controlled people, multiple
parties, caravans and chunk-loaded expanding terrain. The intended multiplayer
experience is a wife's caravan visiting her husband's persistent homeland with
the same people, possessions and learned spells. Stable identity, command scope,
resource claims and world locations now belong in the foundation plan; they are
not deferred merely because the accepted home has one pawn.

Levi also requests a readable ROWAN name label above the character, Bramble
guiding early play, and an early resource-built second floor with stairs and a
bed that a person can reach, construct and use. Current ground-only placement
and navigation do not implement that behavior. Tutorial guidance should observe
real outcomes; it is not permission for an LLM/chat integration.

Cloudflare Durable Objects are a proposed future simulation/storage host.
Terrain chunks, active simulation regions and camera visibility remain separate.
Background world progress, paid timers and AI command issuers are product
directions to plan, not authorization to deploy a backend, billing or model
services. Real Shiitake remains future storyteller input; SSE timing is not
simulation time. Preserve the actual libcolony owner and original Three-to-Pixi
art. No main merge, purchased resources or Botanical runtime edits.

## Active home demo (Levi, 2026-09-07)

Levi personally approved the study at `755f873cdc7ad499716a54212952c8253f6b566a`
and now authorizes interlocking systems toward a home demo. This section
supersedes the earlier study-only and fixed-shelter slice boundaries below.
He supplied three further witch references for female characters: expressive
crooked hats, distinct hair/garment silhouettes, readable running and casting
poses, restrained dark cloth with small bright accents. They are art direction,
not shipped assets or a new character-content milestone.

The working home slice joins player-authorized persistent orders, chopped wood
piles, carrying, delivered construction materials, modular walls and doorways,
roof tiles, a two-cell bedroll and a small rest routine. Blueprints can wait for
wood while other authorized work runs; canceling an order preserves materials.
A home must be walkable and used. Nothing constructs a room by swapping scenes.
Keep the approved original Rowan and Bramble proportions in gameplay, with
original work/carry/sleep poses and the same Three -> fixed bake -> Pixi path.

The ground diamond is 32×16 native pixels; the game canvas is 640×400,
shown at up to 2× with nearest-neighbor pixels. One demo day is eight minutes
at 1×. The 4× control advances the same 50 ms simulation steps more quickly.

The smallest composition lives in the existing game: `main.js` accepts player
commands, `clearing.js` applies them on fixed ticks, `jobs.js` derives the next
activity from actual world state, `resources.js` owns wood transfers, and
`construction.js` owns footprint/room/recipe rules. libcolony receives eligible
pairs for the first ready player order; waiting orders remain visible. These
are concrete colony responsibilities, not a generic job engine or a replacement
optimizer. Logical cells have an explicit level; this demo only navigates level
zero. Multi-floor navigation, multiplayer, chunk streaming and a full ECS are
future work, not claimed implemented because the data is serializable.

The accepted study stays recoverable at `/study` and the old games stay in Git.
The same branch and static preview custody continues. CTO confirmed the first
review checkpoint is actual queued build -> waiting wood -> haul -> construction
with readable source, intended-scale pixels and motion. CTO personally accepted
the first queued-work stills and the subsequent complete-home/cutaway stills.
That art verdict does not itself claim motion or final hosted acceptance.
Final proof covers a resource-built home entered and used, resumed work,
pause/reset, deterministic replay and material conservation; artifact integrity
is recorded separately from hosted gameplay. Automated proof uses the existing
host scope runner with its 10-minute deadline. No live Shiitake/SSE integration,
Botanical source edits, provider changes or main merge.

## Accepted art study (2026-09-07)

The clearing/chop/wood/shelter milestone was accepted at
`6733700a6489930ed12cd70ae36667bf48e654e2`. Levi subsequently authorized
improvements and supplied more direction for proportions: Pilgrimage's human
figures, articulated knight armor, a robed wizard, wiry long-eared goblins, and
cream-and-dark cats. Personally author an original proportion study with idle
and walk poses, different facings, and a doorway for scale. Present actual baked
pixels at native/game/detail sizes before carrying this change into the game.
The study is available at `/study.html`; the accepted game remains at `/`.
Run `npm run dev` and open that path. Browser verification is
`npm run prove:study -- URL EVIDENCE_DIRECTORY` (with the local Chromium
environment configured). On this host, launch automated proofs through the
CTO's existing `run-proof.sh` scope runner; leave human preview servers alone.

The current study uses 48×64 padded sprite frames. Measured Rowan silhouettes
span 38–41 native pixels across poses/facings. Its proposed ground diamond is
32×16 pixels; one vertical world unit projects to about 19.6 pixels. This is a
visual study. At its acceptance the earlier clearing retained a larger camera;
the home demo now adopts this scale. Vertical collision is not implemented. Native view preserves 1:1 pixels on
small screens through horizontal scrolling; fitted view adapts to the viewport.

The uploaded `/home/levi/grass-tile.aseprite` was inspected and its supplied hash
verified. Its 64×64 document contains smaller padded block drawings. Levi
explicitly says these are general art/sizing ideas, not a required tile size,
canvas size or replacement asset set. The five original references and later
close-ups remain inspiration; all shipped study figures are original geometry.
Do not force a character's silhouette to fill its ground-cell footprint.

The broader direction is a witchy, darkly comic colony world: the stranded human
innkeeper may eventually prey on goblin guests and feed them to other guests.
Levi wants deeper resource/work/sleep loops, arbitrary walls and workstations,
schedules, vertical navigation and eventual multiplayer/world stitching. These
are future considerations, not claims about this art study or authorization to
invent a live storyteller backend. Keep the fixed-step game and selected
libcolony responsibility intact. No simulation expansion is part of this study.

Pilgrimage was inspected at `eabb8d18e771dec490ab037f1fdae04a62238613` as
reference. Its finite maps, shared art scale and in-context asset review are
useful examples; its source is not a completed chunk-streaming, multiplayer or
multi-floor colony engine. Read-only research and visual evidence are ignored
under `.botanical/`.

## Accepted clearing milestone

Levi authorized this next playable milestone on 2026-09-07 after accepting the
inn MVP at `403f886c58429fec6711aa5747006a658d72da78`. That inn remains recoverable
in Git. The current game moves toward a RimWorld-inspired survival colony:
a vulnerable outsider, initially human, stranded in a hostile goblin world.
Keeping goblins happy may eventually be a matter of staying alive. The art can
remain charming while the situation is darkly comic and threatening.

## This playable slice

Start in a small outdoor clearing with one human outsider, zero wood and no
completed inn or shelter. Select the pawn, select a tree and order chopping.
The pawn travels and works autonomously. Chopping visibly changes the tree and
earns wood. Spend that wood to place and build a simple shelter: a readable
placement preview and footprint, real construction work and progress, then a
tangible finished structure. One tree, resource and building type are enough.
A first goblin demand conveys the premise; it does not imply a combat or death
engine. Resource-funded construction must not be a button that swaps scenes.

Control remains select + assign work, like a Sim or RimWorld pawn. No WASD or
joystick avatar. Explicit commands constrain task eligibility; the player must
be able to understand the selected target, current action and its result.
Pause/reset and two repeatable chop/build iterations belong in the proof.
No full needs/death simulation, economy, world generator, generalized task or
construction framework, broader content expansion, or second game engine is
required. WorldBox and Dwarf Fortress inform the ambition, not this scope.

## Shiitake is the future storyteller

Shiitake's eventual role is analogous to RimWorld's storyteller: it observes
job state and changes arriving through SSE and prompts world events. Storyteller
intent enters the game as events. The deterministic simulation owns movement,
resources and outcomes. **SSE delivery timing is not the simulation clock.**

For this slice the input remains explicitly simulated, using the existing
seeded feed and recorded-command approach. Display its exact fake status
compactly. Do not invent an SSE schema, backend, LLM scheduler or live platform
integration. No Botanical runtime owners are in scope. This records future
integration direction, not a claim that it is implemented.

## Art and simulation ownership

Personally author original Three.js geometry and poses, bake at a fixed low
resolution, then render through Pixi. Inspect actual pixels and motion. The five
images in ignored `.botanical/references/` have been viewed and remain inspiration
only; never bundle, trace or crop them into game assets. Keep the warm wood,
expressive silhouettes and tactile isometric shapes, while making the player
pawn visibly human. No asset editor, engine framework or bake service is needed.

Levi explicitly selected [mafik/libcolony](https://github.com/mafik/libcolony).
The unmodified v1.0.0 browser JS/WASM is pinned under `public/vendor/libcolony/`
with provenance and hashes. Its real `Module.compute_cost` and
`Module.optimize(assignments)` interfaces have been proved in the browser and
Node against those bytes. It owns assignment, not gameplay state, navigation,
animation or storyteller events. Offer only the explicit player pawn/task pair;
never substitute a local optimizer or speculative scheduling framework.

Reuse the accepted fixed-step/feed/render separation, deterministic navigation
and seeded behavior. Renderer callbacks never own work or resources. As the
current art, HUD and step responsibilities change, clarify them by concept;
do not pile branches into the old inn functions or split merely for metrics.
Apply the deletion test to the whole candidate. A bounded native Sol review of
meaningful final logic complements personal Astra authorship and CTO art review.

## Source and custody

- Owned clone: `/home/levi/src/hive`.
- Only branch: `feat/goblin-bed-and-breakfast-mvp`.
- Accepted current game: `6733700a6489930ed12cd70ae36667bf48e654e2`.
  The actual caller is `index.html` → `src/main.js`, with `art.js` baking,
  `clearing.js` state/work, `movement.js`, `construction.js`, `feed.js`,
  `ticker.js` and `colony.js`. The inn remains recoverable at `403f886c`.
  The art study has its own small view caller, reusing the existing bake and
  geometry helpers; it does not add another game simulation.
- Original public demo: `8caba6cf0303437e7b6a2678d120f6587d812ec7`.
- Retained `origin/worldbox-mvp`: `14cfa809480dec9b7f4586a9993354925345fa38`.
  Its ticker/sim/feed/tables/date/world/glade and tests supplied useful timing,
  feed separation and seeded invariants. Neither historical Hive branch had
  integrated libcolony. Inspect exact objects with `git show`, never reset or
  switch this checkout. Historical calendar/prosperity/world growth and
  contradictory visual rules do not carry into this slice.
- Historical libcolony selection is recorded in the opening of read-only
  `Botanical/plans/briefs/livelyledger-quorum-interview.md`; its URL is in
  `plans/briefs/king-livedledger.md` under the retained historical tree.
- Own ordinary source/docs/tests/build, local dependencies, commits, push of
  exactly this feature branch and refresh of the SAME native static preview:
  `https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev`.
  Worker `fungi-goblin-bnb`, preview `goblin-mvp`, `workers_dev: false`.
  Use the authorized private CLI environment only inside the deploy subprocess;
  never inspect/copy credential values or commit a host credential path.
- No main merge, production cutover, purchased resources, model services,
  Botanical-next source/worktree edits, Herdr layout changes or infrastructure
  framework. Keep native Wrangler 4.127.1 and the minimal static-assets config.
- Run locally with `npm run dev` (loopback port 5187). Build with `npm run build`;
  authenticated native refresh is `npm run preview -- --name goblin-mvp`.
  Browser proof, recordings and other evidence stay in ignored `.botanical/`.

## Review and finish

First send CTO a real rendered outsider/clearing and one working chop through
actual selection and task input, including the changed tree and earned wood.
Send source inventory, intended-scale pixels, short motion recording and local
URL through Herdr to the verified `cto` identity. Sending is not approval:
**CTO art/direction acceptance gates construction expansion.** This first
outsider/clearing/chop checkpoint was explicitly accepted on 2026-09-07 after
CTO personally inspected its three images, actual browser proof and simulation
caller. Construction expansion is authorized. Continue useful
independent verification while waiting; no extra specification or committee.

Then prove wood-funded placement/construction twice, pause/reset, deterministic
replay and the real libcolony caller. Run focused meaningful tests, format our
source while preserving vendor bytes, build and inspect the built dist in the
browser. Push the exact feature commit, refresh the same authorized preview,
verify hosted HTML/JS/WASM integrity separately from hosted interaction, and
send CTO final intended-scale images, uncut motion, proof, source inventory,
commit and URL. Root owns final visual/product acceptance. Report remaining
scope honestly; do not claim a survival engine or live storyteller exists.
