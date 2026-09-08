# ADR draft: prove the architecture while the playable clearing stays tiny

## Current sprint: reliable home controls and usable maps

Game CTO direction, 2026-09-08. This section supersedes the historical source/status/sequence below. The older plan remains evidence of the original proof scope. The current game remains deliberately small; a navigable atlas is not permission to move live gameplay into generated terrain.

**Sprint outcome:** Levi can operate the home without awkward floor controls, inspect the same geography at overview and local scale, and navigate a useful map without long synchronous generation blocking input. Each coherent outcome ships on the same authorized preview as it becomes ready. A later small in-game minimap displays the actual clearing, with serial HUD/camera custody. Do not wait for the whole roadmap to provide a playable update.

### What exists, and what still needs work

The published upstairs game and World Lab are separate consumers. At World Lab revision `9db4d31`, the source has a fixed seeded 512×512 overview, an 80×80 local view assembled from 25 cached 16×16 chunks, named location jumps, viewport markers, and terrain/elevation/moisture coloring. The local and overview views use the same geography recipe at different footprints. These are diagnostic maps. Generation is synchronous; general navigation, a bounded generation worker, discovery, durable terrain edits and playable actor/cargo streaming are not established by that release.

The prior upstairs release was published under Levi's explicit move-on direction. Do not reopen its stopped full-home trace as a prerequisite to this sprint. Current floor controls are an active correction candidate, not yet a new release claim. Existing bed/contact and geometric-ordering defects remain their own accepted corrective contracts.

### Small release packets and ownership

| Packet                      | Current status and owner                                                                          | Useful exit                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor controls              | Active: home-ui is sole controls writer; Delivery accepts source/caller correction and integrates | Persistent Ground/Upper controls plus correctly mapped PageUp/PageDown work without selecting stairs; tool policy, focus and short/narrow layout remain coherent; one short real-input trace and affected laws             |
| Atlas location inspection   | Active independent World Lab lane; isolated page/terrain/caller files only                        | Click a coast/ridge or signed coordinate in the overview; local view and inspector identify that exact global cell and match its elevation/moisture; bounded sampling and current cache size remain explicit               |
| Responsive atlas navigation | Next World Lab packet after the preceding source checkpoint                                       | Pan/jump and change request while generation runs; only the newest requested location/identity may display; one bounded worker and queue, explicit generation/draw/byte measurements, no giant synchronous overview action |
| Actual-clearing minimap     | Ready for the next safe HUD/camera slot after controls; Delivery assigns one caller owner         | Show actual people/structures/current level and camera extent; clicking recenters only the camera; markers follow real movement, paused clicks create no world jobs/ticks, and 390px layout remains usable                 |

Delivery owns task decomposition, exact file custody, routine corrections, focused proof, serial Git and same-preview publication. Current home-ui and World Lab writers stay in place. A source reviewer may inspect independently; a documentation lane is not another gameplay writer. No new PM tier or shared-file competition is needed. Changed original art alone retains Astra's personal art review; map input/plumbing does not wait for a new art gate.

The controls reviewer has returned concrete corrections, so there is no grounded deploy ETA until that first corrected source checkpoint is accepted. Delivery reports the next estimate from actual remaining work and names a material publishing blocker promptly. This sprint specifies useful exits, not an invented calendar promise.

### Map contracts implementers must preserve

- Use one world identity, generator and signed coordinate convention. Settle inclusive-versus-exclusive bounds explicitly before extending navigation; map pixels cover geographic footprints, and marker position is not itself a cell identity. Keep fine authoritative terrain distinct from approximate overview summaries.
- Overview click, local inspection and later minimap use shared coordinate contracts. Exact inspection compares the selected cell's full-detail sample with its local chunk values using the same quantization; an approximate overview pixel need not have identical elevation/moisture. World Lab terrain must never be presented as the current playable clearing. A clearing minimap derives its records from the real game display/state projection and uses the existing camera/input owner.
- Remove the local-buffer dependence on the first chunk or input array order. Shuffled chunk inputs must assemble to identical cell placement; signed seams must round-trip correctly. This is a focused source law, not a second renderer project.
- A generation worker wraps the same pure sampler, with bounded resumable work, request epochs and explicit transferred-buffer ownership. New requests supersede old work; stale results cannot overwrite the current view. Worker cancellation must be observable between bounded pieces of work, not only after a giant loop finishes.
- Name visible/resident/in-flight/result/scratch budgets and distinguish generation time from buffer assembly and drawing. An out-and-back journey must return to bounded residency. A rendering-cache eviction is not proof that an authoritative world chunk or unsaved edit was safely evicted.
- Composable seams here are geography sampling, coordinate conversion, request lifecycle, residency and map presentation. A second map reuses these where its domain matches. Do not create another generator, save owner, timer loop or universe of copied map state for each UI panel.
- Keep cartographic knowledge separate from loaded terrain. Exploration/fog, physical crafted maps and a globe remain recorded follow-ons; downloading a chunk never automatically teaches a character its contents. The first minimap may show the already-known tiny clearing without inventing a discovery simulation.

