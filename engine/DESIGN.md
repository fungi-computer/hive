# Hive: the fresh engine and three playable games

King Bolete · September 10, 2026 · implementation guiding packet

## Current playable interim — September 10

The four demos are live at
https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/engine/ .
Their default runtime is now the public Durable Object host:
https://hive-public-engine-demo.levi-fe0.workers.dev . The browser owns controls,
rendering and interpolation; server-owned worlds persist by a browser-held random
capability. Explicit `?runtime=local` remains supported. This is anonymous demo
access, not Fungi account integration or a multiplayer lobby.

Frontend deployment `03e69896-07d3-40c3-b4af-16acfad95297` contains the reviewed
`bee1457` build; later source commits through `3f42d80` change proof tooling only.
Server version `daf0575c-a5f4-4841-b024-21d5985d05a8` pins implementation
`62721ffd73e79b70ac7b276fd39af9b5b3b1ac6a0037f87a211dc94b2b6844d3`.
All 143 hosted files match the stopped build; 112 old clearing/study files are
unchanged. The browser-local release `8f4042d` remains an archived rollback.

Actual hosted HTTP checks cover all four packs, pause/resume, server time and
same-command replay. A real browser rendered this exact build at the canonical
origin against the hosted DO, selected and sailed the raft x=0→3, then reopened
its same paused world at revision 22; errors were empty. King personally viewed
the capture. This focused desktop evidence does not claim a narrow-screen matrix,
large-world capacity or cross-player shared-world gameplay. See BUILD.md.

### Local DO milestone after the browser release

The same survival pack and Rust/WASM now pass local native Durable Object
consumption/restart/retry and transaction rollback at 07ef860 (u4878). Saved
TypeScript hunger consequences survive the restart too. This closes the first
actual server recovery witness; the public pages still run browser Workers.
Hosted DO play, autonomous wake and population capacity remain unproved.

### Remaining foundation acceptance work

The original three packs and added raft are publicly playable at d3b914a.
Two selected workers use native joint assignment; fatigue is a real TypeScript
component/system without Rust changes. Current native format2 and supported
movement have focused native/TS laws and a real local DO restart/replay witness
(u5008). The pirate browser has actual sail, deckhand move, cargo and Save/Continue
evidence. These replace earlier unfinished source checkpoints recorded in BUILD.

Before declaring the full goal complete, audit the current public API and each
example against the five objective requirements, including current-format
recovery of authored state. The requested hosted DO/shared-client experience is
not deployed: public pages still use browser Workers. Keep that host join and
its per-visitor world/reset authority explicit rather than treating local native
proof as online play. Deep terrain, ecological systems, battles and large-world
capacity remain future scope; they are not established by these tiny fixtures.

### Current delivery target: public Durable Object demos

Levi explicitly requests all public examples on DOs, not just local qualification.
This authorizes the bounded public demo backend and its shared-client join.
The next release defaults to server simulation; `?runtime=local` retains browser
execution. The four packs use one host implementation and the same client/art.

Each browser retains a random private demo capability per pack. The server derives
its world identity from that capability and pack; no token goes in URLs or logs.
This is anonymous demo access, not Fungi account integration or cross-device account
save. Continue reopens the same world; New world creates a new capability. Preserve
existing local saves untouched. No shared administrative secret reaches the browser.

King owns deployment and acceptance. The host owns durable time/wake and physical
commitment; clients only submit intent and render observations. A short native
request-free restart witness and real shared-client operation precede public host
publication. Public host must omit debug/fault routes. No silent browser fallback
may conceal an unavailable server. The accepted static8f4042d remains available
until the joined online candidate works.

## Read this first

Build an engine that people can use to write different games in TypeScript,
and prove it by giving Levi small games he can actually play. Rust is the
simulation foundation; a responsive, understandable game is the outcome.

Levi authorized a fresh start after the earlier clearing became difficult to
extend and remained too slow to play. He accepted the Rust/WASM direction and
the three-game authoring test, requested Luna implementers with King reviewing,
and asked for one website linking to the three playable pages. He explicitly
requires shared client controls and the same original art pipeline across them.

This document is the current implementation guide. It supersedes the older
incremental JavaScript repair sequence as the new-engine work queue. Historical
source and proofs remain useful evidence. A later direct user correction takes
precedence; update this document's affected decision instead of adding another
competing plan.

