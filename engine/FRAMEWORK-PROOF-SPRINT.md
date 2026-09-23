# Framework proof sprint: one productive, durable Region

September 23, 2026. **Current source plan, not a capacity claim.** This is the
single ordered sprint for proving the native Hive engine on a Cloudflare Durable
Object. Levi's current priority is the simulation/host loop, not rendering. The
playable Clearing and original-art acceptance still matter, but do not drive this
performance pass. The [Clearing delivery plan](CLEARING-CONSOLIDATION-PLAN.md),
[coherent-world sprint](implementation/clearing-repair/15-coherent-world-and-creator-sprint.md),
[platform audit](implementation/clearing-repair/20-engine-platform-audit-20260922.md),
[performance audit](CLEARING-PERFORMANCE-AUDIT.md), and
[pathfinding plan](PATHFINDING-AND-ASSIGNMENT-PLAN.md) are contracts and evidence;
their conflicting ordered queues do not run beside this sprint. Already landed
assignment retention, state-accounting indexes, and disposable Region candidates
remain in place. This sprint has one integration owner and one writer per coupled
seam in isolated worktrees; review a working shape before expanding it.

## What the sprint must prove

One **256×256 authoritative Region** sustains 100 workers doing real, distributed
Colony work through the *same* native code and DO host used by public games.
Commands, movement, materials, environment, clock, receipts and scoped results
survive failure and restart without duplicate effects. A second game pack and a
scoped Shiitake controller then use that same public engine/host boundary without
copying simulation rules or granting another mutation authority. This is a
bounded **single-Region framework proof**, not a Minecraft-sized world claim.
The playable Clearing stays deliberately small; 256×256 is the capacity fixture.

The current tests do not prove this. The 256/100 preset puts 50 tree jobs and
its workers in a central 57×57 area. The 100-worker/100-tree local fixture uses
128×128 bounds with the same concentration. Both eventually complete, but their
idle tails, absent DO commit, and unmeasured concurrent useful labor cannot
qualify the target. Same-build local disposable-candidate plus record capture
had 16.29 ms median and 47.20 ms p95 for its first 100 active steps, with a
568 ms cold first step; whole-run timing did not improve. These numbers are a
diagnostic baseline, not a hosted result or an end-to-end speedup.

## One loop, with deep owners

```text
accepted scoped command / due alarm
  -> Region chooses one ordered occurrence and private candidate
  -> native world advances bounded due physical work and planning
  -> native mutation owner emits stable changed records + continuation
  -> Region atomically commits records, clock, receipt/result, wake obligation
  -> committed observation owner projects affected facts for actual recipients
  -> client prepares/presents its own camera view
```

The Region/DO owns command identity, transaction, recovery, clock and wake. The
native world owns physical mutation, unique custody, work and environment. The
native navigation/work owner owns route continuation, topology dependencies,
assignment episodes and fair budgets; preserve its joint optimizer and current
eight-at-a-time admission. The record owner exposes puts/removes with stable
identity and a current-format full checkpoint/recovery oracle. Observation owns
permission-scoped projection and delivery invalidation. Pack preparation owns
definition/behavior registration once; the external controller uses only scoped
actions/results. Callers do not coordinate internal maps, reset fields or write
another world's facts. No general event bus, ECS rewrite, per-tick model call,
renderer switch or parallel authoritative state is part of this cut.

## Ordered gates

### 0. Pin an honest workload and cost ledger

Create a versioned 256×256 seed with **at least 100 independent finite work
chains initially available** and replenished cohorts for a sustained run. Spread
workers, resources, destinations and jobs across several distant quadrants;
include long routes, hauling/carrying, obstacles, topology edits, water and air.
Do not achieve a pass by counting idle workers or merely enlarging generated
bounds. Run the same fixture through local native/Region, local workerd and the
separate hosted performance DO. Fix the seed, commands, duration, source hash,
WASM build, host version, client count and hardware/runtime context in evidence.

Every sampled window reports *assigned/moving/working* workers, useful outputs,
completed chains, capacity/blocked reasons, oldest waiting job, route distance,
expansions, deferred versus no-path results, replans and field backlog age.
Measure native phase CPU, full/delta capture CPU and bytes, SQL commit wall time
and rows, observation construction, socket delivery, alarm lateness, cold
recovery, memory and DO invocation CPU separately. Include active-window p50,
p95, p99, maximum and total output; settled ticks do not enter active latency
percentiles. First run establishes failure and identifies dominant costs. It
does not license changing the workload between before/after comparisons.
Before measuring the final run, freeze the qualification window at **10 minutes**
of hosted active time and the work mix. At least 90 of 100 workers must hold a
valid useful assignment, be moving toward one or performing it, in at least 90%
of one-second samples; every successive minute must complete finite output.
Count blocked/resting/unreachable actors separately rather than calling them
productive. A saturated fixture may legitimately fail this target and expose
the next owner to fix; do not quietly loosen or redesign it after seeing results.

### 1. Make changed state proportional to change

