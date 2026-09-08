# Environmental fields, openings, and horticulture

**Status:** direct Levi direction, 2026-09-07. This is a future environmental
proof boundary, not a current home/controls implementation or a selected solver.

## Direction

Player-authored layout must change available actions and outcomes: a wall, floor
opening, vent, source, shade, route or material has consequences because it is
part of the same physical setting as the person, plant, fire and room. The
verified original *Stronghold Crusader* brazier → archer → burning-arrow →
pitch-ditch chain is reference evidence for that legible spatial causality; it
does not select its fire traps, RTS combat, or a universal chemistry system for
Hive.

The deterministic simulation eventually owns shared gas/heat/weather quantities
and their outcomes on the authoritative fixed world clock. Geometry owns solids,
air spaces, roofs, doors, stairs and openings/connectivity; cutaway is
presentation only. Weather boundary conditions, fuel/heat sources and
opening/material properties are explicit inputs. People, animals and plants read
their relevant local condition and apply their own authored rules; none keeps a
second air, temperature or weather model.

The first useful proof is deliberately narrow: **fire → smoke → vertical opening
→ vent → measured exposure** in one small two-level structure, with visible
boundaries and ordinary commands to open/close the vent. It must account for
source, sink and transported quantities rather than apply a scripted whole-house
smoke timer. A greenhouse then reads the same heat/opening/weather fields:
sunlight can warm it, overheating changes one growing condition, and venting can
improve it. This does not select illness, death, seasons, breeding, every gas or
full weather content.

## Evidence and implication boundary

The reviewed ONI evidence now includes a Klei developer interview, official
historical patches covering energy/conductivity/phase change, crops/overlays and
automation, plus the narrow public `Grid.Mass` mod API. It supports coupled,
inspectable quantities and failure feedback; it does **not** establish ONI's
mixture solver, active-cell scheduling, update order, or deterministic replay.
Future Hive experiments and the separate 5/25/50/100-actor benchmark remain
independent of World Lab geography work.

Four water references stay distinct: Tikal's filtered Corriental reservoir;
Xochimilco raised-field/canal agriculture; Hawaiian `auwai`/loʻi gravity
allocation and maintenance; and Roman gravity conveyance/distribution through
routes, tanks, and branches. They support authored source/route/capacity,
storage, upkeep, and downstream consequences—not one generic ancient system.
Hive's product direction is early/middle gravity channels, cisterns, and
terraces, with later Dwarven pumps and controls as an efficiency/progression
choice rather than a gate on all water. Transfers must be actual source → route
→ capacity changes, never decorative timers.

The accepted shallow utility clarification remains: one buried pipe segment may
share a top-ground cell with its cover; Lay/Expose/Repair/Remove/Cover work must
preserve pipe contents and restore normal surface presentation. Current levels
are logical storeys, not volumetric diggable terrain. Keep upstairs first and
brewing next; no solver, plumbing framework, or runtime implementation is chosen
by this evidence record.

Future compost-air and Naturhus-inspired utility direction remains a typed,
finite composition: direct process air may pass through active compost,
biofilter, greenhouse and vent, while a sealed heat exchanger transfers energy
to a separate air/water circuit without exchanging gases, water, or nutrients.
Power, heat, water, feedstock, nutrients, and storage remain accounted balances;
separation, storage, pumping, and biological treatment are distinct owners.
Water quantity, nutrient inventory, and quality/contamination stay distinct, with
no automatic potable flag. Pumps and separators are supported future mechanisms.
For the specifically identified Torpadal house, the corroborated cutting pump
does supersede the earlier grinder-unverified wording; other Aquatron examples
remain separate evidence and do not inherit that machinery. This remains later
utility and hygiene direction after upstairs then brewing, not a current runtime
choice.

Deferred cute/gross goblin hospitality direction: inn piss, shit, and vomit
cleanup/collection can feed separated finite wastewater/compost treatment,
gardens, and more food for goblins without killing them. Collection, transport,
treatment, water, solids, nutrients, and contamination remain distinct facts
owned by ordinary shared jobs and their typed resource/environment owners; no
immunity or free-food conversion follows. The deployed generated Goblin
hospitality concept approves ROOM/environment/filth tone as inspiration, but its
generated CHARACTERS are not Hive art direction: retain the accepted figure style
and do not modify pinned HTML/PNG. This is future direction only.