### Next architecture proof and playable follow-through

After responsive maps, the next isolated map proof is one terrain edit/tombstone stored under the lab's separate versioned base-plus-patch namespace, committed before actual decoded-data eviction and still present after regeneration/reload. Failed or stale writes must preserve newer edits. This is queued work, not a currently shipped save feature.

Live generated-world play comes later: a small controlled adjacent-chunk fixture, an existing actor and cargo crossing and returning, home work continuing, correct offscreen state and durable recovery. Levi's tiny-map-fun gate remains. No multiplayer, full globe, caverns, fluids or full fog-of-war implementation enters these map packets.

The home track continues bed/contact corrections and one unified wood+herb transfer owner, then the first recipe-driven brewing process. Brewing must not gain a third hauling implementation. The old paragraph below permitting construction wood to remain indefinitely special-purpose is superseded by [the unified-work recut](unified-work-algebra-recut.md). Small map UI work can land at a safe caller checkpoint without waiting for brewing or displacing its coupled writer.

Associate these outcomes with existing #4 world/maps, #12 controls and #6 performance, keeping #7/#14 work/brewing linked where relevant. Retain existing issues rather than creating one issue per map control. Update the top-level current-status links in PROTOTYPE/ARCHITECTURE; preserve historical evidence with an explicit label. [Repository instructions](../../AGENTS.md) make composability and single ownership the default for every packet.

The [Excalibur reuse decision](excalibur-ecs-and-reuse-decision.md) contributes
no benchmark or dependency claim. Any index, optimizer or culling change must
replace a measured cost in the existing owner while preserving paused-command
invalidation and spatial separation.

## Historical status and prior plan

Status: Game CTO reviewed direction for Delivery publication, 2026-09-07.
Authority: Levi requests review of all plans and a separate large-world generation
page before permitting gameplay expansion. This supersedes automatic
home → upstairs → caravan sequencing; it preserves the active upstairs writer.
Source baseline: shipped feature 765c3282982d2ee6b07d5bea67bc21d08e4c2011.
The inspected worktree also contains unaccepted upstairs changes. No source,
build, performance test, world page or deployment is claimed by this ADR.

## Decision and committed sprint exits

Keep the 15×15 game as the place to judge whether ordinary play is satisfying.
Separately prove that its next world substrate can scale. These are independent
release tracks with one Delivery owner and serial integration, not a map-size
increase concealed inside a home update.

| Outcome | Concrete exit | What that establishes |
| --- | --- | --- |
| Finish the active upstairs bedroom | Gather its actual materials, build legal stairs/floors, carry material up, build and sleep in the upstairs bed; block the sole approach; pause/reload an in-progress traversal/work state. Review actual floor picking and stairwell cutaway. | Shared topology, work positions, resource custody, interruption and save across levels. |
| Publish a separate `/world-lab` | Generate a seeded large region overview, inspect it in the original isometric presentation, pan/jump across signed chunk coordinates, regenerate in another request order, and inspect generation/frame/residency measurements. Gameplay stays on the tiny clearing. | Deterministic terrain generation, coordinate/projection consistency and bounded generation/render work. |
| Establish a real simulation performance baseline | Run the actual simulation, routes, claims and selected WASM optimizer with 5/25/50/100 actors under useful workloads. Record outcomes and phase costs separately from browser display costs. | Where population scaling actually costs time and memory; an evidence-based next optimization. |

These are the sprint's committed proof outcomes, not a calendar guarantee that
all future foundations can be delivered in five days. Delivery estimates the
World Lab after its first actual generator/caller checkpoint and reports coherent
interims on the same preview. A measured shortfall is a finding to fix or a
supported workload limit to disclose, never a successful capacity claim.

