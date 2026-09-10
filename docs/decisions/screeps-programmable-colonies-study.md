# Programmable colonies, distributed time and durable execution

## Findings and recommendation

Screeps demonstrates the central product idea: a player's code controls a colony
in a persistent shared world, including while its human is absent. Its distributed
server processes player decisions and world rooms separately. That is a useful
precedent for Hive's human, delegated assistant and independent AI controllers.
It does not establish that arbitrary continuous simulation is cheap, or that
Hive should synchronize every region behind one worldwide tick.[^1]

The recommended Hive design has three separately budgeted kinds of work:
**player-program decisions, ordinary autonomous game activity, and environmental
simulation**. A saved program can choose a job, then stop consuming script CPU
while ordinary actors execute it. Regions wake when their next consequential
event is due, when a program is scheduled, or when another participant interacts
with them. Human absence does not disable explicitly enabled autonomous play.
Human absence also does not require detailed processing of every empty place.

Mycelium already supplies the relevant capability/execution boundary: a trusted
host registers typed operations and supplies an isolated sandbox. Botanical's
current Hub and local hosts already compose this with Cloudflare's Code Mode executor.
Saved program source, durable scheduling, program memory and game-command
commitment are distinct responsibilities. A successful script invocation is not
a transaction encompassing every tool call it made.[^12][^13]

This recommendation extends the [sleeping-world decision](local-snapshots-and-durable-ai-jobs.md)
and [many-faces contract](vishnus-many-faces.md). It preserves browser and DO
targets, the same game authority for humans and programs, and the large-world,
deep-digging and multi-storey direction. It does not depend on an LLM answering
once per physical tick.

## How Screeps advances its world

### Decisions become intentions, then the world changes

Screeps exposes a view of the world at the start of a tick. A player's script
issues action intentions; it does not directly mutate authoritative positions or
invent resources by assigning object properties. The world resolves conflicting
actions through game rules. Consequently a method returning success can indicate
that an intention was accepted, without guaranteeing that every competing action
will execute.[^2][^3]

This separation is worth adopting directly. Hive's existing command receipts
already distinguish admitted orders from subsequently completed pawn work.
Programming should expose that distinction clearly: an accepted excavation order
is not a hole, and an accepted hauling order is not delivered water. Programs
need readable completed/blocked outcomes and stable identities rather than
repeatedly issuing the same order until a sprite looks different.

### The global tick is a synchronization boundary

The public architecture describes stages: process player scripts in parallel,
then process rooms in parallel, resolve shared work and advance game time.
Independent workers consume task queues, but the next stage waits for its
predecessor. The documented game tick is workload-paced; it is not a promise of
a fixed number of ticks per real second.[^2][^4]

The retained architecture page contains old Node/Mongo/Redis versions, hardware
figures and sandbox details despite its newer page footer. Those are historical
facts about the design, not current fleet or cost measurements. Public source
must qualify stronger claims about modern execution and persistence.

The presence of multiple shards is another important boundary. Screeps exposes
per-shard CPU allocation, separately executed player scripts and separate script
memory. InterShardMemory supplies a distinct cross-shard communication surface.
Therefore “global” must not be read as proof that every production shard waits
at one universal barrier.[^5]

For Hive, a shared calendar or comparable timestamp is useful. Requiring every
owner to finish step N before any owner may execute step N+1 is a different,
much stronger requirement. Distant regions should not depend on each other's
tick duration. Interacting regions need causal ordering at their actual shared
boundary; unrelated regions do not need to vote on that ordering.

The original worldwide barrier did encounter a concrete scaling limit. Screeps's
2017 sharding announcement says its central database became saturated and adding
runtime servers no longer helped. They moved to independent shards with separate
databases, maps and workers; tick rates and counters could differ. That is a
strong reason to adopt explicit synchronization domains rather than assume one
global tick will remain cheap as the world grows.[^8]

### What the pinned implementation adds

The examined main loop confirms this normal sequence:[^9]

```text
eligible player scripts in a worker queue
    -> wait for the player queue
active rooms in a worker queue
    -> wait for the room queue
commit hook -> shared cross-room processing -> commit hook
    -> advance shard game time -> publish -> schedule next tick
```