## Scale and boundary constraints

Only active environmental regions and changing boundaries earn detailed work;
measure environment separately from actor, path/assignment and rendering costs.
Untouched outside space may be implicit, while changed quantities and edits must
persist. Chunk borders are storage/streaming boundaries, never invisible airtight
walls: cross-border exchange is counted once, and eviction/reload cannot clean,
reset or duplicate sealed-room air, heat or fluid. Stable regions may advance
coarsely only when the named behavior and accounted quantities remain true.

No numerical method, cell resolution, mixture representation, update cadence,
room approximation, general combustion model, ECS, backend or physics framework
is selected. A room graph may support queries but cannot become a competing
environment owner; smoke visuals read quantities and never create or delete them.

## Environmental physics: second-round CTO decision

2026-09-08. Game CTO personally read the completed water, gas/heat and coupling studies and their terminal records. This updates the future environmental contract; no production solver or runtime integration is accepted. The tiny-map sequence remains unified goods → mixed storage → finite-input brewing → one carried-water plant-establishment action.

### What the experiments changed

Round one correctly rejected an unstable explicit water exchange and an ineffective ventilation fixture. Its promising two-cell local-inertial result was only a candidate. Round two exercised a finite two-dimensional diversion, a two-storey ventilation fixture and the actual solvers across storage partitions and restart. It found material failures that balanced totals and successful tool exits had concealed.

| Question | Observed result | Decision |
| --- | --- | --- |
| Does the original water method converge? | At fixed geometry, reducing the timestep ceiling from .1 to .025 s changed pond volume from 59.335 to 33.603 m³. Fixed θ=.7 smoothing strengthens with smaller timesteps. | Reject that configuration. Do not integrate it because its two-cell test passed. |
| Is a fuller water model prohibitively expensive here? | Corrected local inertia took 5.16 s; an independently authored hydrostatic-reconstruction shallow-water reference took 6.89 s for the same 32²/600 s fixture. The reference passed bounded lake-rest and dry dam-break checks. | Keep full shallow water as the leading reference for the next surface-water decision. This comparison does not justify buying speed by accepting the original error. It is not a production or browser benchmark. |
| Did correcting local inertia settle the choice? | θ=1 greatly improved bulk timestep/spatial convergence, but radial front bias worsened from 3.43% to 4.58% under refinement, failing a predeclared criterion. | Retain it as a comparison candidate, not an accepted solver. Investigate threshold/raster geometry separately without deleting the failure. |
| Can layout make ventilation useful? | Source-local exhaust reduced upstairs exposure by 51.8% and exported 86.6% at the finest tested grid. A resolved tall opening admitted replacement air and exhausted air simultaneously. | Preserve local source/opening/occupant geometry and real counterflow. Whole-room or uniform two-layer totals alone lose the demonstrated source-capture effect. |
| Is that airflow model ready? | The 1 m grid had 34.0% exposure error relative to .5 m; .5→.25 m differed by 11.2%. Interior drag/mixing choices materially changed outcomes. The finest 384-cell local run took 568.7 s for 900 simulated seconds. | Reject the unvalidated interior airflow closure for production. A bounded momentum/projection reference must test the relevant layout decision before choosing an approximation. No affordable whole-world gas claim follows. |
| Do partitions and reload preserve actual physics state? | Nine 1/4/16 storage-partition and traversal cases matched complete water and gas states/receipts. Removing water discharge history changed the next 50 ms by .1508 m³ L1. | Persist future-affecting solver history with quantities and geometry. This was one process reconstructing each complete solve, not distributed simulation or a sparse scheduler. |

The original 600 s water fixture also failed its downstream-shortage target: capped demand could remain satisfied while diversion captured unused supply. A separately labeled 1200 s observation demonstrated substantial shortage. Preserve both results; neither a changed observation window nor successful execution retrospectively passes the original criterion. The gas exposure targets are authored gameplay-fixture criteria, not health or fire-safety limits. The exact sign of the small refined remote-high ventilation difference is within numerical uncertainty.

