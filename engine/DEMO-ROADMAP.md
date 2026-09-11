# Four games that grow into Hive

King Bolete · September 11, 2026 · Levi's active product amendment

The fresh examples are the beginning of real games, not permanently tiny API
exhibits. Colony should regain the retained Goblin Clearing's ambition: deep
excavation, multiple storeys, finite water and saturated soil, growing crops,
shared hauling/storage, useful crafting and eventually hospitality. Keep the
existing four URLs. Restore a playable loop in successive releases; do not
one-shot every retained system or let presentation polish substitute for play.

## Current playable checkpoint — September 11

The four-page demo is now deployed from a13fc44. Colony uses the Rust generator
for64×64 exterior columns and native finite water near the camp. Real mouse
input completed soil/stone excavation, spoil deposits and an exterior cutaway
that exposed groundwater. Local actual DO restart and identical-command replay
passed; hosted initial observations and pause admission passed for all four
packs. Exact release/proof limits are in BUILD.md; the former c5138fc availability
statements below are historical context, superseded by this checkpoint.

### Immediate correction: usable digging before exploration

Levi rejected porting the retained vision implementation on September 11. Keep
native-sight c9dba38 unintegrated; do not continue that port. Scoped knowledge
remains a future goal requirement, but its implementation needs fresh product
review. The public exterior cutaway is not fog of war.

The current dig command is a physical primitive exposed as an unfinished player
interaction: it requires one selected worker, does not route that worker to the
cell, handles one click only, and fills the worker after one cut. A scripted
manual approach/deposit sequence passing is not acceptance of colony playability.

The next joined outcome is a visible rectangular designation, saved queued work,
automatic reachable assignment/approach, excavation and ordinary spoil storage.
Use shared client gestures, Rust route queries and Hungarian allocation, native
excavation completion, and existing finite lot/transfer ownership. Do not add a
second hauling or resource settlement implementation.

- Designations describe fixed-level integer cells, not worker IDs. Drag previews
  and accepted queued/working/blocked marks must use the same coordinate rules.
  Submit bounded batches; reject invalid external ranges before expanding them.
- Saved tasks own claims. One worker cannot concurrently acquire delivery and
  excavation jobs. Existing cargo continuation wins. Filter invalid material,
  capability, claim and capacity candidates before expensive route queries.
- A reachable adjacent work position is required; never route onto the solid
  excavation target. Unreachable tasks remain visible and waiting. Route cost
  comes from native terrain traversal, not straight-line guesses or TypeScript
  copies of A*. Geometry changes invalidate derived route/eligibility results.
- Movement earns no digging progress. Native completion alone changes the cell,
  water and finite spoil. Completion/retry must retire the designation once;
  cancellation releases intent without undoing completed cuts or deleting cargo.
- Carrying capacity and storage stay finite. Full storage produces an actionable
  waiting reason; never invent room in the pantry or discard spoil to keep a
  worker moving. Ordinary material transport must handle excavation output.
- Paused designation is allowed; effort and movement remain frozen. Current-format
  save/reload preserves queued work, ownership and progress. No legacy migration.

The retained brewing consumer is a required design comparison, not an unrelated
future example. `src/jobs.ts::brewOption` checks station/readiness before approach;
`src/brewing.ts::brewStationReadiness` resolves supplies and promised output space;
`src/activity.ts::brew` verifies access and releases attendance for fermentation;
`advanceBrewing` advances that unattended process on authoritative time. Keep
these distinctions in the new shared work owner:

```text
order -> resolve next useful step from committed facts
  waiting(reason)             -> retain order, no worker claim or path search
  unattended(process)         -> retain process/resources, release worker
  needsWorker(requirements)   -> cheap eligibility -> native approach cost
                              -> joint assignment -> saved step claim
claimed step -> approach -> existing physical operation -> committed result
result -> release step claim -> resolve order again
```

A worker claim is not a reservation of every resource for an entire recipe.
Cargo, station/process reservations and operation receipts keep their own existing
owners and must survive worker changes. Dig spoil transport and recipe supply must
use the same transport implementation. Do not convert the above into arbitrary
serialized callbacks or a speculative plugin language. Root reviews both real
consumers before approving the shared runtime implementation.

Acceptance is an ordinary area drag followed by workers walking, cutting,
unloading and continuing without manually parking them for each cell. Include
unreachable work and full storage feedback, cancellation and save/reload, plus a
short changed-consumer interaction. Preserve the existing water/restart evidence;
do not replay its long manual four-cut trace for every gesture correction.

Three usable constructed levels, room smoke, scoped exploration and two-player
region travel remain unfinished goal requirements after this usability repair.

## Next sprint: a living world worth traveling through

September 11 recut after Levi's larger-world and busy-region hosting discussion.
Personally checked against fresh source `38ca137`. Levi has now activated this
delivery sequence as the connected-world goal in the existing Game CTO Session.
It replaces the order of upcoming work below while retaining accepted gameplay
and environmental ownership laws. Implementation has resumed in isolated native
water, world-generation and shared-controls worktrees under King's review.

**Water is moving to Rust.** The earlier word “preserved” meant that the unfinished
Rust source was kept during the architecture discussion. It did not mean retaining
the JavaScript simulator as the new engine's water owner. The first native water
module has compiled and passed its focused laws; it is not yet connected to the
live Colony. Rust will own finite
water/soil state and transport, TypeScript supplies game definitions and commands,
and the shared client displays committed observations. The current public release
remains `c5138fc` until an actual joined checkpoint is published.

**Two headline outcomes: a useful wet colony and a Survival journey across two
real region owners.** Indoor smoke is the next colony checkpoint on the same
geometry. Fort combat and loaded-ship travel follow through those shared
mechanisms. Keep all four existing pages on the same playable site. The distinct
packs are contrasting consumers, not automatically one cross-game universe.

