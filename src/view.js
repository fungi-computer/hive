import { Sprite, Container, Graphics, Rectangle, Text } from "pixi.js";
import { project } from "./art.js";
import { createConstructionView } from "./construction-view.js";
import { groundCell } from "./art/geometry.js";
import { CHOP_TICKS, WATCHER } from "./clearing.js";

function label(text, size = 7, color = 0xeee0ba) {
  const result = new Text({
    text,
    style: {
      fontFamily: "sans-serif",
      fontSize: size,
      fill: color,
      align: "center",
      lineHeight: 10,
    },
  });
  result.anchor.set(0.5);
  return result;
}
function atWorld(display, at) {
  const point = project(at.x, at.z);
  display.position.set(point.x, point.y);
  display.zIndex = point.y;
  return point;
}
function spriteBody(texture, anchor, radius) {
  const body = new Container(),
    sprite = new Sprite(texture);
  body.addChild(
    new Graphics()
      .ellipse(0, 0, radius, radius / 3)
      .fill({ color: 0x243324, alpha: 0.25 }),
  );
  sprite.anchor.set(anchor.x, anchor.y);
  body.addChild(sprite);
  return { body, sprite };
}
export function createView(app, art, trees, input) {
  app.stage.addChild(new Sprite(art.ground));
  const route = new Graphics(),
    targetRing = new Graphics();
  app.stage.addChild(route, targetRing);
  const bodies = new Container();
  bodies.sortableChildren = true;
  app.stage.addChild(bodies);
  const treeViews = trees.map((t) => {
    const view = spriteBody(art.tree.standing, art.treeAnchor, 25);
    atWorld(view.body, t);
    bodies.addChild(view.body);
    view.body.eventMode = "static";
    view.body.cursor = "pointer";
    view.body.on("pointertap", () => input.tree(t.id));
    return view;
  });
  const pawn = spriteBody(art.pawn.idle[0][0], art.pawnAnchor, 9);
  bodies.addChild(pawn.body);
  pawn.body.eventMode = "static";
  pawn.body.cursor = "pointer";
  pawn.body.hitArea = new Rectangle(-17, -57, 34, 62);
  pawn.body.on("pointertap", input.pawn);
  const ring = new Graphics()
    .ellipse(0, 0, 13, 6)
    .stroke({ width: 1, color: 0xe9cf81 });
  pawn.body.addChildAt(ring, 1);
  const name = label("ROWAN", 7, 0xf4db94);
  name.y = -59;
  const work = new Graphics();
  pawn.body.addChild(name, work);
  const goblin = spriteBody(art.goblin[0], art.pawnAnchor, 10);
  atWorld(goblin.body, WATCHER);
  bodies.addChild(goblin.body);
  const effects = new Graphics(),
    reward = label("+6 WOOD", 8, 0xf4da95);
  app.stage.addChild(effects, reward);
  const construction = createConstructionView(app, art, bodies);
  app.stage.eventMode = "static";
  app.stage.hitArea = new Rectangle(0, 0, 480, 320);
  app.stage.on("globalpointermove", (event) =>
    input.hover(groundCell(event.global.x, event.global.y)),
  );
  app.stage.on("pointertap", (event) =>
    input.place(groundCell(event.global.x, event.global.y)),
  );
  function drawTrees(state, target) {
    targetRing.clear();
    state.trees.forEach((t, i) => {
      const view = treeViews[i],
        active = state.pawn.task?.tree === t.id;
      const damaged = active && state.pawn.work > CHOP_TICKS / 3;
      view.sprite.texture =
        art.tree[
          t.felledAt !== null ? "stump" : damaged ? "notched" : "standing"
        ];
      view.body.hitArea =
        t.felledAt !== null
          ? new Rectangle(-16, -20, 32, 26)
          : new Rectangle(-39, -99, 78, 102);
      view.sprite.rotation =
        active && state.pawn.mode === "chop"
          ? Math.sin(state.tick * 0.5) * 0.009
          : 0;
      if (target === t.id) {
        const at = project(t.x, t.z);
        targetRing
          .ellipse(at.x, at.y, 20, 10)
          .stroke({ width: 1, color: 0xebce83 });
      }
    });
  }
  function drawPawn(state, selected) {
    const p = state.pawn,
      at = atWorld(pawn.body, p);
    const frames = art.pawn[p.mode][p.dir];
    pawn.sprite.texture = frames[Math.floor(state.tick / 3) % frames.length];
    ring.visible = name.visible = selected;
    route.clear();
    if (selected && p.path.length) {
      route.moveTo(at.x, at.y);
      for (const cell of p.path) {
        const q = project(cell.x, cell.z);
        route.lineTo(q.x, q.y);
      }
      route.stroke({ width: 1, color: 0xe5c777, alpha: 0.6 });
    }
    work.clear();
    if (p.mode === "chop") {
      work.roundRect(-17, -51, 34, 4, 1).fill(0x253b2f);
      work.rect(-16, -50, (32 * p.work) / CHOP_TICKS, 2).fill(0xedd08a);
    }
  }
  function drawChips(state) {
    effects.clear();
    reward.visible = false;
    const active = state.trees.find((t) => t.id === state.pawn.task?.tree);
    if (active && state.pawn.mode === "chop") {
      const at = project(active.x, active.z, 0.65),
        phase = state.tick % 24;
      for (let i = 0; i < 4; i++)
        effects
          .rect(
            at.x + phase * (i - 1.5) * 0.35,
            at.y - Math.sin((phase / 24) * Math.PI) * 10 + i,
            2,
            1,
          )
          .fill({ color: 0xe5b76e, alpha: 1 - phase / 24 });
    }
    for (const tree of state.trees) {
      if (tree.felledAt === null) continue;
      const age = state.tick - tree.felledAt;
      if (age > 65) continue;
      const at = project(tree.x, tree.z);
      reward.visible = true;
      reward.position.set(at.x, at.y - 27 - age * 0.25);
      reward.alpha = Math.min(1, (65 - age) / 20);
      for (let i = 0; i < 9; i++)
        effects
          .rect(
            at.x + Math.sin(i * 2.4) * (12 + age * 0.5),
            at.y - 20 - age * 0.3 + Math.cos(i * 3) * 12,
            3,
            2,
          )
          .fill({ color: i % 2 ? 0xc4b56c : 0x809947, alpha: 1 - age / 65 });
    }
  }
  return {
    render(state, selection) {
      pawn.body.eventMode = selection.placing ? "none" : "static";
      for (const view of treeViews)
        view.body.eventMode = selection.placing ? "none" : "static";
      drawTrees(state, selection.tree);
      drawPawn(state, selection.pawn);
      drawChips(state);
      construction.render(state, selection);
      goblin.body.visible = !!state.demand;
      goblin.sprite.texture = art.goblin[Math.floor(state.tick / 12) % 2];
    },
  };
}
