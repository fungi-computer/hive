import { Sprite, Container, Graphics, Rectangle, Text } from "pixi.js";
import { project, WIDTH, HEIGHT } from "./art/scale.js";
import { visualPosition } from "./movement.js";
import { WATCHER } from "./world.js";
import { CHOP_TICKS, isNight } from "./jobs.js";
import { createConstructionView } from "./construction-view.js";

function label(text, size = 8) {
  const result = new Text({
    text,
    style: {
      fontFamily: "sans-serif",
      fontSize: size,
      fill: 0xf3dfad,
      align: "center",
    },
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
  const container = new Container(),
    sprite = new Sprite(texture);
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
  const route = new Graphics(),
    marks = new Graphics(),
    bodies = new Container();
  route.eventMode = marks.eventMode = "none";
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
  const pawn = body(art.pawn.idle[0][0], art.pawnAnchor, 6);
  const cat = body(art.cat.idle[0][0], art.pawnAnchor, 5);
  const goblin = body(art.goblin.idle[0][0], art.pawnAnchor, 7);
  put(goblin.container, WATCHER);
  bodies.addChild(pawn.container, cat.container, goblin.container);
  pawn.container.eventMode = "static";
  pawn.container.cursor = "pointer";
  pawn.container.hitArea = new Rectangle(-11, -42, 22, 45);
  pawn.container.on("pointertap", (event) => {
    event.stopPropagation();
    input.pawn();
  });
  const ring = new Graphics()
    .ellipse(0, 0, 9, 4)
    .stroke({ width: 1, color: 0xf0d28a });
  const name = new Text({
    text: "Rowan",
    style: {
      fontFamily: "sans-serif",
      fontSize: 13,
      fontWeight: "600",
      fill: 0xf7e9cb,
    },
  });
  name.anchor.set(0.5);
  const namePlate = new Container();
  namePlate.eventMode = "none";
  namePlate.addChild(
    new Graphics()
      .roundRect(-28, -11, 56, 22, 4)
      .fill({ color: 0x1b2b24, alpha: 0.94 })
      .stroke({ color: 0xb7b585, width: 1 }),
    name,
  );
  const progress = new Graphics();
  ring.eventMode = name.eventMode = progress.eventMode = "none";
  pawn.container.addChildAt(ring, 1);
  pawn.container.addChild(progress);
  const piles = new Map();
  const construction = createConstructionView(world, art, bodies);
  const dusk = new Graphics()
    .rect(0, 0, WIDTH, HEIGHT)
    .fill({ color: 0x252342, alpha: 0.3 });
  dusk.eventMode = "none";
  world.addChild(dusk);
  app.stage.addChild(namePlate);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("globalpointermove", (e) => input.hover(camera.cell(e.global)));
  app.stage.on(
    "pointerdown",
    (e) => e.button === 0 && input.down(camera.cell(e.global)),
  );
  app.stage.on(
    "pointerup",
    (e) => e.button === 0 && input.up(camera.cell(e.global)),
  );
  app.stage.on("pointerupoutside", input.cancelDrag);
  app.stage.on("pointertap", input.ground);
  function drawPiles(state) {
    for (const [id, view] of piles)
      if (!state.piles.some((p) => p.id === id && p.amount)) {
        view.container.destroy({ children: true });
        piles.delete(id);
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
    for (const tree of state.trees) {
      const view = trees.get(tree.id),
        active = state.pawn.task?.target === tree.id;
      view.container.eventMode = selection.tool ? "none" : "static";
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
      view.sprite.rotation =
        active && state.pawn.mode === "chop"
          ? Math.sin(state.tick * 0.6) * 0.013
          : 0;
      const at = project(tree.x, tree.z);
      if (selection.tree === tree.id)
        marks.ellipse(at.x, at.y, 14, 7).stroke({ width: 1, color: 0xe6c477 });
      if (state.jobs.some((j) => j.target === tree.id))
        marks
          .moveTo(at.x - 3, at.y - 14)
          .lineTo(at.x + 3, at.y - 8)
          .moveTo(at.x + 3, at.y - 14)
          .lineTo(at.x - 3, at.y - 8)
          .stroke({ width: 1, color: 0xffdd83 });
      if (active && state.pawn.mode === "chop")
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
  function drawPawn(state, selected) {
    const p = state.pawn,
      pos = visualPosition(p);
    put(pawn.container, pos);
    pawn.container.zIndex += 0.3;
    const pose = p.mode === "walk" && p.carry ? "carry" : p.mode;
    const frames = art.pawn[pose][p.dir];
    pawn.sprite.texture = frames[Math.floor(state.tick / 2) % frames.length];
    ring.visible = namePlate.visible = selected;
    const labelAt = camera.project(pos.x, pos.z, 2.6);
    namePlate.position.set(Math.round(labelAt.x), Math.round(labelAt.y));
    route.clear();
    progress.clear();
    if (selected && p.path.length) {
      const start = project(pos.x, pos.z);
      route.moveTo(start.x, start.y);
      for (const cell of p.path) {
        const q = project(cell.x, cell.z);
        route.lineTo(q.x, q.y);
      }
      route.stroke({ width: 1, color: 0xe4c278, alpha: 0.65 });
    }
    if (p.mode === "chop") {
      progress.rect(-11, -43, 22, 3).fill(0x253a2d);
      progress.rect(-10, -42, (20 * p.work) / CHOP_TICKS, 1).fill(0xefcb7b);
    }
  }
  return {
    render(state, selection) {
      pawn.container.eventMode = selection.tool ? "none" : "static";
      drawTrees(state, selection);
      drawPiles(state);
      drawPawn(state, !!selection.actor);
      put(cat.container, visualPosition(state.cat));
      cat.container.zIndex += 0.4;
      const catFrames = art.cat[state.cat.mode][state.cat.dir];
      cat.sprite.texture =
        catFrames[Math.floor(state.tick / 2) % catFrames.length];
      goblin.container.visible = !!state.demand;
      construction.render(state, selection);
      dusk.visible = isNight(state);
    },
  };
}