The next playable slice after upstairs remains **beer brewing**, with mixed
shelf storage only as its necessary goods consumer. Its readiness contract can
advance independently now; its runtime starts when the coupled home writer is
free. Do not require world expansion or completion of unrelated lab work before
brewing. Do not bundle a brewery, caravan, fluids, multiplayer and a new inventory
framework into the current upstairs candidate.

## Findings from plans and actual source

1. **World-scale architecture is specified but unexercised.** `world.js` still
   owns SIZE=15 and finite inside/blocker scans; `art/scale.js` centres projection
   on SIZE; the cut-earth `art/clearing.js` bake is one authored board. The current
   game cannot become streamed simply by raising SIZE. The lab should establish
   a real reusable terrain/coordinate consumer before changing gameplay topology.
2. **Population capacity is unmeasured.** `jobs.ts:assignWork` already batches
   assignment behind workDirty and uses the actual optimizer; that is valuable.
   Its nested actor/job/pile/route queries and per-actor blocker derivations still
   need whole-workload measurement. Limiting emitted matches does not itself
   bound the work spent searching candidates. The isolated small optimizer probe
   is not a 100-person simulation benchmark.
3. **Storage and hauling are still commodity-specific.** `model.ts`, `jobs.ts`,
   `activity.ts` and persistence contain a separate mugwort bundle/storage path
   beside construction wood. Another item kind should not require a third copy
   of the whole claim/pickup/carry/store chain. Brewing earns a narrow goods and
   capacity owner; construction wood can remain on its existing path until a
   real consumer warrants migration. A shelf is a mixed grouped list, not a pack
   grid. Bulk/weight/filter policy and exact capacities remain proposals.
4. **A timed workstation process does not exist yet.** BUILDINGS is construction
   data, and herb growth is a specific fixed-tick owner. Brewing should establish
   one recipe-driven batch whose consumed inputs, work, fermentation and output
   survive interruption/save. The actor can do something else while it ferments.
   New recipes over that supported behavior should be data; new behaviors still
   extend explicit typed owners. No job DSL or universal actor state machine.
5. **Save and display surfaces need a focused deletion review before new goods.**
   `persistence.ts` has historical schemas plus substantial relational invariants;
   HUD projection manually maintains identity across many entity fields. Keep
   boundary Zod and legitimate custody checks. Classify scheduler/display caches
   before persisting more of them, inspect all consumers before removing fields,
   and measure panel commits before changing selectors. Equal-tick outcomes and
   focus behavior, not line-count targets, decide acceptance.
6. **The roadmap mixes historic and current status.** PROTOTYPE still names the
   old two-person goal/schema; Architecture and the living-world ADR still have
   automatic caravan ordering and old source custody in later sections. The new
   record should mark those sequences superseded and update the top-level current
   baseline without erasing historical evidence or old advisory dispositions.

No evidence from this pass justifies adding an ECS, Effect migration, a second
optimizer, a generic event bus or a new state-management library. Existing
Jotai/XState/Zod have explicit owners. Revisit a maintained primitive against an
observed missing capability or cost, not a library checklist.

## World Lab: first working scope

Use a distinct page and separate local world namespace. It must not import the
Clearing scheduler, overwrite the game's save slot, spawn playable actors or
change live build/path rules. Its new terrain module is production-intended code
with this page as its first consumer; it must remain usable without Pixi/DOM so
the later game and a future host can use exactly the same generation rules.

- Expose seed and generator version, a 512×512 region overview first, and a
  1024×1024 diagnostic preset after the first bounded measurement. Overview pixels
  describe sampled terrain; they are not hundreds of thousands of scene objects.
  Changing seed/region cancels or supersedes queued generation. Report real time
  and buffer counts; never preallocate the entire signed world coordinate domain.
- Start with the documented 16×16 chunk candidate and global signed coordinates.
  Use mathematical floor division, stable feature ownership, and coordinate-based
  randomness. A seed/generator-version change changes the generated world identity.
  Compare exact chunk bytes/checksums across opposite request order and unload/
  regeneration, including x=-1/local15 and a distant coordinate jump.
- Layer elevation, moisture and terrain classification from one deterministic
  sampling recipe. Show diagnostic layers beside the composite isometric view.
  A water mask is terrain classification, not flowing water, drainage or a fluid
  simulation. Do not claim caves from a surface height map. The first sampler
  does not dictate the eventual volumetric excavation representation.
- Render only camera-intersecting chunks plus bounded overhang; use a bounded
  resident window/cache and a bounded generation queue. Choose counts from the
  first source/viewport measurement (a 5×5 window is a candidate). Separate
  rendering disposal from decoded terrain residency. Preserve cross-chunk prop
  sorting and visible canopy overhang; one monolithic ground bake cannot tile.
