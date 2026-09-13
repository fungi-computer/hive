# Pathfinding and assignment repair

King Bolete · September 13, 2026 · active implementation and measured repair

## 1. Outcome and authority

People in the real Clearing should promptly start useful work, walk around obstacles,
use stairs and excavations, carry supplies, and keep working while other people dig.
An inaccessible job must not freeze the colony or occupy a worker forever. The same
rules run in local WASM and the authoritative multiplayer DO. Humans and AI can
designate work before a suitable worker exists.

This document owns the pathfinding/assignment repair within
[the Clearing sprint](CLEARING-CONSOLIDATION-PLAN.md). It refines the proposals in
[the September 13 audit](CLEARING-PERFORMANCE-AUDIT.md); that audit owns the baseline
measurements and their limits. It does not replace the sprint with a navigation
research project. Water, sparse smoke, art, shared controls, current saves and the
existing transaction owner remain consumers to preserve.

Levi explicitly requires **Hungarian assignment**. Rust implementation was allowed;
substituting another algorithm was not. Restore that requirement and correct older
descriptions calling the current endpoint libcolony. King owns difficult design,
algorithm qualification, source acceptance and integration. Luna implementers get
bounded mechanical outcomes in isolated worktrees after their contracts are settled.

### Current implementation checkpoint

The native owner now uses `pathfinding`'s Hungarian implementation with a sparse
wrapper qualified against exhaustive small assignments. Search and execution use
one admitted movement-edge metric. The shared work allocator now proposes over
cheap optimistic costs, resolves routes only for selected worker/job pairs, removes
unreachable selections, and repeats until the chosen assignment is exact. Tree,
dig, construction, delivery and emission all consume that one refinement owner.

The assignment wire now admits the declared resident-region workload of 64 workers
against 256 pending jobs (16,384 candidate edges). This is a bounded planning set,
not permission to run 16,384 route searches.

Local Node/WASM measurement on a 64×64 world with eight workers and fifty designated
trees reduced the former roughly 891 ms median pathological tick to a 75.62 ms
assignment tick. That tick performed 40 route requests; following movement ticks
were 5.11–9.64 ms. The first measured tick was 48.81 ms with ten route requests.
This proves a large causal reduction in the retained fixture, not browser/DO capacity
or final performance. Multi-destination native search, a guided A* heuristic and
full delivery itinerary pricing remain open improvements.

## 2. What is actually wrong

Accepted source inspected: `ca18c66d7f359a8a5e9df84cb7469e94ca82a7fa`, in
`/mnt/fungi-data/botanical-work/native-atmosphere`.

| Finding | Actual owner/caller | Consequence |
| --- | --- | --- |
| Provider preparation precedes shared occupancy filtering | `src/sdk/work-system.ts`, `work-allocation.ts`, `games/colony-work.ts` | Expensive tree/dig questions can be asked for workers who cannot take new work. |
| Tree approaches are searched eagerly and the chosen approach is searched again | `games/colony-work.ts:95-111` | Repeated terrain exploration before the matcher even runs. |
| A* uses zero heuristic and queries terrain during each expansion | `kernel/src/terrain_route.rs` | Individual target searches explore without directional guidance and repeatedly resolve geometry. |
| Each route clones obstacle/stair collections; each expansion scans all stairs | `kernel/src/world.rs`, `terrain_route.rs` | A node-count budget alone does not bound per-query or per-node work. |
| Cost batches loop individual `route_for` calls | `kernel/src/route_query.rs`, `world.rs` | Crossing WASM once does not share search work. |
| Search charges Manhattan length; query reports emitted waypoint length | `terrain_route.rs`, `route_query.rs` | Diagonal stair ramps have inconsistent search and reported costs. Existing costs are not certified shortest travel costs. |
| Native matching uses Bellman-Ford augmenting paths | `kernel/src/assign.rs`, `lib.rs:249-278` | Explicit Hungarian requirement was missed. |
| Assignment permits 128 pairs/4096 JSON bytes; route calls have separate 32/128 limits | `src/sdk/assignment.ts`, `runtime/session.ts`, `runtime/wasm-kernel.ts`, native endpoints | Eight workers × fifty jobs is already 400 pairs. First-128 processing is not full-set matching. |
| Route-budget exhaustion is returned as `unavailable` | `runtime/session.ts:575-582`, `route_query.rs` | Work not yet searched is confused with work that cannot be reached. |
| Delivery checks actor→source and actor→destination, but scores the first leg | `src/sdk/delivery.ts:205-209` | It does not certify the actual source→destination carrying leg. |
| Work providers mostly submit route distance directly | Current tree/dig/delivery/construction/emission estimates | Speed, work duration and priority semantics need explicit inputs, not assumptions based on an unused helper. |

