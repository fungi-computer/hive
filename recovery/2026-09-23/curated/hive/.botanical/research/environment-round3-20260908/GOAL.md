# Water, gas/heat and world generation: active Game CTO goal

2026-09-08. Levi explicitly requested a new personal goal to solve these three
systems. The goal tool accepted the new objective for this thread. This
supersedes the earlier instruction not to begin a third numerical round
automatically. The work is now explicitly requested. Existing Game Delivery
source/proof/Git/deploy custody and small-world releases continue independently.

## Current fidelity correction — direct Levi direction, 2026-09-09

Levi explicitly challenged laboratory accuracy: Hive is a voxel isometric game.
Root acknowledges that the1–2cm grids,2mm standing wave and very small error
tolerances became disproportionate to the requested playable outcome. The
full water/gas/world goal remains active, with the SAME finite resources,
digging/diversion/ventilation/heat/ecology requirements. Its implementation
fidelity is game-scale, not research-grade CFD. This section supersedes older
reference-first task sequencing below; old passes/failures remain evidence.

Production design targets (not measured accomplishments):
- Start near one environmental control volume per actual terrain voxel, with
  explicit physical face areas, distances and cell volumes. Keep the established
  anisotropic world geometry; do not generate tens of thousands of fluid cells
  merely to represent one material voxel in a cubic-only library. Local
  refinement requires a visible gameplay need and measured cost.
- Target5–10water/air updates per game second in the active region, with
  stability substeps bounded and included in the cost. Soil and slow thermal
  changes can update less often under the same authoritative clock. Rendering
  interpolates and animates small detail; it never creates or transfers stock.
- Judge water level differences in fractions of a voxel (initial design target
  about5%of its height), practical fill/drain timing and credible downhill/
  pressure/overflow behavior. Millimetre waves and matching a scientific
  velocity field are not gameplay gates. Smoke, ventilation and temperature
  must cause readable gameplay consequences with declared approximate rates.
- Preserve unique custody and exact accepted material debits/credits. Numeric
  fluid transport uses bounded, measured drift; no free source, duplicated
  volume, disappearance on load, or hidden normalization. Approximate physical
  fidelity does not excuse broken quantity accounting or wrong flow direction.
- First performance target is a few milliseconds per environmental update for
  the representative active small-world workload, measuring CPU, allocation,
  active cells/faces and worst update bursts. This target has not been proved;
  benchmark before expanding region size or claiming hundred-person capacity.

Immediate decisions: no202500-cell/2cm3D ledge reference. Preserve the successful
2D wave and exact soil/edit/restart result as comparison evidence. Park the
uncompiled native water restart overlay at its useful handoff; no codec or
reference restart implementation begins now. Gas keeps valuable current
refinement/regression bytes and finishes any already-running proof normally,
but no new full physical run starts under the superseded conditional grant.
Next implementation should exercise actual voxel-scale stream diversion and
room ventilation with explicit approximation/error/performance laws. Existing
C solvers are useful references; their supported lattice cannot dictate an
unaffordable production representation. No new broad solver survey or framework.

Delivery keeps the accepted recorded wave lab publication moving independently
with clear reference labels, current source owners and ordinary same-preview
custody. This direction does not widen the clearing or launch a backend.

## Success means usable systems

Executable implementations must support the intended gameplay with explicit
geometry, ownership, accuracy and performance evidence. Documents, an appealing
render, a language port or a single small passing fixture do not complete this
goal. Preserve rejected experiments and identify unsupported physical cases.

- Water: finite streams, diversion and ponds on stepped terrain; then the
  explicit connectivity and soil-water extensions needed for digging, multiple
  levels, irrigation and ecological consequences. No infinite bucket source or
  evaporation of thin films merely to make a benchmark faster.
- Gas/heat: moving air, buoyancy, smoke transport, openings and thermal exchange
  that make building layout matter. Validate the chosen approximation before
  treating it as the owner for fire, greenhouses or flooded air spaces.
- World generation: one deterministic versioned geography with discrete terrain,
  biomes and underground structures, bounded sampling and residency, compatible
  maps/LOD, and player edits that survive regeneration and eviction. Visual LOD
  cannot alter fine-world identity or require all underlying tiles to be built.

Shared contracts include units, signed world coordinates, geometry revisions,
canonical inventories and future-affecting history, authoritative intervals,
cross-boundary transfer and forcing, edits, pause and save/reload. Storage chunks
are not physical barriers. There is one game clock and no new backend framework.

## First independent executable checkpoints

The visible Game CTO owns this technical outcome and original-art acceptance.
Full-context Astra forks support bounded, isolated numerical/source checkpoints.
The runtime accepted a water fork and a resumed gas fork; a further thread was
rejected at the thread limit. Root therefore owns the first world-generation
checkpoint directly. These study authors do not replace Game Delivery or the
visible product PMs. No existing author was interrupted to manufacture a slot.

1. Water owns only `water/` here. Read the actual retained solver and newest
   method review. Preserve a pinned dense reference; implement reusable workspace
   and the smallest justified exactly-dry active-region optimization in an
   isolated candidate. First compare complete state/history and restart on the
   same stepped stream/diversion fixture and independent rest/dry-front cases.
   Do not conflate horizontal numerical refinement with changing voxel heights.