- Exercise origin-relative projection and inverse picking with the same helper
  intended for the game. Do not duplicate the fixed SIZE transform. Coordinate
  extraction into a shared caller is serial with the upstairs camera owner;
  independent terrain/worker/page files can proceed first.
- Prefer existing maintained noise/platform primitives for commodity mechanics;
  inspect the selected implementation and license before adding a dependency.
  A single native Worker is a candidate for generation responsiveness, with a
  bounded request queue and stale-result rejection; no worker-pool framework.

First checkpoint: adjacent positive/negative chunks, one seed, one inspectable
layer and correct pick round-trip. Then overview/camera culling and measurement;
then original seamless terrain presentation reviewed at game scale. Publish
useful intermediate results rather than wait for final scenery variety.

An optional follow-on inside the isolated lab is one diagnostic terrain edit or
feature tombstone, saved into a separate IndexedDB namespace and recovered after
actual decoded-data eviction and page reload. It must use the intended base+
patch shape and commit-before-evict rule. An in-memory repaint surviving a camera
pan is not durable edit proof. This checkpoint may ship separately; it does not
add gameplay and is not required to finish the first world-generation page.

## Measurement that can falsify the plan

For the World Lab record browser/device/renderer, revision/seed, generation time,
frame intervals during continuous pan, input response, visible/resident chunks,
explicit terrain/texture bytes and allocations/disposals. A repeated out-and-back
journey must settle to the configured cache budget rather than retain every
visited chunk. Test cancellation during a seed change. Avoid reporting JS heap
alone as total memory: WASM, textures and decoded buffers have distinct costs.

For population use an immutable coherent source revision and the actual `step`,
`assignWork`, `optimizeEligible`, movement and resource owners. Fixtures need
ready work, unreachable/waiting work, scarce-material contention, steady walking/
work, a topology change and cancellation. Complete useful outcomes; an idle crowd
or repeated raw Hungarian call is not representative. Keep fixture setup out of
timed samples. Record p50/p95/worst tick and assignment/path/state times, memory,
completed jobs, starvation/wait reasons, unique ownership and equal-tick replay.
Record each fixture's finite topology, task count and offered optimizer-pair count;
this is scheduler workload evidence, not physical population capacity.
Measure HUD publishing/component commits and rendering separately; reusing art
for a diagnostic crowd does not add recruitable people to the playable clearing.

Initial desktop targets are responsive input below 100 ms and ordinary simulation
work well inside the existing 50 ms tick; steady display aims for 60 fps. These
are targets to measure on named hardware, not outcomes already achieved. Mobile,
headless software rendering and hosted runtime fit get separate labels. An
oversized assignment pass should produce a bounded optimization decision before
an ECS rewrite; preserve priority/fairness and scarce claims when reducing work.

## Brewing is the next content-extension proof

Before runtime, Delivery selects one honest finite ingredient acquisition path,
recipe and brewing timing; grain/yeast/water/fuel sourcing remains an unresolved
entry decision, not permission to conjure inputs. Scope the initial resource
path without requiring complete agriculture, fluid transport or combustion.
Mugwort is flavouring. “Fig Leaf Bi-Carbonate” is the later soda/MM..FOOD nod,
not the name or recipe specification of the first herbal ale.

The useful chain is ingredients → mixed shelf → reserved transfer → workstation
work → unattended fixed-tick fermentation → one physical output → store/serve.
Prove last-space competition, full-destination waiting, cancellation/drop,
consumed-input accounting, one output, exact restore and no offline advancement.
Choose a narrow location/capacity API using these actual consumers. A second
recipe over the supported brew behavior should require definition data rather
than copying activity logic; that is the concrete extensibility check.

Normalize old saves into the selected new durable shape using the existing
parser/transaction owner. Preserve real activity/claim/custody facts; remove a
recomputable cache only after proving the next scheduling decisions still agree.
Do not turn this into an upstairs-blocking migration rewrite. The shelf and
workstation inspector consumes one simulation-derived view and emits ordinary
typed commands, with focused updates and stable focus across process changes.

## The expansion gate after the lab

