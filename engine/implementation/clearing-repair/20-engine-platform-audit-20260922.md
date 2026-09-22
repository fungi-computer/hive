# Engine platform audit — September 22, 2026

## Verdict

**Hive is a useful, partially proven single-Region game engine. It is not yet a
dependable foundation on which Edmund can independently produce fast, scalable,
multiplayer games with large persistent worlds.** Trusted TypeScript authors can
already compose supported mechanics inside this repository. The complete
creator-to-published-game boundary is unfinished, and several runtime costs grow
with all retained state rather than the work that actually changed.

Keep the deterministic physical owners, durable Region commitment, native
Hungarian assignment, procedural generator, original Three → low-resolution bake
→ Pixi pipeline and WebSockets. Repair the existing owners and replace specific
expensive representations. The evidence does not justify another engine rewrite,
a replacement renderer, another authoring DSL or a general plugin framework.

This distinction matters: the ownership of physical effects is substantially
sound; the current performance and product boundaries are insufficient. A bigger
map preset, a pleasant small scene, and a passing transaction test each prove
different things. None establishes the whole platform.

Audit objective: “audit the engine e2e and ask if this next generation of edmunds
will use this to make fast performant scalable multiplayer games with large
worlds.” Source pin: **`2997346851c4d8e8d75d85d040f8d2f6463eafda`**, clean
`engine/living-terrain-integration-20260917` worktree before this report. Three
independent read-only reviews covered creator integration, native costs and
host/durability; the integration owner checked the critical paths and ran focused
current laws. This is an audit, not implementation of the remaining work.

The [current rendering review](19-rendering-review-and-repair-20260922.md)
supplies the detailed rendering repair contract. The
[September 20 study](16-engine-edmund-source-study-20260920.md) supplies preserved
native measurements. This report reassesses the complete platform at the pin
above; historical roadmap promises are not counted as implemented capabilities.

## What a creator gets today

| Boundary | Actual capability | Qualification still missing |
| --- | --- | --- |
| Authored rules | Checked components, relations, systems, commands and `.where().do()` execute through native operations. | One truthful preparation boundary for all advertised composition; trusted TS execution is not an untrusted hosting sandbox. |
| Actor composition | `.with()` prepares components/templates. | `.behaves()` stores attachments but does not install or scope execution. |
| Work and finite goods | Shared native work attempts, claims, custody, construction and staged recipes have real game consumers and recovery laws. | Some cleanup remains coordinated through shared Kernel internals; generic-looking creation and process APIs retain narrower assumptions. |
| Durable authority | Region transaction commits state, records, receipt and events together; resident candidates recover after failed commitment. | Lawful receipt/event retirement and sustained cost qualification. |
| Multiplayer | Colony has durable distinct participant/player/party bindings and scoped commands in one world. | Generic pack admission, explicit observation permissions, bounded subscriber work and two identified host corrections. |
| Generated terrain | Deterministic bounded queries cover a larger procedural coordinate space; camera regions stream over WebSockets. | Larger retained mutation state and active simulation have different limits; no cross-Region world ownership. |
| Sleeping worlds | Active online work uses a durable clock occurrence frontier. | Lease expiry stops advancement; elapsed-time settlement and external-obligation wakes are not implemented. |
| Rendering | Original art, client-local projection/order, terrain residency and Pixi batching exist. | Common geometry, retained scene work and cut-data residency require the repair in report 19. |
| Art authoring | MCP edits and exports checked Three scene documents. | Exported custom scenes do not yet pass through one bake/install operation into the playable runtime pack. |
| Publishing a new game | Low-level Worker runtime accepts an injected pack map. | Real browser/build/host entrypoints still embed demo choices; no complete external-pack acceptance witness. |
| AI participation | Whistle derives real command schemas, availability and contextual targets. | Current native engine/host has no maintained Shiitake execution join; older controller evidence targets the previous engine. |

