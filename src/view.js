import {
  terrainSurfaces,
  observedTerrainSurfaces,
} from "./terrain-surface-geometry.js";
import {
  visualDepth,
  waterDepth,
  waterBehindStructure,
} from "./visual-order.js";
import { waterSurfaces } from "./water-surfaces.ts";
import { SIZE } from "./world.js";
import { currentVisibility } from "./exploration.ts";
import { Texture, Sprite, Container, Graphics, Text } from "pixi.js";
import { projectCell, WIDTH, HEIGHT } from "./art/scale.js";
import { visualPosition } from "./movement.ts";
import { insidePlacement, worldView, viewLayer } from "./game-space.ts";
import { CHOP_TICKS } from "./activity.ts";
import { HARVEST_TICKS, HERB_READY_TICKS, SOW_TICKS } from "./herbs.ts";
import { isNight } from "./routine.ts";
import { createConstructionView } from "./construction-view.js";
import { createVisualHitGeometryOwner } from "./visual-hit-geometry.js";
import { carriedLot, containerQuantity, vesselContainer } from "./materials.ts";
import { sourceContainerSpec, sourceIsOpen } from "./finite-sources.ts";
import {
  terrainCell,
  terrainRevision as terrainVersion,
  terrainChangedColumns,
  terrainGeometryKey,
  TERRAIN_VOXEL_METRIC,
} from "./terrain.ts";
import { terrainDesignationCells } from "./ui-actions.ts";
import { commandProblem } from "./orders.ts";
import {
  clearingAirLayer,
  clearingAirPresentation,
} from "./air-presentation.ts";

function label(text, size = 8) {
  const result = new Text({
    text,
    style: { fontFamily: "sans-serif", fontSize: size, fill: 0xf3dfad },
  });
  result.anchor.set(0.5);
  return result;
}

function depthKey(at, layer = 0) {
  return visualDepth(at, layer);
}

function put(display, footing, layer = 0) {
  const at = worldView(footing);
  const point = projectCell(at);
  display.position.set(point.x, point.y);
  display.zIndex = depthKey(at, layer);
}

function body(texture, anchor, radius) {
  const container = new Container();
  const sprite = new Sprite(texture);
  container.eventMode = "none";
  container.addChild(
    new Graphics()
      .ellipse(0, 0, radius, radius / 3)
      .fill({ color: 0x213322, alpha: 0.3 }),
  );
  sprite.anchor.set(anchor.x, anchor.y);
  sprite.eventMode = "none";
  container.addChild(sprite);
  return { container, sprite };
}

function animationFrame(tick, pose, frames) {
  const ticksPerFrame = pose === "idle" ? 8 : 2;
  return Math.floor(tick / ticksPerFrame) % frames.length;
}

/** The renderer derives every carried-pail pose from durable lot custody. */
export function carriedActorPose(materials, hand, mode) {
  if (hand?.material === "pail") {
    const water = containerQuantity(
      materials,
      vesselContainer(hand.id),
      "water",
    );
    return water >= 2
      ? "carry-pail-full"
      : water === 1
        ? "carry-pail-half"
        : "carry-pail-empty";
  }
  if (hand?.material === "soil") return "carry-soil";
  if (hand?.material === "ration")
    return mode === "consume" ? "eat" : "carry-ration";
  if (["dig"].includes(mode)) return "dig";
  return hand?.material === "mugwort"
    ? "carry-herb"
    : mode === "walk" && hand?.material === "wood"
      ? "carry"
      : mode;
}

function stationaryCarryPose(pose, mode) {
  return (
    mode !== "walk" &&
    (pose === "carry-herb" ||
      pose === "carry-soil" ||
      pose === "carry-ration" ||
      pose.startsWith("carry-pail-"))
  );
}

export function carriedActorFrame(tick, pose, mode, frames) {
  return stationaryCarryPose(pose, mode)
    ? 0
    : animationFrame(tick, pose, frames);
}

/** A planted herb does not grow until its canonical establishment fact exists. */
export function herbGrowthProgress(herb, tick) {
  if (herb.stage === "ordered") return herb.work / SOW_TICKS;
  if (herb.stage === "ready") return herb.work / HARVEST_TICKS;
  const establishedAt = herb.establishment?.at;
  return establishedAt === undefined
    ? 0
    : Math.min(1, (tick - establishedAt) / HERB_READY_TICKS);
}

