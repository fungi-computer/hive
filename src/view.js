import { Sprite, Container, Graphics, Text } from "pixi.js";
import { projectCell, WIDTH, HEIGHT } from "./art/scale.js";
import { visualPosition } from "./movement.js";
import { WATCHER, inside } from "./world.js";
import { CHOP_TICKS } from "./activity.ts";
import { HARVEST_TICKS, HERB_READY_TICKS, SOW_TICKS } from "./herbs.ts";
import { isNight } from "./routine.ts";
import { createConstructionView } from "./construction-view.js";
import { createVisualHitGeometryOwner } from "./visual-hit-geometry.js";

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

export function createView(app, world, camera, art, initial, input) {
  world.addChild(new Sprite(art.ground));
  const route = new Graphics();
  const marks = new Graphics();
  const selectionBox = new Graphics();
  const bodies = new Container();
  route.eventMode = marks.eventMode = selectionBox.eventMode = "none";
  bodies.sortableChildren = true;
  world.addChild(route, marks, bodies);
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
    if (fromCanvas(e)) input.ground();
  });
  app.stage.on("rightclick", (e) => {
    if (fromCanvas(e))
      input.groundRight(camera.cell(e.global, input.level()), e.global);
  });

  function drawPiles(state, selection) {
    for (const [id, view] of piles) {
      if (!state.piles.some((p) => p.id === id && p.amount)) {
        view.container.destroy({ children: true });
        piles.delete(id);
      }
    }
    for (const pile of state.piles.filter((p) => p.amount)) {
      if (!piles.has(pile.id)) {
        const view = body(
          art.wood[Math.min(6, pile.amount)],
          art.propAnchor,
          7,
        );
        const count = label(String(pile.amount), 7);
        count.position.set(10, 0);
        view.container.addChild(count);
        view.count = count;
        piles.set(pile.id, view);
        bodies.addChild(view.container);
      }
      const view = piles.get(pile.id);
      view.container.visible = pile.level === selection.level;
      view.container.eventMode =
        pile.level === selection.level && !selection.tool ? "static" : "none";
      put(view.container, pile, 0.22);
      view.sprite.texture = art.wood[Math.min(6, pile.amount)];
      view.count.text = String(pile.amount);
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
    for (const [id, view] of herbs)
      if (!state.herbs.some((herb) => herb.id === id)) {
        picking.remove(view.container);
        view.container.destroy({ children: true });
        herbs.delete(id);
      }
    for (const [id, view] of bundles)
      if (!state.herbBundles.some((bundle) => bundle.id === id)) {
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
      const progress =
        herb.stage === "ordered"
          ? herb.work / SOW_TICKS
          : herb.stage === "ready"
            ? herb.work / HARVEST_TICKS
            : Math.min(1, (state.tick - herb.plantedAt) / HERB_READY_TICKS);
      marks.rect(projected.x - 10, projected.y + 7, 20, 2).fill(0x21362e);
      marks
        .rect(projected.x - 10, projected.y + 7, 20 * progress, 1)
        .fill(herb.stage === "ready" ? 0xe8c679 : 0x9bc99a);
    }
    for (const bundle of state.herbBundles) {
      if (!bundles.has(bundle.id)) {
        const view = body(art.herbs.mugwort.bundle, art.propAnchor, 7);
        const target = {
          kind: "bundle",
          id: bundle.id,
          level: bundle.location.level ?? 0,
          action: "inspect-bundle",
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
          input.bundle(dispatched.id, event.global);
        });
        view.container.on("rightclick", (event) => {
          if (!input.groundPointerOwns()) event.stopPropagation();
        });
        bundles.set(bundle.id, { ...view, target });
        bodies.addChild(view.container);
      }
      const view = bundles.get(bundle.id);
      const ground = bundle.location.kind === "ground";
      const active = ground && bundle.location.level === selection.level;
      view.container.visible = active;
      view.container.eventMode =
        active && !selection.tool && !selection.panMode && !selection.box
          ? "static"
          : "none";
      if (!ground) continue;
      put(view.container, bundle.location, 0.2);
      picking.bind(view.container, {
        texture: view.sprite.texture,
        anchor: art.propAnchor,
        orientation: "bundle",
        target: { ...view.target, level: bundle.location.level },
      });
      if (selection.bundle === bundle.id)
        marks
          .ellipse(
            projectCell(bundle.location).x,
            projectCell(bundle.location).y,
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
      const carryingHerb = state.herbBundles.some(
        (bundle) =>
          bundle.location.kind === "carried" &&
          bundle.location.actor === person.id,
      );
      const pose = carryingHerb
        ? "carry-herb"
        : person.mode === "walk" && person.cargo
          ? "carry"
          : person.mode;
      const frames = (art.figures[person.figure][pose] ||
        art.figures[person.figure].idle)[person.dir];
      const frame =
        pose === "carry-herb" && person.mode !== "walk"
          ? 0
          : animationFrame(state.tick, pose, frames);
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
      drawTrees(state, selection);
      drawHerbs(state, selection);
      drawPiles(state, selection);
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
        selection.tool === "chop" ? { ...selection, tool: null } : selection,
      );
      dusk.visible = isNight(state);
      picking.renderDebug(!!selection.debugPicking);
    },
  };
}