A pretty large world is insufficient. Before unlocking large-world gameplay,
prove one persistent person with actual cargo crosses a real chunk boundary and
returns while another keeps working at home. Home remains resident offscreen;
a third modified unoccupied chunk is saved, evicted and reloaded. Restart must
preserve actors, items, stumps, jobs and construction. Missing terrain has an
explicit needs-data outcome, not an invented free route or destroyed cargo.
Topology, supported rooms and stair openings must also work across a chunk edge.
This controlled integration test is separate from opening the world to play;
Levi's tiny-map fun gate still controls that product transition.

Only after that consumer comes same-world two-client authority, then two-owner
visits/recovery and offline catch-up. A local tool-client using ordinary commands
can later prove AI control boundaries; model calls, Watchdog, DO deployment and
billing remain separate work. The worldgen page proves none of them.

## Delivery, issue custody and review

Game-delivery retains sole Git/deploy and coupled-source integration. Keep the
existing upstairs writer uninterrupted. Assign a genuinely independent World Lab
owner to new terrain/page/worker files, and a bounded performance reader/runner
to frozen-source fixtures. Shared Caps implementation changes require an agreed component/file boundary with
the Botanical CTO and exactly one shared writer; current game composition uses
packed Caps/Stipe and remains game-owned. Do not fork shared primitives into the
game. Each portfolio checks an accepted shared change in its actual consumer.
The systems lane can finish brewing/commodity readiness
and reconcile docs; it is not a second runtime writer. Do not give one PM all
three execution responsibilities. New visible assignments use the supported
Shiitake role where available, otherwise record the current role-capability gap.
Astra retains original art direction/review. Delivery accepts routine source,
corrections and proofs without another CTO gate; shared camera/Vite/package
edits integrate serially. Ordinary gameplay releases need not await lab art.

Publish this reviewed draft under existing docs/decisions and link it from both
plans. Update #3 (upstairs), #4 (world lab versus gameplay expansion), #6 (real
population measurements), #7/#14 (mixed storage/brewing), and current ownership/
status paragraphs. A lab child issue under #4 is useful if Delivery gives it an
independent owner; no new board/report framework. Preserve the other ideas in
#2/#8–11/#13/#15–19 and existing ADRs with their first-consumer proof boundaries.

Review inputs: PROTOTYPE, ARCHITECTURE, all four current decision records, the
19 open issue bodies plus current #4/#6/#14 comments, direct current source/caller
inspection, and the independent notes `sprint-architecture-audit.md` and
`world-lab-ready-audit.md`. No implementation test or benchmark was run for this
planning review. Current complexity/duplication advisories remain evidence to
address by responsibility as those callers change, not a zero-findings claim.
# ADR draft: prove the architecture while the playable clearing stays tiny

## Current sprint: reliable home controls and usable maps

Game CTO direction, 2026-09-08. This section supersedes the historical source/status/sequence below. The older plan remains evidence of the original proof scope. The current game remains deliberately small; a navigable atlas is not permission to move live gameplay into generated terrain.

**Sprint outcome:** Levi can operate the home without awkward floor controls, inspect the same geography at overview and local scale, and navigate a useful map without long synchronous generation blocking input. Each coherent outcome ships on the same authorized preview as it becomes ready. A later small in-game minimap displays the actual clearing, with serial HUD/camera custody. Do not wait for the whole roadmap to provide a playable update.

### What exists, and what still needs work

The published upstairs game and World Lab are separate consumers. At World Lab revision `9db4d31`, the source has a fixed seeded 512×512 overview, an 80×80 local view assembled from 25 cached 16×16 chunks, named location jumps, viewport markers, and terrain/elevation/moisture coloring. The local and overview views use the same geography recipe at different footprints. These are diagnostic maps. Generation is synchronous; general navigation, a bounded generation worker, discovery, durable terrain edits and playable actor/cargo streaming are not established by that release.

The prior upstairs release was published under Levi's explicit move-on direction. Do not reopen its stopped full-home trace as a prerequisite to this sprint. Current floor controls are an active correction candidate, not yet a new release claim. Existing bed/contact and geometric-ordering defects remain their own accepted corrective contracts.

### Small release packets and ownership