### What the four demos actually contribute

| Existing page | Current playable loop | Next meaningful destination |
| --- | --- | --- |
| Colony | Two workers deliver finite food through common lots, containers, assignment and carrying poses | Dig/direct water, supply a planted bed, then build and ventilate a multi-storey home |
| Survival | Continuous predicted movement, finite food, hunger, wellbeing and fatigue | Carry supplies between camps across a region boundary and meet another player |
| Formations | Group orders, finite cannon rounds, native flight/contact, piercing hits, roll/embed and accepted cannon effects | Breach a fort and capture its supply point using formations, cover and finite ammunition |
| Pirates | Moving selectable ship, support-relative crew, mixed cargo delivery and original hull/sail/wake | Deliver cargo between harbors with ship, crew and contents crossing together |

Read `src/games/{colony,survival,formations,pirates}.ts`, `src/sdk/delivery.ts`,
`src/client/direct-control.js`, shared motion/effects/audio and `kernel/src/world.rs`.
Public source remains `c5138fc`. Native environment, paging, cross-region custody
and container hosting are not current runtime capabilities.

### Larger areas, retained controls and exploration — Levi's amendment

Use an initial layout target of roughly **64×64 horizontal cells per area**,
with two neighboring areas for the Survival journey. This enlarges explorable
space, not the amount of detailed underground simulation required every tick.
Generate/cache pages on demand and retain the bounded active/resident policy.
The frozen 20×20×24 environmental workload stays a separate comparable measurement;
qualify the larger playable layout before claiming its performance. Depth is a
signed world/content bound, not a hard-coded Ground/Upper pair or dense full-height
allocation. Include a hillside, meaningful route between destinations and space
for a homestead; acres of empty repeated tiles do not make a better demo.

Bring the level/cutaway controls into checkpoint 1, when terrain becomes diggable,
rather than waiting for checkpoint 3's completed building. Retained owners are
`src/ui-actions.ts` (`LEVEL_NAVIGATION`, `dispatchLevelAction`), `src/keys.js`,
`src/hud.jsx`, and `src/construction-view.js`. They provide button/key parity,
bounded signed level selection, gesture cancellation, compatible-tool retention,
inspection clearing, support context and cutaway/picking rules. Port those useful
mechanisms into the common fresh client; do not import the old Clearing simulator
or copy separate implementations into four pages.

Use visible Higher/Lower controls, PageUp/PageDown, current physical layer, a
clearly labelled optional storey jump and cutaway toggle through one catalog.
The retained button title currently says storey and old logical levels map to
multiple voxels: resolve that scale through the shared world query instead of
blindly copying a four-voxel jump into a one-voxel control. Keep controls usable
paused and without selected stairs/actors, preserve focused widget keys, and
cancel an old pointer stroke before changing its layer. Camera/cutaway/selection
cannot advance time or change physical openings. Keep the earlier four-view
rotation requirement in the shared projection/picking contract; the current
fresh camera has pan/zoom/reset, not an already-completed rotation implementation.

Real exploration is retained in `src/exploration.ts` and callers, with authored
laws in `src/vertical-play.test.js`: eye-based voxel sight, wall/corner occlusion,
remembered geometry, and reconstruction without updating unseen remembered facts.
Retain those semantics. Replace its whole-actor/site JSON signature, broad sight
recomputation and copied/sorted global memory array with bounded spatial knowledge
pages and observer/geometry revisions under the native query/commit owners.
The old global union of all actors' sight is not the new multiplayer permission
model. Game definitions choose observer membership, sight range and faction
sharing; reusable engine mechanisms own visibility and saved knowledge.

The shared view distinguishes:

- **Visible now:** live permitted terrain, people and effects.
- **Remembered:** subdued last-observed terrain/buildings, with no live hidden
  enemies, inventory, damage or water updates masquerading as memory.
- **Unknown:** concealed space; switching layers or removing a visual roof cannot
  discover a cave, ore deposit or creature.

The first bounded native sight implementation may port the retained conservative
ray rule; no new lighting research is required. Recompute affected observers on
relevant position/geometry/policy changes, not camera motion or every render frame.
Do not let a deferred visibility refresh expose stale live facts through a newly
closed wall. Persist observed changes with the world occurrence and rebuild live
visibility from current state on reopen. Page remembered knowledge by observer/
sharing scope and world coordinates, so region travel neither forgets the map
nor grants another player's discoveries by accident.

Apply knowledge filtering before online observation leaves the host. Geometry,
actors, inventory summaries, effects/audio, inspectors, picking, minimap, command
previews and AI tools use the same scoped facts. Today's host broadcasts one full
observation to authenticated sockets and needs this actual caller change. A dark
client overlay alone is insufficient. Do not send private hidden-generation seeds
or concealed terrain in a purportedly filtered online projection; browser-hosted
local simulation is not an anti-cheat boundary. A coarse map can use explicitly
public geographic knowledge without revealing underground content.

Blind quarry plans remain geometric intent with unknown eligibility until work
or sight reveals it; hidden enemies must not leak through exact preview counts or
error text. Developer full-world inspection is a distinct explicit debug scope.
First acceptance combines real level buttons/hotkeys with excavation: descend,
reveal one chamber, leave it, and cut away the remembered space without exposing
an unseen neighboring chamber or a creature's new position. Save/reopen and
cross-region travel retain only the appropriate player's learned map.

### Checkpoint 1 — a ditch that matters, in the existing Colony

Ship one generated integer-height clearing with a reachable wet cut. The player
marks excavation through shared selection; workers perform paid work and produce
real spoil; finite water enters the cut or drains into drier soil. Existing food
delivery stays playable. Show the physical result through the original terrain/
art pipeline, not numerical charts or another lab page.

