# Sebastian Lague: restore the requested terrain foundation

2026-09-08, personal Game CTO source review. Levi supplied the exact
[Procedural Landmass Generation series](https://www.youtube.com/watch?v=wbpMiKiSKm8&list=PLFt_AvWsXl0eBW2EiBtl_sxmDtSgZBxB3)
and reiterated his prior requirement: combine noise layers into terrain height,
then use a sea level. This is an accepted requirement we failed to implement
fully in the current map lab, not a new speculative feature.

The video page was unavailable to the browser reader. These findings come from
the author's actual accompanying source, not a claim to have watched the series.
Eleven files are preserved with URLs/hashes in `source-inventory.json`, from
[Procedural-Landmass-Generation commit e350384](https://github.com/SebLague/Procedural-Landmass-Generation/tree/e350384ce8b59286b522c9546dcd4a34475e4aec).

## What the source actually teaches us

- **Layered noise:** E21 `Noise.cs` combines seeded Perlin octaves; persistence
  scales each layer's amplitude and lacunarity its frequency. Multiple frequencies
  of one noise family already produce fractal-like terrain; using different
  families is an optional design choice, not a prerequisite.
- **Consistent chunk heights:** the same file distinguishes local min/max
  normalization from a global amplitude-based mode. We need the global principle
  so loading a different neighborhood cannot stretch its heights or move the sea.
  Do not copy the tutorial's exact normalization constants as calibrated physics.
- **Height shaping:** `HeightMapGenerator.cs` combines noise with an authored
  height curve and multiplier. This gives deliberate plains/mountains while
  retaining deterministic sample coordinates.
- **Classification follows height:** E14 `MapGenerator.cs` selects configured
  terrain regions from the generated height. It also has an optional falloff map.
  A water-coloured region is still display classification, not a finite water
  simulation or hydrological model.
- **Islands:** `FalloffGenerator.cs` supplies an adjustable edge profile. If used
  here, falloff belongs to a landmass/world definition in global coordinates;
  repeating it independently in each chunk would create artificial borders.
- **LOD and work separation:** `TerrainChunk.cs` requests height data and
  distance-dependent meshes separately; `TerrainGenerator.cs` updates visible
  chunks after meaningful viewer movement. Keep the separation, but retain our
  bounded worker queue, cancellation and cache lifecycle. Its thread-per-request
  helper and indefinitely retained chunk dictionary are tutorial choices, not
  the intended large-world runtime for Hive.

Direct source: [Noise](https://github.com/SebLague/Procedural-Landmass-Generation/blob/e350384ce8b59286b522c9546dcd4a34475e4aec/Proc%20Gen%20E21/Assets/Scripts/Noise.cs),
[height map](https://github.com/SebLague/Procedural-Landmass-Generation/blob/e350384ce8b59286b522c9546dcd4a34475e4aec/Proc%20Gen%20E21/Assets/Scripts/HeightMapGenerator.cs),
[height regions](https://github.com/SebLague/Procedural-Landmass-Generation/blob/e350384ce8b59286b522c9546dcd4a34475e4aec/Proc%20Gen%20E14/Assets/Scripts/MapGenerator.cs),
[chunk/LOD caller](https://github.com/SebLague/Procedural-Landmass-Generation/blob/e350384ce8b59286b522c9546dcd4a34475e4aec/Proc%20Gen%20E21/Assets/Scripts/TerrainChunk.cs).

## Actual Hive gap and recut

`src/world-lab/terrain.js` already layers coherent noise and adds ridge/canyon
shaping. But `sampleTerrain` assigns water by `coastDistance` independently of
the resulting elevation/surfaceLevel. The pinned diagnostic found water labels
at voxel levels 5–25 and land at 10–31. No threshold could reproduce those labels.
The isolated voxel base also contains only soil/stone/air. Neither the lab nor
the first overlay prototype contains physical ocean water.

The next generator candidate must have one versioned definition containing its
seed, layer parameters/height curve, units, quantization and sea datum. Derive
classification from its final physical bed, and derive the coastline from that
height/sea relation. Eliminate the independent water-colour branch. Existing
coast/ridge/canyon landmarks must be checked against the changed geography; their
old names and coordinates cannot be presumed correct after a recipe revision.

```text
rawHeight = layeredNoise(worldSeed, globalXZ, configuredLayers)
shapedHeight = shapeHeight(rawHeight, landmassAndRidgeDefinitions)
bedLevel = quantize(shapedHeight, verticalVoxelSize)
bedMetres = bedLevel * verticalVoxelSize
belowSea = bedMetres < configuredSeaSurfaceMetres
ocean = belowSea AND connectedToDeclaredMarineBoundaryOrBasin
```

For a simple first demonstration all below-datum basins may deliberately be
initialized to that waterline. If so, label that generation policy explicitly.
For our eventual inland lakes, drainage and finite groundwater, distinguish an
ocean-connected region from an isolated depression; below sea level alone does
not imply an underground cave is flooded. Initial water volume follows the
chosen bed/surface/connectivity, then belongs to the fluid state. Future rainfall,
digging, drainage and water use cannot recreate it from a biome/color label.

Retain the original mixed-noise foundation while adding separate climate maps
for moisture/temperature and 3-D density/material rules for caves and strata.
Quantization produces our requested voxel increments; visual mesh interpolation
must not redefine collision, fluid volume or digging geometry. LOD is a bounded
approximation of the same versioned world, never another terrain recipe. Exact
clicked cells use exact sampling; a coarse pixel near a shore may summarize mixed
land/water rather than promising that every fine cell has its centre's label.

The existing drainage atlas remains a **diagnostic of the old sampler**. Its
experimental datum 12 and legacy water-labelled marine boundary roots are not
accepted production sea rules. Preserve that evidence; rerun the atlas against
the corrected candidate through explicit height-derived outlets when ready.

## Further work by this author

The independent Astra source review is retained at
`../drainage/sebastian-lague-reuse-review-20260908.md` with exact commits:
[Procedural Planets](https://github.com/SebLague/Procedural-Planets) contributes
base-layer masks and globe shape composition;
[Hydraulic Erosion](https://github.com/SebLague/Hydraulic-Erosion) contributes
bounded terrain-generation erosion experiments;
[Marching Cubes](https://github.com/SebLague/Marching-Cubes) contributes shared
global density samples and chunk boundary geometry. Marching cubes is a surface
extraction method, not the cave-generation or durable-edit authority. We can use
voxel occupancy from density while preserving the desired stepped art.

No live world recipe, water runtime, backend or current brewing writer changes
are made by this note. Root owns the isolated candidate and source review;
Game Delivery retains tracked integration and publication. Existing source
writers continue while this foundational correction is developed and verified.