The short eight-worker/50-tree fixture measured median step 891 ms, with about 99%
of step time inside route costing. The matching algorithm is a separate requirement
defect; replacing it alone cannot recover that time. This is local Node/WASM evidence,
not DO capacity or a completed chopping workload. Preserve the audit's failed first
fixture, successful corrected run and byte-counter corrections.

## 3. Chosen shape

Keep one native navigation owner and one shared work owner. Work providers describe
eligible operations and their physical approach requirements. They do not each own
path caches, route budgets, occupancy discovery or matching.

```text
authoritative work intent + actor/material facts
    → inspect all providers and preserve ongoing work
    → eligible worker/job alternatives with optimistic cost bounds
    → Hungarian proposes a joint matching
    → native navigation resolves only still-uncertain selected alternatives
    → update costs and repeat within a deterministic budget
    → revalidate and atomically admit claims + actual movement
```

Expensive search moves after global eligibility. Lazy evaluation chooses which
travel questions are worth resolving; it does not substitute guessed distance for
reachability. A* and shared Dijkstra are implementations of the same movement graph,
not competing definitions of where a person can walk.

### Ownership

| Responsibility | Owner | Other code may do |
| --- | --- | --- |
| Terrain, stairs, fixed obstacles, traversal profile | Existing native physical owners | Query; submit existing physical edits. |
| Walkable edges, metric, route search and cost certificates | Native navigation beneath `Kernel` | Request an endpoint or approach-set result. |
| Jobs, capabilities, priorities, supplies, cancellation and interrupt policy | TS-authored game definitions through shared work composition | Inspect and submit typed work operations. |
| Hungarian and lazy cost refinement | Native assignment/planning implementation | Supply validated candidates and cost factors; consume typed proposed results. |
| Quantity, cargo, claims and work completion | Existing shared material/work and compound native commit | No cache or matcher can move goods or settle work. |
| Durable input/progress/results and wake | Existing Region transaction/clock owner | No browser or new service takes over planning authority. |
| Waiting reasons, previews, command discovery | Existing observations, Whistle and shared client | Render facts; never run a second online planner. |

The existing work provider contract changes coherently for delivery, dig, tree,
construction and emission. The unaccepted `0d785d3` tree-only inspect/prepare union
is a reference, not an accepted permanent mixed contract. The unbuilt root frontier
experiment is likewise not a dependency or a requirement to retain custom search.

## 4. Restore Hungarian with explicit matching laws

Use Hungarian in Rust. The installed `pathfinding = 4.16.0` crate already offers
`kuhn_munkres_min`; qualify that maintained implementation first. The retained
`vendor/libcolony/colony.h` is the algorithm/behavior reference, with its MIT
attribution and provenance in `public/vendor/libcolony/PROVENANCE.md`. A different
Rust implementation of Hungarian must be named honestly; it is not the original
C++ binary. Remove Bellman-Ford production matching after the caller join.

The domain wrapper must establish:

- At most one assignment per worker and per exclusive work slot. Cooperative work
  exposes distinct admitted contributions; it does not duplicate one cargo claim.
- Maximize the number of legally assignable work slots within the admitted planning
  set, then minimize declared total cost. Priority enters the declared cost policy;
  hard priority tiers, if present, are explicit admission policy rather than secretly
  different normalization.
- Known forbidden edges remain forbidden. Unknown routes are provisional and cannot
  be committed. Duplicate pairs are canonicalized by one documented rule.
- Stable ID tables, row/column order and evaluation order make identical authoritative
  inputs repeatable. Equal-cost optimal matchings need not reproduce the exact pairs
  of a differently ordered eager run. Compare legality, cardinality and objective;
  compare exact pairs for replay of the same algorithm/input.