The current data path is: game definitions and systems → GameSession/native
physical operations → Region commitment → committed observation and terrain
queries → client residency/interpolation/scene preparation → Pixi. Each arrow
exists for the demos. The findings below concern the cost, semantics and reuse
of those joins.

## Findings that change the decision

### 1. Rendering work is structurally too broad for responsive play

Report 19 establishes the immediate user-facing bottleneck. Common upright art
is lifted from its 2D silhouette into 3D planes and projected back into polygons
for ordering. Dynamic changes still merge large static/dynamic graphs; terrain
membership changes can trigger both static and combined topology builds. Input
handlers can synchronously perform scene work. Changing a cut discards all
cut-specific resident regions and requests a replacement representation.

One preserved zoom scene has 16,776 records, all planar. A seven-static-record
change took 104.2 ms preparation, 22.2 ms static ordering and 33.6 ms combined
ordering in that software-rendered host trace. These are trace samples, not a
hardware frame-rate benchmark. Startup overlap has shipped in source, but the
matched September 22 browser pair still failed the existing 1 s useful-ground /
3 s visible-coverage gates after readiness. It did not fix the full-load problem.

**Required change:** direct face/card/bounds geometry, retained local relations,
bounded scene preparation, and bounded material/occupancy coverage reusable
across cuts. A pan inside the resident margin should change a parent transform.
Pixi should receive prepared output. Preserve full upright, mowable dual-grid
grass, physical support, coherent picking, original art and accepted whole-picture
overlap approximations. Report 19 contains the laws; a scalar feet sort or a
frozen static order does not satisfy them.

### 2. Active work repeatedly recounts the entire entity state

[`world.rs`](../../kernel/src/world.rs), `refresh_state_weight` at line 2838,
clones entity IDs and walks every registered schema for each entity, materializing
component values to recalculate weight. Positive ticks call it at line 4535,
[`construction_work.rs`](../../kernel/src/construction_work.rs):1164 and
`world.rs`:5458, even with empty construction/process work. Active resource labor
calls it per executing worker in
[`resource_work.rs`](../../kernel/src/resource_work.rs):177; generic job labor
calls it per task in
[`native_work_planner.rs`](../../kernel/src/native_work_planner.rs):523.

The cost therefore includes **active labor × retained entities × registered
schemas**. This is source-established complexity, not measured attribution of a
particular pause. A small finite workload can conceal it.

**Required change:** canonical mutation owners maintain rollback-safe record
weights and dirty state. Keep the slow recount as a reference law. Capacity
validation must remain authoritative, including failed actions and restore.
Replacing assignment or weakening durability would not address this cost.

### 3. Incremental SQL writes conceal whole-state capture

Native rollback staging calls `save_records()` before selected mutating batches
(`world.rs`:4478). `snapshot_entities_json()` at line 3999 scans and serializes one
whole entity image. [`record_bundle.rs`](../../kernel/src/record_bundle.rs):120
splits that image by byte offset; those are storage chunks, not independently
owned entity records. [`kernel-records.ts`](../../src/runtime/kernel-records.ts):144
copies records and reconstructs/parses entity JSON to read metadata. The accepted
Session/Region path captures after execution before
[`session-record-store.ts`](../../src/runtime/session-record-store.ts):41 compares
complete buffers for changed SQL records.

The September 20 finite workload selected the entire 191,392-byte entity record
at tick 45, and the entire 187,969-byte entity record in its idle tail. Those are
record sizes selected for rewriting, not a count of differing bytes.

**Replace this aggregate record layout** with stable owned records and
revision-bound changed-record/deletion metadata. Bound rollback preparation at
the same owner. Full captures remain valid checkpoints. State, records, command
identity, results and events must still commit atomically; a dirty journal cannot
become another physical authority.

### 4. Planning budgets leave discovery, fairness and invalidation gaps

The native joint matcher and lazy route verification already exist. Their caps
do not bound all earlier and later work:

- [`work_candidates.rs`](../../kernel/src/work_candidates.rs):189 scans indexed
  tasks for due work; line 290 clones workers before truncating; line 314 collects
  and sorts all due tasks before truncating. Process-water discovery also scans
  entity IDs (`native_work_planner.rs`:966,1003,1021).