### Shared ownership without one universal equation

Share geometry identity, units, committed world time, canonical interfaces and accounting. Water momentum, gas continuity and thermal conduction remain distinct numerical responsibilities. The deep boundary is an admissible successor, not a bag of edge transfers that callers repair:

```text
old = readCommittedRegion()
proposal = selectedSolver.advance(old, geometryRevision, forcing, interval)
validateSameInputsAndInterval(old, proposal)
validateSolverAdmissibility(proposal)
validatePerCellBalancesAndPairedInterfaces(proposal)
commitTogether(proposal.state, proposal.history, proposal.forcingCursor)
```

This is a future ownership sketch, not a new game protocol/framework. Shared validation may reject a stale or invalid result. It cannot independently clamp or round pressure-solved gas faces: that breaks continuity. A solver may subdivide or re-solve using its own constraints. Thermal stability depends on aggregate conductance and heat capacity, not just conservation or pairwise limits. Signed thermal anomaly is valid below zero and is not positive inventory stock.

Geometry revisions and known forcing boundaries split the relevant interval. Unknown neighboring state needs data; it is not an ambient sink. Storage chunk borders are not physical walls. A sparse smoke plume does not bound the connected pressure dependency. No current experiment proves interruption inside a pressure solve, independent subdomain evolution, active-frontier performance, mixed-solver timestep coordination or offline evolution with unknown forcing.

### Couplings that require an explicit model change

Water entering an air space reduces free gas volume. The existing fixed-volume air solver must reject this change. A separate vented tank approximation accounted for displaced air, tracer and heat; sealed ideal-gas compression instead required pressure feedback and external work. Those examples do not confer flooding support on the existing solver.

Wet excavation preserved water but lowered represented gravitational potential by 24.360 kJ and reset discharge history. The hydraulic approximation has no matching mechanical/thermal ledger. Balanced volume and sensible heat therefore do not prove total energy conservation. Likewise, average temperature is not conserved energy: air and water have distinct thermal capacities, and gas internal energy differs from transported enthalpy.

Groundwater also needs meaningful state. Two porous distributions with identical total water required opposite surface exchange. A single moisture bucket cannot represent that reversal. The study did not integrate Richards flow, well drawdown, calibrated soils or seasonal recharge.

Keep the intended terrain's discrete elevations separate from fluid quantity. The tested shallow-water field is depth over a two-dimensional bed; it does not implement overhangs, vertical waterfalls, caverns, pressure pipes or multiple stacked water surfaces. Those consumers require explicit geometry/connectivity and supported laws. A pretty voxel view cannot supply missing hydraulics.

### Next work and release boundary

The earlier instruction not to start a third numerical round automatically is
historical. Levi explicitly authorized the Game CTO's isolated round-three goal in
`.botanical/research/environment-round3-20260908/GOAL.md`. It compares a retained
dense shallow-water reference with a justified dry-region optimization, builds a
bounded momentum/projection gas-and-heat reference, and probes world-generation
identity/edit/residency laws. These are ignored executable studies, not an accepted
solver, tracked runtime join or release gate. Before a regional-fluid gameplay slice,
compare the selected water method on stepped terrain, wet/dry fronts and downstream
demand; keep failed criteria visible. Before gas integration, validate the interior
transport approximation against a bounded low-speed reference and prove the same
source/occupant/vent decision with acceptable spatial error and cost. Later
water-air/phase/combustion consumers require their own compatible state and energy
accounting.

The next production water consumer is much smaller: finite water acquired into a real vessel, carried through the common goods/transfer owner, and consumed once to establish a plant. That earns gameplay and liquid custody without requiring regional hydraulics. No new hauling branch, second clock, oxygen system or planet simulation enters the current brewing candidate.