Replace byte-offset chunks of a whole serialized entity image with stable,
versioned records emitted by canonical mutation owners. A length change to an
early entity must not dirty unrelated identities. Bounded puts/removes, staged
candidate disposal and current-format full checkpoint/recovery are one owner
contract. Region commits records, command/result identity, clock and obligations
in one SQL transaction; an uncommitted candidate is never published. Reject
unsupported old formats clearly. Retire the superseded diff/capture path once
its callers move. Test a busy 100-worker step and long/short value changes
against the existing 1 MiB changed-record admission limit; no retry loop may
permanently strand a valid step. Record actual bytes/rows, CPU and restore time.

This gate preserves quantity conservation, unique custody, deterministic RNG,
claims, exact-once completion and same-input command replay. Failure injection
at candidate execution, capture, SQL commit and postcommit response must return
the old committed world or the single committed new result, never both.

### 2. Make long navigation advance and local edits stay local

The route owner must retain bounded search progress (or a measured regional
hierarchy) across steps. A 4,096-expansion budget exhausts to **pending**, not
no-path; repeated reviews may not redo the same prefix indefinitely. Terrain
and structures publish affected topology so only intersecting live routes are
revalidated. All route search, invalidation and replanning share an aggregate
per-occurrence budget; one edit cannot trigger unbounded work. Preserve the
existing assignment episode, priority, route metric, movement, claims and cargo
continuation. Prove far feasible routes finish with bounded work, blocked routes
terminate correctly, an unrelated edit leaves valid routes intact, and a local
cut reroutes affected actors without duplicate goods. Record search cost and
labor utilization before/after, not only path length.

### 3. Make host cadence serviceable and quiet work wake durably

Keep deterministic fixed physical steps when people or fields are active. Native
and game systems expose due deadlines; the Region chooses the next required
occurrence and prevents a slow step from building an unbounded overdue-alarm
chain or starving new commands. Accepted commands, leases and due processes
rearm the durable wake. Idle quiet Regions may sleep; this does **not** imply
offline elapsed-time settlement. Publication checks recipients before building
payloads and derives invalidation from committed dependencies rather than every
simulation revision. Separate simulation, commit and publication budgets.

An alarm may run more than once and its automatic retries are finite. Test
duplicate delivery, process restart, command arriving while quiet, crash during
rearm and exhausted automatic alarm retries. **A committed due obligation must
make progress without a later client request.** If the actual host cannot prove
that last law, keep this gate failed and state the platform/arrangement gap;
constructor repair upon a later request does not pass it.

### 4. Qualify the bounded DO and actual reuse

Run the pinned workload on the separate performance DO long enough for multiple
real-work cohorts, including two clients (one slow), reconnect, cold recovery,
lost response and same-command retry. Exercise more than 4,096 ordinary commands
through lawful receipt retirement; a retry outside the retained replay window
must reject or identify the old command, never create a second physical effect.
Fix the audited first-world invitation/hash binding and idle Colony v2
unauthenticated-socket expiry before expanding admission. Give the two clients
distinct permissions and views, and show accepted intent, pending work and a
durable terminal result after restart. The release source/WASM and fixture must
match the local evidence. Pass only if the active world services 100 workers
throughout the window, keeps a 100 ms simulation occurrence serviceable without
growing lag, drains route/field backlogs, preserves all conservation/replay laws,
and reports the CPU, wall, bytes, memory and output ledger. The native p95 <25 ms
target from the planner plan is a useful headroom goal, **not** a substitute for
hosted occurrence and productive-throughput evidence. If a measured gate fails,
name the dominant owner and repeat that gate after a bounded correction; do not
announce an unsupported maximum map or worker count.

Through the real public browser and DO entrypoints, install one small external
pack using public engine definitions for an actor behavior, supported buildable,
recipe/material operation and an existing baked art asset, plus scoped
command/observation; no Goblin import or content-name branch in transport. Show
the same declared physical operation in Colony and the second pack, once per
attachment, with current-format recovery. Then run one
maintained Shiitake integration using existing Botanical execution capabilities:
one scoped observation, accepted command, durable terminal result and retry,
with an unauthorized action rejected. Model execution stays outside physical
ticks. This is the minimum reuse witness, not a new workshop or second game.

## Exit and explicit nonclaims

The sprint closes only with pinned source, reproducible fixture, local + workerd
+ hosted ledgers, recovery/failure proofs and a short playable link showing the
same build. Source review, local native speed and a pretty browser view are
separate evidence. A 100-worker count without sustained useful work fails.
Report any remaining Fallow advisories on touched code and which duplicate
owner disappeared. Preserve the no-main-merge and no-production/backend-deploy
boundaries; prepare release artifacts before any separately authorized deploy.

Two authoritative Regions exchanging an actor and finite cargo, fencing stale
owners, and settling a sleeping process after offline time remain the **next
regional-world qualification**, not an implicit outcome of this sprint. The
cross-Region contract stays in the [platform audit](implementation/clearing-repair/20-engine-platform-audit-20260922.md).

Cloudflare constraints used here: [alarms are at-least-once with bounded automatic
retries](https://developers.cloudflare.com/durable-objects/api/alarms/),
[SQLite offers transactional durable storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
and [invocation CPU and storage have finite limits](https://developers.cloudflare.com/durable-objects/platform/limits/).
