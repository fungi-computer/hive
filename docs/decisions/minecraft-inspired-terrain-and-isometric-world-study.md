# Terrain study: recognizable landforms, living caves and readable volume

Game CTO synthesis, 2026-09-08. Research and design direction; no new runtime, art, dependency, proof, world-size permission or deployment claim. This supplements the existing world-generation, mapping/LOD, vertical-topology and living-world decisions. The current controls/maps sprint retains priority. Delivery owns tracked publication and subsequent file custody.

## Decision

Build one versioned generator with separately owned **regional geography, volumetric geology/caves, bounded landmarks, initial habitat and world-state initialization**. Derive the isometric presentation from that geometry using our original Three → low-resolution bake → Pixi pipeline. A canyon should be a recognizable place with travel, shelter, water and cultivation consequences. A cave should offer an ecology and a reason to return. More noise octaves alone do not provide either.

The intended first result is a small inspectable terrain study beside World Lab, with a quiet buildable area, ridge, cliff, riverbank, cave entrance and underground section. Improving terrain quality does not require moving the live clearing into a large world or finishing every fluid/ecology system first.

## What the references establish

| Reference                  | Useful finding                                                                                                                                    | Limit of the evidence                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Minecraft Java 1.18        | Terrain shape and biome identity are separate; large chambers, winding tunnels, aquifers and cave biomes make underground space varied.           | This study does not recover Mojang's exact numerical recipe or establish Hive performance.                                 |
| Minecraft Java 1.18.2      | Documented density-function registry, routing and spline configuration demonstrate composable terrain fields.                                     | This public configuration API is documented after initial 1.18; no full graph editor or external DSL is required for Hive. |
| Geological Landforms       | A canyon recipe combines deliberate bank shape, orientation and seeded irregularity. Elevation, fertility, caves and roofs have distinct outputs. | Actual callers sample planar RimWorld grids, not stacked diggable volume.                                                  |
| Biome Transitions          | Habitat can vary across a local map independently of landform shape.                                                                              | This is not evidence of simulated climate change, water or erosion.                                                        |
| Biomes! Caverns            | Underground habitat has useful food, light, cultivation, material and hazard roles.                                                               | Its content does not establish a general ecosystem or hydrology solver.                                                    |
| OpenRCT2 / OpenTTD / Tiled | Legal slope geometry, exposed edges, material transitions and clipping make isometric terrain legible.                                            | A single height surface cannot represent every overhang and cave.                                                          |