Levi's supplied Sebastian Lague fluid source adds SPH to the serious future
three-dimensional solver comparison for ledges, pouring, splashes and stacked
surfaces. Its useful mechanisms are bounded spatial neighbor lookup, compact
ordered stages and separate simulation/display buffers. Adoption must correct
the pinned hash-bucket duplicate-neighbor case, define mass/volume and units,
use collision geometry owned by the world, separate old/new velocity buffers,
and measure CPU/WASM or WebGPU implementations against the same fixtures. This
is a candidate method, not a selected solver, GPU performance claim or runtime
join. The reviewed source is Lague's MIT-licensed
[Fluid-Sim commit `4717b725`](https://github.com/SebLague/Fluid-Sim/tree/4717b7259718d349b0001c82836f24ce5fec81d7).

Evidence remains under `.botanical/research/environment-round2-20260908/`: `water/study.md`, `water/terminal-evidence.md`, `gas-heat/DIAGNOSIS.md`, `gas-heat/RUNS.md`, `coupling/ADJUDICATION.md` and `coupling/PROOF-RECORD.md`, with their executable sources/results. All owned sessions are terminal. The original finest gas group was deliberately stopped at exit143 after its retained sealed baseline; its uncompleted remote-high case is not evidence. Its separately bounded source-local run completed normally. No raw evidence needs copying into the product bundle.

## Levi's performance ambition and language direction, later 2026-09-08

Direct Levi input: pursue a performant, good water/gas simulation ambitiously;
failed prototypes are not an upper bound on what Astra can design. He explicitly
welcomes WebAssembly and Rust, Go, Zig or other suitable languages. His references
to original model-assisted mathematics motivate disciplined invention; they do
not establish a speed, correctness or novelty claim for Hive's solvers. The
[unit-distance result](https://openai.com/index/model-disproves-discrete-geometry-conjecture/)
was checked at its primary source. No unverified Navier–Stokes headline is used
as evidence for our algorithms.

The bounded follow-up source reviews are `water/NEXT-METHOD-REVIEW.md` and
`gas-heat/NEXT-METHOD-REVIEW.md`. They did not run a third numerical sweep. Root
read both. Next surface-water work leads with full shallow water on unchanged
stepped physical geometry, comparing reusable scratch/active dry-region work to
the dense oracle. Next gas work compares an explicit momentum/projection model
to the rejected algebraic-drag closure. The current gas implementation is already
sparse: repeated Python Krylov vectors, repeated nonlinear solves and discarded
operator work are actual optimization opportunities. Calling it dense and merely
proposing sparse matrices would miss its source.

Provisional engineering preference: **Rust for a new isolated numerical core,
compiled to WASM for the browser and natively for the same numerical fixtures**.
C++ remains a strong alternative when the selected numerical library or existing
Emscripten integration supplies a concrete advantage. Hive already compiles its
unchanged C++ libcolony optimizer (`scripts/build-colony.sh`,
`public/vendor/libcolony/PROVENANCE.md`); that is evidence of an established build
path, not a requirement that every new subsystem use C++. Go and Zig are viable
WASM targets, but no measured result currently justifies adding either as another
production toolchain here. This preference is not a language-performance result
or authority to rewrite game rules/libcolony.

Keep numerical arrays, reusable workspace and phase history behind the physics
owner. Use a narrow bulk interface, bounded memory and explicit disposal; do not
cross JS/WASM for each cell, duplicate canonical fields in a UI store, or use the
optimizer's 16 MiB heap as an unmeasured physics allocation. A dedicated Web
Worker is the first browser host candidate; WASM by itself does not move work off
the main thread. Begin with one numerical worker, not shared-memory pthreads or
a GPU framework. The authoritative game chooses committed intervals and
geometry/forcing revisions; worker computation does not invent a second clock.
Retain field values and future-affecting momentum across pause/reload. A later
production join must specify exactly where those canonical arrays live and how
an admissible result commits before shared game effects observe it.

Use the existing JS/Python experiments as independently readable references,
with their known failures preserved. Compare equal-error outcomes, per-interval
latency, allocations, solve iterations, peak memory, initialization and JS/worker
transfer costs. Language choice cannot validate the missing airflow closure or
turn a heightfield into stacked-volume hydraulics. No speed multiplier, whole-
world capacity, provider change or backend deployment is claimed. The pail and
brewing release remains independent.

Primary implementation references checked:
[Rust WASM target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html),
[Emscripten JS/C++ boundary](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html),
[Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers),
[Go WASM](https://go.dev/wiki/WebAssembly),
[Zig WASM](https://ziglang.org/documentation/master/#WebAssembly).