2. Gas owns only `gas-heat/` here. Read the retained sparse pressure/transport
   source and newest method review. Implement a bounded momentum/projection
   reference with explicit velocity history, conservative tracer/heat transport,
   and declared opening/wall conditions. First qualify rest, projection and a
   known flow/transport case before the two-storey ventilation comparison.
   Retain the previous drag model as rejected comparison, not production truth.
3. World generation owns only `worldgen/` here. Read actual terrain/worker/
   section/main callers and retained geography/LOD contracts. Freeze the current
   generated-terrain baseline and implement a bounded executable contract probe
   for signed-cell/chunk-order identity, integer height steps, exact-versus-LOD
   sampling work and edit/eviction/regeneration ownership. Report real gaps and
   propose the first source change from evidence; no tracked world-lab edits.

Each fork first acknowledges owned paths, source pin and next executable check.
Inspect the first working shape before broadening a sweep. Ordinary automated
checks use the existing run-proof.sh, retain/poll the native session, preserve
failed artifacts, and stop only owned work. No long parallel browser suites or
unbounded parameter searches; numerical microchecks initially target under a
minute each. Coordinate a heavier benchmark before launching it on this shared
host. Test evidence reports actual elapsed time and machine/scope limitations.

Rust/WASM is the provisional numerical implementation preference, with a bulk
array boundary and one dedicated browser worker. First establish a defensible
method and independent reference; do not port a failed physical approximation
and claim it solved. Existing JS/Python sources remain useful oracles. Toolchain
choice, initialization, allocation, transfer and solve costs are measured rather
than assumed. Do not rewrite libcolony or install competing game authorities.

## Integration and continuity

Levi's direct Sebastian Lague clarification is accepted in
`worldgen/lague-study/FINDINGS.md`: layered noise → physical stepped height →
explicit sea datum is the requested foundation. The current independent water
colour branch is an implementation gap. Correct it in the isolated generator
candidate before treating the diagnostic drainage atlas as physical geography.
The exact series and eleven pinned source files are retained with that record.

Root owns this note and cross-system decisions. Each isolated worker owns its
own new directory only. Game Delivery retains all tracked code/docs/issues,
build and same-preview publication, with current writers preserved. Delivery
will link accepted results into environmental-fields-and-openings.md and the
world-generation/mapping decisions at a normal checkpoint. This is an ordinary
research record, not a new PM board or a game implementation approval gate.

The current finite-pail/Fill Kettle release and the approved subsequent brew
process remain Delivery's work. Brewing consumes physical materials and the
ordinary clock; it does not wait for regional hydraulics. Root's unfinished
stirring-art prototype remains preserved and unaccepted for production.

## First executable review checkpoint

See water/RESULTS.md, gas-heat/RESULTS.md and worldgen/RESULTS.md with their exact
source snapshots, completed owned-scope records and honest limits. Root read the
actual numerical source and immediate test callers. Water preserves the dense
SWE result with less allocation and face work; its next active owner checkpoint
closes geometry admission and borrowed/retained state lifetime. Gas has explicit
momentum and pressure projection, independent analytic/refinement qualifications,
and a new two-storey fixture; matched layout/exterior comparisons retain the new
2m²-opening geometry and never reuse the prior0.5m² exposure claim. Worldgen now
has a source-reviewed, tested base-plus-voxel-overlay owner with actual decoded
eviction and Node file reload. Its no-op/reversion policy was corrected through
independent review, with prior source/evidence preserved.

Next shared decision: the proposed world lattice1m horizontally/.54m vertically
must be mapped explicitly into numerical geometry. Water's current0.1m terrace
fixture and gas's square cross-section cells are separate physical experiments.
Gas needs distinct axis metrics before claiming alignment to anisotropic game
voxels. Logical level, geometry height, pressure-face connectivity and map LOD
are separate representations of named physical facts. A terrain-edit revision
alone cannot settle displaced water, gas, heat or gravitational work; those
coupled edits remain a required part of this goal.


## Current heavy checkpoint — lunch continuation, 2026-09-08

Root retains gas/water/world-generation judgment and ignored numerical source. Game Delivery/visible owners retain lab conversion, menus, coupled materials/brewing and same-preview publication. Current Shiitake model-work pause remains; Codex numerical/source authors continue. Eight current Caps/Parakeet visual references are retained for the later improvement pass, not a new writer or redesign.

Water: stable-order-v1 ordinary file/fresh-process continuation now matches byte-for-byte through step750 after active neighbor lists are consistently ordered before all DFSPH consumers. No save-triggered reset or tolerance relaxation. Actualu2883 exit0; bounded static/no-Zsort/single-thread candidate only. The same Astra now owns NEW physical-voxel-v1 fixture design for hydrostatic/resolution and .54m ledge/boundary qualification before any port. Regional storage/soil exchange/large-world cost remain unqualified.