- Use finite checked numeric weights. Model unmatched rows with dummy columns and
  forbidden edges with a distinct larger penalty derived from **fixed whole-input
  bounds**. No NaN/infinity, unchecked overflowing totals, or changing penalty based
  on whichever edge happened to be evaluated last.

There is a reference-wrapper trap: retained libcolony fills absent matrix entries
with `1` and turns real costs into `max_cost-cost+1`. A highest-cost real edge can
tie an absent one; filtering the result afterward does not by itself establish the
required sparse cardinality law. Preserve Hungarian, not that accidental missing-edge
encoding. Make the wrapper correction explicit and test it with a tiny brute-force
oracle; never silently change objective to imitate a flawed sparse fixture.

Reference checks: complete rectangular feasible matrices against retained libcolony;
sparse, impossible, duplicate, equal-cost and deficient matchings against exhaustive
small assignments. No new matching algorithm or production oracle is needed.

## 5. One movement metric and honest route results

### Metric decision

One native movement-edge definition supplies both admitted geometry and planning
cost. Search successors, route waypoint emission and reported route cost consume
that same definition. A second formula in a query helper is not an accepted join.
Use a small typed flat/hop/stair description also in in-flight prefix calculation,
movement progress correspondence and saved-route validation. Remove their independent
hop/stair reconstruction branches as they move to that owner. This shares the actual
movement rule, not just the spelling of a distance helper.
Price the movement the integrator will actually execute. Flat edges follow their
horizontal segment; a one-voxel hop includes its vertical and horizontal segments;
an authored stair follows its actual ramp segment. Include the required unfinished
edge prefix for an actor already moving, frame transforms and any final connector.
Do not snap a moving actor to a different support cell just to simplify a query.

Normalize requested destinations through that same owner before estimating cost.
Today's terrain route rounds a destination to a support cell and walks to its center;
distance to the raw request can therefore overestimate the actual admitted journey.
Keep this normalization explicit for tile targets. Frame/free-movement endpoints
retain their actual contracts; do not append imaginary connector segments. Lower
bounds and exact costs use the identical admitted endpoints/approach sets.

Proposed deterministic planning representation: integer micrometres, rounding each
physical edge length upward once at the native edge owner. A route's graph cost is
the sum of those edge costs. Preserve unrounded geometry for rendering/integration.
For a route with 4096 edges, geometric rounding overhead is less than 4.096 mm, plus explicitly
counted prefix/end segments. This is a chosen planning tolerance, not a speedup or
new physical motion. If movement adds an actual delay/penalty, the cost model must
include that same rule before it can claim travel-time optimality.

Convert length to travel time using the relevant actor/leg speed; combine expected
work time, retry risk and priority through the retained formula:

```text
score = (travel_seconds + work_seconds) / (1 - retry_risk) / priority
```

Quantize the resulting score to checked integer microseconds using monotone upward
rounding. Document this precision in the versioned planning contract. Lower bounds
are rounded conservatively so they never exceed the exact quantized score. Fix
movement-profile/cost factors for a planning episode. Do not claim all historical
providers already used this formula; populate supported current factors explicitly,
with neutral defaults only where the game actually has no such rule.

Guided A*: use a proven optimistic bound under that metric. Euclidean endpoint
distance rounded down is a starting bound for the current geometric edges; weighted
Manhattan is not generally admissible when diagonal ramp edges are allowed. Add
mandatory prefix cost only when it is unavoidable. Future teleports/discounted edges
would require a revised heuristic contract. Zero remains a safe fallback for a
profile without a proven heuristic, not the default for every current route.

### Typed outcomes

Replace the string-based mixture of topology failure and work-budget failure in the
real TS/Serde boundaries together. Illustrative responsibility shapes:

```text
RouteAnswer =
  Exact { cost, approach, routeWitness, dependencies }
  | Unreachable { reason, dependencies }
  | Pending { continuation }
  | CapacityLimited { dimension, admittedDomain }
  | Stale { changedDependency }
```