The public standalone driver selects accounts with `active != 0` and positive
CPU allowance, rather than connected browsers. Loading an account that has no
owned world objects marks it inactive. Room activation is a separate set;
intents and qualifying ongoing objects reactivate rooms. Thus an offline colony
can remain active while an empty account does not receive the same work.[^10]

Inactive rooms still have maintained deadlines. The standalone backend checks
them periodically and activates those due for an update. Owned controllers,
some temporary objects and other ongoing effects can keep rooms active. This is
already more selective than simulating every generated room on every tick; it
is not a general exact analytical catch-up engine.[^20]

The local driver's default minimum tick is 1,000 milliseconds, with an override
available. If work exceeds that minimum, the next tick waits for completion;
the source does not force a 20Hz physical game into that budget. This default is
not the production MMO's current tick rate or an SLA. Screeps's discrete 2D
room rules and bounded action intents also differ substantially from Hive's
current volumetric environment cost.[^10][^21]

### CPU allowances make the cost explicit

Screeps limits player script execution in CPU milliseconds. Its documented
allowance can accumulate unused capacity into a bucket, supporting occasional
bursts such as route calculation. The documented bucket reaches 10,000 CPU units,
with a current-tick ceiling up to 500 milliseconds. The account's normal
allowance is separate from that burst ceiling.[^6]

This is capacity accounting, not free computation. It limits damage from a slow
program and spreads bursts over time. It does not pay for unlimited room physics,
database writes or networking, and it does not establish a million-player
capacity figure. The public evidence does not provide a current total cost per
active colony that can honestly be transferred to Hive.

The inspected standalone runtime charges measured clean script time plus a
fixed tariff for counted intents, then updates the bucket. The tariff is not a
measurement of the eventual engine work that each intent causes. Dirty runtime,
world-view assembly and memory serialization expose additional host work.
Reusable isolates and module caches reduce repeated setup; they do not create
free or unlimited execution.[^11]

Screeps also makes persistent player memory explicit. The documented Memory
object stores bounded JSON; IDs should be retained instead of live game-object
references. Parsing that memory counts toward the player's script cost. Runtime
globals and compiled code can be useful caches, but the durable player interface
must not depend on a particular process staying warm.[^7]

### What its persistence does not prove

The project explicitly shares its engine with the official game, while the
public driver, storage and backend are standalone implementations. The examined
local driver has a no-op `commitDbBulk` hook; individual bulks mutate the local
storage, which uses periodic autosave. Queue reset clears pending/processing
entries. None of that establishes atomic crash recovery for a whole tick, and
none establishes the live MMO's current recovery guarantees.[^22]

Within a shard, inter-room movement uses a shared processing pass after room
work. It changes the same creature object's room/position and activates the
destination. This is an explicit authority decision, not two independent room
databases each deciding they own the creature. The production cross-shard
transfer service is not present in the examined public source closure; no
exactly-once transfer claim can be imported from it.[^23]

## What “cheap at a million players” would actually mean

Registered accounts, online humans, enabled programs, populated regions and
currently due decisions are different counts. An account with no enabled program
or active world obligation does not need a recurring execution. An offline
human with enabled automation can generate real work. A program that manages
forty people should generally make one bounded colony decision, rather than
requiring forty separate sandbox starts.

The following arithmetic is illustrative, not a benchmark or provider quote:

```text
decision executions per second = enabled programs / mean interval in seconds
CPU-core equivalent = executions per second × mean CPU milliseconds / 1000
```

| Enabled programs | Mean interval | Hypothetical CPU per decision | Decisions/second | CPU-core equivalent for decisions alone |
| ---: | ---: | ---: | ---: | ---: |
| 100,000 | 1 second | 1 ms | 100,000 | 100 |
| 1,000,000 | 10 seconds | 5 ms | 100,000 | 500 |
| 1,000,000 | 60 seconds | 5 ms | 16,667 | 83.3 |
| 500,000 | 30 seconds | 2 ms | 16,667 | 33.3 |

These figures omit scheduling, serialization, storage, sandbox startup, tool
execution, simulation, networking and burst headroom. They are not numbers of
DOs, purchased servers or a monthly bill. Wall time waiting for a tool is also
different from guest CPU time. A short script that requests expensive global
queries can cost more outside the sandbox than inside it.