- The first 256 stable-ID workers of a party are always selected before busy
  workers are filtered. Parties rotate, workers within a party do not. An admitted
  party with more than 256 automatic Body/Position/Traversal members can therefore
  permanently exclude later IDs. Native admission has no matching per-party cap;
  the existing index test even authors 300 members. Current presets stop at 200,
  so this is an accepted-data fairness defect outside measured presets.
- `world.rs`:6724 compares active routes against one global terrain revision.
  A local edit can force remaining-path and structure revalidation across actors;
  line 6770 replans every invalidated route in that tick, outside the planner's
  route/admission caps. Individual A* searches are bounded to 4,096 expansions;
  this does not bound the aggregate tick. A Deferred result is not a resumable
  or hierarchical long-distance route implementation.

**Required change:** canonical due/eligibility indexes and fair bounded discovery,
charging visited and rejected candidates; route dependency invalidation and an
aggregate revalidation/replanning budget. Deferred work must preserve safe
occupation and remain distinct from an impossible path. Keep native
`pathfinding::kuhn_munkres_min`, the joint matching policy and real route witnesses.

### 5. Observation and subscriber cost remain broad

[`observation.ts`](../../src/runtime/observation.ts):33 builds one shared
observation per revision. Its query cache is useful, but `session.renderFacts()`
uses separate visual queries; native `render_facts` serializes positioned entities
before the JS port applies its 512-item slice
([`wasm-kernel.ts`](../../src/runtime/wasm-kernel.ts):791). The old finite probe
counted 34 native queries per observation, with repeated lot/tree reads.

The [host](../../../tools/public-engine-host/worker.ts):490,532,574 sends the same
observation to participants, serializing full deliveries per socket. Terrain has
an eight-patch credit limit; actor observations have no equivalent slow-subscriber
acknowledgment/coalescing boundary. Cold terrain production shares the simulation
owner's serial queue without a per-client work quota. These are source findings;
their server CPU share has not been measured.

**Required change:** one committed read context for actual projection consumers;
native bounded/spatial queries before JSON construction; retained projections and
bounded subscriber publication with resynchronization. Keep camera demand local
and disposable. Observation scope must be explicit: full-information cooperation
can be a valid game policy, but current shared snapshots and arbitrary in-bounds
terrain reads cannot supply hidden information, exploration or scoped AI views.
Camera interest is not permission to know a fact.

### 6. Persistent multiplayer has a lifetime ceiling and two admission defects

The durable core is worth keeping. [Region](../../../src/engine/region/index.ts):427,550
commits state, records, receipt and events in one owner transaction. The separate
clock frontier prevents duplicate alarms without accumulating tick receipts.
[SessionResident](../../src/runtime/region-program.ts):158 owns candidate
reuse/discard/reconstruction; the host accepts its resident after its surrounding
transaction finishes. Fresh focused laws confirm several of these boundaries.

However, Region defaults to **4,096 ordinary receipts**, with no retirement API.
The generic event cap is also 4,096; the current Session adapter emits no events
into that table. After receipt capacity is exhausted, new command identities reject
while old identities remain replayable. This is safe failure, not a long-lived
world policy. Add a declared retirement/replay frontier and durable outcome
consumption. Simply deleting old receipts could execute a retry twice.

An admission receipt is also not a generic completion result. Named commands
queue intent and return an empty result list (`region-program.ts`:70); the Session
adapter emits `events: []` at line 187. Latest action outcomes are replaced on
each step (`session.ts`:999), and the clock frontier retains only its latest
receipt. Canonical jobs preserve their own state, but there is no generic durable,
request-correlated terminal-result delivery and consumption capability. Region's
`readEvents()` is a paged read, without acknowledgment or retirement. A controller
must be able to distinguish accepted intent, ongoing work and terminal outcome
through the existing durable owner, including after reconnect or restart.