Primary sources: [Java 1.18 release](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java), [1.18.2 release](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-18-2), [spline prerelease notes](https://www.minecraft.net/en-us/article/minecraft-1-18-2-pre-release-2), [Geological Landforms author](https://github.com/m00nl1ght-dev/GeologicalLandforms), [Caverns author description](https://steamcommunity.com/sharedfiles/filedetails/?id=2969748433), [Caverns plant definitions explained](https://github.com/biomes-team/BiomesCaverns/wiki/Plants). These are source/design studies, not mod installations or claims of current cross-mod compatibility. Kniberg's original terrain video was located but not watched/transcribed; no missing detail is filled with an unofficial quotation.

The particularly useful mod match for Levi is **Geological Landforms**, with **Biome Transitions** and **Biomes! Caverns** alongside it. Its author explicitly separates landforms from biomes. In the [pinned canyon recipe](https://github.com/m00nl1ght-dev/GeologicalLandforms/blob/e8035e2b2fdb46ceb92aa159e17e72fdc5dcc421/1.6/Landforms-v1/LandformCanyon.xml), left/right linear fields, a maximum operation, seeded rotation and Perlin detail establish a recognizable corridor. Hive should implement original shape operators and definitions; this is inspiration, not a code or asset port.

## Actual Hive starting point

At this read, `src/world-lab/terrain.js` uses smooth interpolation of hashed lattice values: **value noise**, not gradient Perlin noise. Six fixed-amplitude scales are filtered by the map footprint. Global signed coordinates, versioned identity and bounded local chunk caching are useful existing foundations.

The present coast and ridge are authored analytic scaffolds. `ridgeDistance` determines a feature/category but does **not** enter the elevation equation. Consequently, the named ridge does not yet promise ridge geometry. Water is a terrain category derived from coast distance, not drainage or flowing water. These are appropriate limitations for the first map contract; the next landform packet must make its shape fields alter actual geometry.

Current output is normalized elevation/moisture and categories. There is no generated solid/void volume, subterranean habitat or terrain renderer established by those arrays. Preserve the distinction between an exact full-detail cell query and an approximate overview pixel. A broad biome label is initial classification; irrigation, soil depletion and vegetation changes later belong to persisted world state.

## Composition and mutation ownership

The following is proposed Hive design, not Minecraft source or a new framework to install.

| Owner                 | Narrow responsibility                                                             | Important boundary                                                                                 |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Geography recipe      | Seeded land mass, regional relief, climate potential, landform identity and shape | Coordinates are global; chunks cache parts of a place rather than inventing places at their edges. |
| Geology/volume recipe | Solid/void, strata, cave families and substrate                                   | A surface approximation is not an authoritative collision volume.                                  |
| Feature placement     | Stable geode/vein/entrance/landmark identities and deterministic overlap rules    | A feature intersecting three chunks still has one identity.                                        |
| World initialization  | Initial materials, finite water and eligible ecological instances                 | Runs once for authoritative state; reload never refills water or regrows harvested resources.      |
| Persistent world      | Excavation, construction, resources, organisms and accepted simulation changes    | Generator upgrades do not reinterpret player edits silently.                                       |
| Geometry queries      | Surfaces, clearance, exposed faces and volume adjacency                           | Navigation, picking and rendering consume the same geometry contract.                              |
| Presentation          | Original baked parts, depth ordering, cutaway, map summaries                      | Visibility cannot mutate support, collision, water or discovery.                                   |

Illustrative interfaces, with omitted storage/error details rather than a proposed implementation checklist:

```ts
// Recipes are validated/bound once and retained by exact versioned identity.

function generateBase(recipe: BoundRecipe, request: VolumeRequest): BaseVolume {
  const columns = geography.sampleColumns(recipe, request.xzBounds);
  const solid = geology.materialize(recipe, columns, request.xyzBounds);
  const candidates = features.overlapping(recipe, request.xyzBounds);
  return features.applyInStableOrder(solid, candidates);
}

async function loadRegion(key: RegionKey): Promise<WorldRegion> {
  const saved = await persistence.read(key);
  const identity = saved?.baseIdentity ?? world.recipeIdentity;
  const recipe = recipes.require(identity); // fail explicitly if unavailable
  const base = generateBase(recipe, requestFor(key));
  // Persistent state already initialized? Restore it; do not seed it again.
  return saved
    ? persistence.restoreAgainst(base, saved)
    : world.initializeOnce(key, base);
}

const surfaces = geometry.walkableSurfaces(world, bodyProfile);
const drawParts = geometry.visibleFaces(world, viewSlice);
const atlasRecipe = recipes.require(world.recipeIdentity);
const atlas = geography.sampleFootprints(atlasRecipe, mapRequest);
```

Initialization requires idempotent persistent ownership, including feature/ecology identities. The sketch is not a claim that a browser function alone makes concurrent server initialization safe. Chunks may be regenerated from their pinned base recipe; changed physical state must be restored or deliberately initialized, never guessed from residency.

Content definitions choose supported shape families, curves, scales, strata and habitat requirements. Validate once and bind the small composition. Add a typed primitive only for an actual new behavior. Do not begin with arbitrary saved callbacks, a universal optional-field entity or a node-editor project.

## Surface, caves and water should fit together

Use authored landform profiles plus restrained seeded variation: canyon banks around a regional centerline, ridge elevation around a crest, flatter terraces where the recipe promises them. Regional drainage needs its own coherent connectivity; a blue noise mask or a field named erosion is not a river network or physical erosion solver. A canyon may cross many chunks, so its regional identity and continuity cannot depend on a fixed small neighborhood by accident.

A height field `H(x,z)` answers one surface height. A volumetric density field `D(x,y,z)` can represent rock above and below empty passages. One possible prototype is a vertical terrain bias plus 3D relief, with separate chamber and tunnel masks. Intersecting narrow bands of two independent fields can produce tube-like passages; a single near-zero band tends toward sheets. These are candidate mathematics, not guarantees of connection, body clearance or visually useful caves. Intended entrances and travel destinations need explicit checks.

Minecraft's geodes suggest bounded deposits with internal structure and productive sites worth revisiting. Geodes arrived in Java 1.17; the large terrain/cave overhaul followed in 1.18. Its immovable budding amethyst deliberately gives players a reason to return. Hive can use an original crystal substrate, finite harvest and ordinary growth lifecycle to connect exploration, ingredient knowledge, maps and home crafting. [Developer explanation](https://www.minecraft.net/en-us/article/taking-inventory--amethyst-shard), [Bedrock geode schema](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/featuresreference/examples/features/minecraftgeode_feature?view=minecraft-bedrock-stable). The Bedrock schema is not claimed to be Java's implementation.

Generated aquifers supply initial local water levels; they do not solve our finite water simulation. Initialize wet volumes with coherent barriers and explicit sources, then hand them to the existing planned fluid owner. Excavating a connection wakes that owner; it does not regenerate a lake. First physical water evidence should be a finite pool redistributing through one opened passage, with conservation and save/reload. Neither a cave picture nor a water-level field proves that. [Mojang aquifer description](https://www.minecraft.net/en-us/article/minecraft-snapshot-21w06a).

Subterranean organisms should compose the same light, temperature, moisture, substrate, yield and lifecycle mechanisms as surface plants. Species can provide food, illumination, medicine or craft materials through definitions. Climate influences eligibility, while actual local state governs survival. This lets a wet cave, an irrigated canyon and a food forest share ecological mechanisms without making biome names runtime authorities.

## Isometric volume needs readable geometry

OpenRCT2's [surface edge painter](https://github.com/OpenRCT2/OpenRCT2/blob/092783cc1160be24f2acbed023217558bdb1f41a/src/openrct2/paint/tile_element/Paint.Surface.cpp#L448-L638) compares both endpoints of an edge with its neighbor, suppresses hidden faces and treats clipped views explicitly. That supports the earlier depth/contact decision: a raised surface has extent, not merely a single sorting point. OpenTTD's [slope definitions](https://github.com/OpenTTD/OpenTTD/blob/de306de89347fb2435028d25b72a831551d3607c/src/slope_type.h#L36-L89) and [terrain generation](https://github.com/OpenTTD/OpenTTD/blob/de306de89347fb2435028d25b72a831551d3607c/src/tgp.cpp) show why raw height samples need a legal surface model.

For Hive, derive exposed top/side/underside parts from known neighboring geometry. Cutaway reveals caps and interiors while leaving physical terrain intact. An unresident neighbor is unknown, not automatically air or a fluid outlet. Do not copy a complete-map renderer's missing-neighbor assumption into streaming authority.

Bake a small original vocabulary of grass/soil/rock surfaces, slope edges and cave lips. Layer cosmetic variation instead of multiplying every slope by every biome, moisture level and season; [Tiled's edge/corner terrain masks](https://docs.mapeditor.org/en/stable/manual/terrain/) are a useful transition precedent. Keep foliage and landmarks distinct where depth requires it. A whole raised chunk flattened into one sprite would prevent actors interleaving with its ledges; cache only parts compatible with the established depth owner.

The walking-storey datum remains **2.16 geometry units**. It is not automatically one excavation voxel, one metre or a fixed number of dig steps. Before a production volume/save format, settle the existing 2/3/4-step-per-storey candidates against actor clearance, shallow pipe burial, stairs and readable slopes. An isolated study may use a declared experimental metric without committing the live format. Natural rock stability is a separate policy from built roof/floor support and collapse.

## Performance contract

- Reuse horizontal geography per column when resolving a vertical brick. A proposed 16³ brick has 4,096 cells but 256 horizontal columns. That can avoid repeating the horizontal portion 16 times; it is not a 16× total speed claim. A uint16 material array alone is 8 KiB; other fields, halos, queues and scratch memory count separately.
- Materialize requested vertical bands and sparse sections. Eight empty corner samples do not prove an entire brick empty: a thin cave or feature can pass inside. Use valid conservative bounds or sample the needed region.
- Keep one bounded Worker/request lifecycle from the accepted map sprint. Request epochs prevent stale commits; bounded resumable tasks permit cancellation before a huge request finishes. Limit in-flight work, transferred buffers, resident results and scratch storage explicitly.
- Bounded features declare maximum reach and canonical anchor identity; larger landforms use a regional record/field. Opposite chunk request order must produce identical cells and feature IDs, including negative coordinates. Overlap precedence must be stable.
- Cache derived geometry by relevant world and neighbor revisions. A boundary edit invalidates affected neighboring faces/topology. Dynamic actor reservations stay separate from static geometry.
- The globe/atlas asks for coarse geography, not all underground cells. Approximation error near nonlinear thresholds must be visible; exact inspection requests exact cells. Discovery remains a separate player-owned projection.
- Measure sampling, volume/features, buffer assembly, geometry extraction, upload/draw and peak resident bytes separately. Generation visibility, active simulation and offline evolution retain separate budgets. Minecraft's render/simulation-distance split is a useful precedent, not fulfillment of Hive's always-alive world requirement.

No capacity, frame rate, benchmark speedup or planet-size guarantee comes from this research.

## Delivery sequence and useful exits

1. **Finish the active controls and map-navigation packets.** This research adds no gate to them, the small actual-clearing minimap, or the accepted bed/work corrections.
2. **Make landforms real in World Lab.** After its current owner checkpoint, add a few composable shape/climate channels so ridge/canyon identity affects geometry. Show the component fields and fixed named seeds, coarse/local comparisons, signed seams and measured work. Keep familiar calm building space alongside dramatic features.
3. **Produce one isolated original isometric terrain section.** A small region plus halo shows flats, slope, bank, cliff, overhang, entrance, two separated underground passages and one geode. Include side-section/cutaway controls and seed/layer diagnostics. Astra reviews changed original art at native and game scale, with people above/below/behind surfaces and matching picking. A dry/wet initialization view is labeled as such; live fluids are not implied.
4. **Before live terrain expansion, prove durable change.** Edit/excavate a bounded region, evict and revisit, retain resource depletion and feature identity, and validate any promised entrance/clearance. Actual finite-water flow gets its own small conservation outcome when that owner exists. This extends the accepted durable-edit packet rather than creating a second world authority.

Mojang's developers describe maps of generation fields, density overlays, side profiles and switches for caves/aquifers as important development tools. Adopt that inspection loop: named seeds, component visibility and readable failures make tuning much faster than staring at one composite image. [Caves & Cliffs developer Q&A](https://www.minecraft.net/en-us/article/caves---cliffs-update--part-ii-dev-q-a).

The eventual game payoff is a comprehensible journey: discover a canyon shelter or living cave, learn its useful materials and hazards, bring something home, and change the place through construction, cultivation or water management. Terrain supplies opportunities to our shared systems; it should not introduce a separate cave inventory, plant lifecycle, hauling path or navigation engine.

## Evidence and custody

Supporting ignored source studies: `minecraft-surface-generation-study.md`, `minecraft-caves-geodes-study.md`, `rimworld-landforms-caverns-study.md`, `isometric-terrain-generation-study.md`, all under `.botanical/research/`. Geological Landforms source pin: `e8035e2b2fdb46ceb92aa159e17e72fdc5dcc421`; OpenRCT2 pin: `092783cc1160be24f2acbed023217558bdb1f41a`; OpenTTD pin: `de306de89347fb2435028d25b72a831551d3607c`. Technical findings use author documentation/source; no game binary, art asset or mod was installed/copied into Hive.

Delivery may publish this accepted synthesis under `docs/decisions/minecraft-inspired-terrain-and-isometric-world-study.md`, link the existing world-generation/mapping decisions and issue #4, and retain supporting drafts as evidence. No parallel tracked writer, new PM tier or automatic live-world expansion is created by this handoff.
