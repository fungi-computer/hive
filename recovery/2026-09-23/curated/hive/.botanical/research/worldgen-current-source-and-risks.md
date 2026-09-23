# World generation: current source and failure review

**Scope.** Read-only source discovery at the current World Lab revision. This
does not run the lab or its proof script, claim its checks passed, choose a
world-generation algorithm, or authorize large-world gameplay.

## What exists now

`src/world-lab/terrain.js` is a deliberately isolated terrain module: it imports
no Clearing, command, job, camera, or persistence code ([lines 1–2](../../src/world-lab/terrain.js#L1-L2)). Its current public shape is:

| API / anchor | Observed behavior |
| --- | --- |
| `WORLD_LAB_SPEC` ([4–21](../../src/world-lab/terrain.js#L4-L21)) | Fixed seed, `generatorVersion`, 16-cell chunks, 512² overview over an explicit rectangular sample bounds, and a 5×5/25-chunk local-cache default. The non-claims correctly exclude actors, routes, caravan and simulation. |
| `createWorldSpec` ([39–54](../../src/world-lab/terrain.js#L39-L54)) | Validates seed/version, fixes the first chunk size at 16, makes an identity from **version + seed**, and freezes overview/local config. It has no `worldId`, topology, surface projection, patch namespace, or finite bounds contract. |
| `floorDiv`/`mod` and `chunkOf` ([28–37](../../src/world-lab/terrain.js#L28-L37), [119–133](../../src/world-lab/terrain.js#L119-L133)) | Mathematical signed chunk addressing; `x=-1` maps to chunk -1/local 15. |
| `sampleTerrain` ([100–161](../../src/world-lab/terrain.js#L100-L161)) | Pure coordinate query: hash-interpolated broad/fine fields, footprint omission of fine octaves, analytic coast/ridge bands, then elevation/moisture/terrain classification. `sampleCell` fixes footprint to 1 ([173–177](../../src/world-lab/terrain.js#L173-L177)). |
| `generateChunk` ([196–224](../../src/world-lab/terrain.js#L196-L224)) | Generates terrain/elevation/moisture byte arrays from global integer cells and returns a checksum across those arrays. |
| `sampleOverview` ([238–269](../../src/world-lab/terrain.js#L238-L269)) | Samples one value per overview pixel using its geographic footprint; it does not resize a generated fine grid. It returns terrain/features arrays and a terrain-only checksum. |
| `createResidency` ([272–323](../../src/world-lab/terrain.js#L272-L323)) | Main-memory LRU-like cache of generated chunks with stats. This is render-side residency, not persistent decoded-world streaming. |
| `renderChunkBuffer` ([326–337](../../src/world-lab/terrain.js#L326-L337)) | Builds an 80×80 terrain-code buffer for the default contiguous 5×5 caller window; no elevation/moisture or game projection is rendered. |

The page is also intentionally narrow. It creates a synchronous main-thread
overview and 2D canvas image ([`world-lab/main.js` 20–47](../../src/world-lab/main.js#L20-L47)), calls a 5×5 window on each jump, and reports only local render time and cache counts ([50–84](../../src/world-lab/main.js#L50-L84)). The “1024 diagnostic” samples data but neither times it nor draws it; it writes the literal `"measured-on-demand"` ([94–102](../../src/world-lab/main.js#L94-L102)).

The existing proof script is useful static evidence of intended checks—signed
coordinates, two overview spans, named coast/ridge probes, chunk order, and
bounded residency—but it was **not run in this review**
([`scripts/prove-world-lab.mjs` 25–205](../../scripts/prove-world-lab.mjs#L25-L205)).

## Real integration boundary

The playable game remains a finite 15×15, two-level Clearing: `inside()` bounds
all valid cells ([`world.js` 1–34](../../src/world.js#L1-L34)); movement rejects
anything outside it and has no “terrain data needed” result
([`movement.js` 18–40](../../src/movement.js#L18-L40)). Current topology is one
finished stair joining a lower and upper cell ([`world.js` 100–139](../../src/world.js#L100-L139)).
The art camera centres projection and inverse picking on `SIZE`
([`art/scale.js` 23–44](../../src/art/scale.js#L23-L44)). World Lab does not yet
exercise the future shared global-coordinate/pick seam called for by the sprint
record ([architecture proof sprint 104–112](architecture-proof-sprint.md#L104-L112)).

## Failure risks to keep visible

1. **Identity and determinism.** Seed/version are sufficient for this current
   query but not for a world contract: topology and finite-surface parameters
   do not contribute to `identity`, and there is no sparse `WorldPatch` layer.
   The sampler uses floating arithmetic and `Math.sin` ([90–116](../../src/world-lab/terrain.js#L90-L116)); chunk checksums quantize elevation/moisture to bytes. Exact request-order equality therefore needs to be checked at every persisted terrain representation, not assumed to establish cross-engine or future save determinism.
2. **LOD can be coherent yet misleading.** Fine octaves are omitted by footprint,
   while coast/ridge band width itself grows with footprint
   ([100–116](../../src/world-lab/terrain.js#L100-L116), [142–148](../../src/world-lab/terrain.js#L142-L148)). This is a legitimate anti-aliasing experiment, but coarse pixels are classifications rather than local walkability. Current visual output ignores the returned feature/elevation/moisture layers; a checksum cannot show that a recognisable coast/ridge remains geographically coherent.
3. **Chunk seams have only terrain sampling.** Signed addressing is correct in
   the local contract, but no API owns cross-chunk props, roads/rivers, edit
   tombstones, room/support edges, or route adjacency. `renderChunkBuffer` only
   checks that the number of chunks is square; it trusts caller order and
   contiguity ([326–337](../../src/world-lab/terrain.js#L326-L337)). A reordered
   square public call can silently make an incorrect buffer.
4. **Residency and worker responsiveness are unproved.** The cache stores decoded
   arrays in a `Map`, evicts by sorting all entries on a miss, and exposes only
   counters ([272–323](../../src/world-lab/terrain.js#L272-L323)). The default is
   bounded, but no config check requires cache capacity to hold a requested
   window. Overview and diagnostic sampling are synchronous; there is no
   cancellation, request generation, worker boundary, retained-buffer byte
   accounting, or browser-frame/input measurement.
5. **Hydrology is only a colour/category.** “Water” follows a coast-distance
   threshold; moisture is an independent noise field; no source, downhill
   relation, basin, flow, drainage, storage, or water-rights fact exists
   ([140–160](../../src/world-lab/terrain.js#L140-L160)). Do not treat the map
   as evidence for irrigation, rivers, groundwater, cave water, or ecology.
6. **A finite globe is not compatible with this contract yet.** The lab is an
   unbounded signed planar query with a finite rectangular *overview sample*.
   There is no finite surface bounds, wrap adjacency, cell↔surface transform,
   seam/pole rule, or spherical projection. The mapping decision explicitly
   leaves those unresolved ([world mapping and LOD 29–33](../../docs/decisions/world-mapping-and-lod.md#L29-L33)); rendering a globe now would be a separate terrain picture, not this playable geography.

## Smallest meaningful large-world diagnostic

Use the existing pure sampler, one fixed seed/version, and the default 512²
overview plus 5×5 local window. It should inspect four named facts: a coast,
a ridge, the negative edge at `(-1, 0)`, and one distant signed chunk. No larger
world, actor fixture, worker pool, edit/save layer, or globe is required.

Accept the diagnostic only when it records—not merely asserts—the following:

- overview output count and geographic footprint; local window cell/chunk count;
  cold-window, repeated-jump and overview durations; frame interval/input delay
  during a page interaction; resident/generated/evicted chunk counts; and
  explicit terrain/render-buffer bytes. These are observations, not capacity
  targets.
- `x=-1`/local 15, adjacent negative/positive chunk borders, and full
  terrain/elevation/moisture chunk bytes equal after forward order, reverse
  order, eviction/regeneration, and a distant out-and-back jump.
- the same named coast/ridge coordinate is identified by footprint-1 local
  sampling and each recorded overview footprint, with an inspectable visual
  layer as well as checksums.
- resident decoded chunks settle at the configured budget after the out-and-back
  sequence; a cache smaller than a visible window is rejected or explicitly
  reported rather than silently thrashing.
- the report labels this as planar culling/residency only. It must not claim
  streaming, save/patch preservation, routes, workers, hydrology, a finite
  sphere, or gameplay expansion.

The next genuine consumer remains the separate caravan/chunk gate: a persistent
person with cargo crosses a real boundary while home work continues, with a
modified unoccupied chunk saved, evicted and restored. That test owns missing
data, topology, custody and restart semantics; the lab cannot substitute for
it ([architecture proof sprint 182–197](architecture-proof-sprint.md#L182-L197)).
