# Goblin Bed & Breakfast — survival colony prototype

## Current art study (2026-09-07)

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
visual study, not a change to the accepted clearing's larger camera scale or
an implementation of vertical collision. Native view preserves 1:1 pixels on
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
