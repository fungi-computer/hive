# Permaculture and living landscapes

Game CTO direction, 2026-09-07. Reviewed planning handoff for Delivery's existing docs/issues; no runtime or release change. This consolidates Levi's food-forest, Andrew Millison, ancient-civilization, and beaver direction. Water, horticulture, and agriculture are central product pillars. Current upstairs delivery continues; these ideas do not silently expand it or displace the accepted brewing follow-on.

## What Levi wants to experience

Plant a particular tree, leave, and return years later to that same tree and the landscape it helped shape. Establish productive gardens that need less routine intervention as they mature. Divert seasonal water, rehabilitate a dry patch, keep a pond, and discover food forests left by ancient civilizations near elven lands. Animals such as beavers should also shape the environment. These changes should create discoverable stories without requiring an LLM to invent the underlying events.

Years means the game's eventually chosen shared calendar, not a requirement to wait ten real years. Present local Save/Continue still restores paused with zero offline advancement. Visible useful changes must start within early play sessions, while maturity and heritage provide longer goals.

## Research that grounds the direction

- **Pennsylvania tree crops:** the likely Hershey reference is John W. Hershey, the Downingtown fruit/nut grower, rather than Milton the chocolate founder. NALT documents surviving twentieth-century plantings and propagation/conservation work. This supports durable orchards and living cultivar provenance; it is not evidence of a maintenance-free ecosystem. [NALT account](https://northamericanlandtrust.org/keeping-the-legacy-of-hershey-trees-alive-at-brinton-run-preserve/).
- **Indigenous forest gardens:** Armstrong and colleagues' 2021 field study compared four British Columbia village complexes and adjacent forests. It found distinctive, diverse managed plant communities persisting more than 150 years after intensive management ceased; the authors also describe conifer encroachment. This verifies a long-lived land-use legacy, not the user's exact unidentified trails anecdote or a claim about every Indigenous culture. [Original paper](https://www.chesapeake.org/stac/wp-content/uploads/2025/06/Armstrong-2021_Historical-Indigenous-Land-Use-Explains-Plant-Functional-Trait-Diversity.pdf).
- **Forest farming:** USDA describes deliberate management of useful understory plants with trees and their local growing conditions. [2024 practice note](https://research.fs.usda.gov/treesearch/68186).
- **Andrew Millison:** exact Sahel video references, inspected OSU interview, and evidence limits are in [the source check](millison-water-source-check.md). The useful design input is the relationship between landform, water routes, access, and layered production. Video identification/description is not a claim of full-video viewing or independent validation of its project outcomes.
- **Beaver restoration:** [the bounded research check](beaver-restoration-source-check.md) distinguishes animal-built dams, human analog structures, local measured benefits, and conditions that limit them. Use it as a later ecological interaction contract, not evidence that any desert can become an oasis.

Earlier distinct references remain in [historical water engineering](historical-water-engineering.md), [ONI follow-up](oni-systems-followup.md), [hygiene/wells](hygiene-wells-and-bathing.md), and [buried utilities](world-voxels-and-utility-view.md). None establishes an already-shipped water solver.

## Biomes can change through play

Levi explicitly wants biomes and the ability to degrade/desertify a landscape by changing its water system. Separate deterministic geographic potential (landform, broad climate, seasonal forcing, substrate) from mutable ecological condition (actual water, soil condition, canopy, species, disturbance, and use). Generation establishes an initial state; it cannot reset that state whenever a chunk loads.

Excessive withdrawal or diversion, canopy removal, and later modeled erosion can make a suitable patch progressively less productive. Recovery requires sufficient source water, viable soil and planting material, and time. Wetlands, woodland patches, and degraded scrub should follow accumulated conditions. Classify visible biome/ecosystem state with persistence or hysteresis so it does not flicker with a rain shower. Keep transitional mosaics rather than drawing a hard magical border.

Local degradation is not an automatic rewrite of continental rainfall: rainfall feedback and large-scale climate change remain a separate later model if selected. Generated moisture is a climate/suitability signal, not the mutable soil-water stock. Coarse map/globe tiles should combine the common geographic generator with versioned aggregates of persistent player-caused changes, refreshing affected areas without generating every fine tile or revealing unexplored state to the player's maps.

## Homesteading closes material and heat loops

The [homestead source check](homestead-heat-and-compost-source-check.md) covers real compost hotbeds, root-medium separation, finite decomposition heat, and poultry ventilation. A later prototype can reuse household/farm waste and bedding as actual compost inputs, with water and aeration affecting decomposition. Heat goes through the same environmental owner as sunlight, fires, buildings, and greenhouse openings; a crop responds to local root conditions. Mature compost is a physical later output.

An adjacent coop can contribute heat and materials, but "next to greenhouse" grants no unexplained warmth or fertilizer. Shared walls exchange heat according to their modeled boundary; open air paths also carry the modeled moisture and contaminants. The initial design need only prove one small hotbed. Coop/greenhouse heat adequacy is a later measured layout question, not an assured substitute for all winter heating.

## Small rules that create the landscape

1. **Water has a route and a balance.** Rain or upstream inflow supplies a finite quantity. Ground height, channels, embankments, obstructions, and outlets determine where it moves or collects. Infiltration transfers water into soil; percolation and groundwater exchange are distinct later terms. Crops, brewing, households, animals, evaporation, and downstream flow must draw from the same accounted stores.
2. **Soil and shade change suitability.** Species definitions provide growth requirements, tolerance, mature footprint, harvest, and reproduction capabilities. Actual local moisture, light, and other selected conditions determine results. A tree can shelter an understory plant and compete with it for water; no blanket "near a tree = bonus" rule.
3. **Organisms retain identity.** Age, development, seasonal reproduction, and damage are separate facts. Seedlings mature without receiving a new identity. Seeds, clones, grafts, and harvested goods preserve the provenance required by learning and trade. Grafting does not erase the rootstock's original history.
4. **People and animals change the same physical world.** Player work can dig, plant, mulch, prune, or maintain a route when those activities are implemented. A beaver's local behavior can select a suitable reach, obtain material, construct, and maintain a permeable dam. Both alter shared water conditions; neither gets a private water counter or a scripted permanent green circle.
5. **Established systems reduce routine work.** Gardening decisions concern placement, establishment, harvesting, and responding to changing conditions. Work settings and ordinary jobs handle repeat labor. Plant stress should be legible and offer time to react. Needs thresholds require hysteresis so a bed does not continuously alternate between requesting and canceling work.

A wetland can receive groundwater, replenish it, or do both depending on conditions; retaining surface water does not inherently create aquifer recharge. Keep visible pond water, unsaturated soil moisture, and saturated groundwater conceptually separate. A modest coupled reservoir/flow model can make these differences playable without resolving every pore or running full CFD. [USGS wetland hydrology](https://water.usgs.gov/nwsum/WSP2425/hydrology.html).

For a later first model, choose explicit soil storage/capacity and permeability, surface elevation, and a bounded shallow-groundwater representation if the well/spring caller needs it. Surface transfer uses level/head and openings; subsurface transfer needs a documented hydraulic-head/storage relationship. Name rainfall, boundary inflow, evapotranspiration, withdrawal, overflow, and other included terms. Limit the sum of simultaneous outgoing transfers to available stock. Do not debit the same volume once in a fine cell and again in a coarse region.

Effects are conditional. More infiltration can reduce immediate runoff; retention can increase plant use or evaporation. Too much standing water can harm unsuitable plants. Vegetation can improve selected soil properties but also consumes water. Suitable terrain, source water, soil, and maintenance must earn restoration. Do not turn this into a universal "more dams/trees means more total water" formula.

Players need to read the cause. A water overlay can show actual flow direction, standing depth, soil moisture, and the selected route's source/outlet; a plant inspector can explain its limiting condition. Keep groundwater as a separate layer when it exists. Building preview may show a clearly labeled prediction, while the running overlay reports authoritative results. Start with one legible lens and contextual explanation instead of requiring a screen full of meters. Seasonal/age appearance and retained observations should make improvement visible without inspecting numbers constantly.

## Ancient food forests as discoverable history

Generate bounded heritage features as part of the same world: an old watercourse, surviving terraces, useful tree/shrub clusters, particular cultivars, and traces of a settlement. Ancient societies near elves can have developed these systems themselves or exchanged knowledge with neighbors; history determines provenance rather than an elf-only crop multiplier.

The initial feature can be authored/generated as a consistent mature starting state with a recorded origin. We need not run centuries of simulation to create each ruin. From materialization onward, player and environmental changes persist. Feature ownership and stable IDs must survive chunk crossing without duplicated plants or structures.

Let the player discover the function by observing it: a cracked spillway still feeds a patch; shade-adapted plants cluster below an old canopy; living grafts produce an unusual fruit. Field-guide observations, physical specimens, books, and teaching can recover and spread techniques. A forgotten orchard is simultaneously food, planting material, knowledge, a place to settle, and evidence of history.

Example future story, not a promised scripted chain: a family repairs an old diversion near a ruined settlement. A neglected garden becomes productive. Beavers later raise the nearby water level; the mushroom patch benefits while a path floods. A neighbor wants the dam opened for downstream supply. The player negotiates, installs an outlet, relocates a crop, or removes the obstruction. World facts cause the situation; a familiar or storyteller may explain witnessed facts with its normal permissions.

## Architecture and performance commitments

Levi's latest explicit lifecycle requirement is tree growth, death/fall, dead logs hosting mushrooms, and eventual decomposition. Share small processes across suitable entities rather than imposing one universal living/dying/rotting enum on everything. A fungal colony is an organism using a physical substrate; the log's decay state and the colony's growth/reproduction state are independent. Material transformations retain identity/provenance, with new part IDs only when actually splitting an object. Reserved, carried, and stored material cannot disappear through a background decay callback without the resource owner also settling claims, jobs, and persistence. Detailed source-anchored composition guidance is in [the lifecycle contract](lifecycle-composition-contract.md).

The [reviewed perennial source check](perennial-world-architecture-check.md) records current capabilities and gaps with immediate callers. Mugwort already proves IDs, typed work, physical output, and persistence. Its elapsed-tick stage function and full herb scan are deliberately small-map behavior, not the large-world vegetation architecture.

- Use spatially bounded plant/patch queries and one owner for cross-border organisms, water stores, and transfers. Water topology must cross chunks independently of what the camera displays.
- Keep visual wind, leaves, and ripples in rendering. They cannot advance growth, duplicate water, or make unloaded biology disappear.
- Advance stable vegetation over meaningful intervals; revisit affected patches when inputs change. Hydrology with changing coupled inputs still requires bounded numerical steps. Measure active water cells and ecological work separately from draw calls and actor assignment.
- Persist state and a processed-through cursor before eviction. Catch-up uses ordered historical condition changes, never elapsed time multiplied by today's growth rate. Unavailable neighbor/history data defers completion instead of inventing an outcome.
- Prove equivalence for the selected discrete model under different update budgets and residency order. If coarse far-field approximations are later used, define measurable error limits and preserve conservation; do not claim exactness without evidence.
- Use authored species and supported process definitions for content. New physiological behavior still needs a typed owner and a real consumer. No ECS/framework/service migration follows merely from this note.

## Later proof order

Keep these as separate small outcomes, not one enormous ecology release:

1. A finite source and lawful carried/constructed route supply an actual consumer, with overflow, interruption, and save conservation.
2. A small slope/channel/soil fixture proves that route and soil change infiltration and downstream supply. Add a shallow well/spring consumer only when validating groundwater exchange itself.
3. One persistent tree and understory patch prove condition-driven growth, observable shade, ordinary work, and compressed game-year save/unload/return against an uninterrupted reference. Include a mid-gap drought or diversion so history matters.
4. One animal-built dam on a suitable stream proves the same water route, finite construction material, maintenance/breach, and habitat/land-use tradeoff. Compare a no-dam reference under identical forcing, including a dry/no-inflow case.
5. A bounded ancient garden feature combines already-proved plants, routes, and knowledge provenance. World Lab can preview distribution/identity at scale while the playable map stays small until the loop is enjoyable.

The lifecycle lane earns its own small fallen-log → fungal growth → harvest/spent-substrate outcome after a real environmental/material consumer exists. A compost hotbed separately proves that same decomposition process can supply heat. Neither requires all animal needs, all biomes, full chemical reactions, or a whole food forest in its first candidate.

Delivery owns association with existing worldgen #4, clock/offline #5, performance #6, water #10, horticulture #14, knowledge/controller #17, and animals #18. Reuse existing issue ownership and docs rather than opening a parallel management framework. Source proof of current upstairs work remains independent.
