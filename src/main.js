import { Application, Container } from "pixi.js";
import { bakeArt } from "./art.js";
import { loadColony } from "./colony.js";
import { createClearing, commandProblem, step } from "./clearing.js";
import { createTicker, push } from "./ticker.js";
import { createView } from "./view.js";
import { createCamera } from "./camera.js";
import { createKeys } from "./keys.js";
import { dragCells } from "./construction-view.js";
import { createHud } from "./hud.jsx";
import "./style.css";

const newSelection = () => ({
  actor: null,
  tree: null,
  context: null,
  panel: null,
  tool: null,
  at: { x: 7, z: 7, level: 0 },
  direction: 0,
  drag: null,
  cutaway: true,
  panMode: false,
  help: true,
});

// Ordinary async bootstrap avoids Pixi's production dynamic-import/TLA cycle.
async function startGame() {
  const host = document.querySelector("#stage");
  const [art, colony] = await Promise.all([bakeArt(), loadColony()]);
  const app = new Application();
  await app.init({
    width: host.clientWidth,
    height: host.clientHeight,
    background: 0x293931,
    antialias: false,
    resolution: 1,
    preference: "webgl",
  });
  host.append(app.canvas);
  app.canvas.setAttribute(
    "aria-label",
    "Goblin country. Select a person, choose an oak to chop, or place a home blueprint.",
  );
  const world = new Container();
  app.stage.addChild(world);
  const camera = createCamera(app, host, world);
  let state = createClearing(),
    clock = createTicker(),
    ui = newSelection();
  let pending = [],
    speed = 1,
    notice = "",
    lastNotice = state.notice;
  let hudDirty = true;

  function select(actor) {
    ui.actor = actor;
    ui.panel = "character";
    ui.context = null;
    ui.tool = null;
    ui.drag = null;
    notice = "Rowan selected. Click an oak to give him work.";
    if (app.screen.width <= 760)
      camera.focus(state.pawn, Math.max(220, (app.screen.height - 320) / 2));
    hudDirty = true;
  }
  function request(command) {
    if (!ui.actor) {
      notice = "Select Rowan to give work.";
      hudDirty = true;
      return;
    }
    const problem = commandProblem(state, command);
    if (problem) {
      notice = problem;
      hudDirty = true;
      return;
    }
    pending.push(command);
    ui.context = null;
    notice = "Order received; waiting for the next step.";
    hudDirty = true;
  }
  function close() {
    if (ui.context) ui.context = null;
    else if (ui.tool) {
      ui.tool = null;
      ui.drag = null;
    } else ui.panel = null;
    hudDirty = true;
  }
  function clearPointerIntent() {
    ui.context = null;
    ui.drag = null;
  }
  function reset() {
    state = createClearing();
    clock = createTicker();
    ui = newSelection();
    pending = [];
    speed = 1;
    notice = "";
    lastNotice = state.notice;
    camera.reset();
    hudDirty = true;
  }
  function send(action) {
    switch (action.kind) {
      case "select":
        select(action.actor);
        break;
      case "command":
        request(action.command);
        break;
      case "panel":
        ui.panel = ui.panel === action.panel ? null : action.panel;
        ui.context = null;
        ui.tool = null;
        ui.drag = null;
        break;
      case "close":
        close();
        break;
      case "close-target":
        ui.context = null;
        break;
      case "tool":
        ui.tool = action.tool;
        ui.panMode = false;
        ui.drag = null;
        ui.context = null;
        break;
      case "rotate":
        ui.direction = 1 - ui.direction;
        break;
      case "finish-placement":
        ui.tool = null;
        ui.drag = null;
        break;
      case "cutaway":
        ui.cutaway = action.value;
        break;
      case "help":
        ui.help = !ui.help;
        break;
      case "pause":
        state.paused = !state.paused;
        clock.acc = 0;
        break;
      case "speed":
        speed = speed === 1 ? 4 : 1;
        break;
      case "focus":
        clearPointerIntent();
        camera.focus(state.pawn);
        break;
      case "zoom":
        clearPointerIntent();
        camera.zoomBy(action.delta);
        break;
      case "pan":
        clearPointerIntent();
        camera.pan(action.x, action.y);
        break;
      case "pan-mode":
        ui.panMode = !ui.panMode;
        ui.tool = null;
        ui.drag = null;
        ui.context = null;
        break;
      case "reset":
        reset();
        break;
      case "fullscreen":
        (document.fullscreenElement
          ? document.exitFullscreen()
          : document.documentElement.requestFullscreen()
        ).catch(() => {
          notice = "Browser fullscreen is unavailable here.";
          hudDirty = true;
        });
        break;
    }
    hudDirty = true;
  }
  const hud = createHud(document.querySelector("#hud"), art, send);
  const root = document.querySelector("#game");
  root.tabIndex = -1;
  const keys = createKeys(
    root,
    () => ({
      ...ui,
      chopAllowed:
        !!ui.actor && !commandProblem(state, { kind: "chop", tree: ui.tree }),
    }),
    send,
    () => {
      hudDirty = true;
    },
  );
  root.addEventListener("click", (event) => {
    // Pointer users return to world shortcuts; keyboard focus stays on controls.
    if (
      event.detail &&
      !event.target.closest("input, textarea, select, [contenteditable]")
    )
      root.focus({ preventScroll: true });
  });
  root.focus({ preventScroll: true });
  const view = createView(app, world, camera, art, state, {
    pawn: () => select("rowan"),
    tree(id, point) {
      if (ui.tool || ui.panMode) return;
      ui.tree = id;
      ui.context = { ...point };
      hudDirty = true;
    },
    hover(at) {
      ui.at = at;
      if (ui.tool) hudDirty = true;
    },
    down(at) {
      if (ui.tool) {
        ui.drag = at;
        ui.at = at;
      }
    },
    up(at) {
      if (!ui.tool || !ui.drag) return;
      for (const cell of ui.tool === "bed" ? [at] : dragCells(ui.drag, at))
        request({
          kind: "build",
          type: ui.tool,
          direction: ui.direction,
          ...cell,
        });
      ui.drag = null;
      ui.at = at;
      hudDirty = true;
    },
    ground() {
      ui.context = null;
      hudDirty = true;
    },
    cancelDrag() {
      ui.drag = null;
    },
  });

  // Camera gestures are presentation only; stop them before Pixi sees a work click.
  let cameraDrag = null;
  app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  app.canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 1 && !ui.panMode) return;
      cameraDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      clearPointerIntent();
      app.canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  app.canvas.addEventListener(
    "pointermove",
    (e) => {
      if (!cameraDrag || cameraDrag.id !== e.pointerId) return;
      camera.pan(e.clientX - cameraDrag.x, e.clientY - cameraDrag.y);
      cameraDrag.x = e.clientX;
      cameraDrag.y = e.clientY;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    true,
  );
  function endPan(e) {
    if (!cameraDrag || cameraDrag.id !== e.pointerId) return;
    cameraDrag = null;
    if (app.canvas.hasPointerCapture(e.pointerId))
      app.canvas.releasePointerCapture(e.pointerId);
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  app.canvas.addEventListener("pointerup", endPan, true);
  app.canvas.addEventListener("pointercancel", endPan, true);
  app.canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      clearPointerIntent();
      camera.zoomBy(Math.sign(-e.deltaY), { x: e.offsetX, y: e.offsetY });
      hudDirty = true;
    },
    { passive: false },
  );
  document.addEventListener("visibilitychange", () => {
    clock.acc = 0;
    if (document.hidden) {
      state.paused = true;
      hudDirty = true;
    }
  });
  window.addEventListener("resize", () => {
    clearPointerIntent();
    hudDirty = true;
  });
  app.ticker.maxFPS = 60;
  app.ticker.add((ticker) => {
    if (!state.paused) {
      const count = push(clock, ticker.deltaMS);
      for (let frame = 0; frame < count; frame++)
        for (let i = 0; i < speed; i++) {
          step(state, colony, pending);
          pending = [];
        }
      if (count) hudDirty = true;
    }
    if (lastNotice !== state.notice) {
      notice = "";
      lastNotice = state.notice;
    }
    view.render(state, ui);
    if (hudDirty) {
      hud.render(state, ui, notice, speed, camera.zoom, keys.hints());
      hudDirty = false;
    }
  });
  hud.render(state, ui, notice, speed, camera.zoom, keys.hints());
  document.querySelector("#loading").remove();
  window.__GOBLIN = {
    artReady: true,
    get state() {
      return structuredClone(state);
    },
    get selection() {
      return structuredClone(ui);
    },
    get width() {
      return app.screen.width;
    },
    get height() {
      return app.screen.height;
    },
    project: camera.project,
    colony,
  };
}
startGame().catch((error) => {
  console.error(error);
  const loading = document.querySelector("#loading");
  if (loading)
    loading.textContent = "The clearing could not open. Reload to try again.";
});