The promising optimization is to avoid unnecessary decisions and unnecessary
world steps. Cache stable queries at their existing owners, group related work,
schedule meaningful deadlines, and invoke programs when observations they depend
on change. A periodic fallback can prevent missed opportunities, but should have
a lower bound, coalescing and a budget. The cost of awake, interactive regions
still needs measurement using the actual game workload.

## A programmable colony without a worldwide barrier

### Four activities, four cadences

| Activity | Proposed cadence | Authority |
| --- | --- | --- |
| Human rendering and input feedback | Display-rate work while a client is present | Client; no physical settlement |
| Ordinary pawn movement, jobs and local hazards | Bounded local simulation, with supported coarse progression when unattended | Region and existing game systems |
| Saved player program | A meaningful event or a budgeted periodic decision | Trusted controller host invokes isolated code |
| LLM authoring or exceptional strategy | Human request or explicit delegated need | Shiitake Session, outside simulation stepping |

For example, a player can ask an LLM to write a policy that keeps water available
and orders a second excavation when storage permits. The approved saved code
then runs without another model request on every invocation. It examines its
permitted observation, chooses supported ordinary orders and records small
strategy memory. Actors use the same movement, carrying, needs and work owners
as manually controlled actors.

A program need not run every time a worker takes a step. It may wait for “job
blocked,” “stock below threshold” or a bounded reevaluation time. Those event
interests must be supported game facts with owner-maintained queries, not
arbitrary user callbacks injected into physical loops. Many matching events can
coalesce into one decision that reads current state.

This also preserves the appeal of logging back in: people did useful work and
the results are visible. The game should show a concise history of orders,
completed work, shortages and program errors. A player can disable automation,
change its policy or take direct control. Ordinary play remains accessible
without editing code.

### Sleeping and programmed activity coexist

A region can sleep between scheduled events while remaining logically active.
A passive process has a completion date, a worker has a next consequential
activity, and an enabled program has a next decision or registered interest.
The host saves those facts and wakes when needed; it does not keep a JavaScript
loop running just to remember them.

Detailed water/gas progression is needed where its changing result affects
current interactions. Supported coarse basin/room evolution may cover quiet
intervals while preserving physical totals. If a danger demands frequent local
resolution, that region can remain busy. It still does not keep distant owners
busy. An enabled program changes the activation calculation, not the geometry
or conservation rules.

Arbitrary user JavaScript cannot generally be fast-forwarded analytically. A
script could branch on any observation at each call. We must define the calls
it is promised: scheduled decisions, event deliveries and available CPU. Between
those calls, trusted game jobs may advance by supported rules. Missed deadlines
need an explicit late/coalesced policy rather than pretending thousands of past
script decisions occurred.

### Fairness and cross-region interaction

An attacker must not encounter a defender frozen solely because its human is
offline. An interaction first brings the affected participants to a compatible
causal point, delivering relevant game events to their enabled controllers under
the declared timing policy. The server can activate a bounded interacting group
or move tightly coupled activity under an appropriate owner. There is no implied
worldwide barrier and no claim that arbitrary flood or battle partitioning is
already solved.

Periodic deadlines should be distributed in time rather than aligned so that a
million programs wake on the same second. Fair queues, limited bursts and
per-player/world quotas prevent one program from starving another. Capacity
exhaustion must have visible consequences such as a delayed decision or halted
program; it must not silently delete paid work or invent successful actions.

## Mycelium and the Cloudflare execution choices

### Mycelium is already the relevant execution door

The public Mycelium API accepts typed modules/operations and a host-provided
sandbox. Its execute tool accepts JavaScript, exposes only compiled bindings and
Forage discovery, and supplies cancellation plus an invocation identity.
The tool can be invoked directly by its host; an LLM does not have to generate
the same code again on every scheduled run.[^12]

The current Hub MCP handler is an actual non-model caller: it opens Mycelium,
acquires a lease, prepares an `execute` ToolCall containing the supplied code,
collects the execution stream and releases its resources. Knapsack is useful
when a real Computer or file connection must be discovered; it is unnecessary
merely to execute saved player JavaScript. A lease revision identifies compiled
capability projections, not the selected player program's code version.[^24]

Hive already has `createRegionControllerModule`: trusted code binds a principal
and observation projection before creating the module. Guest commands carry
stable IDs and expected revisions; Region owns their results. The guest cannot
pick an arbitrary authenticated principal through that module. This is the
existing seam to extend, rather than creating a separate game-agent protocol.

