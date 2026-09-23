# Clearing performance audit — September 13, 2026

## September 23 integrated local checkpoint

Source `7c9c77b0` has the retained 8-at-a-time native assignment episode,
mutation-owned state accounting for ordinary work progress, indexed planner
deadlines, and resident native record comparison. Fresh, unoptimized WASM was
built from that source. These are **local diagnostic timings**, not DO CPU,
browser frames, or a before/after speedup claim. The existing performance pack
has exactly 50 designated trees at every population, and each measured step
advances one simulation second. All 50 trees completed in each run.

| Workers | Session step median / p95 / max | Full detached save median | Observation median |
| ---: | ---: | ---: | ---: |
| 32 | 25.10 / 122.29 / 474.68 ms | 39.10 ms | 25.77 ms |
| 100 | 0.77 / 145.35 / 448.77 ms | 43.57 ms | 34.09 ms |
| 200 | 1.04 / 269.90 / 1509.80 ms | 81.35 ms | 62.67 ms |

The 100/200-worker medians include many settled ticks after only 50 jobs were
available. Their high tails show real stalls, but this fixture cannot establish
100 simultaneously productive workers or 10 Hz DO capacity. Detached `save()`
still performs full validation; the new resident commit path instead transfers
only changed records. Native serialization and byte-offset entity chunks remain
costs, and a length-changing early entity field may dirty later chunks. The next
capacity proof needs at least as many real jobs as active workers, 100 ms host
steps, separate commit/publication measurements, and a pinned hosted source.

Integrated native unit suite: 430 passed, one ignored. The four-file current
WASM/JS session and record suite: 47 passed, two pre-existing fixture failures
(water activity assertion and an obsolete `party` field in a disconnected-party
fixture). New cold-recovery proof restored a 1,258,704-byte world, transferred
zero unchanged bytes, then transferred one 262,144-byte changed record; it does
not prove every later change fits the DO's 1 MiB changed-byte allowance.

## September 23 source re-audit: next ownership cuts

This section reviews the current Rust kernel and DO host source. It is a causal
audit, **not a new hosted timing or population claim**. The September 13 numbers
below describe an older source revision and must not be used as current capacity.

1. **Retain the whole assignment episode.** The native planner reviews 32 tasks,
   but `assign_verified` stops after eight validated matches and returns only
   those eight. The remaining candidate costs, route results and matching are
   discarded. A following review reconstructs the window and solves again. Keep
   the bounded, versioned matching/search continuation under the kernel owner;
   dispatch eight checked claims at a time from its result. Replan only when a
   participating input changes, and commit the continuation with the world.
   Merely changing `MAX_ASSIGNMENTS` to 32 would increase route admission and
   mutation work in one step without fixing redundant solving.
2. **Own changed records at canonical mutation.** The DO transaction persists
   changed records, but `session.save()` first captures the full kernel, and
   record diffing compares that full capture. A useful 100-worker step pays for
   serialization of unrelated entities even if only progress fields changed.
   Introduce a kernel-owned dirty-record journal with a versioned full baseline
   for cold load/recovery; the region transaction remains the atomic authority.
   Current local source correction removes full ECS/schema state-weight scans
   from per-worker job and resource progress and from the ordinary authored
   batch boundary, but does not solve full capture.
3. **Give the host a real next wake.** The host currently schedules a 100 ms
   clock occurrence while leased, even when the native world has no due work.
   The kernel and game systems should expose the next authoritative deadline
   (work review, elapsed process, needs, cat, environment), and accepted commands
   should wake it. Idle quiescence must preserve durable command identity and
   time-dependent game rules. The planner's native due-time index now answers
   its next review tick without scanning every task; the host wake contract is
   still outstanding.
4. **Separate publication from simulation revision.** Observation, inventory and
   Whistle projections rebuild on broad revision changes, and publication builds
   a payload before checking for authenticated recipients. Give each projection
   its owning fact dependencies and skip construction with no recipients. Measure
   this separately from native step, record capture and socket transmission.

