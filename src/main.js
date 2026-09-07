import {
  Application,
  Sprite,
  Container,
  Graphics,
  Rectangle,
  Text,
} from "pixi.js";
import { bakeArt, project } from "./art.js";
import { loadColony } from "./colony.js";
import { createInn, step, HEARTH, TABLE, PREP_TICKS } from "./inn.js";
import { createTicker, push } from "./ticker.js";
import "./style.css";

const $ = (selector) => document.querySelector(selector);
const [art, colony] = await Promise.all([bakeArt(), loadColony()]);
const app = new Application();
await app.init({
  width: 480,
  height: 320,
  background: 0x293931,
  antialias: false,
  resolution: 1,
  preference: "webgl",
});
$("#stage").append(app.canvas);
$("#loading").remove();
app.stage.addChild(new Sprite(art.room));
const routeView = new Graphics();
app.stage.addChild(routeView);
const bodies = new Container();
bodies.sortableChildren = true;
app.stage.addChild(bodies);
const table = new Sprite(art.table);
table.anchor.set(art.anchor.x, art.anchor.y);
const tp = project(TABLE.x, TABLE.z);
table.position.set(tp.x, tp.y);
table.zIndex = tp.y;
bodies.addChild(table);
const pawn = new Container();
bodies.addChild(pawn);
pawn.addChild(
  new Graphics().ellipse(0, 0, 10, 4).fill({ color: 0x17201c, alpha: 0.3 }),
);
const ring = new Graphics()
  .ellipse(0, 0, 14, 7)
  .stroke({ width: 1, color: 0xe9cf81 });
pawn.addChild(ring);
const sprite = new Sprite(art.pawn.keeper.idle[0][0]);
sprite.anchor.set(art.anchor.x, art.anchor.y);
pawn.addChild(sprite);
pawn.eventMode = "static";
pawn.cursor = "pointer";
pawn.hitArea = new Rectangle(-23, -50, 46, 57);
const label = new Text({
  text: "PIP",
  style: {
    fontFamily: "sans-serif",
    fontSize: 7,
    fill: 0xf4db94,
    letterSpacing: 1,
  },
});
label.anchor.set(0.5);
label.y = -55;
pawn.addChild(label);
const workBar = new Graphics();
pawn.addChild(workBar);
const hearthPoint = project(1, 0.65, 1.45);
const hearth = new Graphics()
  .ellipse(hearthPoint.x, hearthPoint.y, 26, 15)
  .fill({ color: 0xf4cf75, alpha: 0.001 });
hearth.eventMode = "static";
hearth.cursor = "pointer";
app.stage.addChild(hearth);
const steam = new Graphics();
app.stage.addChild(steam);
let inn = createInn(),
  clock = createTicker(),
  selected = false,
  pending = [];
function select() {
  selected = true;
  inn.notice = "Pip selected. Click the hearth or choose Prepare soup.";
  render();
}
pawn.on("pointertap", select);
$("#select").onclick = select;
function prepare() {
  if (!selected) {
    inn.notice = "Select Pip first, then give the hearth task.";
    render();
    return;
  }
  if (!inn.paused && inn.keeper.mode === "idle" && !inn.keeper.carrying)
    pending.push("prepare");
}
hearth.on("pointertap", prepare);
$("#task").onclick = prepare;
const portrait = document.createElement("canvas");
portrait.width = 48;
portrait.height = 50;
portrait
  .getContext("2d")
  .drawImage(
    art.pawn.keeper.idle[0][0].source.resource,
    24,
    20,
    48,
    50,
    0,
    0,
    48,
    50,
  );
$(".portrait-icon").innerHTML = `<img alt="Pip" src="${portrait.toDataURL()}">`;
$("#pause").onclick = () => {
  inn.paused = !inn.paused;
  clock.acc = 0;
  pending = [];
  render();
};
$("#reset").onclick = () => {
  inn = createInn();
  clock = createTicker();
  selected = false;
  pending = [];
  render();
};
document.addEventListener("visibilitychange", () => {
  clock.acc = 0;
  if (document.hidden) {
    inn.paused = true;
    pending = [];
    render();
  }
});
function render() {
  const p = inn.keeper,
    pos = project(p.x, p.z);
  pawn.position.set(pos.x, pos.y);
  pawn.zIndex = pos.y;
  const pose = p.carrying
    ? "carry"
    : p.mode === "walk"
      ? "walk"
      : p.mode === "work"
        ? "work"
        : "idle";
  const frames = art.pawn.keeper[pose][p.dir];
  sprite.texture = frames[Math.floor(inn.tick / 3) % frames.length];
  ring.visible = label.visible = selected;
  routeView.clear();
  if (selected && p.path.length) {
    routeView.moveTo(pos.x, pos.y);
    for (const point of p.path) {
      const q = project(point.x, point.z);
      routeView.lineTo(q.x, q.y);
    }
    routeView.stroke({ width: 1, color: 0xe5c777, alpha: 0.5 });
  }
  workBar.clear();
  if (p.mode === "work") {
    workBar.roundRect(-16, -48, 32, 4, 1).fill(0x253b2f);
    workBar.rect(-15, -47, (30 * p.work) / PREP_TICKS, 2).fill(0xedd08a);
  }
  steam.clear();
  if (p.mode === "work" || p.carrying)
    for (let i = 0; i < 3; i++) {
      const phase = (inn.tick + i * 12) % 35;
      steam
        .circle(
          hearthPoint.x - 6 + i * 5 + Math.sin(phase * 0.2) * 2,
          hearthPoint.y - 4 - phase * 0.55,
          1.3,
        )
        .fill({ color: 0xf2e2b7, alpha: (1 - phase / 35) * 0.65 });
    }
  $("#select").classList.toggle("selected", selected);
  $("#activity").textContent =
    p.mode === "walk"
      ? "Walking to the hearth"
      : p.mode === "work"
        ? "Preparing mushroom soup…"
        : p.carrying
          ? "A warm bowl, ready to serve"
          : "A quiet moment by the fire";
  $("#hint").textContent = p.carrying
    ? "Reset the inn to cook again. Guest service is coming next."
    : selected
      ? "Pip follows your task and finds the route."
      : "Select Pip, then choose something in the room.";
  $("#notice").textContent = inn.paused
    ? "Paused · the inn can wait."
    : inn.notice;
  $("#task").textContent =
    p.mode === "work"
      ? "Stirring…"
      : p.carrying
        ? "Soup ready ✓"
        : "Prepare soup ↗";
  $("#task").disabled =
    !selected || inn.paused || p.mode !== "idle" || p.carrying;
  $("#pause").textContent = inn.paused ? "▶" : "Ⅱ";
  $("#pause").setAttribute("aria-label", inn.paused ? "Resume" : "Pause");
}
app.ticker.maxFPS = 60;
app.ticker.add((t) => {
  if (!inn.paused) {
    const count = push(clock, t.deltaMS);
    for (let i = 0; i < count; i++) {
      step(inn, colony, pending);
      pending = [];
    }
  }
  render();
});
render();
window.__GOBLIN = {
  artReady: true,
  get state() {
    return structuredClone(inn);
  },
  project,
  colony,
};
