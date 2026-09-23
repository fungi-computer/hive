# Diggable volume and utility view

Levi direction, 2026-09-07. Future world/utility architecture, outside the
current upstairs release. Dwarven pipes require an X-ray view and must occupy
real world space because digging and underground construction are planned.

## Superseding usability clarification

Levi explicitly wants shallow burial and uncovering, not deep excavation or a
service tunnel for ordinary household plumbing. A pipe belongs in the top ground
cell under the local surface; that cell may hold a pipe segment and soil cover.
It is not required to remain an empty pipe-and-air chamber.

Default interaction: drag **Lay buried pipe**; ordinary workers perform shallow
trench excavation, placement/connection, then backfill as one player order with
composable work steps. The closed surface becomes usable ground again. A later
**Expose pipe** action removes cover, allowing inspection/repair/removal, and
**Cover trench** backfills it again. Excavating cover does not implicitly delete
the segment or its contents. Ordinary deep digging is a separate later action.

X-ray can reveal buried routes without excavating them; maintenance still obeys
physical accessibility. Pipe and cover are persistent world facts, not a hidden
render layer. No voxel dimensions or universal building-over-pipe collision rule
are selected by this note.

## Current source versus direction

Current `src/world.js` uses horizontal x/z cells with discrete levels 0/1.
`level` is a logical storey; `STOREY_HEIGHT` converts it into rendered height.
This supports multi-storey play, but is not yet a full volumetric terrain model.
Do not relabel those two storeys as a completed voxel engine or silently use a
storey index as excavation depth.

Rendering is independent of representation. A world of volume cells can use
the accepted original Three-to-pixel-bake-to-Pixi presentation. It need not show
Minecraft cubes, introduce a second renderer, or abandon the accepted art scale.

The coarse world generator can describe the surface height and broad geology;
underground occupancy/caves and player excavation require vertical volume and
persisted edits. A height map alone cannot represent tunnels or overhangs.
Choose cell resolution and vertical chunk extents in the later digging contract,
with actual memory/active-region measurements. No giant dense world allocation.

## Physical utility ownership

- Each pipe segment has an actual coordinate, footprint, connection ports and
  owned capacity/content. A buried route needs shallow trench work, construction
  and backfill, rather than a deep tunnel.
- A cell containing a thin pipe need not be an entirely solid cube. Solid
  terrain, walking clearance, utility space, air volume and connection ports are
  separate questions, with explicit placement/collision rules. The intended
  shallow-burial case stores one segment plus its soil cover in the same top
  ground cell; this is not unrestricted arbitrary overlap.
- Terrain, walls/floors and utilities cannot contradict one another: digging,
  deconstruction and construction validate the actual affected physical space.
  Dedicated wall penetrations or service channels may be authored later.
- The network graph is derived from placed segments and compatible ports; it
  cannot independently invent connected pipes. Opening a route, removing a
  segment or closing a valve changes connectivity deterministically.
- Clean-water, waste and heating networks have explicit compatibility. No free
  transfer between networks merely because they share a screen pixel or cell.
- Transported water/energy has named sources, sinks and storage. A burst or
  removal needs an explicit release/recovery rule, never silent deletion.
- Utility simulation and outside liquid/air may use different representations,
  joined by counted exchanges at fixtures, intakes, outlets and leaks. No full
  pipe-fluid CFD is selected by this direction.

## Utilities / X-ray presentation

Use the same floor navigation and a utility view that fades occluding terrain
and structures. Filter water, waste and heating; distinguish networks by labels,
patterns and icons as well as color. Display connection/flow direction, source
and destination, capacity, breaks, blocked routes and relevant temperature.
Show a selected pipe's actual position and reachable maintenance interaction.

The view controls visibility and picking only. Hidden or offscreen pipes remain
physical and simulated. It must reveal which floor/depth is inspected without
making a ghosted upper segment steal an unrelated lower-cell click. Use the
existing game input ownership, Caps composition and hotkey approach when the
consumer is implemented; no new input or environmental authority.

## First later experiment

A shallow trenched-and-backfilled route, a manually supplied cistern, a few pipe
segments and one basin. Inspect it in normal and utility view; uncover a segment
and cover it again without changing connectivity or losing contents. Removing
an exposed segment interrupts delivery, leaves quantities accounted for and
exposes a clear cause; restoring the connection restores service. Save/reload
preserves cover, route, quantities and interruption. Primitive carried-water
basins remain a useful earlier tier while later Dwarven plumbing reduces labor.

Associate with existing world/chunks #4, levels #3, water #10, technology and
knowledge #17, and the hygiene note. This is durable future direction, not a
new current-release requirement or claim of implemented digging/plumbing.

Related: [historical gravity channels and water engineering](historical-water-engineering.md)
and [manual hygiene](hygiene-wells-and-bathing.md). Early gravity-fed waterworks
can precede advanced Dwarven pumps and controls.