Both the current Hub adapter and local implementation use `DynamicWorkerExecutor`
with `globalOutbound: null` and RPC-backed operation bindings. The local version
hosts that execution inside workerd/Miniflare; Hub supplies its ordinary Worker
Loader directly. This establishes the existing source composition, not a new
production throughput qualification. The local per-invocation Miniflare setup
must not be used as a capacity model for a hosted million-program service.[^13][^24]

“Sandbox” here is Mycelium's interface name, not a requirement to use the
Cloudflare Sandbox SDK. The current executor uses isolated Dynamic Workers;
it does not start a Linux container. Code Mode's executor wraps the loader and
tool-call bridge. No additional container or second execution framework is
needed for this proposed JavaScript consumer.

The inspected Mycelium default timeout is 180 seconds, with a five-second abort
grace, bounded result serialization and limited concurrent backing executions.
Those are generic tool lifecycle protections. They are neither an appropriate
default game decision budget nor a per-player CPU accounting system. A game
host must choose smaller decision policies and meter costly host operations as
well as guest CPU.[^12]

The inspected Code Mode executor exposes no external AbortSignal/dispose method,
and Hub explicitly retains its backing promise until settlement. Mycelium blocks
new bound calls after cancellation, but a previously admitted native operation
may finish. A wall deadline is therefore not proof that all work was killed.
The current Home adapter also does not configure native CPU/subrequest limits;
the installed executor's public options do not expose those controls. Their
composition is a concrete platform qualification need, not an existing Screeps-like
budget.[^24]

### Which Cloudflare product does what?

| Product | Actual role | What Hive/its host still owns |
| --- | --- | --- |
| Dynamic Workers | Load supplied JS modules into isolates, with chosen bindings, network policy and resource limits | Durable source/version registry, authority, cadence, memory and results |
| Code Mode executor | Run JS that composes host tools through a Dynamic Worker and return its result/errors/logs | Whether a particular saved script may run; durable game effects and retries |
| Code Mode runtime facet | Named saved snippets, execution history and explicit replay/approval support | Immutable selected player version, game grants, schedules and effect ownership; currently not joined to Mycelium |
| Workers for Platforms | Deploy named user Workers and route through dispatch namespaces | Game-specific version activation, owner permissions, program memory and scheduling |
| Sandbox SDK | An isolated Linux container for commands, files, processes and broader language/tool needs | Persistent source/checkpoints and restoration after the live container stops |
| DO alarms / schedules | Wake durable owners for due work | Correct committed schedules, deduplication, resource budgets and game time |

Dynamic Worker `load()` creates a one-shot instance; `get(id, callback)` permits
warm reuse. The loader's example retrieves source from a host-owned store.
Warm reuse is not durable script storage. Code Mode's executor itself supplies
execution rather than snippet persistence.[^14][^15]

There is an existing higher-level option: installed Code Mode 0.5.1 exports
`createCodemodeRuntime`, with direct execution, durable named snippets and
execution records in a DO facet. `saveSnippet` replaces the same name and can
promote code from any execution status; callers must decide what is suitable to
keep. A name and saved timestamp are not an immutable selected player version.
Mycelium presently uses only the executor.[^25]

The runtime's replay/rollback features are not game transactions: rejecting a
pending action does not undo earlier actions, and rollback calls optional
connector compensation. If we adopt this facet for authoring/history, one owner
must control execution/replay and Hive must retain physical receipts. Do not
wrap two independent replay systems around the same command. This maintained
option deserves evaluation before implementing a new snippet library.[^25]

Workers for Platforms supplies a named deployment/control plane; it can be useful
when customer programs are managed as deployed applications. A saved colony rule
does not automatically require a separate deployment for each version. Prefer
the smaller existing Mycelium/loader path until a demonstrated lifecycle needs
the deployed-worker model.[^16]

Sandbox SDK is useful for a real Linux workload, but a short JavaScript colony
decision does not need an always-running container. Container files and
interpreter state are disposable unless backed up/restored explicitly; the
presence of a DO managing a container does not make its whole filesystem durable.
Reserve this option for capabilities that actually require it.[^17]

