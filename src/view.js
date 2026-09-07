import { Sprite, Container, Graphics, Rectangle, Text } from "pixi.js";
import { project, WIDTH, HEIGHT } from "./art/scale.js";
import { visualPosition } from "./movement.js";
import { WATCHER } from "./world.js";
import { CHOP_TICKS } from "./activity.ts";
import { isNight } from "./routine.ts";
import { createConstructionView } from "./construction-view.js";

function label(text, size = 8) {
  const result = new Text({
    text,
    style: { fontFamily: "sans-serif", fontSize: size, fill: 0xf3dfad },
  });
  result.anchor.set(0.5);
  return result;
}

function put(display, at) {
  const point = project(at.x, at.z);
  display.position.set(point.x, point.y);
  display.zIndex = at.x + at.z;
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

export function createView(app, world, camera, art, initial, input) {
  world.addChild(new Sprite(art.ground));
  const route = new Graphics();
  const marks = new Graphics();
  const selectionBox = new Graphics();
  const bodies = new Container();
  route.eventMode = marks.eventMode = selectionBox.eventMode = "none";
  bodies.sortableChildren = true;
  world.addChild(route, marks, bodies);

  const trees = new Map();
  for (const tree of initial.trees) {
    const view = body(art.tree.standing, art.propAnchor, 13);
    put(view.container, tree);
    bodies.addChild(view.container);
    view.container.eventMode = "static";
    view.container.cursor = "pointer";
    view.container.hitArea = new Rectangle(-22, -62, 44, 66);
    const choose = (event) => {
      event.stopPropagation();
      input.tree(tree.id, event.global);
    };
    view.container.on("pointertap", choose);
    view.container.on("rightclick", choose);
    trees.set(tree.id, view);
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
    view.container.hitArea = new Rectangle(-13, -45, 26, 48);
    view.container.on("pointertap", (event) => {
      event.stopPropagation();
      input.actor(
        person.id,
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
    actors.set(person.id, { ...view, ring, plate, progress });
  }

  const cat = body(art.figures.cat.idle[0][0], art.pawnAnchor, 5);
  const goblin = body(art.figures.goblin.idle[0][0], art.pawnAnchor, 7);
  put(goblin.container, WATCHER);
  bodies.addChild(cat.container, goblin.container);

  const piles = new Map();
  const construction = createConstructionView(world, art, bodies);
  const dusk = new Graphics()
    .rect(0, 0, WIDTH, HEIGHT)
    .fill({ color: 0x252342, alpha: 0.3 });
  dusk.eventMode = "none";
  world.addChild(dusk);
  app.stage.addChild(selectionBox);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("globalpointermove", (e) => {
    input.move(camera.cell(e.global), e.global);
  });
  app.stage.on("pointerdown", (e) => {
    if (e.button === 0) input.down(camera.cell(e.global), e.global);
  });
  app.stage.on("pointerup", (e) => {
    if (e.button === 0) input.up(camera.cell(e.global), e.global);
  });
  app.stage.on("pointerupoutside", input.cancelDrag);
  app.stage.on("pointertap", input.ground);

  function drawPiles(state) {
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
      put(view.container, pile);
      view.container.zIndex += 0.1;
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
      view.sprite.texture =
        art.tree[
          tree.felledAt !== null
            ? "stump"
            : tree.work > CHOP_TICKS / 3
              ? "notched"
              : "standing"
        ];
      view.container.hitArea =
        tree.felledAt !== null
          ? new Rectangle(-9, -10, 18, 15)
          : new Rectangle(-22, -62, 44, 66);
      view.sprite.rotation = active ? Math.sin(state.tick * 0.6) * 0.013 : 0;
      const at = project(tree.x, tree.z);
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

  function drawActors(state, selection) {
    route.clear();
    for (const person of Object.values(state.actors)) {
      const view = actors.get(person.id);
      const pos = visualPosition(person);
      put(view.container, pos);
      view.container.zIndex += 0.3;
      const pose =
        person.mode === "walk" && person.cargo ? "carry" : person.mode;
      const frames = (art.figures[person.figure][pose] ||
        art.figures[person.figure].idle)[person.dir];
      view.sprite.texture = frames[Math.floor(state.tick / 2) % frames.length];
      const selected = selection.selectedActors.includes(person.id);
      const visitor = !state.parties.home.members.includes(person.id);
      view.ring.visible = selected;
      view.plate.visible = selected || visitor;
      const labelAt = camera.project(pos.x, pos.z, 2.6);
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
        const start = project(pos.x, pos.z);
        route.moveTo(start.x, start.y);
        for (const cell of person.path) {
          const point = project(cell.x, cell.z);
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
      drawPiles(state);
      drawActors(state, selection);
      drawSelectionBox(selection);
      cat.container.eventMode = goblin.container.eventMode = "none";
      put(cat.container, visualPosition(state.cat));
      cat.container.zIndex += 0.4;
      const catFrames = art.figures.cat[state.cat.mode][state.cat.dir];
      cat.sprite.texture =
        catFrames[Math.floor(state.tick / 2) % catFrames.length];
      goblin.container.visible = !!state.demand;
      construction.render(
        state,
        selection.tool === "chop" ? { ...selection, tool: null } : selection,
      );
      dusk.visible = isNight(state);
    },
  };
}
