# Sprint architecture audit: prove the spine with beer, keep worldgen in a lab

Read-only audit, 2026-09-07. Source baseline is public/current HEAD
`765c3282982d2ee6b07d5bea67bc21d08e4c2011`. Line references below describe the
current dirty worktree, which contains the active upstairs candidate and is not
treated here as accepted public proof. This audit changes no tracked source,
tests, Git state, preview, or deployment.

## What is fact, plan, and claim

**Accepted/current facts.** Hive has one synchronous fixed-step simulation,
typed commands/jobs/activities, libcolony assignment, explicit wood claims, and
a versioned IndexedDB snapshot boundary. The current playable map remains a
finite 15 by 15 clearing (`src/world.js:1-34`). The dirty candidate already has
explicit levels 0/1, stairs/floors, and save schema 6; its presence in source is
not the same as final upstairs acceptance.

**Accepted next direction.** Finish and prove the upstairs bed, then make the
first workstation a kettle plus fermentation vessel for one real herbal ale
(`ARCHITECTURE.md:116-132`; `PROTOTYPE.md:72-91`). Shelf presentation is mixed
contents as a grouped item/count list, not a backpack grid. Exact numeric space,
bulk, weight, filter, and priority policy remains proposed rather than accepted.
The accepted architecture also requires measured 5/50/100-person workloads
before an ECS or storage rewrite (`ARCHITECTURE.md:359-365`).

**Untested claims.** Deterministic border-continuous chunks, resident/visible/
simulating lifecycles, caravans, hosted Durable Objects, offline catch-up,
cross-world transfer, fluids/environmental fields, delegated AI, broad modding,
and 50-100-person capacity remain plans or hypotheses. A dedicated worldgen page
can prove only generation and its presentation; it cannot prove chunk
persistence, simulation residency, caravans, or multiplayer.

## Recommended bounded sprint

Keep the active upstairs writer on the existing 0/1 proof until the bed is built,
reached, used, blocked correctly, and restored. The isolated `/world-lab` can run
in parallel, and an actual 5/25/50/100 simulation measurement is a bounded
architecture proof beside it. Measure the HUD in the same evidence pass and
change its shape only if the measurement identifies a real cost.

Beer remains the next gameplay slice immediately after upstairs, before caravan
integration. Do not commit its whole vertical slice into the same bounded sprint:
it introduces a new goods/capacity seam, a passive process owner, a new save
shape, and unresolved ingredient sources. This sprint should leave its exact
ingredient contract and the three source boundaries below review-ready. If the
upstairs lane finishes early, mixed commodity storage is the safe first beer
checkpoint; the full brew outcome remains one coherent subsequent acceptance.

This ordering keeps the next workstation unambiguously beer without promising
upstairs, a complete brewing/storage slice, a workload study, and World Lab as
four simultaneous short-sprint exits.

## Six gaps, in priority order

### 1. P0 — The recorded release order is stale against the accepted beer-first direction

The newest accepted direction says the first workstation after upstairs is beer
(`ARCHITECTURE.md:123-132`; `PROTOTYPE.md:81-91`). Yet the architecture
implementation table still moves directly from upper-floor bedroom to caravan/
streamed terrain (`ARCHITECTURE.md:724-732`), and the accepted living-world ADR
does the same (`docs/decisions/home-expeditions-and-living-world.md:158-164`).
Those older rows now compete with the tiny-map depth gate and make the next
consumer ambiguous.

**Smallest real correction/proof:** the delivery plan must say upstairs -> beer
and mixed storage -> generated chunks/local caravan, while World Lab remains a
parallel non-gameplay architecture study. An issue or plan row is evidence of
intent only; acceptance still requires the real beer chain below. This correction
does not authorize another workstation or postpone the later caravan.

### 2. Next ready slice — Commodity custody, capacity, and passive processing have no shared owner

The current model has wood-only actor cargo and claims (`src/model.ts:100-124`)
beside a separate `HerbBundle` location and `HerbStorageClaim`
(`src/model.ts:134-143`, `src/model.ts:168-179`). Storage then repeats the whole
route/claim/transfer path in `src/jobs.ts:177-220`, `src/jobs.ts:327-402`, and
`src/activity.ts:32-177`. Both scheduling and save validation enforce exactly one
bundle per shelf (`src/jobs.ts:202-203`; `src/persistence.ts:1419-1431`). That is
already incompatible with the accepted mixed-content shelf and would require a
third special path for grain, yeast, or keg output.

The smallest earned seam is fungible **goods**, not a universal inventory:
identified stacks/batches have a kind, quantity, and one explicit location; one
transfer reservation promises source quantity and destination admission. Keep
construction wood on its working scalar path and keep future gear/backpack
footprints outside this seam. The grouped shelf list derives counts by good kind
from the authoritative locations. Choose one small visible capacity unit for the
beer proof only if CTO resolves that proposal; do not encode future bulk, weight,
filter, or priority policy into this seam.

