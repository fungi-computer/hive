import { Application } from "pixi.js";
import { bakeArt } from "./art.js";
import { project, WIDTH, HEIGHT } from "./art/scale.js";
import { loadColony } from "./colony.js";
import { createClearing, commandProblem, step } from "./clearing.js";
import { createTicker, push } from "./ticker.js";
import { createView } from "./view.js";
import { dragCells } from "./construction-view.js";
import { renderHud, showPortrait } from "./hud.js";
import "./style.css";
const $ = (selector) => document.querySelector(selector);
const newSelection = () => ({
  pawn: false,
  tree: null,
  tool: null,
  at: { x: 7, z: 7 },
  direction: 0,
  drag: null,
  cutaway: true,
});

// Ordinary async bootstrap avoids Pixi's production dynamic-import/TLA cycle.
async function startGame() {
  const [art, colony] = await Promise.all([bakeArt(), loadColony()]);
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    background: 0x293931,
    antialias: false,
    resolution: 1,
    preference: "webgl",
  });
  $("#stage").append(app.canvas);
  app.canvas.setAttribute(
    "aria-label",
    "Goblin country. Select Rowan, order trees chopped, and place walls, a doorway, roof tiles and a bedroll.",
  );
  let state = createClearing(),
    clock = createTicker(),
    selection = newSelection(),
    pending = [],
    speed = 1;
  let notice = "",
    lastNotice = state.notice;
  function render() {
    if (lastNotice !== state.notice) {
      notice = "";
      lastNotice = state.notice;
    }
    view.render(state, selection);
    renderHud(
      state,
      selection,
      pending.length ? "Orders received; waiting for the next step." : notice,
    );
  }
  function selectPawn() {
    selection.pawn = true;
    notice = "Rowan selected. Mark work; he will find his own way.";
    render();
  }
  function request(command) {
    if (!selection.pawn) return false;
    const problem = commandProblem(state, command);
    if (problem) {
      notice = problem;
      render();
      return false;
    }
    pending.push(command);
    return true;
  }
  const view = createView(app, art, state, {
    pawn: selectPawn,
    tree(id) {
      if (selection.tool) return;
      selection.tree = id;
      notice = "Oak selected. Add it to Rowan's work orders.";
      render();
    },
    hover(at) {
      selection.at = at;
    },
    down(at) {
      if (selection.tool) {
        selection.drag = at;
        selection.at = at;
      }
    },
    up(at) {
      if (!selection.tool || !selection.drag) return;
      for (const cell of selection.tool === "bed"
        ? [at]
        : dragCells(selection.drag, at))
        request({
          kind: "build",
          type: selection.tool,
          direction: selection.direction,
          ...cell,
        });
      selection.drag = null;
      selection.at = at;
      render();
    },
    cancelDrag() {
      selection.drag = null;
    },
  });
  $("#select").onclick = selectPawn;
  $("#task").onclick = () => {
    if (selection.tool) {
      selection.tool = null;
      selection.drag = null;
      notice = "Placement finished. Queued work continues.";
    } else request({ kind: "chop", tree: selection.tree });
    render();
  };
  for (const button of document.querySelectorAll("[data-build]"))
    button.onclick = () => {
      selection.tool = button.dataset.build;
      selection.drag = null;
      notice =
        "Click to place a blueprint, or drag a straight row. R rotates it. Wood arrives through hauling.";
      render();
    };
  $("#rotate").onclick = () => {
    selection.direction = 1 - selection.direction;
    render();
  };
  $("#cutaway").onchange = (event) => {
    selection.cutaway = event.target.checked;
    render();
  };
  $("#rest").onclick = () => {
    request({ kind: "rest" });
    render();
  };
  $("#routine").onchange = (event) => {
    request({ kind: "routine", enabled: event.target.checked });
    render();
  };
  $("#orders").onclick = (event) => {
    const button = event.target.closest("button[data-job]");
    if (button) {
      request({ kind: button.dataset.action, job: button.dataset.job });
      render();
    }
  };
  $("#pause").onclick = () => {
    state.paused = !state.paused;
    clock.acc = 0;
    render();
  };
  $("#speed").onclick = () => {
    speed = speed === 1 ? 4 : 1;
    $("#speed").textContent = `${speed}×`;
  };
  $("#reset").onclick = () => {
    state = createClearing();
    clock = createTicker();
    selection = newSelection();
    pending = [];
    notice = "";
    lastNotice = state.notice;
    speed = 1;
    $("#speed").textContent = "1×";
    $("#cutaway").checked = true;
    render();
  };
  document.addEventListener("visibilitychange", () => {
    clock.acc = 0;
    if (document.hidden) {
      state.paused = true;
      render();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      selection.tool = null;
      selection.drag = null;
      render();
    }
    if (event.key.toLowerCase() === "r" && selection.tool) {
      selection.direction = 1 - selection.direction;
      render();
    }
  });
  showPortrait(art.pawn.idle[0][0]);
  app.ticker.maxFPS = 60;
  app.ticker.add((ticker) => {
    if (!state.paused)
      for (
        let frame = 0, count = push(clock, ticker.deltaMS);
        frame < count;
        frame++
      )
        for (let i = 0; i < speed; i++) {
          step(state, colony, pending);
          pending = [];
        }
    render();
  });
  render();
  $("#loading").remove();
  const centerViewport = () => {
    $("#stage").scrollLeft =
      ($("#stage").scrollWidth - $("#stage").clientWidth) / 2;
  };
  centerViewport();
  window.addEventListener("resize", centerViewport);
  window.__GOBLIN = {
    artReady: true,
    get state() {
      return structuredClone(state);
    },
    project,
    colony,
    width: WIDTH,
    height: HEIGHT,
  };
}
startGame().catch((error) => {
  console.error(error);
  if ($("#loading"))
    $("#loading").textContent =
      "The clearing could not open. Reload to try again.";
});
