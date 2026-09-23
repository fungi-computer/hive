# Atmosphere and thermal coupling: bounded expert recommendation

2026-09-08, Astra/Ultra fork. Ignored research only; no runtime, art, Git, build or deployment changes. Root reconciles this with water/scale; Delivery retains production custody.

**Recommend spatial control volumes and one conservative exchange owner. Do not select the tested ventilation closure as production-ready.** Its quantities balance, but its vent fails useful relief. Pressure, oxygen and phase changes need explicit extensions, not hidden interpretations of a smoke number.

Read current architecture sprint, environmental-fields/openings and living-world contracts; retained atmosphere, ONI, RimWorld/CE, compost-air, hotbed and hygiene studies. Actual `src/world.js` owns logical actor cells: `topologyNeighbors` joins stair endpoints, while `blockedCells` reserves unfinished walls. Neither describes physical air apertures. `src/ticker.js` supplies existing 50 ms steps. No environmental owner exists in those callers.

## Representation and first approximation

Use geometry-derived void volumes with face apertures, physical elevations, area and material thermal contacts. Start experiments with at least two vertical samples per storey and enough horizontal samples to distinguish source, occupant and vent. Resolution must survive refinement comparisons; logical storey height alone cannot represent ceiling smoke versus breathing height.

One well-mixed room value erases those questions. A two-layer compartment is a serious alternative: [NIST CFAST](https://www.nist.gov/publications/cfast-consolidated-model-fire-growth-and-smoke-transport-version-6-technical-reference) conserves mass/energy in upper and lower layers. Its layer-uniform assumption still loses horizontal proximity. Prefer cells for the authored-layout consumer; room connectivity and summaries remain derived. Coarsening is permitted only after testing the specific lost gradients.

First approximation: dilute transported smoke in fixed-density, fixed-volume background air; temperature drives buoyancy but does not expand air. This Boussinesq approximation excludes sealed-pressure buildup, oxygen depletion, steam displacement, explosions and flame-core temperatures. [FDS's own history](https://github.com/firemodels/fds/blob/master/Manuals/FDS_Technical_Reference_Guide/Equation_Chapter.tex) describes why its original Boussinesq treatment later became insufficient. That supports an explicit upgrade boundary, not adopting FDS complexity now.

Canonical first quantities:

| Quantity | Unit and authority |
|---|---|
| Void volume `V`, aperture, elevation | m³, m², m; geometry, not renderer |
| Smoke `S` | kg aerosol-equivalent authored tracer; not complete combustion products |
| Thermal anomaly `H` | J; `H = rho0 V cp (T − Tref)` |
| Solid/root/vessel thermal state | J with material heat capacity J/K; same thermal owner |
| Cumulative source/export/deposition | kg/J, named environmental/process accounts |

Derive concentration `S/V`, temperature `Tref + H/C`, exposure integral `∫ concentration dt` at the occupant's actual breathing sample. `H` may be negative: zero means reference temperature, not zero available energy. Never positivity-clamp signed thermal anomaly. Constant `cp`, `rho0`, `Tref` are pinned approximation parameters; this stored thermal scalar is **not gas internal energy**.

## Exchange operators

Trial circulation uses an overdamped resistance graph:

```text
q_ab = K_ab (pi_a − pi_b + buoyancyHead_ab + fanHead_ab)
buoyancyHead_ab = rho0 g (height_b − height_a) mean(T−Tref)/Tref
sum(outward q) = 0 at every fixed-volume cell
```

`q`: m³/s; `K`: m³/(Pa·s); `pi`: pressure potential Pa after removing ambient hydrostatic pressure. Linear resistance is an authored closure, not a turbulent aperture law. [NIST CONTAM93](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir5385.pdf) documents the broader pressure-network/mass-balance method, including nonlinear flow laws. Here no inertia or momentum is persisted. Pin one pressure gauge per sealed component; outside uses weather pressure. Reconstruct potentials/flows from canonical quantities/topology with deterministic solve order and checked residuals. They are not thermodynamic pressure or saved truth.

Upwind transport debits/credits `q dt S_donor/V_donor` and `q dt H_donor/V_donor` together. Add explicitly authored symmetric exchange as equal opposite carrier volumes for unresolved mixing. Smoke has no independent “rise” velocity: hot air transports it. Molecular/eddy mixing and advective flow need distinct diagnostic labels and coefficients.

One net-flow exterior edge cannot continuously exhaust a sealed incompressible house. Provide an actual replacement-air route, resolve a tall aperture into counterflow subfaces, or explicitly model balanced subface mixing. An exterior smoke sink pretending to be suction violates that boundary. Outdoor reservoirs specify temperature, composition and pressure/wind epochs; every import/export is ledgered. Closing a vent changes aperture; camera cutaway changes nothing.

Flux proposals read one old state; each edge applies once. Choose deterministic substeps from **aggregate** outgoing carrier fraction plus mixing/conduction rates, conservatively below 0.4. Do not independently donor-scale a solved incompressible `q`: that breaks its divergence constraint. Shorten the substep/re-solve instead. Actual species/source withdrawals additionally share one donor budget. Stable IDs determine summation; tolerances detect drift, never erase it silently.

Conduction/exchangers transfer `Q = G(Ta−Tb)dt`, `G` in W/K, no material. For explicit thermal updates require `dt ΣG/C` within the aggregate stability budget; pair equilibrium clamps alone fail with several neighbors. Insulation changes conductance, not stored energy. Root medium, air, wall and water remain separate thermal capacities. Use a bounded implicit thermal solve if stiff contacts demand excessive substeps; validate positivity/maximum principle and conservation separately.

## Path to gases, pressure, fire and water

When oxygen or trapped-air compression earns a consumer, replace the approximate state through an explicit schema/model migration: finite constituent masses `m_s`, composition-dependent **internal energy** `U = Σm_s u_s(T)`, free volume and pinned thermodynamic definitions. Derive `p = RT Σ(m_s/M_s)/Vgas` and density. Preserve temperature/tracer explicitly while disclosing assumed ambient background mass; the old tracer state never proved exact chemical history.

At fixed-volume gas boundaries, advect species plus **enthalpy** `Σ dm_s h_s(T)`, where `h_s=u_s+RT/M_s`; do not store `cv T` while transferring `cv T` as if flow work vanished. Pin common energy references and formation energies or a separate chemical-energy ledger, never both. Variable-volume boundaries add pressure work. [FDS's energy formulation](https://github.com/firemodels/fds/blob/master/Manuals/FDS_Technical_Reference_Guide/Equation_Chapter.tex) explicitly separates internal energy, enthalpy and pressure contributions.

This later quasi-static compressible resistance model needs a coupled pressure/species/energy solve; raw explicit pressure equalization can be extremely stiff. Donor mass limits alone do not preserve positive temperature during enthalpy outflow. Require admissible post-transfer composition/energy and a bounded convergence test. Dense smoke, oxygen consumption and vapor must not coexist with an unchanged fixed background-air authority. Acoustic waves and inertial jets remain outside this model; choosing momentum later requires saving it.

Fire owns finite fuel, burn progress and declared yield/chemical-energy budget; it submits one atomic resource→heat/tracer/ash outcome. Initially oxygen is intentionally unmodeled. Later reaction extent is jointly limited by fuel, oxygen, heat availability and product capacity; gas/ash products satisfy declared element balances. No oxygen damage numbers follow from an aerosol tracer. Ignition/spread read actual combustible contacts and local heat; extinguishing consumes finite water and changes the burning state once.

Water owns liquid inventory; geometry owns available void. `Vgas = Vvoid − occupiedLiquidVolume`. Before water rises or construction reduces void, one coordinated transaction must displace air through valid paths or retain/compress it with accounted work; unsupported sealed displacement waits/rejects. Never delete air or create ambient replacement. Gas zero-volume cells require settlement before removal. The first fixed-volume approximation therefore does not support flooding its air cells.

Evaporation/condensation transfers the same water mass between liquid/vapor and compatible phase-energy functions, including latent heat once. Respect saturation/partial pressure, donor water and thermal supply; deposit condensate into real capacity. An atmospheric-pressure latent enthalpy cannot be pasted into an internal-energy update without pressure-work consistency. Pressure/phase proofs precede boiling vessels or steam pipes.

Sunlight supplies ledgered `irradiance × projected area × transmission × absorption × dt` to receiving surfaces/root medium; convective/conductive contacts warm air. Shading, glazing, ventilation and longwave loss have separate coefficients. No greenhouse multiplier or permanently warm air label. A plant reads local light/root-water/root-temperature/air conditions. Direct compost air carries selected gases/vapor; sealed recovery exchanges only heat between circuits. Filters retain/transform finite material. The [SARE compost report](https://projects.sare.org/project-reports/one22-427/) documents both condensate/heat recovery and occasions when excess warmth/moisture required diversion: no universal clean-air or always-beneficial-heat claim follows.

Topology splits/merges change connectivity, not cell inventories. Do not average entire newly connected rooms instantly. Refinement partitions extensive quantities by overlap; coarsening sums them, derives temperature from heat capacity, and cannot cross a closed face. Save canonical state, approximation/version, source progress, topology revision, boundary epoch, committed tick and any quantization residuals. Save at full tick boundaries. Pause advances no quantities; accepted vent intent applies before the next environmental step. Rebuild solver caches after load; offscreen state is not ambient reset.

## Executed falsification and remaining decision

[Experiment](gas-heat/experiment.py), [results](gas-heat/results.json), and two retained failed-run records use eight 1 m³ cells, a 30 s heat/tracer pulse, vent opening at 30 s, and 300 s observation. Guarded scopes `run-u1684`, `run-u1687` failed the unchanged relief threshold; `run-u1689` completed all numerical checks and explicitly records `ventilation_candidate_accepted: false`. Native handles were polled to terminal exits.

Results: closed floor gave zero upstairs smoke; sealed total remained 0.003 kg. One pressure-only vent exported numerical roundoff. Adding inlet+vent exported only **0.033%** and increased upstairs integrated exposure **40%**. Adding balanced vent mixing exported 0.070%, still inadequate. Largest mass error was below 2e−17 kg, heat error below 2e−11 J. Reload plus canonical input ordering reproduced exact state; halving dt changed throughflow exposure 0.00345%. A four-neighbor thermal star conserved heat while a pair clamp drove normalized center temperature to −1; aggregate stable stepping retained bounds.

Thus select the ownership/conservation boundary, **reject these coefficients/fixture as useful ventilation**, and reject single-edge suction and pair-only thermal limiting outright. Next discriminating experiment must compare vent height, source-local exhaust, resolved aperture counterflow and timestep/resolution refinement against local exposure and clearing time. Geometry volumes, aperture coefficients, atmosphere/water transactions and practical solver budgets remain unresolved. No actor, realistic emission, greenhouse, production or population-performance evidence is claimed.
