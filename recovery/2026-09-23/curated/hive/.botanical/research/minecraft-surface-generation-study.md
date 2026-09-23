# Minecraft surface generation: bounded primary-source study

Research date: 2026-09-08. Planning evidence only; no runtime, assets, dependencies, build, proof, Git, or deploy changes. Caves/geodes and isometric rendering have separate readers.

The useful lesson is an inspectable composition of geography, climate, density, surface material, and feature placement. A large world does not require either one enormous height map or one noise function per biome. The claims below distinguish the shipped Java 1.18 release, the later 1.18.2 configuration API, and later Bedrock documentation. Proposed Hive mechanisms are recommendations, not assertions about Mojang internals.

## 1. Terrain shape and biome identity should be separate outputs

**Verified, Java 1.18:** the release notes explicitly separate terrain elevation/shape from biome identity and merge former shape-specific biome variants. Forests and deserts can occupy hills without separate hill biome types. The same release makes initial spawn selection depend on climate parameters. [Official 1.18 release](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java), World generation and Changes sections.

**Hive implication:** compute landform and climate facts first; use their combination to choose initial ecological conditions and eligible content. Do not make `biome === "forest"` secretly own the height function, water storage, plant growth, and animal population. A dry woodland hillside and a wet woodland valley can share species rules while differing in soil moisture, slope, and access. Later player-caused desertification changes persisted soil/water/vegetation facts; it must not rewrite the seed or run initial generation again.

## 2. Named multiscale fields are a useful design vocabulary; exact Mojang tables remain unverified here

**Verified, later official Bedrock overview:** seeded gradient-noise terrain is followed by biome decisions that consider elevation, temperature, humidity, erosion, and weirdness. Subsequent passes place structures and distributed features. This is a high-level Bedrock account, not an exact Java 1.18 call graph. [Microsoft World Generation Overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/world-generation?view=minecraft-bedrock-stable), updated 2025-11-11.

**Proposed Hive vocabulary, not a recovered Minecraft implementation:**

| Field                              | Intended design responsibility                                  | What it does not establish                                             |
| ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Continentalness / land mass        | Broad ocean, coast, inland tendency                             | Literal distance to a coast unless we explicitly compute that distance |
| Erosion / relief                   | Broad tendency toward smoother low relief versus rugged terrain | Runtime hydraulic erosion, soil transport, or groundwater conservation |
| Peaks and valleys / ridge field    | Connected ridges, valleys, and local landform variation         | A complete drainage network                                            |
| Temperature and moisture potential | Initial climate envelope used with elevation/exposure           | Current weather or current soil moisture                               |
| Fine terrain detail                | Local roughness within the chosen landform                      | Permission to move the coastline at every zoom level                   |

Each field should have a stable seed channel, coordinate scale, amplitude, and inspectable output. Combine fields through authored remapping rather than multiplying unrelated random numbers until a screenshot looks interesting. We have not independently verified the exact Java 1.18 continentalness/erosion/weirdness thresholds, peaks-and-valleys transform, nested spline coefficients, or complete climate lookup dimensionality. Those details are unnecessary to choose these Hive responsibilities.

