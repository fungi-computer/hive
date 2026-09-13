# Sprint: bring the Clearing back to life

King Bolete · September 12, 2026 · **active Colony delivery plan**

## The outcome

**Levi and a friend play together in a beautiful little goblin clearing. They
select people, designate digging, build a home and cellar, move real supplies,
encounter groundwater, and see people visibly doing their work.** The result is
an enjoyable public demo and a genuine 30–60 second clip with a playable link.

The engine supports that experience. Its abstractions, benchmarks, saved records
and other demos are not the product finish line. Restore the retained Clearing's
quality over the Rust/DO implementation; do not start another game or rewrite.
Engineering quality follows the **current Botanical-next Field Guide and current
Botanical implementations**, not the original Clearing's internal code. The
Clearing supplies gameplay, control and art references. Before accepting a changed
seam, apply Botanical's software-shape, ownership-and-seams, testing-and-gates and
anti-slop rules from `/home/levi/src/Botanical-next/wiki/3-resources/field-guide/`:
one decision owner, typed boundary outcomes, maintained parsing primitives,
bounded recovery, removal of superseded mechanisms and proof through real callers.
King personally owns that comparison and every nonmechanical design decision.
The two screenshots Levi supplied on September 12 are the direct visual comparison:
the original clearing with varied grass, paths, trees, Rowan, Sedge and the cat
versus the current sparse Colony with generic actors and flat-colored terrain.

This document supersedes the active sequencing in DESIGN.md, DEMO-ROADMAP.md and
the architecture-proof sprint. Those retain technical contracts and historical
receipts. MULTIPLAYER-STREAM-CONSOLIDATION.md supplies supporting connection detail;
this document owns priority. Earlier versions of this file preserve the two-day
velocity assessment and wider forecast in Git at b508d6e. The 5–8 day feature
forecast is **not a gate before the next playable repair**.

## Whole-clearing environment requirement — Levi, September 12

This is the current required outcome, not an optional future extension. Levi has
repeatedly asked for ordinary play throughout the actual 64×64 clearing, across
its complete [-32,40) vertical range. The central5×5 water box and central16×16
smoke box are incomplete fixture configuration, not acceptable gameplay borders.
Do not call environment work complete because a small isolated fixture passes.

- Keep the generated large caves. Levi explicitly rejected shrinking or removing
  caves to conceal presentation failures. Improve the actual opening's rock edges,
  depth shading and layer information; do not invent a floor. Lighting/discovery
  must not reveal hidden creatures or claim exploration from a cosmetic effect.
- Smoke uses the already-landed sparse local smoke/heat owner throughout the
  clearing. Derive its spatial extent from the same authored world bounds. Keep
  bounded local spreading and explicit accounting; do not restore pressure,
  whole-cave discovery or mandatory processing of empty space.
- Water must exist outside the starter box and at deep excavations. Keep finite
  groundwater, finite soil capacity, saturation, seepage and carried-water custody.
  Untouched generated ground is a cheap initial stock proposal, not a continuously
  running water solver and never a refill command. Once admitted or depleted, its
  persisted stock takes precedence, including zero after reload.
- Separate supported world extent from active environmental work. Work queues may
  defer spreading without deleting water/smoke or blocking unrelated people. They
  must not impose a secret spatial boundary where the same action stops working.
- Root personally owns the groundwater admission/storage/activation change and
  conservation review. Luna implements only specified mechanical callers in an
  isolated root. Keep the native terrain, water and compound completion owners;
  no new game engine, parallel water owner or different research demo.

### Discrete open-water contract — September 12

The authoritative terrain field stores open water as an integer depth level from
0 through 7. Open mass and liquid volume are derived from `level * cellCapacity /
7`; porous moisture remains finite and fractional. Each local step gives an
open interface one whole level at most, with downward transfer processed before
lateral spreading; a successful downward move suppresses lateral moves from
that source for the step. Open/porous exchange also moves only one conserved
open-level quantum. Current terrain-water records use format 2 and reject the
former fractional format, while explicit drained level-0 records remain dry
after reload.

The next joined proof must perform earned digging outside x/z[-2,2], encounter
real water, and exercise smoke outside x/z[-8,8] plus a below-ground opening. It
must retain water through current-format reload and show the same behavior in the
actual Colony. Run cost evidence against the existing fixed workload/budgets, not
only the old starter patch. Whole-clearing source, native proof, actual gameplay,
public deployment and sustained two-client acceptance remain distinct claims.

Implementation facts at46ba067: finite water compiles a fixed authored list and
scans its faces on each update; multiplying that list over the whole volume is
not the chosen repair. Gas is already sparse but still clones/validates its active
stock map. That cost remains measurable work, not covered by the256-cell spread
budget. No capacity promise is established by widening configuration alone.

### Actual whole-clearing source checkpoint

The current native correction makes point queries sample one generated cell on a
cold miss, with a bounded8192-entry FIFO cache of immutable samples. Explicit page
projection still owns full-page generation. Sparse edits remain the first lookup;
caches are unsaved and cleared on restore. This removes4096-cell page generation
from a single uncached gas-contact query without changing generated terrain.

The native full-extent smoke law uses the actual Colony seed, identity, sea level,
metric and bounds: sources near four corners plus the generated central cave,
zero processed gas cells while clean, the256-cell update bound,20 simulated
seconds and exact next-step restore. Root's first two runs u6286/u6287 failed the
cave precondition because the test inherited a different sea level/identity; both
logs remain. Corrected precondition u6288 progressed but was still CPU-active after
one minute; root stopped only that owned scope with exit143. Source inspection
found whole-page work on each point cache miss. After the query correction,
u6291 passes this law in1.27s in the debug native runner, plus cold-point/edit/
restore and existing point/page parity laws. All scopes are inactive/dead/empty.
This is not a WASM/DO/browser capacity result or a full gameplay workload claim.

Luna's9b95dbb/559cee0 repairs cutaway water visibility for already-published open
columns (9world-view laws, actual touched Fallow pass; inherited findings retained).
Luna d90ebfb derives the Colony smoke bounds from the single world-bounds definition
(new consumer law, strict types and actual touched Fallow pass). Root reviewed
both callers. Joined u6294 passes all3 authored Colony consumer laws and strict
engine types after correcting the stale expected hearth/lumber placement list.
The joined touched Fallow audit u6293 passes with zero introduced findings;
8 inherited dead-code and1 inherited client-cache complexity finding remain.
Fallow does not establish Rust performance or replace the native laws. The source
was not deployed at that checkpoint; the groundwater landing below supersedes that availability.

## Groundwater landing — September 12

**Live:** [Colony](https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony.html).
Accepted runtime integration75da7f0 (writerbcf211d); frontend deployment
7c24ec1a-ac91-4f37-a873-92ebfb87eaa4; DO Worker version
3c7bd847-e064-47e7-a95b-b3ebce79ba31. The ordinary publication u6308 passed,
and u6309 matched all158 served files to the accepted build. Package u6306
passed; the actual area-dig WASM witnesses at x=1 and x=9 each completed in
about1.2seconds of local test wall time, not a server capacity estimate.
No new browser or sustained two-client proof is claimed. Prior live158-file
archive and Worker65a67106 remain preserved for rollback. Private backup
`recovery/hive-clearing-repair-20260912` was verified at75da7f0 before this receipt.

The game now uses `terrain_water/field.rs` as its finite local water owner instead
of the fixed-coordinate compiled graph. Original geology supplies virgin porous
stock once, throughout the authored world bounds; changed and exhausted cells
retain explicit saved values. Natural caves start dry and receive seepage through
physical neighbors rather than becoming full lakes merely from being below a head.
Water falls, spreads, saturates porous material and leaves retained moisture.
Porous-to-porous regional pressure equilibration is intentionally absent. This is
voxel gameplay water, not an aquifer or fluid-dynamics research solver.

