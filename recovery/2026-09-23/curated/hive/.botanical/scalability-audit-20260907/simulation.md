# Simulation/data/job/path scalability audit — 2026-09-07

Scope: read-only review of the simulation seam on evolving dirty source. The 15
existing actual-WASM laws were read as nearest evidence; no production test or
browser run was repeated. Hashes are in `live-hashes-initial.txt` and
`live-hashes-final.txt`: all simulation/test files remained identical; the
actively owned `main.js` caller changed repeatedly from `0886d74b...` to the
final observed `80222721...` during review and was reread only to confirm its
command boundary. Root's wider
frozen snapshot is in `source-at-review/` and `source-inventory.json`.

No new correctness defect appears in the advertised two-person, one-party,
15×15 level-0 home. The first three findings block already-requested extensions;
the remaining work should be triggered by the named scale rather than landed as
a generic engine rewrite.

## 1. Near-term foundation blocker — finite topology queries cannot express the loft or streamed chunks

**Evidence.** `model.ts:6` already supplies the selected spatial address:
global x/z plus level, from which chunk coordinates can be derived.
`world.js:2,20-30` still hard-codes a 15×15 residency boundary and rejects every
nonzero level; `world.js:33-39` exposes only same-level cardinal terrain
neighbors. `construction.js:65-93` floods only that finite level-0 square.
Trees, piles and sites also remain global arrays in `model.ts:85-92`, so overlap,
path and indoor queries cannot yet restrict themselves to resident chunk data.

**Mechanism.** A legitimate level-1 placement is rejected before a job exists,
and `route` returns null for any destination outside the clearing. Loading a
second chunk still cannot make `inside`, pathing, indoors and entity scans
operate over the resident global-coordinate region.

**Smallest justified primitive and timing.** Keep global x/z/level as the stable
address and derive chunk ownership from it. Before the loft, let topology expose
explicit vertical traversal edges for stairs. Before streaming, make
`inside`/path/indoors and spatial entity lookup operate on resident chunk data;
a normal same-level adjacent chunk boundary remains an ordinary terrain edge,
not a portal. Keep actor/job/entity IDs and the fixed-step owner; no ECS is
required.

**Falsification.** Through the real command path, place and complete a level-1
site reachable only by a stair; route and finish one job across an ordinary
adjacent loaded-chunk boundary using global coordinates; then evict and reload a
third unoccupied modified chunk while the active home stays pinned.

## 2. Near-term correctness blocker — party and loaded-simulation ownership still leak through `home`

**Evidence.** `actors.ts:25-26` defaults `members` to `home`.
`clearing.ts:94-95` drains rest only for that default roster, while
`clearing.ts:97` advances every actor record. `resources.ts:71-87` searches only
home members for a reachable refund cell, even though `cancelJob` already has
the canceled job and its `scope.party` at `orders.ts:42-53`. Jobs and routine
otherwise carry explicit party IDs.

**Mechanism.** Once a second party exists, its actors never lose rest; canceling
its delivered blueprint can choose a location reachable only by the unrelated
home party or throw despite the builder being able to recover it. An actor left
in the global record continues work even if its chunk is not being simulated.

**Smallest justified primitive and timing.** Keep `party.members` as the sole
mutable membership owner and derive actor-to-party lookup from it; do not add a
second party field to actors. Before the second party departs, pass the job's
party to refund placement and have the fixed step enumerate members of the
loaded/simulated parties once. Departure must release claim/cargo/activity
ownership before an actor stops being stepped. Active home data remains pinned;
this does not require evicting an occupied origin.

**Falsification.** Put one actor in a real second party, run equal ticks and
observe both rest values fall; cancel wood delivered by that party where only
its member has a route and recover the exact amount; depart with an active claim
and prove it is released once while an unrelated modified chunk can evict and
round-trip.

## 3. Near-term foundation blocker — new job/activity kinds compile into the wrong existing behavior

