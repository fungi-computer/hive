# Excalibur depth ordering: pinned official-source study

Read-only research for Astra Game CTO, 2026-09-08, following Levi's explicit request to study Excalibur.js. Read official Excalibur documentation and selected source files via GitHub/raw GitHub. No engine installation, adoption, repository clone, production edit, build, test or browser benchmark. Small source copies are retained under `/tmp/hive-excalibur-depth-4a23dd1` and `/tmp/hive-excalibur-depth-7cb426d`.

## Versions actually checked

- Current remote `HEAD` observed by `git ls-remote`: **`4a23dd1674b1771a88bbbf9e7f20bcd772e264c4`**. This is a main-branch snapshot, not a release claim. Its package.json still identifies 0.32.0 and an `exNextVersion` of 0.33.0. [Pinned package](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/package.json).
- Official published **v0.32.0** tag observed at **`7cb426da0dae70eb50a42341a35e7bbd74395579`**. Independently read its isometric system, GraphicsSystem and WebGL draw comparator. The mechanisms below are the same in those compared files, except main's isometric query excludes paused-tagged entities. [Official release](https://github.com/excaliburjs/Excalibur/releases/tag/v0.32.0), [release isometric source](https://github.com/excaliburjs/Excalibur/blob/7cb426da0dae70eb50a42341a35e7bbd74395579/src/engine/TileMap/IsometricEntitySystem.ts).

## What the isometric algorithm actually does

`IsometricEntityComponent` stores elevation plus map rows, columns, tile width and tile height. It has no occupied-cell footprint, second endpoint, 3D bounds, occlusion graph, support provider or actor contact slot. `IsometricEntitySystem.update` computes:

```ts
stride = Math.max(columns * tileWidth, rows * tileHeight);
z = stride * elevation + transform.pos.y;
```

This is scalar elevation-band plus y ordering. `pos.y` is the transform's 2D local position, not a full 3D world volume. The system visits every matching entity on each update and assigns `transform.z`. It is an Update-phase system with `SystemPriority.Lower`. The current main query also excludes `PauseComponentTag`; release v0.32.0 does not have that exclusion. [Current exact system](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/tile-map/isometric-entity-system.ts), [component](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/tile-map/isometric-entity-component.ts).

`IsometricTile` computes local screen placement from tile coordinates: horizontal position uses their difference times half tile width; vertical position uses their sum times half tile height. It copies the map's elevation into its isometric component. Tile images share one entity z; their dimensions and collider geometry do not modify this formula. The map represents one isometric layer; the official example stacks maps by changing both elevation and visual y position. This supports layered tile scenes, but the reviewed mechanism does not resolve arbitrary interleaving across floors, long furniture, bridges or tall actors. That limit is an inference from the actual component fields and formula, not a statement that applications cannot add their own solution. [Pinned map/tile source](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/tile-map/isometric-map.ts), [official isometric guide](https://excaliburjs.com/docs/isometric/).

The map-sized stride should not be copied as a chunk-relative depth constant in Hive. Entities tied to differently sized maps can compute different bands; a camera chunk is not a global geometric order. Explicit Hive support/contact and full bounds remain necessary.

## GraphicsSystem sorting and its update triggers

`GraphicsSystem` owns a cached array of matching Transform+Graphics entities. Entity addition appends the transform, subscribes to its z-change observable and sets a dirty flag. Removal unsubscribes and splices it out. In the Draw phase's preupdate, it sorts the array by **ascending `transform.globalZ` only when the flag is set**. Higher z is drawn later. `globalZ` sums local z through parent transforms. There is no spatial overlap test, stable entity-ID key or dependency graph in this sort. [Pinned GraphicsSystem](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/graphics/graphics-system.ts), [release counterpart](https://github.com/excaliburjs/Excalibur/blob/7cb426da0dae70eb50a42341a35e7bbd74395579/src/engine/Graphics/GraphicsSystem.ts).

Equal globalZ compares equal, retaining the existing array order under JavaScript's stable sort. That is history/insertion-order stability, not a deterministic semantic tie based on entity ID across reloads or different insertion orders. The final WebGL path has an additional sort described below, so the transform array alone is not the final painter-order guarantee.

`TransformComponent.z` emits `zIndexChanged$` only when the numeric value differs. However, it assigns the underlying `Transform.z` first; that setter always calls `flagDirty`, which also propagates transform-version invalidation to children. Thus the isometric updater avoids a redundant graphics-array sort when z is unchanged, but does not skip every transform invalidation. Also, the reviewed direct `globalZ` setter writes the underlying transform without that component observable, so this pattern should not be copied as a universal guarantee that every modification path dirties every dependent cache. [Component setter](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/entity-component-system/components/transform-component.ts), [underlying transform](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/math/transform.ts).

## The separate WebGL batching sort can change equal-z painter order

`ExcaliburGraphicsContextWebGL` defaults `useDrawSorting` to true. Draw submissions are recorded in pooled objects with their z, renderer priority/name, transform, opacity/tint/material and arguments. At flush, it derives the first occurrence of each renderer in the submitted stream and sorts draw calls by:

1. Ascending z.
2. If z ties, ascending renderer priority.
3. If those tie, the first-occurrence index of the renderer type.

Within the same renderer and equal z/priority, the comparator ties, so stable sort retains their relative submission order. Across renderer types, grouping can change it. For example, equal-z/equal-priority `A1, B1, A2` may become `A1, A2, B1`. This example is a direct deduction from the comparator, not a run benchmark. It explains why automatic batching is not equivalent to a footprint-aware ordering solution. The comparator is present in both checked main and v0.32.0 sources. [Current draw/flush source](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/graphics/context/excalibur-graphics-context-webgl.ts), [release draw/flush source](https://github.com/excaliburjs/Excalibur/blob/7cb426da0dae70eb50a42341a35e7bbd74395579/src/engine/Graphics/Context/ExcaliburGraphicsContextWebGL.ts).

After sorting, consecutive calls go to the selected renderer; changing renderer flushes the previous batch. At the end it flushes remaining draws, returns draw-call objects to their pool and clears per-flush caches. With draw sorting disabled, submissions go directly to the renderer, flushing on renderer switches, so source submission order matters instead. Entity GraphicsSystem sorting still exists; disabling one stage does not remove every stage.

Current main defaults to `ImageRendererV2` unless the legacy renderer flag is enabled. It packs image quads as instances and supports several textures within a batch. It flushes when its image count reaches 20,000 or its texture slots reach the GPU/shader-complexity cap; flush uses `drawArraysInstanced` and resets the batch. This is an implementation capacity, not a claim that 20,000 arbitrary game objects meet a particular frame budget. [Pinned image renderer](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/graphics/context/image-renderer-v2/image-renderer-v2.ts).

The context requests WebGL2 with `depth: false`, uses alpha blending and disables depth writes. Its z is therefore CPU draw ordering, not a per-pixel 3D depth buffer that would independently fix the bed/upper-floor problem. A custom renderer could implement different behavior, but that is not what the reviewed default path supplies. [Pinned context setup](https://github.com/excaliburjs/Excalibur/blob/4a23dd1674b1771a88bbbf9e7f20bcd772e264c4/src/engine/graphics/context/excalibur-graphics-context-webgl.ts), [official graphics context guide](https://excaliburjs.com/docs/graphics-context/).

## What Hive can reuse without an engine migration

- Separate geometry/depth policy from the renderer and batching executor. A typed component/query can organize the responsibility, but does not make the policy correct by itself.
- Keep a retained visible draw set and invalidate ordering when a relevant relation changes. Explicitly cover topology, moving poses, camera basis, parenting and support relations; do not assume the external setter design proves Hive's invalidation.
- Reuse draw metadata/buffers and batch compatible consecutive sprites **after** preserving required occlusion order. Do not reorder across required dependencies merely to reduce renderer swaps. Pixi already handles batching; a second framework is not required to obtain it.
- Treat actual geometry, art anchors and ground tile size as distinct. The official guide's distinction between tile diamonds and image rectangles is useful, but it is not a visible-alpha picking implementation.

For the present Upper bed case, retain Hive's explicit relation that both supporting floors precede the supported bed body. Add actor/contact relations and split an image only when an actual interleaving/cycle needs it. Excalibur's reviewed implementation does **not** contain a hidden general two-endpoint, multi-cell or multilevel occlusion solver to import. Its source is useful precisely because it makes the depth calculation, dirty sort and batching tradeoffs visible.

This conclusion recommends learning from bounded mechanisms, not replacing the existing Three→bake→Pixi pipeline or adopting Excalibur. No performance or pixel-correctness claim was experimentally tested in this study.

## Root decision and immediate consumer

Astra personally read this full study and independently opened the current pinned isometric system/component/map, GraphicsSystem and WebGL comparator, along with the official guides and release metadata. Accepted: retain Pixi and the existing bake pipeline, borrow explicit ownership/invalidation/order discipline, and implement Hive's missing geometric ordering relations in its own small checked module. No Excalibur dependency or engine migration is requested.

A concrete arithmetic check shows why the scalar formula alone does not solve Levi's bed screenshot. With a 15×15 map of 32×16 diamonds, the stride is 480. An elevation-1 bed anchored at tile (5,5) has localY 80 and depth 560; the supporting floor at its foot, (5,6), has localY 88 and depth 568. It still sorts after the whole bed. This is a mathematical counterexample using the inspected formula and a two-cell footprint, not an Excalibur browser reproduction.

The immediate Hive consumer is the supporting-floor-before-bed relation from `furniture-contact-and-navigation-decision.md`. Derive relations from placed geometry and support, resolve a stable acyclic painter order, and give that order to Pixi without a later material grouping pass reversing required dependencies. Use spatial overlap candidates and retained unchanged records to bound the work. Inspect each demonstrated cycle or interleaving before introducing baked parts. A general solution must also preserve foreground trees, actors beside furniture, and upper/lower overlap; one additional bed constant does not establish those cases.

Delivery should associate this study with the existing rendering/module issues and preserve current controls priority. The independent main/release investigation is source evidence; it adds no browser-suite gate and does not imply any current bed/contact fix has shipped.