Malformed input remains a boundary rejection, not an ordinary route answer. A route
witness is private engine data checked at movement admission; it is not a caller's
permission token. Admission can reuse a current witness without performing the same
search again, while checking actor start, profile, frame and relevant geometry. The
existing movement owner installs the route and owns its lifetime. Do not add a global
token registry or expose giant path data to the UI.

For a job with several approach cells, exact pair cost is the minimum over valid
approaches. Stop only when the chosen approach is settled and no unresolved approach
bound can beat it. Tree work must not silently retain first-reachable ordering.

For a delivery, check the actual ordered journey: actor→pickup under the current
profile, then pickup→drop under the carrying profile. The initial shared job score
should include that full journey and expected handling time. Reuse its common second
leg across compatible actors. This is an explicit correction from today's first-leg
distance score. Generalize required legs for existing jobs; do not create a new
brewing-specific pathfinder or a universal workflow language.

## 6. Navigation data and invalidation

Keep a bounded, rebuildable projection of walkable connections in loaded/query-active
chunks. Nodes are valid standing supports, including multiple surfaces in one x/z
column. Empty cave air is not a giant volume of navigation nodes. Edge generation
uses the existing clearance, hop, stair and obstacle laws; no second geometry truth.
Integer local node IDs and compact adjacency records avoid repeated coordinate/string
allocation and repeated full terrain queries during search. Select storage layout
from real sparse/multi-floor fixtures; do not eagerly allocate every voxel in the
world. Reuse Bevy membership/index owners rather than duplicating actor state.

Index stair incidence by support endpoint at the structure/navigation owner. Search
queries borrow current obstacle and stair views instead of cloning full collections.
Successor enumeration only reads edges incident to its current node. Building or
removing a stair updates this derived index through its existing mutation owner.

Derived data is keyed by generation/physical revisions, frame and traversal profile.
Affected cells include the clearance footprint and stair endpoints, not just the
edited voxel. Remove/replace entries through the physical mutation owner's change
description. Existing changed-column history is useful input; a history gap forces
safe invalidation rather than guessing that nothing changed.

Distinguish three facts:

1. **Geometry validity:** does the cached edge still represent current terrain?
2. **Route validity:** can an already-issued journey still be followed safely?
3. **Optimality:** is an old route cost still the cheapest among alternatives?

Closing a stair may invalidate journeys beyond its chunk. Opening a shortcut can
improve a route that never touches the edited chunk. Therefore local chosen-path
dependencies alone cannot certify old optimal costs. Start conservatively: relevant
geometry revision invalidates pending exact-cost certificates for the connected
planning area, while unaffected geometry pages and still-valid committed journeys
can remain. Finer component/portal invalidation is a later measured improvement.
Do not implement dynamic global connectivity as a hidden first milestone.

Use known connectivity to cheaply reject separated components only when the relevant
component/profile is complete. Unknown or unloaded space is not disconnected. A
connectivity build has the same bounded-work requirements as any other search.

## 7. Lazy route evaluation and shared search

For a fixed admitted set, Hungarian sees an optimistic cost for every unresolved
eligible worker/job pair. A selected edge is refined by the native navigation owner.
Known impossible edges are removed and costs increased until the selected matching
has exact feasible edges, or the current work allowance is exhausted.

```text
advancePlanning(episode, logicalAllowance):
  applyRelevantInvalidations(episode)       // preserve unaffected work and age
  while allowance permits:
    if no proposed matching:
      proposed = hungarian(episode.fixedBoundsAndKnownCosts)
    edge = nextUnresolvedSelectedEdge(proposed, episode.fairCursor)
    if no edge:
      return Ready(proposed, episode.dependencies)
    answer = navigation.advance(edge.requiredLegs, boundedSlice)
    if answer is Exact: update pair cost and witness
    if answer is Unreachable: forbid pair for those dependencies
    if answer is Pending: retain frontier and rotate fair cursor
    if answer is CapacityLimited: record explicit unresolved scope
    if pair cost/feasibility changed: discard proposed matching, not other work
  return Pending(updatedEpisode)
```