Only awake stock records exchange over real unsealed faces. The queue has at most
8192 entries, tied to at most8192 durable stock records. Each quarter-second step
processes at most128 cells; a call runs at most4 steps. Copy-on-write8-cell pages
keep a detached candidate from copying all historical stock records on a tick.
Stable cells sleep without deleting their remaining mass. Reaching the stock
record ceiling leaves a new excavation waiting through the existing typed water
admission result; it cannot throw the entire game tick. The256KiB water record
limit remains enforced. These are declared limits, not a measured player-capacity
claim. The64×64×72 generated extent is separate from active water work.

Excavation credits its exact removed pore water to physical spoil. Terrain,
structure and water candidates still publish through the existing compound native
completion and Region transaction. Environment header3 rejects unsupported old
records; no migration or silent reset was added. Restore validates current geometry,
capacity, pending work, generated initial stock and the water ledger, including
zero. An existing pre-change world requires explicit **New world**; its stored
bytes remain preserved.

Actual Colony proof exposed a pre-existing work-planning defect: A* could reach an
approach that was too far above the voxel to earn excavation effort. The existing
route-cost operation now accepts an excavation target and filters it before path
search using the same native reach predicate as earned work. No second TypeScript
reach radius or pathfinder was introduced. The obsolete worker-target Dig fixture
was replaced with the actual area-designation API and autonomous workers.

Qualification in `.botanical/whole-clearing` and `.botanical/groundwater-release`
retains all intermediate failures. Off-center native seepage/zero/restart laws,
physical floor/rebind laws, current definition/clock and six wet-material laws
pass. The final WASM consumer passes actual stepped area digging at x=1 and x=9,
mid-work restore, finite spoil/water conservation and exact full restore. Strict
engine types and touched Fallow pass. Fallow reports0 introduced findings, with
14 inherited dead-code and4 inherited complexity findings (including existing
`digProvider` and environment definition validation); no suppressions were added.
The completed full-world smoke/point-query/cutaway changes are in the same release
candidate. Full sustained two-client performance and Levi's playtest remain open.

## Retained brew station clean break — September 12

The temporary standalone `colony.hearth` entity and its procedural rectangle/
ellipse fire and smoke presentation are retired. The initial Colony station is
now `colony.brew-station`, bound to the retained original brew-station asset and
therefore remains the physical, selectable station. The native finite
`wood-hearth` emission definition, worker assignment, fuel transfer, paid debit,
and atmosphere owner remain in place; this change does not claim that the full
retained brewing recipe loop has been migrated.

## Retained-system restoration order — September 12

The groundwater playtest is responsive enough to resume feature restoration, but
the foundation is not called finished yet. The claimed-dig route repair above is
source-qualified and still needs one ordinary deployed playtest. A sustained
two-person session and the remaining pickup/drop presentation are also open.
These are bounded closure work; they do not justify another engine rewrite or
another environmental study.

Restore retained behavior in this order:

1. **Brew at the station.** Use the existing station selection and shared
   delivery/work allocation. Recipe definitions remain authored data. A generic
   staged-process owner binds exact material lots and station endpoints, advances
   attended preparation, advances unattended fermentation, and settles kegged
   output through the existing Rust material transaction. Full output waits;
   cancellation, retry and reload cannot consume ingredients twice. The concrete
   first consumer is herbal ale, but neither the process owner nor persistence
   branches on ale, herbs or this station. The detailed owner/caller plan is in
   `RETAINED-BREWING-RESTORATION.md`.
2. **Restore the living clearing.** Bring back the original trees, worn path,
   rocks, mushrooms, cat and pickup/carry/drop transients through the shared asset
   and presentation owners. Decorative scenery stays click-through. A tree only
   becomes selectable/choppable when it has a finite resource and navigation
   definition; visuals cannot invent physical rules.
3. **Make hospitality depend on ordinary needs.** Residents and guests share
   hunger, thirst, rest and comfort mechanisms. Serving food or ale satisfies the
   same need operations used by the player character; there is no one-off
   thirsty-customer state machine. Guest preferences and payment remain Goblin
   definitions over those mechanisms.
4. **Deepen people after the work facts exist.** Skills modify typed work costs
   and outcomes; traits modify declared preferences/needs; relationships consume
   actual shared events. These do not become a second job scheduler or a universal
   entity full of optional flags.

Each step lands as one playable addition in the same Colony. Do not port retained
files wholesale. Read the retained behavior, identify its current Rust/SDK owner,
move the supported rule once, delete the superseded special case, and exercise it
through the real station, worker, material and save callers before starting the
next step.

### ECS correction — September 13

Hive has a real `bevy_ecs::World`, typed native components and retained Bevy
`QueryState`s keyed by component set. That is a sound physical-state foundation.
The current hot game loop does not yet use the foundation well enough: authored
TypeScript systems make many separate `KernelPort.query` calls, and every call
serializes matching ECS rows through JSON/WASM before rebuilding short-lived
JavaScript maps and sets. Bevy currently supplies authoritative storage more than
it supplies hot-loop execution.

Keep TypeScript as the game-authoring surface for definitions, recipes, policies,
commands and unusual game rules. Move a rule into Rust only when it is a shared,
measured hot mechanism with real consumers. Its TypeScript caller supplies
versioned data and receives compact facts or committed results; it does not
coordinate the native rule by repeatedly reading whole component sets. Water and
gas remain sparse native fields rather than entities per voxel.

The first correction is the shared work/material path used by excavation,
construction, trees and stockpiles. Establish native, rebuildable indexes for
container contents, current claims, capable workers and spatial work locality;
then run candidate narrowing, route batching and physical claim/completion against
those owners inside the native transaction. Keep authored priority/filter policy
as data. Preserve the existing deterministic assignment optimizer and stable-ID
ties. Do not port Colony names, recipe IDs or UI state into Rust, and do not add a
second scheduler beside the current work owner.

Acceptance is an actual Colony tick with multiple available jobs and workers:
one bounded native read/operation per phase, no repeated whole-world JSON query
for the same facts, impossible work removed before pathfinding, temporarily
blocked work releasing its actor, and unchanged save/retry/conservation results.
Record query crossings, candidate count, route requests and phase time separately.
This correction precedes adding more hot TypeScript work loops; it does not block
data-only scenery, controls or art restoration.

### Complete retained-to-native migration ledger

This ledger is the required starting point for further Colony work. It prevents
isolated feature ports from repeatedly rediscovering the same job, material,
geometry and presentation seams.