Necessary engine work: resident Session/Region lifecycle, bounded native records,
one Rust generator/geometry query and native finite water. Integrate the held
water draft through that owner; do not commission another solver. Geometry,
stock, yield, routes and receipts share the compound completion. A drained
reservoir stays drained after reopen. Qualify local flow before claiming pressure,
pollution or gas. Keep signed vertical coordinates and material properties;
do not hard-code one lower/upper level or native Colony content IDs.

The full three-storey building and ecology loop do not block showing the first
useful excavation. Survival can consume the same terrain while travel work
proceeds. **Exit:** Levi can dig and change where finite water goes; the effect
survives the actual host lifecycle. Measure the frozen environmental workload
and full commit/projection cost, not just the Rust function.

### Checkpoint 2 — a journey across two real owners

Use Survival: take supplies at camp A, walk to camp B, leave goods there, then
return. One versioned seed/world coordinate system produces consistent adjacent
terrain; two DOs own neighboring simulation regions in that Survival world.
Render chunks and region ownership are different: a DO may own several chunks,
and viewing distant terrain creates no stock or permanently ticking object.

Allow two independently controlled travelers to meet and see the same changes.
Extend current anonymous demo admission to world/body-scoped player grants;
sharing today's owner token between tabs is not independent-player proof. Keep
world administration and host-clock powers separate. This needs no new account
database and does not claim the future Fungi customer-authority join.

Persist an opaque grant ID, stable world/principal/body IDs, granted operations
and revocation/version state under the world admission owner. Authenticate its
bearer secret through the existing host transport and retain only its checked
identity in socket attachment state. Both HTTP and socket commands recheck the
grant and actual subject/resource ownership; a string action whitelist is not
enough. Trusted pack commands receive the admitted controller/body context instead
of always targeting `survival.survivor.1`. Pause, reset and clock operations are
not automatically available to another admitted traveler. Player/body identity
and scope survive region movement without becoming a second account system.

Today `tools/public-engine-host/worker.ts` derives one DO from `pack:tokenHash`;
`src/runtime/remote-client.ts` targets one endpoint. Separate stable world,
region, player/body and transfer identities from a versioned placement record.
Namespace newly minted entity/lot IDs by stable origin, so regional counters
cannot collide. Both regions load compatible content/schema versions.

Transfer a checked actor bundle: authored state, finite contents, controller/input
frontier and relevant receipts. No Bevy handles. Existing typed entity fields
identify references, but membership in the transferable closure must be explicit.
Local jobs/claims settle or release through their owner, never become dangling
pointers. The first traveler has no external support or running local job.
Include all physically contained lots and required internal references; inspect
both outgoing and remaining region state for invalid references. Do not follow
an arbitrary relationship graph and accidentally transfer the village. Unsupported
external physical references block admission explicitly. Public entity/lot IDs
stay unchanged; the destination rebuilds its own Bevy handles and resolves the
stable references against its checked local entity set. That local handle remap
is not a rewrite of public IDs or saved authored references.

```text
A commits a frozen outgoing bundle at a known input/tick frontier
B reserves a valid arrival and durably stages that bundle, still inactive
A commits an irrevocable departure decision for this transfer ID
B verifies the decision and activates the bundle exactly once
A retains retry receipts/tombstones and retires the outgoing copy
```

Only one region can move, consume or spend it. Every stage is input-bound and
recoverable. Before departure, rejection leaves the actor recoverable at A;
after departure, recovery finishes activation at B. Cancellation before the
decision must resolve durably against delayed messages. An arrival reservation
cannot independently expire while departure is uncertain. Pending work owns
durable wake/retry; browser reconnect is not its repair mechanism. This allows
a waiting state and does not pretend two SQL databases share one transaction.
Previously admitted target commands either settle before the frozen frontier or
travel as explicitly owned pending work; an admission receipt alone is not a
completed physical effect. Later target commands follow the transfer decision
with their original retry IDs, rather than executing at both owners.

The common client follows committed ownership and preloads discovered adjacent
terrain. Preserve global displayed position, facing, input sequence and processed
frontier; replay only valid unacknowledged inputs. Namespaced stream epochs reject
late old-owner frames. Keep prediction/buffering bounded and show waiting if a
handoff stalls; no promise of uninterrupted movement during an outage. Neighbor
observations are knowledge-scoped, read-only views, not authority to hit a stale
remote actor. Preserve the sustained-input improvement Levi already accepted.

The committed handoff message identifies world, actor, transfer, destination
address and ownership epoch. Destination authentication returns a baseline with
that identity, region-local revision/time, stable direct stream, last processed
input and the pose/geometry used for replay. Accept it only for the expected
transfer; late source frames cannot reset it. Region clocks and revisions remain
local, with explicit presentation anchors rather than a global tick sequence.
Carry elapsed/remaining durations and rebase supported actor timing against the
destination clock; do not copy a source-local future timestamp and interpret it
as destination time. Transfer itself grants no free movement, food or needs tick.

**Exit:** two actual DOs, two distinct player grants, a useful round trip, lasting
changes and the same finite goods. Lost acknowledgment/restart during transfer
must not lose or duplicate actors, lots or effects. Repeated travel retires cold
working state and restores edited data without regenerating free supplies.
Report resident pages, WASM high-water memory, queue size, update/commit time,
sent bytes and input-to-visible delay on that fixture. A long coordinate range
alone does not establish large-world capacity.

### Checkpoint 3 — upstairs, fire and a reason to ventilate

Restore earned construction and rooted floor spans on the same geometry. Show
three usable levels, four-way stairs and shared layer/picking controls. Fuel a
hearth in an enclosure, watch smoke accumulate, open a door/upper vent and clear
it. A wet cut can affect a lower passage. Removal/build completion changes
collision, free space, water and air together. Use coarse native parcels and
actual openings, not a CFD or generated-room viewer substituted for play.