**Status at creation:** an isolated worktree and this plan exist. There is no
new Rust engine, installed Rust toolchain, accepted Bevy consumer, TypeScript
SDK or new deployed game page yet. The existing clearing remains available at
the current preview. Do not turn planned interfaces into claims of capability.

Working root: `/home/levi/src/hive-worktrees/fresh-engine`.
Branch: `engine/fresh-core-20260910`, based on reviewed integration `e6b7cc9`.
King owns the architecture, public API, acceptance, integration and release.

## 1. What we are making

Hive has four cooperating parts:

1. **Rust simulation core:** compact working state, reusable physical operations,
   entity/component queries and bounded advancement of the local world.
2. **TypeScript game authoring:** real custom components, rules, systems,
   definitions and controller policies. Creators can change gameplay without
   rebuilding Rust when they use supported engine operations.
3. **Host:** browser Worker for local play; Durable Object for online authority,
   persistence, commands, wake and region communication. Celld is Levi's accepted
   eventual cheap DO target; do not reopen infrastructure-price research.
4. **Shared client and asset pipeline:** rendering, camera, selection, gestures,
   action controls, HUD and original Three → baked sprites → Pixi presentation.

Standalone Bevy ECS is the preferred entity-system foundation. Qualify the
actual installed crate and TypeScript-defined components before moving substantial
state into it. Do not pull in Bevy's renderer, asset stack or application shell.
Do not restart a broad ECS/library survey without a concrete failure of this fit.

The important long-term references are Goblin colony play, Project-Zomboid-style
direct survival, Rome-Total-War-style formation/strategy play, and later sailing
with crews and cannons. These expose different needs; we are not promising to
reproduce those commercial games in this first implementation.

## 2. What fresh means

Write the new core and authoring boundary cleanly. Do not wrap the old `Clearing`
object and call it a reusable engine. New shared mechanisms cannot import Goblin
`model.ts`, `jobs.ts`, `activity.ts`, UI state or content IDs.

Retain the old playable game, its source history, accepted art, asset authoring,
controller/Region experience and useful behavioral laws. Reuse a mechanism when
its actual ownership fits. Reusing proven code is compatible with a fresh design;
copying an entire old architecture to preserve accidental behavior is not.

The new engine has one implementation per physical rule. Switch all new consumers
together when changing that rule. The separately preserved old game is not a
fallback runtime inside the new one. No old-save migration, compatibility shim
or old/new dual mutation path is required. Current-format save, interruption,
command replay and crash recovery remain requirements.

The small first native port is libcolony: 423 lines of upstream C++ and 158 lines
of immediate bridge/loader/matching/build code. It tests Rust compilation,
packaging and real callers. It is not offered as the cure for lag or as proof of
the whole engine. Preserve its MIT attribution and joint-assignment semantics.
The archived native C/C++ fluid/heat experiments are research, not code that all
has to be ported. Current gameplay wants much simpler environmental behavior.

## 3. The three public examples

### Fourth consumer amendment — pirate ship, September 10

Levi explicitly adds a fourth playable pirate game to test engine generality.
Keep the original three outcomes intact and stage this after their current
coupled work; this is additional required work, not a replacement or a claim
that the original foundation already includes sailing.

The first pirate slice steers a floating ship and lets selected crew walk on its
deck while it moves. Finite cargo uses the same material/container owner. Share
the client, controls and original asset pipeline, and link the fourth page from
the same site. A simple sea surface is sufficient; no ocean-fluid solver is
required for this interaction. Cannons follow working ship/deck movement.

The real engine boundary is a body supported by a moving reference frame.
Canonical deck-local pose plus a stable support reference must produce world
pose for rendering, picking and spatial operations through one geometry owner.
Never save two independent positions or animate passengers along cosmetically.
Deck navigation remains constrained to its support geometry, even as the ship
translates or turns. Define boarding/leaving admission explicitly before adding
either action; first-slice crew may start aboard. Reject missing/cyclic support
references and preserve identity, cargo custody and local pose on current-format
save/reload and the existing host transaction. No ship-specific branch belongs
in shared movement, rendering or persistence. Actual native/TS callers must be
reviewed before choosing the representation or changing the kernel.