Two concrete source defects must be fixed before expanding host admission:

- First Colony join checks the invitation hash only when a world row already
  exists. It never enforces `SHA256(invite) === requested world handle` before
  initial insertion (`worker.ts`:662–674). Routing only checks shape and binds the
  DO to that supplied handle. Someone knowing an unused public handle can bind
  its first invitation incorrectly. This is a source finding with that precondition,
  not a claim that existing worlds were compromised.
- Colony v2 WebSocket acceptance stores a five-second authentication deadline but
  does not arm cleanup (`worker.ts`:958); v1 does arm it. In an idle world with an
  expired lease and deleted alarm, silent unauthenticated sockets can retain
  capacity until another event arms cleanup. Messages after the deadline reject.

Colony's participant binding is real, but other public games still map a bearer
token to a private world and fixed player scope. Another game cannot reuse shared
multiplayer merely by registering its pack. Generalize the existing admission
capability through a checked descriptor; do not create a second host authority.

### 7. Procedural extent is not large-world simulation capacity

These four capabilities must remain separate:

| Capability | Current status |
| --- | --- |
| Query a large deterministic base map | Implemented with bounded point/page generation; horizontal coordinates up to ±8,000,000 are admitted. |
| Play a larger map inside one Region | 256×256 has hosted finite-work evidence; larger local presets exist. Actors/work remain concentrated in a 57×57 placement area. |
| Retain and simulate large amounts of modified/populated world | Bounded single-owner limits below; sustained workload capacity is unqualified. |
| Share one world across authoritative Regions | Actor/cargo handoff, destination admission, fencing and recovery are not implemented in the current host/runtime/kernel. |

[`environment_definition.rs`](../../kernel/src/environment_definition.rs):506
installs one terrain owner with 32 cached generation pages, at most 65,536 edits
and **256 KiB encoded edits**. The page cache is evictable; 32 pages is not world
extent. Native entity state is limited to 16,384 entities / 8 MiB; record bundles
have a separate 9 MiB bound. Water retains up to 8,192 historical stocks, including
necessary drained zeroes; smoke has a 4,096 active-stock cap. These are safety
bounds, not performance promises, and another owner can impose a tighter limit.
Water already has copy-on-write pages and an awake queue; smoke already performs
bounded staged work. Neither should be described as a whole-world fluid solve.

The host's 15-second renewable lease advances 100 ms clock occurrences while
active. Lease expiry stops scheduled work. There is no committed elapsed-time
frontier, supported offline settlement or external-obligation wake policy. The
sleeping-world contract describes intended behavior, not current execution.

**Required change before a living regional-world claim:** qualify one bounded
active Region, then two actual authorities transferring an actor and finite cargo
with retained custody across failures. Add one supported sleeping process over
the existing durable clock/physical owners. Map LOD, camera chunks, record pages
and separate independent worlds do not establish these capabilities. Increasing
constants or adding DOs alone would leave the ownership problem unsolved.

### 8. The creator boundary accepts promises that it does not complete

[`behavior.ts`](../../src/sdk/behavior.ts):393 stores `.behaves()` metadata;
[`common.ts`](../../src/sdk/common.ts):233 serializes components without attachment
identity; [`session.ts`](../../src/runtime/session.ts):918 runs `pack.systems`.
The example behavior-attached cat in `colony-cat.ts`:189 is distinct from the
actually spawned `ColonyCatActor` in `colony-actors.ts`:68. `colony.ts`:328
independently registers the cat system. Attachment alone can be inert; separate
registration can apply behavior to matching entities without that attachment.

Finish one pack-preparation owner that validates, installs and scopes attachments
once. Prove two attached actor types execute once each while a matching unattached
actor does not. Current public `system()` **does check declared query reads**;
this corrects the old study's overly broad read-enforcement finding. Behavior
`exclusive` checks remain local to one invocation, not all composed systems.

Other creator limits are concrete:

- Native `instantiate-actors` in [`lifecycle.rs`](../../kernel/src/lifecycle.rs):20
  requires party/people slots and creates joining player/party identities. It is
  not yet general creature birth or enemy spawning.
