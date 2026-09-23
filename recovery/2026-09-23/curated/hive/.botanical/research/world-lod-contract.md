# Same geography at several levels of detail

Direct Levi clarification, 2026-09-07: coarse globe, atlas and minimap should
sample the same world-generation system at different resolutions without
materializing every local tile. This is terrain/map LOD, not another world seed
or a change to gameplay simulation detail.

## Actual first-shape finding

Astra read src/world-lab/terrain.js and main.js; independent Terra read agrees.
Both detail and overview call sampleCell, which is useful identity reuse. However,
sampleOverview currently maps each output pixel to an adjacent integer cell;
it has no geographic-span/pixel-footprint input. Elevation/moisture are independent
per-cell hashes, and ridge depends on chunk coordinates. This is a deterministic
address/cache scaffold, not coherent multiscale terrain. Chunk-wide ridge changes
can expose chunk borders; equal hashes in different generation orders do not
prove visually continuous geography. main.js generates the overview synchronously.
No new tests, benchmark, build or browser proof was run for this source review.

## Required generator/caller relationship

Separate requested geographic bounds from output pixel dimensions. A 512×512
output may cover a local kilometre, a region, or a planetary surface projection.
Its work should scale with output samples, bounded filtering/feature queries and
needed coarse metadata, not all fine cells underneath it. No hidden full-world
generation followed by resize. Increasing pixel dimensions alone is not LOD.

Use one deterministic world identity and stable global/surface coordinates.
Build coherent broad geography (landmasses, large ridges/climate) and finer detail
on top. Use maintained coherent-noise primitives where appropriate, then authored
composition; unrelated per-cell randomness does not supply geography. The chosen
recipe is versioned; hashes remain useful for stable local variation/identity.

Full local terrain is authoritative independently of which map was requested.
Coarse map queries are summaries/approximations of that geography. Use suitable
band limiting or bounded region filtering at the pixel footprint; omit frequencies
too small for that view instead of sampling them sparsely and aliasing. Do not
change the seed, global coordinate scale or normalize the remaining octave
amplitudes differently so entire continents shift with zoom. Fine shoreline detail
may be below a coarse pixel; major geographic identity must remain consistent.

Not every feature is noise. Later rivers, roads and settlements need their own
stable geographic records or coarse summaries and scale-appropriate overlays.
Do not remove an important route merely because it is thinner than a pixel.
Actual simulation/pathing still queries real local terrain; a coarse map color
never grants walkability. Player edits/known features invalidate affected map
summaries or overlays at the appropriate scale, under discovery/visibility rules.
No fluid solver or feature graph is requested for this first terrain correction.

For the future globe, map canonical surface coordinates into one continuous
sampling domain. Evaluating coherent 3D noise at unit-sphere directions is a
candidate for avoiding a longitude texture seam; it does not by itself solve
cell adjacency, projection distortion, feature ownership or traversal at faces/
poles. Those remain in the finite-surface study, not the current planar lab.

## First useful proof, owned by Delivery/World Lab

Preserve the existing independent file boundary and active upstairs work. First
replace the coordinate-hash terrain placeholder with a small coherent geography
recipe and one overview caller with independent world bounds/output size.
Inspect a named coast/ridge region in a coarse map and local detail, then zoom
without regenerating its geographic identity. Check signed chunk boundaries and
request-order equality separately from actual visual seam continuity. Show
sampling counts/timing for a fixed-size output over a much larger geographic
span; confirm it did not enumerate all covered local cells. Generation must have
a bounded responsive lifecycle; main-thread full-grid work is not the final
large-area caller. Delivery chooses the smallest actual module/API and maintained
primitive and owns source correction/proof; no generic LOD/terrain framework.

Sources read for technical grounding:
- https://pbr-book.org/3ed-2018/Texture/Noise — coherent noise and band-limited
  procedural texture evaluation; evaluate frequencies compatible with footprint.
- https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu
  — broad/fine procedural terrain and view-dependent detail reference, not a
  selected renderer or a source-copy requirement.

Astra owns this note and geographic/art direction; game-delivery retains all
tracked source/docs/issues/Git/deploy custody. Associate with #4 and the
cartography/architecture sprint records, preserving the current first-shape
scaffold evidence honestly. No LOD implementation or new deployment is claimed.