For the next performance claim, use the same real 25/50/100-worker active fixture
before and after each cut. Report candidate edges, route expansions, assignment
passes, native step, full/delta capture, DO commit, observation and browser frame
time separately; idle worker counts cannot stand in for useful throughput.

King Bolete. Accepted runtime source: `ca18c66d7f359a8a5e9df84cb7469e94ca82a7fa`.
This is a source audit and a short local WASM measurement, not a hosted capacity
claim. The Clearing consolidation plan still owns the product outcome.

The [pathfinding and assignment implementation plan](PATHFINDING-AND-ASSIGNMENT-PLAN.md)
now owns the detailed repair contract. Its metric reconciliation, endpoint rules,
fixed matching objective and durable continuation refine the proposals below.

## Main finding

The measured tree-work stall is overwhelmingly repeated terrain-route costing
before assignment. Eight workers and 50 designated trees take a median **891 ms
per 100 ms simulation step**. Route-cost calls consume about 99% of total step
time in that short fixture. Water/gas native advancement takes under 1 ms per
step there. Fix candidate admission and route-query reuse before expanding the
population or replacing another environmental solver.

The existing route cap bounds request count, not useful work or elapsed time.
Batching the same searches into fewer JS/WASM calls is insufficient. Unaccepted
tree-provider and shared-frontier experiments remain unmerged; this report does
not qualify them.

## Evidence and limits

Raw source, harness, results and logs are retained under
`/mnt/fungi-data/botanical-work/native-atmosphere/.botanical/broad-performance-audit/`.
`result.json` combines the first two successful workloads from `result-v1.json`
with the remaining four from the corrected invocation; the first two were not
repeated. WASM SHA256:
`9feab02a6b551357673667a2e82f7d9e87739b1b57a94db74b947cbb3cf5ab56`.

- `72214` / `run-u6446.scope`: exit 1, stale wall-fixture input rejected before
  that workload ran. The fixture supplied a removed `material` field. Red retained.
- `89373` / `run-u6447.scope`: exit 0, remaining four workloads completed after
  removing the stale field. Both scopes are inactive/dead with empty control
  groups. No service or listener was started.
- Harness exercises actual GameSession and WASM, save records, observation,
  transport-shaped terrain references, JSON encoding/decoding and hydration.
  It does not run SQL, a DO, browser rendering, network transmission or GPU work.
  Instrumented total includes extra diagnostic work and is not DO transaction time.

| Workload | Steps of 100 ms | Step median | Step maximum | Save median | Observation median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ordinary Clearing | 30 | 2.07 ms | 28.44 ms | 0.43 ms | 1.56 ms |
| Two designated dig cells | 100 | 1.77 ms | 7.90 ms | 0.33 ms | 1.21 ms |
| One wall supply phase | 100 | 1.41 ms | 45.06 ms | 0.30 ms | 1.11 ms |
| Light brew station | 150 | 1.47 ms | 5.39 ms | 0.30 ms | 1.00 ms |
| 50 trees, 8 workers | 6 | 890.98 ms | 917.90 ms | 0.80 ms | 2.06 ms |
| 50 trees, 50 workers | 4 | 566.92 ms | 570.35 ms | 1.08 ms | 2.58 ms |

The ordinary fixture includes existing meal-delivery work. Digging produced two
loose spoil items but still had an outstanding designation. Wall evidence reaches
supply/carrying, not completed construction. Lighting actually completed and
consumed two wood, with smoke and temperature facts. These short samples do not
qualify sustained floods, large smoke stocks or tree-task completion.

Fifty workers appearing cheaper than eight is not a scaling result: the hard
128-route cap and candidate ordering evaluate different subsets. Current size
presets also retain a fixed 50-tree workload, concentrated actor placement and
bounded 64-wide presentation; larger generator bounds do not prove an equally
large resident, actively worked world.

## Correction to the published byte interpretation

`client/performance-page.js` counts JSON from the runtime subscription **after**
`runtime/browser-client.ts` hydrates terrain references from its cache. Its
"wire / observation bytes" label therefore counts cached terrain repeatedly.
The user's 12.5 MB counter was not a measurement of network traffic. The earlier
explanation treating it as transmitted bytes was wrong.