- Buildables compile real footprint/cost/work/salvage data, but placement and
  visual registries still require coordination. Staged recipes are executable
  data; current process hosts require a finished construction site and sealed
  container (`process_transition.rs`:77). Keep those semantics explicit.
- `sdk/index.ts` mixes demos and runtime exports while real games import some
  capabilities directly. `worker-entry.ts`, client `page.js`, `engine/vite.config.js`
  and the public host embed demo choices. One external pack has not been qualified
  through the actual browser/build/DO entrypoints.
- MCP [`scene-operations.mjs`](../../../tools/asset-mcp/scene-operations.mjs):105
  exports Three JSON. [`static-authoring.js`](../../../src/art/static-authoring.js):100
  still bakes the fixed original bank. Custom scene export is not a playable
  asset installation. Finish the shared bake/metadata/pack join without changing
  the accepted raster art direction.
- Whistle command discovery is real. Its current projection is not a Shiitake
  execution integration. `tools/engine-controller/goblin.mts` targets the old
  engine; current `engine/src` and public host have no maintained Mycelium/Shiitake
  join. No executable Edmund creator join was found in the inspected Botanical
  packages/services/runtimes/apps trees.

## Deep owners to finish

These are changes to existing responsibilities, not a list of new frameworks.

| Owner | Invariants it must hide | Caller coordination it removes |
| --- | --- | --- |
| Pack preparation | Checked dependencies, attachment membership, current versions, supported content/art/catalog registration | Registering the same behavior/buildable in several places; hard-coded demo selection in transport |
| Native mutation/record owners | Capacity accounting, changed records, rollback, unique custody and domain cleanup | Whole-state recount/capture after local work; scheduler resetting another domain's fields |
| Work/navigation | Fair due discovery, budgeted route dependencies, safe deferred continuation | Population-wide invalidation and fixed-prefix starvation |
| Region/host | Atomic identity/effect/result, replay retirement, principal admission, clock and durable obligations | Caller-managed candidate/receipt/reset recipes and content-specific multiplayer admission |
| Committed observation | Shared revision reads, permission projection, bounded interest and publication | Repeated global queries and unbounded full delivery per subscriber |
| Client scene preparation | Local geometry/order/picking, residency, staged publication and disposal | Input handlers rebuilding the world view; cut-specific cache replacement |

Botanical source comparison supports this ownership split. Its actual Watchdog
exposes transaction-bound enqueue/cancel; Shiitake uses
`transactional.enqueueAcceptedJob` inside its owner coordinator
(`packages/shiitake/src/internal/runtime-coordinator.ts`:112). Mycelium exposes
checked capability registrations and bounded sandbox execution. Reuse these for
durable external AI obligations and scoped execution. They do not replace a
deterministic physical tick, a disposable camera query or a goods-transfer
protocol. BirdDog correspondence is not already cross-Region cargo custody.
Shiitake's concrete execution join is `ToolSource` in
`packages/shiitake/src/internal/contracts.ts`:85 (modules, capability sources and
sandbox); its compaction/maintenance extensions are not a game plugin runtime.

## Ordered qualification

1. **Make the existing game pleasant to inspect and play.** Execute report 19's
   bounded camera/cut/scene repair with original art. Preserve its 1 s/3 s loading
   gates and same-viewport 64/256 comparison; exercise moving actors, edits, cuts,
   rotation, eviction/return and cold demand. This remains the first playable
   delivery priority. Fix the two bounded host admission defects before broadening
   shared-world access.
2. **Establish a credible single-Region cost envelope.** Replace whole-state
   accounting/capture and join observation consumers; bound discovery and route
   invalidation, including the >256 fairness case. Hold productive work constant
   while independently increasing dormant entities/tasks, retained edits, map
   extent and subscribers. Then increase active work. Report tick/search/capture/
   commit/publication/render separately, with output and labor/routing/blocked
   counts. A finite 50-tree run cannot claim sustained population capacity.