| Packet                      | Current status and owner                                                                          | Useful exit                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Floor controls              | Active: home-ui is sole controls writer; Delivery accepts source/caller correction and integrates | Persistent Ground/Upper controls plus correctly mapped PageUp/PageDown work without selecting stairs; tool policy, focus and short/narrow layout remain coherent; one short real-input trace and affected laws             |
| Atlas location inspection   | Active independent World Lab lane; isolated page/terrain/caller files only                        | Click a coast/ridge or signed coordinate in the overview; local view and inspector identify that exact global cell and match its elevation/moisture; bounded sampling and current cache size remain explicit               |
| Responsive atlas navigation | Next World Lab packet after the preceding source checkpoint                                       | Pan/jump and change request while generation runs; only the newest requested location/identity may display; one bounded worker and queue, explicit generation/draw/byte measurements, no giant synchronous overview action |
| Actual-clearing minimap     | Ready for the next safe HUD/camera slot after controls; Delivery assigns one caller owner         | Show actual people/structures/current level and camera extent; clicking recenters only the camera; markers follow real movement, paused clicks create no world jobs/ticks, and 390px layout remains usable                 |

Delivery owns task decomposition, exact file custody, routine corrections, focused proof, serial Git and same-preview publication. Current home-ui and World Lab writers stay in place. A source reviewer may inspect independently; a documentation lane is not another gameplay writer. No new PM tier or shared-file competition is needed. Changed original art alone retains Astra's personal art review; map input/plumbing does not wait for a new art gate.

The controls reviewer has returned concrete corrections, so there is no grounded deploy ETA until that first corrected source checkpoint is accepted. Delivery reports the next estimate from actual remaining work and names a material publishing blocker promptly. This sprint specifies useful exits, not an invented calendar promise.

### Map contracts implementers must preserve

- Use one world identity, generator and signed coordinate convention. Settle inclusive-versus-exclusive bounds explicitly before extending navigation; map pixels cover geographic footprints, and marker position is not itself a cell identity. Keep fine authoritative terrain distinct from approximate overview summaries.
- Overview click, local inspection and later minimap use shared coordinate contracts. Exact inspection compares the selected cell's full-detail sample with its local chunk values using the same quantization; an approximate overview pixel need not have identical elevation/moisture. World Lab terrain must never be presented as the current playable clearing. A clearing minimap derives its records from the real game display/state projection and uses the existing camera/input owner.
- Remove the local-buffer dependence on the first chunk or input array order. Shuffled chunk inputs must assemble to identical cell placement; signed seams must round-trip correctly. This is a focused source law, not a second renderer project.
- A generation worker wraps the same pure sampler, with bounded resumable work, request epochs and explicit transferred-buffer ownership. New requests supersede old work; stale results cannot overwrite the current view. Worker cancellation must be observable between bounded pieces of work, not only after a giant loop finishes.
- Name visible/resident/in-flight/result/scratch budgets and distinguish generation time from buffer assembly and drawing. An out-and-back journey must return to bounded residency. A rendering-cache eviction is not proof that an authoritative world chunk or unsaved edit was safely evicted.
- Composable seams here are geography sampling, coordinate conversion, request lifecycle, residency and map presentation. A second map reuses these where its domain matches. Do not create another generator, save owner, timer loop or universe of copied map state for each UI panel.
- Keep cartographic knowledge separate from loaded terrain. Exploration/fog, physical crafted maps and a globe remain recorded follow-ons; downloading a chunk never automatically teaches a character its contents. The first minimap may show the already-known tiny clearing without inventing a discovery simulation.

### Next architecture proof and playable follow-through

After responsive maps, the next isolated map proof is one terrain edit/tombstone stored under the lab's separate versioned base-plus-patch namespace, committed before actual decoded-data eviction and still present after regeneration/reload. Failed or stale writes must preserve newer edits. This is queued work, not a currently shipped save feature.

Live generated-world play comes later: a small controlled adjacent-chunk fixture, an existing actor and cargo crossing and returning, home work continuing, correct offscreen state and durable recovery. Levi's tiny-map-fun gate remains. No multiplayer, full globe, caverns, fluids or full fog-of-war implementation enters these map packets.

The home track continues bed/contact corrections and one unified wood+herb transfer owner, then the first recipe-driven brewing process. Brewing must not gain a third hauling implementation. The old paragraph below permitting construction wood to remain indefinitely special-purpose is superseded by [the unified-work recut](unified-work-algebra-recut.md). Small map UI work can land at a safe caller checkpoint without waiting for brewing or displacing its coupled writer.

Associate these outcomes with existing #4 world/maps, #12 controls and #6 performance, keeping #7/#14 work/brewing linked where relevant. Retain existing issues rather than creating one issue per map control. Update the top-level current-status links in PROTOTYPE/ARCHITECTURE; preserve historical evidence with an explicit label. [Repository instructions](../../AGENTS.md) make composability and single ownership the default for every packet.
