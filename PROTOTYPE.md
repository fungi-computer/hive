# Goblin Bed & Breakfast — playable prototype

Levi authorized this MVP on 2026-09-06 during the Hive discussion. It is an
original isometric game experiment on a local feature branch. WorldBox,
RimWorld and Dwarf Fortress inform the larger ambition; this checkpoint is one
small inn and a complete interaction loop. No production migration is implied.

## What Levi wants to try

One innkeeper pawn the player selects and gives tasks to, in the manner of a Sim
or RimWorld pawn. Movement and task execution are automatic after the order.
This supersedes the initial direct-character-control interpretation: WASD or
joystick puppeteering is not the requested interaction.

An explicitly fake Shiitake ticker introduces visiting goblins who demand an
order. The player directs the innkeeper to prepare and deliver it; the guest
visibly receives it and leaves satisfied. Start with one simple dish and a few
useful stations. This is a working assumption for proving the loop, not a fixed
menu or a new economy specification. Keep customer admission modest and make
pause/reset available for trying it repeatedly. No actual model calls or
Shiitake integration belong in this proof.

The intended feel is a charming, readable, tactile little goblin inn. Scene
interaction should make selecting the pawn, choosing work, and understanding
what they are doing obvious. A completed service needs a visible payoff.

## Art and implementation approach

Use the current Pixi/Vite repo as the starting home. Prove the discussed
Three.js-to-Pixi technique with an original programmable goblin puppet,
fixed-camera low-resolution sprite baking, and a small original inn. Inspect
the actual pixels and motion; code compiling is not visual acceptance.

Five user-supplied reference images are available under ignored
`.botanical/references/`. Open them with the image viewer before authoring art.
They are inspiration only: do not bundle, trace, crop into game textures, or
redistribute them. Author the geometry, textures and rendered assets used by
the game. The kitchen/library cutaways suggest legible rooms; the goblin camp
suggests character silhouettes, warm wood, strong shapes and expressive props.

Keep the initial art controls small and useful: proportions, palette, pose,
camera/pixel scale as needed to judge the character beside the room. A full
asset editor, general procedural architecture system or bake service is not a
prerequisite. Exact tile/camera numbers must earn their choice in the rendered
scene rather than copying another game's recipe blindly.

Levi's latest correction: **the loop uses [mafik/libcolony](https://github.com/mafik/libcolony)
and the useful existing Hive decisions.** This selected C++/browser-WASM library
owns task assignment through `Module.optimize(assignments)`; it does not own
gameplay state, movement, animation or the fake guest feed. Read its README,
public wrapper and example; pin the browser release and prove the actual API
before integrating. Explicit player commands constrain eligible assignments.
No replacement optimizer or speculative task framework. This requirement
supersedes the earlier suggestion to author a replacement plain simulation.
The historical user selection is recorded near the opening of retained
`plans/briefs/livelyledger-quorum-interview.md`; the original URL is in
`plans/briefs/king-livedledger.md` under the read-only historical Botanical tree.
Seeded guest events and recorded player commands should be reproducible.
Renderer frame timing must not become order truth.
Choose the smallest navigation that actually routes the pawn around the room's
furniture. Inspect maintained libraries' real interfaces before adopting them.
There is no requirement to add an ECS framework, generic task scheduler, new
protocol, backend, database, world generator, needs simulation, combat, or a
colony-wide labor system. Future growth should not obstruct a playable room.

## Source and custody

- Repository: `/home/levi/src/hive`.
- Branch: `feat/goblin-bed-and-breakfast-mvp`.
- Retained upstream starting point: `8caba6cf0303437e7b6a2678d120f6587d812ec7`.
- Retained `origin/worldbox-mvp`: `14cfa809480dec9b7f4586a9993354925345fa38`.
  Its `ticker.js`, `sim.js`, `feed.js`, `tables.js`, `date.js`, `world.js`,
  `glade.js` and tests supply useful fixed-step/feed/render separation, seeded
  behavior and invariants. Neither Hive snapshot actually integrated libcolony.
  Inspect with `git show`; retain only useful bytes without switching/resetting
  this branch. Calendar/prosperity/world growth and obsolete visual rules are
  outside this small inn.
- Read `package.json`, `index.html`, and all of `src/main.js` yourself. The
  existing path is index.html -> main.js -> Pixi scene -> synthetic schedule ->
  tween callbacks. It has no real game/task model, and calls `.map` on numeric
  `PARTY_SIZE`. Preserve useful primitives; no parity requirement binds the new
  game to that broken demo. Original bytes remain in Git.
- You own this clone's game source, manifest/lock, local prototype docs and
  original assets. Do not edit Botanical-next, its worktrees, Wiki, PR or shared
  manifests. Levi subsequently authorized committing and pushing exactly
  `feat/goblin-bed-and-breakfast-mvp` and publishing its static playable branch
  preview after the first candidate review. Ordinary preview refreshes are then
  authorized. Deliver a stable branch URL and a small native deploy command.
  No merge to main, production cutover, model services or purchased resources.
  Cloudflare CLI authentication is verified; the prototype owner now owns
  initial and subsequent native static preview deployment to `fungi-goblin-bnb`,
  preview `goblin-mvp`. Use the already-authorized private CLI environment in
  the subprocess; never inspect/copy credential values or commit their path.
  No infrastructure framework or CI workflow is needed.
- Use the repo's ordinary npm/Vite tooling, with only demonstrated dependencies.
  Choose a free local loopback port; don't disrupt another preview. Browser
  recordings and scratch artifacts live under ignored `.botanical/`.

## First review and finish line

The first checkpoint is one real rendered room with an original goblin pawn,
selection and one issued task carried through movement to an observable result.
Send CTO the URL, source inventory, native-size screenshot and short motion
recording. Stop feature expansion for that early visual/source review; ordinary
verification and artifact capture can continue. Correct the small shape before
adding more tasks or art machinery. The prototype workflow's generic UI-variant
and skip-polish advice does not replace this explicitly visual game proof.

Then close the guest-arrival -> requested order -> player task -> preparation ->
delivery -> satisfied guest loop. Verify it through actual browser input,
including another order and pause/reset; capture a short uncut play recording
with usable instructions. Add only focused simulation tests that catch actual
behavioral defects; no synthetic test universe or app-platform proof. Run the
ordinary build and inspect the first frame and full interaction at game scale.

The root CTO owns art/product acceptance. A bounded Sol/Terra review should
challenge source shape and defects before the final candidate is called ready;
use Fallow if available without turning this into a tooling project. Keep the
implementation small enough to explain. Deliver a clean local commit and exact
run command, with working behavior and remaining limitations stated separately.
