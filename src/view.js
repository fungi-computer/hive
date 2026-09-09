import { Texture, Sprite, Container, Graphics, Text } from "pixi.js";
import { projectCell, WIDTH, HEIGHT } from "./art/scale.js";
import { visualPosition } from "./movement.js";
import { WATCHER, inside } from "./world.js";
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
  terrainColumn,
  terrainWater,
  terrainGeometryKey,
} from "./terrain.ts";
import { terrainDesignationCells } from "./ui-actions.ts";
import { commandProblem } from "./orders.ts";

function label(text, size = 8) {
  const result = new Text({
    text,
    style: { fontFamily: "sans-serif", fontSize: size, fill: 0xf3dfad },
  });
  result.anchor.set(0.5);
  return result;
}

function depthKey(at, layer = 0) {
  return at.x + at.z + (at.level ?? 0) * 0.35 + layer;
}

function put(display, at, layer = 0) {
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
  const ground = new Sprite(art.ground);
  world.addChild(ground);
  let terrainSource = null,
    terrainRevision = -1;
  function drawTerrain(state) {
    if (
      terrainSource === terrainGeometryKey(state.terrain) &&
      terrainRevision === terrainVersion(state.terrain)
    )
      return;
    terrainSource = terrainGeometryKey(state.terrain);
    terrainRevision = terrainVersion(state.terrain);
    const previous = ground.texture;
    ground.texture = terrainChangedColumns(state.terrain).length
      ? art.bakeTerrain(
          state.terrain,
          art.ground,
          terrainChangedColumns(state.terrain),
        )
      : art.ground;
    if (previous !== ground.texture && previous !== art.ground)
      previous.destroy(true);
    camera.setTerrain(state.terrain);
  }
  const wetSurface = new Sprite(Texture.EMPTY);
  wetSurface.eventMode = "none";
  world.addChild(wetSurface);
  let waterCheckpoint = null,
    waterPixels = null;
  function drawWater(state) {
    if (waterCheckpoint === state.terrain) return;
    waterCheckpoint = state.terrain;
    const water = terrainWater(state.terrain);
    // The same rounded projection as the existing low-resolution bake. This
    // invalidates on visible geometry, without throttling physical advancement.
    const pixels = JSON.stringify([
      terrainGeometryKey(state.terrain),
      water.map((surface) => [
        surface.depthM > 0,
        [-0.5, 0.5].flatMap((dx) =>
          [-0.5, 0.5].map((dz) =>
            projectCell(
              { x: surface.x + dx, z: surface.z + dz },
              surface.height,
            ),
          ),
        ),
      ]),
    ]);
    if (pixels === waterPixels) return;
    waterPixels = pixels;
    const previous = wetSurface.texture;
    wetSurface.texture = water.some((column) => column.depthM > 0)
      ? art.bakeTerrainWater(state.terrain, water)
      : Texture.EMPTY;
    if (previous !== Texture.EMPTY) previous.destroy(true);
  }
  drawTerrain(initial);
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
      level: tree.level,
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
      level: person.level,
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
  put(goblin.container, WATCHER, 0.8);
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
    if (inside(cell)) input.move(cell, e.global);
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
          level: source.level,
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
      const active = source.level === selection.level;
      view.container.visible = active;
      view.container.eventMode = active && interactive ? "static" : "none";
      put(view.container, source, 0.24);
      view.sprite.texture = texture;
      picking.bind(view.container, {
        texture,
        anchor: art.propAnchor,
        orientation: `${source.kind}:${stateName}`,
        target: { ...view.target, level: source.level },
      });
      if (selection.source === source.id)
        marks
          .ellipse(projectCell(source).x, projectCell(source).y, 14, 7)
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
          level: lot.location.level,
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
      const active = lot.location.level === selection.level;
      view.container.visible = active;
      view.container.eventMode = active && interactive ? "static" : "none";
      put(view.container, lot.location, 0.21);
      view.sprite.texture = texture;
      picking.bind(view.container, {
        texture,
        anchor: art.propAnchor,
        orientation: `pail:${water >= 2 ? "filled" : "empty"}`,
        target: { ...view.target, level: lot.location.level },
      });
      if (selection.lot === lot.id)
        marks
          .ellipse(
            projectCell(lot.location).x,
            projectCell(lot.location).y,
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
          level: lot.location.level,
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
      view.container.visible = lot.location.level === selection.level;
      view.container.eventMode =
        lot.location.level === selection.level && !selection.tool
          ? "static"
          : "none";
      put(view.container, lot.location, 0.22);
      view.sprite.texture = pileTexture(lot);
      view.count.text = String(lot.quantity);
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.propAnchor,
        orientation: `${lot.material}:${lot.quantity}`,
        target: { ...view.target, level: lot.location.level },
      });
      if (selection.lot === lot.id)
        marks
          .ellipse(
            projectCell(lot.location).x,
            projectCell(lot.location).y,
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
        target: { ...view.target, level: tree.level },
      });
      view.container.rotation = active ? Math.sin(state.tick * 0.6) * 0.013 : 0;
      const at = projectCell(tree);
      view.container.visible = true;
      view.container.alpha = selection.level === 0 ? 1 : 0.18;
      view.container.eventMode =
        selection.level === 0 && !selection.tool && !selection.box
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
      level: herb.level,
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
      const projected = projectCell(herb);
      put(view.container, herb, 0.18);
      view.container.visible = herb.level === selection.level;
      view.container.eventMode =
        interactive &&
        herb.level === selection.level &&
        herb.stage !== "ordered"
          ? "static"
          : "none";
      view.container.visible =
        herb.level === selection.level && herb.stage !== "ordered";
      if (herb.stage !== "ordered")
        view.sprite.texture = art.herbs.mugwort[herb.stage];
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.propAnchor,
        orientation: herb.stage,
        target: { ...view.target, level: herb.level },
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
          level: lot.location.level,
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
      const active = lot.location.level === selection.level;
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
        target: { ...view.target, level: lot.location.level },
      });
      if (selection.lot === lot.id)
        marks
          .ellipse(
            projectCell(lot.location).x,
            projectCell(lot.location).y,
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
      put(view.container, pos, pos.level >= 1 ? 0.45 : 0.1);
      const activeLevel = Math.round(pos.level) === selection.level;
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
        target: { ...view.target, level: person.level },
      });
      const selected = selection.selectedActors.includes(person.id);
      const visitor = !state.parties.home.members.includes(person.id);
      view.ring.visible = selected;
      view.plate.visible = activeLevel && (selected || visitor);
      const labelAt = camera.project(pos.x, pos.z, 2.6, pos.level);
      view.plate.position.set(Math.round(labelAt.x), Math.round(labelAt.y));
      view.progress.clear();
      if (person.mode === "chop") {
        view.progress
          .rect(-11, -43, 22, 3)
          .fill(0x253a2d)
          .rect(-10, -42, (20 * person.work) / CHOP_TICKS, 1)
          .fill(0xefcb7b);
      }
      if (selected && person.path.length) {
        const start = projectCell(pos);
        route.moveTo(start.x, start.y);
        for (const cell of person.path) {
          const point = projectCell(cell);
          route.lineTo(point.x, point.y);
        }
        route.stroke({ width: 1, color: 0xe4c278, alpha: 0.65 });
      }
    }
  }

  function drawTerrainMarks(state, selection) {
    terrainMarks.clear();
    if (selection.level !== 0) return;
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
    for (const job of state.jobs)
      if (job.kind === "dig") tile(terrainColumn(job.voxel), 0xdcb56c, 0.18);
    if (selection.fieldWater) tile(selection.fieldWater, 0xe6c477, 0.12);
    if (!["dig"].includes(selection.tool) || !selection.at) return;
    const cells = terrainDesignationCells(
      selection.tool,
      selection.drag,
      selection.at,
      state.terrain,
    );
    for (const cell of cells) {
      const problem = commandProblem(state, {
        ...cell,
        party: "home",
        actors: null,
      });
      tile(terrainColumn(cell.voxel), problem ? 0xe48b78 : 0xbad597, 0.3);
    }
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
    render(state, selection) {
      drawTerrain(state);
      drawWater(state);
      drawTerrainMarks(state, selection);
      drawTrees(state, selection);
      drawSources(state, selection);
      drawHerbs(state, selection);
      drawPiles(state, selection);
      drawPails(state, selection);
      drawActors(state, selection);
      drawSelectionBox(selection);
      cat.container.eventMode = goblin.container.eventMode = "none";
      put(cat.container, visualPosition(state.cat), 0.4);
      cat.container.alpha = selection.level === 0 ? 1 : 0.18;
      const catFrames = art.figures.cat[state.cat.mode][state.cat.dir];
      cat.sprite.texture =
        catFrames[animationFrame(state.tick, state.cat.mode, catFrames)];
      goblin.container.visible = !!state.demand;
      goblin.container.alpha = selection.level === 0 ? 1 : 0.18;
      construction.render(
        state,
        ["chop", "dig"].includes(selection.tool)
          ? { ...selection, tool: null }
          : selection,
      );
      dusk.visible = isNight(state);
      picking.renderDebug(!!selection.debugPicking);
    },
  };
}
