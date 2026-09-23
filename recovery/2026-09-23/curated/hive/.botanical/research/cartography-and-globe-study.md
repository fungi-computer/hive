# Cartography and globe study

## Scope

This is a design/research note for a future cartography study alongside World
Lab. It does not add a map item, reveal gameplay terrain, select a globe-shaped
world, create a server map service, or change the 15×15 clearing.

## Reference evidence

### Minecraft — verified first-party mechanics

[Mojang's Cartography Table article](https://www.minecraft.net/de-de/article/block-week--cartography-table)
states that an explored map plus paper produces a zoomed-out map, an explored
map plus an empty map produces a clone, and glass locks a map against further
exploration. It also distinguishes Java's automatic player marker from Bedrock's
cartography-table compass step for locator maps. This supports physical,
bounded sheets with copying, scale, and a frozen state; it does not prescribe
Hive's materials, item UI, or multiplayer knowledge policy.

[Mojang's 26.3 snapshot notes](https://www.minecraft.net/en-us/article/minecraft-26-3-snapshot-7)
say Explorer Maps are distinct items, retain their type on cloning, and only
some maps are extendable/zoomable. This is useful evidence that maps can carry
different information contracts rather than one universal live viewport.

The first-party material calls a map “explored” and says locking prevents later
exploration, but does **not** specify the precise fog raster, multiplayer
discovery ownership, or copy consistency needed for Hive. Those mechanics stay
an original design decision.

### RimWorld — verified and secondary evidence

Ludeon's [Odyssey page](https://rimworldgame.com/odyssey/) describes travel
across a planet and landing in different places. A developer-published
[Steam announcement](https://store.steampowered.com/news/posts/?appgroupname=RimWorld&appids=294100&enddate=1752076799&feed=steam_community_announcements)
describes a world-map search/jump interface, globe navigation, and map features
whose local generation depends on their world-map location. These support the
useful distinction between a strategic planetary view and a local playable map.

[RimWorld Access's world-map guide](https://rimworldaccess.com/world/world-map/)
is **secondary** accessibility documentation, not a Ludeon specification. It
describes tile inspection, named search, route planning, settlements, and
caravans. It is a useful interaction reference only. The sources above do not
prove exact RimWorld globe projection, fog ownership, or its internal generation
and route implementation; this study makes no such claim.

## Recommended Hive information surfaces

| Surface | Purpose | Information rule |
| --- | --- | --- |
| Local minimap | Immediate orientation around the selected person/home. | Draw currently visible actors/events and permitted remembered terrain. Loading a chunk alone never reveals it; it is not a separate durable survey record. |
| Regional atlas | Browse a player/party's durable surveyed regions, place names, and known routes. | Reads authoritative discovery records and deliberately shared charts; no unexplored terrain is filled merely because the atlas opens. |
| Physical carried map | A crafted, movable sheet with projection, bounds, scale, legend, chart payload, author/copy provenance, and surveyed-at revision/tick. | Proposed Hive policy: it displays captured information. Copies snapshot its payload at copy time; later world change makes it visibly stale. This is not a claim about Minecraft copy synchronization. |
| Globe/global view | Strategic finite-world orientation, distant regions, and later caravan destinations. | Available only when the world declares a finite surface topology. It visualizes the same terrain/discovery data as the atlas; it does not generate a second world. |

Keep three facts separate:

1. **Discovery** is authoritative knowledge owned by the appropriate player,
   party, or permitted institution about observed cells/features.
2. **Current visibility** is a transient local observation result; it need not
   be copied into durable discovery every frame.
3. **Chart data** is what a physical map captured. Reading it may expose its
   contents to a viewer, but should not silently write new global terrain or
   discovery facts. A later explicit survey/study rule may promote it.

Copies are physical item instances with separate ownership and provenance, even
when their captured payload is identical. A map never creates terrain,
auto-surveys unexplored space, updates other copies, or globally grants knowledge
just because an item exists in storage. A newer survey/copy is a new chart; an
old map remains a useful historical/stale record.

## World coordinate and globe boundary

World Lab's base terrain remains the single source: `WorldSpec { worldId, seed,
generatorVersion, topology }`, global terrain coordinates, stable feature IDs,
and sparse `WorldPatch` deltas. Cartography consumes those queries; it must not
seed an attractive independent globe.

For an **unbounded planar** chunk world, a truthful UI is a local minimap and
regional atlas centred on an anchor. There is no faithful complete sphere; a
decorative globe would incorrectly suggest a finite wraparound world.

For a future **finite globe**, select one surface coordinate system before art:
for example, a face/UV cell coordinate with explicit seams, or a latitude/
longitude grid with explicit pole and seam rules. The contract must provide:

```
world cell/feature ID <-> surface coordinate <-> unit-sphere position
```

Chunk ownership, deterministic terrain sampling, picking, region bounds, and
the globe renderer all use that contract. `WorldPatch` remains keyed by the
canonical world cell/feature ID, never screen pixels or a separately sampled
texture. A finite-surface study may evaluate this contract without committing
Hive's eventual playable world to a globe.

## Globe rendering trade-off

| Approach | Strength | Cost/risk |
| --- | --- | --- |
| Fixed Three → sprite-sheet views | Bounded, pixel-art friendly, cheap at runtime, and easy to review at named headings. | Only discrete rotations/zooms. Dynamic fog/markers can be separate projected overlays, so they do not require a full rebake. Terrain or lighting baked into the views does need affected views refreshed; projection/picking must match each view. |
| Live Three → low-resolution texture globe | Continuous rotation, current overlays, and direct use of the shared surface query/patch data. | Requires texture updates, seam/pole handling, GPU lifecycle rules, and a measured render budget. It is a renderer, not terrain authority. |

Example raw RGBA allocation, excluding browser, Canvas, Three, and mip overhead:

- 16 fixed 256×256 frames = `16 × 256 × 256 × 4` = **4 MiB**; a 4×4,
  1024×1024 atlas is also **4 MiB**. Mipmaps add roughly one third when used.
- A live 512×256 equirectangular terrain/discovery texture is **512 KiB**;
  one 256×256 low-resolution globe render target is **256 KiB**, or **768 KiB**
  before extra masks, depth buffers, and renderer overhead.

These are allocation examples, not device capacity claims. A globe study must
measure texture uploads, frame intervals, and retained GPU resources on named
hardware. Prefer the fixed sheet only for a static finite-world overview; prefer
the live low-resolution texture only after the shared finite-surface contract and
dynamic overlay consumer exist.

## Bounded first study beside World Lab

Build no gameplay map. Extend the World Lab research shape with a **coordinate
identity panel**: select one canonical generated cell/feature at a positive edge,
a negative planar coordinate, and a distant coordinate; show its local regional
atlas position, deterministic ID/checksum, and inverse-pick round trip. The same
pure generator and sparse patch query must supply every displayed value.

If a finite-surface adapter is evaluated, use a separate explicit test
`WorldSpec.topology = finiteSurface`, render one low-resolution Three globe and
verify a handful of coordinate → sphere → pick-back identities across a seam.
It is a contract experiment, not a new playable world, fog system, map
inventory, network service, or art deliverable. Planar World Lab configurations
show an atlas instead of a globe.

The first exit is therefore: same seed/version/patch produces the same labelled
terrain identity from local detail and atlas (and, only for the finite test
specification, globe) after region hide/requery and reverse request order. The
later caravan gate still owns actual terrain residency, missing-data routes,
cargo, save/evict/reload, and permission to open world gameplay.

## Current anchors

- `ARCHITECTURE.md` already requires global integer coordinates, stable
  coordinate-based generation, patches/tombstones, distinct visible/resident/
  simulating lifecycles, and caravan proof before world gameplay.
- `.botanical/research/world-lab-ready-audit.md` scopes the first consumer to
  pure terrain-coordinate and patch data, with culling rather than streaming.
- `src/world.js`, `src/movement.js`, `src/art/scale.js`, `src/camera.js`,
  `src/view.js`, and `src/construction-view.js` still carry finite-clearing,
  camera-origin, picking, and display ownership. Do not merge cartography into
  them while the upstairs writer owns those coupled seams.
- `src/art/clearing.js` is an authored 15×15 cut-earth bake, not repeatable
  terrain; a globe/atlas study needs its own generated terrain presentation
  backed by the shared query contract.

## Astra review

Read and accepted as a bounded research direction. Clarified that loaded terrain
never bypasses discovery permissions, snapshot-copy behavior is a Hive proposal,
and separately projected fog/markers can overlay fixed globe sprites without
rebaking the terrain atlas. Actual terrain changes still require the appropriate
baked view or live texture update. No planetary topology or map-item runtime has
been selected or implemented by this study.