This follows checkpoint 1 and may proceed independently of checkpoint 2's
network work once geometry is pinned. Publish the wet clearing before the whole
building is ready. Crop care/needs/waste subsequently deepen that same home.
Automatic roof collapse remains deferred; direct-wall-only floor support does
not return. The sprint does not promise all future ecology at once.

### Follow-on gameplay: breach the fort, then sail a loaded ship

The RTS grows on the existing Formations page. March, supply the cannon from
finite stock, break a defended wall and move through to capture a supply point.
Cannon and digging use the same native integrity/removal operation; cover,
routes and environmental geometry see the same breach. Keep a close battle
under one physical commitment initially. Add an actual opposing force/objective;
deeper morale, cavalry, campaign logistics and tower defense follow as consumers.

This is the crowded-region test: freeze moving troops, changing orders/routes,
firing and impacts, then increase the workload in recorded steps. Separate
native, TypeScript, commitment, networking and client costs. A huge battle can
be created by two players, so crowding is not automatically evidence of many
customers. Deterministic assignment/routes remain eligible for workers/threads;
qualify one split if it benefits this workload after transport and stale-work
costs. Do not build automatic parallel placement before measuring a need.

Pirates reuses traveler transfer with a larger explicit closure: ship, supported
crew, owned containers/lots and controlled inputs. Deck-local poses and stable
IDs survive arrival; hull and sailors cannot transfer as unrelated free walkers.
Deliver a finite cargo order between two harbors. Wakes remain presentation
until buoyancy/current forces are explicitly implemented. Ship cannon combat
then consumes the same projectile/material rules.

### Seam scope and moving a busy region to a larger host

Actor/cargo transfer does not prove every cross-region interaction. Keep the
first wet catchment/enclosure and close battle inside their owners. Before a
river or projectile crosses ownership, qualify bounded edge exchange with
durable receipts. Pressure, heat and contacts are not inferred from the actor
protocol. Never silently turn a seam into an infinite sink or an invisible
wall and call physics complete. Keep any unqualified test boundary explicit.

Levi's escape hatch is sound: **one logical region can later run on a larger
container/native host.** World identity, content and engine operations must not
depend on its DO address. The first alternate host should run the same Rust/WASM
and TypeScript pack and import canonical records, pending work, receipts, clocks
and RNG. It need not simultaneously introduce native threads or different rules.

Begin with operator-directed pause/checkpoint/stage/cutover/resume. Drain admitted
work, durably fence the old owner, publish a new ownership epoch and activate the
prepared target. A higher integer alone is not fencing: restarted DOs, alarms
and outstanding worker proposals must be unable to commit after relinquishment.
If that cannot be established, do not start a competing owner. Retry identity
survives and clients reconnect to the same world. Same-owner crash recovery,
actor transfer and whole-region relocation share record contracts but remain
distinct operations. Container qualification remains unfinished and outside this
sprint; automatic migration is not needed to ship a two-owner world.

No global tick barrier, universal scheduler, per-cell RPC or DO-per-art-chunk
scheme follows. Celld remains the accepted cheap target; use actual workloads
to decide placement and limits rather than reopening tick-price research.

### Work and feedback discipline

On resumption, at most three bounded native helper outcomes: one coupled native
geometry/environment writer, one shared host/travel owner, one game/presentation
consumer owner away from those files. King owns public contracts, hard coupling
decisions, numerical/source acceptance, original art and serial integration.
Mechanical implementation uses Luna. Explicitly sequence shared `world.rs`,
contracts, remote input and client files; different game names do not create
independent source ownership. Keep the held water source and current Sessions.

Each owner delivers a complete chunk through corrections; review pinned first
shapes while independent work continues. Reuse the client gestures, Caps,
original bake/atlas, effects and audio. Every playable checkpoint returns its
page/action, durable evidence, measured workload and next missing behavior.
Use affected laws and one bounded changed-consumer check, retain existing useful
demos, and get Levi's playtest before expanding the next chunk. No honest date
or million-player capacity claim follows from a source plan.

## Environmental implementation reference

