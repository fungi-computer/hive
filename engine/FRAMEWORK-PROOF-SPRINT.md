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

Current user correction (September 23): refine existing Pirates and Survival
consumers; do not invent another pack to satisfy this witness. Through the real
public browser runtime and DO entrypoint, prove Pirates' declared cargo hauling
uses the same material custody, supply allocation, navigation and transfer owners
as Colony, including current-format recovery during and after delivery. Pirates
uses existing baked art and public definitions; no Goblin import or content-name
branch in transport or native planning. Supported buildable/recipe authoring is a
separate capability claim and must not be invented as unrelated Pirate content.

Run the maintained scoped Pirates controller with Botanical's actual Mycelium
execute capability and Code Mode sandbox (the capability integration Shiitake
consumes): scoped observation, accepted command, durable terminal result and
identical retry after restart, with unauthorized actions rejected. Clearly
separate this execution-capability witness from a full Shiitake model/session
run and from hosted parity. Model execution stays outside physical ticks.

## September 23 integrated checkpoint

At source `7b8c5167` and release WASM
`541ddcd4c8d29b89159ff9d4c6d6a085db2ce6f34621b4c453e0af0fc88f314b`,
the pinned v2 local WASM fixture completed 1,800 occurrences without an
admission error. It conserved all 2,304 units of wood and produced 116 completed
chains. Changed records stayed below 1 MiB (696,301 bytes maximum). Its native
advance p95 was 69.7 ms and capture p95 was 31.7 ms, excluding SQL, publication
and network. Only 137/180 one-second samples met the 90-useful-worker threshold;
third-minute output flattened at 696 wood. Four water demands remained
undelivered because this fixture has no reachable open surface water: an
exhaustive 65,536-column check found none. Current-format restore preserved
physical environment facts; the summary inequality was its disposable
placement revision resetting from 2 to 1. A separately versioned fixture with
finite reachable water is required; v2 is retained as failed evidence. The raw
local ledger is
`.botanical/framework-v2/integrated-after-1800.json` (SHA-256
`291827321fa0b8e093c6b876af34083998cb76480ec06b8f4bec2839a0b917d4`).
This is a **failed capacity gate**, not a DO result.

The same integrated source passed the existing Pirates public DO + Mycelium
Code Mode local witness, including restart, identical receipt replay, terminal
cargo and seven-unit conservation; the host wake/publication laws passed 16/16.
The combined native suite exposed a separate regression: 422 passed, 28 failed
because automatic outcome reconciliation took host-started attempts. The work
attempt owner must record continuation authority and restore all existing laws
before this source can be accepted. Navigation locality and a valid finite-water
fixture are being resolved at their owners. Hosted capacity,
full Shiitake model execution and a release preview remain unproved.

The subsequent navigation/work owner correction (`730a1e8f`, release WASM
`5c7e1d4dfef0ea996e1ba8336398121c32182f592baa853a842bf5a40d36bb89`)
restored the full native suite: 453 passed, zero failed, one ignored. With the
**unchanged v2 fixture**, the local 1,800-step run completed 190 chains and
1,140 delivered wood (+64% against the previous 116/696), with 179/180
one-second samples at or above 90 useful workers (previously 137/180). Its
third minute completed output in all 60 samples. Native advance p95 fell from
69.7 to 50.7 ms, capture p95 from 31.7 to 26.0 ms, maximum changed bytes from
696,301 to 611,745, and total local wall time from 116.0 to 67.4 seconds.
This is a strong local productivity and service-cost result, but it still
excludes DO SQL, alarm, publication, socket, and browser cost. The v2 water
fixture remains invalid for water delivery; the separate v3 finite-water
fixture and paired local/hosted run remain open. Do not promote these local
figures to a hosted capacity claim.
The local comparison ledger is
`.botanical/framework-v2/locality-after-1800.json` (SHA-256
`b5a3ea8042403eabc14f1ea5fe258e5d8f3cc97d690ae4f0ea0bf48720a28aae`).

The separate hosted performance preview previously served the v3 fixture at
<https://framework-0c4ba551-fungi-goblin-bnb.levi-fe0.workers.dev/engine/colony-performance.html?workload=framework-v3>.
It is paired with only `hive-performance-engine-preview`, implementation hash
`2e8b21ae2c61861cce15498d07cdf26bc40e0e366e71983cad9a058f656cf9f9`,
Cloudflare version `a367fac7-ca99-46b4-8ed9-56e009676a69`, and release WASM
`5c7e1d4dfef0ea996e1ba8336398121c32182f592baa853a842bf5a40d36bb89`.
Both static origins matched all 232 built files, the paired live join passed,
and a real browser showed 100 workers with complete terrain streaming. A
longer browser run is **not stable**: its WebSocket repeatedly reconnected and
the view eventually reset. The preview is an inspectable interim, not a
hosted capacity pass.

