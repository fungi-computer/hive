# ADR draft: prove the architecture while the playable clearing stays tiny

## Current sprint: a small home worth returning to

Game CTO reviewed direction, 2026-09-08. Replace only the current section of `docs/decisions/architecture-proof-sprint.md` after review; retain its historical section and evidence below. This is proposed sequencing, not a new source, proof, deployment, cost or deadline claim. Delivery's exact revision/release records establish what is playable.

**Outcome:** on the deliberately tiny map, the player can confidently place and inspect things, organize real supplies, make an honest brew, leave people working, and return to a useful result. A separate responsive map lab proves future geography without making a larger world the substitute for a satisfying home. Ship coherent improvements on the same preview as each becomes ready.

### Preserve current work and name its limits

Continue the existing controls/visual-geometry/picking correction and independent responsive World Lab work with their current writers. This reconciliation does not reopen the stopped upstairs house-building marathon or move active authors. Selection, persistent designation, direct orders, Draft/Go, level controls, view occlusion and physical contact remain distinct decisions. The intended click, preview and submitted target must agree; transparent sprite padding cannot intercept distant ground.

The retained Maps baseline describes diagnostic overview/local views sharing a geography recipe. A candidate worker or navigation diff is not hosted evidence. Keep exact selected-cell inspection distinct from approximate overview samples, signed coordinate and chunk-order invariance, bounded cancellable generation, stale-result rejection and explicit buffer ownership. World Lab neither owns the playable clearing nor overwrites its save.

The actual-clearing minimap remains a small independent consumer at the next safe HUD/camera handoff: show real people, structures, selected level and camera extent; click recenters the camera without jobs or ticks. Do not give it a second generator or duplicate game state. Loaded terrain is not discovered knowledge. Later committed edit/tombstone → decoded-data eviction → regenerate/reload is a separate lab proof; actors/cargo crossing live chunks remains deferred behind tiny-map playability.

### Playable packets and dependencies

| Packet                                        | Dependency and owner boundary                                                                                                | Player-visible exit                                                                                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trustworthy controls and spatial presentation | Current writer remains; reviewed geometry shared by actual picking/diagnostics, separate from simulation support/path policy | Select the visible intended thing, access Ground/Upper with buttons/keys, keep compatible tools armed, inspect without covering essential controls, and understand who stands in front/behind.                   |
| One goods/transfer owner                      | One coupled work/material/save writer; serial view/HUD handoff                                                               | Existing wood construction supply and herb shelving both reserve, pick up, carry, deliver, wait, drop and resume through the same laws. Save interruption preserves identities and quantities.                   |
| Mixed storage                                 | Full wood/herb migration closed; reuse its location/capacity/claim owner                                                     | One shelf holds multiple permitted goods, shows a simple grouped list and remaining capacity, and explains a rejected/full destination. No backpack puzzle UI or duplicate contents store.                       |
| First brewing                                 | Delivery records actual recipe, acquisition and economics; mixed storage and common transfer are usable                      | Obtain finite inputs, stage them at a real vessel, perform visible preparation, do another job during fermentation, then collect or serve exactly one batch through ordinary goods custody.                      |
| One ecology consumer                          | Brew/home play feedback; reuse the actual vessel/transfer/process seams                                                      | Establish one newly sown mugwort plant with a carried-water delivery: “needs water” becomes growth, then a useful harvest returns to storage/brewing. No recurring chore loop without evidence it improves play. |

These are serial gameplay dependencies, not a fixed calendar or a mandate to finish every row before publishing. Independent map/art/research work can proceed without broadening the coupled candidate. Delivery gives estimates after a useful first source/caller checkpoint.

### Goods migration has a deletion exit

The first source checkpoint can fully move existing herb Store through a generic transfer owner, with quantity splitting and destination promises designed for the immediate wood port. It does not satisfy completed unification. Then construction uses the same owner for partial wood pickup, supply, cancellation, embedding and salvage. A third beer hauling implementation rejects the candidate.

Preserve meaningful differences as data and explicit outcomes: wood carries up to its current two units, mugwort retains whole-bundle identity; supply delivery advances construction while storage delivery finishes its step. One transfer retains the destination obligation across reserved/carrying phases. Continued cargo precedes new automatic work, while personal/shared priority, Work flags, Draft interruption and actual libcolony matching remain intact. Claims never count as physical stock. Clearing an activity must not accidentally erase a live transfer.

Delete authoritative runtime `piles`, actor `cargo`, `claims`, `herbBundles`, `herbStorageClaims` and `Site.delivered`, plus the separate pickup/delivery/drop and material-validation branches they support. Their new lots, containers, transfers and embedding ledger have one synchronous mutation owner. Read-only display selectors are acceptable; writable legacy mirrors are not. Old wire fields remain only for historical save conversion. Plant development keeps its own validation, not a generic bag of optional fields.

Keep strict v1–v6 parsing/rejection before deterministic conversion and validate the resulting new schema. Preserve paused restore, job progress, path/leg, scope/priority, raw recovery and no write merely from load. Old identities are only unique per collection: reserve existing herb identities, remap colliding wood/synthetic IDs deterministically and rewrite references/allocator together. Handle valid empty wood shells deliberately. Preflight teardown/refund placement before deleting its source. Per-material live + embedded/transformed + sink balances must remain equal to production; a single combined “item count” is insufficient.