Measured median transport-shaped JSON was about 14.5 KB for ordinary play,
24.5 KB for eight-worker trees and 37.1 KB for fifty-worker trees; corresponding
hydrated JSON was 225, 235 and 248 KB. These are encoded message lengths, not
captured network bandwidth. A terrain edit still produced a roughly 226 KB full
baseline. The approximately 510 KB snapshot JSON also expands Uint8Array bytes
into indexed JSON properties: that fixture's initial binary records were 44.7 KB.
Report binary records, encoded messages and hydrated objects separately.

## Why libcolony's demo differs

Source reviewed: [demo.html](https://github.com/mafik/libcolony/blob/main/demo.html#L243-L291)
and [library description](https://github.com/mafik/libcolony#libcolony-algorithm),
retrieved September 13; downloaded sources retained beside this audit's evidence.
Its demo gives every worker/task pair a Euclidean straight-line distance and
moves workers directly toward tasks. It does not find routes around voxel
obstacles or stairs. Its displayed timing surrounds only `Module.optimize`,
excluding cost construction, movement and rendering. The allocation library
uses Hungarian assignment; its inputs are already-priced candidate edges.

Hive does much more work producing those prices: `terrain_route.rs` calls the
maintained A* implementation with a zero heuristic, thus exploring like Dijkstra,
separately for destinations, with up to 4096 expansions each. `route_query.rs`
loops requests; tree work multiplies workers, trees and approach positions before
shared occupancy rejection. This difference explains the measured route expense;
it does not excuse repeating unnecessary searches.

There is also a real implementation divergence: `kernel/src/assign.rs` implements
successive shortest augmenting paths with Bellman-Ford, allocating graph/maps and
cloning string IDs. `kernel/src/lib.rs` actually invokes it. It follows some
libcolony contract ideas but is neither the retained implementation nor Hungarian.
Do not call it the original libcolony optimizer or assume its performance claims.
Qualify the intended assignment implementation against identical candidate inputs
before expanding it. Replacing assignment alone cannot fix time already spent
in route costing.

Levi explicitly reaffirmed the existing requirement during this audit: retain the
same Hungarian algorithm. Treat Bellman-Ford replacement as a requirement defect,
not an alternative awaiting preference. Correction must use the retained algorithm
as reference, preserve impossible edges and deterministic matching, and compare
equal candidate inputs. Language translation does not authorize algorithm substitution.

### Pathfinding options and recommendation

Keep assignment separate from navigation. The following are complementary choices,
not a demand to add every technique now:

- Single destination: existing Rust `pathfinding` 4.16.0 A* with a valid lower-bound
  heuristic. The current zero heuristic gives up directional guidance. Derive the
  bound from actual edge costs, including stairs, rather than assume a flat map.
- Many destinations for one worker: bounded shared Dijkstra frontier over the same
  traversal graph. The installed library exposes `dijkstra_partial`; inspect its
  stop/result semantics before adopting it. Preserve settled versus unexamined
  destinations and reconstruct only needed paths. This directly targets repeated
  tree-job costing, without discarding climb costs or reachable alternatives.
- Many workers toward one destination: reverse distance/flow field per compatible
  movement profile and destination. Useful later for common depots or RTS movement;
  it does not solve unit collision avoidance or distinct formation endpoints.
- Long journeys: hierarchical chunk/portal navigation with local routes and local
  invalidation after excavation/construction. Fits the larger-world direction, but
  building it is not a prerequisite for repairing eight workers in this clearing.
- Recast/Detour navmeshes: credible for continuous walkable geometry and tiled
  worlds. Adopting them here would add mesh generation/rebuild and off-mesh traversal
  work. Not the first fix for already-defined voxel/stair traversal.
- Standard Jump Point Search: useful on suitable uniform-cost grids, not a direct
  fit for the complete weighted multi-level traversal graph. Do not silently drop
  movement rules to obtain its advertised speed.

Primary references: [A*](https://docs.rs/pathfinding/4.16.0/pathfinding/directed/astar/fn.astar.html),
[partial Dijkstra](https://docs.rs/pathfinding/4.16.0/pathfinding/directed/dijkstra/fn.dijkstra_partial.html),
[flow fields](https://www.redblobgames.com/pathfinding/tower-defense/),
[HPA* research](https://webdocs.cs.ualberta.ca/~games/pathfind/),
[Recast](https://recastnav.com/),
[JPS author discussion](https://users.cecs.anu.edu.au/~dharabor/data/papers/harabor-aigamedev12.pdf).
Recommendation now: correct Hungarian fidelity, shared eligibility filtering,
invalidation and repeated multi-target searches; retain guided A* for individual
routes. Qualify the actual same workload before claiming speedup.

### September 13 discussion: let matching guide expensive route evaluation

Levi challenged the preceding algorithm menu as insufficient. The stronger proposed
composition is **lazy route evaluation around the required Hungarian matcher**.
This is a design proposal, not implemented or accepted runtime behavior. It refines
the repair above; it does not authorize replacing Hungarian with TSWAP or another
assignment solver.

1. Inspect all providers' authoritative participation, claims and admission before
   expensive preparation. Keep actual work progression separate from reconsidering
   assignments. Existing valid work continues, subject to explicit cancellation,
   personal orders, needs and priority/preemption policy; caching cannot lock a
   worker to a job forever.
2. For a fixed planning input, exclude proven impossible candidates and construct
   optimistic lower bounds for remaining worker/task costs using the same cost
   formula, movement profile and target approach semantics. A lower bound is not
   reachability. Never drop alternatives merely because a nearest-K list filled.
3. Run the required Hungarian matcher on those provisional costs. Evaluate actual
   routes for unresolved pairings in its proposed matching, update the costs or
   remove proven unreachable pairs, and solve again. Dispatch only a matching
   whose selected edges are actually validated against current authority.
4. Preserve a known valid route as an upper bound, settled search costs as exact
   only under their dependency revision, and unexamined costs as lower bounds.
   A budget exhaustion is pending, never unreachable. Per-target approach minima
   require proving no remaining approach has a lower cost before calling them exact.
5. Search on bounded cached walkable connections derived from the existing terrain,
   structures, obstacles and traversal owner. Use guided A* for isolated queries;
   resume/share an outward search when a worker's repeated questions justify it.
   Connectivity rejection is valid only for a known relevant component/profile;
   unloaded or unexamined space remains unknown. No whole-world connectivity flood.

For a fixed candidate set, an exact optimum under lower-bound costs whose selected
edges all have exact validated costs is also an optimum under real costs: the
proposed matching's real total equals the lower-bound optimum, and no alternative's
real total can be lower than its bound. Apply the same cardinality/priority/dummy
semantics as the retained matcher and use deterministic tie handling. This is a
mathematical condition, not a claim that the current implementation meets it.
In difficult maps refinement may still evaluate every candidate; repeated Hungarian
passes add work. Both matching and path expansion therefore need explicit budgets
and a same-workload comparison against eager evaluation.

Reconsider assignments on relevant task, actor, supply, navigation and priority
changes, including defined due-time changes for needs; not merely every visual or
physical tick. Current providers lack a shared such invalidation boundary, so it
must be implemented coherently for all current consumers rather than tree-only.
The general region revision changes every step and is too coarse for this cache.

Geometry invalidation has two different meanings. A blocked edge can invalidate an
existing route; an opened shortcut can make a still-valid route no longer cheapest.
Dependency-only caching of chosen route cells does not prove optimal costs after
an opening elsewhere. Invalidate cost certificates appropriately while permitting
already-committed valid journeys to continue under the existing work policy. Chunk
geometry repair may be local even when reachability/cost consequences are wider.

No new DO, service or UI scheduler is needed. Navigation caches remain bounded,
private and rebuildable; physical claims and decisions stay with existing authority.
If planning spans steps, its durable input identity, fair progress and warm/cold
behavior must be specified and tested before adoption. Wall-clock timing or cache
warmth cannot silently decide authoritative matching/replay outcomes.

Qualification compares against fully evaluated Hungarian on the same small
candidate fixtures, including disconnected targets, stair removal, a new shortcut,
unequal worker abilities and resource claims. Then measure completed tree work and
whole-step cost in the actual Clearing. No speedup or 128/256-world capacity claim
follows from this proposal.

Related primary research explicitly studies avoiding exhaustive distances during
target assignment: Okumura and Defago, [section 5, Target Assignment with Lazy
Evaluation](https://arxiv.org/pdf/2109.04264). Their allocation objectives and
algorithms differ; this is evidence for the technique, not a claim that their
published performance transfers to Hive or that we should adopt their solver.

## Coherent repair order

### 1. Keep authoritative work responsive

Owners: `colony-work.ts`, shared work allocation, session route admission and Rust
route query. Reject ineligible or occupied candidates before expensive preparation
through the shared owner. Preserve personal orders, cargo continuation, material
claims and valid cooperative deliveries. Do not add a tree-specific occupancy owner.

Share search work across destinations from the same actor and movement context;
use the maintained search library where it fits. Cache only derived facts with
explicit terrain, structure, traversal and start-position invalidation. Preserve
stairs, moving prefixes and disconnected terrain. An estimated distance is useful
for ordering candidates, never proof that a worker can reach a job. Distinguish
unreachable from deferred by a work budget, and give deferred work deterministic
fairness instead of retrying the same prefix every step.

The DO already runs at 10 Hz (`protocol.ts`), and serializes step/command work.
`clock-schedule.ts` advances the prior deadline by 100 ms. Persistent overruns can
leave the next wake immediately due. Define bounded lateness behavior at that
existing owner; do not solve it by dropping accepted commands, falsely advancing
physical time or increasing the client's command queue.

Acceptance: same real tree orders complete, plus blocked/deep routes do not starve
reachable work; measure route searches/expansions, assignment and whole-step time
separately. Proposed responsiveness target: sustained steps stay within the 100 ms
deadline, with headroom for commit and publication. The current short red samples
establish a fault, not a final population limit. Measure a named longer workload
after the causal correction, rather than replaying historical proof matrices.

### 2. Publish and draw only what changed

Keep existing terrain references and reconnect baselines. After a terrain change,
publish changed columns rather than automatically repeating every visible column.
Other observations still carry complete entity/inventory/presentation collections.
Measure bytes at the actual send boundary before choosing further deltas. Server
observation construction already caches by revision; do not add a duplicate cache.

The client already interpolates snapshots and renders independently of server
ticks. The remaining source candidates include full HUD updates on observations,
repeated fact collections and sorting per frame, and water redraws without change.
The terrain layer patches baked regions into a 2304×1536 canvas then updates the
texture; whether that uploads the whole texture needs actual GPU evidence. It is
not true that every terrain tile is rebaked on every simulation step. Preserve
the original art, picking, cutaways and gesture owner while narrowing invalidation.

### 3. Address measured residual costs without another rewrite

- ECS membership queries use Bevy caching, but the current caller repeatedly
  serializes/parses query facts across WASM: roughly 80–87 calls per step in the
  small fixtures. Share phase projections with explicit pending-mutation
  invalidation. The recently shared material projection is a useful precedent.
- Saves already diff records and persist changed blobs, and a warm region reuses
  its live session. However capture walks entities/components, serializes a broad
  dynamic blob and reparses trusted native records for metadata. Improve dirty
  record production if scaled measurements justify it. Keep atomic world/receipt
  commitment and recovery; RAM-only acknowledgments are not an optimization.
- Water and smoke already use bounded local updates. Water copy-on-write still
  clones queue/index structures, and sparse gas cloning/validation scans stored
  entries beyond the processed subset. Larger active-stock cases require their own
  bounded measurement; this audit neither clears them nor blames them for the tree
  stall. Preserve finite quantities and the agreed simple simulation.
- Observed WASM memories were about 2–2.75 MB. They exclude substantial host/client
  state and allocator effects; they do not establish DO memory capacity. Physical
  stock, observation, entity and terrain limits differ and need explicit caller
  behavior rather than silent truncation or unexplained parse failures.

Ship each corrected causal chunk through its real Clearing consumer. Do not wait
for all speculative improvements before giving Levi a responsive playable result.