Cloudflare supports per-invocation Dynamic Worker CPU and subrequest ceilings.
They should complement a wall deadline, command/query quotas, result/log bounds
and a trusted schedule. Access should initially be limited to authorized game
operations and bounded memory; no raw database, administrative capabilities or
general external network access is required for colony decisions.[^18]

## Durable programs are more than durable code strings

A useful saved program includes immutable code/version identity, the player and
delegation it belongs to, enabled state, bounded JSON memory, schedule/event
interests, execution budget and recent outcomes. A running decision captures
the exact version and authority it started with. Installing a new version or
revoking a grant must not silently change an already-admitted decision's meaning.
Whether to cancel it or allow an already-committed result to stand is explicit.

Program memory is strategy data, not game authority. It may remember a target ID
or a last successful order. It cannot assert that an item exists, that a job
finished or that an enemy was observed. Missing processes rebuild from saved
data; heap globals are caches.

### Two different effect contracts

**Existing interactive tool execution:** a program can call an admitted command,
then fail later. The first command remains committed. A timeout or missing final
result is not permission to rerun all commands with fresh IDs. Each effect needs
its own stable receipt identity, and access to replayed receipts still requires
current host authority. Mycelium's transient execution ID identifies an invocation,
not each game command or a transaction encompassing the whole invocation.

**Recommended smallest scheduled decision:** give the program a scoped read
surface and bounded memory; let it return one ordinary command proposal and next
memory. The trusted owner revalidates the current revision and grant, then commits
the admitted decision, memory and next schedule coherently. Guest evaluation
causes no world mutations in this first contract. This uses the ordinary Mycelium
execute operation and existing Region command data; it does not make arbitrary
tool calls transactional or create a second simulation.

If later scheduled programs must issue several immediate commands and inspect
intermediate results, their durable action sequence needs a clearly defined
continuation/replay contract. Replaying a nondeterministic script against a newer
world is not equivalent to replaying its old effects. The first single-proposal
consumer deliberately avoids that extra requirement without limiting ordinary
human or interactive-agent command semantics.

### Failure and wake rules

| Event | Required outcome |
| --- | --- |
| Program times out or throws before proposal settlement | No new world effect from that evaluation; retain prior committed memory and an explicit failure outcome |
| World revision changes before settlement | Revalidate/reject under the ordinary rules; any reevaluation is a new decision with bounded retry budget |
| Commit succeeds but acknowledgment is lost | Return the saved outcome for that decision; do not spend goods or program time twice |
| Program is disabled or permission revoked | Stop new admitted effects; separately authorize access to historical results |
| Sandbox is temporarily unavailable | Retain due work or record a declared delay; do not claim that the colony decision happened |
| Owner is evicted after accepting scheduled work | Recover the saved obligation through durable wake; process RAM is not the schedule |
| A malicious program floods queries or schedules | Enforce host-owned limits; guest requests cannot create unbounded recurring work |

DO alarms provide at-least-once wake, with one physical alarm slot per object.
An owner can multiplex its earliest due events. Existing Botanical wake/Watchdog
and App authority should be used where their actual contract fits; a new generic
game scheduler is not the starting point. An alarm alone does not atomically
settle program effects or preserve an unlimited retry log.[^19]

Botanical's current Shiitake Cloudflare host now commits its SQL mutation and
alarm together, then rearms while pending work remains. That is a concrete
reference for closing the accepted-work-to-wake gap; it is not already a saved
Hive-program scheduler. Keep its owner-local wake design while selecting the
game's due-work representation and admission policy.[^26]

## Near-term application to the actual Hive engine

Two existing consumer details need correction before interpreting earlier
controller evidence as current multiplayer readiness: the Goblin controller
still projects `actor.level` despite signed physical coordinates, and it uses
one fixed player principal/command-ID namespace. These are specific observation
and admission limitations. They do not invalidate the reusable module pattern,
but they cannot be copied into a multi-player program host unchanged.

The current Region owner retains a bounded set of receipts/events; it is not an
infinite scheduled-run archive. The default receipt capacity of 4,096 would fill
in roughly 205 seconds if a host wrote one new durable advance command at 20Hz.
Sustained play needs an explicit batching/retention lifecycle with replay safety,
not a larger unbounded in-memory queue. Existing DO rollback/restart proofs remain
useful evidence for individual transitions, not this full host lifecycle.