Gas: transport-v2 has stronger conservative scalar transport; sealed/two-opening actual3D recordings are ready. voxel-binding-v1 now runs the same owner on actual height-sea/cave/edit geometry, proves metric/index/global identity, exact file reload and rejection after shape/revision changes. It does not perform a physical excavation remap. Root accepts the independently sourced low-Mach finite-species/thermodynamics direction in TOPOLOGY-MODEL-DECISION.md; new finite-thermo-v1 is the next source checkpoint. Uniform chamber thermodynamics is a foundation, not a second room inventory or completed spatial gas. Closing volume/species/energy/work and variable-density projection remains required before gameplay excavation, oxygen or substantial heating.

World: height-sea correct generator is integrated by Delivery but latest independent preview status must come from its actual release. volume-v2 supplies genuine quantized cave/brick/overlay/reload laws. Root drainage-v2 is independently accepted with actual D4/sea/height law, equal-output narrowed height query and honest coarse/local boundary semantics. Frozen volume still asks for redundant display-neighbor samples; optimized query join is a separate source-provenance checkpoint. Biomes, physically connected refined drainage, cave/liquid/gas occupancy, edited topology exchange and activation/residency/LOD performance remain real goal outcomes. Coarse maps never stand in for a fine-cell hydraulic proof.

Latest actual records: water stable-order-v1/{RESULTS.md,HANDOFF.json}; gas-heat/voxel-binding-v1/{RESULTS.md,qualification-v1.json}; worldgen/drainage-v2/{ACCEPTANCE.md,run-v3/proof.json,review/REVIEW.md}. No overall-goal completion claim.

World physical-query follow-through is independently accepted in worldgen/volume-query-v1/REVIEW.md. Only columnAt now calls existing sampleTerrain(...,1) instead of requesting sampleCell shoreline-neighbor details. u2912/bc412595 exit0 proves12 full cave/signed-boundary/surface bricks, actual edits/eviction and both codec directions plus file reopen unchanged. Recipe/save identity correctly remains the same; actual implementation hash differs and is recorded. Single sequential observations old1465.5ms/new228.4ms are not a controlled speedup benchmark. Frozen volume-v2 and its gas-binding receipt are preserved. Future numerical callers can explicitly consume the accepted narrower-query candidate; no production byte was changed by root.

Hydrostatic water follow-through is a retained physical failure: physical-voxel-v1 run-u2956/5228c2f4 exit1 in9.642s preserved540kg but boundary density reached1.78088 rho0 and the first pressure step expelled particles. Independent BOTH-pressure impulse accounting closed to6.62e-11 kg m/s, so this is not a reporting-unit error. Root approved one static boundary-consistency-v1 diagnostic against an independently integrated cubic-kernel solid half-space/corner union; no timestep/radius/wall/mass tuning or second tank run. Stable-order restart evidence remains separately valid.

Finite-thermo-v1 is source-reviewed and qualified at actual field scales, with its floating large-U receipt limitation disclosed. Root and independent Astra approved finite-low-mach-v1's constant-gamma fixed-volume heating derivation, weighted shared projection and actual donor mass/enthalpy transfer. First source is being corrected for immutable geometry ownership, clock/budget admission and intermediate-only RK envelope retries; no completed spatial qualification is claimed yet.

Root's next world source is isolated connected-caves-v1: one bounded seeded pit/gallery/chamber component through the sole generated material owner. The new composite recipe preserves the old cavity field namespace outside added features and retains sparse-edit/save ownership. It is awaiting source review and fixed signed-region/chunk-connectivity proof, not a gameplay or water/air-initialization result.

Connected-caves-v1 is now personally and independently accepted: run-u2991/80ed5fcf exit0, five groups676.86ms. Both fixed signed-region features contain503 six-face-connected voxels across7/6 storage bricks;52242 other decoded cells preserve the older cave geometry exactly. Entrance filling survives actual file reopen; foreign recipe/reverse-order/one-brick eviction/base-equal reversion laws pass. REVIEW.md d09b6566... and HANDOFF.json retain exact source/proof pins. Fallow honestly retains unchanged world-edit cognitive complexity18 and estimated coverage advisories; new feature owner max cognitive5. No gameplay, walkability, water/air initialization or joint excavation claim.

The water cold boundary-consistency-v1 packet also completed: u2983/0f1a81fc exit0 qualifies the independent measurement only. At an actual floor particle Akinci boundary contribution.76383 exceeds literal solid integral.22218; corner contribution1.22473 exceeds.50236 and contact gradient can reverse. Root rejects that normalized skin as a literal voxel-water boundary and owns the source-first Bender2019 volume-map/contact fit decision next. No second tank or empirical mass/wall/weight adjustment.

## Continued source/physics decisions after the two-hour check

Preserved root Session01a0791e is live; the old websocket reconnect display did
not require a restart. Botanical CTO received continuity. Game Delivery was
asked to consume any missed settled p13 core handoff under its existing custody.
Its actual response/source trace is still working on brewing presentation;
no new deployment is inferred. Shiitake model work remains paused.

Finite-low-mach-v1 qualified the physical sealed heating strip in u2995:
finite carrier mass and internal energy, density-weighted projection and one
mass/enthalpy face transfer. Temporal far-cold errors fell about fourfold under
dt halving; the full density-profile error remained about0.291% at the fixed
mesh. This is not spatial convergence or a full momentum solver. The reviewed
finite-low-mach-refactor-v1 retained complete results/receipts and cross-owner
file continuation in u3023,10groups211checks; Fallow numerical responsibilities
are smaller, while inherited Boussinesq and estimated-coverage advisories remain.
Its final REVIEW.md and handoff inventory pin the accepted bytes.

