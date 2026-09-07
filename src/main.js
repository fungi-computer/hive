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
import {
  createInn,
  canCommand,
  step,
  TABLE,
  PREP_TICKS,
  EAT_TICKS,
} from "./inn.js";
import { createTicker, push } from "./ticker.js";
import "./style.css";

// A normal async function avoids a production dynamic-import/top-level-await cycle.
async function startInn() {
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
  app.canvas.setAttribute(
    "aria-label",
    "The Moss and Ladle inn. Use the Pip portrait and task button below to play.",
  );
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
  function pawnView(kind) {
    const body = new Container();
    bodies.addChild(body);
    body.addChild(
      new Graphics().ellipse(0, 0, 10, 4).fill({ color: 0x17201c, alpha: 0.3 }),
    );
    const sprite = new Sprite(art.pawn[kind].idle[0][0]);
    sprite.anchor.set(art.anchor.x, art.anchor.y);
    body.addChild(sprite);
    body.eventMode = "static";
    body.cursor = "pointer";
    body.hitArea = new Rectangle(-23, -50, 46, 57);
    return { body, sprite };
  }
  const keeperView = pawnView("keeper"),
    guestView = pawnView("guest");
  const ring = new Graphics()
    .ellipse(0, 0, 14, 7)
    .stroke({ width: 1, color: 0xe9cf81 });
  keeperView.body.addChildAt(ring, 1);
  function textLabel(text, size = 7, color = 0xeee0ba) {
    return new Text({
      text,
      style: {
        fontFamily: "sans-serif",
        fontSize: size,
        fill: color,
        align: "center",
        lineHeight: 10,
      },
    });
  }
  const name = textLabel("PIP", 7, 0xf4db94);
  name.anchor.set(0.5);
  name.y = -55;
  keeperView.body.addChild(name);
  const workBar = new Graphics();
  keeperView.body.addChild(workBar);
  const bubble = new Container(),
    bubbleShape = new Graphics(),
    bubbleText = textLabel("");
  bubble.addChild(bubbleShape, bubbleText);
  bubbleText.anchor.set(0.5);
  bubbleText.y = -72;
  app.stage.addChild(bubble);
  const hearthPoint = project(1, 0.65, 1.45);
  const hearthGlow = new Graphics()
    .ellipse(hearthPoint.x, hearthPoint.y, 23, 11)
    .stroke({ width: 1, color: 0xe6c875, alpha: 0.6 });
  hearthGlow.visible = false;
  app.stage.addChild(hearthGlow);
  const hearth = new Graphics()
    .ellipse(hearthPoint.x, hearthPoint.y, 26, 15)
    .fill({ color: 0xf4cf75, alpha: 0.001 });
  hearth.eventMode = "static";
  hearth.cursor = "pointer";
  app.stage.addChild(hearth);
  const steam = new Graphics(),
    hearts = new Graphics();
  app.stage.addChild(steam, hearts);
  let inn = createInn(),
    clock = createTicker(),
    selected = false,
    pending = [],
    uiNotice = "",
    lastNotice = inn.notice;
  function select() {
    selected = true;
    uiNotice = "Pip selected. Choose the hearth, a guest, or the task below.";
    render();
  }
  keeperView.body.on("pointertap", select);
  $("#select").onclick = select;
  function request(kind) {
    if (!selected) {
      uiNotice = "Select Pip first, then give a task.";
      render();
      return;
    }
    if (inn.paused || inn.keeper.mode !== "idle") return;
    if (kind === "prepare" && inn.keeper.carrying) {
      uiNotice = "Pip has a bowl already. Deliver it to a waiting guest.";
      render();
      return;
    }
    if (!canCommand(inn, kind)) {
      uiNotice = "Let the traveler pass, then use the hearth.";
      render();
      return;
    }
    uiNotice = "";
    pending.push(kind);
  }
  hearth.on("pointertap", () => request("prepare"));
  hearth.on("pointerover", () => {
    hearthGlow.visible = selected;
  });
  hearth.on("pointerout", () => {
    hearthGlow.visible = false;
  });
  guestView.body.on("pointertap", () => {
    if (!selected) {
      uiNotice = "Select Pip to help this guest.";
      render();
      return;
    }
    if (inn.guest?.mode === "waiting" && inn.keeper.carrying)
      request("deliver");
    else {
      uiNotice =
        inn.guest?.mode === "waiting"
          ? `${inn.guest.name} would like mushroom soup. Choose Prepare soup.`
          : "This guest is getting comfortable.";
      render();
    }
  });
  $("#task").onclick = () =>
    request(inn.keeper.carrying ? "deliver" : "prepare");
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
  $(".portrait-icon").innerHTML =
    `<img alt="Pip" src="${portrait.toDataURL()}">`;
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
    uiNotice = "";
    lastNotice = inn.notice;
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
  function renderPawn(view, p, kind) {
    const pos = project(p.x, p.z);
    view.body.position.set(pos.x, pos.y);
    view.body.zIndex = pos.y;
    const moving = ["walk", "arriving", "leaving"].includes(p.mode);
    const pose = p.carrying
      ? moving
        ? "carryWalk"
        : "carry"
      : moving
        ? "walk"
        : p.mode === "work"
          ? "work"
          : p.mode === "happy"
            ? "cheer"
            : "idle";
    const frames = art.pawn[kind][pose][p.dir];
    view.sprite.texture = frames[Math.floor(inn.tick / 3) % frames.length];
    return pos;
  }
  function render() {
    const p = inn.keeper,
      g = inn.guest,
      pos = renderPawn(keeperView, p, "keeper");
    ring.visible = name.visible = selected;
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
    renderGuest(g);
    renderEffects(p, pos);
    renderHud(p, g);
  }
  function renderGuest(g) {
    guestView.body.visible = bubble.visible = !!g;
    if (g) {
      const at = renderPawn(guestView, g, "guest");
      bubble.position.set(at.x, at.y);
      const message =
        g.mode === "arriving"
          ? "A table for one?"
          : g.mode === "waiting"
            ? "Mushroom soup, please."
            : g.mode === "eating"
              ? "Mmm… lovely and warm."
              : g.mode === "happy"
                ? "♥  Best soup in the bog!"
                : "See you again!";
      bubbleText.text = `${g.name.toUpperCase()}\n${message}`;
      const w = Math.max(78, bubbleText.width + 16);
      bubbleShape
        .clear()
        .roundRect(-w / 2, -88, w, 31, 4)
        .fill({ color: 0x213b30, alpha: 0.97 })
        .stroke({ width: 1, color: g.mode === "happy" ? 0xecc982 : 0x90a078 });
      bubbleShape.moveTo(-3, -57).lineTo(0, -53).lineTo(3, -57).fill(0x213b30);
      if (g.mode === "eating")
        bubbleShape
          .rect(-w / 2 + 7, -61, ((w - 14) * g.work) / EAT_TICKS, 1)
          .fill(0xd5b679);
    }
  }
  function renderEffects(p, pos) {
    steam.clear();
    if (p.mode === "work" || p.carrying)
      for (let i = 0; i < 3; i++) {
        const phase = (inn.tick + i * 12) % 35;
        const at = p.carrying ? { x: pos.x - 4, y: pos.y - 21 } : hearthPoint;
        steam
          .circle(
            at.x - 6 + i * 5 + Math.sin(phase * 0.2) * 2,
            at.y - 4 - phase * 0.45,
            1.2,
          )
          .fill({ color: 0xf2e2b7, alpha: (1 - phase / 35) * 0.6 });
      }
    hearts.clear();
    if (inn.celebration && inn.tick - inn.celebration.tick < 55) {
      const age = inn.tick - inn.celebration.tick,
        at = project(5, 3);
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        hearts
          .circle(
            at.x + Math.cos(a) * (10 + age * 0.35),
            at.y - 24 - age * 0.5 + Math.sin(a) * 9,
            1.4,
          )
          .fill({ color: i % 2 ? 0xefcf7e : 0xa7c77d, alpha: 1 - age / 55 });
      }
    }
  }
  function renderHud(p, g) {
    if (lastNotice !== inn.notice) {
      uiNotice = "";
      lastNotice = inn.notice;
    }
    const waiting = g?.mode === "waiting";
    let activity = waiting
      ? `${g.name} is waiting for soup`
      : "A quiet moment by the fire";
    let hint = "Click the hearth or choose Prepare soup.",
      action = "Prepare soup ↗";
    if (p.mode === "walk") {
      activity =
        p.task === "deliver"
          ? `Bringing soup to ${g?.name ?? "the table"}`
          : "Walking to the hearth";
      action = "On the way…";
    } else if (p.mode === "work") {
      activity = "Preparing mushroom soup…";
      action = "Stirring…";
    } else if (p.carrying) {
      activity = "A warm bowl, ready to serve";
      hint = waiting
        ? "Click the guest or choose Deliver soup."
        : "Keep it warm. A hungry traveler will be along.";
      action = waiting ? `Deliver to ${g.name} ↗` : "Waiting for a guest";
    } else if (["arriving", "leaving"].includes(g?.mode)) {
      action = `Let ${g.name} pass`;
      hint = "The hearth will be free once the traveler passes.";
    }
    if (!selected) hint = "Select Pip, then choose something in the room.";
    $("#select").classList.toggle("selected", selected);
    $("#activity").textContent = activity;
    $("#hint").textContent = hint;
    $("#task").textContent = action;
    $("#task").disabled =
      !selected || !canCommand(inn, p.carrying ? "deliver" : "prepare");
    $("#notice").textContent = inn.paused
      ? "Paused · the inn can wait."
      : uiNotice || inn.notice;
    $("#score").textContent =
      `${inn.satisfied} happy ${inn.satisfied === 1 ? "guest" : "guests"}`;
    $("#pause").textContent = inn.paused ? "▶" : "Ⅱ";
    $("#pause").setAttribute("aria-label", inn.paused ? "Resume" : "Pause");
    renderFeed(g);
  }
  function renderFeed(g) {
    let status;
    if (inn.paused) status = "paused";
    else if (g)
      status =
        inn.tick >= inn.feed.nextAt
          ? "waiting for a free table"
          : `#${inn.feed.sequence} · ${g.name} arrived`;
    else
      status =
        inn.tick >= inn.feed.nextAt
          ? "waiting for a clear path"
          : `next arrival in ${Math.ceil((inn.feed.nextAt - inn.tick) / 20)}s`;
    $("#feed").textContent = `FAKE SHIITAKE · ${status}`;
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
}
startInn().catch((error) => {
  console.error(error);
  const loading = document.querySelector("#loading");
  if (loading)
    loading.textContent = "The inn could not open. Reload to try again.";
});