The smallest proposed player-facing outcome is a colony policy authored once,
enabled visibly, and run through the real Mycelium sandbox while the browser is
closed. Two independently scoped programs should submit ordinary work, preserve
their own bounded memory and display actual completed/blocked results on return.
One lost-ack/restart case should demonstrate no duplicated order or consumed
goods. A timeout and disable case should show that the human retains control.

First use the existing bounded rest/dig command surface after its current-state
corrections. Add a richer water/storage policy when those normal game commands
are exposed; do not invent a special scripted hauling implementation. Keep the
simulation local to one playable region initially. A second independent region
can demonstrate that one slow script does not stall the other's clock; that does
not yet prove seamless cross-region combat or fluid exchange.

This work follows the client/simulation separation and a useful online owner.
It complements current performance correction rather than replacing it with
another laboratory. No pricing tier, million-player capacity, new paid service,
host deployment or mandatory coding interface is established by this study.

## Product choices that remain open

The programmable-world direction is clear. The remaining choices are tunable
contracts: baseline decision frequency, allowed bursts, event wake latency,
offline danger, how unattended labor progresses, how long an enabled policy may
run without its human, and how paid compute relates to competitive fairness.
These should be visible in play and measured cost rather than hidden behind the
word “tick.” Safety care routines should not depend on a paid LLM request.

The recommended default is continuing useful ordinary work while offline,
budgeted script decisions and event-driven reevaluation, with understandable
limits and a clear disable/take-over control. “Alive while absent” is the product
promise; detailed CPU use in every location at every moment is not required to
deliver it.

## Sources