**Smallest real consumer/proof:** one shelf simultaneously contains mugwort and
one other brewing good, then receives the keg and shows all three as grouped
counts. If a concrete capacity is selected for this slice, two workers competing
for its last space cannot overfill it. Interruption and shelf deconstruction put
carried/stored goods in one reachable location exactly once, and save/restore
preserves the same contents. This closes the accepted mixed-list requirement; it
does not claim settled capacity policy or a general container, trade, weight, or
backpack system.

The same slice also exposes the missing process owner. `Site` contains only
construction progress (`src/model.ts:144-151`). Jobs and activities are closed
unions handled through explicit switches (`src/model.ts:41-92`;
`src/jobs.ts:228-278`; `src/activity.ts:375-432`), and a job is deleted when
actor work finishes (`src/activity.ts:68-72`). Mugwort growth is a special
whole-state scan (`src/clearing.ts:108-116`). Nothing currently owns a process
that starts after ingredient delivery, continues without occupying an actor,
survives save/reload, and later exposes a physical output. `BUILDINGS` is only a
literal structure recipe table (`src/construction.js:15-66`), as the ADR correctly
acknowledges (`docs/decisions/home-expeditions-and-living-world.md:94-100`).

Use the beer slice to establish exactly one process record owned by its
workstation/batch and one authored recipe definition containing its selected
inputs, actor-work duration, fermentation duration, and output kind. Reuse
movement, transfer, claims, and the fixed world tick. Add an explicit typed
brew job/activity because brewing is real behavior; the recipe row must not
become a job DSL or executable mod API. Do not add water/fluid, fuel, quality,
temperature, technology, or recipe graphs until a named consumer requires them.

**Sprint entry decision:** select the finite source of fermentable grain/yeast/
water used by this one recipe. The plan explicitly leaves these unresolved
(`ARCHITECTURE.md:123-130`), and the architecture cannot truthfully prove
consumption if the station creates free inputs. Mugwort remains flavoring.

**Smallest real consumer/proof:** order one authored herbal ale; haul each earned
input once; show waiting/input/work/fermenting/ready states; free the worker while
fermentation advances on fixed ticks; create exactly one keg at the end; store
and serve it. Saving mid-fermentation and replaying equal ticks yields the same
ready tick and one output. Cancel-before-start releases reservations; after
consumption, cancellation never refunds ingredients or duplicates output. Keep
“Fig Leaf Bi-Carbonate” as the later soda/MM..FOOD authored direction, not the
name or recipe of this first ale.

### 3. Next ready slice — The durable format persists scheduler/display cache and pays for it in validators

The untrusted Zod/IndexedDB boundary is real and should stay. The avoidable cost
is that the snapshot also stores mutable scheduler/display facts: job `reason`,
actor `assignment` including optimizer cost, and `workDirty`
(`src/model.ts:41-46`, `src/model.ts:66-110`, `src/model.ts:174-179`;
`src/persistence.ts:126-131`, `src/persistence.ts:323-328`,
`src/persistence.ts:585-610`). `jobs.ts` overwrites reasons and assignments during
assignment (`src/jobs.ts:474-475`, `src/jobs.ts:522-525`,
`src/jobs.ts:529-546`); no production caller outside scheduling/persistence uses
the assignment record. Persistence then carries six parallel schema compositions
(`src/persistence.ts:611-770`) and hundreds of lines rechecking live
task/assignment/claim/topology relationships (`src/persistence.ts:816-1627`).
Those checks protect a real serialized boundary, but the durable surface is
broader than the authoritative facts the ADR promises.

Before adding the beer save shape, classify fields as authoritative durable state
or recomputable cache. Persist in-progress work, consumed inputs, custody,
reservations, process deadline, and IDs. Caller search currently finds actor
`assignment` only in scheduling/reset/persistence, while `workDirty` directly
controls whether next-tick assignment runs (`src/jobs.ts:418-420`); therefore
omitting assignment is a stronger candidate than omitting dirtiness. Recomputing
either field remains a design hypothesis until equal-tick scheduling proves it.
Retain the existing v1-v6 decoders, Zod, IndexedDB transactions, stale-revision
handling, strict serialized shapes, and real domain refinements. Do not perform a
broad historical-parser rewrite before upstairs, add an internal parser, or
validate typed state every tick.

**Smallest real consumer/proof:** the beer schema addition restores one oldest
supported fixture, the immediately previous fixture, and one mid-brew snapshot
into the latest state. For every omitted/recomputed candidate, the next admitted
command, next assignment tick, and equal-tick brew/resource outcomes agree. A
malformed duplicate-custody keg remains rejected; add an over-capacity rejection
only if the sprint selects a capacity rule. The review gate is no duplication of
beer fields into historical schemas and demonstrably slower growth in validator
ownership, rather than a pre-emptive rewrite.