Root accepted finite-momentum-v1's first implementation direction: canonical
face momentum, dual masses derived from canonical cell masses, momentum fluxes
mapped from the very same primal mass receipts, and the existing variable-density
projection. The first executable shape is limited to fixed periodic/sealed full
boxes. It explicitly lacks obstacles, open reservoirs, viscosity and exact
total thermal/mechanical energy conservation. Basis-face dual continuity,
actual stage pressure/gravity receipts and independent 3D forced flow precede
buoyant-room claims. Root is personally supplying the continuous averaged-flow
oracle in momentum-oracle-v1; u3094 passed45 quadrature/PDE checks, which validate
that oracle only. No momentum candidate qualification is claimed yet.

Bender-volume-v1 static packet u3090 failed a coarse interpolated-volume
positivity preflight before emitting probe measurements. Initialization remained
the same540kg/600particles. Root read and accepted an isolated logging correction
that preserves the failed control while collecting all unchanged query/contact
results; its result-v2 is pending. No boundary clamp, mass/radius/map refinement
or dynamic tank is authorized by that correction.

Root's soil-water-v1 source study now asks for a genuine saturated/unsaturated
state and one finite pond interface. A second Astra independently reviews the
incompressible mixed pressure/saturation option. Positive-pressure storage may
not silently exceed geometric pore volume; the older Ss counterexample remains
a state-discrimination example, not an implemented groundwater solver. This
work runs independently of the surface-boundary and momentum authors.

The corrected Bender observation u3096 completed all36 probes/two maps in1.166s,
exit1. The sole negative was outside active support, but active planar boundary
density was1.34089 against literal solid.222181 with accurate planar SDF;
gradient was-38.6779/m against-5.13949/m. Root rejects this input/method as-is,
not the maintained library as a whole. No dynamic retry. The next source fit
traces its maintained density-map consumer with an explicitly physical solid
kernel integral; the native default linear-gamma density map and its kinematic
contact are not assumed correct. A grid free-surface alternative is compared
before choosing another physical experiment.

Root personally read the independent soil decision and primary mixed
surface/subsurface model. The first source author now owns column-v1 only:
canonical water masses, rigid pores/constant density, pressure as a constrained
unknown, one finite pond interface and optional finite bottom standpipe. The
old arbitrary positive-head/Ss counterexample is not a reversal oracle for
this new model. Independent saturated-reservoir equalization, true water-table
rest and nonlinear pond exhaustion/refinement are required before any physical
claim. Deterministic derived pressure initialization must preserve restart;
there is no new gameplay watering or atmospheric coupling in this source work.

## Finite momentum and groundwater first-run follow-through

The previous user-question turn was a clarification/status response, not an
additional physics result. Work remains available; root resumed actual source
and caller review instead of treating that conversational turn as progress.

Finite-momentum-v1 now passed its first frozen packet u3146/e1c87345, 182 returned
steps/4590 checks in4.379s with at most512 cells. Root personally read the full
source/caller and actual JSON. Spatial analytic flow error5.18%→2.96%, temporal
successive-difference ratio3.9993, real local M/U/P receipts and exact moving
file continuation passed. Whole-process final RSS258MB includes proof/oracle/
retained arrays; it is not solver memory or game capacity. Moving buoyancy,
walls/openings and multicomponent thermodynamics remain unproved. The same
author now owns finite-buoyancy-v1; root supplied independently reviewed and
qualified linear-buoyancy-oracle-v1 (u3190,95checks). This oracle is only the
small-amplitude initial-acceleration limit and never an injected force.

Soil column-v1 first physical packet u3172 stopped at253checks after constitutive,
Jacobian/pivot, hydrostatic and two downward-reservoir cases. At the next step,
the strict wet-boundary depth/head relation rejected. The failed candidate head
was not captured, so floating roundtrip is initially an inference, not an
observed exact cause. Root read failure/source and accepted isolated source-v2:
derive both wet trace heads from final canonical mass, preserve dry traces,
recheck the same physical residuals and record actual normalization/error facts.
One unchanged-fixture replacement packet is authorized; no success for pond
exhaustion, reverse flow, lower transition or restart is inferred from v1.

The water source-fit found a credible existing grid reference in Basilisk's
geometric VOF/shared phase-momentum/variable-density projection. Root read its
actual source/build/callers and authorized only an isolated minimal native
build plus a source-first2D aligned-wall basin. Partial embedded solid-cell
volume accounting, stock restart, cubic-cell metrics, incompressible air and
GPL source distribution are explicit fit boundaries. It is not adopted for
gameplay or ported; the two retained SPH wall failures remain unchanged.
The .02m physical test grid is a basin discriminator, not required world
resolution. Editable topology, finite air ownership and3D cost still need proof.

Visible Game Delivery remains on the actual brewing/material/presentation
source and its ordinary release decisions; root read its current tray/keg-
capacity and saved-receipt correction handoff. No game release, shared Caps
writer, Shiitake turn or production source change is claimed by these studies.

