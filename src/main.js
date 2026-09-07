import { Application, Container } from "pixi.js";
import { bakeArt } from "./art.js";
import { loadColony } from "./colony.js";
import { createClearing, step } from "./clearing.ts";
import { commandProblem } from "./orders.ts";
import { createTicker, push } from "./ticker.js";
import { createView } from "./view.js";
import { createCamera } from "./camera.js";
import { createKeys } from "./keys.js";
import { dragCells } from "./construction-view.js";
import { createHud } from "./hud.jsx";
import "./style.css";

function point(cell, screen) {
  return { cell: { ...cell }, screen: { x: screen.x, y: screen.y } };
}

export function rectangleTargetIds(state, start, end) {
  if (!start || !end || (start.level ?? 0) !== (end.level ?? 0)) return [];
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.z, end.z);
  const bottom = Math.max(start.z, end.z);
  const ordered = new Set(
    state.jobs.filter((job) => job.kind === "chop").map((job) => job.target),
  );
  return state.trees
    .filter(
      (tree) =>
        tree.felledAt === null &&
        !ordered.has(tree.id) &&
        tree.level === start.level &&
        tree.x >= left &&
        tree.x <= right &&
        tree.z >= top &&
        tree.z <= bottom,
    )
    .map((tree) => tree.id);
}

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
    "Goblin country. Select people, recruit Sedge, choose an oak, or place a home blueprint.",
  );
  const world = new Container();
  app.stage.addChild(world);
  const camera = createCamera(app, host, world);
  let state = createClearing();
  let clock = createTicker();
  let pending = [];
  let pendingMeta = [];
  let speed = 1;
  let notice = "";
  let lastNotice = state.notice;

  function selection() {
    const current = hud.view();
    const context = current.machine.context;
    const start = context.start?.cell || null;
    const end = context.end?.cell || start;
    return {
      selectedActors: current.selectedIds,
      followActorIds: [
        ...new Set(
          [...current.selectedIds, current.inspectedId].filter(Boolean),
        ),
      ],
      inspected: current.inspectedId,
      tree: current.tree,
      tool: current.tool,
      phase: current.phase,
      drag: start,
      at: end || { x: 7, z: 7, level: 0 },
      designationTargetIds: current.designationTargetIds,
      direction: current.direction,
      box:
        context.gesture === "box" && context.start && context.end
          ? { start: context.start.screen, current: context.end.screen }
          : null,
      cutaway: current.cutaway,
      panMode: current.panMode,
    };
  }

  function publish() {
    hud.update(state, notice, speed, camera.zoom, keys.hints());
  }
  function selectedIds() {
    return hud.view().selectedIds;
  }
  function focusSelection(screenY) {
    const ids = selectedIds();
    const id = ids[0] || state.parties.home.members[0];
    const person = state.actors[id];
    if (person) camera.focus(person, screenY);
  }
  function queue(command, meta = {}) {
    pending.push(command);
    pendingMeta.push(meta);
  }
  function request(command, meta = {}) {
    let scoped;
    if (command.kind === "recruit") {
      const { actors: ignored, ...recruit } = command;
      scoped = { party: "home", ...recruit };
    } else if (
      command.kind === "cancel" ||
      command.kind === "next" ||
      command.kind === "build"
    ) {
      scoped = { party: "home", actors: null, ...command };
    } else {
      scoped = {
        party: "home",
        actors: command.actors === undefined ? selectedIds() : command.actors,
        ...command,
      };
    }
    const problem = commandProblem(state, scoped);
    if (problem) {
      notice = problem;
      publish();
      return { submitted: false, reason: problem };
    }
    queue(scoped, meta);
    notice =
      scoped.kind === "recruit"
        ? "Invitation submitted for the next fixed step."
        : scoped.kind === "build"
          ? "Blueprint submitted for the next fixed step."
          : "Order submitted for the next fixed step.";
    publish();
    return { submitted: true };
  }
  function reset() {
    state = createClearing();
    clock = createTicker();
    pending = [];
    pendingMeta = [];
    speed = 1;
    notice = "";
    lastNotice = state.notice;
    camera.reset();
    hud.dispatch({ kind: "reset" });
    publish();
  }
  function clearCameraIntent() {
    hud.dispatch({ kind: "camera-move" });
  }
  function effect(action) {
    switch (action.kind) {
      case "notice":
        notice = action.text;
        publish();
        break;
      case "command":
        request(action.command);
        break;
      case "recruit":
        request({ kind: "recruit", party: "home", actor: action.actor });
        break;
      case "commit-designation": {
        let submitted = 0;
        for (const id of action.targetIds)
          if (
            request(
              { kind: "chop", party: "home", actors: null, tree: id },
              { designationId: id },
            ).submitted
          )
            submitted++;
        notice = submitted
          ? `Submitted ${submitted} shared oak designation${submitted === 1 ? "" : "s"}; waiting for the fixed step.`
          : "No standing, unassigned oaks were submitted.";
        if (!submitted) hud.dispatch({ kind: "commit-result", accepted: 0 });
        publish();
        break;
      }
      case "pause":
        state.paused = !state.paused;
        clock.acc = 0;
        publish();
        break;
      case "speed":
        speed = speed === 1 ? 4 : 1;
        publish();
        break;
      case "focus":
        clearCameraIntent();
        focusSelection();
        break;
      case "zoom":
        clearCameraIntent();
        camera.zoomBy(action.delta);
        publish();
        break;
      case "pan":
        clearCameraIntent();
        camera.pan(action.x, action.y);
        publish();
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
          publish();
        });
        break;
      default:
        break;
    }
  }

  const hud = createHud(document.querySelector("#hud"), art, effect);
  const root = document.querySelector("#game");
  root.tabIndex = -1;
  let keys;
  keys = createKeys(
    root,
    () => {
      const current = hud.view();
      return {
        ...current,
        chopAllowed:
          !!current.tree &&
          !!current.selectedIds.length &&
          !commandProblem(state, {
            party: "home",
            actors: current.selectedIds,
            kind: "chop",
            tree: current.tree,
          }),
      };
    },
    (action) => hud.dispatch(action),
    publish,
  );
  root.addEventListener("click", (event) => {
    if (
      event.detail &&
      !event.target.closest(
        "button, a, input, textarea, select, [contenteditable]",
      )
    )
      root.focus({ preventScroll: true });
  });
  root.focus({ preventScroll: true });

  const view = createView(app, world, camera, art, state, {
    actor(id, pointAt, toggle) {
      hud.dispatch({ kind: "select", actor: id, toggle });
    },
    tree(id, pointAt, secondary, queued) {
      const current = hud.view();
      if (
        current.tool ||
        current.panMode ||
        current.machine.context.gesture === "box"
      ) {
        if (secondary) hud.dispatch({ kind: "close" });
        return;
      }
      if (secondary && current.selectedIds.length) {
        request({
          kind: "chop",
          tree: id,
          direct: !queued,
          actors: [...current.selectedIds],
        });
        return;
      }
      hud.dispatch({ kind: "tree", id, point: pointAt });
    },
    down(at, screen) {
      const current = hud.view();
      if (current.panMode) return;
      if (current.tool)
        hud.dispatch({ kind: "begin", point: point(at, screen) });
      else hud.dispatch({ kind: "begin", point: point(at, screen) });
    },
    move(at, screen) {
      const current = hud.view();
      if (current.phase !== "dragging" && !current.tool) return;
      hud.dispatch({ kind: "move", point: point(at, screen) });
      if (current.phase !== "dragging") return;
      const next = hud.view();
      if (next.tool === "chop")
        hud.dispatch({
          kind: "set-designation",
          ids: rectangleTargetIds(
            state,
            next.machine.context.start?.cell,
            next.machine.context.end?.cell,
          ),
        });
    },
    up(at, screen) {
      const current = hud.view();
      if (current.phase !== "dragging") return;
      hud.dispatch({ kind: "end", point: point(at, screen) });
      const fixed = hud.view();
      const start = fixed.machine.context.start?.cell;
      const end = fixed.machine.context.end?.cell || start;
      if (fixed.tool === "chop") {
        const ids = rectangleTargetIds(state, start, end);
        hud.dispatch({
          kind: "set-designation",
          ids,
        });
        hud.dispatch(
          ids.length
            ? { kind: "commit-designation" }
            : { kind: "commit-result", accepted: 0 },
        );
        return;
      }
      if (fixed.gesture === "box") {
        const box = fixed.machine.context;
        const left = Math.min(box.start.screen.x, box.end.screen.x);
        const right = Math.max(box.start.screen.x, box.end.screen.x);
        const top = Math.min(box.start.screen.y, box.end.screen.y);
        const bottom = Math.max(box.start.screen.y, box.end.screen.y);
        const ids = state.parties.home.members.filter((id) => {
          const person = state.actors[id];
          const projected = camera.project(person.x, person.z, 2);
          return (
            projected.x >= left &&
            projected.x <= right &&
            projected.y >= top &&
            projected.y <= bottom
          );
        });
        hud.dispatch({ kind: "select-many", ids });
        hud.dispatch({ kind: "escape" });
        return;
      }
      const cells = fixed.tool === "bed" ? [end] : dragCells(start, end);
      for (const cell of cells)
        request({
          kind: "build",
          type: fixed.tool,
          direction: fixed.direction,
          ...cell,
        });
      hud.dispatch({ kind: "placement-result", point: point(end, screen) });
    },
    ground() {
      const current = hud.view();
      if (!current.tool && current.machine.context.gesture !== "box")
        hud.dispatch({ kind: "close-target" });
    },
    cancelDrag() {
      const current = hud.view();
      if (current.phase !== "dragging") return;
      hud.dispatch({ kind: "escape" });
    },
  });

  let cameraDrag = null;
  app.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const current = hud.view();
    if (
      current.tool ||
      current.phase === "dragging" ||
      current.phase === "fixed"
    )
      hud.dispatch({ kind: "close" });
  });
  app.canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 1 && !hud.view().panMode) return;
      cameraDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      clearCameraIntent();
      app.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  app.canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!cameraDrag || cameraDrag.id !== event.pointerId) return;
      camera.pan(event.clientX - cameraDrag.x, event.clientY - cameraDrag.y);
      cameraDrag.x = event.clientX;
      cameraDrag.y = event.clientY;
      clearCameraIntent();
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  function endPan(event) {
    if (!cameraDrag || cameraDrag.id !== event.pointerId) return;
    cameraDrag = null;
    if (app.canvas.hasPointerCapture(event.pointerId))
      app.canvas.releasePointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  app.canvas.addEventListener("pointerup", endPan, true);
  app.canvas.addEventListener("pointercancel", endPan, true);
  app.canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      clearCameraIntent();
      camera.zoomBy(Math.sign(-event.deltaY), {
        x: event.offsetX,
        y: event.offsetY,
      });
      publish();
    },
    { passive: false },
  );
  document.addEventListener("visibilitychange", () => {
    clock.acc = 0;
    if (document.hidden) {
      state.paused = true;
      publish();
    }
  });
  window.addEventListener("resize", () => {
    clearCameraIntent();
    publish();
  });
  app.ticker.maxFPS = 60;
  app.ticker.add((ticker) => {
    if (!state.paused) {
      const count = push(clock, ticker.deltaMS);
      for (let frame = 0; frame < count; frame++) {
        for (let i = 0; i < speed; i++) {
          if (!pending.length) {
            step(state, colony, []);
            continue;
          }
          const batch = pending;
          const meta = pendingMeta;
          pending = [];
          pendingMeta = [];
          const results = step(state, colony, batch).map((result, index) => ({
            command: batch[index],
            meta: meta[index],
            ...result,
          }));
          const designation = results.filter(
            (result) => result.meta.designationId,
          );
          if (designation.length) {
            const acceptedIds = designation
              .filter((result) => result.status === "applied")
              .map((result) => result.meta.designationId);
            hud.dispatch({
              kind: "commit-result",
              accepted: acceptedIds.length,
            });
            notice = acceptedIds.length
              ? `Applied ${acceptedIds.length} shared oak designation${acceptedIds.length === 1 ? "" : "s"}; ${designation.length - acceptedIds.length} rejected.`
              : "Chop designation rejected; no target was applied.";
          } else if (results.some((result) => result.status === "rejected")) {
            const applied = results.filter(
              (result) => result.status === "applied",
            ).length;
            notice = `${applied} command${applied === 1 ? "" : "s"} applied; ${results.length - applied} rejected at the fixed step.`;
          }
        }
      }
      if (count) publish();
    }
    if (lastNotice !== state.notice) {
      if (!notice) notice = "";
      lastNotice = state.notice;
      publish();
    }
    view.render(state, selection());
  });
  publish();
  document.querySelector("#loading").remove();
  window.__GOBLIN = {
    artReady: true,
    get state() {
      return structuredClone(state);
    },
    get selection() {
      const { machine, ...selection } = hud.view();
      return structuredClone(selection);
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