### 4. P0 sprint proof — Whole-game scale has no measurement, only an optimizer probe

The existing 5-person/100-task evidence isolates libcolony, while the actual
simulation still scans actors and jobs and rebuilds topology in hot paths.
`step` advances every actor and then assigns (`src/clearing.ts:118-136`);
`advanceWork` rebuilds `blockedCells` per working actor
(`src/activity.ts:375-400`); assignment visits ordered jobs for each idle worker
and performs repeated array lookups/routes (`src/jobs.ts:418-547`). This may be
fine at 100 people, but no current evidence says so.

**Smallest real consumer/proof:** a deterministic headless measurement uses the
actual `step`, movement, route, resource claims, and libcolony adapter for
5/25/50/100 actors across three named cases: steady active work, a dirty assignment
pass, and a topology change. Record time and allocation by assignment/path/state
phase; separately record render/HUD publish cost. Use the result to choose one
bounded optimization, such as a pass-local blocked-cell snapshot or lookup map,
only if that phase is material. This benchmark is evidence for the accepted
roster direction, not a CI law, capacity promise, or reason to adopt ECS/Effect.

### 5. P1 sprint measurement — HUD binding does manual identity work without proving fewer updates

`displayFacts` manually rebuilds and compares actors, jobs, sites, herbs, bundles,
keys, and rest problems (`src/hud.jsx:180-365`). It writes one `worldFactsAtom`,
whose derived atoms allocate new panel models (`src/hud.jsx:417-572`); the same
HUD also subscribes independently to the XState gesture machine
(`src/hud.jsx:1604-1645`). `hud.view()` exposes both selected facts and the raw
machine snapshot (`src/hud.jsx:1947-2003`), and `main.js` immediately projects
them again into another selection/view object (`src/main.js:114-151`). There is
no memoized component or derived-atom equality at these anchors, so the benefit
of the hand-written structural sharing is unproved while every new good,
container, or process adds branches.

Do not add brewery-specific React state, Jotai atoms, or XState domain states.
Keep XState limited to tool/gesture lifetime and expose one exact read-only HUD
projection for the renderer/input caller. First measure component commits across
fixed ticks. If the manual identity layer does not prevent work, delete it or
replace it with the smallest selector boundary already supported by the chosen
store; preserve the current focus behavior.

**Smallest real consumer/proof:** the shelf/workstation inspector displays its
grouped contents and process state from one simulation-derived projection and
emits one typed command. Selection survives a brew-state change, the focused
control remains focused, and an unrelated fixed tick does not commit that panel.
The proof should compare render counts before/after rather than infer performance
from the presence of atoms.

### 6. Parallel sprint lab — Large-world generation must not enter the 15 by 15 game yet

The live topology is deliberately finite: `SIZE = 15`, `inside` rejects global
coordinates, and blockers enumerate both levels of that finite grid
(`src/world.js:1-34`, `src/world.js:121-136`). Persistence calls the same `inside`
law for actors, paths, trees, sites, piles, and topology
(`src/persistence.ts:787-999`). Replacing that beneath the active upstairs and
beer slices would couple generation, navigation, construction, persistence, and
rendering before the generator itself is known. The plan already separates
generation from chunk residency and camera visibility (`ARCHITECTURE.md:421-479`).

Create a separate `/world-lab` page with no `Clearing`, jobs, home save slot, or
caravan. Its shared candidate is the real future global-coordinate/base-terrain/
sparse-patch query, addressed by `worldSeed + generatorVersion + global
coordinates`; the page groups queries into bounded chunk views. Keep caves,
simulation residency, dirty persistence, and cross-chunk pathing out until this
query passes visual and deterministic review. The detailed bounded shape and
measurements are already reviewed in
`.botanical/research/world-lab-ready-audit.md`; this audit does not duplicate
that rendering lane.

**Smallest real consumer/proof:** display signed neighboring chunks in opposite
request orders with identical hashes, continuous fields, and canonical border
features. Apply one sparse edit/tombstone, cull its view, return, and recover the
same patched query result. A far jump retains a bounded number of render objects.
This proves base generation, sparse patch overlay, and visible culling only; it
does not prove resident-data eviction/reload, caravan routes, or gameplay saves.

## Explicitly outside this sprint

No ECS, Effect migration, plugin/mod framework, generic recipe/job language,
backpack grid, fluid/weather solver, caravan, resident chunk save/eviction
integration, offline catch-up, Durable Object, multiplayer transport, AI adapter,
broad test matrix, or new management goal. This sprint earns evidence from the
upstairs, actual workload, and World Lab callers. Beer is the next gameplay
consumer; future systems remain plans until their own consumer and proof exist.