Soil source-v2 is now physically qualified by u3196/58f1a8f5, exit0:
6groups/5287checks in1.058s. Root read the exact successful JSON/HANDOFF. The
unchanged packet reaches hydrostatic rest, both finite reservoir flow signs,
lower wetting/depletion, genuine pond exhaustion, nonlinear refinement and
exact aligned fresh-file continuation. All recorded physical requests had zero
timestep retries. At32cells, BE .5/.25s profile errors against independently
stepped finer explicit reference decrease1.87e-6→9.54e-7 in mean theta;
explicit .025/.0125s difference4.53e-8. The original failure's missing candidate
head remains an evidence limitation; no diagnostic replay was added. Successful
per-step residual bounds were checked, but unpersisted actual maxima are not
invented. Source-v2 plus run-v2 is accepted, original v1 preserved. The same
author now owns source-first volume-v1: shared retention/paired Darcy geometry
and a bounded3D nonlinear reference, with graph-cycle/closure and dense-LU
cost limits explicit. It does not yet join excavation or free water.

Finite-buoyancy-v1 also passed its single packet u3206/aa2adec7,309checks:
136 SSPRK steps and6 separately labeled Euler probes. Root read actual JSON
85becba3. Initial spatial acceleration error10.50%→2.66%, amplitude ratio2.0005,
real3D density circulation, finite local M/U/P receipts and exact moving file
restart pass. Fine light/heavy vertical means are +/-0.1785m/s and physical
density L1 change.6208%. Mechanical K+PE loss is5.39% and worsens relative to
the coarse3.85%, so no converged-energy or final-accuracy claim. The same author
now audits the actual gravity-work/upwind-mass/dual-momentum compatibility from
source and stored evidence, without another simulation or heat correction.

## Continued physical boundary and energy review

Root answered Levi's excavation question as intended gameplay, explicitly not
shipped behavior: groundwater may seep/flood a dug void, with finite stock,
permeability and drainage controlling the result. The accepted column is not
yet an excavation/free-water/air transaction.

Root personally read volume-v1's actual geometry, shared constitutive import,
face derivatives, residual and concrete line/3D/series-parallel callers. Its
bounded dense-LU/Newton continuation is accepted source-first. Initial pressure
uses deterministic canonical-seed BFS; this changes no mass and is not a solved
field. A multi-port dry reservoir could otherwise become a zero-water suction
connection, so initial multi-port cases require positive water throughout;
only single-port reservoirs may transition dry. Graph closure preserves Darcy
chords and corrects only small tree residuals. No 3D numerical result yet.

Basilisk native caller compiled cleanly in u3210 and root personally read all
caller/observer/runner sources before the single u3233/c52403f8 physical packet.
It failed on its first completed 9.09e-5s interval: both .54m3 phase volumes and
water COM remained correct, but speed8.918e-4m/s, gauge-profile error3876.54Pa
and support10509.30N/m violated the declared1e-6m/s/.01Pa/5303.76N/m controls.
Projection residual met its own target. Native wall0.06594s and peak16512KiB
describe that failed first step only. Complete stdout/stderr/result-v1 remain;
no second basin run or physical tuning is authorized. The same water author
now traces generated boundary/event/projection source. Root's hypothesis is
a mismatch between zeroed predictor boundary flux and gravity pressure-Neumann
conditions; this is not yet established or a library rejection.

The gas energy source audit found a signed compatibility defect hidden by the
net mechanical loss: donor mass transport and arithmetic dual-mass gravity
work do not cancel potential-energy transport. For a stable density gradient,
the defect is positive and linear in small circulation, while donor kinetic
dissipation is cubic. Stored final fine-state arithmetic gives +.0852921W;
this is a final instantaneous rate, not the unrecorded time integral. Root
requested exact stage/projection/RK attribution before another numerical packet
or any thermodynamic correction. Canonical internal-energy conservation does
not establish full mechanical/thermal energy conservation.

Botanical delivered the public Caps Slider package, source751f889, artifact
SHA717a1c654bffc30ffabee201263e905abb3a8f34832c7b177a568c6edc4f36f1.
Root routed the existing packed-package/actual-lab consumer checkpoint to the
verified live Game Delivery owner; a prompt-send receipt is not acknowledgment.
No shared Caps source, game material/source seam, timeline authority or runtime
process was changed by root. Shiitake model work remains paused.

The boundary diagnosis is now source-backed: prescribed provisional wall uf=0
conflicted with the retained gravity-Neumann pressure correction. Its discrete
prediction matched the failed wall support within9.74e-5N/m. Root read the full
audit and accepted only four caller deletions. Corrected u3241/ae681f25 exit0
then passed the unchanged fixture:111steps/.1simulated seconds, max face speed
9.90e-8m/s, max pressure error.000518Pa, support5303.7568775 versus5303.75688N/m,
phase-volume drift2.31e-14m3/m. Root read actual result-v2 JSON. Native wall.231s
including observation and peak16768KiB are this short2D test costs, not a real-
time or world-performance result. New basin-motion-v1 is source-first only;
moving accuracy, ledges,3D/edit/restart remain unfinished.