**Latest presentation preference (Levi, September 10):** aim for one playable
page switching among three independent DO-hosted example worlds. Reuse one DO
class and simulation implementation; do not build three servers. Start with tabs
and one active rendered view, preserving per-example links. A simultaneous
three-panel view is optional and must not delay useful play. Retain browser-Worker
hosting as a supported local mode. Shared demo access/reset ownership must be
explicit before public server exposure; one visitor must not accidentally reset
another visitor's world. DO-hosted play is only claimed after the actual join.

One landing page, three game pages, one shared engine/client build. Start under
the existing authorized game preview at `/engine/`, with ordinary links to
`colony`, `survival` and `formations`. Preserve the old clearing and study links.
The final route spelling can follow the maintained static bundler's normal
output; no routing framework is needed for four pages.

| Example | What Levi can do | What it forces us to get right |
| --- | --- | --- |
| Colony | Select workers, give an order to deliver finite food to a guest, interrupt and resume it, and inspect who owns the food. | Shared selection/orders, joint work allocation, movement, claims, quantities and interruption. |
| Survival | Directly control one survivor, open the same kind of container, take and consume food, and see a TS-authored condition change. | A body can act without colony job assignment. Materials/actions are reused. Custom state and rules are real. |
| Formations | Select a small group, give a destination and facing, march around an obstacle, and change a TS morale/retreat rule. | Group orders, membership/relations, spatial queries, formations and different rates of decision-making. |

Use small real scenarios with existing original art in an isometric voxel world.
No particle box, graph dashboard or coordinate-only lab substitutes for these.
The formation example is not a battle simulator; the survivor is not a zombie
game yet. Make the actions above good before adding combat, infection spreading,
sieges, fleets, technology trees or a large content catalogue.

**Levi's combat amendment, September 10:** after the formation movement checkpoint,
the first RTS combat demonstration should fire a cannonball into a formation.
Use an authoritative swept projectile/body-or-terrain collision and committed
impact, with damage, knockback and morale policies authored in TypeScript. Evaluate
Rapier/Parry against this actual consumer; do not fake a screen-space hit or
settle damage from an animation callback. Horse charges are a later reuse target
for contact/impulse behavior, not an immediate cavalry system assignment. The
cannon milestone is part of the requested demo progression; large battles remain
outside this first foundation's capacity claims.

Colony and survival must use the **same** container/quantity/consumption owner.
Colony and formations must use the **same** selection and group-order controls.
All three use the **same** body/spatial facts, renderer and original sprite bank.
An example-specific helper cannot secretly become another inventory, movement
clock or input framework.

Each page explains its controls, has pause/reset and supported current save/load,
links to the other pages, and exposes its short TypeScript game source. Include
one meaningful editable rule through ordinary bounded controls. A published
source example must match what runs. Do not put arbitrary code evaluation in
the public website merely to call it an editor.

## 4. How the API earns its shape

### Character depth is retained, not replaced by the first demos

Levi reaffirmed deep needs, traits, skills and relationships on September 10.
Retain the [needs/hospitality/social contract](../docs/decisions/living-world-system-contracts.md)
and its RimWorld/mod research. Hunger and fatigue demonstrate the authoring
boundary; they are not the intended ceiling of character simulation.

Game-authored capabilities apply to player bodies, workers, guests and prisoners
through membership, not separate copies of need logic. Traits modify rates and
preferences; skills modify eligible work, duration and outcomes; directed
relationship records reference stable people and influence cooperation, conflict
and recruitment. The engine owns identity, validated references, queries and
atomic writes/actions. Goblin owns the meanings, definitions and social policies.
Do not put fixed Goblin personality fields in the Rust kernel or accumulate every
possible trait as optional fields on one universal pawn.

Changes derived from a completed meal, work or social encounter must follow
committed outcomes and survive retry/save/restart without awarding the effect
twice. Bounded relationship queries and scheduled need changes must not require
all-pairs social scans or continuous ticks in every sleeping region. These are
design constraints for later consumers, not claims that the current scalar
schema already provides a complete relationship graph or need scheduler.

Write the three author-facing TS examples alongside the public contract before
implementing a large engine surface. They must reveal how a creator declares
new state, asks for relevant entities, writes a rule and invokes a physical action.
Do not hide these tasks behind a `startGoblinDemo()` function.