| Play concern | Retained behavioral source | Current native/SDK owner | Current disposition |
| --- | --- | --- | --- |
| People and party | `actors.ts`, `clearing.ts`, `orders.ts` | authored entities, `Body`, `Traversal`, `WorkParticipation`, command admission | Rowan and Sedge exist with original visuals and manual takeover. Party membership, recruitment and the cat are missing. |
| Selection and tools | `ui-actions.ts`, `main.js`, `view.js` | shared client controls, contextual presentation, area selection, layer/cutaway view | Selection, Go, rectangle Dig and layers exist. Restore the retained contextual site/tree/herb/lot actions through the shared catalog rather than adding Colony-only pointer branches. |
| Movement and assignment | `movement.ts`, `matching.ts`, `jobs.ts` | Rust A*, traversal costs and libcolony assignment through the shared work system | Keep the native owners. Finish route invalidation/retry and useful waiting reasons; never port retained pathfinding or assignment as a second truth. |
| Physical goods | `materials.ts`, `item-containers.ts` | Rust `Lot`/`Container`, transfer, carried water, output preparation and indexes | Native custody is stronger. Add missing Goblin material/endpoint definitions; do not port the retained material store. |
| Trees and wood | `world.js`, `orders.ts`, `jobs.ts`, `activity.ts` | generated/content entities, generic finite work, native material output and delivery | Missing. Restore fell/chop/output/haul as the first scenery-backed resource loop, including retained poses and finite wood. |
| Storage | retained lot/container and storage jobs | native containers, delivery tasks and future data-defined stockpile filters | Crates work; floor stock is only a fallback. Restore ordinary stockpile designation/filtering before adding automation. |
| Construction | `construction.js`, `physical-completion.ts`, `construction-view.js` | native construction work, physical geometry, material embedding, support query | Floor and wall mechanisms exist. The current stair bake improperly stretches the retained two-cell ramp to a four-cell vehicle-sized visual; restore the exact retained stair contract and rotate it for four facings before treating stair parity as complete. Restore the retained catalog, site interactions, deconstruction/salvage, bed/shelf/station endpoints and presentation without replacing native completion. |
| Terrain and excavation | retained terrain/digging controls | Rust generator, A*, excavation, material yield, discrete field water | Current implementation supersedes retained physics. Preserve rectangle tools and visual quality; do not port old terrain or water state. |
| Water and vessels | `field-water*`, `water-supply.ts`, `water-delivery.ts`, pail art | Rust discrete field water, `LotWater`, native transfer and containers | Groundwater is live. Restore pail draw/carry/pour and station supply as consumers of the current finite owner. |
| Herbs | `herbs.ts`, herb commands/jobs/activity, art | generic finite work, material output, authored growth/process facts | Missing. Restore sow/grow/water/harvest as data and shared work, producing a real mugwort lot. |
| Brewing | `recipes.ts`, `brewing.ts`, brew jobs/activity | native lots/containers/emissions plus the missing generic staged-process owner | Station and paid fire exist; recipe production does not. Implement one general process owner, then express herbal ale as definitions. |
| Needs and routine | `needs.ts`, `routine.ts`, care jobs/activity | shared component/system/query composition; native material/contact mutations | Missing; the current `Guest { hungry }` placeholder must be deleted when this lands. Residents and guests share hydration, nourishment and rest. |
| Presentation and juice | `art/clearing.js`, `art/figures.js`, `view.js` | shared original asset pack, visual projection, interpolation, cues/effects | Work poses exist; trees/path/cat and pickup/drop transitions are missing. Presentation reads physical facts and never advances work. |
| Environment | retained paid environment and presentation | current sparse gas, discrete water, structure faces and native transaction | Keep the current owners. Brewing, buildings and visuals consume them; no renewed solver experiment. |
| Save, retry and multiplayer | retained snapshots provide semantic examples only | Region transaction/receipts, DO alarm, complete baseline plus changed observations | Current implementation supersedes retained hosting. Every restored loop must survive current-format reload/retry and two-client use. |

### Shared spatial designation and connected-world presentation

Do not restore wall drawing as a wall-only pointer branch. The retained Clearing
proves several real consumers of one spatial interaction mechanism:

- point placement for furniture, stairs, stations and single plants;
- dominant-axis lines for walls, doors, paths and other narrow runs;
- same-level rectangles for Dig, backfill, floors, roofs and stockpile zones; and
- entity brushes/sets for tree and harvest designations.

Extend the existing XState gesture owner and `terrain-area-selection.js` into one
small deterministic spatial-selection module with those four closed shapes. A
tool binding selects a shape, cell bound and semantic argument field. It does not
implement the job, construction, storage or terrain mutation. Screen-space
pointer state, cancellation and provisional preview stay in the client; the
committed value is a compact point/line/rectangle/entity-set supplied to the one
semantic command. Headless controllers supply that same value without a browser.

The authoritative command expands the compact shape with the same pure ordered
cell rules and revalidates current visibility, bounds, terrain and domain policy.
Never trust a client-expanded list as admission. Dig creates durable dig intent;
stockpile designation calls the native stockpile owner; construction calls one
native bounded batch-plan operation. Each batch validates every member before
publishing any member, so a rejected corner cannot leave half a wall or half a
zone. Current worker availability is not part of designation admission.

Structure placement behavior is data on the supported catalog definition:
`point`, `line` or `rectangle`, plus `fixed`, `free-cardinal` or `stroke-axis`
orientation where the physical shape needs it. Timber walls select line plus
stroke-axis, so dragging a horizontal or vertical run derives orientation without
making the player rotate each segment. Stairs and directional furniture retain
explicit four-facing choice. Adding another supported line or area structure is
a definition change over the same gesture and batch owner.

Connected appearance is a separate pure projection from committed neighboring
facts. A definition may name a connection group; the projection derives a stable
north/east/south/west mask and resolves the corresponding original-art joint.
Wall and door adjacency consume it first. This projection may later serve paths
or fences, but it never creates collision, support or construction state. Native
geometry remains authoritative; preview and art masks are rebuildable views.

The retained behavior at `src/construction-view.js:46-90,280-329` and
`src/main.js:675-742` is the behavioral baseline: continuous row preview, valid
and invalid cells, release-to-order, persistent armed tool and automatic neighbor
joints. The current one-click path at `engine/src/client/client.js:859-938` and
single-site command in `engine/src/games/colony-building.ts` are incomplete until
they consume the shared spatial mechanism. Do not retain separate orientation
buttons as the primary wall workflow.

Acceptance is one ordinary interaction sequence in the real Colony: drag a wall
run, drag a floor/roof area, drag a Dig area, paint a stockpile, and brush-select
trees; Escape/right-click cancels each without submitting; changing levels
clears only the active stroke; one release creates one durable command receipt;
invalid members reject the whole batch; the work remains queued with zero free
workers; and two clients observe the same accepted plans and connected previews.

### Parallel supply is demand plus independent haul legs

A construction site, process input or stockpile policy declares material demand;
it does not own a single worker-sized delivery. The current `planSiteSupplies`
violates that split by deriving one task identity per destination/material and
rejecting every other active delivery to the destination. That forces workers to
alternate even when several unclaimed wood lots can satisfy one staircase together.

The shared planner expands one demand into deterministic finite haul legs. Each
leg claims one distinct source lot, quantity and destination, so ordinary assignment
can give different legs to different workers concurrently. Active legs count as
promised incoming quantity before another leg is admitted. Their combined quantity
cannot exceed outstanding demand or destination capacity, and one source lot cannot
appear in two live legs. Completion, cancellation and reload rebuild the same
accounting from canonical demand, material lots and live delivery tasks. A completed
physical transfer remains the native material owner's mutation; the planner never
fabricates or copies stock.

The first implementation uses one haul leg per distinct source lot. Parallel slices
from one large lot require a demonstrated native quantity-reservation owner and are
outside this correction. Construction, stockpiles and brewing consume the same
planner; no stair, recipe or container gets a private delivery loop.

### Playable migration slices

Move the ledger in four vertical slices. Each slice includes commands, automatic
work, physical state, visuals, persistence and two-client observation. A source
module without its playable caller is not a completed port.

1. **Working clearing:** real trees can be designated, felled, cut into finite
   wood and hauled to a designated stockpile. Restore the path, trees, rocks,
   mushrooms, cat, pickup/carry/drop cues and contextual object actions at the
   same time. This proves one complete retained resource loop over the new engine.
2. **A home worth using:** restore the retained building catalog and interaction
   flow over native construction: supported floors/roofs, walls, stairs, bed,
   shelf, brew station, deconstruction and salvage. A goblin can build, traverse,
   use and dismantle the result without stranded work or duplicated material.
3. **One complete brew:** restore pail draw/carry/pour, mugwort
   sow/water/grow/harvest, ingredient storage, staged herbal-ale production,
   fermentation, kegging, serving and spent-grain output. Fire, water and smoke
   remain the current native environmental owners. This is one joined evening of
   play, not separate herb, pail and brewery demos.
4. **People who live there:** replace the hungry-guest placeholder with shared
   hydration, nourishment, rest and comfort; connect bed, food, water and ale;
   then add guest preference/payment and retained routine behavior. Skills,
   traits and relationships follow as definitions over actual work/care/social
   events rather than a second actor simulation.

The first slice starts only after the deployed route correction has been tried in
ordinary play. Subsequent slices may prepare independent assets or definitions in
parallel, but no second writer changes the shared work/material/Colony seam. King
reviews the complete behavior against the retained game before integration.

### Storage policy target