Proof condition: if selected edges are exact, their real total equals the optimal
lower-bound total; every competing real total is at least its lower bound. With the
same fixed cardinality/priority objective this certifies the optimum. It does not
certify an unexamined mandatory delivery leg or equal pair identity across all
possible tie-breaking algorithms. It also does not imply continuous optimality while
the world changes. Fresh authority is checked before commitment.

Worst case remains all pairs plus repeated Hungarian passes. Bound both and compare
against eager evaluation. Do not promise eight searches for eight workers. Eight
workers × fifty jobs still has 400 cheap pair entries, not necessarily 400 searches.

Use guided A* for a small number of isolated target requests. Share a Dijkstra search
when one start/profile is repeatedly evaluated against several destinations. Keep
one frontier, distances and predecessors and reconstruct only selected paths. Reverse
search can share a common delivery destination, respecting the original direction
and weight of edges. Search policy is deterministic and derived from current query
shape; avoid a speculative adaptive optimizer based on wall-clock measurements.

The installed library supplies A*, partial Dijkstra and Hungarian. Read the actual
partial-search source before treating every discovered result as settled: a node in
a frontier is not necessarily final. If resumability cannot be expressed through its
public API, a small native continuation loop may be necessary. Its justification is
bounded resumable execution, not permission to replace the whole pathfinding library.
Compare it against the installed algorithm on the same graph.

## 8. Work phases, fairness and durability

Separate progressing accepted work from finding new assignments. Each work pass
inspects all five providers before expensive planning; progresses existing claims
under their normal policy; and requests new planning only for relevant changed facts.
The exact order must respect current overlays and compound physical completion.

Use one committed-plus-accepted-input census for the pass. Current provider writes
are not automatically visible to later queries: a just-cancelled claim normally
releases its worker for the next committed planning event. Do not assume same-step
reuse unless the existing owner explicitly supplies a checked projection. Never
assign new work before a required cargo drop or old-claim release has committed.

Relevant changes include task creation/cancel/completion, worker availability or
personal order, a participating idle worker's position/profile, source quantity,
destination capacity, a changed navigation edge and an authored priority/need deadline.
Unrelated actor movement, cosmetic frames and ordinary region revision increments
do not invalidate the entire planning episode. Needs/priority that evolve with time
must provide defined reconsideration points; event-driven is not permission to ignore
hunger until another task changes. Cache hits cannot bypass fresh eligibility.

Persist one bounded planning continuation beneath the existing owner when planning
spans simulation steps. It contains versioned input/dependency identities, canonical
candidate costs/bounds, deterministic evaluation cursors, and frontier/predecessor/
settled records for live searches. This is in-progress computation, not a second
world or an independent material fact. Commit its progress through the same Region
transaction as other world/work changes. Discard or restore the detached candidate
after failed commit; do not rely on SQLite to undo mutated RAM.

Advancing persisted planning is an explicit native operation inside that candidate/
compound transaction. The current `routeCosts` query stays read-only; do not hide new
canonical writes behind it. Keep selected route witnesses in the bounded episode for
checked reuse by movement admission. Commit fresh matching claims jointly with all
material/capacity constraints; pairwise route validity alone is not joint resource
admission. A stale/rejected proposal cannot leave committed claims behind.

Geometry caches can remain disposable, but cold and warm runs charge the same logical
search steps and produce the same decisions. An optional warm answer cannot mark a
pair exact earlier unless its reusable certificate is part of the canonical input or
equivalent logical work is charged. DO restart must not erase fair progress. Do not
add a scheduler, watchdog sidecar, socket, timer or separate DO for this repair.

Keep a small fixed number of live searches and rotate their bounded slices. Retain
age/cursor when inputs invalidate; do not always restart with the first stable ID.
If a relevant input keeps changing, completion cannot be guaranteed; cancellation and
manual control still work. Irrelevant changes must not starve a stable planning set.

Keep distinct ceilings for work per step and total retained search domain/memory.
Hitting a per-step allowance yields. Hitting total capacity reports `CapacityLimited`
without declaring a path impossible, deleting intent or spinning the same attempt
each tick. Under a stable supported input, pending work must eventually finish.
If the total domain cannot fit, the remedy is explicit paging/hierarchy or a declared
scope limit, not an unbounded heap. A single unresolved connected assignment group
cannot block already-running work or an independently proven disjoint group. Any
fallback feasible-but-unproven matching would change the optimality contract and is
not authorized silently by this plan.