After the first examples run, freeze one engine build and make three changes in
the TS game packs only: a hospitality preference, a custom survival condition,
and an army morale/retreat rule. None should need Rust recompilation or an engine
branch keyed on a game name. Give one change to an independent implementer using
only the public examples/docs; King should not have to explain private internals.

### Required authoring concepts

- **Component definitions:** namespaced, versioned schema and stable meaning;
  numbers, booleans, strings/identifiers and entity references as actually
  supported. Define optional/null behavior explicitly. Adding a game component
  does not require editing a fixed Goblin schema or recompiling the kernel.
- **Queries:** reusable component membership plus explicit filters. Spatial
  proximity, permission, availability and reachability remain distinct queries.
  Read only requested records/columns, not a full-world JSON snapshot per system.
- **Systems:** ordinary TS functions with declared inputs, owned outputs,
  execution order and advancement conditions. A declaration must be enforced,
  not simply printed as documentation. Changed data is recorded at the write
  owner; authors must not remember a separate notification call.
- **Actions:** named typed operations owned by the relevant mechanism. Movement,
  material transfer and consumption are requests to those owners, not arbitrary
  writes to their position/quantity fields.
- **Game-owned writes:** creators may update their own morale, preferences or
  other state transactionally. This must not grant write access to every engine
  component. Avoid a universal `patchAnything` escape hatch.
- **Presentation:** a small read-only projection with stable IDs. Camera,
  animation and visual interpolation never settle authoritative work.

Persist authored component/resource state and the selected game-definition/system
version, never function closures or module-global mutable game state. Systems
use supplied simulation time and deterministic random state. Network, wall-clock
and other external effects stay outside candidate execution. Public writes either
commit together or are discarded.

An illustrative public shape, not an existing export:

```ts
const Morale = component("army.morale", {
  version: 1,
  fields: { value: number(), formation: entityReference() },
});

const retreat = system({
  id: "army.retreat",
  reads: [Morale, FormationOrders],
  writes: [RetreatIntent],
  run(context) {
    for (const unit of context.query(Morale, FormationOrders)) {
      if (unit.morale.value < 20)
        context.write(RetreatIntent, unit.id, { active: true });
    }
  },
});
```

The example's intent is gameplay-owned state. A shared order/movement operation
later admits and executes it. It does not teleport the unit or mint resources.
The final API names should come from implementing the examples; do not build a
large bespoke language or plugin interpreter to realize this sketch.

**Reject the shape** if a new rule needs private imports, per-property WASM
calls, an engine-wide string switch, duplicate physical state, unbounded copies,
or manual cache repair by the game author. Also reject a facade that exposes only
precompiled Goblin recipes and calls that TypeScript authoring.

## 5. Rust, Bevy and data ownership

Use an ordinary maintained Rust → WASM toolchain. Start with the matcher and
bulk input/output, then qualify dynamic game components and typed game systems.
No candidate version is accepted until the actual compiler, crate and caller
work. Pin the dependency graph and preserve the build recipe.