**Evidence.** `model.ts:21-35` models `Job` and `Activity` as records with a
union-valued `kind`, not discriminated variants. `jobs.ts:95-124` handles build,
then chop, then treats every other job as rest. `activity.ts:94-99` treats every
target except chop/pickup as a site, and `activity.ts:128-141` has no exhaustive
`never` branch.

**Demonstrated mechanism.** In the ignored frozen snapshot I added `craft` to
both valid kind unions without adding handlers. Strict TypeScript still exited
0 (`run-u391.scope`, invocation
`d7897a545c4943a08875c4939bfa4e01`; see
`exhaustiveness-result.json`). A future workstation job could therefore be
scheduled as sleep/site work instead of producing a compile failure.

**Smallest justified primitive and timing.** Before the first workstation or
new activity, turn Job and Activity into closed discriminated unions and make
`jobOption`, `targetFor`, and `advanceWork` exhaustive. Add the concrete craft
variant only with its behavior; do not add a task DSL or handler framework.

**Falsification.** A temporary new union variant must fail strict TypeScript at
every unhandled owner; the eventual real workstation variant must then pass one
producer-to-completion law.

## 4. Near-term scale issue — shared admission performs work after its own useful task bound

**Evidence.** `assignWork` correctly gates on `workDirty` (`jobs.ts:159-161`) and
intends to consider at most one shared ready job per worker (`jobs.ts:225-245`).
But the cap is checked only after `jobOption` at lines 235-240, and the outer job
loop never stops after enough distinct ready jobs exist. Personal admission also
scans the ordered job array separately for every idle actor (`jobs.ts:199-214`).
A build option scans every pile and runs one pickup route plus four approach
routes per pile (`jobs.ts:66-77`, `movement.js:26-32`).

**Mechanism.** With W idle workers and J ready shared jobs, candidate/path work
continues toward J×W even though only the earliest W distinct shared jobs can be
offered. For hauling, that multiplies again by pile count and full-grid BFS.
Five actors on the current grid are fine; 50/100 actors and hundreds of
blueprints are the first meaningful pressure point.

**Smallest justified primitive and timing.** First stop the outer shared-job scan
once W distinct ready jobs have been found. When the roster grows beyond the
home five, partition the existing ordered work view by party/personal scope and
batch shortest-path queries against one topology snapshot. Preserve current
first-ready policy and real libcolony matching.

**Falsification.** For W workers and J>W ready jobs, count candidate evaluations
and prove they stop after the earliest W ready job IDs while selected
actor/task pairs match the current policy. Separately compare batched routes to
current deterministic routes on blocked/reachable fixtures before removing the
old query path.

## 5. Still-open prior finding — static topology and shelter are rebuilt in fixed-tick hot paths

**Evidence.** Every walking actor rebuilds `blockedCells` in
`activity.ts:109-111`; `clearing.ts:100` calls `shelteredBeds` every fixed tick;
night routine calls it once per eligible actor at `routine.ts:31-40`; roof/rest
candidate generation calls `indoors`/`shelteredBeds` again at
`jobs.ts:49,112-117`. `shelteredBeds` itself performs an outdoor flood, global
site scans, doorway-to-bed BFS, and nested roof scans (`construction.js:65-133`).

**Mechanism.** Unchanged walls/doors/roofs are recomputed every tick and often
per actor. Cost grows with loaded cells, sites, doors, beds and walking actors,
independent of whether topology changed. This was already identified in the
foundation review and remains open.

**Smallest justified primitive and timing.** Before increasing map size or
moving beyond five actors, let the world/construction owner expose a cached
read-only topology projection (blocked cells, indoors, sheltered beds) keyed by
one revision changed only by placement/cancel, tree fall, and relevant building
completion. Pass that projection through a step/assignment pass.

**Falsification.** Across 100 ticks with unchanged topology, count one projection
build; each wall placement, tree fall, or shelter-affecting completion causes
exactly one new build, while all current routes, shelter results and replay state
remain equal.

