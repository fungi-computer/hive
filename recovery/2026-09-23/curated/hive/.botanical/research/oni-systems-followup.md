# Oxygen Not Included systems follow-up for Hive

Reviewed 2026-09-07. This is a bounded product-and-architecture study, not an attempt to reconstruct Klei's closed engine.

These are future environmental experiments. They do not supersede the current
upstairs release, the independent World Lab, or brewing as the next planned
gameplay outcome. Astra reviewed the retained study and its immediate design
consumers; no runtime implementation is implied.

## Evidence labels

- **Established behavior** means a Klei developer statement, Klei release note, Klei presentation, or a narrow observation from current public mod source.
- **Unknown internal** means the available primary sources do not publish the algorithm, update order, numeric constants, or determinism contract.
- **Hive proposal** is a design choice suggested for Hive. It is not attributed to ONI.
- Most detailed mechanics sources below are historical alpha or post-release patches. They prove a behavior existed at that date; they do not prove every value is unchanged in 2026.

## Executive read

ONI's durable lesson is not “simulate everything.” It is to expose a few coupled quantities that create understandable production failures.

Klei developer Graham Jans described the game as bottom-up temperature, pressure, and chemical simulations whose interactions create challenges. In the same interview he said much of the apparent complexity is built from simple behaviors and that mass conservation includes deliberate “hand-waving,” rather than gram-perfect realism ([Game Developer interview, 2017-06-07](https://www.gamedeveloper.com/design/layering-challenges-in-klei-s-survival-sim-i-oxygen-not-included-i-)).

That distinction matters for Hive. A smoke-filled upstairs, a vent, and a temperature-sensitive greenhouse can prove coupled systems without committing to computational fluid dynamics, a complete chemistry catalog, or ONI-compatible physics.

The strongest transferable pattern is:

1. conserve the quantities that players plan around;
2. simplify representation aggressively;
3. expose each cause of stoppage;
4. let pipes, doors, vents, labor, and automation connect the same state;
5. measure the actual Hive workload before generalizing the solver.

## 1. Heat capacity, conductivity, and phase changes

### Established behavior

ONI treats material thermal properties as gameplay inputs, not decoration.

- A 2018 Klei hotfix corrected liquid-density settling because it averaged temperature rather than energy. The same patch fixed zero-thermal-conductivity elements conducting, inverted conduit-to-pipe energy transfer, and the displayed conductivity modifiers for insulated and radiant buildings ([Klei update 266019, 2018-04-26](https://forums.kleientertainment.com/game-updates/oni-alpha/266019-r422/)).
- A 2020 Klei update changed solid “flaking” so the transition uses the energy required to melt the material and the specific heat capacity of the transition element ([Klei update 418018, 2020-06-24](https://forums.kleientertainment.com/game-updates/oni-alpha/418018-r1179/)).
- A 2023 hotfix corrected temperature oscillation in a Conduction Panel when its material had very high thermal conductivity ([Klei update 567154, 2023-07-27](https://forums.kleientertainment.com/game-updates/oni-alpha/567154-r2040/)).
- Historically, state changes inside pipes damaged pipes, making the conduit itself part of the failure loop ([Klei update 252656, 2018-01-28](https://forums.kleientertainment.com/game-updates/oni-alpha/252656-r364/)).

These notes establish three useful product properties: stored thermal energy matters, transfer rate differs by material, and crossing a phase boundary can change both matter and infrastructure state.

They also show why thermal code needs conservation checks. Klei shipped fixes for deleted energy, wrong averaging, inverted transfer, and unstable high-conductivity behavior over several years.

### Unknown internal

The sources do not establish ONI's current heat-transfer equation, neighbor visitation order, timestep, latent-heat representation for every transition, or how competing transfers are resolved in a tick.
The 2020 flaking note is evidence for that one transition path. It is not proof that every phase change shares one implementation.
“Thermal conductivity affects transfer” is supported. A particular real-world conduction formula is not.

### Hive proposal

For the first Hive proof, store thermal energy as the conserved value and derive displayed temperature from mass and heat capacity. Conductivity should only govern bounded exchange between explicit neighbors or connected devices.

Start with a very small material table: air/smoke mixture, wall, floor, water, crop, and one heat source. Add ignition or boiling only when a real gameplay consumer requires it.

Use a fixed simulation step and deterministic traversal order. Clamp each exchange so a pair cannot overshoot equilibrium in one step. This directly guards the oscillation class visible in Klei's 2023 patch history.

Pairwise limiting alone is insufficient when a cell exchanges with several
neighbors. Resolve aggregate outgoing transfers against the source budget as
well, then apply matching debits/credits in a defined order. Measure both energy
accounting and stability; do not claim that a local clamp proves the full solver.

Treat phase change as a later proof unless the chosen Hive experiment needs steam. Smoke transport and greenhouse stress do not require water boiling.

## 2. Gas, liquid, volume, pressure, and mixtures

### Established behavior

Klei's 2017 Thermal Upgrade preview described pumps consuming gas or liquid from the four cells they cover, falling-liquid mass conservation, improved mass conservation around doors and tile construction, burst pipes, and liquid pressure damage ([Klei Thermal Upgrade preview, 2017-03-15](https://forums.kleientertainment.com/forums/topic/76093-game-update-preview-branch-210162/)).

This establishes a spatial, cell-addressed simulation at the product boundary. It also establishes that doors, construction, pumps, pipes, and structural damage interact with fluid state.

A Klei developer marked an electrolyzer overpressure exploit as a known issue “due to some of the fundamental rules of the simulation” and unlikely to be resolved. The reporter's reverse-engineered explanation is not a Klei statement and should not be treated as authoritative ([Klei bug tracker response, 2019-01-03](https://kleiforums.com/klei-bug-tracker/oni/electrolyzer-ignores-air-pressure-when-almost-flooded-r16496/)).

Current authored mod source gives a narrower API fact. Peter Han's Airlock Door samples external pressure through `Grid.Mass[cell]` for individual cells ([public mod source, accessed 2026-09-07](https://github.com/peterhaneve/ONIMods/blob/main/AirlockDoor/AirlockDoor.States.cs#L494-L504)). The repository says it was tested against game version U59-737790 ([repository README, accessed 2026-09-07](https://github.com/peterhaneve/ONIMods/blob/main/README.md)).

That source demonstrates the mod-facing grid and mass access used by this mod. It does not establish how the native solver stores mixtures, selects active cells, or advances fluid state.

### Representation limit to preserve honestly

Primary sources found here do not document whether a current ONI cell can internally hold one fluid element or several, how displaced trace gases are scheduled, or how pressure is derived from mass and temperature.
Community descriptions often assert “one element per tile.” This report deliberately does not promote that assertion to engine fact.

For Hive, the relevant insight is independent of ONI's exact representation: mixture fidelity must be chosen from gameplay needs, then made visible and testable.

### Hive proposal

Represent atmosphere in each active room-volume or cell with conserved amounts of a few components: breathable air, smoke, and optionally steam. Derive pressure or “air load” from total amount and volume using one documented game rule.

Do not begin with arbitrary chemical species. A fixed small vector supports actual Hive questions:

- Can smoke rise through the stair opening?
- Does closing a door isolate the bedroom?
- Can a vent reduce smoke at a known rate?
- Does a greenhouse become unsafe or unproductive?

Liquids can remain discrete carried/stored water for the first greenhouse proof. Continuous free-surface liquid flow is a separate feature and should have its own consumer.

If pressure is not yet fun, expose fill fraction and flow direction first. Pressure should arrive with a concrete consequence such as blocked exhaust, a leaking boundary, or a pump threshold.

## 3. Plants, supply chains, pipes, and automation

### Established behavior

Klei's Outbreak release replaced harvest-rating optimization with explicit plant requirements. Plants could require pressure and light or darkness; a plant grew only when all requirements were satisfied. The Farming Overlay showed crop progress and supported batch harvesting ([Klei Outbreak update, 2017-08-24](https://forums.kleientertainment.com/forums/topic/81370-oxygen-not-included-outbreak-upgrade-available-now/)).

The same update added liquid bottlers and emptiers as player control over water sources and a Liquid Aquatuner that cools liquid while emitting heat. Even at that early date, farming, water handling, and heat rejection formed one production chain.

ONI automation was introduced as Boolean sensors, switches, and gates controlling base machinery ([Klei Automation Upgrade video description, 2017-11-16](https://www.youtube.com/watch?v=wRwcg1YW61c)). Klei's preview patch also added a red status icon for unconnected automation buildings and changed liquid/gas shutoff animation to better convey active flow ([Klei Automation preview update, 2017-11-14](https://forums.kleientertainment.com/forums/topic/84213-automation-preview-update-241964/)).

Historical patch notes also show that stored liquids survive building empty/deconstruction as bottles, storage requests react to sublimated contents, and smart storage exposes its logic-output state ([Klei update 252656, 2018-01-28](https://forums.kleientertainment.com/game-updates/oni-alpha/252656-r364/)).

The product lesson is that a plant is a consumer at the end of several visible networks. The interesting failure may be temperature, atmosphere, irrigation, missing delivered material, unavailable labor, or disabled machinery.

### Unknown internal

These sources do not establish current crop tick frequency, delivery-job selection, pipe-packet routing order, or automation evaluation order.

They also do not show that plant checks, logistics, and fluids share one scheduler. That would be an implementation inference.

### Hive proposal

Give one Hive crop a short requirement list with explicit predicates:

- temperature within a broad range;
- smoke below a threshold;
- water reserve above zero;
- one tending interaction per growth stage, if labor is part of the proof.

Let water reach the same reserve by hand delivery first and by a pipe later. This proves that job logistics and infrastructure can serve one domain contract without making the plant know who delivered the water.

For the future hygiene direction, a well, basin, latrine, and greenhouse can share the same water-source and delivery interfaces. Wastewater, contamination, and plumbing can remain later consumers rather than assumptions embedded in the first water model.

Automation should enter only after a manual control exists. A smoke sensor switching a vent is enough to prove sensed state, command state, machine throughput, and visible feedback.

## 4. Overlays and failure feedback

### Established behavior

ONI's learning model is intentionally tool-heavy. A 2023 GDC presentation with Klei CEO Jamie Cheng says the game's complexity made exhaustive tutorials infeasible and undesirable, so Klei focused on tools that help players learn and discover systems ([GDC 2023 slide deck, slides 77–80](https://media.gdcvault.com/gdc2023/Slides/RulesOfTheGame_Rouse_Richard.pdf)).

Jans likewise described a need for helpful UI while preserving natural discovery and the layering of persistent needs ([Game Developer interview, 2017-06-07](https://www.gamedeveloper.com/design/layering-challenges-in-klei-s-survival-sim-i-oxygen-not-included-i-)).

Klei patches repeatedly treat diagnostics as mechanics:

- the Farming Overlay shows progress and enables batch action;
- insulated pipes and vents were colored differently from radiant ones in Plumbing and Ventilation overlays ([Klei update 418018, 2020-06-24](https://forums.kleientertainment.com/game-updates/oni-alpha/418018-r1179/));
- shutoff animations communicate flow and automation buildings report missing wires;
- dig orders reported when nobody had the required role ([Klei update 252656, 2018-01-28](https://forums.kleientertainment.com/game-updates/oni-alpha/252656-r364/)).

### Hive proposal

The first atmosphere proof needs a diagnostic view from day one. It should show room/cell smoke concentration, temperature, connection openings, and current flow direction.

Every stopped consumer should name its first actionable cause: “too smoky,” “too hot,” “no water reserved,” “vent disabled,” or “no reachable worker.” Avoid one generic “blocked” state.

Selecting a vent or plant should show current value, required range, source or sink rate, and the controlling command. This makes failure legible without turning the whole game into a spreadsheet.

Keep the normal view sparse. The overlay is an instrument for diagnosis; ordinary sprites, haze, coughing, wilting, and machine animation should still signal that inspection is needed.

## 5. Active updates, performance, and determinism

### What is established

ONI remains actively maintained. Klei's Steam announcement feed records a March 2026 bug-fix update, the Aquatic Planet Pack and update on 2026-06-11, and follow-up patches through 2026-07-07 ([official Steam announcements, accessed 2026-09-07](https://store.steampowered.com/oldnews/?appgroupname=Oxygen+Not+Included&appids=457140&feed=steam_community_announcements&headlines=0&l=english)).

Klei has publicly treated large-base performance as ongoing product work. Its June 2022 announcement reports significant memory savings on new and late-game saves and reduced frame times for very large bases ([official Steam announcements, 2022-06-09](https://store.steampowered.com/news/posts/?appids=457140&enddate=1657739687&feed=steam_community_announcements)).

Patch history also shows simulation correctness and performance are coupled: fixes altered mass conservation, energy conservation, conduit transfer, high-conductivity stability, UI refresh, and save/load behavior over time.

### What is not established

No primary source found in this bounded study specifies:

- ONI's active-cell or active-world update algorithm;
- which systems are multithreaded;
- a fixed simulation tick contract;
- deterministic replay across runs or machines;
- bit-identical save/load continuation;
- asymptotic cost by cell, agent, network, or world count.

Therefore ONI cannot be cited as evidence that a particular active-set scheme or deterministic scheduler will work for Hive.

### Hive proposal

Hive should make its own contract explicit: same initial state plus same ordered commands produces the same state hashes at agreed tick boundaries on one supported build.

Measure simulation time separately for atmosphere transfer, thermal transfer, path/job work, and rendering. Record active cell/volume counts and changed-edge counts alongside the separate 5/25/50/100-person benchmark planned in the architecture sprint. The current World Lab is a geography experiment, not that actor benchmark.

Save/load validation should compare both visible state and the next several ticks. A save that reloads to the same picture but chooses different transfers or jobs on the next tick has not proved deterministic continuation.

## Three narrow Hive experiments

### Experiment A — upstairs smoke path

Use one scripted smoke source downstairs, one stair opening, one closable upstairs door, and one bedroom volume.

Run fixed commands for a fixed number of ticks with the door open and closed. Record smoke mass by volume, total smoke mass, transfer across the stair edge, temperature, and state hash.

Pass when smoke reaches upstairs only through declared openings, closing the door changes the path, conservation error stays within a documented tolerance, and save/reload produces the same subsequent trace.

This extends the upstairs proof without adding a general fire system.

### Experiment B — sensed vent loop

Add one manual vent with a fixed extraction rate, then attach one smoke-threshold sensor with hysteresis.

Pass when the vent changes the measured decay curve, the automation toggles at declared thresholds without same-tick oscillation, and the overlay identifies both the sensor value and vent state.

This proves environment → sensor → command → machine → environment as one bounded loop.

### Experiment C — single-crop greenhouse chain

Use one crop, one water reserve, one heat source, and the same smoke model. Supply the reserve first by a worker delivery; test a pipe-backed source only after the manual path is stable.

Pass when each violated condition pauses growth with a specific status, recovery resumes from the same accumulated progress, water consumption is accounted for, and tending/supply work remains observable in the existing job system.

This proves horticulture as a consumer of atmosphere, heat, water, and labor without building a broad botany or plumbing simulator.

## Decision boundary for Hive

Adopt ONI's product pattern of coupled, inspectable constraints. Do not claim its undocumented solver as precedent.

The first later environmental proof needs conserved smoke amount, bounded heat exchange, explicit openings, one controllable sink, causal status text, and replayable/saveable state. It does not need realistic pressure waves, arbitrary fluid mixtures, free-surface water, full phase chemistry, or a general automation language.

The result should answer a player question: “Why is the upstairs bedroom or greenhouse failing, and what physical or logistical action fixes it?” If the proof cannot answer that from the normal view plus one overlay, more solver fidelity will not make the system ready.