The hosted cost tail exposed about 150 changed-record puts and 325 SQL
statements per active occurrence, with about 373 KB of changed records.
Phase durations measured inside the DO with `performance.now()` were zero and
are invalid as CPU evidence. Platform alarm CPU was substantial but the tail
interleaved several test worlds, so it is not a single-world capacity result.
Most seriously, older v3 worlds reached the Region's default 4,096 live-record
cap near occurrence 2,034 and retried the deterministic failure every second:
99 `region-record-capacity` exceptions appeared in one 80-second tail. The
record-growth owner and a durable nonretryable-fault/wake owner must resolve
that failure before claiming hosted stability. The paired browser and tail
evidence is under `.botanical/framework-preview-0c4ba551/`.

### September 23 local integration after the six Luna lanes

Source `3dee1bdb96cfad213551ebac76164ad93db77f7e`, release WASM SHA-256
`9257977087a42e779722a94c7d8c44462897ecc994632f224185520d08ee3d5e`.
The v3 256×256/100-worker fixture completed all 1,800 local occurrences in
79.2 seconds with no error, 178 finite tree chains, 1,068 produced wood,
258 stored wood, one automatic finite-water portion and conserved material.
At least 90 actors were moving or working in 179/180 one-second samples. The
local ledger is `.botanical/framework-v3-ledger-3dee1bdb.json` (SHA-256
`d1d0dee8190a1dc190a14d0cd559a10210b7c1521108a1690baeec433eb8da60`);
it wraps the same pinned fixture and includes a ten-step save/restore
continuation check.

Measured local `GameSession.step` p50/p95/p99 was 12.0/70.0/103.2 ms;
`captureForCommit` was 19.5/25.4/32.6 ms. Capture emitted 222,742 changed
put/remove rows and 152.4 MB including keys and a 16-byte per-row allowance
across the run and initial capture; maximum fixture changed payload was 390,566
bytes. One full save took 124 ms and restore 249 ms. Maximum observed Node
process RSS was 323 MB. These are local wrapper/elapsed measurements, not
native-only CPU, SQL time, DO memory or hosted capacity. The record owner now
uses stable entity, route, motion and air-page keys; air capture still calls
full `save_air()` before selecting changed pages, so capture CPU is not yet
mutation-proportional. The 1,800-step fixture is three simulated minutes; the
ten-minute hosted active gate remains open.

The final WASM passed the focused Pirates cargo and Survival partial-lot laws
(3/3); the latter verifies that both halves retain player ownership. The
actual local workerd v3 driver passed pause, exact receipt replay, process
restart and a further autonomous alarm without a request; evidence is
`.botanical/framework-driver-proof-3dee1bdb/RESULT.json` (SHA-256
`3a50e0db07f26eb30b95792455744e3442a875c2fe08a240ad14ab21a8341a1a`).
The public host's
lease/clock laws passed 16/16 in the owner lane. The visual fact boundary now
admits the measured 899-fact scene up to an explicit 1,024-fact cap rather than
silently dropping the tail. Pirates uses the maintained Botanical Code Mode
connector in the local scoped-controller witness; this is not a full Shiitake
model/session or hosted run. The separate hosted preview and both Cloudflare
backends were parked at Levi's request; the historical URL above is not a live
preview. This checkpoint did not measure SQL, recipient publication, alarm
latency or ten-minute hosted capacity.

### September 23 mutation-local air capture comparison

At source `4b7ffac06516c8c3d1302c102ac801ef4c814392`, release WASM SHA-256
`581be7725a821f68f5322bc8565f952c99275c791e8204df1da8cfabb81fa56c`,
the identical v3 1,800-step fixture finished in **58.7 seconds**, versus
**79.2 seconds** above. `captureForCommit` fell from 36.2 to 23.2 seconds total,
with p50/p95/p99 12.7/16.9/20.5 ms versus 19.5/25.4/32.6 ms. Local
`GameSession.step` p95 fell from 70.0 to 52.1 ms. The commands and every
ten-step sample were identical: 178 completed tree chains, 1,068 produced
wood, one finite-water portion, and 179/180 samples with at least 90 moving
or working actors. Both current-format restore and ten-step continuation
comparisons passed. The new run's ledger is
`.botanical/framework-v3-ledger-air-4b7ffac0.json` (SHA-256
`089d1d7fc7b1bd1769557ceb6c55fc3bc58e02953627c7dd26467e184dd9b193`).
This paired local result includes the destination state-weight correction and
normal shared-host variance; it is evidence of a substantial improvement,
not isolated native-air CPU attribution or a hosted capacity claim.

