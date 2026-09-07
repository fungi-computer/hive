import { Application } from "pixi.js";
import { bakeArt, project } from "./art.js";
import { loadColony } from "./colony.js";
import { createClearing, commandProblem, step } from "./clearing.js";
import { createTicker, push } from "./ticker.js";
import { createView } from "./view.js";
import { renderHud, showPortrait } from "./hud.js";
import "./style.css";

// Keep bootstrap inside a normal async function: Pixi's production dynamic
// renderer imports must not participate in a top-level-await cycle.
async function startGame() {
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
  document.querySelector("#stage").append(app.canvas);
  document.querySelector("#loading").remove();
  app.canvas.setAttribute(
    "aria-label",
    "A clearing in goblin country. Select Rowan, select a tree, then choose Chop tree.",
  );
  let state = createClearing(),
    clock = createTicker(),
    selection = { pawn: false, tree: null, placing: false, at: { x: 2, z: 2 } },
    pending = [],
    notice = "",
    lastNotice = state.notice;
  const render = () => {
    if (lastNotice !== state.notice) {
      notice = "";
      lastNotice = state.notice;
    }
    view.render(state, selection);
    renderHud(state, { ...selection, pending: pending.length > 0 }, notice);
  };
  const selectPawn = () => {
    selection.pawn = true;
    notice = "Rowan selected. Click a tree, then give the chopping order.";
    render();
  };
  const view = createView(app, art, state.trees, {
    pawn: selectPawn,
    tree(id) {
      if (selection.placing) return;
      selection.tree = id;
      notice = selection.pawn
        ? "Tree selected. Choose Chop tree to give Rowan the task."
        : "Tree selected. Select Rowan to assign the work.";
      render();
    },
    hover(at) {
      if (!selection.placing) return;
      selection.at = at;
    },
    place(at) {
      if (!selection.placing) return;
      selection.at = at;
      if (request({ kind: "build", ...at })) {
        selection.placing = false;
        selection.tree = null;
      }
      render();
    },
  });
  function request(command) {
    if (!selection.pawn || pending.length) return false;
    const problem = commandProblem(state, command);
    if (problem) {
      notice = problem;
      render();
      return false;
    }
    pending.push(command);
    notice = "Order received.";
    render();
    return true;
  }
  document.querySelector("#build").onclick = () => {
    selection.placing = true;
    notice = "Choose a clear 2 × 2 footprint. Click to commit six wood.";
    render();
  };
  document.querySelector("#select").onclick = selectPawn;
  document.querySelector("#task").onclick = () => {
    if (selection.placing) {
      selection.placing = false;
      notice = "Placement canceled. Wood kept.";
      render();
      return;
    }
    request({ kind: "chop", tree: selection.tree });
  };
  document.querySelector("#pause").onclick = () => {
    state.paused = !state.paused;
    clock.acc = 0;
    render();
  };
  document.querySelector("#reset").onclick = () => {
    state = createClearing();
    clock = createTicker();
    selection = { pawn: false, tree: null, placing: false, at: { x: 2, z: 2 } };
    pending = [];
    notice = "";
    lastNotice = state.notice;
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
    if (event.key === "Escape" && selection.placing) {
      selection.placing = false;
      notice = "Placement canceled. Wood kept.";
      render();
    }
  });
  showPortrait(art.pawn.idle[0][0]);
  app.ticker.maxFPS = 60;
  app.ticker.add((t) => {
    if (!state.paused)
      for (let i = 0, count = push(clock, t.deltaMS); i < count; i++) {
        step(state, colony, pending);
        pending = [];
      }
    render();
  });
  render();
  window.__GOBLIN = {
    artReady: true,
    get state() {
      return structuredClone(state);
    },
    project,
    colony,
  };
}
startGame().catch((error) => {
  console.error(error);
  const loading = document.querySelector("#loading");
  if (loading)
    loading.textContent = "The clearing could not open. Reload to try again.";
});