Root wrote coupling-review-v1/DECISION.md after reading actual pinned all-Mach,
compressible two-phase, thermal and EOS sources. The independent gas reviewer
found no incorrect gas-energy/interface ownership assertion. It prevents
combining two independent air/pressure inventories and names wet-spoil water
export separately from later neighbouring seepage. No coupled solver is
implemented by that note. Accepted gas audit is frozen; its author now owns
source-only finite-energy-diagnostic-v1 on one unchanged existing fixture.

Game Delivery's actual reply acknowledges exact Caps Slider artifact custody
and schedules its vendor/lock + actual lab consumer after the frozen brewing
proof. The current real input trace reached attended Clear and Brew available
for a second batch; no completed release is inferred. Root remains on physics.

## 2026-09-08 continuation: measured progress and preserved failures

Root's coordinate-hash-v1 optimization preserves the actual terrain/cave outputs:
u3287 passed 53,458 comparisons, edit/evict/file restart and interleaved timing;
the initial feature case covered no added feature, so a separate u3294 checked
30 actual feature bricks and 21,807 member cells. Shared-host medians were
250.77→143.81ms for 4,096 terrain queries and 144.40→63.36ms for eight cold cave
bricks; terrain times were noisy. No browser or world-capacity claim follows.
Root handed the exact two-file terrain/helper patch to Delivery, which is now
visibly adapting the actual map contract caller. Root made no tracked edits.

The existing gas run's exact stage diagnostic passed u3266 without changing
its output: gross donor loss −.0924709J plus a gravity/transport defect +.0227442J
and small splitting terms explain the net −.0697251J. This confirms artificial
energy addition hidden by greater dissipation; it does not fix it. Root accepted
the conservative actual-mass-flux energy design, with pressure/EOS changes still
required. The native Basilisk source-fit study is complete but awaits root's
full caller disposition; no new native gas kernel or physical test is claimed.

The nonlinear connected-soil owner passed u3277. A separate moving 27-cell
block using that unchanged owner passed u3307, four groups/2,817 checks. Root
read its actual proof and full RESULTS: 1kg finite pond empties around339–342s
at dt3, nearly all remains in the upper central cell, with small nonzero x/y/z
redistribution, symmetry, temporal self-refinement and exact moving restart.
The qualifier window was262ms including recordings/restart, not world-scale
performance. Available vented pore volume is not an oxygen or finite gas stock.
The201-frame recording is preserved; no open-water/air/excavation join exists.

Root's independent standing-wave oracle passed u3264. The first native moving
water packet u3296 failed: coarse completed one1.1719s period and the principal
wave timing/amplitude were close, but full-profile error .13160 exceeded .08
and staggered energy error1.15516E0 exceeded .12. Fine was incomplete under the
28s combined guard. Root read actual summary/comparison data. Its original
refinement=true reporting is invalid for unequal covered intervals and must
not be advertised; a reporting-only correction is pending. Subsequent saved-row
audit u3322, without a solver rerun, attributes the excess primarily to kinetic
energy and higher shape modes. A column-height potential-energy cross-check
does not remove it. Locating/correcting the physical discrete cause remains
work; no tolerance, fixture, viscosity or gravity tuning is approved by this.

Levi supplied five Isometric Jumpstart art references. Root personally viewed
the four PNGs and structurally inspected the single-frame Aseprite document;
all remain outside Hive. The reviewed original-art brief is
`.botanical/research/grass-water-art-direction-20260908.md`, SHA256
25c93bb183678e8805201431cd0dd7507e9883b9eac809e6517ecf83f0b7e47e.
It reuses accepted original foliage motion, adds bushy cover/water appearance
direction, and separates moisture, fertility and waterlogging. Independent
source/soil review found no model contradiction. Delivery has the exact text
for ordinary tracked publication, not the private assets or a new runtime lane.
The heavy goal remains active; Shiitake model work remains paused.

### Levi's productivity correction

Levi asks whether mature C algorithms already solve these problems and whether
the elapsed work has been productive. Root agrees: no novel speed breakthrough
has been demonstrated, and time spent on disconnected custom solver experiments
has exceeded the useful visible result. Keep the real failures and useful soil,
world, conservation and save evidence; do not describe small test timing as
large-world real-time capacity. Existing Basilisk C is already the native water
reference, so its caller failure is not proof the upstream method is broken.

Prefer existing solver mechanisms and actual supported callers. The immediate
water decision is whether the pinned library's reduced-gravity/interfacial-force
treatment is the correct existing mechanism for the failed wave, preserving
physical inputs and reconstructing physical pressure. One bounded source-fit
and reporting-only repair is assigned; no solver rerun or new custom kernel.
The completed native gas source-fit is retained, but a survey of textbook
benchmarks is not automatically the next useful game outcome. Further tests
must settle a concrete method/caller/integration decision, with unchanged
physical requirements and honest failure limits.

Make the accepted soil recording inspectable through the existing lab owner;
clearly distinguish recorded physics, authored appearance and live controls.
Next joined physics outcomes remain finite water movement, physical air
response, bounded advancement and restart in editable small geometry. Do not
drop conservation or misrepresent an unjoined model merely to show movement.