The atmosphere mutation owner now emits changed encoded pages and explicit
removals; it no longer serializes all smoke state and pages during each delta
capture. The record header is current version 7 and rejects prior versions;
full save/decode remains the independent relational recovery oracle. Changed
transport stayed about 152.4 MB across the run because the optimization saves
capture work rather than suppressing real changes. Terrain/water/structure
export and root metadata still run on each capture. Native library laws passed
461/461 with one ignored; focused Pirates/Survival laws passed 3/3 against the
new WASM. The actual local workerd v3 restart/replay/autonomous-alarm proof
passed with two connected clients; its result is
`.botanical/framework-driver-proof-air-4b7ffac0/RESULT.json` (SHA-256
`3601323bca19f1184381f673d1ecb19cb20482b12eada3396ce47753408a226c`).

The two-client local workerd host audit is
`tools/public-engine-host/PUBLICATION-COST-AUDIT-20260923.md`. At the earlier
matching WASM, warm SQL p50/p95 was 2/3 ms while delivered observation build
was 20/37 ms and socket encode/send 2/3 ms. This is a 40-publication local
host sample. A second 40-step local workerd run on the post-air WASM and two
connected clients passed exact replay and autonomous restart. In its warm
steps 20–39, SQL p50/p95 was 2/3 ms, transaction-through-commit 52/65 ms,
changed capture 11/20 ms, and delivered observation build 16/24 ms. Alarm
lateness p95 was 1 ms. Its receipt is
`.botanical/publication-cost-air-4b7ffac0/RESULT.json` (SHA-256
`3a4e5e70489bdc5729b630be7edfd8941c3eef0208cf1d2a45c50a3be97a7a74`).
These short local workerd samples are not a ten-minute or hosted performance
measurement.
No speculative decoration cache was added: its measured substage was too small
to justify another retained state owner. Full `cargo test` still runs 14 stale
`engine/kernel/tests/kernel.rs` fixtures that omit the now-required
`materialCatalog`; the current-format native library suite above is green.
Fallow was unavailable in the touched lanes. Both Cloudflare backends remain
parked; hosted capacity and a same-build playable preview remain unproved.

The next residual-cost diagnostic ran the same 1,800-step fixture on temporary
WASM `f2ff0b8c1db76f7da028e27451dbf4dfc789c51039e14aa1c5e91a861664c974`.
Its commands and every sampled world result matched the clean air-cut run.
Of 23.46 seconds in the local capture wrapper, native `changed_records` used
10.04 seconds (4.60 route rows, 4.45 changed entity/work rows), and the native
record cursor used 4.72 seconds. The Rust probes leave about 8.7 seconds in
the WASM/TypeScript capture boundary and surrounding wrapper; they do not
attribute that residual more precisely. Terrain/water/structure export used
only 0.049 seconds across the run, so extending the air cache to terrain
would not address this workload. Diagnostic evidence is
`.botanical/framework-v3-residual-diagnostic-full.json` (SHA-256
`3323c46d1487e69c4bddfa37f6df591d2b9c636320616fd5577c442150a59dab`).
The temporary probes were reverted, and the earlier production WASM was
restored to `581be772…81fa56c` before the next cut.

The Region SQL record table now owns the recovery key inventory. A resident
capture sends exact changed puts and tombstones, and carries only a metadata
frontier into the stored session. It no longer sends the full key manifest or
rebuilds a TypeScript map of every record each occurrence. Detached `save()`
and SQL hydration still use a complete checkpoint; the occasional inventory
sample in the v3 diagnostic now requests that checkpoint explicitly. The
current native cut is `3f86c110`, corrected test `bdd26a9b`, release WASM
`f454c8c5d7c86e83c8a5fa04e7bc9e7e4a8ec7bae567233ca91bc4ea75499e4f`.
Native library laws passed 461/461 with one ignored. The actual local workerd
two-client restart/replay/autonomous-alarm proof passed through sequence 41;
its result is `.botanical/framework-driver-proof-cursor-bdd26a9b/RESULT.json`
(SHA-256 `6930483ab4ebdfdd0228bfdf8a197b26a22a27dc27d7eb38bfaec8983cbcc64a`).

On the same 1,800-step v3 local fixture, commands, all 180 sampled world
states, recovery, continuation and per-step record costs matched the post-air
run exactly. Capture fell from 23.19 to 15.76 seconds total, p50 from 12.72
to 8.45 ms, and p95 from 16.92 to 12.16 ms; changed transport stayed at
152,397,723 bytes including key/row overhead. Script wall time fell from
58.65 to 55.17 seconds even though the new diagnostic takes 36 additional
full saves (3.33 seconds beyond the old run's full-save cost). Thus capture
timings are the clean comparison; whole-script wall times have different
diagnostic sampling costs. The new ledger is
`.botanical/framework-v3-ledger-cursor-bdd26a9b.json` (SHA-256
`7b7bc514bac2c7cd4bd6d053328de8b5ed76374e773e8781832fcef99ea26a76`).
This is local evidence, not hosted capacity. Rust capture still scans resident
records to validate counts/capacity and route/search state. Native changed
route and entity/work encoding remain the next measured owner costs; changing
them should follow a new exact phase attribution, not a blanket cache.

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
