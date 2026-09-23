# Gas volume changes: physical model decision

2026-09-08. Independent source review for Astra. Recommendation, not an implemented or numerically qualified topology adapter. Only this ignored note was written; the solver, voxel owner, and concurrent `voxel-binding-v1` caller remain untouched.

## Decision

Keep the accepted Boussinesq solver for its demonstrated fixed-volume smoke and small-temperature-anomaly behavior. Do not pretend that remapping its arrays implements excavation. For finite air, oxygen, substantial heating, and changed gas volume, the next physical owner should evolve **finite species masses and thermodynamics under a low-Mach variable-density model**. Cell stocks remain authoritative; a connected pressure region supplies a thermodynamic pressure constraint, not another inventory.

The immediate topology experiment can open or close a **zero-volume face barrier between existing gas cells at rest**, retaining exactly the same gas-cell set and scalar stocks. This is a shutter/thin partition experiment, not a full-voxel wall or excavation feature. Continue rejecting other geometry revisions until a supported physical edit exists.

The first actual volume-change experiment should be a separate, finite-mass, uniform chamber with an explicitly chosen expansion/compression law and analytic answer. That proves the missing thermodynamics before joining the spatial transport solver. Neither a conservation-preserving interpolation nor a successful stale-geometry rejection closes this outcome.

## What the actual sources own and omit

Paths below are relative to `.botanical/research/environment-round3-20260908/`.

| Source | Relevant contract | SHA256 |
|---|---|---|
| `gas-heat/transport-v2/checkpoint/physics.mjs` | `RHO=1.2`, `CP=1005`, `TREF=293.15`; fixed reference heat density | `50f82527649ee66e9a356e7dbbe23b956b1b5792f8d3a56c141063e51c65486b` |
| `gas-heat/transport-v2/checkpoint/solver.mjs` | `initial`, `validate`, zero-divergence `project`, buoyancy, canonical clock | `14ef3fa8aa65bc0ba58009a9bbdbfb47d345dbe5cdc1e7020bcaacf8f0b2db6b` |
| `gas-heat/transport-v2/checkpoint/transport.mjs` | Tracer/thermal-anomaly face fluxes, positivity, source/boundary receipts | `51faac0c0a9e1eae18f46e964f6ce4ecc598c4f67d59c7f81924c13e6e32dfae` |
| `gas-heat/nd/geometry.mjs` | Fluid mask, metric volumes, canonical faces, pressure nullspace pins; no stock creation | `90d2d3e1e0714eab9327108b1cf048a2a0627c28e7e91c79faced9943d971b14` |
| `worldgen/volume-v2/voxel-world.mjs` | Generated air/soil/stone plus revisioned sparse material edits | `6aae7b83f71d95f30157f78603de9cc2f90a1d4bf0aab8818e03aebe355e6e3f` |

In `solver.initial` at lines 19–25, each fluid cell receives heat anomaly `rhoRef * cp * volume * deltaT`. There is no saved carrier-air mass. Nevertheless, the temperature conversion and constant-density equations imply that reference air exists. One game voxel is 0.54 m³, implying **0.648 kg** of reference air and **190,911.006 J of reference sensible enthalpy** at the current constants. Creating another ambient fluid cell changes those implicit quantities even when both saved arrays contain zero. That enthalpy is not the current saved heat anomaly and is not total internal energy.

`airImport`/`airExport` are accumulated volume, in m³, from `velocity * face.area * dt`; they are not finite atmospheric mass stocks. `smoke` is a nonnegative dilute passive tracer. Its source does not remove carrier gas or change density, and there is no species-sum constraint. It cannot become oxygen consumption or combustion merely by renaming an array.

`project` enforces zero divergence. Its returned potential corrects velocity and is discarded after a step; it is not thermodynamic pressure. Geometry pins one degree of freedom in sealed connected components, but this mathematical gauge does not establish each room's gas pressure or gas amount.

The voxel material named `air` means absence of the supported solid materials. It proves neither dryness nor gas occupancy: liquid stock is another owner, and height/sea classification is not that liquid stock. Gas volume eventually obeys an occupancy relation such as `Vgas = Vcell - Vsolid - Vliquid`, with explicit porosity only if supported. Geometry compilation must not initialize or transfer any of them.

