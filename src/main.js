import { Application, Container } from "pixi.js";
import { bakeArt } from "./art.js";
import { loadColony } from "./colony.js";
import { createClearing, step } from "./clearing.ts";
import { admitCommands, commandProblem } from "./orders.ts";
import { createTicker, push } from "./ticker.js";
import { createView } from "./view.js";
import { createCamera, subscribeCameraPresentation } from "./camera.js";
import { createKeys } from "./keys.js";
import { dragCells } from "./construction-view.js";
import { inside, placementOccupant, SIZE } from "./world.js";
import { createHud } from "./hud.jsx";
import { singlePlacementTool, terrainDesignationCells } from "./ui-actions.ts";
import {
  backupJson,
  loadWorld,
  rawBackupJson,
  replaceWorld,
  saveWorld,
} from "./persistence.ts";
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
  const [art, colony, loaded] = await Promise.all([
    bakeArt(),
    loadColony(),
    loadWorld(),
  ]);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) art.dispose();
  });
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
  let state = loaded.kind === "loaded" ? loaded.state : createClearing();
  state.paused = true;
  let clock = createTicker();
  let pending = [];
  let pendingMeta = [];
  let speed = 1;
  let notice = "";
  let lastNotice = state.notice;
  let saveRevision = loaded.kind === "loaded" ? loaded.revision : 0;
  let autosaveEnabled = loaded.kind === "missing" || loaded.kind === "loaded";
  let worldEpoch = 0;
  let saveLoop = false;
  let queuedSnapshot = null;
  let queuedReplacements = [];
  let lastSimulationSaveAt = performance.now();
  let recoveryRaw = loaded.kind === "invalid" ? loaded.raw : null;
  let hasRecoveryRaw = loaded.kind === "invalid";
  let saveStatus = {
    slot:
      loaded.kind === "loaded"
        ? "valid"
        : loaded.kind === "invalid"
          ? "invalid"
          : loaded.kind === "failed"
            ? "failed"
            : "missing",
    phase: loaded.kind === "loaded" ? "loaded" : "unsaved",
    revision: loaded.kind === "loaded" ? loaded.revision : null,
    tick: state.tick,
    startup: true,
    rawAvailable: hasRecoveryRaw,
    message:
      loaded.kind === "loaded"
        ? `Loaded revision ${loaded.revision} at tick ${state.tick}; paused for review.`
        : loaded.kind === "invalid"
          ? "Local save could not load. Download the raw save or choose New clearing; the old slot is untouched."
          : loaded.kind === "failed"
            ? "Local save storage is unavailable. This fallback is unsaved until recovery or New clearing."
            : "Fresh clearing ready. Continue when you are ready; no time has advanced.",
  };

  function selection() {
    const current = hud.view();
    const context = current.machine.context;
    const start = context.start?.cell || null;
    const end = context.end?.cell || start;
    const inspectedTarget = current.inspectedTarget;
    return {
      selectedActors: current.selectedIds,
      followActorIds: [
        ...new Set(
          [
            ...current.selectedIds,
            inspectedTarget?.kind === "actor" ? inspectedTarget.id : null,
          ].filter(Boolean),
        ),
      ],
      inspected: inspectedTarget?.kind === "actor" ? inspectedTarget.id : null,
      tree: inspectedTarget?.kind === "tree" ? inspectedTarget.id : null,
      herb: inspectedTarget?.kind === "herb" ? inspectedTarget.id : null,
      lot: inspectedTarget?.kind === "lot" ? inspectedTarget.id : null,
      source: inspectedTarget?.kind === "source" ? inspectedTarget.id : null,
      site: inspectedTarget?.kind === "site" ? inspectedTarget.id : null,
      tool: current.tool,
      phase: current.phase,
      drag: start,
      at: end || { x: 7, z: 7, level: current.level },
      level: current.level,
      designationTargetIds: current.designationTargetIds,
      direction: current.direction,
      box:
        context.gesture === "box" && context.start && context.end
          ? { start: context.start.screen, current: context.end.screen }
          : null,
      cutaway: current.cutaway,
      debugPicking: current.debugPicking,
      panMode: current.panMode,
    };
  }

  function publish() {
    hud.update(state, notice, speed, camera.zoom, keys.hints(), saveStatus);
    hud.updateCamera(camera.snapshot(SIZE));
  }

  function setSaveStatus(update) {
    saveStatus = { ...saveStatus, ...update };
    publish();
  }

  async function drainSaves() {
    if (saveLoop) return;
    saveLoop = true;
    try {
      while (queuedReplacements.length || queuedSnapshot) {
        const operation = queuedReplacements.length
          ? queuedReplacements.shift()
          : queuedSnapshot;
        if (!queuedReplacements.length && operation === queuedSnapshot)
          queuedSnapshot = null;
        if (operation.epoch !== worldEpoch) continue;
        setSaveStatus({
          phase: "saving",
          tick: operation.state.tick,
          message:
            operation.kind === "replace"
              ? "Saving new clearing…"
              : `Saving tick ${operation.state.tick}…`,
        });
        try {
          const result =
            operation.kind === "replace"
              ? await replaceWorld(
                  operation.state,
                  saveRevision,
                  operation.mode,
                )
              : await saveWorld(operation.state, saveRevision);
          saveRevision = result.revision;
          if (operation.epoch !== worldEpoch) continue;
          autosaveEnabled = true;
          if (operation.kind === "replace") {
            recoveryRaw = null;
            hasRecoveryRaw = false;
          }
          setSaveStatus({
            slot: "valid",
            phase: "saved",
            revision: result.revision,
            tick: operation.state.tick,
            startup: false,
            rawAvailable: hasRecoveryRaw,
            message: `Saved revision ${result.revision} at tick ${operation.state.tick}.`,
          });
        } catch (error) {
          if (operation.epoch !== worldEpoch) continue;
          autosaveEnabled = false;
          queuedSnapshot = null;
          queuedReplacements = [];
          setSaveStatus({
            phase: "unsaved",
            tick: state.tick,
            message:
              error?.name === "StaleRevisionError"
                ? "Unsaved: another tab changed the slot; its newer world was preserved. Choose New clearing to retry."
                : "Unsaved: local storage failed; the last committed slot was preserved. Choose New clearing to retry.",
          });
        }
      }
    } finally {
      saveLoop = false;
      if (queuedReplacements.length || queuedSnapshot) drainSaves();
    }
  }

  function scheduleSave(reason) {
    if (!autosaveEnabled) return;
    queuedSnapshot = {
      kind: "snapshot",
      epoch: worldEpoch,
      reason,
      state: structuredClone(state),
    };
    setSaveStatus({
      phase: "saving",
      tick: state.tick,
      message: `Saving tick ${state.tick}…`,
    });
    drainSaves();
  }

  function scheduleReplacement() {
    queuedSnapshot = null;
    queuedReplacements = [
      {
        kind: "replace",
        epoch: worldEpoch,
        mode: saveStatus.slot === "invalid" ? "discardMalformed" : "cas",
        state: structuredClone(state),
      },
    ];
    drainSaves();
  }

  function downloadBackup() {
    const data = backupJson(state, saveRevision);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hive-local-world.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadRawSave() {
    if (!hasRecoveryRaw) return;
    const blob = new Blob([rawBackupJson(recoveryRaw)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hive-local-world-corrupt.json";
    link.click();
    URL.revokeObjectURL(url);
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
  function flushPending() {
    if (!pending.length) return [];
    const batch = pending;
    const meta = pendingMeta;
    pending = [];
    pendingMeta = [];
    const results = admitCommands(state, batch).map((result, index) => ({
      command: batch[index],
      meta: meta[index],
      ...result,
    }));
    const designation = results.filter((result) => result.meta.designationId);
    const terrainDesignation = results.filter(
      (result) => result.meta.terrainDesignation,
    );
    if (terrainDesignation.length) {
      const accepted = terrainDesignation.filter(
        (result) => result.status === "applied",
      ).length;
      const rejected = terrainDesignation.find(
        (result) => result.status === "rejected",
      );
      const tool = terrainDesignation[0].meta.terrainDesignation;
      notice = accepted
        ? `Applied ${accepted} shared ${tool} designation${accepted === 1 ? "" : "s"}${rejected ? `; ${terrainDesignation.length - accepted} rejected: ${rejected.reason}` : "."}`
        : `${tool === "dig" ? "Dig" : "Backfill"} designation rejected: ${rejected?.reason || "no target was applied."}`;
    } else if (designation.length) {
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
      const firstRejection = results.find(
        (result) => result.status === "rejected",
      );
      notice = `${applied} command${applied === 1 ? "" : "s"} applied; ${results.length - applied} rejected: ${firstRejection.reason}`;
    } else {
      notice = state.notice;
    }
    lastNotice = state.notice;
    publish();
    if (results.some((result) => result.status === "applied"))
      scheduleSave("admission");
    return results;
  }
  function request(command, meta = {}) {
    let scoped;
    if (command.kind === "recruit") {
      const { actors: ignored, ...recruit } = command;
      scoped = { party: "home", ...recruit };
    } else if (
      command.kind === "draft" ||
      command.kind === "undraft" ||
      command.kind === "go"
    ) {
      const { actors: ignored, ...personal } = command;
      scoped = { party: "home", ...personal };
    } else if (
      command.kind === "cancel" ||
      command.kind === "next" ||
      command.kind === "build" ||
      command.kind === "deconstruct" ||
      command.kind === "dig" ||
      command.kind === "backfill" ||
      command.kind === "sow" ||
      command.kind === "harvest" ||
      command.kind === "store" ||
      command.kind === "repair-cache" ||
      command.kind === "fill-kettle" ||
      command.kind === "water-mugwort"
    ) {
      scoped = { party: "home", actors: null, ...command };
    } else {
      scoped = {
        party: "home",
        actors: command.actors === undefined ? selectedIds() : command.actors,
        ...command,
      };
    }
    queue(scoped, meta);
    notice =
      scoped.kind === "recruit"
        ? "Invitation submitted."
        : scoped.kind === "build"
          ? "Blueprint submitted."
          : "Order submitted.";
    publish();
    return { submitted: true };
  }
  function reset() {
    worldEpoch += 1;
    autosaveEnabled = false;
    queuedSnapshot = null;
    queuedReplacements = [];
    state = createClearing();
    state.paused = true;
    clock = createTicker();
    pending = [];
    pendingMeta = [];
    speed = 1;
    notice = "";
    lastNotice = state.notice;
    lastSimulationSaveAt = performance.now();
    saveStatus = {
      ...saveStatus,
      phase: "saving",
      revision: null,
      tick: state.tick,
      startup: false,
      message: "Saving new clearing…",
    };
    camera.reset();
    publish();
    scheduleReplacement();
  }

  function continueClearing() {
    state.paused = false;
    clock = createTicker();
    pending = [];
    pendingMeta = [];
    speed = 1;
    lastSimulationSaveAt = performance.now();
    saveStatus = { ...saveStatus, startup: false };
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
        if (state.paused) flushPending();
        break;
      case "recruit":
        request({ kind: "recruit", party: "home", actor: action.actor });
        if (state.paused) flushPending();
        break;
      case "submit-designation": {
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
        if (state.paused) flushPending();
        publish();
        break;
      }
      case "submit-terrain-designation": {
        for (const cell of action.cells)
          request(
            { kind: cell.kind, party: "home", actors: null, ...cell },
            { terrainDesignation: cell.kind },
          );
        if (!action.cells.length) {
          notice = "No ground cells were selected.";
          publish();
          break;
        }
        notice = `Submitted ${action.cells.length} shared ${action.cells[0].kind} designation${action.cells.length === 1 ? "" : "s"}; waiting for the fixed step.`;
        if (state.paused) flushPending();
        publish();
        break;
      }
      case "pause":
        state.paused = !state.paused;
        clock.acc = 0;
        if (state.paused) {
          const results = flushPending();
          if (!results.some((result) => result.status === "applied"))
            scheduleSave("pause");
        }
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
      case "recenter":
        clearCameraIntent();
        camera.focus(action.cell);
        break;
      case "reset":
        reset();
        break;
      case "continue":
        continueClearing();
        break;
      case "download-backup":
        downloadBackup();
        break;
      case "download-raw-save":
        downloadRawSave();
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
        throw new Error(`Unhandled effect action: ${action.kind}`);
    }
  }

  const hud = createHud(document.querySelector("#hud"), art, effect);
  const updateCameraPresentation = () =>
    hud.updateCamera(camera.snapshot(SIZE));
  subscribeCameraPresentation(camera, updateCameraPresentation);
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
          !commandProblem(state, {
            party: "home",
            actors: current.selectedIds.length ? current.selectedIds : null,
            kind: "chop",
            tree: current.tree,
            direct: !!current.selectedIds.length,
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
        "button, a, input, textarea, select, [contenteditable], [data-clearing-minimap-control]",
      )
    )
      root.focus({ preventScroll: true });
  });
  root.focus({ preventScroll: true });

  const view = createView(app, world, camera, art, state, {
    groundPointerOwns() {
      return !!hud.view().tool;
    },
    level() {
      return hud.view().level;
    },
    actor(id, pointAt, toggle) {
      hud.dispatch({ kind: "select", actor: id, toggle });
    },
    tree(id, pointAt, secondary) {
      const current = hud.view();
      if (
        current.tool ||
        current.panMode ||
        current.machine.context.gesture === "box"
      ) {
        if (secondary) hud.dispatch({ kind: "close" });
        return;
      }
      hud.dispatch({ kind: "tree", id, point: pointAt });
    },
    herb(id, pointAt) {
      const current = hud.view();
      if (
        current.tool ||
        current.panMode ||
        current.machine.context.gesture === "box"
      )
        return;
      hud.dispatch({ kind: "inspect-herb", id, point: pointAt });
    },
    lot(id, pointAt) {
      const current = hud.view();
      if (
        current.tool ||
        current.panMode ||
        current.machine.context.gesture === "box"
      )
        return;
      hud.dispatch({ kind: "inspect-lot", id, point: pointAt });
    },
    source(id, pointAt) {
      const current = hud.view();
      if (
        current.tool ||
        current.panMode ||
        current.machine.context.gesture === "box"
      )
        return;
      hud.dispatch({ kind: "inspect-source", id, point: pointAt });
    },
    site(id, pointAt) {
      const current = hud.view();
      if (
        current.tool ||
        current.panMode ||
        current.machine.context.gesture === "box"
      )
        return;
      hud.dispatch({ kind: "inspect-site", id, point: pointAt });
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
      if (fixed.tool === "herb") {
        const cell = end;
        if (!inside(cell) || placementOccupant(state, cell)) {
          notice = "Choose clear ground for mugwort.";
          publish();
          hud.dispatch({
            kind: "placement-result",
            point: point(cell, screen),
          });
          return;
        }
        request({ kind: "sow", ...cell });
        hud.dispatch({ kind: "placement-result", point: point(cell, screen) });
        return;
      }
      if (fixed.tool === "dig" || fixed.tool === "backfill") {
        hud.dispatch({
          kind: "submit-terrain-designation",
          cells: terrainDesignationCells(fixed.tool, start, end),
        });
        hud.dispatch({ kind: "placement-result", point: point(end, screen) });
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
          const projected = camera.project(person.x, person.z, 2, person.level);
          return (
            person.level === fixed.level &&
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
      const cells = singlePlacementTool(fixed.tool)
        ? [end]
        : dragCells(start, end);
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
    groundRight(at, screen) {
      const current = hud.view();
      if (
        current.tool ||
        current.phase === "dragging" ||
        current.phase === "fixed"
      ) {
        hud.dispatch({ kind: "close" });
        return;
      }
      if (current.panMode) return;
      hud.dispatch({ kind: "go", point: point(at, screen) });
    },
    cancelDrag() {
      const current = hud.view();
      if (current.phase !== "dragging") return;
      hud.dispatch({ kind: "cancel-stroke" });
    },
  });

  let cameraDrag = null;
  app.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
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
      const results = flushPending();
      if (!results.some((result) => result.status === "applied"))
        scheduleSave("visibility");
      publish();
    }
  });
  window.addEventListener("resize", () => {
    clearCameraIntent();
    publish();
  });
  app.ticker.maxFPS = 60;
  app.ticker.add((ticker) => {
    if (pending.length) flushPending();
    if (!state.paused) {
      const count = push(clock, ticker.deltaMS);
      for (let frame = 0; frame < count; frame++) {
        for (let i = 0; i < speed; i++) {
          step(state, colony, []);
        }
      }
      if (count) {
        publish();
        const now = performance.now();
        if (now - lastSimulationSaveAt >= 1000) {
          lastSimulationSaveAt = now;
          scheduleSave("simulation");
        }
      }
    }
    if (lastNotice !== state.notice) {
      notice = state.notice;
      lastNotice = state.notice;
      publish();
    }
    view.render(state, selection());
  });
  hud.dispatch({ kind: "panel", panel: "menu" });
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
    get persistence() {
      return structuredClone({
        slot: saveStatus.slot,
        phase: saveStatus.phase,
        autosaveEnabled,
        revision: saveRevision,
        tick: state.tick,
        paused: state.paused,
        startup: saveStatus.startup,
        message: saveStatus.message,
      });
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