[King's Rust water/gas design](WATER-AND-GAS.md) now owns the detailed proposed
shape, including native generation and layered groundwater. Levi asked to discuss
it before more implementation. Source checkpoints stay preserved; no new writer
scope, qualification or deployment follows from the draft. The subsequent
[implementation decisions](ENVIRONMENT-IMPLEMENTATION.md) resolve the difficult
ownership/coupling choices and give a concrete order: resident host, generated
wet colony, multi-level ventilation, common effects/vessels, ecology/care.
Native destructible materials reuse the same physical-change owner; a cannon
breach and excavation must affect the same collision/water/air geometry. Roof
collapse remains later. Bounded memory/residency is an acceptance requirement,
not an already-proved large-world capability.

## First shared slice published

Source c5138fc is live on the existing four demo pages. King authored/reviewed
Mosswake's bow/sail/stern, shared cargo props and goblin wardrobes. The common
client now shows inventory-driven carrying poses, distance-based dust and wakes.
The 1774-frame original static bank uses four atlas pages. This is original
builder composition, not imported art or new live-model baking.

Frontend deployment `3e753ec3-17bf-431d-ba32-801f8a15fd09`; DO version
`c2018e71-f360-4cbe-8127-1f8293f9426e`. All 33 engine files match hosted bytes.
Actual remote colony observation witnessed pantry → worker → guest ownership,
with one bread delivered and five retained at source; test world paused after.
Runtime implementation hash
`e9633431b5e97be656566bb6ab42632129084f0fed1c8b87aee5f545231e0e11`.

Evidence is `.botanical/demo-polish`: 17 affected laws passed; an authored-test
EntityId type error was corrected and strict app/host types then passed. u5329
export/build passed, u5333 actual ship/colony input and 390 containment passed.
King viewed the contact sheet, ship, carrying and narrow captures. A subsequent
wake depth correction puts ground effects beneath subjects; final build u5335
passed. Its screenshot-only check u5337 timed out before the sailing action,
retained the rendered initial page in failure.png (personally viewed), and closed.
Do not call that corrected wake capture a pass; no further browser loop followed.
u5340 publication/readback/remote-custody passed. All owned scopes ended and
5187/5198 listeners were released. No new Fallow acceptance is claimed.

Building, excavation, environmental stocks and the shared synth API are still
next work, not implied by this visual release. Current initial snapshots stay
versioned; use the visible New server world action if an older demo identity is
reported unsupported. Prior cannon deployment 8d8b66a1 and DO 079d18c7 remain
recorded rollback versions. Private source recovery remains the existing
`recovery/hive-public-do-20260910T1533Z` branch in Botanical-next.

## What exists and what can actually be reused

Read against fresh source df7f2a7 plus the retained source in this same repository.
The original models, bake/export pipeline, picking silhouettes, construction
profiles, crop art, control gestures, numerical laws and research are retained.
The fresh engine already owns Rust movement, moving supports, finite lots and
containers, transfers, assignment, collisions and projectiles, composed through
TypeScript systems and the common browser/DO session and transaction owner.
Its colony currently has two workers delivering finite food. It does not yet
have terrain edits, a construction lifecycle or water/soil stocks.

Reference owners to read before each port:

- `src/construction.js`, `src/structure-support.js`, `src/vertical-play.test.js`:
  footprints, rooted columns, spans, stairs and multiple levels. Preserve the
  accepted spacing law: a floor need not have a wall directly beneath every cell.
- `src/excavation.ts`, `src/terrain-removals.ts`, `src/world-presets/goblin-terrain.ts`:
  generated terrain, reachable exposed faces, work positions and physical yields.
- `src/engine/environment/soil`, `src/engine/environment/water`,
  `src/field-water.ts`, `src/field-water-source.ts`: finite stocks, saturation,
  connected flows and paired withdrawal/return. Prefer the final game-scale
  owners, not abandoned numerical experiments.
- `src/engine/materials/owner.ts`, `src/engine/work/owner.ts`,
  `src/water-delivery.ts`, `src/herbs.ts`: unique custody, portions, interruptions,
  crop establishment and process outcomes.
- `src/art/figures.js`, `src/art.js`, `src/art/static-pack.js`: original workers,
  carrying/pickup/drop/work poses, building/terrain art and maintained static bake.
- Fresh `engine/src/sdk/delivery.ts`, `sdk/common.ts`, `runtime/session.ts`,
  `runtime/region-program.ts`, `kernel/src/world.rs`, `kernel/src/navigation.rs`:
  current physical, work, rollback and command owners that the new callers use.

Retained source supplies proven rules and assets; its old Clearing object is not
another live simulator to embed. Rust remains the owner of physical geometry,
location and transfer. Levi reaffirmed on September 11 that making water and gas
performant is a central reason for the Rust rewrite. Port the retained simplified
finite-water and room/opening atmosphere mechanisms into the native owner;
TypeScript supplies content parameters, rules and presentation, not a second
environmental tick. Do not revive the abandoned Richards/Newton or CFD work.
Environmental quantities must live
in the committed session, never in a render projection or module-global map.
Rebuildable indexes are allowed. Every new mutation must survive retry and DO
restart through the existing region commitment, not a parallel database.

## Colony: the same homestead becomes more capable

1. **Recognizable workers and honest work.** Restore original carrying poses from
   actual lot custody, replace placeholder shelves with appropriate storage art,
   and keep shared delivery for both colony and ship. Pickup/drop clips follow
   confirmed transfers; clip completion never settles goods. This is the current
   presentation chunk, not completion of the homestead port.
2. **A place to build.** Bring one generated integer-height clearing into the
   common terrain/geometry query. Place and earn a wall, door, floor and stairs
   through the same finite materials and job owner. Restore shared layer controls,
   visible drag selections and correct picking. A second upper floor must be
   supported by the representation from day one; demonstrate a three-level
   structure, not a special Ground/Upper boolean. Keep one physical-layer meaning
   for floor/roof surfaces. Collapse remains later, unsupported placement remains
   explicit. Preserve plans for deep caves and four stair orientations.
3. **A useful wet excavation.** Dig a reachable pit or ditch in that same world.
   Expose finite soil saturation and visible water, with spoil in a real lot.
   Remove terrain and settle pore water/material effects atomically. Opening a
   wet cell can fill a pit; dry ground has finite pore capacity and cannot absorb
   forever. Real-world rendered actions, no separate numerical showcase.
4. **Grow and use something.** Divert or carry finite water into a planted bed;
   establish a crop, grow it, harvest into shared storage and use it in a recipe.
   Keep moisture, fertility and species response separate; waterlogging is not
   universally better than moderate moisture. Additional crops/buildings normally
   add definitions and assets, not another haul/executor implementation.
5. **A functioning little inn.** Reuse common needs for workers and guests:
   hunger, thirst, fatigue, cleanliness and later relationships. Food, sleep and
   hospitality use the same items, jobs, reachable use-surfaces and saved effects.
   Brewing is a consumer of recipes/processes, not a replacement work engine.

The end-to-end player story is make a home → dig/direct water → grow ingredients
→ produce useful goods → host someone. Each step leaves a playable colony for
Levi to judge. Hidden cells remain hidden until discovered; cutaway and debug
inspection must not leak gameplay knowledge. No arbitrary one-level envelope.

## Other games and presentation

Preserve Survival's accepted continuous movement, prediction and retained facing.
Give it a distinct traveler, readable supplies, footsteps and later actual
pickup/use clips. Keep cosmetic contact clocks separate from network authority.

Pirates gets an original shaped hull, readable sail/rigging, actual chest/barrel
props, sailor wardrobe and a wake. Preserve the current moving deck bounds and
ship/crew controls; visual overhang is not new walkable deck. Then deepen sailing,
cargo and combat through common surfaces, lots and projectiles.

Formations retains the accepted cannon arc, recoil/smoke, piercing hits and
roll/embed behavior. Next gameplay choices are formation spacing, targeting,
terrain cover and readable morale; do not manufacture camera shake or a second
projectile path to add excitement. Existing original articulated hit clips are
not full joint-physics ragdolls.

A bounded motion-effect owner uses displayed movement. Stationary deckhands do
not walk because the ship moves; motion discontinuities do not emit long trails.
Effects, audio and carried-item visuals have no simulation mutation capability.
Frames, resets, pause, removal and disposal own their cleanup. Every game should
consume the same client/control/art stack with game-owned visual definitions.

## Tower defense — proposed next game, not a launched fifth writer

Levi liked the cannon/defense idea and asked to preserve it. A goblin inn beside
a winding road is a good first setting. Place a cannon tower, choose a firing
lane, fend off waves and spend earned resources on upgrades. One piercing shot
through a lined-up wave is an existing engine payoff, not a new physics promise.

Shared requirements: automatic targeting over existing spatial/capability
queries; attack cadence; target policies; authoritative projectiles/damage;
finite purchase/upgrade cost; wave schedules with durable occurrence identity;
path arrival and base damage; shared placement/selection/feedback. The same
attack controller must work for an RTS guard and a stationary tower.

```ts
// Illustrative composition, not an implemented new public API.
const defense = compose(
  terrainAndRoutes(roadDefinition),
  finiteResources(startingStock),
  weapons(cannonDefinition),
  targetPolicies({ cannon: nearestReachableEnemy }),
  scheduledWaves(waveDefinitions),
  defeatOnArrival(innDefinition),
);
// Each scheduled occurrence selects one durable ID. Its spawn/cost/result commit
// together; restart never creates the same wave or charges an upgrade twice.
```

Start with fixed paths. Player-built mazes require route preservation/replanning
at accepted placement/removal, so they follow the basic defense loop. Test busy
waves and changing routes with real moving enemies before any population claim.
This proposal adds no new host, timer service, inheritance tree or game loop.

## Sound recipes, not hard-coded sound branches

The published `client/audio.js` uses the original cannon oscillator envelopes.
The local named recipe owner with ZzFX is qualified at `072e1d5`, as recorded in
the source checkpoint below; it is not yet the public audio release. Preserve
the cannon timbre Levi likes: reusable envelopes, tone/noise sources,
bounded voice count, gain/mute, user-gesture unlock and disposal. Game effects
choose recipe names; audio cannot issue commands or charge resources.

```ts
// Proposed caller shape; sound assets are presentation definitions.
const sounds = defineSounds({
  cannon: { source: 'sine', pitch: [82, 42], duration: 0.45, gain: 0.16 },
  footOnDirt: { source: 'noise', duration: 0.065, gain: 0.025 },
  waterLap: { source: 'noise', duration: 0.3, lowpass: 600, gain: 0.025 },
});
audio.play(sounds.cannon, { at: displayedMuzzle, strength: 1 });
```

Checked upstream options on September 11:
[ZzFX](https://github.com/KilledByAPixel/ZzFX) is an MIT game-sound generator and
is the smaller candidate for richer procedural effects;
[Tone.js](https://tonejs.github.io/) targets interactive music and offers synths
and scheduling. Levi approved ZzFX on September 11. Its isolated source outcome
is integrated and the actual package sample/lifecycle tests passed; the original
tone recipes remain. Do not install a full
music framework merely to play footsteps, and do not invent a new DSP project.
Use named parameters around any positional generator interface. Music, ambient
loops, recording/export and an audio editor are later needs.

## Delivery and acceptance

King owns original art, numerical/module design and integration. Native helpers
own bounded shared-source outcomes in isolated worktrees; independent review
reads the exact pinned source. First-shape corrections are normal, not permission
gates. Shared motion, custody presentation and the original art pass are published.
ZzFX is locally integrated; the native finite-water draft is held during the
current design discussion. The sprint at the top owns the next proposed work.
King retains native integration and colony acceptance; preserve the water
helper's isolated compiled stock/face module. Environmental work is not hidden
inside a cosmetic commit.

For every release: name the action the player can perform, the common owner it
uses, and the remaining gap. Use affected laws plus one short changed-game input
and personal art inspection. Preserve the fast feedback loop; do not repeat old
physics/browser matrices. No general capacity or port-complete claim follows
from a pretty model or headless test. Keep source privately recoverable and use
existing demo hosts for accepted runnable slices.

## Current native colony port — September 11

The first source chunk compiles finite cell capacities, soil retention and actual
neighbor faces once, then advances dense Rust stocks conservatively. It must not
reparse definitions, rebuild a graph or traverse all game entities each water
step. Canonical stocks and the source/sink ledger belong in the existing kernel
snapshot and committed Region result; compiled indexes are disposable caches.

The first playable join remains the existing colony page: real integer terrain,
a finite wet area and reachable excavation that changes its physical geometry.
An isolated native module is a source checkpoint, not completion of this consumer.
Transport parity is qualified explicitly: local infiltration/gravity/spreading
first; communicating-vessel pressure paths and edit displacement cannot be
claimed until their retained laws and real geometry callers join. No painted
water layer may stand in for those physical effects.

Gas follows the retained `environment/atmosphere` parcel/opening model, with
finite smoke and heat from paid burning, rather than a fluid velocity solver.
Generated construction geometry is its input. Multi-storey rooms, caves and
vertical openings remain part of the contract, not a Ground/Upper special case.

Acceptance compares a named busy native field against the same retained workload
and separately measures session/serialization cost. Rust alone is no speedup
claim. The useful outcome is responsive digging/building with water and smoke
in the colony, using the same browser/DO physical owner.

### Integration cost found during the first source read

`GameSession.step()` currently calls `save()` before every step; that calls
`KernelPort.snapshot()` and serializes the whole native world through JSON.
`Kernel.advance_json()` additionally snapshots for active direct/projectile
work. Adding large environmental arrays to those existing snapshots unchanged
would create repeated full-field serialization even if transport itself is fast.
Before accepting the colony environmental join, separate the in-process rollback
checkpoint from the durable serialization operation. A bounded native candidate
or checkpoint must preserve failed-step rollback without making JSON the tick
working representation. Durable Region/save exports still include all canonical
water and gas state. This is a measured-workload target, not a landed optimization
or permission to omit environmental state from saves.

### First source checkpoint

Shared ZzFX integration is local at `072e1d5`, with the original cannon tone
recipes preserved. Root's actual-package sample/lifecycle tests passed 3/3 in
u5344; scope inactive/dead/empty. A first sample assertion only checked nonzero
and missed NaN; independent review found the missing upstream volume binding,
which was corrected and the test now requires finite samples. No new sound
deployment or listening acceptance is implied. Ordinary npm install encountered
the existing optional React/keymap peer conflict; the retained legacy-peer install
added only ZzFX and did not change the joined lockfile.

Native water corrected draft `86bc35e` is preserved in `native-water`, not yet
integrated, compiled or qualified. The same writer addressed root's admission,
representability, compact identity, scratch reuse and test corrections; the
planning hold preserves that checkpoint. All-face scanning remains
explicit; active-frontier performance is not yet implemented. The gas source
trace is retained in `.botanical/native-environment/gas-port-readiness.md`.
The next acceptance is the corrected native water owner followed by the shared
rollback/geometry/colony join, not a new standalone fluid demo.

### Immediate wet-dig gameplay join — September 11 source decision

The material definition now supplies excavation work cost and finite spoil yield.
Native completion derives both yield and carried pore water; the client cannot
choose an output quantity. The next join must expose earned work, not expose the
private completion helper as a free player action.

Use one actor occupation decision for delivery and digging. The current
`engine/src/sdk/delivery.ts` only excludes actors held by delivery tasks; a separate
dig assignment loop would therefore double-book workers. Extend this existing
assignment/occupation boundary before the Colony enables both jobs. Delivery
remains the shared consumer used by Colony and Pirates.

The intended native work contract is:

```text
player command: designate target (intent only)
authoritative work system: choose an available actor and route to reachable contact
native tick:
  validate actor/contact/target and consume at most this tick's work allowance
  accumulate saved progress once per actor, never once per submitted action
  when material-defined cost is earned:
    prepare terrain + displaced pore-water + finite output together
    if output cannot fit: retain earned progress, leave the cell intact
    otherwise commit all three and settle that target once
shared delivery: carry resulting real lot using ordinary transfer
client: display committed work, terrain and water; animate without granting work
```

Progress must be canonical and restored, scoped to the target's expected material,
and cleared or rejected when that target has changed. Repeated actions in one
batch cannot multiply the available time. Paused intent changes earn no work.
A full container blocks that job rather than cancelling unrelated jobs or ticks.
Public Colony now has Rust-generated terrain and rectangular wet digging
(runtime 6080e4e), including approach, finite spoil and ordinary unloading. The
construction/supply continuation is source-only: native staged construction and
shared work assignment are under qualification. It is not yet a playable
three-level building or the complete production-job system. Rust room smoke
remains an unfinished join. Preserve these distinctions when reporting progress.

### Standing production jobs — Levi clarification, September 11

The player orders a result such as “brew a batch,” not every transport and
processing step. The same shared work owner must discover ready tasks, assign
available capable workers, and resume blocked work. Timed excavation is one
physical operation, not the complete job system.

Retained `src/recipes.ts` expresses ingredients and outputs as data but hardcodes
prepare/ferment/keg/tap timings; `src/brewing.ts` owns brew-specific phases. Reuse
the physical requirements and conservation rules, not another brew-only executor.
Represent a process as validated dependency steps using supported operations:
ensure finite inputs at endpoints, perform worker effort, wait for world conditions
or time, transform finite materials, and deliver outputs. A recipe selects and
connects these operations. Rust owns physical mutation and earned work; TypeScript
authors the recipe and policies.

Required behavior before claiming the job system complete:
- One standing order creates a bounded batch; repeat/stock-target policies create
  further batches only after accounting for existing work and output.
- Only ready steps compete in one shared worker assignment. Preparation of
  independent ingredients can overlap; dependent steps cannot start early.
- Missing inputs or full output storage retain the process and display the reason.
  Retrying checks readiness; it does not reserve or consume the same goods twice.
- Waiting for fermentation occupies the vessel as needed, not the worker. An
  interrupted labor step preserves earned effort and releases the worker safely.
- Inputs are claimed and consumed through the existing material owner at explicit
  transition boundaries. Cargo already picked up retains real custody on cancel.
- Cancellation stops future work without undoing physical transformations; partial
  products and waste remain real goods. Output creation and step completion commit
  together, and recovery cannot repeat them.
- Workers may change between steps. Skills and permissions determine eligibility;
  task state cannot grant skills or bypass reach/capacity.

Qualify the same owner with delivery, excavation and a small multistep recipe
that includes passive waiting and a blocked output. Do not claim generic production
from the assignment helper alone. This is a gameplay requirement for the current
work design, not permission to defer wet digging behind a full brewing port.

### Terrain movement join — September 11

The generated world remains Rust-owned. Exterior surface observations are a
rendering projection, never the navigation map: a cave route must query the
actual solid/open cells at its own depth. Current published demos remain on the
previous runtime while this join is implemented.

The shared traversal node identifies the solid support voxel. Its foot position
is `(x * spacingX, (y + 0.5) * spacingY, z * spacingZ)`. Do not round world metres
to voxel rows. Clearance and maximum step height are explicit traversal inputs;
the first walking profile admits cardinal moves and one-voxel steps. Both ends
need support, and the swept head space must be open. Ordinary deck-local routes
continue to use their support frame; ship decks do not query world soil using
local coordinates. Body dimensions and sailing are not silently inferred from
sprite art.

One shared edge rule must serve route search, saved-route validation, and
invalidation after excavation. The existing bounded search remains the path
owner. A saved position partway along an edge must be validated against that
edge, not snapped to the nearest voxel. Dig completion must invalidate affected
travel before further movement; a worker cannot finish walking across newly
removed support. Actual fall/settling behavior needs an explicit rule as part of
that join, rather than leaving an actor suspended. No full-world terrain scan or
per-tick save snapshot is required to establish these laws.

Current source progress: host terrain transport and signed-height top picking
are integrated locally. Checks u5509 (three transport/projection laws and strict
types) and u5512 (three shared picking laws) passed and owned scopes closed.
Neither establishes terrain navigation, cliff-face picking, remembered
underground knowledge, rendered appearance, or a new hosted Colony release.

### Declarative world interaction — Levi clarification, September 11

Levi means the world interaction system, not merely the HUD. Drawn geometry,
picking and tool applicability must compose from shared capabilities. The current
terrain face producer is shared by the original bake and ray picking; extend
that same boundary for actual inspect/dig/selection consumers. A displayed side
face does not prove the material hidden behind it or grant excavation permission.
Return a visible geometric hit and its provenance, then let the active tool
resolve an admitted game command. Preserve XState gesture ownership, shared
selection/hotkey behavior, and native physical admission. Do not introduce a
second simulation or arbitrary callback code in saved definitions.

HUD decomposition alone does not meet this requirement. Ordinary typed
TypeScript definitions and shared operations should express supported targets
and tools; reuse original asset geometry instead of writing separate coordinate
formulas for every new object. Keep work on the playable terrain connection
moving while this boundary is deepened through those real consumers.

### Restore route-aware joint work assignment — September 11

Levi reaffirmed retained A* with climbing costs and asked whether joint work
assignment still consumes those costs. Source audit found a real gap:
`engine/src/sdk/delivery.ts` supplies straight-line actor-to-source distance to
`allocateWork`, although the Rust matcher already accepts costs and preserves
maximum-cardinality/minimum-cost assignment. The Rust implementation is an
augmenting-path matcher, not a literal Hungarian implementation. This does not
excuse discarding the retained movement-cost behavior.

The current native route preparation must return cost without publishing a
route. A bounded cost query uses that same preparation, geometry revision,
actor capability and support frame. It must distinguish unreachable from budget
exhaustion/internal errors. Exclude unreachable pairs; defer uncomputed work
when the bounded query budget is exhausted. Never substitute straight-line
costs for failed route queries or run an unbounded worker-by-job route matrix.
Narrow by capability, claim, material and capacity before routing. Existing
claims, including carried lots and paused work, retain ownership.

Delivery must account for its actual source approach and delivery leg using the
same reachable interaction positions it later visits. Travel cost must reflect
actor speed and admitted vertical motion; do not supply voxel steps to a matcher
while movement measures metres. Authored priority/work duration may modify the
final candidate score using the existing cost policy, without inventing a second
pathfinder. Route estimates grant no resource claim or perpetual permission.

Acceptance includes a worker who is geometrically nearer but has a costly
obstacle/climb route losing to the actually faster worker, an unreachable pair
being omitted, and a claimed worker remaining assigned. This remains a required
caller correction, not a completed feature or new deployed behavior.

Levi's retained-fix requirement: impossible work must never reach distance or
route evaluation. Verify this with an instrumented estimator, not merely an
empty matcher result. The shared allocator now filters saved actor/task claims
before invoking its estimator (a6175f6). Delivery eligibility must additionally
check enabled movement capability, requested quantity, source lot custody/kind,
and actor/destination capacity before constructing a cost request. Aggregate
canonical lot occupancy once per assignment pass; do not rescan all lots for
each worker/task pair. These are cheap eligibility checks, not reservations:
native transfer admission still checks current custody and capacity at execution.

The next accepted terrain movement packet must prove actual mid-climb recovery,
rejection of forged remaining waypoints, retained blocked intent, multi-segment
tick progress, and failed replacement leaving the previous route intact. Cell
witnesses and metre waypoints cannot be independent saved truths. Validate their
correspondence using the same route geometry producer. Keep fixed-width route
costs consistent across native and WASM targets. Source-only checkpoint d62ef54
has not yet met these laws and is not part of the playable release.

### Initial Colony placement on generated terrain

Current Colony still declares actors and pantry at y=0 and does not enable its
prepared environment. Do not enable that environment until native placement and
walking are joined: rendering a hill underneath an actor is not placement.

Use an explicit initial surface-placement list in environment authoring, with
entity IDs and signed generator columns. This is initialization configuration,
not a permanent ECS capability that repeatedly forces an entity onto the surface.
Both walking bodies and the static pantry use it. Resolve each column through
the existing Rust `surface_cells` owner and convert the returned support cell
to metres with the environment metric. No seed-specific y=13, TypeScript noise,
water-cell-derived height, or restore-time regrounding.

The existing scene loads valid authored positions before `load_environment`.
Initial placement replaces those positions only in a detached fresh candidate;
validate all IDs, distinct placement targets, bounds, support/clearance and
physical indexes before publishing environment and poses together. Reject an
invalid placement without leaving a partially installed environment. Moving
surfaces and entities with active routes are not eligible for this initial
placement operation. Restore retains saved positions and edited terrain and
does not replay placement. Test a static container as well as an actor, varied
generated heights, failed admission leaving the original scene intact, and
recovery after movement/excavation. This boundary is the next native join after
the current route correction, not a second concurrent kernel writer.