RimWorld's useful model is a painted storage policy, not a one-time haul target.
The references reviewed September 12 are its [stockpile](https://www.rimworldwiki.com/wiki/Stockpile),
[zone/settings](https://rimworldwiki.com/wiki/Area) and
[shelf](https://rimworldwiki.com/wiki/Shelf) documentation. Preserve these
behaviors in Hive's own data-driven form:

- paint, expand and shrink bounded floor cells; zones do not overlap;
- choose a stable priority and move an eligible lot from loose/lower-priority
  storage only when the destination is strictly better;
- use content-owned category filters with per-kind allow/deny rules; later
  property constraints compose quality, condition, freshness/rot,
  contamination, ownership and temperature facts without changing hauling;
- changing a filter or deleting a zone never deletes physical stock; an
  ineligible lot remains visible and becomes ordinary misplaced work;
- floor cells and shelves consume the same settings owner. Shelves vary capacity,
  access and protection, and may link/copy a policy; they do not get a second
  storage language;
- a named policy may become a production output preference, while the physical
  material owner still decides actual custody and capacity.

The first playable increment implements painted cells, material/category rules,
priority and better-storage re-hauling. Do not fabricate quality or freshness
components before a real item consumer needs them. The policy representation must
have a typed extension seam for those facts and must never store an arbitrary
predicate or callback.

## Current interaction restoration — September 12

Levi explicitly requests the retained station-first gameplay: click the hearth,
request its job there, and let available workers carry it out. The flat list of
worker-dependent demo buttons is not the intended loop.

### Whistle is the game client's semantic action runtime

Levi's September 12 clean-break direction is that the Hive client should consume
Botanical's real Whistle package. Hive currently has one authoritative operation
table in `GamePack.commands` and a second UI-only command description in
`GamePresentation.controls`. The latter is temporary and must be removed when
the joined Whistle consumer lands. Do not preserve it with an adapter or add a
third interaction registry.

Each actual game command contributes one Whistle action description. The browser
binds its handler to the existing durable game-command submission path; human
menus, hotkeys and contextual actions and Shiitake's controller projection use
that same identity, argument schema and result schema. Whistle completion means
the handler returned. Hive remains the owner of command admission, authorization,
durable receipts and events, job progress and every physical mutation.

The authoritative region publishes its current Whistle world-action snapshot
through the existing authorized connection and world-observation lifetime.
Humans and headless Shiitake controllers receive the same descriptions, schemas,
availability and unavailable reasons. Initial connection supplies the current
snapshot; later state changes use the existing server publication path rather
than a capability poll, browser-only table or second socket. Hive decides which
principal receives which projection and rechecks fresh admission when an action
returns. Receiving a descriptor is not permission to invoke it. Whistle supplies
the semantic snapshot but owns no network connection, broadcast loop or world
subscription.

Capability availability must not collapse player intent into current worker
eligibility. **Dig**, fell, build and haul-policy commands remain available when
their target and authorization are valid even if no worker is currently free or
can presently reach the work. Admission records the durable designation. The
shared work owner later assigns an eligible worker; otherwise the job remains
unclaimed with an understandable waiting reason and retries only when relevant
facts change. Reachability, skill, tools and current worker availability belong
to job eligibility/status, not to whether the player may designate future work.
Keep player-owned desired policy separate from scheduler-owned claim and progress
state so neither becomes a competing writer of the other.

Client-only commands such as camera motion, opening a panel or cancelling an
unfinished target gesture may contribute to the same local Whistle runtime. They
are visibly client-owned and never appear as server world capabilities. Entity-
or selection-specific hints stay client-side unless the authorized server
projection actually supplies that context.

Selection and targeting remain client/engine mechanisms. Clicking **Dig** arms
the existing rectangle gesture; its completed same-level area is the argument to
the single `colony:dig` action. Build uses the existing visible surface picker.
A stockpile action combines ordinary profile, priority and capacity fields with
an area acquired visually by a human or supplied structurally by a controller.
Hive-owned JSON schemas describe entity IDs, cells and areas. An opaque
schema annotation is not part of the first join: no current consumer needs one.
The browser composes its argument-field, gesture, persistent-tool, preview and
cancel binding into Whistle's local `presentation: { type: "custom", data }` slot
before contributing that same semantic command. Whistle copies the opaque JSON
but implements no Hive gesture. Human menu/palette projections may carry it;
server and agent snapshots omit presentation. Do not place this binding inside
the semantic JSON Schema or expose it as a second command definition.
The client binds each known action and field identity to its existing map
acquisition gesture, while a headless controller supplies the same standard
schema value directly. Add a domain-owned annotation later only when a concrete
generic renderer cannot disambiguate acquisition from the standard schema and
its real consumer proves the need. Whistle does not learn terrain, stockpile or
Goblin rules. Preview and cancelling an unfinished gesture do not become world
commands.

The frozen Whistle candidate is `f33a104` in
`/mnt/fungi-extra/botanical-work/Botanical-agent-control-host`, with Agent Host
wire correction `b4e3794` on top. It carries JSON input/output schemas, typed
arguments/results, availability with unavailable reasons and portable failures.
Its local projections support action/choice/form/confirmation hints plus the
opaque `custom.data` slot used by Hive's existing gesture binding. The maintained
EventSource roundtrip preserves schemas, arguments, results, failures and
availability while deliberately omitting local presentation. Presentation-only
local actions remain discoverable commands but acquire no remote presentation
field. Valid choices and labels come from standard schema `enum`, `oneOf`,
`const` and `title` data. This is independently checked candidate source, not a
published package or Hive integration claim. The first Hive join therefore
requires:

- one validation/schema source for each game command; no handwritten Whistle
  schema beside a different Zod admission schema;
- Hive-supplied discoverable enabled/disabled state with a reason, rechecked by
  Hive during admission rather than implemented by registration churn;
- mapping the portable typed result/failure into Hive's existing distinction
  between rejected intent, accepted intent and completed physical work; and
- consumer proof that the same semantic schema and availability reach a human
  client and headless controller through the existing authorized connection.

The Whistle ADR and current Botanical client boundary remain Botanical-owned.
Hive owns the first real game consumer and its domain schemas. Whistle does not
become the event log, policy store, gesture state, renderer, job engine or
authority system.

- Until that clean replacement is joined, shared presentation publishes bounded
  entity scopes for facts/actions. The
  client derives a contextual inspector from accepted selection and facts; it
  does not know Colony IDs or grant command authority. World digging/building
  tools remain globally reachable. Preserve current Caps and gesture owners.
- Reuse the retained baked alpha silhouette for object picking, with the actual
  rendered anchor, zoom and front-to-back order. No new pixel-read loop or
  arbitrary hearth click radius.
- Requesting ignition records a command-owned EmissionOrder revision; the
  system alone owns EmissionWork progress. Current Session explicitly rejects
  shared command/system component writers. This is a station intent, not an
  immediately selected worker action. An emission-work provider composes with the existing shared
  Hungarian assignment owner. Existing site supplies deliver the fuel. The
  existing Rust begin-emission operation remains sole owner of fuel debit and
  paid smoke/fire. No separate hauling, inventory or fire clock.
- No-fuel work waits without claiming a worker. Manual takeover releases ignition
  attendance; cancellation stops unperformed intent and cannot refund an already
  committed burn. Match the previous native action outcome before completing a
  submitted ignition; that outcome is already included in the current saved
  Session. Refused work releases its worker and exposes its actual reason.
- Root owns this work design and Colony callers in clearing-station-work; Luna
  owns presentation/transport/client and picking in clearing-context-ui, both
  from 23f1885. Root joins the two, reviews exact callers and one focused actual
  queued-ignition/current-save law plus contextual/picking laws. This is not a
  claim that the retained full brewing recipe has already been restored.

Trees remain in the scenery/resource restoration queue. Levi's subsequent
playtest reports a void-like hole after a few layers and no discoverable water.
Root source plus u6268 sampled four starting columns: surface y13; two soil
and three stone cells, followed by a very tall generated cave (27+ empty levels
before stone resumes). Bounds [-32,40) describe 72 vertical coordinates, not
72 earth layers. Current water activation remains only x/z[-2,2], y[10,14].
This is an unfinished playable-world join, not sufficient water coverage.
Remove the blanket "dig deeper to uncover groundwater" instruction now. Next
terrain/water correction must give useful cellar depth and ordinary discoverable
groundwater without silently expanding all active physics work. The read-only
note .botanical/clearing-context-release/deep-hole-readiness.md also identifies
cutaway filtering that drops otherwise-published water in an open/null-surface
column. Fix through the existing projection owner; do not invent a solid floor
or duplicate water. User's exact world/hole has not been inspected.

### Contextual station source and local proof checkpoint

Root integrated Luna 94dced5 as 0ca3c55 and root station 248b0e8 as e29c0b8;
720c0b2 consolidates presentation parsing and qualifies refusal. The subsequent
compact inspector places selected-object actions before the help/world section,
uses existing Caps and real baked silhouettes, and removes the misleading
universal groundwater instruction. Current Colony definition version is 4.

Root evidence in .botanical/clearing-context-release:
- u6249 caught command/system component write overlap before any simulation;
  root corrected it with distinct request/progress ownership, preserving failure.
- u6252 and joined u6262: three actual native Colony laws pass (shared supply/
  assignment/ignition, pending-result reload without duplicate debit, cancel,
  manual takeover). u6262 strict types pass; Fallow failed with findings retained.
- u6263: new actual already-burning refusal law and all ten affected presentation
  laws plus strict types pass. Removed three real unnecessary exports and the
  duplicate manual presentation parser. Fallow remains exit1 for one new
  **moderate estimated-coverage advisory**, progressAttendance (27 lines,
  CC13/cognitive12); root reviewed its local state transitions and accepts this
  advisory explicitly. No new dead exports/clones. Inherited findings retained.
- Luna reports two contextual, two scoped-binding/schema and one remote JSON
  law pass. New silhouette law passed within a client command that remained red
  for an inherited static-binding expectation. Its terminal reports are retained
  in the Session, not separate log files; its unrelated Fallow JSON was not used
  as qualification. Root's actual joined audit above owns source review.
- u6265 browser failed before clicking: the proof selected a transparent atlas
  row. Errors[]; root viewed and retained failure.png. Corrected proof chooses
  actual registered opaque bowl pixels outside the obsolete foot-radius.
- u6270 browser passes actual sprite selection, station-specific action, automatic
  supply/ignition and emitted fire, then worker-specific action visibility. Root
  personally viewed hearth-selected.png and hearth-burning.png. Browser closed,
  no owned server. This is desktop local native gameplay, not hosted or sustained
  two-client acceptance and not full brewing restoration.

## Starting point: actual state, not aspirations

### September 12 station/route and online-host correction

Runtime source `efa71ec` retires the standalone hearth presentation, names the
retained brew-station object, and reissues a claimed dig approach so native A*
can repair a route invalidated by changed terrain. Strict engine types and eight
focused station/terrain/work laws pass. The complete retained brewing process is
not present yet.

The first frontend publication accidentally omitted `VITE_HIVE_PUBLIC_HOST` and
therefore displayed **World unavailable** on the normal URL. That package was
superseded, not accepted. Frontend deployment
`da67815c-9d7f-4ca5-921e-a5fb085c509a` embeds the existing public DO host;
157/157 HTTP files match after propagation. A fresh browser opened the normal
Colony URL without `?runtime=local`, connected, and exposed enabled Rowan
selection with no page errors (`run-u6342`). Public DO Worker version
`566624b3-71ef-49cb-814a-5e74a9151c9c` remains the matching runtime owner.
This proves online startup, not an ordinary route-repair or long two-player
playtest.

### September 12 current live interim — aa12aa7

The contextual station update is live at the existing Colony URL:
https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony.html
Frontend deployment cc7dbc87-c033-4cf0-997d-2e491d3ae284; Worker version
65a67106-1598-4ff3-a510-afaab3cd4277, implementation
c7bcc73215650532c0d6f17bdb4985ece2146178eda0754d28f9ea75dccdfa77.
u6273 publication exit0; u6275 HTTP readback matches all158 files. The local
actual native-browser result is u6270 above; no new hosted browser run is claimed.
Previous fd7937b158-file frontend retained as clearing-context-release/
previous-dist.tar.gz with checked manifest; previous Worker b79549b6 remains
available. Unsupported old implementation worlds are preserved and require an
explicit New world; no migration or silent reset. All owned commands terminal;
browser closed, no owned listener/server. Runtime remains DO-hosted publicly.

Try selecting the visible brew station, then Light fire. Available workers use
shared delivery/assignment and native fuel/fire. Select a worker for Resume work
or Deposit; global world tools remain separate. Full recipe brewing, stronger
scenery, cellar/cave shape and groundwater coverage are unfinished. In particular,
the water domain is still only5x5x5 and the starting cavern reads as missing
terrain. Levi wants the large caves retained; their presentation is unfinished. The old universal groundwater subtitle
is removed. The goal remains active.

### September 12 earlier ground/invitation interim — fd7937b

The same Colony URL now serves generated ground cover and an explicit **Invite a
friend** action. Frontend deployment `a1bddd9f-0834-4aa4-b803-191fb6bb31d5`;
Worker version `b79549b6-d86d-4d64-9500-d80eea2eacb0`, implementation
`1a0ac648f34c5ba104278f179e8bebfb507277f3c40306e6d6d2ecf19a17f03d`.
The worker/native change derives original surface height from Rust; exposed soil
loses grass. Original Rowan/Sedge work poses and manual takeover remain present.
Current source is integrated through `fd7937b`; the helper's later `f4086f1`
wrapper-only recut was reviewed and not integrated. Root instead made browser
selection own its prepared apply/rollback while the existing connection retains
runtime replacement, in `6426cac`.

Evidence under integration `.botanical/clearing-ground-release/`:
- u6227 passed nine connection laws, explicit strict types, new-only Fallow and
  joined build/Worker preparation. Full inherited advisories remain in the JSON.
- u6229 published `6426cac`; u6230 matched all 158 served files. The first actual
  friend browser run u6231 failed after receipt of a paused world, with no page
  error. It is retained, not called a pass.
- Root found the actual button dependency on the prior drawing frame. `fd7937b`
  derives shortcut eligibility from accepted facts and current view instead.
  u6235 syntax/diff checks passed; Fallow reports one moderate estimated-coverage
  finding on that inline predicate. The predicate checks the actual ID, pose,
  visual and pickability; it was retained after source review, not suppressed.
  The separate changed-client build passed; its frontend-only publication is the
  current deployment above. No second Worker deployment or native law replay.
- u6239 passed **two real hosted browser clients**, including 390px: host creates
  an invite, friend joins the paused world without replacing its private token,
  friend resumes, host pauses, and both report identical committed time/facts.
  Root viewed both captures; invitation values are masked. Both contexts closed,
  no owned server was started. This is shared-control acceptance, not separate
  accounts/grants, a sustained load test, or a clipboard/refresh/New-world browser
  matrix. Source/unit evidence covers invitation parsing and replacement rules.
- `readback-paused.json` records exact final 158-file hosted parity. The exact
  previous ddc1728 frontend is preserved in `previous-dist.tar.gz`; the original
  generated WASM is separately preserved. All prior failure receipts remain.

Use **New world** if the server explicitly rejects an older engine world. Old
stores remain retained; there is no hidden migration or reset. Trees, paths,
pickup/drop transients, earned multi-level construction with water/smoke, the
fixed sustained two-client workload and Levi's playtest remain required. This
interim is not completion of the goal.

### September 12 earlier work-animation interim — ddc1728

The existing Colony URL now serves manual Go/Resume work, original Rowan/Sedge
dig/build/carry poses and closer desktop framing. Frontend deployment
`2aac14d5-1bc2-4640-8095-a27cae9a68b6`; Worker version
`91603a99-4b07-4977-aed3-c01b9b84c90b`; implementation
`c0859c71255f3316e021b154c9c32439e6ffa58f1af2acd8949577e44ddee43b`.
`u6205` publication and `u6206` all-158-file HTTP readback pass. `u6207` connects
two actual hosted clients, verifies manual Go and exact receipt replay, reaches
and holds the destination, resumes work, observes native digging activity on the
original cast and matches both clients at the paused revision. Five commands max
132 ms; short observation gaps max 213 ms. These are transport measurements,
not browser frame times or sustained workload acceptance. Both sockets close,
no server is launched, and all owned scopes are inactive/dead/empty.

The inspected build is copied byte-identically from `clearing-work-animation`;
both source trees match. `.botanical/clearing-work-release/` retains source
inventory, manifest, publication/readback/hosted receipts and the exact previous
34f7c20 dist archive. No automatic old-world migration/reset was introduced;
an unsupported earlier world remains preserved and needs explicit New world.
Scenery/terrain richness, pickup/drop transitions, full multilevel play and the
fixed sustained two-browser workload remain open. The goal is not complete.

### September 12 earlier repair interim — 34f7c20

The source below supersedes the earlier 4414a57 availability facts. This is a
useful repair interim, **not completion of Release A or the goal**.

- Removed delivery/construction's duplicate same-destination veto; Rust owns
  healthy-route reuse and invalidated-route recovery. The actual Colony regression
  digs two cells, builds a supplied wall and completes both original deliveries.
  Exact old providers strand `colony.delivery.1` in `to-destination`; the corrected
  providers pass. Spoil remains conserved. Root replaced the initial helper test,
  which passed both versions and therefore did not demonstrate the bug.
- Known command receipts release FIFO independently of delayed observations.
  Unknown results retain immutable command bytes/identity through bounded retry.
  Exhaustion refuses new orders and exposes explicit recovery. Ordinary UI
  submissions report refusal synchronously and retain tools/aim on failure.
- Source qualification: 12 transport laws, 16 work/UI laws, one actual WASM joined
  regression and strict engine types passed. Fallow audit at the real repository
  root against fc26a78 passes its new-findings gate; inherited debt remains,
  including large client draw/render, delivery progress and manual wire parsing.
  This is not a claim that existing code already meets every Field Guide rule.
- Hosted 34f7c20: frontend deployment `3a3c5d7b-e033-4364-9536-cb44f40cbafc`,
  Worker version `ef52f932-d69e-4dce-b6d3-3d6b5af2222e`; all 158 served files match.
  The existing two-WebSocket-client scenario now completes two cuts, replay of the
  dig receipt, supplied wall, ordinary hearth supply, consumed fuel, visible smoke
  facts and shared paused state. Six commands max 123 ms, observation gaps max
  263 ms. These are short hosted transport measurements, not browser frame times
  or sustained budget acceptance. Both clients closed; no owned server was opened.
- Evidence remains in `.botanical/clearing-repair/`: initial import failure,
  corrected actual-world old/new regression, joined gate, Fallow and release
  receipts. The prior 4414a57 hosted hearth failure remains intact.
- Still open: deliberate worker takeover/resume, carrying-leg route costs,
  sustained deep digging/building, original art/activity restoration and actual
  two-browser playtest. No new rendered/UI-browser evidence is claimed here.

### September 12 source qualification — manual control and original work poses

The reviewed manual-control source (`ebe337a`, `e7bf55f`, `e79dab2`) is joined
with King's original-cast/activity work, published above as ddc1728. One shared
automatic-work capability prevents delivery, digging and
construction providers from taking a manually controlled actor back. Go preserves
facing and cargo, cancels native attendance and moves; Resume work restores the
existing claim. Current-format restore preserves that intent. Boundary parsing
uses Zod; the superseded delivery/worker structural parser is removed.

The shared observation reads actual native digging/construction attendance. The
client selects the original Rowan/Sedge work/carry poses, without moving actors
or completing work in the renderer. Desktop initial framing is closer. The
retained static atlas is unchanged. Original scenery, ground detail and transient
pickup/drop animations remain unfinished; this is not visual parity with Clearing.

Evidence in the `clearing-work-animation` lane's `.botanical/work-animation/`:
- `u6190`: nine animation/native-attendance laws and the focused JSON activity
  boundary law pass. Native attendance projection leaves saved state unchanged.
- `u6197`: three joined actual-WASM laws pass; explicit engine types fail. The
  helper's earlier `npm --prefix engine exec tsc` checked the legacy root project,
  so it is **not** engine type evidence. Root corrected the branded frame value
  and the optional shared-system read list.
- `u6199`: the same three affected laws and explicit strict engine types pass.
  Go reaches and holds its destination, cargo/claims survive restore, another
  worker completes delivery, and explicit Resume finishes the original work.
- Fallow remains exit 1: two moderate estimated-coverage advisories in the joined
  gameplay test and `progressClaimedDig`; no introduced dead-code/duplication
  finding. Root separated claimed native-work reconciliation from provider
  eligibility instead of suppressing the new production hotspot. Inherited
  renderer/decoder/delivery debt remains and valid entrypoints are retained.
- `u6200`: ordinary client build passes (8.13 s), existing large-chunk advisory.
- `u6201`: bounded local browser uses the actual original bank and public
  rectangular Dig input; four orders are authored and Rowan's native digging
  activity is rendered. Root viewed `clearing.png` and `digging.png`; errors are
  empty. Browser closes normally; no server/listener was opened. This is local
  visual/input evidence, not hosted or sustained two-client acceptance.

### Earlier baseline, retained for comparison

- Live Colony: [existing demo](https://goblin-mvp-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony.html),
  runtime source 4414a57. Rust/WASM simulation runs in the public DO host. The
  shared client renders observations; ordinary commands receive durable receipts.
- Current implemented pieces include Rust terrain, finite water, simplified local
  smoke/heat, excavation, supplied construction, lots/containers and shared work.
- Excess spoil can remain on the ground. A native 4x4 excavation law completes
  after an occupied guest moves. These are real improvements, not full acceptance.
- The latest hosted combined check connects two clients, digs twice, replays a
  receipt and completes a wall, then times out on hearth supply. Sustained play,
  usable multi-level construction and indoor smoke in this joined sequence remain
  unaccepted. The reported queue lock also remains unresolved.
- The retained Clearing has better complete controls, art composition and activity
  animations. The new client reuses only part of that work.
- Two connected demo clients currently share demo authority. Distinct accounts,
  revocable individual player grants and an account invitation service are not
  implemented by that evidence.

## What a stranger should experience

Open the page and immediately see a small, inviting clearing with recognizable
people, trees, a path and useful supplies. The camera starts close enough to read
faces and tools. A short instruction offers an actual first action, not an engine
feature list: **select a person, drag a dig area, or start building your home**.

A rectangle visibly marks the intended cells. Workers walk to safe positions,
perform recognizable digging, leave the spoil, and haul it when storage permits.
Full storage or an unreachable deep cell explains what is waiting; other workers
keep doing useful work. Ordinary orders let the player intervene.

The player creates a cellar and stairs and adds supported upper floors. Water can
enter an earned cut; saturated ground and standing water look different. A fueled
hearth produces visible smoke, and a real opening helps clear it. The environment
creates understandable choices without dominating the simulation budget.

A friend joins the same clearing and can help. Both see the same completed cuts,
structures and goods. One person's reconnect does not freeze the other person's
work. The first co-op release may use explicitly shared-colony demo access; it
must not claim separate account/player permissions that do not exist.

The first short challenge is **make your little home usable**: a reachable cellar,
an accessible upper floor, supplies that workers can actually deliver, and a
ventilated hearth. Progress reads actual completed world facts. No fake rewards,
scripted water injection disguised as groundwater, or demo-only automatic builds.
Brew-and-serve hospitality follows this working foundation; it is not a new
prerequisite for handing Levi this repair.

## Release A — dependable human controls and work

Ship the joined correction as soon as it is usable; do not wait for Release B.

### Work and movement owner

Read retained src/orders.ts, src/jobs.ts, src/movement.ts and cancellation callers
against engine/src/sdk/delivery.ts, construction-work.ts, games/colony-work.ts and
kernel/src/world.rs before editing.

- Repair the concrete Destination/waiting mismatch in both current work providers.
  Native terrain edits retain the destination but invalidate a route; the TS
  providers currently suppress the same-target Move that can repair it.
- Preserve native A*, traversal costs, paid movement and assignment ownership.
  Correct delivery's carrying-leg reachability/cost from source arrival, rather
  than checking both legs from the worker's starting position.
- Keep digging separate from hauling. Full storage cannot imprison a worker with
  spoil; put-down/release retains exact material and carried-water custody.
- Unreachable, occupied and temporarily deferred targets have useful reasons and
  retry conditions. Independent work continues. Adding a valid route can make
  waiting work eligible; cancellation does not erase cargo or earned effects.

The next takeover correction uses one shared `WorkParticipation { automatic:
boolean }` capability, interpreted by the shared work owner before allocation.
Providers receive the same suspended-actor set and do not advance that actor's
automatic work. Colony's ordinary Go command takes control, cancels native work
attendance and submits native movement; explicit Resume work returns the actor
to automatic work. Existing task claims and carried goods remain paused, not
deleted or reassigned behind the player's back. Other actors keep working.
Delivery's separate quantity/haul preference remains a delivery policy. Rust
continues to own movement, traversal, work cancellation and resource custody.
The new capability must qualify manual movement during carrying/digging, explicit
resume and current-format restore before becoming a live gameplay claim.

The next independent human-client slice uses the existing demo's shared-world
authority: `remoteConnection` owns its bearer token, and the public host names a
region from game pack plus token hash. Invite a friend exposes an explicit
shared-control URL with the token only in the fragment. Opening it must preserve
the recipient's private saved token; refresh keeps the joined world. Invalid
invites refuse visibly. Explicit New world rotates the private token and removes
the invitation after successful replacement. The connection owner supplies an
optional invitation capability; local mode has none. Caps shows a selectable
read-only URL and copy feedback only after clipboard success, with a plain
shared-control explanation. This is not accounts, individual player grants or a
new backend. Luna owns the isolated `clearing-friend-link` client seam; King owns
the authority decision, review and eventual two-browser acceptance.

### Generated ground cover checkpoint — September 12

Rust surface queries now expose the original generated top alongside the current
solid top. The observation is derived and unsaved; digging lowers the current top
without growing new grass on exposed soil. The native binding and network parser
share one Zod surface schema. Original grass colors and low-poly detail are batched
into existing terrain chunks; no per-frame grass simulation or inventory is added.
The art owner keeps old and new column indexes separately and expands dirty bake
bounds for the declared grass height, so terrain edits remove old detail correctly.

Root proof in `clearing-ground-cover/.botanical/ground-cover`: u6211 passed the
native generated/excavated surface law, release WASM and explicit strict types;
u6216 passed 12 affected native-observation/wire/cache/art laws and strict types,
then failed Fallow on a duplicate type export. One public inferred type replaced
that duplication. u6218 passed the built local public rectangular Dig interaction,
observed an actual lowered surface and captured exposed soil; browser closed.
Root rejected the first polka-dot grass appearance. The larger irregular patch
recut passed three affected art laws, strict types, Fallow and build, followed by
an initial-view-only browser capture in `art-recut.log`/`clearing-v2.png`. No new
physics, server capacity or sustained multiplayer claim follows from those checks.
Fallow's new-only verdict passes; 14 inherited dead-code, 13 complexity and two
clone-group findings remain. Valid runtime entrypoints are retained.

This is an interim ground treatment, not full scenery acceptance. Trees, worn
paths, decorative plants and pickup/drop transients remain outstanding. Tree art
must join a real finite resource and navigation owner before it is presented as
choppable content. This checkpoint is now integrated and published with the invitation client, as
recorded in the current-live section. Full scenery acceptance remains open.

### Client admission and gesture owner

Read retained src/ui-actions.ts, digging-controls.test.js and main.js against
engine/src/client/controls.js, terrain-area-selection.js, client.js and
runtime/remote-client.ts.

- One visible rectangle, one release, one submitted command. Preserve screen
  endpoints, current level, pointer cancellation, Escape and right-click behavior.
- Show pending, applied and rejected results accurately. Do not overwrite refusal
  with a submitted message. The UI derives connection/work facts from their owners.
- Remove the blanket wait for a displayed revision after a known command receipt.
  Independent next commands must not depend on the display socket catching up.
- Unknown outcomes retry the same command ID and bytes. Recovery exhaustion is
  visible and stops further mutation admission; it is not an invisible queue trap.
  Keep camera, selection and view controls usable. Never enlarge the queue as a fix.
- Preserve current shared direct-input reconciliation/interpolation for the other
  demos. Colony uses deliberate orders and ordinary worker execution.

**Release A exit:** ordinary rectangle digging, hauling past full storage, an
unreachable lower target while other work progresses, route repair and reconnect
work together in the actual Colony. Levi gets the coherent build to try. This is
an interim release, not the full sustained-goal or public launch acceptance.

## Release B — the Clearing looks and plays like the Clearing

### King owns art and animation acceptance

Use the original Three → low-resolution bake → Pixi owner. Reuse src/art/clearing.js,
figures.js, art.js and the activity/presentation rules in src/view.js. No new visual
style, unrelated purchased pack, art-bank explosion or client-side physics.

Retained visual provenance is an acceptance gate. For every migrated object, record
the retained source and the live bake/binding that consumes it. Do not call a modified
model "original," stretch it to fit a newly chosen physical footprint, substitute a
procedural placeholder, or silently move it to a different bake frame. Four-facing
objects rotate the retained model unless an orientation truly needs distinct retained
art. A missing visual state is reported as missing and any new art requires King's
direct review. Specifically, the September 11 four-cell stair stretch is superseded:
the compact September 7 timber ramp is the visual baseline, and traversal/footprint
must be reconciled to that asset rather than changing the asset to hide the mismatch.

### Generated living surface and paths

The retained `src/art/clearing.js` is the visual baseline, not the world owner. It
hardcodes four deterministic grass colors, a diagonal dirt band, a worn central
rectangle and patterned edge plants into one baked background. Preserve that art
vocabulary while moving the semantic path and surface-style decision into terrain.

The world starts mostly empty. Terrain generation supplies attractive reproducible
grass/soil variation from material, moisture, fertility and seeded low-frequency
noise; it does not route paths between default furniture, stations or buildings.
The retained diagonal is an art reference, not spawned world truth. The client maps
terrain and wear facts to retained grass/path variants and decorative edge details;
it does not invent path state, persist pixels or randomize independently.

Actual foot traffic creates bounded sparse wear through one native surface-wear
operation. Wear is an integer level from `0` through `7`, initially `0`, and
increases only on cells a committed route actually crossed. Movement batches one bounded set per
completed route or coarse interval rather than emitting a durable event per footstep.
Disuse and suitable ecology may lower wear slowly. Low levels bend and thin grass;
higher levels expose dirt. Levels have path-specific meaning: `0` is untouched,
`1–2` pressed grass, `3–4` thinning grass, `5–6` worn earth and `7` an established
path. The renderer may share art within adjacent levels without owning the value.
Any movement-cost or fatigue benefit begins only when the
authoritative wear level changes, so presentation cannot grant traversal. Each region
stores only changed cells, and a route crossing a DO boundary submits its local
segment to each existing region owner. The first slice is traffic wear plus the
retained visual palette; generated regional roads wait for a demonstrated settlement
or travel consumer.

When Goblin later generates encampments, ruins, crossings or other real landmarks,
its content definition may supply those deterministic nodes to the engine's route
proposal. The engine connects compatible nearby nodes and derives old-trail wear;
the game decides which landmark kinds exist and may connect. Shared world seed,
region coordinates and deterministic boundary anchors make adjacent region owners
derive the same crossings without storing or broadcasting a global road bitmap.
Traffic then reinforces, abandons or diverges from those generated trails through
the same surface-wear owner. With no landmark provider, no old trail is generated.

- Replace plain terrain treatment with authored grass tops, exposed soil/stone
  sides, edge details and stable variation. Reuse face/tile art where appropriate;
  draw only relevant surfaces and cache changed patches. Rust still owns geometry.
- Restore paths, roots, rocks, mushrooms, ground cover and trees with the original
  visual vocabulary. Decorative details are click-through and cannot create
  physical blockers. Harvestable/obstructing scenery must use actual world rules.
- Restore the named cast and cat as their existing supported capabilities allow.
  Rowan and the witch already have dig/build/chop/pickup/deliver/carry/sleep poses;
  the current goblin-worker bank does not have equivalent activity coverage.
- Project real activity and custody into shared animation choices: walking,
  digging, building, pickup, carry and drop-off. Hold facing between observations;
  interpolate motion. No generic bouncing as a substitute for work animation.
- Restore actor names, understandable progress, clear selection and useful camera
  framing. Inspect terrain-edge artifacts against physical geometry; do not hide
  wrong geometry with scenery. Use Caps for the compact human interface.
- Keep dust, splash and sound restrained and tied to actual movement/work/cues.
  Reuse current shared effects and approved audio; cosmetic feedback settles no
  inventory and never advances simulation time.

#### Stair art parity checkpoint

The Sept 11 stair change was a real source change, not merely a new camera: it
changed `src/art/stair.js` from the retained Clearing's two-cell run to a
four-cell run, and changed the bake from the 112x112 prop frame to the 192x160
vehicle frame. The retained source at `e4510b2` is the cleated timber ramp with
the upper landing at local `z = 2`; the later `d181421` source moves that
landing to `z = 4`. The current native catalog independently declares
`timber-stair` as `run: 4, rise: 4`, and the native geometry tests and three-level
route fixture rely on that span.

The accepted restore is the retained contract: `run: 2, rise: 4`. These are
voxel indices, not metres. Colony's one-metre horizontal cell and 0.54-metre
vertical cell make this a 2 m run and 2.16 m rise. Environment admission checks
the resulting metric grade against its bounded stair policy; native geometry
still bounds both counts and never applies a voxel-count slope test. Route,
support, landing and picking callers use the same endpoint cells.

The required visual acceptance is four cardinal orientations resolved through
the existing `buildings.stair.<stage>[facing]` binding and the original stair
builder. No substitute stair asset, second binding, or one-off rotation path is
allowed. The current v2 static bank remains the unrebuilt proof boundary until
the restored source is baked; source acceptance does not claim the hosted bank
has already changed.

### Water, smoke and building must work together

Keep the current finite-water and sparse local-smoke owners. Do not reopen pressure
simulation, whole-cave room reconstruction or CFD studies. Read the latest
GAS-REPAIR-PLAN.md correction before historical solver sections.

- Supply and complete walls, floors and four-facing stairs through ordinary work.
  Support spans must make usable rooms; do not regress to a wall beneath every
  floor tile. Collapse remains later. Retain deeper digging and multiple storeys.
- Confirm groundwater enters reachable excavations and soil storage is finite.
  Water and spoil transfers retain their quantities; wet ground is not an infinite
  sink. Preserve current contamination/current capability without adding chemistry.
- Correct the actual combined-play hearth supply failure. Consumed fuel produces
  smoke/heat; opening ventilation changes the real hazard and its visible feedback.
- The first scenario uses the Rust generator with a deliberate inviting starting
  clearing and nearby discoverable water. Initial composition may be authored;
  player edits and environmental behavior are genuine simulation.

### Shared world and efficient observation

Keep Region's transaction, latest-world records, receipts, native rollback/reload
and durable alarm ownership. **Do not convert all persistence to event sourcing.**
Selected durable gameplay facts can serve real observers later; a complete world
history is not required for this sprint's multiplayer or crash recovery.

- Two independent browser sessions must join one actual world through a usable
  human flow. Reuse current host access where sufficient. Clearly label shared
  cooperative control; do not invent an account backend or borrow Hub cookies.
- Resolve simultaneous orders deterministically in the authoritative owner and
  show their actual results. Neither client advances its own online simulation.
- Send a complete baseline on join/recovery, then bounded changed information.
  Reuse existing terrain changed-column facts; avoid resending complete geometry
  after each cut and unchanged presentation definitions on every update.
- Keep a single projection/replication owner with explicit additions, updates and
  removals. Coalesce replaceable poses/water visuals. A missing baseline resets
  the view; it does not cancel accepted gameplay or create another world.
- Preserve existing finite bounds and evaluate actual projection/byte costs. Do
  not add a generic patch language, replay service or broker to solve this slice.

**Release B exit:** the same actual clearing has the restored visual quality,
readable work animations, multi-level play, useful water/smoke and working two-person
co-op. It passes the fixed workload below and Levi's human playtest. Then capture
an honest short clip, add concise controls/goal copy and publish the ordinary page.

## Acceptance and feedback cadence

Keep the September 12 fixed workload and numerical budgets in
[GAS-REPAIR-PLAN.md](GAS-REPAIR-PLAN.md#fixed-playable-workload-and-budgets).
Do not silently lower them or call Release A complete-goal acceptance.

- 20 minutes with two actual browser clients; 32 earned cuts across two depths;
  full storage/ground spoil/autohaul recovery; an enclosed lower room and two
  accessible upper levels; groundwater; paid indoor smoke and ventilation.
- Reconnect one client, exercise lost acknowledgement and owner restart using the
  existing bounded harness. No duplicated cuts, goods or fuel; the other remains
  usable. Current-format save and paused intent remain correct.
- Preserve warm-step p95 ≤15 ms, p99 ≤30 ms, max ≤50 ms; command p95 ≤250 ms,
  max ≤1 s; browser gaps p95 ≤25 ms, p99 ≤50 ms, no unexplained ≥250 ms hitch
  or ≥1 s world stall. Report cold load separately, not as an exclusion from play.
- Require readable normal and narrow UI, correct clicks, and actual activity
  animation. Use Levi's supplied screenshots as the visual comparison. Static
  screenshots cannot prove timing, picking, multiplayer or fun.

Run focused checks for the changed mechanism, then one joined scenario. Preserve
valid evidence; repeat only invalidated portions or failures that need a specific
answer. No historical matrix, expensive editor trace or hours of unchanged proofs.
At the first coherent usable fix, deliver a build for Levi. Do not wait to collect
an entire sprint's worth of polish. Human feedback can reopen this same outcome.

Track progress by these exits: reliable actions; restored appearance/animation;
joined environmental play; two-person continuity; sustained acceptance and Levi's
playtest. Commits and source-only tests are supporting evidence, not velocity units.
A useful update says what can now be played, what still fails and what is live.

## Ownership and current handoff

King owns architecture, original art, integration and release. Luna handles bounded
mechanical implementation in isolated worktrees. At most two implementation lanes:
work/movement, and client/controls/replication. One writer per coupled seam. Shared
contracts are agreed before edits; King joins and reviews actual callers.

Both original repair lanes completed source and released custody to King:

- `/mnt/fungi-data/botanical-work/clearing-work-recovery`, branch
  `fix/clearing-work-recovery-20260912`: movement/work correction; root corrected
  and qualified the actual joined regression before publication.
- `/mnt/fungi-data/botanical-work/clearing-client-recovery`, branch
  `fix/clearing-client-recovery-20260912`: admission/recovery/UI correction.

Integration remains `/mnt/fungi-data/botanical-work/native-atmosphere`. Art changes
that overlap the client lane wait for explicit file release; independent art
preparation can proceed. Current goal remains unfinished. Subsequent bounded work
continues in isolated writing roots with reviewed contracts and actual caller proof.

## Off the sprint's critical path

Needs/social restoration remains after the first real brewing loop as ordered
above. AI players/storytellers and many-faces authority stay
engine requirements, but an AI demonstration is not a condition for the human
Clearing release. RTS/pirate/survival expansion, multi-region handoff, editor/MCP
work, new accounts and historical world replay are deferred. Preserve those
working consumers and their gains without expanding their features here.

The success statement is simple: **Levi and a friend enjoyed building and digging
in the actual clearing, it looked alive, water mattered, and it stayed responsive.**