## Why the present equations cannot admit a changed sealed volume

This is a direct deduction from the current model, independent of the choice of interpolation. For a closed region with constant density,

```
M = rhoRef * Vgas
dM/dt = 0
therefore dVgas/dt = 0
```

Excavation requires positive `dVgas`; inserting a solid requires negative `dVgas`. All three conditions cannot hold. Moving 0.648 kg into the new voxel from neighboring full constant-density cells simply leaves those cells deficient. Keeping that deficiency only in a new metadata field while continuing to use fixed `rhoRef` for temperature and projection establishes contradictory authorities.

Retaining only summed `heat` during a topology change also fails: its reference amount is proportional to volume. Neither setting the new cell's anomaly to zero nor deleting the old cell's zero anomaly accounts for the underlying thermal stock. Using absolute temperature to rebuild the anomaly can manufacture an apparent thermal source unless mass and the reference conversion are explicit.

## Scientific models worth adopting

**Low-Mach finite mixtures are the best fit for ordinary gameplay gas.** The maintained PeleLMeX equations transport species mass and enthalpy, impose an equation of state, and split thermodynamic pressure from the pressure perturbation driving flow. Its confined-domain formulation evolves background pressure and changes the velocity-divergence constraint. Filtering acoustics permits an advective rather than acoustic time restriction. Its implementation is a substantial AMR combustion code, not a small browser library to import wholesale. [PeleLMeX model and closed-chamber equations](https://github.com/Pele-Suite/PeleLMeX/blob/development/Docs/sphinx/manual/Model.rst).

**FDS is particularly relevant to the intended rooms, fire, and ventilation.** Its published model explicitly describes why its original Boussinesq treatment was insufficient, while retaining a low-Mach formulation. It obtains mixture density from transported species mass densities, distinguishes background pressure from flow pressure, and includes pressure change in sensible-enthalpy evolution. Pressure differences between compartments can drive a separate duct model. These are useful mechanisms to study; its fire chemistry, turbulence, and radiation package are not all prerequisites for the next Hive experiment. [FDS governing-equation source](https://github.com/firemodels/fds/blob/master/Manuals/FDS_Technical_Reference_Guide/Equation_Chapter.tex).

**A well-mixed room model is physically meaningful but loses spatial information.** CFAST's two-layer model evolves compartment conditions from mass, energy, the ideal-gas law, and intercompartment exchanges. Its deliberately small number of uniform layers is the approximation. It does not demonstrate that a cave, winding tunnel, greenhouse, or local plume can be treated as one instantaneously mixed room. [NIST CFAST model description](https://www.nist.gov/publications/cfast-consolidated-model-fire-growth-and-smoke-transport-version-6-technical-reference).

The following comparison is my recommendation for this game, not a claim that any upstream solver has been integrated:

| Choice | Honest support | Main cost/limitation | Disposition |
|---|---|---|---|
| Current constant-density Boussinesq | Existing-volume dilute tracer and small thermal anomalies; face barriers | No finite-air expansion, oxygen chemistry, vacuum or substantial thermal expansion | Preserve as reference and constrained first topology experiment |
| Finite-mass reference-density approximation | Can conserve explicitly tracked components under declared small density changes | Must state how density affects temperature, buoyancy and pressure; does not excuse inconsistent sealed-volume edits | Possible limiting case of the next model, not a parallel inventory patched onto today's one |
| Low-Mach variable-density mixture | Finite species, heating/expansion, slow pressure response, ventilation | More scalar fields, EOS inversion, nonzero divergence, pressure-region closure and coefficient-dependent elliptic solves | Preferred next spatial physical model |
| Fully compressible finite-volume gas | Acoustic waves, strong pressure transients, compressible expansion | Acoustic timestep, positivity and shock treatment, difficult low-Mach accuracy | Reserve for demonstrated high-speed needs; not the default world gas solver |
| One/two-layer pressure rooms | Cheap finite stocks, pressure, vents and well-mixed thermodynamics | Cannot preserve arbitrary local smoke/temperature structure; room split/merge approximations matter | Useful analytic reference or later explicitly qualified coarse representation |

For scale only, with sound speed 343 m/s, spacing 0.54 m and CFL 0.45, an explicit acoustic step is about 0.000708 s. That is roughly 70 steps per existing 0.05 s maximum interval before other restrictions. This is a dimensional example, not a measured runtime ratio or evidence that an implicit compressible method cannot perform well.

## Minimum missing variables and equations

The next model needs, for each supported gas volume, nonnegative species masses `m[k]`, a thermal state with an explicit energy convention, and velocity/momentum sufficient for the selected flow discretization. Density is derived from `sum(m)/Vgas`. Temperature comes from the thermodynamic relation, not `heat/(rhoRef*cp*V)`. A small gas basis can grow through definitions; oxygen, inert gas, water vapor and carbon dioxide do not require a different solver each. Particulate soot must not silently contribute gas moles to the equation of state.

Choose either internal energy or enthalpy as the evolved thermal quantity and carry its pressure/work terms consistently. Internal energy is convenient for checking sealed volume changes. Enthalpy is convenient for advected material streams. They obey `H = U + pV`; they are not interchangeable arrays. Future reaction definitions must conserve the appropriate chemical elements and account for heat of reaction; fuel and oxygen becoming products is not an external mass source.

For an ideal-gas mixture, the local closure is

```
rho = sum_k(m[k]) / Vgas
p0 = rho * Rmix(composition) * T
```

The flow pressure perturbation remains distinct from `p0`. For a low-Mach region, write the constraint in the form `div(u) = S - theta * dp0/dt`. Integrating that relation gives

```
dp0/dt = (integral(S dV) - integral_boundary(u · n dA))
         / integral(theta dV)
```

For a sealed moving boundary, the boundary-volume term includes `dVgas/dt`. A constant-gamma, adiabatic, quasistatic chamber consequently obeys `p V^gamma = constant`. This deduction shows exactly why leaving the old zero-divergence right-hand side unchanged is insufficient.

Species transport needs one equal-and-opposite mass flux per face, with species fractions summing to one, plus explicit external/reaction transfers. A region thermal balance must account for stream enthalpy, heat exchange and moving-boundary work. For a uniform-pressure chamber the relevant bookkeeping form is

```
dU/dt = net incoming stream enthalpy + heat input
        - p0 * dVgas/dt + other declared work
```

This is not a complete new spatial numerical scheme. Kinetic energy, gravitational work and viscous dissipation require the chosen momentum/thermal approximation to state its retained terms. Today's anomaly ledger is not proof of total-energy conservation.

Pressure regions must be bounded numerical domains with stated pressure-equalization assumptions. A topological connection through a tiny vent does not imply instantaneous mixing or permit instantly merging two greatly different pressures. Keep a finite vent exchange model or resolve the transient; do not use a region flood fill as a physical equilibration algorithm. Ordinary room-height studies can start with one reference height. Tall towers and deep mines later need a consistent hydrostatic background rather than a world-wide constant atmospheric pressure.

## Generated unseen air versus actual excavation

Generated empty space may possess a declared initial gas state before it is rendered or resident. Materializing that untouched initial state is a representation operation, not a new physical source. It needs world/realm/generator identity and an initialization epoch. A cave that has already exchanged gas, burned fuel, or been heated must recover those changes; eviction cannot return it to pristine air. If a distant atmosphere is deliberately treated as a prescribed reservoir, boundary mass, composition and thermal transfers must be recorded as exchanges with that reservoir. Do not call an infinite-reservoir approximation finite-world conservation.

Excavating rock creates accessible volume that previously held solid, not unobserved ambient gas. Porous soil could contain gas only if porosity and pore stocks are explicitly modeled. It is not a justification for allocating one full ambient voxel.

An instantaneous solid removal can create a fast expansion into empty volume. Even a correct low-Mach solver does not resolve vacuum or that acoustic transient merely because its mass arrays exist. Two defensible future policies are:

1. **Finite-time boundary movement:** retreat the solid boundary while gas displaces into the growing volume. This needs volume fractions/apertures or another conservative moving-boundary discretization and pressure-work receipts. Fractional numerical geometry need not make player terrain fractional. Small cut volumes introduce timestep/conditioning issues that need their own treatment.
2. **Explicit equilibrium approximation:** replace an unresolved short transient with a declared thermodynamic map, preserving finite mass and the selected energy/work law. Qualify it first in a uniform chamber, then define when local spatial structure and pressure differences make it inadmissible. It is not free generic remapping.

These policies have different energy results. Ideal-gas free expansion into newly available empty space has no work on an external resisting boundary and retains internal energy in an isolated final equilibrium. Reversible adiabatic piston expansion performs work and cools the gas. Excavation cannot silently select whichever formula is numerically convenient. Solid insertion likewise cannot remove the last occupied gas volume while retaining finite mass and finite pressure; it must displace material through supported exchanges or remain uncommitted.

## Smallest honest implementation/proof sequence

**A. Existing model, real limited topology change.** Add a caller-level transaction for a face barrier at zero velocity between existing gas cells. Cell IDs, gas volumes, smoke, anomaly heat, time and accumulated ledgers remain exactly unchanged. Rebuild topology/nullspace caches and face mappings; new faces start at zero. Opening then permits ordinary transport. Closing can separate components. This creates no air and needs no hypothetical displacement energy because the first proof is at rest. Dynamic closure requires an explicit momentum/impulse and approximation decision later. Do not present this as a voxel wall implementation.

Required focused laws: wrong revision rejects without mutation; barrier round trip at rest preserves all stocks/time; opening allows transport across the actual face; closing prevents it; split components remain independently solvable; same-domain save/reload and duplicate admission do not repeat an edit. Initial state in each compartment must have been declared before the opening.

**B. Finite-mass thermodynamic chamber.** Start with one inert ideal gas, fixed constant heat capacity, known mass, internal energy and volume. Prove two separately named analytic experiments: isolated ideal-gas free expansion (`M,U` fixed, `T` fixed, pressure inversely proportional to volume) and quasistatic adiabatic compression/expansion (`pV^gamma` fixed, boundary work balances `Delta U`). Do not join these two edit meanings. Check a finite exterior reservoir exchange separately, then a prescribed ambient reservoir with explicit receipts. Zero/negative volume, negative species, invalid energy, stale identity and unsupported pressure jumps reject atomically.

**C. Join the chosen law to variable-density spatial flow.** First use a bounded slow moving-boundary or tightly restricted equilibrium case whose expected outcome is independent of the implementation. Require species/thermal/work balances, EOS residual, nonzero-divergence constraint, positivity, geometry conservation, save/restart, and refinement. Preserve the fixed-volume qualified cases as limiting tests. A new thermal save version must derive quantities consistently from known old `rhoRef`, volume and temperature; it cannot relabel the old `cp * deltaT` anomaly as internal energy.

**D. Only then qualify a gameplay excavation/build operation.** The world owner proposes the occupancy change; the physical owner determines admissibility and all displaced quantities; the combined commit advances the material revision and gas state together. Failure preserves both. No partial world edit followed by a best-effort gas repair. Existing `voxel-binding-v1` stale-revision rejection is correct protection until that joint path exists.

## Performance and scope

Keep the working face-flux ownership, bounded rectangular geometry and measured scalar methods. A fixed small species count adds linear cell/face work; thermodynamics and variable coefficients are real extra cost. Geometry/region discovery occurs at actual topology changes and is bounded, with counters for affected cells/components and solver iterations. Coefficients depending on density may change even without a geometry edit: caching the entire new pressure operator forever would be incorrect. Separate sparsity/topology reuse from coefficient updates.

Do not introduce both a cell gas inventory and authoritative well-mixed room inventory. Any later coarse room representation must have one exclusive physical owner and conservative restriction/prolongation; it is not needed to prove the next chamber. No full-world atmosphere allocation, full chemistry package, room framework, solver import, backend, WASM port or gameplay edit is authorized or implemented by this note.

Open CTO choices: which excavation transient approximation is acceptable; what pressure/temperature/Mach envelope counts as ordinary gameplay gas; whether strongly pressurized/vacuum phenomena are wanted; and when gas/solid/liquid volume becomes a joined current slice. The recommendation above allows useful fixed-volume work now while exposing, rather than disguising, those decisions.