For the supported current Clearing, the finite navigation domain and total memory
allowance **must permit complete search under stable inputs**. Its 64×64×72 cell
envelope has at most 294,912 candidate cell positions before traversal filtering;
the projected walkable nodes, stair edges, actual worst-case frontier and encoded
records need a concrete bound within that domain. Measure and pin it before source
acceptance. Do not preserve the old 4096-expansion cap as a secret reachability law.
Reconcile the separate 4096-waypoint/route-record bounds too: a valid supported-domain
journey needs enough representation or an explicit owned segment continuation, not
a mislabeled unreachable result. Segmenting cannot teleport a worker across a gap.
`CapacityLimited` is an honest outside-envelope limitation, not success for normal
in-envelope digging. A dense assignment graph may be held by one unresolved pair;
prove that reachable **new** work starts alongside inaccessible jobs, not merely
that existing work continues. No decomposition framework is required to hide this.

## 9. Bounds and responsiveness targets

Initial qualification policy, not measured capacity:

| Dimension | Starting contract |
| --- | --- |
| Product fixture | Full actual 64×64 Clearing and existing vertical extent; preserve caves, stairs, water and original art. |
| Admitted assignment set | Up to 64 available workers and 256 ready jobs, including the 8×50 and 50×50 fixtures. |
| Pair matrix | Up to 16,384 pair entries plus explicit unmatched columns; private integer-indexed IDs instead of repeating long IDs in every edge. |
| Crossing limits | Replace the 128-pair/4 KiB contract coherently with bounds derived from that matrix, ID tables and actual encoding. Root pins exact byte limits from the first produced packet; do not just remove limits. |
| Per-step work | Count heap pops including stale entries, edge relaxations, topology materialization, bounded-matrix Hungarian passes and record bytes; calibrate fixed counts against the baseline host before acceptance. |
| Cache/continuation memory | Separate explicit ceilings for geometry cache, live frontiers, settled nodes and total planning records; measure actual encoded and resident bytes before choosing the release values. |
| Local sustained target | For 8 workers/50 trees, complete workload with simulation+save+observation p95 below 25 ms and no recurrent 100 ms overrun; a target to prove, not current evidence. |
| Hosted target | Existing 10 Hz authority keeps up while two clients dig/build/cancel and workers complete jobs; report transaction, queue age and command latency separately. |

The matrix envelope is a bounded implementation target, not a new maximum number of
world jobs. Additional designations stay saved and pending. When selection windows
are needed beyond that envelope, use explicit priority/age fairness and state that
optimality applies to the admitted set. Do not silently truncate to a nearest-N or
first-N set and claim a global optimum. A window larger than the demonstrated fixture
is not a promise that 256×256 worlds or 64 workers are already performant.

Use deterministic operation counts for gameplay; wall-time measurements diagnose and
tune those counts. Keep the host's existing durable clock semantics. Persistent wake
lateness must not create an unbounded catch-up loop ahead of player commands; handle
one bounded occurrence and return to the owning event loop. Do not drop committed
time or acknowledged input as a navigation shortcut.

## 10. Implementation chunks and deletion requirements

| Chunk | Complete outcome and owner | Evidence before expansion |
| --- | --- | --- |
| A. Correct foundations | King settles metric and Hungarian wrapper; Luna implements agreed native matching/metric callers in one coupled root. | Retained Hungarian comparison, tiny sparse oracle, stairs/hops/prefix route-cost laws; one current caller. |
| B. Shared eligibility and honest outcomes | One Luna writer converts all five work providers and TS/native result callers under King's contract. | No routing for globally occupied workers; pending distinct from impossible; pause/cancel/cargo preserved; all callers on one contract. |
| C. Navigation projection and guided search | King owns representation/invalidation; bounded implementer fills approved cache and caller code. | Same graph legality, safe heuristic, retained route admission, local edits and cold rebuild. |
| D. Lazy matching and bounded continuation | King owns numerical proof, fixed objective, fair persisted progression and Region join; mechanical serialization/callers can be delegated. | Eager-vs-lazy objective and legality, insufficient-budget progress, restart/failed commit, actual 8×50 source measurement. |
| E. Coherent playable qualification | King integrates reviewed commits serially, runs one changed-workload proof and publishes accepted existing-preview bytes under current release authority. | Real tree completion, digging/building interruption and two-client responsiveness; user-visible status. |