export function createView(app, world, camera, art, initial, input) {
  let visible = currentVisibility(initial);
  const ground = new Sprite(art.ground);
  world.addChild(ground);
  let terrainSource = null,
    terrainRevision = -1,
    terrainLevel = null,
    terrainExploration = null,
    terrainFaces = [];
  function drawTerrain(state, selection) {
    if (
      terrainSource === terrainGeometryKey(state.terrain) &&
      terrainRevision === terrainVersion(state.terrain) &&
      terrainLevel === selection.level &&
      (selection.level >= 0 || terrainExploration === state.exploration)
    )
      return;
    terrainSource = terrainGeometryKey(state.terrain);
    terrainRevision = terrainVersion(state.terrain);
    terrainLevel = selection.level;
    terrainExploration = state.exploration;
    const faces =
      selection.level < 0
        ? observedTerrainSurfaces(state.exploration, selection.level)
        : terrainSurfaces(state.terrain, SIZE);
    const previous = ground.texture;
    if (selection.level < 0) {
      const slice = art.bakeTerrainSlice(faces);
      ground.texture = slice.texture;
      ground.position.set(slice.x, slice.y);
    } else {
      ground.position.set(0, 0);
      ground.texture = terrainChangedColumns(state.terrain).length
        ? art.bakeTerrain(
            state.terrain,
            art.ground,
            terrainChangedColumns(state.terrain),
            faces,
          )
        : art.ground;
    }
    if (
      previous !== ground.texture &&
      previous !== art.ground &&
      previous !== Texture.EMPTY
    )
      previous.destroy(true);
    terrainFaces = faces;
    camera.setTerrain(faces);
  }
  const wetSurfaces = new Map();
  let waterCheckpoint = null,
    waterContext = null,
    waterExploration = null,
    waterFaces = null,
    waterMaskPixels = null,
    projectedWater = [];
  function drawWater(state, selection) {
    const context = JSON.stringify([
      selection.level,
      Object.values(state.actors).map(({ x, y, z }) => [x, y, z]),
      state.sites
        .filter((site) => site.finishedAt !== null)
        .map(({ id, type, x, z, level, direction }) => [
          id,
          type,
          x,
          z,
          level,
          direction,
        ]),
    ]);
    if (
      waterCheckpoint !== state.water ||
      context !== waterContext ||
      waterExploration !== state.exploration ||
      waterFaces !== terrainFaces
    ) {
      if (waterFaces !== terrainFaces)
        waterMaskPixels = JSON.stringify(
          terrainFaces.map((face) =>
            face.vertices.map(({ x, y, z }) => projectCell({ x, z }, y)),
          ),
        );
      projectedWater = waterSurfaces(state, selection.level);
      waterCheckpoint = state.water;
      waterContext = context;
      waterExploration = state.exploration;
      waterFaces = terrainFaces;
    }
    const active = new Set(projectedWater.map((surface) => surface.id));
    for (const [id, entry] of wetSurfaces) {
      if (active.has(id)) continue;
      if (entry.sprite.texture !== Texture.EMPTY)
        entry.sprite.texture.destroy(true);
      entry.sprite.destroy();
      wetSurfaces.delete(id);
    }
    const structures = bodies.children
      .filter(
        (display) =>
          display.waterOrderSite &&
          display.waterOrderSite.finishedAt !== null &&
          display.visible &&
          display.alpha > 0 &&
          display.tint === 0xffffff,
      )
      .sort((a, b) => a.zIndex - b.zIndex);
    // Tinted unfinished plans retain ordinary sprite order; only finished,
    // white-tinted source variants are composited over water.
    for (const surface of projectedWater) {
      const depth = waterDepth(surface, state.sites);
      const occluders = [];
      const maskKeys = [];
      for (const display of structures) {
        if (!waterBehindStructure(surface, depth, display.waterOrderSite))
          continue;
        const record = picking.recordFor(display);
        if (!record)
          throw new Error("Water occluder has no registered original texture.");
        const { bounds } = record.hitArea;
        const x = display.x + bounds.x,
          y = display.y + bounds.y;
        occluders.push({ texture: record.texture, x, y, alpha: display.alpha });
        maskKeys.push([record.revision, x, y, display.alpha]);
      }
      let entry = wetSurfaces.get(surface.id);
      if (!entry) {
        const sprite = new Sprite(Texture.EMPTY);
        sprite.eventMode = "none";
        bodies.addChild(sprite);
        entry = { sprite, pixels: null };
        wetSurfaces.set(surface.id, entry);
      }
      entry.sprite.zIndex = depth;
      const pixels = JSON.stringify([
        waterMaskPixels,
        maskKeys,
        [-0.5, 0.5].flatMap((dx) =>
          [-0.5, 0.5].map((dz) =>
            projectCell(
              { x: surface.x + dx, z: surface.z + dz },
              surface.height,
            ),
          ),
        ),
      ]);
      if (pixels === entry.pixels) continue;
      const slice = art.bakeTerrainWater([surface], terrainFaces, occluders);
      const previous = entry.sprite.texture;
      entry.sprite.texture = slice.texture;
      entry.sprite.position.set(slice.x, slice.y);
      entry.pixels = pixels;
      if (previous !== Texture.EMPTY) previous.destroy(true);
    }
  }
  const airMarks = new Map();
  function clearAirMarks() {
    for (const { mark } of airMarks.values()) mark.destroy();
    airMarks.clear();
  }
  function drawAir(state, selection) {
    if (!selection.airOverlay) {
      clearAirMarks();
      return;
    }
    const layer = clearingAirLayer(
        clearingAirPresentation(state),
        selection.level,
      ),
      cells = layer ? layer.cells : [],
      active = new Set(
        cells
          .filter(
            (cell) =>
              cell.smokeStrength > 0 || cell.heatStrength > Number.EPSILON,
          )
          .map((cell) => cell.id),
      );
    for (const [id, entry] of airMarks) {
      if (active.has(id)) continue;
      entry.mark.destroy();
      airMarks.delete(id);
    }
    for (const cell of cells) {
      if (!active.has(cell.id)) continue;
      let entry = airMarks.get(cell.id);
      if (!entry) {
        const mark = new Graphics();
        mark.eventMode = "none";
        bodies.addChild(mark);
        entry = { mark, visualKey: null };
        airMarks.set(cell.id, entry);
      }
      const visualKey = `${cell.smokeStrength}:${cell.heatStrength}:${Math.sign(cell.temperatureDeltaK)}`;
      if (entry.visualKey !== visualKey) {
        const mark = entry.mark;
        mark.clear();
        if (cell.smokeStrength > 0)
          mark.poly([-10, 0, 0, 5, 10, 0, 0, -5]).fill({
            color: 0x726b72,
            alpha: 0.08 + cell.smokeStrength * 0.3,
          });
        if (cell.heatStrength > Number.EPSILON)
          mark.ellipse(0, -2, 7, 4).stroke({
            color: cell.temperatureDeltaK >= 0 ? 0xf19a52 : 0x73b5cf,
            width: 1,
            alpha: 0.15 + cell.heatStrength * 0.65,
          });
        entry.visualKey = visualKey;
      }
      const point = projectCell(cell.local, TERRAIN_VOXEL_METRIC.verticalM / 2);
      entry.mark.position.set(point.x, point.y);
      entry.mark.zIndex = depthKey(cell.local, 0.12);
    }
  }
  drawTerrain(initial, { level: 0 });
  const route = new Graphics();
  const marks = new Graphics();
  const selectionBox = new Graphics();
  const terrainMarks = new Graphics();
  terrainMarks.eventMode = "none";
  const bodies = new Container();
  route.eventMode = marks.eventMode = selectionBox.eventMode = "none";
  bodies.sortableChildren = true;
  world.addChild(route, marks, terrainMarks, bodies);
  const picking = createVisualHitGeometryOwner(bodies);

  const trees = new Map();
  for (const tree of initial.trees) {
    const view = body(art.tree.standing, art.propAnchor, 13);
    const target = {
      kind: "tree",
      id: tree.id,
      level: viewLayer(tree),
      action: "tree",
    };
    put(view.container, tree, 0.95);
    bodies.addChild(view.container);
    view.container.eventMode = "static";
    view.container.cursor = "pointer";
    view.container.on("pointerdown", (event) => {
      if (!input.groundPointerOwns()) event.stopPropagation();
    });
    const choose = (event, secondary = false) => {
      if (input.groundPointerOwns()) return;
      const dispatched = picking.recordFor(view.container)?.target;
      if (!dispatched) return;
      event.stopPropagation();
      input.tree(
        dispatched.id,
        event.global,
        secondary,
        !!(event.shiftKey || event.originalEvent?.shiftKey),
      );
    };
    view.container.on("pointertap", choose);
    view.container.on("rightclick", (event) => choose(event, true));
    trees.set(tree.id, { ...view, target });
  }

  const actors = new Map();
  for (const person of Object.values(initial.actors)) {
    const view = body(
      art.figures[person.figure].idle[person.dir][0],
      art.pawnAnchor,
      person.figure === "cat" ? 5 : 6,
    );
    view.container.eventMode = "static";
    view.container.cursor = "pointer";
    const target = {
      kind: "actor",
      id: person.id,
      level: viewLayer(person),
      action: "select",
    };
    view.container.on("pointerdown", (event) => {
      if (!input.groundPointerOwns()) event.stopPropagation();
    });
    view.container.on("pointertap", (event) => {
      if (input.groundPointerOwns()) return;
      const dispatched = picking.recordFor(view.container)?.target;
      if (!dispatched) return;
      event.stopPropagation();
      input.actor(
        dispatched.id,
        event.global,
        !!(
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.originalEvent?.shiftKey ||
          event.originalEvent?.ctrlKey ||
          event.originalEvent?.metaKey
        ),
      );
    });
    view.container.on("rightclick", (event) => {
      if (!input.groundPointerOwns()) event.stopPropagation();
    });
    bodies.addChild(view.container);
    const ring = new Graphics()
      .ellipse(0, 0, 10, 4)
      .stroke({ width: 1, color: 0xf0d28a });
    const name = new Text({
      text: person.name,
      style: {
        fontFamily: "sans-serif",
        fontSize: 11,
        fontWeight: "600",
        fill: 0xf7e9cb,
      },
    });
    name.anchor.set(0.5);
    const plate = new Container();
    plate.eventMode = "none";
    plate.addChild(
      new Graphics()
        .roundRect(-31, -10, 62, 20, 4)
        .fill({ color: 0x1b2b24, alpha: 0.94 })
        .stroke({ color: 0xb7b585, width: 1 }),
      name,
    );
    const progress = new Graphics();
    ring.eventMode = name.eventMode = progress.eventMode = "none";
    view.container.addChildAt(ring, 1);
    view.container.addChild(progress);
    app.stage.addChild(plate);
    actors.set(person.id, { ...view, ring, plate, progress, target });
  }

  const cat = body(art.figures.cat.idle[0][0], art.pawnAnchor, 5);
  const goblin = body(art.figures.goblin.idle[0][0], art.pawnAnchor, 7);
  put(goblin.container, initial.watcher, 0.8);
  bodies.addChild(cat.container, goblin.container);

  const piles = new Map();
  const herbs = new Map();
  const bundles = new Map();
  const sources = new Map();
  const pails = new Map();
  const construction = createConstructionView(
    world,
    art,
    bodies,
    input,
    picking,
  );
  const dusk = new Graphics()
    .rect(0, 0, WIDTH, HEIGHT)
    .fill({ color: 0x252342, alpha: 0.3 });
  dusk.eventMode = "none";
  world.addChild(dusk);
  app.stage.addChild(selectionBox);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  const fromCanvas = (event) => event.nativeEvent?.target === app.canvas;
  app.stage.on("globalpointermove", (e) => {
    if (!fromCanvas(e)) return;
    const cell = camera.cell(e.global, input.level());
    if (insidePlacement(cell)) input.move(cell, e.global);
  });
  app.stage.on("pointerdown", (e) => {
    if (fromCanvas(e) && e.button === 0)
      input.down(camera.cell(e.global, input.level()), e.global);
  });
  app.stage.on("pointerup", (e) => {
    if (fromCanvas(e) && e.button === 0)
      input.up(camera.cell(e.global, input.level()), e.global);
  });
  app.stage.on("pointerupoutside", input.cancelDrag);
  app.stage.on("pointertap", (e) => {
    if (fromCanvas(e) && e.button === 0) input.ground();
  });
  app.stage.on("rightclick", (e) => {
    if (fromCanvas(e))
      input.groundRight(camera.cell(e.global, input.level()), e.global);
  });

  function drawSources(state, selection) {
    for (const [id, view] of sources)
      if (!state.sources.some((source) => source.id === id)) {
        picking.remove(view.container);
        view.container.destroy({ children: true });
        sources.delete(id);
      }
    const interactive = !selection.tool && !selection.panMode && !selection.box;
    for (const source of state.sources) {
      if (!sources.has(source.id)) {
        const view = body(art.sources.spring.full, art.propAnchor, 9);
        const target = {
          kind: "source",
          id: source.id,
          level: viewLayer(source),
          action: "inspect-source",
        };
        view.container.cursor = "pointer";
        view.container.on("pointerdown", (event) => {
          if (!input.groundPointerOwns()) event.stopPropagation();
        });
        view.container.on("pointertap", (event) => {
          if (input.groundPointerOwns()) return;
          const dispatched = picking.recordFor(view.container)?.target;
          if (!dispatched) return;
          event.stopPropagation();
          input.source(dispatched.id, event.global);
        });
        sources.set(source.id, { ...view, target });
        bodies.addChild(view.container);
      }
      const view = sources.get(source.id);
      const provider = sourceContainerSpec(source);
      const quantity = containerQuantity(
        state.materials,
        provider.id,
        provider.accepts[0],
      );
      const stateName =
        source.kind === "spring"
          ? quantity <= 0
            ? "dry"
            : quantity < provider.capacity
              ? "low"
              : "full"
          : sourceIsOpen(source)
            ? "repaired"
            : "sealed";
      const texture =
        source.kind === "spring"
          ? art.sources.spring[stateName]
          : art.sources.cache[stateName];
      const active = viewLayer(source) === selection.level && visible(source);
      view.container.visible = active;
      view.container.eventMode = active && interactive ? "static" : "none";
      put(view.container, source, 0.24);
      view.sprite.texture = texture;
      picking.bind(view.container, {
        texture,
        anchor: art.propAnchor,
        orientation: `${source.kind}:${stateName}`,
        target: { ...view.target, level: viewLayer(source) },
      });
      if (selection.source === source.id)
        marks
          .ellipse(
            projectCell(worldView(source)).x,
            projectCell(worldView(source)).y,
            14,
            7,
          )
          .stroke({ width: 2, color: 0xe6c477 });
    }
  }

  function drawPails(state, selection) {
    const groundPails = state.materials.lots.filter(
      (lot) => lot.material === "pail" && lot.location.kind === "ground",
    );
    for (const [id, view] of pails)
      if (!groundPails.some((lot) => lot.id === id)) {
        picking.remove(view.container);
        view.container.destroy({ children: true });
        pails.delete(id);
      }
    const interactive = !selection.tool && !selection.panMode && !selection.box;
    for (const lot of groundPails) {
      if (!pails.has(lot.id)) {
        const view = body(art.pail.empty, art.propAnchor, 7);
        const target = {
          kind: "lot",
          id: lot.id,
          level: viewLayer(lot.location),
          action: "inspect-lot",
        };
        view.container.cursor = "pointer";
        view.container.on("pointerdown", (event) => {
          if (!input.groundPointerOwns()) event.stopPropagation();
        });
        view.container.on("pointertap", (event) => {
          if (input.groundPointerOwns()) return;
          const dispatched = picking.recordFor(view.container)?.target;
          if (!dispatched) return;
          event.stopPropagation();
          input.lot(dispatched.id, event.global);
        });
        pails.set(lot.id, { ...view, target });
        bodies.addChild(view.container);
      }
      const view = pails.get(lot.id);
      const water = containerQuantity(
        state.materials,
        vesselContainer(lot.id),
        "water",
      );
      const texture = water >= 2 ? art.pail.filled : art.pail.empty;
      const active =
        viewLayer(lot.location) === selection.level && visible(lot.location);
      view.container.visible = active;
      view.container.eventMode = active && interactive ? "static" : "none";
      put(view.container, lot.location, 0.21);
      view.sprite.texture = texture;
      picking.bind(view.container, {
        texture,
        anchor: art.propAnchor,
        orientation: `pail:${water >= 2 ? "filled" : "empty"}`,
        target: { ...view.target, level: viewLayer(lot.location) },
      });
      if (selection.lot === lot.id)
        marks
          .ellipse(
            projectCell(worldView(lot.location)).x,
            projectCell(worldView(lot.location)).y,
            12,
            6,
          )
          .stroke({ width: 2, color: 0xe6c477 });
    }
  }

  const pileTexture = (lot) =>
    lot.material === "ration"
      ? art.ration[Math.min(3, lot.quantity)]
      : lot.material === "soil"
        ? art.soil[Math.min(3, lot.quantity)]
        : art.wood[Math.min(6, lot.quantity)];
  function drawPiles(state, selection) {
    const groundWoodLots = state.materials.lots.filter(
      (lot) =>
        ["wood", "soil", "ration"].includes(lot.material) &&
        lot.location.kind === "ground",
    );
    for (const [id, view] of piles) {
      if (!groundWoodLots.some((lot) => lot.id === id)) {
        picking.remove(view.container);
        view.container.destroy({ children: true });
        piles.delete(id);
      }
    }
    for (const lot of groundWoodLots) {
      if (!piles.has(lot.id)) {
        const view = body(pileTexture(lot), art.propAnchor, 7);
        const count = label(String(lot.quantity), 7);
        count.position.set(10, 0);
        view.container.addChild(count);
        view.count = count;
        view.target = {
          kind: "lot",
          id: lot.id,
          level: viewLayer(lot.location),
          action: "inspect-lot",
        };
        view.container.cursor = "pointer";
        view.container.on("pointerdown", (event) => {
          if (!input.groundPointerOwns()) event.stopPropagation();
        });
        view.container.on("pointertap", (event) => {
          if (input.groundPointerOwns()) return;
          const dispatched = picking.recordFor(view.container)?.target;
          if (!dispatched) return;
          event.stopPropagation();
          input.lot(dispatched.id, event.global);
        });
        piles.set(lot.id, view);
        bodies.addChild(view.container);
      }
      const view = piles.get(lot.id);
      view.container.visible =
        viewLayer(lot.location) === selection.level && visible(lot.location);
      view.container.eventMode =
        viewLayer(lot.location) === selection.level &&
        visible(lot.location) &&
        !selection.tool
          ? "static"
          : "none";
      put(view.container, lot.location, 0.22);
      view.sprite.texture = pileTexture(lot);
      view.count.text = String(lot.quantity);
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.propAnchor,
        orientation: `${lot.material}:${lot.quantity}`,
        target: { ...view.target, level: viewLayer(lot.location) },
      });
      if (selection.lot === lot.id)
        marks
          .ellipse(
            projectCell(worldView(lot.location)).x,
            projectCell(worldView(lot.location)).y,
            12,
            6,
          )
          .stroke({ width: 2, color: 0xe6c477 });
    }
  }

  function drawTrees(state, selection) {
    marks.clear();
    const preview = new Set(selection.designationTargetIds || []);
    for (const tree of state.trees) {
      const view = trees.get(tree.id);
      const active = Object.values(state.actors).some(
        (person) => person.task?.target === tree.id && person.mode === "chop",
      );
      view.container.eventMode =
        selection.tool || selection.box ? "none" : "static";
      const treeStage =
        tree.felledAt !== null
          ? "stump"
          : tree.work > CHOP_TICKS / 3
            ? "notched"
            : "standing";
      view.sprite.texture = art.tree[treeStage];
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.propAnchor,
        orientation: treeStage,
        target: { ...view.target, level: viewLayer(tree) },
      });
      view.container.rotation = active ? Math.sin(state.tick * 0.6) * 0.013 : 0;
      const at = projectCell(worldView(tree));
      view.container.visible = visible(tree);
      view.container.alpha = selection.level === viewLayer(tree) ? 1 : 0.18;
      view.container.eventMode =
        selection.level === viewLayer(tree) &&
        visible(tree) &&
        !selection.tool &&
        !selection.box
          ? "static"
          : "none";
      if (selection.tree === tree.id || preview.has(tree.id))
        marks.ellipse(at.x, at.y, 14, 7).stroke({
          width: 2,
          color: preview.has(tree.id) ? 0xb9e3a6 : 0xe6c477,
        });
      if (state.jobs.some((j) => j.target === tree.id))
        marks
          .moveTo(at.x - 3, at.y - 14)
          .lineTo(at.x + 3, at.y - 8)
          .moveTo(at.x + 3, at.y - 14)
          .lineTo(at.x - 3, at.y - 8)
          .stroke({ width: 1, color: 0xffdd83 });
      if (active)
        for (let i = 0; i < 3; i++) {
          const t = (state.tick + i * 5) % 18;
          marks
            .rect(
              at.x + t * (i - 1) * 0.35,
              at.y - 9 - Math.sin((t / 18) * Math.PI) * 8,
              2,
              1,
            )
            .fill(0xe4bd7a);
        }
    }
  }

  function createHerbView(herb) {
    const view = body(
      art.herbs.mugwort[herb.stage === "ordered" ? "planted" : herb.stage],
      art.propAnchor,
      7,
    );
    view.container.eventMode = "static";
    view.container.cursor = "pointer";
    const target = {
      kind: "herb",
      id: herb.id,
      level: viewLayer(herb),
      action: "inspect-herb",
    };
    view.container.on("pointerdown", (event) => {
      if (!input.groundPointerOwns()) event.stopPropagation();
    });
    view.container.on("pointertap", (event) => {
      if (input.groundPointerOwns()) return;
      const dispatched = picking.recordFor(view.container)?.target;
      if (!dispatched) return;
      event.stopPropagation();
      input.herb(dispatched.id, event.global);
    });
    view.container.on("rightclick", (event) => {
      if (!input.groundPointerOwns()) event.stopPropagation();
    });
    return { ...view, target };
  }

  function drawHerbs(state, selection) {
    const groundMugwortLots = state.materials.lots.filter(
      (lot) => lot.material === "mugwort" && lot.location.kind === "ground",
    );
    for (const [id, view] of herbs)
      if (!state.herbs.some((herb) => herb.id === id)) {
        picking.remove(view.container);
        view.container.destroy({ children: true });
        herbs.delete(id);
      }
    for (const [id, view] of bundles)
      if (!groundMugwortLots.some((lot) => lot.id === id)) {
        picking.remove(view.container);
        view.container.destroy({ children: true });
        bundles.delete(id);
      }
    const interactive = !selection.tool && !selection.panMode && !selection.box;
    for (const herb of state.herbs) {
      if (!herbs.has(herb.id)) {
        const view = createHerbView(herb);
        herbs.set(herb.id, view);
        bodies.addChild(view.container);
      }
      const view = herbs.get(herb.id);
      const projected = projectCell(worldView(herb));
      put(view.container, herb, 0.18);
      view.container.visible =
        viewLayer(herb) === selection.level && visible(herb);
      view.container.eventMode =
        interactive &&
        viewLayer(herb) === selection.level &&
        visible(herb) &&
        herb.stage !== "ordered"
          ? "static"
          : "none";
      view.container.visible =
        viewLayer(herb) === selection.level &&
        visible(herb) &&
        herb.stage !== "ordered";
      if (herb.stage !== "ordered")
        view.sprite.texture = art.herbs.mugwort[herb.stage];
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.propAnchor,
        orientation: herb.stage,
        target: { ...view.target, level: viewLayer(herb) },
      });
      if (herb.stage === "ordered") {
        marks
          .moveTo(projected.x, projected.y)
          .lineTo(projected.x, projected.y - 17)
          .stroke({ width: 2, color: 0xb7c77d });
        marks
          .ellipse(projected.x, projected.y, 8, 4)
          .fill({ color: 0x8cae7d, alpha: 0.3 });
      }
      if (selection.herb === herb.id)
        marks.ellipse(projected.x, projected.y, 12, 6).stroke({
          width: 2,
          color: 0xe6c477,
        });
      const progress = herbGrowthProgress(herb, state.tick);
      marks.rect(projected.x - 10, projected.y + 7, 20, 2).fill(0x21362e);
      marks
        .rect(projected.x - 10, projected.y + 7, 20 * progress, 1)
        .fill(herb.stage === "ready" ? 0xe8c679 : 0x9bc99a);
    }
    for (const lot of groundMugwortLots) {
      if (!bundles.has(lot.id)) {
        const view = body(art.herbs.mugwort.bundle, art.propAnchor, 7);
        const target = {
          kind: "lot",
          id: lot.id,
          level: viewLayer(lot.location),
          action: "inspect-lot",
        };
        view.container.eventMode = "static";
        view.container.cursor = "pointer";
        view.container.on("pointerdown", (event) => {
          if (!input.groundPointerOwns()) event.stopPropagation();
        });
        view.container.on("pointertap", (event) => {
          if (input.groundPointerOwns()) return;
          const dispatched = picking.recordFor(view.container)?.target;
          if (!dispatched) return;
          event.stopPropagation();
          input.lot(dispatched.id, event.global);
        });
        view.container.on("rightclick", (event) => {
          if (!input.groundPointerOwns()) event.stopPropagation();
        });
        bundles.set(lot.id, { ...view, target });
        bodies.addChild(view.container);
      }
      const view = bundles.get(lot.id);
      const active =
        viewLayer(lot.location) === selection.level && visible(lot.location);
      view.container.visible = active;
      view.container.eventMode =
        active && !selection.tool && !selection.panMode && !selection.box
          ? "static"
          : "none";
      put(view.container, lot.location, 0.2);
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.propAnchor,
        orientation: "bundle",
        target: { ...view.target, level: viewLayer(lot.location) },
      });
      if (selection.lot === lot.id)
        marks
          .ellipse(
            projectCell(worldView(lot.location)).x,
            projectCell(worldView(lot.location)).y,
            12,
            6,
          )
          .stroke({ width: 2, color: 0xe6c477 });
    }
  }

  function drawActors(state, selection) {
    route.clear();
    for (const person of Object.values(state.actors)) {
      const view = actors.get(person.id);
      const pos = visualPosition(person);
      put(view.container, pos, 0.45);
      const activeLevel = viewLayer(pos) === selection.level;
      view.container.visible = visible(person);
      view.container.alpha = activeLevel ? 1 : 0.18;
      view.container.eventMode = activeLevel ? "static" : "none";
      const hand = carriedLot(state.materials, person.id);
      const pose = carriedActorPose(state.materials, hand, person.mode);
      const frames = (art.figures[person.figure][pose] ||
        art.figures[person.figure].idle)[person.dir];
      const frame = carriedActorFrame(state.tick, pose, person.mode, frames);
      view.sprite.texture = frames[frame];
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.pawnAnchor,
        orientation: `${pose}:${person.dir}:${frame}`,
        target: { ...view.target, level: viewLayer(pos) },
      });
      const selected = selection.selectedActors.includes(person.id);
      const visitor = !state.parties.home.members.includes(person.id);
      view.ring.visible = selected;
      view.plate.visible = activeLevel && (selected || visitor);
      const local = worldView(pos);
      const labelAt = camera.project(local.x, local.z, 2.6, local.level);
      view.plate.position.set(Math.round(labelAt.x), Math.round(labelAt.y));
      view.progress.clear();
      if (person.mode === "chop") {
        view.progress
          .rect(-11, -43, 22, 3)
          .fill(0x253a2d)
          .rect(-10, -42, (20 * person.work) / CHOP_TICKS, 1)
          .fill(0xefcb7b);
      }
      if (selected && person.traversal) {
        const start = projectCell(worldView(pos));
        route.moveTo(start.x, start.y);
        for (const cell of [
          person.traversal.edge.to,
          ...person.traversal.remaining,
        ]) {
          const point = projectCell(worldView(cell));
          route.lineTo(point.x, point.y);
        }
        route.stroke({ width: 1, color: 0xe4c278, alpha: 0.65 });
      }
    }
  }

  function drawTerrainMarks(state, selection) {
    terrainMarks.clear();
    function tile(cell, color, alpha) {
      const height = terrainCell(state.terrain, cell.x, cell.z).height;
      const points = [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ].flatMap(([dx, dz]) => {
        const p = projectCell(
          { x: cell.x + dx, z: cell.z + dz, level: 0 },
          height + 0.02,
        );
        return [p.x, p.y];
      });
      terrainMarks
        .poly(points)
        .fill({ color, alpha })
        .stroke({ width: 1, color, alpha: 0.8 });
    }
    function markFace(face, color, alpha) {
      const points = face.vertices.flatMap(({ x, y, z }) => {
        const p = projectCell({ x, z }, y);
        return [p.x, p.y];
      });
      terrainMarks
        .poly(points)
        .fill({ color, alpha })
        .stroke({ width: 1, color, alpha: 0.8 });
    }
    const pending = new Set(
      state.jobs
        .filter((job) => job.kind === "dig")
        .map((job) => job.voxel.join()),
    );
    for (const face of terrainFaces)
      if (
        face.cell.level === selection.level &&
        pending.has(face.ownerVoxel.join())
      )
        markFace(face, 0xdcb56c, 0.18);
    if (selection.fieldWater && selection.level === 0)
      tile(worldView(selection.fieldWater), 0xe6c477, 0.12);
    if (selection.tool !== "dig" || !selection.terrainStroke?.end) return;
    const faces = camera.terrainSelection(
      selection.terrainStroke.start,
      selection.terrainStroke.end,
      selection.level,
    );
    const commands = terrainDesignationCells("dig", faces);
    const problems = new Map(
      commands.map((command) => [
        command.voxel.join(),
        commandProblem(state, { ...command, party: "home", actors: null }),
      ]),
    );
    for (const face of faces)
      markFace(
        face,
        problems.get(face.ownerVoxel.join()) ? 0xe48b78 : 0xbad597,
        0.3,
      );
  }

  function drawSelectionBox(selection) {
    selectionBox.clear();
    if (!selection.box) return;
    const x = Math.min(selection.box.start.x, selection.box.current.x);
    const y = Math.min(selection.box.start.y, selection.box.current.y);
    const width = Math.abs(selection.box.current.x - selection.box.start.x);
    const height = Math.abs(selection.box.current.y - selection.box.start.y);
    selectionBox
      .rect(x, y, width, height)
      .fill({ color: 0xc7e3aa, alpha: 0.12 })
      .stroke({ width: 1, color: 0xd9edb5, alpha: 0.9 });
  }

  return {
    dispose() {
      if (ground.texture !== art.ground && ground.texture !== Texture.EMPTY)
        ground.texture.destroy(true);
      for (const { sprite } of wetSurfaces.values()) {
        if (sprite.texture !== Texture.EMPTY) sprite.texture.destroy(true);
        sprite.destroy();
      }
      wetSurfaces.clear();
      clearAirMarks();
      ground.texture = Texture.EMPTY;
    },
    render(state, selection) {
      visible = currentVisibility(state);
      drawTerrain(state, selection);
      drawTerrainMarks(state, selection);
      drawTrees(state, selection);
      drawSources(state, selection);
      drawHerbs(state, selection);
      drawPiles(state, selection);
      drawPails(state, selection);
      drawActors(state, selection);
      drawSelectionBox(selection);
      cat.container.eventMode = goblin.container.eventMode = "none";
      const catPosition = visualPosition(state.cat);
      put(cat.container, catPosition, 0.4);
      cat.container.alpha =
        viewLayer(catPosition) === selection.level ? 1 : 0.18;
      const catFrames = art.figures.cat[state.cat.mode][state.cat.dir];
      cat.sprite.texture =
        catFrames[animationFrame(state.tick, state.cat.mode, catFrames)];
      put(goblin.container, state.watcher, 0.8);
      goblin.container.visible = !!state.demand && visible(state.watcher);
      cat.container.visible = visible(state.cat);
      goblin.container.alpha = selection.level === 0 ? 1 : 0.18;
      construction.render(
        state,
        ["chop", "dig"].includes(selection.tool)
          ? { ...selection, tool: null }
          : selection,
      );
      drawWater(state, selection);
      drawAir(state, selection);
      dusk.visible = isNight(state);
      picking.renderDebug(!!selection.debugPicking);
    },
  };
}