## 6. Later measured optimization — hot activity/resource lookups are repeated linear scans

**Evidence.** Each active actor every tick scans entity arrays in
`activity.ts:94-105` and scans all jobs for existence. Scheduling repeatedly
finds sites/trees/piles (`jobs.ts:48,97,147-155`). `availableWood` scans every
claim per pile and `neededWood` scans all claims and actors per site
(`resources.ts:11-28`), inside the per-worker/per-job/per-pile candidate loop.

**Mechanism.** At 100 active actors and 100 jobs, job existence alone can make
roughly 10,000 comparisons per tick before entity and reservation scans. The
hauling cross-product is larger. There is no current two-person defect.

**Smallest justified primitive and timing.** At the 50-actor or large-task
checkpoint, derive one read-only per-step/scheduling index by entity/job ID and
one per-assignment reservation summary by pile and site. Update the ephemeral
summary as claims commit. Physical quantity remains solely in pile/cargo/site;
do not copy claims into physical stock or add a second durable ledger.
Chunk-owned maps may naturally replace this interim index, so do not build both.

**Falsification.** Compare derived lookups/totals with full scans while running
the existing scarce-stock, cancel, cargo-drop and replay laws at 5/50/100 actor
fixtures; every assignment and physical conservation total must match, while
lookup counts become linear in loaded state per pass rather than per candidate.

## 7. Before another command producer — prove the new settlement boundary and bound retention

**Evidence.** Current `clearing.step` returns one typed `CommandResult` for every
submitted command (`clearing.ts:83-104`), explicitly rejects batches received
while paused, and the current caller consumes those results directly
(`main.js:275-288`). This supersedes the inference wrapper observed in the
frozen review bytes. Inputs are still appended to the unbounded
`state.commands` before `acceptCommand` validates them (`clearing.ts:90-94`,
`model.ts:98`). Root's frozen actual-WASM `run-u390.scope` result remains useful
only as evidence for the old boundary: two identical builds both passed the
preliminary check, one applied, both were logged, and that frozen call returned
no settlement (`command-result.json`).

**Smallest justified primitive and timing.** Before networking or any second
producer, join the current `CommandResult[]` contract to its real caller proof,
including mixed conflicting commands and pause. Add a producer command ID only
when retries exist. Before indefinite sessions, snapshot state and retain only
the replay tail after the checkpoint. Do not impose an arbitrary lifetime
command-acceptance cap or build event-sourcing machinery for the local demo.

**Falsification.** One batch containing conflicting requests yields one accepted
and one rejected result tied to the original requests; a paused caller either
retains or explicitly rejects the batch by contract; snapshot+tail replay equals
an uninterrupted run after compaction; retrying one identified network command
applies it once.

## Foundations to retain

- `clearing.step` remains the single deterministic transition owner, and ordered
  same-tick commands already replay identically.
- Actor/party/job IDs and explicit scopes are useful seams; job authorization,
  activity execution and physical wood ownership are separate and readable.
- A wood unit exists in exactly one physical place; claims reserve it without
  increasing stock. Keep this invariant while adding derived indexes.
- `workDirty` already avoids unconditional matching, and `matching.ts` keeps
  eligibility local while the actual pinned libcolony optimizer owns joint
  assignment. Its dense batch is at most quadratic to construct and its solver
  is cubic in roster/task dimension; measure actual 5/50/100 batches after
  candidate/path work is bounded. Do not replace or shard it without a measured
  missed tick budget.
- `route` has deterministic neighbor order and an explicit null outcome. For
  long chunk routes, replace `path.shift()` (`movement.js:44-57`) with a cursor
  and reconstruct with reverse rather than repeated `unshift`; this is a later
  path-length optimization, not a reason for a new path framework now.

No generic ECS, Effect layer, alternate optimizer, task DSL, or engine framework
is required by these findings.