The original developer sources are located: [Henrik Kniberg, Minecraft terrain generation in a nutshell](https://www.youtube.com/watch?v=CSa5O6knuwI) and [Kniberg's Jfokus 2022 presentation](https://www.jfokus.se/jfokus22/talks/913), which links [the conference recording](https://www.youtube.com/watch?v=ob3VwY4JyzE). The first video's published chapters identify terrain shaping at 13:04, 3D noise at 17:37, and biomes at 21:27. They are recommended references, **not watched/transcribed evidence from this study**: direct access returned a YouTube login gate. No unofficial summary is used to fill that gap.

## 3. Density and spline composition are supported precedents, with a version boundary

**Verified, Java 1.18.2:** Mojang documents a density-function registry and `noise_router` that connects configurable generation to existing code. The 1.18.2 prerelease notes explicitly introduce a general cubic-spline density function. These are public configuration capabilities documented after initial 1.18; this study does not backdate that API or claim the earlier implementation lacked internal splines. [Official 1.18.2 release](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-18-2), Configurable caves; [official 1.18.2 prerelease 2/3 notes](https://www.minecraft.net/en-us/article/minecraft-1-18-2-pre-release-2).

**Hive implication:** use a small pure field composition that can grow from surface terrain into signed vertical space. A height approximation remains useful for maps, candidate bounds, and ordinary surface generation; a density query answers whether a particular volume is solid. That distinction leaves room for overhangs, excavation, and multiple walkable surfaces. It does not require evaluating every vertical cell to draw an atlas.

Illustrative Hive pseudocode, deliberately not Minecraft code or a numerical recipe:

```ts
const geography = sampleGeography(recipe, worldXZ);
const shape = remapLandform(recipe.landformCurves, geography);
const climate = sampleClimate(recipe, worldXZ, shape.elevation);

// Evaluated for requested local volumes, not the whole atlas volume.
const solidDensity =
  shape.verticalBias(worldY) + sampleLocalRelief(recipe, worldXYZ, shape);

const initialHabitat = classifyHabitat(climate, shape);
const baseCell = materializeCell(solidDensity, initialHabitat, worldXYZ);
const actualCell = applyPersistedEdits(baseCell, worldCellEdits);
```

Curves and masks can be configuration, but arbitrary function execution, recursive user graphs, and an editor framework are not prerequisites. Validate identifiers and bounds once; compile or prebind the small recipe; expose named channels for visual inspection. Preserve one owner of final world facts.

## 4. Large visibility and large active simulation are different budgets

**Verified, Java 1.18:** render distance can exceed simulation distance; entity, block, and fluid updates stop outside the latter. World generation uses background tasks, and JFR measures individual generation stages separately from ticks and initial world loading. Chunk-section rendering also has explicit threaded/blocking tradeoffs. [Official 1.18 release](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java), Simulation Distance, JFR, Background threads, and Chunk Builder sections.

**Hive implication:** keep geography sampling, decoded terrain residency, sprite residency, and active simulation as separate concerns. A displayed mountain is not automatically a ticking colony. Unlike Minecraft's stated distance rule, Hive's eventual always-alive settlements need deliberate scheduled/offline progression; this study does not treat freezing distant simulation as satisfying Levi's offline-world direction.

For World Lab, first measure field sampling, density materialization, buffer assembly, main-thread commit, and draw separately. A bounded Worker can generate nearby requests and discard obsolete responses by request identity. Never substitute a large worker count for cancellation or memory limits. No Minecraft throughput figures, Hive speedups, viable planet size, or browser frame budget are claimed by this desk study.

## 5. Coarse maps should ask a cheaper question of the same world

**Verified, later Java example:** the 1.21.9 release documents replacing an approximate-surface density scan field with a 2D preliminary surface field. Its `find_top_surface` operator scans within bounds and recommends a close conservative upper bound for performance. This is a later API example, **not evidence that initial 1.18 used this exact optimization**. [Official Java 1.21.9 release notes](https://feedback.minecraft.net/hc/en-us/articles/39966147272589-Minecraft-Java-Edition-1-21-9-The-Copper-Age), World Generation / Density Functions.

**Hive implication:** an atlas/globe samples broad geography at a pixel footprint; the local view resolves finer shape and requested volume. Share seed, named coordinate fields, and landform rules, while permitting a documented approximation for small features. The atlas should not query all caves or allocate all world cells. A coarse image cannot honestly promise every beach, overhang, or cave entrance is exact.

Current `src/world-lab/terrain.js` already has signed global sampling, a generator identity, footprint-aware octave omission, a 16-cell chunk key, and a 25-chunk local residency bound. Its noise is smooth interpolation of hashed lattice **values**, not gradient Perlin noise. Its coastline and ridge use explicit sinusoidal scaffolds plus noise; this is a useful seam/LOD fixture, not a Minecraft-like climate/landform generator. `sampleTerrain` returns normalized elevation/moisture and terrain categories, not voxel density or a living biome. Retain that honest boundary while adding fields.

LOD needs its own error contract. Reducing high-frequency samples does not guarantee classification stability near thresholds or after nonlinear remapping. Keep broad coastline/ridge identity stable, treat footprint bands as display coverage, and compare coarse predictions with local samples. If a decision needs exact cells, request those cells rather than allowing a coarse map to grant gameplay authority.

## 6. Generation composition must survive chunk order and recipe changes

**Verified precedents:** official Bedrock documentation describes configurable feature distribution/placement passes. Java 1.18 describes blending old and new terrain and stores blending information in chunks. Java 1.18.2 exposes configured structures and registry tags. These establish useful extension and migration precedents; they do not provide Hive's ownership or persistence implementation. [Bedrock overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/world-generation?view=minecraft-bedrock-stable), Feature pass / Putting it all together; [Java 1.18](https://www.minecraft.net/en-us/article/caves---cliffs--part-ii-out-today-java), Upgrading old worlds; [Java 1.18.2](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-18-2), Configured Structures / Universal tags.

**Hive implication:** generate immutable base facts from a pinned recipe, then apply authoritative edits. Give cross-boundary features stable world-coordinate identity and a bounded ownership/halo rule. A tree or ruin must not duplicate or disappear because adjacent chunks load in the opposite order. Keep feature placement eligibility separate from an object's later lifecycle: spawning a plant is not the ongoing plant simulation.

Never silently swap the recipe beneath a persisted world. Version the recipe and its schema, retain the old recipe or materialized base when necessary, and make any transition a deliberate migration. Blending is a later aesthetic policy; preserving player construction, excavation, inventories, and water is the earlier correctness requirement.

## Small next outcome for Hive

Keep this in the independent World Lab lane while controls, beds, and work settle. Extend the current sampler with inspectable climate/landform channels and a few authored remapping curves; compare a fixed set of ocean/coast/plain/ridge/valley sites at coarse and local resolution. Keep voxel density as a narrow local section preview when that view is actually ready, not a prerequisite for improving the atlas.

Useful exit evidence: unchanged seed/version gives identical exact-cell values across chunk traversal order; negative-boundary seams agree; a named coastline/ridge remains identifiable under zoom; newly introduced fields are visible separately; actual phase timings and peak resident bytes are reported; obsolete work cannot replace a newer view. Show where coarse and fine classifications disagree instead of hiding it. A pretty large map still does not prove playable streaming, multi-level movement, world edits after eviction, hydrology, or server capacity.

The study intentionally leaves exact Mojang spline internals, current-version parity, hydraulic erosion, groundwater simulation, and planet dimensions unresolved. No game source, game assets, or server jars were downloaded.