3. **Prove ordinary creator edits end to end.** One external pack adds a creature
   behavior, supported buildable, recipe and baked asset through public imports
   and one checked build descriptor. The same pack runs in browser and DO hosts
   without engine/client/transport content-name branches. Record files touched
   and edit-to-play time; do not promise a time not measured.
4. **Qualify long-lived multiplayer and one AI participant.** Two independent
   clients and a scoped Shiitake controller use that pack's real commands. Include
   isolated permissions, two disjoint views, a slow receiver, repeated cold demand,
   lost replies, reconnect/restart and more than 4,096 ordinary commands through
   lawful retirement. Each admitted effect happens once and has a durable result.
5. **Earn the regional-world claim.** Two actual owners transfer an actor and finite
   cargo, fail at every custody transition, reject stale source authority and
   recover without duplication or loss. Settle one declared sleeping process once
   across repeated wake/retry. This is a later, explicit capability qualification;
   it is not a prerequisite for a smooth bounded colony game.

Steps 2 and 3 can expose independent narrow work after first working shapes are
reviewed; they do not justify parallel writers on shared session/record seams.
Keep one owner per coupled change and serial integration. No elapsed estimate or
maximum population follows from this audit.

## Evidence and limits

Fresh focused run **u3098**, invocation
`ac4c0c2ea99d4bf7a0f9227e131a667b`, used the shared 10-minute proof guard and
completed in about 2.5 seconds of test execution: **48/49 passed, exit 1**.
It covered SDK composition/public imports, Colony party definitions, actual
Session/Region record commitment, host protocol/clock and generic SQLite
Region/admission. Raw receipt/log:
`.botanical/engine-platform-audit-20260922/{laws.json,laws.log}`; a preserved
[evidence receipt](evidence/20260922-platform-audit-laws.md) records the inputs.

The failing disconnected-party test supplies obsolete `{kind:"player", player,
party}` scopes in `session-region-records.test.ts`:81,83. Current TypeScript and
Rust scopes accept only `player`; the actual host resolver at `worker.ts`:302
supplies that current shape. Native rejection was `unknown field party, expected
player`. This is a stale fixture, not demonstrated failure of the current host.
It remains red and unchanged; this run does not freshly prove disconnected-party
work. Two-party creation, failed-SQL rollback, exact replay and candidate disposal
did pass. It is not a hosted crash, latency or security test.

Preserved evidence has these narrower meanings:

- September 20 actual WASM/GameSession work completed 50 trees into 300 wood with
  32 workers and exact midpoint restore/replay. Warm workflow step median/p95 was
  7.19/28.80 ms; capture 3.41/4.70 ms; observation 6.91/9.09 ms. These are separate
  phases and their percentiles must not be added. One-second steps and a finite
  workload do not prove production-cadence saturation.
- Hosted 256-map performance evidence used eight workers, six moving and one
  felled tree; observed message spacing median/p95 was 82.5/195.4 ms. Cloudflare
  telemetry returned no rows: no server CPU, billing or client-capacity claim.
- The `5490219e` party witness records distinct parties, response-loss restart,
  reconnect identity and continued work with another observer. Current host/
  Session/Region source differs; that witness is historical, not current parity.
- September 22 browser proof used exact local frontend files at the allowed
  origin and a real hosted DO/WebSocket backend. It was not hosted-frontend parity.
  Both matched loading runs missed the readiness gates. Full Chrome/SwiftShader
  supports correctness/cost diagnosis, not a hardware smoothness claim.

No source fix, native rebuild, dependency change, deployment or new capacity
benchmark is claimed. There is no fresh Fallow clean bill; the current code still
has large shared-Kernel and client coordination hotspots. Source inspection cannot
prove absence of every bug. It does establish enough concrete blocking boundaries
to reject present-day platform readiness while preserving the useful foundation.
Independent native, host and creator reviewers checked this report; corrections
to rollback scope, horizontal extent and admission-versus-completion results are
incorporated.