A and B can be prepared independently with exact file boundaries; shared contract
changes join together. C and D depend on A's metric. Do not start a third writer in
`world.rs`, `contracts.ts` or `session.ts`. Review the first complete caller shape,
then let its owner finish fixes/proof/commit rather than repeatedly parking at labels.
Publish useful coherent repairs before optional TSWAP/hierarchy work. Final closure
still requires the integrated outcome, not a collection of green unit tests.

Delete the replaced Bellman-Ford matcher, eager provider route loops, repeated chosen
route queries, mixed old/new provider API, string budget-error classification and
superseded hard caps. Keep reference artifacts as evidence only. No compatibility
shim, second query registry or game-authored cache-reset choreography. Fix stale plan
language naming the current native matcher libcolony/Hungarian.

## 11. Qualification that exercises the game

Use existing fixtures and extend only the affected laws. All automated commands use
the existing owned `run-proof.sh`; retain failures and terminal/scope cleanup. A docs
commit needs no game test. Do not rerun editor traces or historical environment suites.

### Correctness

- Hungarian: complete/sparse rectangular input, impossible/zero-cost/duplicate edges,
  cardinality deficiency, priority costs and deterministic replay; oracle only in tests.
- Metric: flat, uphill/downhill hop, all current stair orientations, multi-floor
  detour, moving prefix, frame-local journey and selected approach equality.
- Edge ownership: the same admitted edge yields search cost, executed waypoints,
  prefix progress and current-format saved-route validation without separate formulas.
- Navigation: closed cave/deep dig stays unknown or unreachable for the right reason;
  build/remove stair and open a shortcut; unaffected journeys retain valid custody.
- Lazy comparison: same admitted candidate graph, exact eager objective versus lazy
  objective/cardinality. Misleading bounds and equal-cost ties must not hide errors.
- Domain fit: mixed reachable/unreachable jobs within the entire supported Clearing
  make forward progress; cold/stable runs cannot restart a capped search forever.
- Work: no selected worker required to designate; two simultaneous material deliveries
  use distinct quantities/claims; blocked work releases assignment safely; carrying
  cancellation drops/transfers the same real lot before claim release.
- Durability: warm/cold continuation equivalence, reload mid-search, failed atomic
  commit, duplicate command/lost acknowledgment and no doubled physical result.

### Named performance inputs

Retain baseline ca18c66 and exact seed/definitions/commands. First corrected run:
8 workers, 50 designated trees in the actual Clearing. Run to accounted wood output,
not six ticks of movement. Record completion duration, peak pending age, searches,
expanded/settled nodes, material queries, Hungarian passes, cache/continuation bytes,
WASM memory and simulation/save/projection time separately. Include changed planning
record write bytes and cold reconstruction time; saving a frontier is not free.

Then use the same workload at 50 workers and a mixed scenario containing unreachable
work plus ordinary digging/construction and actual delivery. Freeze definitions before
comparing; higher worker counts hitting a different cap are not a speedup. Reuse existing
performance page and Caps controls. Correct its hydrated-JSON counter before calling it
wire traffic. The 128/256 pages only qualify those sizes once the actual resident and
worked domain changes accordingly.

One short DO/two-client exercise should cover receiving commands while planning is
pending, cancellation/manual movement, useful continuing work and restart recovery.
The UI shows queued/planning/waiting-for-access states as facts, not a raw queue-full
exception or an idle animation mistaken for completion. No hosted capacity claim from
the local WASM run. Retain a playable prior deployment for rollback; do not reset real
worlds or migrate saves without the existing explicit authority.

## 12. TSWAP learnings and future use