[^1]: Screeps, [standalone distributed server](https://github.com/screeps/screeps), official repository, accessed September 10, 2026. Product premise and process/module structure.
[^2]: Screeps, [Understanding game loop, time and ticks](https://docs.screeps.com/game-loop.html), page dated May 29, 2026; retained terminology checked against source. Snapshot/intent/tick semantics.
[^3]: Screeps, [Simultaneous execution of creep actions](https://docs.screeps.com/simultaneous-actions.html). Accepted intents and conflict rules.
[^4]: Screeps, [Server-side architecture overview](https://docs.screeps.com/architecture.html). Historical distributed stages; old stack/fleet details are not current capacity evidence.
[^5]: Screeps, [Game.cpu and InterShardMemory API](https://docs.screeps.com/api/#Game.cpu), accessed September 10, 2026. Per-shard execution, budget allocation and memory boundaries.
[^6]: Screeps, [How does CPU limit work](https://docs.screeps.com/cpu-limit.html), page dated May 29, 2026. CPU allowances and bucket behavior.
[^7]: Screeps, [Global Objects and Memory](https://docs.screeps.com/global-objects.html), page dated May 29, 2026. Command-only world mutation, bounded JSON memory and serialization cost.
[^8]: Screeps, [World Shards Launched!](https://blog.screeps.com/2017/08/shards/), August 3, 2017. Official historical database bottleneck and independent shard design; not current performance telemetry.
[^9]: Screeps engine, [main loop](https://github.com/screeps/engine/blob/80977824199a596d174d392fd0cf8c458c21fcbd/src/main.js), pin `80977824199a596d174d392fd0cf8c458c21fcbd`, June 1, 2026. Stage barriers, global phase and completion-paced delay.
[^10]: Screeps driver, [selection and defaults](https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/index.js), and [runtime data](https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/runtime/data.js), pin `cf63d8adf902663e2ebddd7f8c5b7baa425dc928`, April 1, 2026. Separate account and room activity, owned objects and local timing defaults.
[^11]: Screeps driver, [runtime admission/accounting](https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/runtime/make.js), [runtime timing](https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/runtime/runtime.js), and [isolate lifecycle](https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/runtime/user-vm.js). Public standalone source, not an installed capacity test.
[^12]: Botanical, Mycelium public API/execution source, initially read at integration `6c926fd0d6bb920019b84d28b6a745db89601b55` and checked in the peer review at `14d9648722a9dd9b9a088b390a1de1273c5c766d`: `packages/mycelium/src/index.ts`, `execute-tool.ts`, `internal/execution-lifecycle.ts`. Local source in `/home/levi/src/Botanical-lane-integration`; source inspection, not a new hosted qualification.
[^13]: Botanical, integration `6c926fd0d6bb920019b84d28b6a745db89601b55`, `runtimes/local/src/private-workerd-sandbox.ts` and `internal/private-workerd-sandbox-worker.mjs`. Existing Code Mode/loader composition and scoped RPC. Local implementation is not a production throughput measurement.
[^14]: Cloudflare, [Dynamic Workers getting started](https://developers.cloudflare.com/dynamic-workers/getting-started/), updated August 27, 2026. One-shot versus warm loader and host-supplied code.
[^15]: Cloudflare, [Code Mode example](https://developers.cloudflare.com/dynamic-workers/examples/codemode/), updated May 5, 2026. Executor, host tool bindings, timeout and outbound policy.
[^16]: Cloudflare, [Workers for Platforms architecture](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/), updated April 21, 2026. Named user Worker deployments and dispatch.
[^17]: Cloudflare, [Sandbox lifecycle](https://developers.cloudflare.com/sandbox/concepts/sandboxes/), updated September 1, 2026. Disposable Linux runtime and restoration responsibility.
[^18]: Cloudflare, [Dynamic Worker custom resource limits](https://developers.cloudflare.com/dynamic-workers/usage/limits/), updated August 27, 2026. CPU and subrequest caps.
[^19]: Cloudflare, [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/), updated April 21, 2026. Single alarm, at-least-once delivery and retries.
[^20]: Screeps backend-local, [maintenance jobs](https://github.com/screeps/backend-local/blob/9d079282303ec04e577ac2bb97f64312b25e4ccd/lib/cronjobs.js), pin `9d079282303ec04e577ac2bb97f64312b25e4ccd`, April 1, 2026; engine [processor activation](https://github.com/screeps/engine/blob/80977824199a596d174d392fd0cf8c458c21fcbd/src/processor.js).
[^21]: Screeps driver, [terrain and pathfinding](https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/path-finder.js); engine [build settlement](https://github.com/screeps/engine/blob/80977824199a596d174d392fd0cf8c458c21fcbd/src/processor/intents/creeps/build.js). Concrete bounded game rules, without a measured Hive comparison.
[^22]: Screeps, [module ownership](https://github.com/screeps/screeps/blob/7ff972231c0a0a7aa91978297432ddb806976281/README.md); storage [queue](https://github.com/screeps/storage/blob/3d6c3d0e36f98375ae1b6a76136c4b9e1b727e85/lib/queue.js) and [database](https://github.com/screeps/storage/blob/3d6c3d0e36f98375ae1b6a76136c4b9e1b727e85/lib/db.js); driver [commit hook](https://github.com/screeps/driver/blob/cf63d8adf902663e2ebddd7f8c5b7baa425dc928/lib/index.js). Standalone persistence limits only.
[^23]: Screeps engine, [cross-room global processing](https://github.com/screeps/engine/blob/80977824199a596d174d392fd0cf8c458c21fcbd/src/processor/global.js), and [creep boundary intent](https://github.com/screeps/engine/blob/80977824199a596d174d392fd0cf8c458c21fcbd/src/processor/intents/creeps/tick.js). Shared owner pass within a shard.
[^24]: Botanical, Integration `14d9648722a9dd9b9a088b390a1de1273c5c766d`, `apps/hub/src/agent-mcp.ts:98–129` and `apps/hub/src/home-capabilities.ts:31–155`; installed `@cloudflare/codemode` 0.5.1 public declarations. Current non-model Mycelium caller, per-operation authorization and executor/cancellation limits; source read under `/home/levi/src/Botanical-lane-integration`.
[^25]: Cloudflare, [Code Mode API reference](https://developers.cloudflare.com/agents/tools/codemode/api-reference/), updated July 22, 2026; corroborated by installed 0.5.1 `dist/index.d.ts:100–138,565–661`. Runtime facet, snippets, replacement and explicit replay/compensation; these are separate from Mycelium's executor use.
[^26]: Botanical, Integration `14d9648722a9dd9b9a088b390a1de1273c5c766d`, `packages/shiitake/src/cloudflare.ts:65–153`. Durable pending-work wake/rearm and SQL-plus-alarm commitment. Existing reference source, not Hive scheduling acceptance.
