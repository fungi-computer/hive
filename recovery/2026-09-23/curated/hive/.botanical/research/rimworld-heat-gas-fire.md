# RimWorld heat, gas, and fire reference for Hive

Read-only research for a future environmental slice. Read 2026-09-07. This is a design reference, not a claim that RimWorld is thermodynamically realistic or that Hive should copy its approximations.

## Sources and scope

1. Ludeon, [Alpha 9e hotfix](https://ludeon.com/blog/2015/02/hotfixed-to-alpha9e/) (2015): historical base-game evidence for room-temperature equalization, wall-thickness tuning, and firefighting.
2. Ludeon, [Biotech preview #2](https://ludeon.com/blog/2022/10/biotech-preview-2-combat-mechanoids-pollution-and-super-mechanoid-bosses/) (2022): official Biotech tox-gas feature description.
3. Ludeon, [Odyssey and update 1.6 announcement](https://ludeon.com/blog/2025/06/announcing-odyssey-and-update-1-6/) (2025): official DLC/base-update scope; it identifies oxygen, airtight walls, airlocks, and vac suits as Odyssey content.
4. Combat Extended's maintained public source: [BlackSmokeTracker.cs](https://github.com/CombatExtended-Continued/CombatExtended/blob/c63c9656c0837371014b45519bfd6becfa0bc4ac/Source/CombatExtended/CombatExtended/BlackSmokeTracker.cs) and [Smoke.cs](https://github.com/CombatExtended-Continued/CombatExtended/blob/c63c9656c0837371014b45519bfd6becfa0bc4ac/Source/CombatExtended/CombatExtended/Things/Smoke.cs). Astra independently read both at `Development` commit `c63c9656c0837371014b45519bfd6becfa0bc4ac` on 2026-09-07.
5. Klei, [Oxygen Not Included game page](https://www.klei.com/games/oxygen-not-included), the only ONI source used here.

The Ludeon material is product/patch documentation, not public source. It does not establish the current native algorithms for room finding, doors, vents, gas, fire growth, or extinguishing. This note does not use decompiled RimWorld code.

## What official RimWorld material actually supports

### Heat and rooms

- The 2015 base-game patch says room temperature equalization was reduced and walls two or more cells thick equalized temperature more slowly. It also records an indoor-temperature bug fix.
- That demonstrates a historical room/structure temperature abstraction and permeability tuning. It does **not** prove a present-version heat equation, heat capacity model, room-graph algorithm, door/vent coefficients, or outdoor boundary rule.
- Current official 1.6/Odyssey material does not document the native heat solver. Do not label a current RimWorld mechanic as room-only or per-cell from these sources.

### Fire

- The same 2015 patch says firefighting colonists fight fires they walk into. This is a historical product fact, not a current specification of spread probability, fuel consumption, heat release, door behavior, or smoke production. An earlier draft incorrectly attributed a rain/fire bug to this page; Astra removed it after checking the primary text.
- Current official Odyssey material mentions brushfires and new environmental hazards, but does not supply a native fire-growth/spread/extinguish model.
- Therefore: native fire can be a useful player-facing reference, but source reviewed here cannot prove its current detailed mechanics.

### Gas and DLC boundaries

- Biotech adds tox gas. Officially it can come from burning toxic wastepacks and named weapons; it hurts lungs/eyes, reduces sight/breathing, creates toxic buildup under chronic exposure, and masks/movement mitigate it.
- The official page calls tox gas a cloud but does not reveal whether its quantity is cell, room, or another representation; it also does not establish vent/door spread, decay, or interaction with temperature.
- Smokeleaf is a drug/visual concept and is not evidence that native fire smoke is an inhalable simulation.
- Odyssey is separate DLC, not base RimWorld: official material describes oxygen pumps, airtight walls, airlocks/vac barriers, vacuum, and vac suits for space. It must not be retrofitted into claims about base-game rooms or Biotech tox gas.

## One maintained mod implementation: Combat Extended black smoke

Combat Extended is an overhaul, not vanilla behavior. Its current public source supplies a concrete example of what this mod adds:

- `BlackSmokeTracker` keeps a per-map collection of its `Smoke` objects, advances each, then applies queued neighbor transfers.
- `Smoke` subclasses the RimWorld `Gas` type but holds its own persisted scalar `density`; its label exposes a derived ppm-like display and opacity derives from density.
- At a fixed interval it transfers density to cardinal neighboring cells, tending toward pairwise equalization. A full edifice blocks movement; an open door or a vent whose `FlickUtility.WantsToBeOn` returns true allows it. This method does not check electrical power. This is a 2D cell rule, not a room-temperature model and not a 3D buoyancy solver.
- An unroofed cell loses a fixed density amount; dense smoke also dissipates proportionally and may create ash filth. These are authored game rules, not a real atmospheric claim.
- The source applies a `SmokeInhalation` health condition from local density, modified by smoke sensitivity and breathing capacity, and notifies a gas-mask component. This is explicit mod-added inhalation/exposure behavior.
- The inspected source does not couple black-smoke density to a heat field. I did not trace every producer of CE smoke, so this establishes how CE smoke behaves once spawned, not a complete CE fire pipeline.

This confirms that “smoke inhalation from fires” commonly reported for RimWorld can be mod behavior. It must not be attributed to vanilla or Biotech without a versioned primary source.

### Public-source trace, bounded to CE smoke

`Smoke.SpawnSetup` registers the spawned smoke instance with the map's `BlackSmokeTracker`. Each `BlackSmokeTracker.MapComponentTick` first invokes `Smoke.ParallelTick` across the collection, then invokes `Smoke.DoSpreadToAdjacentCells` for each instance. That is a concrete two-stage input→output path: a spawned smoke cell becomes queued neighbor density transfer, then destination-cell smoke/density state.

This ordering is a CE implementation detail, not a reusable scheduling contract. Hive's fixed clock should make the same sort of source/exchange/sink boundary explicit and deterministic; it should not inherit CE's parallel map tick, constants, health thresholds, or class hierarchy.

## RimWorld approximation versus Hive's desired scene

RimWorld's historical room equalization is useful as a readability/performance lesson: construction can make temperature legible. CE's source is useful as a warning: a 2D cardinal, equalizing density field can make doors and vents meaningful, yet it cannot express Hive's required lower fire → upper opening → smoke exposure path.

Hive's existing [atmosphere note](./atmosphere-heat-and-horticulture.md) already chooses the correct question: a small active 3D volume grid derived from actual openings, with a room graph only as a query/summary aid. Retain that direction rather than adopting either a pure room value or CE's 2D smoke field.

ONI contrast: Klei's official page presents oxygen, warmth, and sustenance as linked survival pressures. It does not publish internal solver details, so it supports the desired design pressure only; it does not justify an assumption about ONI cells, elements, or numerical methods.

## Implications for a 3D chunked Hive world

### Keep separate owned quantities

- World geometry owns solid faces, roofs, doors, vents, stairs, and exterior/opening connectivity on every Z level.
- The environmental state owns thermal energy/temperature and a transported smoke-exposure quantity. Rendering reads it; particles are never the quantity or the damage decision.
- A fire owns its fuel/burning state and emits named heat and smoke quantities. It can attempt spread only through an explicit combustible/material rule; extinguishing is a state transition with a named sink.
- People, plants, and later water read those fields. An exposure effect, greenhouse growth condition, or fire action does not keep a private competing air model.

### Preserve the required behavior, not a generic gas engine

The core scene is one lower fire, an upper room, a vertical opening, and an outside vent. Conservation is useful because closing/opening geometry then has an observable cause, but one transported smoke-exposure quantity is enough for the first slice. It need not be oxygen, combustion chemistry, pressure, CFD, or a claim of real smoke physiology.

Heat and smoke may travel on different authored rules. A shared opening graph is valuable; forcing identical rates or inventing a complete fluid mixture is not. Outdoor weather is an explicit boundary input on the fixed clock, not a special infinite room.

### Concrete tradeoffs to measure

| Choice | Gain | Cost / failure to avoid |
| --- | --- | --- |
| Room-wide heat/smoke | Cheap greenhouse readout | Erases source proximity, vertical smoke, and local vent relief. |
| Active 3D face exchange | Supports upstairs smoke and chunk-safe openings | Requires bounded active-region work and cross-chunk accounting once. |
| CE-like 2D local density | Simple doors/vents/exposure pattern | Cannot model vertical routing; its decay/roof rules are not Hive law. |
| Full gas/combustion catalog | More possible future interactions | Makes a generic engine before the fire/vent scene proves a need. |
| Smoke as transported exposure | Clear fire/vent consequence | Must define source, sink, display, and occupant sampling explicitly. |

## First future proof boundary

Build the future two-level proof structure, one fuelled source, one occupant, and one ordinary open/close-vent command. Prove on the fixed simulation clock that opening geometry changes the smoke quantity at source, upper room, and exterior; prove the occupant's exposure follows its local sample; prove a plant's heat condition reads the same environmental owner. A deterministic test should account for emitted, transported, and removed quantity, not promise physical realism.

Water stays finite and later: rain can be a future named boundary/source and firefighting a finite-water sink, but neither is required to make the first smoke/heat/vent proof honest. Chunk eviction/reload must preserve sealed-space state and count cross-border exchange once.

## Unknowns and non-adoption

- No reviewed official page establishes current native RimWorld room/door/vent/exterior heat exchange, current fire spread/growth/extinguish numbers, or native gas blocking/decay representation.
- No reviewed official page establishes that base-game fire smoke causes inhalation. The CE source demonstrates a mod-specific implementation; Biotech tox gas is a separate DLC feature.
- No reviewed primary ONI source establishes its solver internals.
- Do not reproduce CE code or create a standalone generic gas framework. The future environmental owner remains Hive's fixed-step state and typed command admission; art, AI stewards, and displays consume its results.

Wall check: copying a familiar 2D approximation would put the desired upstairs-opening behavior on the next row. Start from the one named scene and retain only mechanics it demonstrates.