**Rust ecosystem follow-through, September 10:** use maintained building blocks
beyond ECS where an actual consumer fits. `pathfinding` supplies route search;
its Hungarian implementation is also a candidate for replacing custom matching,
subject to legal-edge/cardinality/tie laws. `glam` supplies native vector math.
Serde owns structured encoding; Postcard is a later compact-format candidate,
not a prerequisite. Parry (shape queries) and Rapier (rigid-body dynamics) remain
named options for actual later collision/vehicle work. They are not a reason to
replace the retained client or introduce detailed fluid physics. References:
[ecosystem index](https://arewegameyet.rs/),
[pathfinding](https://docs.rs/pathfinding/latest/pathfinding/),
[glam](https://docs.rs/glam/latest/glam/), [Serde](https://serde.rs/),
[Postcard](https://docs.rs/postcard/latest/postcard/),
[Parry](https://parry.rs/), [Rapier](https://rapier.rs/).

Bevy owns entity/component storage and supported query bookkeeping. Hive owns
public IDs, schemas, physical laws, game/host boundaries and durable meaning.
Map public entity identities and component schemas to Bevy handles privately;
do not save raw Bevy IDs as globally meaningful world identities.

Use data structures appropriate to each job:

| Data | Intended representation |
| --- | --- |
| Actors, items, groups and custom game attributes | ECS components and maintained membership/relations |
| Terrain and detailed water | Bounded chunk arrays, sparse edits and active cells/faces |
| Air | Connected room/cave volumes or bounded height bands with explicit openings |
| Work and obligations | Owned records, references, progress, reservations and due work |
| Rendering and UI | Disposable projected facts and cached visual resources |

Do not create an ECS entity for every terrain or fluid sample automatically.
Do not introduce a universal actor record full of optional Goblin flags. Do not
use Bevy scheduling, observers or deferred commands as a substitute for a durable
world transaction. Make simulation order, random source and elapsed time explicit.

Game rules execute at useful rates and receive batches. Intensive native loops
stay in Rust. WASM memory belongs to one region instance; immutable compiled
code can be shared. Cache/query views have clear lifetimes across memory growth,
world replacement and restore. No JS view survives invalidation silently.

## 6. One shared client and control system

Personally inspect and extract the useful behavior from current `src/ui-actions.ts`,
`src/keys.js`, camera/picking code and target lifecycles. Preserve XState gesture
ownership and the checked OpenTUI keymap. Current files import Goblin types; do
not import the whole old UI to obtain a box-selection gesture.

The new client has one owner for:

- click selection, drag-box selection, additive selection and deselection;
- selected IDs, hover/target inspection and contextual orders;
- camera pan/zoom, floor selection and physically consistent picking;
- pointer cancellation, pointer-up outside, focus/typing guards and disposal;
- action labels, enablement, buttons, keyboard bindings and help;
- simulation connection, pause/reset/save UI, errors and loading state.

The colony and formation packs declare selectable subjects and available orders.
They do not implement separate rectangle math or event listeners. Survival adds
direct movement input through the same client; it does not force every button
press through the colony optimizer. Switching pages/modes releases held input,
pointer capture, subscriptions and workers cleanly.

Use Caps and the actual shared Stipe typography/theme for all page chrome.
Keep a compact 32px layout rhythm without making controls inaccessible. One
layout must work on a narrow phone screen and desktop. Avoid a new decorative
dashboard, bespoke palette or three slightly different HUD implementations.

## 7. One original art pipeline

Use the existing original Three builders and accepted static atlas outputs in
`public/generated-art/goblin-static-art-v1/`. Respect manifest frame coordinates,
anchors and silhouette data. Keep the original sprites; do not generate new
character art or copy commercial game assets for the examples.

The shared rendering owner resolves logical visuals into that art. Simulation
does not depend on sprite names or images. A sprite cannot create inventory or
physical collision. Geometry, projection, picking and ordering use one coordinate
contract. Reuse prepared textures and dispose resources; no routine Three bake
for each changed field value or body movement.

Terrain is voxel-based; that does not force every moving body's position to be
an integer voxel index. Keep terrain cells, world-space pose, support/contact and
navigation separately meaningful. Multiple storeys, caves and eventual moving
decks must not be prohibited by an accidental coordinate type.

## 8. Host durability, multiplayer and future scale

### Display interpolation is part of the shared client

Levi reported stepped movement and explicitly requires online-aware interpolation.
The simulation remains authoritative. Display frames now carry simulation time,
sequence and a reset/restore epoch; rendering must not assume one packet per frame.
Use a bounded snapshot buffer, one monotonic display timeline, stable-ID matching
and linear pose interpolation. Clamp when updates run out; do not invent continued
physical movement. Pause freezes display time, resume reanchors it, and a new epoch
clears prior history. Picking uses the positions actually displayed. Ship and crew
will share that timeline rather than smoothing independently in different frames.

Source comparison: [Geckos interpolation implementation](https://github.com/geckosio/snapshot-interpolation/blob/master/src/snapshot-interpolation.ts)
provides buffering and interpolation, but its inspected implementation clones
JSON state and searches the older array for each entity per interpolation. Its
automatic timing uses wall-clock offsets. These are concrete reasons to retain
a narrow indexed display buffer for our paused simulation clock, not adopt the
whole package merely for scalar interpolation. No replacement networking stack
is authorized by that choice. Test uneven delivery, stale updates, pause/resume,
despawn and reset. Prediction/reconciliation for direct controls remains a later
explicit server-authority join; interpolation alone does not hide input latency.

Durable Objects are a primary design constraint from the beginning. Browser
support is also required. A first static demonstration may run inside a browser
Worker and must say so. Local execution is not a claim of hosted multiplayer.

Hosting portability (Levi, September 10): DOs are the first server target, not
a dependency of game rules or the Rust simulation. Preserve the ability to host
the same simulation on a native multicore server with a TypeScript execution
host. That host is not implemented or qualified by the current WASM/DO proof.
Budget each Cloudflare region for single-threaded execution; independent regions
can run concurrently, but distribution does not accelerate one tightly coupled
battle automatically. Browser WASM threads and native Bevy parallel scheduling
are optional future host work, not assumed performance in the current demos.
Large RTS capacity still requires measured movement, collisions, rule execution
and networking workloads; neither Bevy adoption nor Rust compilation proves it.

Each active region has one authority for tightly interacting bodies, items,
terrain and fields. Do not distribute water, gas and jobs into separate network
services. Rendering clients submit permitted actions and receive committed
observations; they do not settle online physical effects themselves.

Use the existing Region/Watchdog/host lessons: durable command identity, input
binding, revision checks, atomic state/result/event commitment, and explicit
wake/re-arm. A retry replays a committed result. A failed DB transaction does
not rewind a changed Rust heap: use detached preparation or invalidate/reload
working state. Keep publication after commitment. Persist meaningful due work;
an in-memory queue cannot be the only reason a promised action will happen.

World generation, saved pages, render chunks and active simulation regions are
different things. Unvisited terrain can be generated on demand. Quiet places
can sleep and advance through supported elapsed-time rules. There is no required
global tick barrier or permanent simulation of every place ever visited.

A region transfer needs explicit custody and retry handling; a single DO's
transaction does not atomically update its neighbor. An army/group may have an
aggregate distant representation while nearby members are detailed, but both
representations must account for the same personnel, goods and identity.

The first formation page uses a small real moving group. Increase the number of
active moving subjects only after its API and behavior work. Measure whole-step
cost including queries, TS execution, boundaries, persistence and render output.
Idle-entity microbenchmarks do not establish a Total War battle or DO capacity.

## 9. AI and extension boundaries

Shiitake is a first-class controller/player and an optional larger-event
storyteller. Ordinary game rules and the ordinary director do not need an LLM.
Humans, direct-control AI and colony controllers use the appropriate scoped
observation/action owners. Game-author system registration is not a privilege
available to every untrusted player script.

Use Botanical's actual Mycelium execute/module path when joining authored player
code and agents; do not invent a new sandbox or game-agent protocol. Saved script
versions, due invocations and durable game receipts remain explicit host/game
facts. Hive is the game channel; Discord remains Botanical's responsibility.

The engine and original asset tools may ultimately ship through ordinary Fungi
App contracts. Standalone playable pages are the useful first publication.
Existing editor/MCP/public operations and platform work need no replacement.

## 10. Environmental limits we will hold

The three initial authoring examples do not require rebuilding water and gas
first. When those mechanisms move, use the established game-scale direction:

- Finite water, actual openings, gravity/local leveling and bounded supported
  head flow; finite soil capacity, saturation, retention and permeability.
- Finite contents and shared transfers for vessels, sewage, treatment, nutrients
  and crops. Detailed pollutant/nutrient transport is future work, not claimed
  by a colored water tile.
- Coarse room/band smoke and heat with actual vents and environmental consequences.
  No turbulence, molecular chemistry or high-fidelity CFD prerequisite.
- Active work, cached topology and slower appropriate cadences. A small numeric
  change does not rebuild the entire world, gas graph or texture bank.
- Multiple storeys and deep digging remain architectural requirements. Do not
  reintroduce the old one-layer-down/one-layer-up limit or direct-wall-only floor
  support while simplifying representation.

New simulation complexity must explain the player decision it enables. Preserve
quantity, custody and meaningful consequences. Do not spend days matching a
research reference that does not change the game Levi can play.

## 11. Implementation sequence and tight feedback

| Chunk | Deliverable | Acceptance and next action |
| --- | --- | --- |
| A: authoring and native start | Three readable game sketches; initial public SDK contract; ordinary Rust/WASM build and real matcher consumer | King reviews actual author code and native boundary. No whole-core conversion is implied. |
| B: one real authoring loop | TS-defined custom component/system using the actual Bevy-backed core, with query/write/current save/restore | New state and rule work without recompiling Rust. Check thrown-system/failed-commit behavior and reference reconstruction. |
| C: shared playable client | One original-art scene, shared selection/camera/HUD/action catalog, simulation in a Worker | Real inputs reach the shared owner. No three-client split. Publish a coherent working interim on the existing site. |
| D: three contrasting packs | Colony delivery, direct survival and group movement on the same engine/client | Each works through public APIs; change each pack without kernel edits; independent author attempts a small change. |
| E: host and measured growth | Same supported rules qualified in the existing DO host; progressively larger actual work; selected engine mechanisms migrate | Before foundation acceptance, the same TS-authored component/system survives an actual DO owner restart and lost-response retry without duplicate physical effects. Reuse the bounded host harness. Report cost limits; only claim online play after the real server/client join is deployed. |

These chunks may overlap only across explicit file boundaries. Authoring API
review and the native build can proceed together. The client can use the frozen
public contract while the kernel is implemented, but a mock transport is not
an accepted playable result. Join real implementations before publication.

Each meaningful checkpoint returns: the actual changed source/commit, the visible
behavior, what can be tried, and the next unresolved decision. Give Levi the
working page as soon as the joined behavior is reviewable. Do not wait for every
future engine capability to be complete before feedback.

**Levi's hourly demonstration direction:** while actively implementing, aim for
one small playable or visibly meaningful proof roughly every hour. Choose chunks
that can reach this feedback loop: a shared control working, a real transfer,
a custom TS rule changing play, or a saved world returning correctly. Publish
coherent, clearly labeled interims on the shared demo site when ready; include
an accurate short description and a useful image or short clip when it helps
Levi share the result. Use original assets and public example source, never
private transcripts or credentials. This is a delivery target, not permission
to fabricate progress or deploy a broken candidate. If an hour produces no
shareable result, explain the concrete blocker and the smallest next result;
keep implementation moving without restarting a broad research or proof cycle.

Use focused laws for ownership/retry/custom-state behavior and short changed-input
checks. Combine checks for a coherent joined candidate; repeat only invalidated
evidence. Levi cancelled the old clearing browser witness and stopped expensive
editor matrices. Neither is reopened by this plan. No test-only marathon delays
a clearly labeled useful interim; missing evidence is disclosed honestly.

## 12. Implementer custody and definition of done

Luna implementers get full bounded outcomes through fixes, relevant checks and
commits in separate worktrees. King owns architecture, API choices, unusual
native-memory questions, source review, original-art judgment and serial release.
Checkpoints are informational; writers continue independent work while King
reviews a pin. Do not manufacture idle lanes or add a PM tier.

Initial boundaries will be assigned explicitly: kernel/packing; shared SDK and
game packs; shared client/controls. Package/toolchain installation and coupled
integration remain King-owned unless explicitly released. Never modify another
lane's dependencies or sweep old worktrees. Shared Caps source remains Botanical;
consume its public package and coordinate any genuine component need.

An initial example is done when its promised action is playable on the shared
site, uses the actual shared engine/client/art, has understandable controls and
author source, and survives the supported interruption/save behavior. It is not
done because its mock renders or a Rust microbenchmark is fast.

The first foundation is accepted when all three packs work on one pinned engine,
ordinary TS changes do not edit Rust, custom state survives restore, mutation
ownership is enforced, and the supported browser/DO behavior and limitations are
reported separately. This is a small engine foundation, not full engine completion.

## References to retain

- [Runtime/library research and native inventory](../docs/decisions/ecs-runtime-and-wasm-choice.md)
- [Current source/behavior implementation guide](../docs/decisions/engine-implementation-guide.md)
- [Engine, game and asset boundary; survival and pirate examples](../docs/decisions/hive-engine-asset-pipeline-and-goblin-boundaries.md)
- [Durable Object and sleeping-region contract](../docs/decisions/local-snapshots-and-durable-ai-jobs.md)
- [Many-faces AI participation](../docs/decisions/vishnus-many-faces.md)
- [Existing measured clearing result and its limits](../docs/performance/clearing-20260910.md)

The references explain prior work. This packet owns the fresh implementation
sequence; conflicting older staffing, compatibility and shallow-world clauses
are historical. Record later scope changes here with their actual user authority.