### 2026-09-09: existing mechanisms, practical accuracy and visible evidence

Levi again asks whether these are established C algorithms and whether the time
is productive. Root's answer is yes to established methods and no to any claimed
novel speed breakthrough. Useful bounded soil/world results do not qualify an
integrated, real-time water/air system. Testing must resolve a game requirement
or an adoption decision; experimental thresholds are not automatically product
requirements.

The maintained Basilisk reduced-gravity mechanism greatly improved the early
wave response without changing the basin. u3386 exited1 at202 steps/.14056s;
the coarse run crossed our absolute1e-10m3/m water gate, with zero native clamp
correction. Fine and full-period behavior remain untested. Preserve that failure.
Independent source review identifies poisson.h's pressure TOLERANCE as a
per-step fractional-cell-volume bound, whereas our cumulative absolute stock
gate was an experimental choice, not a Levi requirement or a derived cumulative
budget. Native vof.h retains a compression contribution from finite velocity
divergence. Observed relative stock drift was1.86e-10. Review the accounting and
choose explicit game-facing long-duration error/CPU requirements before another
water run; neither silently relax the archived benchmark nor blindly tighten
the pressure solve to chase an unsupported accuracy target.

Root authored and independently reviewed the integrated unlined-pit side-face
law in soil-water-v1/pit-face-v1. u3381 passed11 cases/48 algebra checks against
independent pointwise integration and finite differences; u3382 Fallow exited0
with one static estimated-health advisory. This proves the local flux/Jacobian,
not a flooded-hole simulation. The existing soil author is joining all real pit
sides and its floor with canonical soil/pit stocks and world-edit/save authority;
no extra free-water inventory or artificially sealed side walls are accepted.

The native gas/thermal caller compiled in u3390 after one mechanical local
reduction fix. Root read the full compile review and pinned handoff after prior
caller/observer review. One unchanged100J heater/2s closed-room packet is now
authorized under its30s outer guard; no numerical success is yet claimed. Its
purpose is to decide whether the existing thermal mechanism supplies the useful
finite heating/pressure response, not to start a textbook benchmark survey.

Delivery published the accepted recorded soil playback at /soil-water-lab.html
in65da150. Local real-input proof covers27 cells,201 frames,play/pause,selection,
390px containment and catalog access. Hosted evidence is exact byte parity,
not hosted interaction or live editable physics. The lab makes the small soil
result inspectable while normal game delivery continues. World hash reuse also
landed through Delivery in7edbd89 with its actual map-contract check. Root keeps
the heavy goal active; no main-game physics or full-scale performance claim.

### Joined excavation passed; native thermal cost located

The preceding turn made progress: actual-source audit located the mismatch
between experimental cumulative volume and native per-step projection tolerances,
and root recorded the corrected priority. This continuation adds an actual
world/soil/edit/restart outcome rather than another status-only turn.

Root read the complete pit extension, adapter and fixed caller, correcting a
proof-only signed-zero comparison before execution. One u3421 invocation
fa44af10c4dc41b2a674b5613b722ca2 passed5groups/682checks. The actual generated
target(0,14,128) removed237.035657kg of water into finite wet spoil and left an
initially empty pit. At600s it contains12.565429kg:9.300729 from the floor and
3.264700 from all four sides. Depth is only.012565m; do not exaggerate it in art.
The300s file restart contained6.693431kg and produced the exact final canonical
state. The otherwise saturated dry-pit case also admitted/advanced. Root read
the actual proof.json f1e8956c… and all group outcomes. Main18unknowns/100steps
used357,000matrix updates,2592B dense scratch and zero retries. Full qualifier
elapsed2.004s includes other cases, world validation and file work; separate
phase-cost measurement is assigned before any performance claim.

Delivery's real reply accepts the second recording case on the existing soil
lab and assigns visible world-lab p0. Recorded frames a47c56fd… plus actual
excavated state5a52233d… retain finite spoil and unexaggerated pit depth. This is
an acknowledged source handoff, not a deployment claim. Current schema13 main/HUD
scope correction remains with Delivery and its existing writer. The original
grass/water art brief is now tracked byte-identical at
docs/decisions/living-ground-grass-and-water-art.md, SHA25c93bb1…; originals
remain private outside the repo.

Native heat u3403/bf5efee0577b4cd1a15d6c9804b01bcc exited1 (native2) at its25s
caller wall limit:30steps/.3192103s simulated,25.443s elapsed,6.1184s child CPU,
2206multigrid cycles. It admitted31.921J, raised mean EOS pressure12.768Pa and
moved air toward the cooler half, with combined energy error−5.82e-11J. Full
100J/cutoff/2s remains incomplete. Root read the actual final records and source
decision; the native coarse grid only relaxes, with a weak sealed mean-pressure
mode. No faster-language or world-scale inference follows.

Root chooses a standard exact coarsest-grid linear solve as the next gas
implementation discriminator, preserving the same physical equations, native
fine relaxation and current tolerance for a fair cost comparison. A new isolated
coarse-solve-v1 may use the existing16-variable native matrix inverse on the
actual restricted thermal/pressure operator, including lambda4 cross terms and
homogeneous correction boundaries. Source/stencil review precedes execution;
upstream archive and old evidence remain unchanged. No atmospheric reset,
temperature overwrite, second energy owner or production adoption.

