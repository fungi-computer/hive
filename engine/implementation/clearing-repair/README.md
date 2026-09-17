**September 17 unified building/creator follow-through:** section 14's
[coherent implementation sequence](14-simple-depth-rendering-handoff.md#coherent-implementation-sequence-definitions--placement--work--drawing)
owns the current order: reproduce the upstairs bed defect, unify definitions and
selected-plane proposals, reuse native admission/work, migrate the real creator
consumer, then qualify extended-art ordering. Earlier scalar-sort stages are not
an approved general solution. Rendering representation remains an explicit design
gate; building has no separate upper-floor mode.

# Clearing repair implementation packet

**Current combined sprint:** [Unified building, creator API and rendering](14-simple-depth-rendering-handoff.md#current-sprint-a-buildable-upstairs-room-through-the-supported-api)
owns delivery: visible upstairs bed, real creator API consumers, stairs/cuts and
room editing, then a matched playable release. Move touched callers onto supported
operations in the same slice. The old scalar-depth cutover is not an accepted
algorithm. Section 13 still owns cut visibility and accepted original art; section
14 owns the current building/ordering reconciliation and API boundaries.

**September 16 rendering correction:** [Cut-level rendering and Ingnomia study](13-cut-level-rendering.md)
records selected-level cuts, visible lower terrain, whole supported actors,
underground cross-sections, safe batching, and source-grounded lessons from
Ingnomia. Read before implementing section 04; superseded level-band and layer
bake rules must not survive the repair.

## Read first: preserve the accepted creator API

**Levi's explicit direction, September 15: everything that can be expressed with
`.with()`, `.where()` and `.do()` should use that shape.** Stop introducing a new
authoring pattern for each capability. Actors compose capabilities with `.with()`;
capability selections use `.where()` to describe conditions and `.do()` to describe
intended actions. Inventory, movement, trading, production and other supported
behaviors follow the same collection and execution contract.

Named predicates and actions remain useful inside that composition. An action
builder used by `.do()` describes an intent; it does not immediately mutate the
world. Underlying Rust operations and module boundaries still own their invariants.
Their existence is not a reason to expose a separate imperative creator API.
Keep shared batched queries, explicit conflict handling and one authoritative
mutation owner; fluent syntax alone does not establish these laws.

Before proposing another public pattern, show the concrete operation that cannot
fit this model and explain why. Do not make Levi rediscover this decision during
each example or review. Follow [section 10](10-scripted-engine-authoring-audit.md)
for the collection/execution contract. Inventory-grid and trade examples discussed
with Levi illustrate this direction; they are not evidence of installed features
or an expansion of the current Clearing delivery scope.

**Actor/capability follow-through:** [Composition examples and proof obligations](10-scripted-engine-authoring-audit.md#composition-examples-and-proof-obligations)
records physical backpacks as actors with inventory, atomic consenting trades,
issued quests as actors with progression, and the limits of forcing every data
structure into `.where().do()`. These are accepted design examples, not installed
features or additional prerequisites for shipping the Clearing.

**September 15 implementation handoff:** [Actor lifecycle, relationships and access](12-actor-lifecycle-relations-and-access.md)
freezes the remaining contracts from the whole-authoring audit: atomic first-join
creation, independent ownership/membership, native indexed relationships, explicit
operation roles, shared-building permissions, revocation and cleanup. Sections A
and I define the serial L1–L4 implementation packets and their acceptance scenarios.
Read it alongside section 07's native planner and section 10's prepared behaviors.
It is implementation design, not a claim these runtime changes are already shipped.

**September 15 whole-authoring audit:** [Shapes and ownership](11-authoring-shapes-and-ownership-audit.md)
maps eight authoring families to existing source and compares Godot, Bevy, Defold,
GameMaker and statechart tools. It separates actor lifetime, player ownership,
membership and authority, and records creation, outcome and production gaps.
Module-owned operations remain the direction; proposed Teams/party DSL names are
not frozen APIs. The whole-loop acceptance includes independent parties sharing
building access without sharing control of their actors.

**September 15 accepted creator API:** [Definitions and shared query batches](10-scripted-engine-authoring-audit.md#accepted-authoring-contract-definitions-and-shared-query-batches)
owns `behavior(id, scene => { ... })` with `find().where().do()`. Build definitions
at pack load; batch reads across due behaviors in one world decision phase; return
physical requests internally through existing ECS/native/Region owners. No returned
array required from creators, no second scheduler or state store. It supersedes
older hook/builder sketches. Includes dependent query stages, conflict/continuation
laws, actual integration gaps and real-consumer acceptance. The prepared behavior
surface is installed; later lifecycle/relationship work remains staged. The report retains
the Godot/GameMaker research and source comparison with Knapsack/Mycelium. The
[actor composition decision](10-scripted-engine-authoring-audit.md#actor-definitions-compose-capabilities-and-behaviors)
adds `actor(...).with(...).behaves(...)`: shared behavior definitions and
independent ECS instance state. Definition composition is installed; general
attachment membership for overlapping capability sets remains pending a real
consumer. Its creator handoff gate covers
custom TypeScript rules and an unusual capability combination without engine special
cases. Actor does not mean a per-entity runtime or Durable Object.

The [execution walkthrough](10-scripted-engine-authoring-audit.md#collection-to-execution-walkthrough)
maps collection, shared reads and proposals onto the existing GamePack/session/native
bridge. The [multi-task/statechart fit](10-scripted-engine-authoring-audit.md#multi-task-jobs-and-optional-statecharts-use-the-same-owners)
shows linear jobs and optional native chart progression over the same task owners,
with no TypeScript job scheduler or second authoritative progression state.

**September 15 whole-engine review:** [Engine ownership audit](08-engine-ownership-audit.md)
records the actual Rust, GamePack/DO, client/art and Shiitake/Watchdog comparison,
updated against `85bfd7a5` plus the current dirty supply work. Its
[creator/behavior follow-through](08-engine-ownership-audit.md#creator-engine-and-shared-behavior-september-15-follow-through)
specifies individual decisions, optional group assignment and shared execution;
the optional colony mechanism bundle; and the bounded XState authoring evaluation.
It records newly found reservation, carrier-capacity, acknowledgement/reload and
ordinary-result gaps. No native statechart interpreter is accepted or required
before the current playable repair.
The [creator acceptance review](08-engine-ownership-audit.md#creator-acceptance-the-edmund-mcmillen-question)
adds concrete tests for expressive TypeScript rules, admitted physical lifecycle,
one pack entrypoint and a fast art/gameplay iteration loop. It does not turn the
Clearing repair into another editor or engine rewrite.
It owns the current deep-module correction and repair order. All automatic jobs
share one Rust scheduler. Domain modules own requirements and physical effects;
they do not grow individual scheduling or delivery lifecycles.

**September 15 implementation design:** [Native work planner](07-native-work-planner.md)
specifies the complete Rust planning pipeline, ownership, budgets, recovery and
consumer cutover. It is a design, not implemented acceptance. The current
[construction cancellation policy](02-construction.md#impossible-versus-waiting)
cancels structurally invalidated plans; missing labor/materials remain waiting.

**September 15 simplified bulk decision:** [Simple bulk contents](07-native-work-planner.md#simple-bulk-contents--accepted-september-15-correction)
owns the current bucket/mixing handoff: fractional volume and additive property
amounts, proportional pours, game-defined meanings executed through Rust material
operations, and flavor-only mixture labels. It supersedes per-ingredient histories
and integer remainder machinery. Includes pseudocode, real-caller migration order,
consolidated acceptance and the current candidate status; implementation is not
accepted merely because this design is recorded.
Rust stays blind to Goblin concepts such as piss, pathogens and beer: GamePack
definitions compile bounded property IDs, predicates and transformations into the
shared native storage/transfer mechanics. No TypeScript callback runs inside the
native material solver. Authored decision phases use the separate read/intent
contract above.

**September 15 multi-task correction:** [Jobs compose tasks; physical results
separate them](07-native-work-planner.md#jobs-compose-tasks-physical-results-separate-them)
is the current tree/brewing/construction composition law. Felling and chopping
are separate tasks joined by a real felled-trunk item. A job never holds one worker
across its plan, and cancelling future tasks never removes committed physical
results. The engine executes typed resource/item transformations; Goblin supplies
tree, trunk, log, duration and presentation definitions.

**Current job architecture (source-audited September 16):**
[Rust-owned declarative job planning](01-work.md#rust-owned-declarative-job-planning-current-correction)
supersedes the earlier TypeScript provider scheduling design. For every currently
supported Clearing work family, TypeScript declares checked content and semantic
commands while Rust owns discovery, eligibility, material allocation, candidate
generation, route cost, joint assignment and continuation. Construction,
production, field water, excavation, deconstruction, trees/resources and
stockpile hauling use that one planner. The former TypeScript automatic planners,
worker/job scans and candidate-pair generators are deleted. Manual Draft/Go
commands still submit typed native WorkAttempt operations; they do not assign
automatic jobs.

[Native placement admission audit](02-construction.md#current-audit-reject-conflicting-plans-at-the-native-boundary)
adds required geometric conflict and prerequisite checks before a construction
intent is accepted. The screenshot's exact site/render cause remains unverified;
the source admission gap is confirmed. C4/C5 remain unproved.

**September 14 accepted design update:**
[Grid-edge buildings and declarative art parts](06-edge-buildings-and-art-parts.md)
owns the next construction/rendering implementation. Walls and doors move to
canonical grid boundaries; floors stay full tiles; stair rails and supporting
surfaces become separately ordered original-art parts. Read this update before
the historical status and earlier construction/drawing instructions below.
It is an implementation plan, not a claim of landed code or hosted acceptance.

Status: active integration on `engine/clearing-edge-integration-20260914`.
The pushed checkpoint is `a46d5fcc`. Placement preview and final admission share
one atomic native batch, structurally invalid plans cancel through the
construction owner, and render support picking uses the same deterministic order
as drawing. Historical branches and receipts remain evidence; they are not the
active queue.

The joined source now contains the native WorkAttempt identity/lifecycle owner,
party-scoped pending actions and authored creation, lawful transfer contacts,
atomic floor-finish replacement under occupied furniture, and the actual Colony
floor consumer. It also contains native world-local party allocation and replay:
one host-derived binding commits a player, party and GamePack-authored people in
the Region transaction, and reconnect projects the actual bounded PartyMember IDs
rather than synthesizing names in the host. Draft and Undraft use the persistent
bottom action dock; unavailable actions remain visible with their reason, while
selection stays UI state and server admission remains authoritative.

Native construction and process inputs now contribute to one bounded supply
planner and one allocation/pickup/delivery lifecycle. Two workers can reserve and
carry distinct portions without overbooking; Draft preserves actual carried cargo;
restore resumes the same allocation. Process inputs preserve `portion` versus
`whole-lot` policy, so mugwort, barm and kegs cannot be assembled from fragments.
The real process lifecycle fixture obtains finite 0--7 field water with a declared
vessel, converts that same durable task into an ordinary native allocation, carries
the exact water portion into the kettle, and admits the original brewing recipe.
Mugwort harvested by native physical work enters that same supply owner. The dead
TypeScript `processSupplyPhase`/`planSiteSupplies` planner and its duplicate tests
are deleted. Stockpile, tended-resource water and general resource worker
selection now enter the same native planner.

Original retained art placement metadata is owned beside the bed, brewer and stair
recipes and survives the v5 static pack. The client converts canonical point and
multi-cell footprint facts into projected bounds, compares only overlapping nearby
sprites, caches static relationships and gives ordinary Pixi sprites deterministic
`zIndex` values. Picking walks that same front-to-back order and then applies the
existing alpha silhouette. The superseded per-pixel depth renderer is deleted.
Terrain and water occupy explicit storey bands rather than pretending to be
physical sprites.

At `512ecf53`, productive measurements preserve actual water and work: median
simulation step is 6.51 ms at 32 workers, 4.84 ms at 100 and 6.43 ms at 200.
Median observation is 5.74/7.32/9.62 ms respectively; median full snapshot at
200 is 26.42 ms and remains the largest measured boundary. The maintained joined
qualification passes 238/238. The later authored-fact boundary at `a46d5fcc`
passes its 39-law work group.

The matching `512ecf53` client/backend is live at
`https://clearing-512ecf53-fungi-goblin-bnb.levi-fe0.workers.dev`. All 196 hosted
files match the release inventory; a fresh hosted API witness joined one party,
received two persistent people and observed 4,096 terrain surfaces. A fresh
browser automation run is unavailable on this host because its Chromium lacks
`libnspr4.so`; the preceding `883dc484` hosted browser proof passed 14 assertions
and 18 public commands. Do not relabel the API witness as current rendered proof.
Historical backend and alias receipts do not establish parity for the current
source.

## Outcome

A player joins a shared world, receives two people in one persistent party, can
Draft/Undraft them, designate/build/haul/brew without trapped workers, and see
correct furniture/people/stair overlaps. Disconnecting leaves the party working
while the Region runs. Commands and supplies remain party-scoped. Original art,
Rust physical ownership, DO durability and existing assignment performance remain.

## Read in this order

1. [Work attempts and exact physical results](01-work.md): canonical types,
   transitions, cancellation/cargo, complete consumer migration and deletions.
2. [Contacts and floor finishes](02-construction.md): existing coordinate rules,
   shared contact query, atomic replacement and preview/command integration.
3. [Parties, join and Draft](03-parties.md): identity/protocol, transaction,
   permissions, spawn, offline presence and UI.
4. [Spatial drawing and original art](04-drawing.md): datum correction, depth
   representation, exact picking, clipping and performance acceptance.
5. [Integration, evidence and release](05-delivery.md): dependency order,
   executable checks, upgrade rules and actual preview publication.
6. [Grid-edge buildings and art parts](06-edge-buildings-and-art-parts.md): current
   coordinate contract, physical consumers, edge gestures, multipart bake/sorting,
   writer sequence and acceptance ledger; includes missing ordinary diagonal
   walking and shared corner/cost/restore rules; supersedes conflicting wall guidance.
7. [Native work planner](07-native-work-planner.md): current all-family native
   migration, private transition ownership, shared budgets, partial-source status
   and exact TS deletions.
8. [Engine ownership audit](08-engine-ownership-audit.md): deep module boundaries,
   source-confirmed defects across the engine, retained mechanisms and repair order.
9. [Systems-game and creator study](09-systems-games-and-creator-study.md):
   RimWorld/DLC, large-mod, Factorio, Satisfactory and Stellaris findings;
   workpiece authorship correction and creator acceptance within the same stages.

## Non-negotiable implementation choices

- One native scheduler and work-attempt association; domain requirement
  contributions never select workers or own a competing claim. Native physical
  operations remain sole quantity/progress owners. Host Watchdog is not
  instantiated per game task or per goblin.
- Existing Region transaction commits membership/world records/receipt together;
  no participant database outside that owner, no auth service or global user ID.
- Explicit Draft/Undraft. A click to select does not change work mode. In this
  Colony slice manual Go requires Draft; normal contextual work remains an order.
- Draw order derives from canonical point or multi-cell footprint facts, projected
  through the shared camera. It never derives physical occupancy from opaque sprite
  pixels. Alpha silhouettes refine selection only after deterministic ordering.
- No automatic old-save migration or reset. Preserve old bytes and clearly reject
  unsupported formats. Existing-world continuity and any upgrade disposition are
  explicit release checks; a successful fresh-world test cannot prove continuity.

## Writer boundaries and sequence

The lead reads/reviews all first working shapes and original art. Luna handles
bounded implementation. Do not assign unresolved architecture to an implementer.

| Chunk | Writer files | Dependency / review checkpoint |
| --- | --- | --- |
| A | coupled native work/material modules, component registration, action dispatch and TS cutover | One scheduler; shared result/cancellation/delivery lifecycle proved with construction and process before remaining families |
| B | construction/contact native module and matching SDK; floor command/preview | Serial with A wherever native dispatch/contracts overlap |
| C | remove TS automatic providers and migrate every current pack caller | Serial with A; this is the native cutover, not another provider implementation |
| D | Colony party definitions/spawn/draft + Region principal propagation + host protocol/client credential | Scope type pinned with A; no competing edits to Colony/host/session files |
| E | original art bake/manifest, multipart sprite sorting/picking/preview | Independent of A/B; lead personally reviews art/datum and rendered proof |
| F | acceptance fixtures, joined checks, commit/release | Read pinned candidates in parallel; lead integrates serially |

A table row is a complete bounded outcome through corrections/tests/commit, not a
new permanent team. Shared file changes land serially or through one coupled
writer. Reviewers write ignored notes only. Continue independent authorized work
while a pinned revision is reviewed. Do not duplicate a running proof.

## Scope and decision discipline

The types and operations in these pages are the intended replacement API shapes,
not claims that those exports already exist. Minor naming/layout decisions can be
made locally; changing authority, cargo semantics, permissions, algorithm,
transaction boundaries or release compatibility requires lead review against this
packet. Missing dependencies or unexpected physical behavior are defects to
investigate, not reasons to invent a fallback. Report the source, failed law and
proposed correction in the existing sprint, without another management framework.

Source-grounded baseline: the simple floor-under-brewer runtime law passed in
`run-u7158` against the existing generated WASM. The failed exact-world delivery
transition, replacement, new attempt lifecycle, party join and new drawing remain
unproved. No new build, browser check or deployment is implied by these docs.