The [TSWAP paper, sections 3–7](https://arxiv.org/pdf/2109.04264) studies moving agents
to interchangeable targets. It accepts an initial assignment and can exchange targets
during movement to resolve conflicts. Its online formulation tolerates unequal timing
under its stated fair-execution assumptions. Its base problem uses a connected,
undirected graph. Section 5 studies lazy distance evaluation during assignment.
Those ideas do not establish correctness for changing Hive terrain or cargo ownership.

The [authors' repository](https://github.com/Kei18/tswap) supplies MIT-licensed C++
implementations and experiment material. It is research code to inspect and qualify,
not an installed Rust/DO product dependency. The project is at
[kei18.github.io/tswap](https://kei18.github.io/tswap/). No TSWAP runtime has been adopted.

### Use now

Learn from avoiding exhaustive distance computation and reusing search progress.
Preserve Hungarian as the selected matcher. Our lazy wrapper's objective and proof
must be checked independently; the paper's bottleneck/greedy variants do not silently
become our job policy. TSWAP's later target exchanges also would not preserve the
original Hungarian matching's optimum, even when Hungarian supplies its start.

### First optional experiment after the Clearing repair

Use the existing RTS demo, not a new page. `games/formations.ts` currently assigns
equivalent movers to offsets by slot order and emits per-actor moves. Declare a group
of interchangeable formation destinations and compare existing movement with TSWAP
on the same obstacle layout. Keep identity, health, morale, equipment and damage with
the actor. A target exchange changes a destination, not an actor or its inventory.

Judge completed formation, crossings, stalls, traveled distance, CPU and visible
movement quality. Test a blocked choke point and uneven movement timing. Changing
terrain and interruptions need explicit invalidation beyond the static graph proof.
Keep this a separate opt-in group movement policy over common navigation; ordinary
Colony jobs and Survival direct control retain their owners.

### Other possible uses, each requiring a real consumer

| Consumer | Potential value | Required restriction |
| --- | --- | --- |
| Equivalent infantry filling a formation | Exchange positions to reduce blocking. | Compatible movement and slot roles; no archer/cavalry/front-line-role swaps by assumption. |
| Empty-handed workers reaching equivalent staging positions | Spread a group across available positions. | Work owner declares equivalence; it still owns jobs and claims. |
| Warehouse-style pickup/delivery | Learn coordination/reassignment techniques from the related MAPD literature. | Loaded destinations and material reservations are not freely swappable; not covered by the base TSWAP guarantee. |
| Busy common depot or tower-defense entrance | A reverse distance/flow field can amortize routes. | Separate technique from TSWAP; qualify rebuild cost, directionality and local collision policy. |
| Travel across a much larger world | Chunk/portal hierarchy can narrow route domains. | Stored/generated extent, resident navigation and inter-Region authority remain distinct. |

Flow fields are not a default cache for every target. Build one only for observed
repeated compatible destinations, with bounded extent, dependency tracking and an
amortization measurement. Removing a choke point can invalidate a wide field; local
repair is not free. Standard Jump Point Search is not a direct substitute for weighted
multi-level movement; Recast/Detour adds mesh-generation/invalidation work. None is a
prerequisite for this repair.

## 13. References and implementation exit

- [Retained libcolony](https://github.com/mafik/libcolony), plus the pinned local source/provenance above.
- [Installed Hungarian API](https://docs.rs/pathfinding/4.16.0/pathfinding/kuhn_munkres/fn.kuhn_munkres_min.html): finite numeric weights, rectangular constraints and overflow requirements.
- [Installed A*](https://docs.rs/pathfinding/4.16.0/pathfinding/directed/astar/fn.astar.html) and [partial Dijkstra](https://docs.rs/pathfinding/4.16.0/pathfinding/directed/dijkstra/fn.dijkstra_partial.html).
- [Flow-field explanation](https://www.redblobgames.com/pathfinding/tower-defense/) and [hierarchical navigation research](https://webdocs.cs.ualberta.ca/~games/pathfind/).
- [DO durability contract](../docs/decisions/local-snapshots-and-durable-ai-jobs.md) and the current Botanical Field Guide's software-shape/ownership/testing rules.

The repair is complete when the current Clearing actually completes its named work,
retains movement/material/durability laws, remains responsive under its stated workload,
and has one accepted implementation across the real callers. Source review, law pass,
local performance and hosted play are separate receipts. TSWAP experimentation remains
future work; it is not needed to call this repair done.