The next water source is separately pinned transport-accounted-v1. Physics,
grid, timestep and native pressure tolerance remain unchanged. The old1e-10
stock gate stays visibly failed as an experimental diagnostic. Root declares
a1ppm-of-initial-water total transport budget for this one-period reference
only:5.4e-7m3/m, above the matched-step planning estimate
2000*1.08*1e-10=2.16e-7. Native VOF transports with the current dt using the
previous projected face velocity, so adaptive dt ratios qualify that estimate;
the actual pre-VOF divergence integral/bound is authoritative for the packet.
Mean-depth error at that budget is.54micrometres, well below the2mm physical wave
and its unchanged shape criterion. Actual signed VOF compression/boundary/clamp
closure must be recorded. This does not establish the future vessel SI unit,
30-minute or unlimited-run error budget. No compiled/run result is claimed yet.

### Measured world-query waste removed at its owner

The excavation cost packet u3438 separated bare soil advancement from world
validation. Its actual72 sparse material questions decoded7 full bricks,
28,672material cells and11,958cave metrics. Root implemented an isolated next
world revision at worldgen/point-query-v1 using the same canonical material,
sparse-edit and resident-cache owner. New readPoint reuses resident data when
present and otherwise queries only the requested generated/edited cell; bulk
read/readBrick remain unchanged, and edit admission uses the same point query.
No soil or tracked game source was touched.

u3458/d2b97285040f4616957e2e4dfad2e8f0 passed the exact72-query comparison,
13signed/cave probes, snapshot isolation, edits, eviction, restore and rejected
inputs. Sparse generation became0bricks/0material buffers/73height samples;
the old path used7bricks/1793height samples. One contended old/new observation
was182.334/6.474ms wall and93.758/3.469ms CPU, not a throughput distribution.
Root read actual Fallow u3460:7 inherited static health advisories, including
edit cognitive18; no new point-query hotspot/dead/cycle/clone finding in scope.
Independent soil-author review accepted the exact b3033ee3… candidate and is
joining its real adapter callers in a separate preserved consumer checkpoint.

Root read the complete transport-accounting source and granted one numerical
reference wave comparison after generated-caller review. Its new combined
native observation ceiling is120s, explicitly replacing28s only for this new
packet so both unchanged grid periods have a plausible completion window.
Old28s failures stay failed; this is not a real-time performance allowance or
permission to change physics/accuracy. Gas and water native work remain serial.

The exact coarse thermal source has also been read/accepted against the native
stencil. Its first compiler attempt produced C but failed qcc's separate
symbolic dimensional interpreter at the generic inverse's unset symbolic pivot.
Root permits the installed dimensional-check disable option for this isolated
heterogeneous matrix candidate, disclosing that limitation and retaining normal
C warnings, original-unit stencil checks and physical gates. No mechanical
units-proof, algebra success or new heating result is claimed by that choice.

### Latest native outcomes and reuse decision

Levi asks directly whether established C algorithms exist and whether time has
been spent productively. Yes: moving-water and thermal references reuse the
actual Basilisk C solvers. The custom soil/edit adapter implements established
porous-flow relations and game custody; no novel-fluid or world-scale speed
claim is supported. Root explicitly acknowledges excessive numerical
investigation relative to visible outcomes and keeps correctness, native
cost, game integration and actual hosted lab evidence separate.

Point consumer u3474 passed unchanged600s and moving restart byte equality.
Root read exact six sparse call-site changes and accepted/froze the checkpoint.
No whole-brick generation remains for its72public validation questions.

Water u3477/3279babd7d294f94a0299e65c4f3eea3 completed both1611-step,
1.171909s wave intervals with all original physical/pressure/shape gates and
new1ppm transport accounting. Root read actual summary, per-case accounting,
comparison controls/accuracy/terminal, and refinement. Coarse legacy1e-10
stock diagnostic still fails at202; this is visible, not renamed success.
Maximum absolute observed drift is4.0710e-10/2.5099e-11m3 per metre.
Full absolute transport expenditure8.0548e-10/5.3175e-11 is beneath declared
5.4e-7 reference budget; native clamp is measured separately. Observed
coarse/fine wall11.92/45.31s includes instrumentation, so this remains a
correctness reference rather than real-time game qualification. Independent
actual-source/evidence review is assigned before recorded lab handoff.

Gas exact coarse correction u3469 passed1008native-field algebra checks,
but u3475 rejected at the new backward-error guard after25completed steps.
Matched native cycles fell1758to124 with essentially matching aggregate
physics. This is a standard solver optimization with a real unresolved
linear solve/check failure, not new physics. Root read source and RESULTS,
assigned one observation-only reproduction capturing its exact first failed
16x16 system, followed by offline independent diagnosis. No relaxed guard
or second physical retry is authorized by that diagnostic.

The full water/gas/world goal remains active. Soil seepage/edit/restart and
a2D wave are meaningful narrow results, not complete streams, smoke, fire,
3D/chunk coupling, or qualified game performance.