Mixed storage then selects one explicit bounded capacity policy, compatible grouping/stacking rules and visible contents representation. Capacity, carry limits and liquid containment are different policies. Existing goods exercise the first mixed list; future filtering/priorities and automatic storage demand enter only when separately needed. It must not silently make every shelf an unlimited vessel.

### Delivery settles the first brew before implementation

The architecture is ready; the exact recipe is not. The retained readiness note and current plans leave grain, yeast, water origin/quality, fuel, acquisition, quantities, work/fermentation duration, station cost/capacity and serving effect/economics unresolved. Delivery owns this finite decision under existing game authority. No further routine approval is needed, and missing choices must not become hidden defaults in worker code. Mugwort provides flavouring; it is not fermentable grain. The MF DOOM reference remains named inspiration, not a settled second recipe.

Record one attainable supply route for every input and container. Do not grant proof-only ingredients or invent portable keg material at completion. Stage real lots in the vessel; preparation atomically converts consumed portions into a batch ledger bound to that vessel. Release the worker; the existing authoritative clock advances the batch, with pause and local offline behavior unchanged. Completion converts it once into output in vessel custody. External storage being full cannot delete it. Portable packaging must be a real input/existing container; otherwise serve from the occupied vessel. Block station removal while inputs/batch/output remain until a supported teardown policy exists.

Recipes over supported operations are versioned definitions/assets with checked references. New physical behavior earns a closed typed operation and invariant; no arbitrary callbacks, universal job engine or additional scheduler. Pin in-flight semantic recipes so changing configuration cannot rewrite an existing batch. Demonstrate a second recipe as data only when it is a real accepted playable recipe, not filler created for a test.

### Original brewhouse and authored structure research

Astra is personally authoring reusable original two-storey brewhouse art and a scene template. Its optional visual study proves appearance, reusable prop/room composition, levels/cutaway and readable workstation placement at native/game scale. It may portray a composed example; it does not claim that the simulation gathered materials, constructed it, brewed there or generated a village.

The reviewed [authored-building procedural assembly study](authored-building-procedural-assembly-study.md) verifies Minecraft Bedrock template pools/connectors and creator-described Gungeon/Isaac authored-room composition, with explicit edition and source limits. It supplies the bounded building-template contract; no runtime assembler is implemented by that research. A future runtime room template uses relative cells/levels, direction, entry/access and support requirements, versioned content references and fresh instance IDs. Player stamping calls the existing construction/admission owner and exposes conflicts/costs; it cannot inject finished sites or bypass jobs. Generated settlement initialization is a distinct one-time creation cause for finished structural/semantic records. It additionally needs site suitability, stable instance identity and canonical feature ownership across chunks; regeneration never replaces player changes or refills contents. Those runtime consumers are not prerequisites for publishing the isolated brewhouse study, and a successful study is not their acceptance.

### What the studies support—and do not prove

Retained RCT, Stronghold, RuneScape, Diablo and Darkest Dungeon notes support readable cost/commit/response, physical production and preparation/return rhythms. The colony-control studies support separating selection, designation, direct work and drafting. Coverage is bounded: no comprehensive DF/Prison Architect review, RimWorld right-click evidence is largely mod-author material, detailed shelf behavior is not uniformly primary, the Darkest Dungeon talk was not watched, and RuneScape/Don't Starve editions are distinguished.

ONI/RimWorld/Dubs notes support coupled conditions, overlays and service tiers, not a verified current solver. Water-history, compost and beaver research offers conditional, site-specific mechanisms and tradeoffs; it does not establish universal restoration, safe treatment or greenhouse performance. Millison material was selectively read rather than all videos watched. Minecraft/RimWorld landform studies separate deliberate shape, density/cave geometry and ecology; generation-time aquifers are not a live fluid solver, and planar roof grids are not stacked Hive volume.

Thus the proposed first ecology addition is one finite-source, physical-vessel watering operation for plant establishment. Confirm representation after brewing, explicitly migrate existing plants, and show the limiting condition. Regional flow, groundwater, gases/heat, fire, sewage/compost, climate, perennial forests, animals/beavers, caves, realms, tarot, factions and multiplayer remain durable future direction.

### Prove usefulness, deletion and cost

Review actual handlers and immediate callers; retain visible Fallow findings and remove superseded paths rather than hiding complexity. Use focused deterministic laws for competing source/capacity, partial/whole pickup, interruption, teardown, corrupt/old saves and exact output settlement. One short real-input trace through the changed loop plus exact served parity is sufficient; preserve prior failures and scope limits.

Measure useful work separately: candidate/path/matching/commit counts and times, input/HUD/render/save costs, and map generation/assembly/draw/resident/in-flight/scratch bytes. An optimizer microbenchmark, lab map or offscreen sprite does not prove 100 active people or offline simulation.

Ask Levi: can he understand and correct a shortage without explanation; do the first ten minutes offer meaningful choices; is watching work satisfying; does storage reduce friction; and does fermentation create useful downtime rather than waiting? Return to those answers before adding area or chores. Delivery retains serial Git/proof/publication and visible PM outcome ownership; Astra retains architecture/product and changed original-art review. No extra management framework or blanket art gate for routine source work follows.

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
