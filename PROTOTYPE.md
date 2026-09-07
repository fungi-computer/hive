# Goblin Bed & Breakfast — survival colony prototype

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
pause/reset/replay, built dist and hosted parity. Root reviews product/art;
Astra owns source/art and preview delivery with a bounded source review.

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
The existing static-preview custody and all no-main/production/backend/purchase
limits remain in force.

Levi correctly challenged libcolony's release memory size. Its pinned source
uses the Hungarian algorithm and hard-codes a 327,680,000-byte initial memory
with a 160,000,000-byte stack inside it. A 16 MiB source build with a 1 MiB stack
has passed the actual five-person/100-task API in local workerd; browser/current
game integration and hosted deployment of that build have not yet been proved.
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
