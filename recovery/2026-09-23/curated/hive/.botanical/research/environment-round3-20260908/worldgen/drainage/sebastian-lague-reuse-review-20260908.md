# Sebastian Lague reuse review — bounded worldgen follow-up

Read 2026-09-08. This is source research only. It preserves the existing atlas/evidence and proposes no integration, terrain rewrite, production sea authority, water/gas stock, or cave runtime.

## Pinned primary sources

- Hydraulic Erosion, commit [`f245576`](https://github.com/SebLague/Hydraulic-Erosion/tree/f245576d204978e3186f41c8abbd75c326c6857e): [CPU droplet/brush implementation](https://github.com/SebLague/Hydraulic-Erosion/blob/f245576d204978e3186f41c8abbd75c326c6857e/Assets/Scripts/Erosion.cs), [GPU variant](https://github.com/SebLague/Hydraulic-Erosion/blob/f245576d204978e3186f41c8abbd75c326c6857e/Assets/Scripts/ComputeShaders/Erosion.compute), and [README/video link](https://github.com/SebLague/Hydraulic-Erosion/blob/f245576d204978e3186f41c8abbd75c326c6857e/README.md).
- Procedural Planets, commit [`6b55142`](https://github.com/SebLague/Procedural-Planets/tree/6b551429541d988e00ca9e509450e51e1f2f6f12): [layered shape evaluation](https://github.com/SebLague/Procedural-Planets/blob/6b551429541d988e00ca9e509450e51e1f2f6f12/Procedural%20Planet%20E07/ShapeGenerator.cs), [noise-layer settings](https://github.com/SebLague/Procedural-Planets/blob/6b551429541d988e00ca9e509450e51e1f2f6f12/Procedural%20Planet%20E07/NoiseSettings.cs), [face sampling](https://github.com/SebLague/Procedural-Planets/blob/6b551429541d988e00ca9e509450e51e1f2f6f12/Procedural%20Planet%20E07/TerrainFace.cs), and [colour generation](https://github.com/SebLague/Procedural-Planets/blob/6b551429541d988e00ca9e509450e51e1f2f6f12/Procedural%20Planet%20E07/ColourGenerator.cs).
- Marching Cubes, commit [`4fd221e`](https://github.com/SebLague/Marching-Cubes/tree/4fd221eb023b90a0d49f0dd7ea886ec2e2a8c3ac): [global-position density](https://github.com/SebLague/Marching-Cubes/blob/4fd221eb023b90a0d49f0dd7ea886ec2e2a8c3ac/Assets/Scripts/Compute/NoiseDensity.compute), [density configuration](https://github.com/SebLague/Marching-Cubes/blob/4fd221eb023b90a0d49f0dd7ea886ec2e2a8c3ac/Assets/Scripts/Density/NoiseDensity.cs), [isosurface interpolation](https://github.com/SebLague/Marching-Cubes/blob/4fd221eb023b90a0d49f0dd7ea886ec2e2a8c3ac/Assets/Scripts/Compute/MarchingCubes.compute), and [view-based chunk recycle](https://github.com/SebLague/Marching-Cubes/blob/4fd221eb023b90a0d49f0dd7ea886ec2e2a8c3ac/Assets/Scripts/MeshGenerator.cs).

## Reusable ideas

1. **Data-shaped layered height.** The planet source evaluates a base noise layer and uses it as an optional mask for later layers. Keep the useful separation: one deterministic, versioned raw-height field; derived drainage/biome queries consume it. Its `MinMax` and colour texture are rendering projections, so they must not become terrain, sea, or biome authority.

2. **Canonical density coordinates plus a shared border sample.** Marching Cubes evaluates density from global `pos`, while meshing a point grid one sample larger than the cubes. A future cave renderer can use the same law: sample density from one canonical signed coordinate/identity and share boundary samples before meshing. This is compatible with the present voxel prototype's disposable decoded bricks.

3. **Bounded precomputation.** Erosion precomputes a radial brush, then runs seeded droplets. A bounded offline/bake experiment could reuse the brush/seed shape only after its input grid, output identity, and conservation policy are specified.

## Limits that matter here

- Lague's erosion mutates a finite heightmap; droplets may leave it, and its `water`/evaporation variables are algorithm state, not conserved world water. The GPU variant has concurrent read/write height-map updates, so it is unsuitable as a deterministic authoritative terrain mutation path.
- Planet ocean colour and elevation gradients are shader/display data. They cannot establish a physical sea level, marine connectivity, water stock, outlets, or drainage.
- Marching Cubes emits visual triangles from a scalar field. Its view-distance chunk recycling is residency, not multi-resolution LOD: there are no cross-LOD transition meshes, persistent edits, or a seam proof. `closeEdges` deliberately changes boundary density and therefore cannot substitute for canonical neighboring cave samples.
- The current drainage atlas's marine roots remain diagnostic only. A future physical water system needs an explicit sea datum, volume/custody owner, and its own source/save laws.

## Narrow recommendation

Use layered noise only to improve the existing raw `sampleTerrain` field under a versioned source identity. Keep the fixed drainage atlas as a derived coarse consumer. Treat a later density/cave module as a separate canonical field with deterministic shared borders and a renderer adapter; do not let erosion, water colour, GPU buffers, or mesh residency mutate the atlas, terrain, or goods state.
