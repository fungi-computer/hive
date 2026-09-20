import { createWorldSceneOwner } from "./world-scene-owner.js";
import { createDirectControl } from "./direct-control.js";
import { createCameraGeometryOwner } from "./camera-geometry-owner.js";
import { surfaceSubjectFromOrdered } from "./draw-record-facts.js";
import { aimGroundPoint, createPreviewCache, fireInput } from "./aiming.js";
import { createCueCursor, createEffectOwner } from "./effects.js";
import { createMotionCueOwner } from "./motion.js";
import { createAudioOwner } from "./audio.js";
import { createInterpolationBuffer } from "./interpolation.js";
import { Application, Container, Graphics, Sprite } from "pixi.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@fungi.computer/caps/components/button";
import { Slider } from "@fungi.computer/caps/components/slider";
import { Input } from "@fungi.computer/caps/components/input";
import { Card, CardContent } from "@fungi.computer/caps/components/card";
import { loadStaticArtPack } from "../../../src/art/static-pack.js";
import { loadLivingTerrainPack } from "../../../src/art/living-terrain-pack.js";
import { staticArtBase } from "../../../src/art/static-manifest.js";
import {
  isTypingTarget,
  selectionFromSubjects,
  pointerGestureMachine,
  edgeGestureMachine,
  aimGestureMachine,
  terrainTargetMachine,
  terrainAreaGestureMachine,
  WORLD_VIEW_CONTROLS,
  eligibleSelectedIds,
} from "./controls.js";
import { createWorldView, setWorldViewLevel, toggleWorldCutaway, projectWorldFact, createTerrainProjectionCache, terrainLevelRange, setTerrainLevelRange } from "./world-view.js";
import { createActor } from "xstate";
import { createDefaultHtmlKeymap } from "@opentui/keymap/html";
import {
  createBindingLookup,
  formatCommandBindings,
} from "@opentui/keymap/extras";
import { DEFAULT_VISUAL_BINDINGS } from "./visual-bindings.js";
import { terrainCameraFocus } from "./camera-focus.js";
import { designationEndpoints, visibleTerrainDesignationPreview } from "./terrain-area-selection.js";
import { submitCommand } from "./command-submission.js";
import { projectContextualPresentation } from "./contextual-presentation.js";
import { buildControls, placementHint, placementMode, nextOrientation, selectedBuildControl, structureSurfaceFromOrderedSprites } from "./build-placement.js";
import { createPlacementAdvisory, placementCells, placementFootprintCells, placementVisualSpec } from "./placement-preview.js";
import { createLocalGameWhistle, localBindings } from "./whistle-runtime.js";
import { bindingCommand, buildPlacementCommand, terrainCellCommand, terrainAreaCommand } from "./whistle-command.js";
import { selectedBrewStation } from "./colony-presentation.js";
import { actionBarGroups, selectedActionBarControls } from "./action-bar.js";
import { canonicalEdges, edgeSegmentEndpoints, nearestGridSegment } from "./edge-gesture.js";
import { edgeStructureGhostSpec, edgeWallJunctionSubjects } from "./edge-wall-presentation.js";
import { createActionBarState } from "./action-bar-state.js";

const displayedNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function createHiveClient({
  root,
  mode,
  title,
  subtitle,
  source,
  runtime,
  persistence,
  commandDefinitions,
  orderCommand,
  directControlId,
  controlHelp,
  selectionShortcuts = [],
  visualBindings = DEFAULT_VISUAL_BINDINGS,
  environment = "clearing",
  aiming = null,
  worldView = {},
  placementVisuals = {},
  placementCandidates = null,
}) {
  if (!persistence) throw new Error("Hive client requires a persistence capability");
  if (!commandDefinitions) throw new Error("Hive client requires owning command definitions");
  let directControl;
  let nativeBinding;
  const bindings = { ...DEFAULT_VISUAL_BINDINGS, ...visualBindings };
  let activeSelectionShortcuts = selectionShortcuts.filter((shortcut) => shortcut?.id);
  const state = {
    ready: false,
    connection: { status: "online", pending: 0 },
    paused: false,
    selectedIds: [],
    hoverId: null,
    dragging: null,
    disposed: false,
    subjects: [],
    pendingSave: false,
    pendingRestore: false,
    invitationOpen: false,
    invitationUrl: null,
    invitationCopied: false,
    presentationFacts: [],
    whistleAgent: [],
    whistleTargets: [],
    terrainMarks: [],
    environmentVisuals: [],
    party: null,
    placementDecision: null,
    view: createWorldView(worldView),
    aim: { active: false, launcherId: null, point: null, target: null, elevation: 0.12, velocity: null, preview: null },
    message: runtime
      ? "Connecting to the world…"
      : "Runtime pending — waiting for the browser Worker.",
  };
  const gesture = createActor(pointerGestureMachine).start();
  const edgeGesture = createActor(edgeGestureMachine).start();
  const aimGesture = createActor(aimGestureMachine).start();
  const terrainTarget = createActor(terrainTargetMachine).start();
  const terrainArea = createActor(terrainAreaGestureMachine).start();
  const localWhistle = createLocalGameWhistle({ bindings: localBindings(mode, commandDefinitions), submit: command => submit(command) });
  function localControls() {
    return localWhistle.whistle.snapshot().menu.flatMap(row => {
      const presentation = row.action?.presentation;
      if (!presentation || presentation.type !== "custom") return [];
      return (presentation.data.bindings ?? []).map(binding => ({
        ...binding,
        commandId: row.commandId,
        category: row.category,
        command: row.commandId.slice(row.commandId.indexOf(":") + 1),
        label: binding.label || row.title,
        availability: row.availability,
        ...(binding.preset === undefined ? {} : { input: binding.preset }),
      }));
    });
  }
  const isAiming = () => aimGesture.getSnapshot().value === "aiming";
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(state));
  const emit = (action) => {
    if (state.disposed) return;
    if (["action", "pause", "save", "continue"].includes(action.kind) && !state.ready) {
      state.message = "World is still connecting…";
      notify();
      return;
    }
    if (runtime && action.kind === "action")
      submit({ type: "action", action: action.action });
    else if (runtime && action.kind === "pause")
      submit({ type: state.paused ? "resume" : "pause" });
    else if (runtime && action.kind === "save") {
      state.pendingSave = true;
      state.message = "Save requested…";
      try {
        persistence.save?.();
      } catch (error) {
        state.pendingSave = false;
        state.message = `Could not save: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else if (runtime && action.kind === "reset") {
      try {
        persistence.newWorld((remote) => {
          if (state.disposed) return;
          state.selectedIds = [];
          state.hoverId = null;
          prepareNewWorld(remote);
          state.message = remote ? "Starting a new server world…" : "Resetting the browser world…";
          if (remote) runtime.send({ type: "start", game: mode });
        });
      } catch (error) {
        state.message = `Could not start a new world: ${error.message}`;
      }
    } else if (action.kind === "continue") {
      try {
        state.pendingRestore = true;
        state.message = "Continue requested…";
        void Promise.resolve().then(() => persistence.continue?.()).catch((error) => {
          if (state.disposed) return;
          state.pendingRestore = false;
          state.message = error instanceof Error ? error.message : String(error);
          renderHud();
        });
      } catch (error) {
        state.pendingRestore = false;
        state.message = error.message;
      }
    }
    notify();
  };
  function submit(command, successMessage = "Order queued") {
    if (!runtime) return false;
    const accepted = submitCommand(runtime, command, message => { state.message = message; }, successMessage);
    renderHud();
    return accepted;
  }
  function executeWhistleCommand(commandId, input, label = "Order queued") {
    if (!state.ready) return false;
    void localWhistle.whistle.execute(commandId, { origin: "browser", ...(input === undefined ? {} : { arguments: input }) }).then(outcome => {
      if (state.disposed || outcome.status === "handled") return;
      state.message = outcome.status === "unavailable" ? outcome.reason
        : outcome.status === "failed" ? outcome.error.message : `Unable to run ${label}`;
      renderHud();
    });
    return true;
  }
  function executeWhistle(control, input) {
    return executeWhistleCommand(control.commandId, input, control.label);
  }
  function changeViewLevel(level) {
    closeActionBar();
    terrainArea.send({ type: "CANCEL" });
    edgeGesture.send({ type: "CANCEL" });
    const next = setWorldViewLevel(state.view, level);
    if (next.level === state.view.level) return;
    state.view = next;
    clearPlacement();
    gesture.send({ type: "CANCEL" });
    exitAim();
    state.dragging = null;
    state.hoverId = null;
    updateTerrainDisplay();
    draw();
    renderHud();
  }
  function setCutaway(value) {
    closeActionBar();
    terrainArea.send({ type: "CANCEL" });
    edgeGesture.send({ type: "CANCEL" });
    clearPlacement();
    state.view = toggleWorldCutaway(state.view, value);
    gesture.send({ type: "CANCEL" });
    exitAim();
    state.dragging = null;
    state.hoverId = null;
    updateTerrainDisplay();
    draw();
    renderHud();
  }
  const canvasHost = document.createElement("div");
  canvasHost.className = "hive-canvas";
  const hud = document.createElement("aside");
  hud.className = "hive-hud";
  const hudRoot = createRoot(hud);
  const actionBarHost = document.createElement("div");
  actionBarHost.className = "hive-action-dock";
  const actionBarRoot = createRoot(actionBarHost);
  const actionBarState = createActionBarState();
  canvasHost.append(actionBarHost);
  root.replaceChildren(canvasHost, hud);
  const app = new Application();
  const overlay = new Container();
  const groundEffects = new Container();
  groundEffects.eventMode = "none";
  const transientLayer = new Container();
  const dragGraphic = new Graphics();
  const terrainMarksGraphic = new Graphics();
  const environmentGraphic = new Graphics();
  environmentGraphic.eventMode = "none";
  const aimGraphic = new Graphics();
  const aimArcGraphic = new Graphics();
  const placementGraphic = new Graphics();
  transientLayer.addChild(dragGraphic, aimGraphic, aimArcGraphic, placementGraphic);
  const motionCues = createMotionCueOwner();
  // Remote observations arrive at the server's fixed publication cadence;
  // local Worker frames can stay responsive with the shorter local delay.
  const interpolation = createInterpolationBuffer({
    cadence: persistence.online ? "online" : "local",
  });
  const intendedDestinations = new Map();
  let frameSequence = 0;
  let frameEpoch;
  let awaitingEpochTransition = false;
  let groundSprite = null;
  const cameraGeometry = createCameraGeometryOwner();
  const { project, groundPoint, surfacePoint, terrainPlaneCell } = cameraGeometry;
  let orderingProjection = cameraGeometry.projection;
  let orderedSprites = [];
  let terrainFrame;
  let markSurfaceSource;
  let markSurfaces;
  const terrainProjection = createTerrainProjectionCache();
  const terrainPicker = cameraGeometry;
  let art = null;
  let resizeObserver = null;
  let unsubscribeRuntime = null;
  const cueCursor = createCueCursor();
  let effectOwner;
  let previewCache;
  const audio = createAudioOwner();
  let latestFacts = [];
  let pendingCues = [];
  const effectClock = () => Math.max(0, interpolation.presentationTime()) * 1000;
  const worldScene = createWorldSceneOwner({ runtime, projection: orderingProjection, project, bindings, root, effectClock, onCoverage: () => draw() });
  function displayedTerrainFrame() { return terrainProjection.update(terrainFrame, state.view, frameEpoch); }
  function displayedTerrainHit(x, y, displayed) { return terrainPicker.hit(x, y, displayed, frameEpoch); }
  function displayedTerrainPoint(x, y, displayed) { return terrainPicker.point(x, y, displayed, frameEpoch); }
  function clearPlacement() {
    const control = terrainTarget.getSnapshot().context.control;
    terrainTarget.send({ type: "CLEAR_PLACEMENT",
      y: control?.target === "world-surface" ? state.view.level : null });
  }
  const placementAdvisory = createPlacementAdvisory(
    (query) => runtime.placementDecisions(query),
    (decision) => { state.placementDecision = decision; renderHud(); draw(); },
  );
  function placementGeometryKey(candidates) {
    return JSON.stringify({ party: state.party, placementRevision: terrainFrame?.placementRevision, candidates });
  }
  function requestPlacementDecision(control, input) {
    if (!control || !input || !state.party || !placementCandidates || !runtime?.placementDecisions) {
      if (state.placementDecision !== null) placementAdvisory.clear();
      return;
    }
    let candidates;
    try { candidates = placementCandidates(input); }
    catch (error) {
      placementAdvisory.clear();
      state.placementDecision = { status: "rejected", reason: error instanceof Error ? error.message : String(error), count: 0 };
      return;
    }
    if (!candidates.length) {
      if (state.placementDecision !== null) placementAdvisory.clear();
      return;
    }
    const key = placementGeometryKey(candidates);
    placementAdvisory.request(key, { party: state.party, candidates }, candidates.length);
  }
  function closeActionBar() { actionBarState.set(null); }
  function updateTerrainDisplay() {
    worldScene.updateTerrain(displayedTerrainFrame(), frameEpoch);
  }

  function prepareNewWorld(remote) {
    closeActionBar();
    if (remote) state.ready = false;
    state.pendingSave = false;
    state.pendingRestore = false;
    state.invitationOpen = false;
    state.invitationUrl = null;
    state.invitationCopied = false;
    state.subjects = [];
    latestFacts = [];
    state.presentationFacts = [];
    localWhistle.update([]);
    state.whistleAgent = [];
    state.whistleTargets = [];
    state.terrainMarks = [];
    state.environmentVisuals = [];
    terrainFrame = undefined;
    terrainProjection.update(undefined, state.view, undefined);
    terrainPicker.reset();
    worldScene.clear();
    state.view = createWorldView(worldView);
    state.dragging = null;
    intendedDestinations.clear();
    directControl?.reset();
    gesture.send({ type: "CANCEL" });
    exitAim();
    terrainArea.send({ type: "CANCEL" });
    terrainTarget.send({ type: "CANCEL" });
    frameEpoch = undefined;
    frameSequence = 0;
    awaitingEpochTransition = false;
    cueCursor.reset();
    effectOwner?.clear();
    previewCache?.clear();
    pendingCues = [];
    interpolation.reset();
    motionCues.reset();
    draw();
  }

  function selectEntities(ids) {
    intendedDestinations.clear();
    state.selectedIds = ids;
    emit({ kind: "select", entities: ids });
    renderHud();
    draw();
  }
  function selectedLauncher() {
    if (!aiming?.launcherId) return null;
    return latestFacts.find((fact) => fact.id === aiming.launcherId && state.selectedIds.includes(fact.id) && projectWorldFact(fact, state.view).pickable);
  }
  function toggleAim() {
    if (isAiming()) {
      exitAim();
    } else {
      const launcher = selectedLauncher();
      if (!launcher) return;
      state.aim.launcherId = launcher.id;
      state.aim.elevation = 0.12;
      aimGesture.send({ type: "ENTER", launcherId: launcher.id });
    }
    renderHud();
    draw();
  }
  function exitAim() {
    if (isAiming()) aimGesture.send({ type: "ESCAPE" });
    state.aim = { active: false, launcherId: null, point: null, target: null, elevation: 0.12, velocity: null, preview: null };
    previewCache?.clear();
  }
  function updateAimPreview(force = false) {
    if (!isAiming() || !state.aim.target || !previewCache) return;
    const launcher = selectedLauncher();
    if (!launcher) return;
    const profile = launcher.aim;
    if (!profile?.origin || !Number.isFinite(profile.radius) || profile.radius <= 0 ||
      !Number.isFinite(profile.gravity) || !Number.isFinite(profile.penetration) || profile.penetration < 0 ||
      !Number.isFinite(profile.maxRange) || profile.maxRange <= 0 || !Number.isFinite(profile.maxLifetime) || profile.maxLifetime <= 0)
      throw new Error("launcher preview profile unavailable");
    const velocity = fireInput({ launcherId: launcher.id, origin: profile.origin, target: state.aim.target, elevation: state.aim.elevation, speed: profile.speed ?? 8 }).velocity;
    const request = { origin: profile.origin, muzzle: profile.muzzle, velocity, inheritedVelocity: profile.inheritedVelocity, radius: profile.radius, gravity: profile.gravity, penetration: profile.penetration, maxRange: profile.maxRange, maxLifetime: profile.maxLifetime, colliders: latestFacts.filter((fact) => fact.id !== launcher.id && fact.collision).map((fact) => ({ id: fact.id, ...fact.collision })) };
    state.aim.velocity = velocity;
    state.aim.preview = previewCache.get(request, { force });
  }
  function fireAim() {
    if (!state.ready || !isAiming()) return;
    const launcher = selectedLauncher();
    if (!launcher || !state.aim.target) return;
    updateAimPreview(true);
    const velocity = state.aim.velocity;
    if (!velocity) throw new Error("aim preview velocity unavailable");
    audio.unlock();
    if (!executeWhistleCommand(`${mode}:${aiming.command}`, { velocity }, "Fire cannon")) return;
    aimGesture.send({ type: "FIRE" });
    exitAim();
  }
  function renderHud() {
    const controls = localControls();
    const buildGroups = buildControls(controls);
    const buildIds = new Set(buildGroups.flatMap((group) => group.controls.map((control) => control.id)));
    const selectedBuild = terrainTarget.getSnapshot().context.control;
    const selectedGroup = buildGroups.find((group) => group.controls.some((control) => control.id === selectedBuild?.id));
    const placementSnapshot = terrainArea.getSnapshot();
    const placementPreviewCells = selectedBuild && placementSnapshot.value === "dragging"
      ? placementCells({ area: placementSnapshot.context, target: null })
      : [];
    const placementStatus = selectedBuild
      ? placementHint(selectedBuild, {
        area: { value: placementSnapshot.value, rejection: placementSnapshot.context.rejection },
        hover: terrainTarget.getSnapshot().context.hover,
        cells: placementPreviewCells.length,
        decision: state.placementDecision,
      })
      : null;
    const armTerrainControl = (control) => {
      if (!control || control.availability?.status === "unavailable") return;
      exitAim();
      gesture.send({ type: "CANCEL" });
      terrainArea.send({ type: "CANCEL" });
      edgeGesture.send({ type: "CANCEL" });
      terrainTarget.send({ type: "ARM", control,
        y: control.target === "world-surface" ? state.view.level : null });
      actionBarState.set(null);
      state.message = control.target === "terrain-area"
        ? `${control.label}: drag a rectangle; Escape exits`
        : `${control.label}: choose a visible terrain top; Escape exits`;
      renderHud();
      draw();
    };
    const chooseBuild = (group, orientation = group.orientations[0]) => {
      const control = selectedBuildControl(group, orientation);
      if (!control || control.availability?.status === "unavailable") return;
      exitAim(); gesture.send({ type: "CANCEL" }); terrainArea.send({ type: "CANCEL" }); edgeGesture.send({ type: "CANCEL" });
      terrainTarget.send({ type: selectedGroup?.catalog === group.catalog ? "ROTATE" : "ARM", control,
        y: control.target === "world-surface" ? state.view.level : null });
      actionBarState.set(null);
      state.message = `${control.label}: click or drag to place · R rotates · Escape/Done exits`;
      renderHud();
    };
    const activeControl = terrainTarget.getSnapshot().context.control;
    const activeBuildGroup = selectedGroup;
    const cancelPlacement = () => {
      terrainArea.send({ type: "CANCEL" }); edgeGesture.send({ type: "CANCEL" }); terrainTarget.send({ type: "ESCAPE" });
      state.message = "Selection"; actionBarState.set(null); renderHud(); draw();
    };
    const renderBuildPalette = () => buildGroups.length && actionBarState.get() === "build" ? React.createElement("section", { className: "hive-action-palette", "aria-label": "Build palette" },
      buildGroups.map((group) => {
        const active = selectedGroup?.catalog === group.catalog;
        const orientation = active ? selectedBuild?.input?.orientation : group.orientations[0];
        const control = selectedBuildControl(group, orientation);
        const details = control?.detail ?? null;
        return React.createElement("div", { className: "hive-build-entry", key: group.catalog },
          React.createElement(Button, { size: "sm", variant: active ? "secondary" : "outline", "aria-pressed": active, disabled: !state.ready || control?.availability?.status === "unavailable", title: control?.availability?.status === "unavailable" ? control.availability.reason : details, onClick: () => chooseBuild(group, orientation) }, control?.label ?? group.catalog),
          details ? React.createElement("small", { className: "hive-build-detail" }, details) : null,
          active && group.orientations.length > 1 ? React.createElement(Button, { size: "sm", variant: "outline", onClick: () => chooseBuild(group, nextOrientation(group, orientation)), "aria-label": "Rotate building" }, "↻") : null,
          active && group.orientations.length > 1 ? React.createElement("small", null, orientation) : null,
        );
      }),
    ) : null;
    const contextualPresentation = projectContextualPresentation({
      facts: state.presentationFacts,
      controls,
      targets: state.whistleTargets,
      selectedIds: state.selectedIds,
      latestFacts,
      currentIds: [
        ...latestFacts.filter((fact) => fact.pose?.position && fact.visual && projectWorldFact(fact, state.view).pickable).map((fact) => fact.id),
        ...state.terrainMarks.flatMap((mark) => mark.subjects ?? []),
      ],
    });
    const selectedActionControls = selectedActionBarControls(
      contextualPresentation.selection.controls,
      state.selectedIds,
    );
    // Only world-scoped commands belong in the global dock. Selection-scoped
    // work remains on the selected person/object card.
    const actionGroups = actionBarGroups(contextualPresentation.world.controls, buildIds);
    const selectedStation = mode === "colony" ? selectedBrewStation(latestFacts, state.selectedIds) : null;
    const stationSelection = selectedStation
      ? { ...contextualPresentation.selection, label: "Brew station" }
      : contextualPresentation.selection;
    const renderPresentationGroup = (heading, group) => group.facts.length || group.controls.length
      ? React.createElement("section", { className: `hive-presentation${heading === "Brew station" ? " hive-station-card" : ""}`, "aria-label": heading },
          React.createElement("strong", null, heading),
          heading === "Brew station"
            ? React.createElement("p", { className: "hive-status" }, "Finished station · choose an action here")
            : null,
          group.facts.map((fact) => React.createElement("div", { key: fact.id },
            `${fact.label}: ${typeof fact.value === "number" ? displayedNumber.format(fact.value) : fact.value}`)),
      group.controls.map((control) => React.createElement(Button, {
            key: control.id,
            size: "sm",
            variant: "outline",
            disabled: !state.ready || control.availability?.status === "unavailable",
            title: control.availability?.status === "unavailable" ? control.availability.reason : undefined,
            onClick: () => {
              if (control.availability?.status === "unavailable") return;
              if (control.target === "terrain-cell" || control.target === "terrain-area" || control.target === "world-surface") {
                armTerrainControl(control);
                return;
              }
              if (aiming) audio.unlock();
              return executeWhistle(control, bindingCommand(control, state.selectedIds).input);
            },
          }, control.label)),
        ) : null;
    const renderWorldControl = (control) => React.createElement(Button, {
      key: control.id, size: "sm", variant: "outline",
      disabled: !state.ready || control.availability?.status === "unavailable",
      title: control.availability?.status === "unavailable" ? control.availability.reason : control.detail,
      onClick: () => {
        if (control.availability?.status === "unavailable") return;
        if (control.target === "terrain-cell" || control.target === "terrain-area" || control.target === "world-surface") {
          armTerrainControl(control); actionBarState.set(null); return;
        }
        if (aiming) audio.unlock();
        executeWhistle(control, bindingCommand(control, state.selectedIds).input);
      },
    }, control.label);
    const renderOrdersPalette = () => actionBarState.get() === "orders" ? React.createElement("section", { className: "hive-action-palette", "aria-label": "Orders and work palette" },
      ...actionGroups.work.map(renderWorldControl),
    ) : null;
    const renderZonesPalette = () => actionBarState.get() === "zones" ? React.createElement("section", { className: "hive-action-palette", "aria-label": "Zones palette" },
      ...actionGroups.zones.map(renderWorldControl),
    ) : null;
    const renderSelectedActionPalette = () => selectedActionControls.length
      ? React.createElement("section", { className: "hive-action-palette", "aria-label": "Selected people actions" },
        selectedActionControls.map((control) => React.createElement(Button, {
          key: control.id,
          size: "sm",
          variant: "outline",
          disabled: !state.ready || control.availability?.status === "unavailable",
          title: control.availability?.status === "unavailable"
            ? control.availability.reason
            : control.detail,
          "aria-label": control.availability?.status === "unavailable"
            ? `${control.label}: ${control.availability.reason}`
            : control.label,
          onClick: () => executeWhistle(control, bindingCommand(control, state.selectedIds).input),
        }, control.label)),
      ) : null;
    const renderActiveTool = () => activeControl ? React.createElement("section", { className: "hive-active-tool", "aria-label": "Active tool" },
      React.createElement("strong", null, activeControl.label),
      activeControl.detail ? React.createElement("small", null, activeControl.detail) : null,
      React.createElement("small", { className: "hive-placement-status", "aria-live": "polite" }, placementStatus),
      activeBuildGroup?.orientations.length > 1 ? React.createElement(Button, { size: "sm", variant: "outline", onClick: () => chooseBuild(activeBuildGroup, nextOrientation(activeBuildGroup, activeBuildGroup.orientations.includes(activeControl.input?.orientation) ? activeControl.input.orientation : activeBuildGroup.orientations[0])) }, "Rotate ↻") : null,
      React.createElement(Button, { size: "sm", variant: "primary", onClick: cancelPlacement }, "Done / cancel"),
    ) : null;
    const renderActionDock = () => React.createElement(React.Fragment, null,
      renderBuildPalette(), renderOrdersPalette(), renderZonesPalette(), renderSelectedActionPalette(), renderActiveTool(),
      React.createElement("div", { className: "hive-action-bar", role: "toolbar", "aria-label": "World actions" },
        buildGroups.length ? React.createElement(Button, { size: "sm", variant: actionBarState.get() === "build" ? "secondary" : "outline", "aria-expanded": actionBarState.get() === "build", onClick: () => { actionBarState.toggle("build"); renderHud(); } }, "Build") : null,
        actionGroups.work.length ? React.createElement(Button, { size: "sm", variant: actionBarState.get() === "orders" ? "secondary" : "outline", "aria-expanded": actionBarState.get() === "orders", onClick: () => { actionBarState.toggle("orders"); renderHud(); } }, "Orders / Work") : null,
        actionGroups.zones.length ? React.createElement(Button, { size: "sm", variant: actionBarState.get() === "zones" ? "secondary" : "outline", "aria-expanded": actionBarState.get() === "zones", onClick: () => { actionBarState.toggle("zones"); renderHud(); } }, "Zones") : null,
      ),
    );
    const act = (kind) => {
      if (kind === "reset") {
        state.selectedIds = [];
        state.hoverId = null;
        camera.reset();
      }
      emit({ kind });
      renderHud();
    };
    hudRoot.render(
      React.createElement(
        Card,
        { variant: "outline", className: "hive-card" },
        React.createElement(
          CardContent,
          { className: "hive-card-content" },
          React.createElement(
            "div",
            { className: "hive-kicker" },
            `HIVE / ${mode}`,
          ),
          React.createElement("h1", null, title),
          React.createElement("p", null, subtitle),
          React.createElement("p", { className: "hive-status" }, state.message),
          state.connection.status !== "online"
            ? React.createElement("p", { className: "hive-status" }, state.connection.status === "unavailable"
              ? `Connection unavailable · ${state.connection.pending} order${state.connection.pending === 1 ? "" : "s"} retained`
              : `Reconnecting · ${state.connection.pending} order${state.connection.pending === 1 ? "" : "s"} retained`)
            : null,
          state.connection.status === "unavailable" && runtime?.recovery
            ? React.createElement(Button, { size: "sm", variant: "secondary", onClick: () => {
                try { runtime.recovery.retry(); state.message = "Retrying connection…"; }
                catch (error) { state.message = error instanceof Error ? error.message : String(error); }
                renderHud();
              } }, "Retry connection")
            : null,
          React.createElement(
            "div",
            { className: "hive-controls" },
            React.createElement("div", { className: "hive-view-controls", role: "group", "aria-label": "World view" },
              React.createElement("span", { "aria-live": "polite" }, `Voxel layer ${state.view.level}`),
              ...WORLD_VIEW_CONTROLS.map((control) => React.createElement(Button, {
                key: control.id,
                size: "sm",
                variant: "outline",
                disabled: state.view.level + control.delta < state.view.range.min || state.view.level + control.delta > state.view.range.max,
                "aria-label": `${control.label} voxel layer`,
                onClick: () => changeViewLevel(state.view.level + control.delta),
              }, control.label)),
              React.createElement(Button, {
                size: "sm",
                variant: state.view.cutaway ? "secondary" : "outline",
                disabled: !(terrainFrame?.surfaces?.length || state.view.presentedSurfaces.size > 0),
                "aria-label": "Toggle cutaway",
                onClick: () => setCutaway(!state.view.cutaway),
              }, "Cutaway"),
              React.createElement(Button, { size: "sm", variant: "outline", "aria-label": "Rotate camera left",
                onClick: () => rotateCamera(-1) }, "↶ View"),
              React.createElement(Button, { size: "sm", variant: "outline", "aria-label": "Rotate camera right",
                onClick: () => rotateCamera(1) }, "View ↷"),
            ),
            aiming && selectedLauncher()
              ? React.createElement(Button, {
                  size: "sm",
                  variant: isAiming() ? "secondary" : "outline",
                  onClick: () => toggleAim(),
                }, isAiming() ? "Exit aim" : "Aim cannon")
              : null,
            directControl ? React.createElement(Button, { size: "sm", variant: "outline", onClick: () => { directControl.setPrediction(!directControl.predictionEnabled); app.canvas?.focus(); renderHud(); } }, directControl.predictionEnabled ? "Prediction on" : "Prediction off") : null,
            ...activeSelectionShortcuts.map(({ id, label }) => React.createElement(
              Button,
              { key: id, size: "sm", variant: "outline",
                // Eligibility follows the accepted world, even before the next drawing frame.
                disabled: !latestFacts.some((fact) => fact.id === id && fact.pose?.position &&
                  fact.visual && projectWorldFact(fact, state.view).pickable),
                onClick: () => selectEntities([id]) },
              label,
            )),
            React.createElement(
              Button,
              { onClick: () => act("pause"), size: "sm" },
              state.paused ? "Resume" : "Pause",
            ),
            aiming ? React.createElement(Button, { size: "sm", variant: "outline", onClick: () => { audio.setMuted(!audio.muted); renderHud(); } }, audio.muted ? "Sound off" : "Sound on") : null,
            React.createElement(
              Button,
              { onClick: () => act("reset"), size: "sm", variant: "secondary" },
              persistence.newWorldLabel,
            ),
            persistence.invitation ? React.createElement(
              Button,
              { size: "sm", variant: "outline", onClick: () => {
                try { state.invitationUrl = persistence.invitation.url(); state.invitationOpen = true; state.invitationCopied = false; state.message = "Invite link ready"; }
                catch (error) { state.message = error instanceof Error ? error.message : String(error); }
                renderHud();
              } },
              "Invite a friend",
            ) : null,
            persistence.saveLabel ? React.createElement(
              Button,
              {
                onClick: () => act("save"),
                disabled: state.pendingSave || state.pendingRestore,
                size: "sm",
                variant: "outline",
              },
              persistence.saveLabel,
            ) : null,
            persistence.continueLabel ? React.createElement(
              Button,
              {
                onClick: () => act("continue"),
                disabled: state.pendingSave || state.pendingRestore,
                size: "sm",
                variant: "outline",
              },
              persistence.continueLabel,
            ) : null,
            React.createElement(
              "span",
              { className: "hive-status" },
              !state.ready ? "Connecting…" : state.connection.status === "online"
                ? persistence.statusLabel : state.connection.status === "recovering"
                  ? "Recovering connection…" : "Connection unavailable",
            ),
          ),
          state.invitationOpen && state.invitationUrl ? React.createElement("div", { className: "hive-invitation" },
            React.createElement("p", null, "Anyone with this link can build and give orders here."),
            React.createElement(Input, { value: state.invitationUrl, readOnly: true, "aria-label": "Friend invitation link", onFocus: event => event.currentTarget.select() }),
            React.createElement(Button, { size: "sm", onClick: async () => {
              const copiedUrl = state.invitationUrl;
              try {
                if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Clipboard access unavailable");
                await globalThis.navigator.clipboard.writeText(copiedUrl);
                if (state.disposed || state.invitationUrl !== copiedUrl) return;
                state.invitationCopied = true; state.message = "Invite link copied";
              } catch (error) {
                if (state.disposed || state.invitationUrl !== copiedUrl) return;
                state.invitationCopied = false; state.message = `Could not copy invite link: ${error instanceof Error ? error.message : String(error)}`;
              }
              renderHud();
            } }, state.invitationCopied ? "Copied" : "Copy link"),
          ) : null,
          renderPresentationGroup(stationSelection.label, stationSelection)
            ?? React.createElement("div", { className: "hive-selection" },
              state.selectedIds.length ? stationSelection.label : "Select a person or object to see its actions"),
          isAiming()
            ? React.createElement("div", { className: "hive-actions" },
                React.createElement("label", null, `Elevation ${Math.round(state.aim.elevation * 180 / Math.PI)}°`),
                React.createElement(Slider, {
                  type: "range", min: "0", max: "0.5", step: "0.01", value: state.aim.elevation,
                  onChange: (event) => { state.aim.elevation = Number(event.target.value); updateAimPreview(); renderHud(); draw(); },
                }),
                React.createElement("span", null, "Move pointer to aim · click to fire · Escape cancels"),
              )
            : null,
          React.createElement(
            "div",
            { className: "hive-actions" },
            controlHelp ?? (mode === "survival"
              ? "Select survivor · WASD / arrows move · E take bread · F eat"
              : "Click selects · Shift adds · drag selects a group · right click orders"),
            mode === "survival" ? null : React.createElement("small", null, "Q / E rotate camera"),
          ),
          React.createElement(
            "a",
            { className: "hive-source", href: source },
            "View TypeScript source ↗",
          ),
          React.createElement(
            "nav",
            null,
            React.createElement("a", { href: "./" }, "Hub"),
            React.createElement("a", { href: "./colony.html" }, "Colony"),
            React.createElement("a", { href: "./survival.html" }, "Survival"),
            React.createElement(
              "a",
              { href: "./formations.html" },
              "Formations",
            ),
            React.createElement("a", { href: "../index.html" }, "Old game"),
          ),
        ),
      ),
    );
    actionBarRoot.render(renderActionDock());
  }

  const camera = {
    x: 0,
    y: 0,
    zoom: canvasHost.clientWidth >= 600 ? 2 : 1,
    pan(dx, dy) {
      this.x -= dx;
      this.y -= dy;
      draw();
    },
    zoomBy(
      delta,
      point = { x: app.screen.width / 2, y: app.screen.height / 2 },
    ) {
      const before = {
        x: (point.x - this.x) / this.zoom,
        y: (point.y - this.y) / this.zoom,
      };
      this.zoom = Math.max(1, Math.min(4, this.zoom + delta));
      this.x = point.x - before.x * this.zoom;
      this.y = point.y - before.y * this.zoom;
      draw();
    },
    reset() {
      this.zoom = canvasHost.clientWidth >= 600 ? 2 : 1;
      this.x = (canvasHost.clientWidth - 640 * this.zoom) / 2;
      this.y = (canvasHost.clientHeight - 400 * this.zoom) / 2;
      draw();
    },
    focus(target) {
      if (!target) return;
      const projected = project(target.x, target.y, target.z);
      this.x = canvasHost.clientWidth / 2 - projected.x * this.zoom;
      this.y = canvasHost.clientHeight / 2 - projected.y * this.zoom;
    },
  };
  function rotateCamera(delta) {
    const center = { x: app.screen.width / 2, y: app.screen.height / 2 };
    const local = { x: (center.x - camera.x) / camera.zoom, y: (center.y - camera.y) / camera.zoom };
    const verticalMetres = displayedTerrainFrame()?.verticalMetres ?? 0.54;
    const focus = cameraGeometry.planePoint(local.x, local.y, (state.view.level + 0.5) * verticalMetres);
    terrainArea.send({ type: "CANCEL" });
    edgeGesture.send({ type: "CANCEL" });
    gesture.send({ type: "CANCEL" });
    clearPlacement();
    orderingProjection = cameraGeometry.rotate(delta);
    worldScene.setProjection(orderingProjection, cameraGeometry.turn);
    const projected = project(focus.x, focus.y, focus.z);
    camera.x = center.x - projected.x * camera.zoom;
    camera.y = center.y - projected.y * camera.zoom;
    draw(); renderHud();
  }
  function draw() {
    if (!app.stage) return;
    const now = performance.now();
    directControl?.tick(now, state.paused);
    const visibleFacts = interpolation.render(now, { paused: state.paused });
    const presentedTime = interpolation.presentationTime();
    const due = pendingCues.filter(cue => cue.time <= presentedTime + 1e-9);
    pendingCues = pendingCues.filter(cue => cue.time > presentedTime + 1e-9);
    for (const cue of due) if (presentedTime - cue.time <= 3) playCue(cue);
    const presentedFacts = (directControl && !state.paused ? directControl.display(visibleFacts) : visibleFacts)
      .filter((fact) => projectWorldFact(fact, state.view).visible);
    state.subjects = presentedFacts
      .filter((fact) => fact.pose?.position && fact.visual)
      .map((fact) => ({
        id: fact.id,
        name: fact.label || fact.id,
        x: fact.pose.position.x,
        y: fact.pose.position.y,
        z: fact.pose.position.z,
        facing: fact.pose.facing,
        visual: fact.visual,
        motion: bindings[fact.visual]?.motion,
        local: fact.local,
        support: fact.support,
        surface: fact.surface,
        projectile: fact.projectile,
        inventory: fact.inventory,
        activity: fact.activity,
        pose: fact.pose,
        placement: fact.placement,
        screen: { x: 0, y: 0 },
        hitZoom: camera.zoom,
        pickable: projectWorldFact(fact, state.view).pickable,
      }));
    const subjectTerrain = displayedTerrainFrame();
    if (subjectTerrain)
      state.subjects.push(...edgeWallJunctionSubjects(state.subjects, bindings, subjectTerrain.verticalMetres));
    for (const cue of motionCues.sample(state.subjects, { now: presentedTime, paused: state.paused, sequence: frameSequence })) playMotionCue(cue);
    if (!groundSprite) {
      if (environment === "water") {
        groundSprite = new Graphics().rect(-320, -200, 640, 400).fill(0x173c55);
        for (let index = 0; index < 7; index++) {
          const y = -162 + index * 54;
          groundSprite
            .moveTo(-280 + (index % 2) * 24, y)
            .lineTo(-100 + index * 31, y - 5)
            .stroke({ color: 0x2a5870, width: 1, alpha: 0.65 });
        }
      } else {
        groundSprite = art?.ground
          ? new Sprite(art.ground)
          : new Graphics().rect(0, 0, 640, 400).fill(0x24352e);
      }
      groundSprite.anchor?.set?.(0.5);
      overlay.addChild(groundSprite, worldScene.container, terrainMarksGraphic, groundEffects, environmentGraphic, transientLayer);
    }
    dragGraphic.clear();
    dragGraphic.visible = false;
    groundSprite.position.set(
      320 * camera.zoom + camera.x,
      200 * camera.zoom + camera.y,
    );
    groundSprite.scale.set(camera.zoom);
    groundSprite.visible = !terrainFrame;
    worldScene.position(camera, state.view, app.screen);
    terrainMarksGraphic.clear();
    const displayedTerrain = displayedTerrainFrame();
    // Emission facts remain native state and are shown in the station's
    // retained authored visual. No procedural fire/smoke shapes are drawn.
    environmentGraphic.clear();
    if (state.terrainMarks.length > 0 && displayedTerrain) {
      if (markSurfaceSource !== displayedTerrain.surfaces) {
        markSurfaceSource = displayedTerrain.surfaces;
        markSurfaces = new Map(displayedTerrain.surfaces.map((surface) => [surface.cell.join(","), surface]));
      }
      for (const mark of state.terrainMarks) {
        const surface = markSurfaces.get(mark.cell.join(","));
        if (!surface) continue;
        const [x, y, z] = surface.cell;
        const corners = [[x - 0.5, z - 0.5], [x + 0.5, z - 0.5], [x + 0.5, z + 0.5], [x - 0.5, z + 0.5]].flatMap(([a, b]) => {
          const projected = project(a, (y + 0.5) * displayedTerrain.verticalMetres, b);
          return [projected.x * camera.zoom + camera.x, projected.y * camera.zoom + camera.y];
        });
        const color = mark.kind === "stockpile" ? 0x8aaf72 : mark.status === "working" ? 0xd99a4a : mark.status === "blocked" ? 0xb85757 : 0xe8c779;
        terrainMarksGraphic.poly(corners).stroke({ color, width: 2, alpha: 0.85 });
      }
    }
    const targetSnapshot = terrainTarget.getSnapshot();
    const buildControl = targetSnapshot.context.control?.command === "build" ? targetSnapshot.context.control : null;
    const guide = targetSnapshot.value === "armed" && targetSnapshot.context.control?.target === "world-surface" && displayedTerrain &&
      Number.isSafeInteger(targetSnapshot.context.planeY) && targetSnapshot.context.hover
      ? { hoveredCell: targetSnapshot.context.hover, planeY: targetSnapshot.context.planeY,
        footprintCells: placementFootprintCells(buildControl, targetSnapshot.context.hover),
        verticalMetres: displayedTerrain.verticalMetres, status: state.placementDecision?.status }
      : undefined;
    const edge = edgeGesture.getSnapshot();
    const area = terrainArea.getSnapshot();
    const displayed = displayedTerrainFrame();
    let ghostSpec;
    if (edge.value === "dragging" && displayed) {
      const edgeVisual = placementVisuals[buildControl?.input?.catalog]?.visual;
      const edgeVisualRoot = typeof edgeVisual === "string" ? edgeVisual.replace(/\.finished$/, "") : null;
      ghostSpec = edgeStructureGhostSpec(edge.context.edges, state.subjects, bindings, displayed.verticalMetres, edgeVisualRoot);
      requestPlacementDecision(buildControl, buildControl && edge.context.edges.length
        ? buildPlacementCommand(buildControl, state.selectedIds, { edges: canonicalEdges(edge.context.edges), mode: "edge-line" }).input
        : null);
    } else if (buildControl && buildControl.target !== "world-edge" && displayed) {
      const cells = placementCells({
        area: area.value === "dragging" ? area.context : null,
        target: targetSnapshot.context.hover,
      });
      ghostSpec = placementVisualSpec(buildControl, cells, placementVisuals,
        area.value === "dragging" ? { start: area.context.start, end: area.context.current } : undefined,
        latestFacts, displayed.verticalMetres);
      const previewInput = cells.length === 0 ? null : area.value === "dragging"
        ? buildPlacementCommand(buildControl, state.selectedIds, { start: area.context.start, end: area.context.current, mode: area.context.mode }).input
        : terrainCellCommand(buildControl, state.selectedIds, { cell: cells[0], source: "placement" }).input;
      requestPlacementDecision(buildControl, previewInput);
    }
    orderedSprites = worldScene.render({ subjects: state.subjects, selectedIds: state.selectedIds,
      art, paused: state.paused, frameSequence, guide, ghost: ghostSpec, placementStatus: state.placementDecision?.status });
    const drag = gesture.getSnapshot().context;
    if (
      gesture.getSnapshot().value === "dragging" &&
      drag.start &&
      drag.current
    )
      dragGraphic
        .rect(
          Math.min(drag.start.x, drag.current.x),
          Math.min(drag.start.y, drag.current.y),
          Math.abs(drag.current.x - drag.start.x),
          Math.abs(drag.current.y - drag.start.y),
        )
        .fill({ color: 0xe8c779, alpha: 0.12 })
        .stroke({ color: 0xe8c779, width: 1 });
    dragGraphic.visible = Boolean(
      gesture.getSnapshot().value === "dragging" &&
      drag.start &&
      drag.current,
    );
    if (area.value === "dragging" && displayed) {
      const preview = visibleTerrainDesignationPreview(displayed, area.context.start, area.context.current, area.context.mode);
      for (const surface of preview) {
        const [x,y,z] = surface.cell;
        const points = [[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]].flatMap(([a,b]) => {
          const p = project(a,(y+.5)*displayed.verticalMetres,b);
          return [p.x*camera.zoom+camera.x,p.y*camera.zoom+camera.y];
        });
        dragGraphic.poly(points).fill({color:0xe8c779,alpha:.22}).stroke({color:0xe8c779,width:1});
      }
      dragGraphic.visible = true;
    }
    placementGraphic.clear();
    placementGraphic.visible = false;
    if (edge.value === "dragging" && displayed) {
      placementGraphic.visible = true;
      for (const segment of edge.context.edges) {
        const [worldA, worldB] = edgeSegmentEndpoints(segment, displayed.verticalMetres);
        const a = project(...worldA), b = project(...worldB);
        placementGraphic.moveTo(a.x * camera.zoom + camera.x, a.y * camera.zoom + camera.y).lineTo(b.x * camera.zoom + camera.x, b.y * camera.zoom + camera.y).stroke({ color: 0xe8c779, width: 3, alpha: 0.8 });
      }
    }
    if (isAiming() && state.aim.point && state.aim.target) {
      const marker = state.aim.preview?.contacts?.find(contact => contact.response === "ground")?.point ?? state.aim.preview?.position;
      const target = marker ? project(marker.x, marker.y, marker.z) : null;
      const sx = target ? target.x * camera.zoom + camera.x : 0, sy = target ? target.y * camera.zoom + camera.y : 0;
      aimGraphic.clear().circle(sx, sy, 8).stroke({ color: 0xe8c779, width: 2 });
      aimGraphic.visible = Boolean(marker);
      aimArcGraphic.clear();
      const arc = state.aim.preview?.trajectory?.map(sample => sample.position);
      if (Array.isArray(arc)) {
        for (let index = 1; index < arc.length; index += 2) {
          const a = project(arc[index - 1].x, arc[index - 1].y, arc[index - 1].z);
          const b = project(arc[index].x, arc[index].y, arc[index].z);
          aimArcGraphic.moveTo(a.x * camera.zoom + camera.x, a.y * camera.zoom + camera.y)
            .lineTo(b.x * camera.zoom + camera.x, b.y * camera.zoom + camera.y)
            .stroke({ color: 0xe8c779, width: 2, alpha: 0.75 });
        }
      }
      aimArcGraphic.visible = true;
    } else { aimGraphic.visible = false; aimArcGraphic.visible = false; }
    effectOwner?.tick(effectClock());
  }
  function point(event) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function pointerDown(event) {
    if (isTypingTarget(event.target) || event.button !== 0) return;
    app.canvas.focus();
    const at = point(event);
    const targetControl = terrainTarget.getSnapshot().context.control;
    if (targetControl) {
      if (!state.ready) return;
      const displayed = displayedTerrainFrame();
      const localPoint = { x: (at.x - camera.x) / camera.zoom, y: (at.y - camera.y) / camera.zoom };
      const mode = placementMode(targetControl, event);
      if (displayed && targetControl.target === "world-surface" && Number.isInteger(terrainTarget.getSnapshot().context.planeY)) {
        const candidate = terrainPlaneCell(localPoint.x, localPoint.y, terrainTarget.getSnapshot().context.planeY, displayed.verticalMetres);
        if (candidate) {
          if (mode !== "point") {
            terrainArea.send({ type: "SET_MODE", mode });
            terrainArea.send({ type: "BEGIN", cell: candidate });
            app.canvas.setPointerCapture?.(event.pointerId); draw(); return;
          }
          if (executeWhistle(targetControl, terrainCellCommand(targetControl, state.selectedIds, { cell: candidate, source: "placement" }).input)) clearPlacement();
          return;
        }
      }
      const structurePoint = { x: (at.x - camera.x) / camera.zoom, y: (at.y - camera.y) / camera.zoom };
      const spriteSurface = displayed ? structureSurfaceFromOrderedSprites(orderedSprites, state.subjects, structurePoint, structurePoint, displayed, project) : null;
      const hit = spriteSurface
        ? { kind: "structure-top", surface: spriteSurface }
        : displayed && displayedTerrainHit(localPoint.x, localPoint.y, displayed);
      const structure = hit?.kind === "structure-top";
      const worldStructureTarget = targetControl.target === "world-surface" || targetControl.target === "world-edge";
      const surface = (hit?.kind === "terrain-top" || (structure && worldStructureTarget)) && hit.surface;
      if (!surface) {
        state.message = worldStructureTarget ? "Choose a visible ground or building surface" : "Choose a visible terrain top";
        renderHud();
        return;
      }
      if (targetControl.target === "world-edge") {
        const segment = nearestGridSegment(localPoint, project, surface.cell, displayed.verticalMetres);
        edgeGesture.send({ type: "BEGIN_EDGE", edge: { cell: [...segment.cell], axis: segment.axis } });
        app.canvas.setPointerCapture?.(event.pointerId); draw(); return;
      }
      if (targetControl.target === "terrain-area") {
        terrainArea.send({ type: "SET_MODE", mode: "rectangle" });
        terrainArea.send({ type: "BEGIN", cell: surface.cell });
        app.canvas.setPointerCapture?.(event.pointerId);
        draw();
        return;
      }
      if (targetControl.target === "world-surface" && mode !== "point") {
        terrainArea.send({ type: "SET_MODE", mode });
        terrainArea.send({ type: "BEGIN", cell: surface.cell });
        app.canvas.setPointerCapture?.(event.pointerId);
        draw();
        return;
      }
      if (targetControl.target === "world-surface")
        terrainTarget.send({ type: "SET_BUILD_PLANE", y: surface.cell[1] });
      executeWhistle(targetControl, terrainCellCommand(targetControl, state.selectedIds, { cell: surface.cell, ...(structure ? { source: "structure" } : { material: surface.material }) }).input);
      return;
    }
    if (isAiming()) {
      state.aim.point = at;
      try { state.aim.target = aimGroundPoint(at, camera, camera.zoom, groundPoint); updateAimPreview(); } catch { state.aim.target = null; }
      fireAim(); return;
    }
    const displayed = displayedTerrainFrame();
    const local = { x: (at.x - camera.x) / camera.zoom, y: (at.y - camera.y) / camera.zoom };
    const front = worldScene.pick(local).record;
    const groundVisible = front?.role === "terrain" || front?.role === "terrain-cover";
    const terrainHit = groundVisible && displayed && displayedTerrainHit(local.x, local.y, displayed);
    const mark = terrainHit?.surface && state.terrainMarks.find((item) => item.kind === "stockpile" && item.cell.join(",") === terrainHit.surface.cell.join(","));
    if (mark?.subjects?.length) {
      selectEntities(event.shiftKey ? [...new Set([...state.selectedIds, ...mark.subjects])] : [...mark.subjects]);
      return;
    }
    gesture.send({ type: "BEGIN", point: at, additive: event.shiftKey });
    app.canvas.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
    const edgeSnapshot = edgeGesture.getSnapshot();
    if (edgeSnapshot.value === "dragging") {
      const displayed = displayedTerrainFrame();
      if (!displayed) { edgeGesture.send({ type: "CANCEL" }); draw(); return; }
      const at = point(event), local = { x: (at.x - camera.x) / camera.zoom, y: (at.y - camera.y) / camera.zoom };
      const hovered = terrainPlaneCell(local.x, local.y, edgeSnapshot.context.start.cell[1], displayed.verticalMetres);
      edgeGesture.send({ type: "MOVE_EDGE", cell: hovered });
      draw(); return;
    }
    if (terrainArea.getSnapshot().value === "dragging") {
      const context = terrainArea.getSnapshot().context;
      const displayed = displayedTerrainFrame();
      if (!displayed) {
        terrainArea.send({ type: "CANCEL" });
        app.canvas.releasePointerCapture?.(event.pointerId);
        state.message = "Terrain changed; select the area again";
        renderHud(); draw(); return;
      }
      const at = point(event);
      const cell = terrainPlaneCell((at.x-camera.x)/camera.zoom, (at.y-camera.y)/camera.zoom, context.start[1], displayed.verticalMetres);
      if (cell.every((value,index) => value === context.current[index])) return;
      terrainArea.send({ type: "MOVE", cell });
      state.message = terrainArea.getSnapshot().context.rejection
        ?? `Designate ${visibleTerrainDesignationPreview(displayed, context.start, cell, context.mode).length} visible cells`;
      renderHud(); draw(); return;
    }
    const targetSnapshot = terrainTarget.getSnapshot();
    if (targetSnapshot.value === "armed" && targetSnapshot.context.control?.target === "world-surface") {
      const displayed = displayedTerrainFrame();
      const at = point(event);
      const local = { x: (at.x - camera.x) / camera.zoom, y: (at.y - camera.y) / camera.zoom };
      const spriteSurface = displayed ? structureSurfaceFromOrderedSprites(orderedSprites, state.subjects, local, local, displayed, project) : null;
      const hit = spriteSurface ? { kind: "structure-top", surface: spriteSurface } : displayed && displayedTerrainHit(local.x, local.y, displayed);
      if (hit?.surface && !Number.isInteger(targetSnapshot.context.planeY))
        terrainTarget.send({ type: "SET_BUILD_PLANE", y: hit.surface.cell[1] });
      const planeY = terrainTarget.getSnapshot().context.planeY;
      const candidate = displayed && Number.isInteger(planeY)
        ? terrainPlaneCell(local.x, local.y, planeY, displayed.verticalMetres)
        : (targetSnapshot.context.control?.command === "build" && hit?.surface ? [...hit.surface.cell] : null);
      terrainTarget.send({ type: "HOVER", cell: candidate });
      draw();
      return;
    }
    if (isAiming()) {
      state.aim.point = point(event);
      aimGesture.send({ type: "MOVE", point: state.aim.point });
      try { state.aim.target = aimGroundPoint(state.aim.point, camera, camera.zoom, groundPoint); updateAimPreview(); } catch { state.aim.target = null; }
      draw();
      return;
    }
    if (gesture.getSnapshot().value !== "dragging") return;
    gesture.send({ type: "MOVE", point: point(event) });
    draw();
  }
  function finishTerrainArea(event) {
    pointerMove(event);
    if (terrainArea.getSnapshot().value !== "dragging") {
      app.canvas.releasePointerCapture?.(event.pointerId);
      return;
    }
    const areaContext = terrainArea.getSnapshot().context;
    const { start, current, mode } = areaContext;
    const control = terrainTarget.getSnapshot().context.control;
    terrainArea.send({ type: "END" });
    terrainTarget.send({ type: "HOVER", cell: null });
    app.canvas.releasePointerCapture?.(event.pointerId);
    const rejection = terrainArea.getSnapshot().context.rejection;
    if (rejection) {
      state.message = rejection;
      renderHud(); draw(); return;
    }
    if (control?.target === "terrain-area" || control?.target === "world-surface") {
      const endpoints = designationEndpoints(start, current, mode, 256);
      executeWhistle(control, control.command === "build"
        ? buildPlacementCommand(control, state.selectedIds, { ...endpoints, mode }).input
        : terrainAreaCommand(control, state.selectedIds, { start: endpoints.start, end: endpoints.end }).input);
    }
    renderHud(); draw(); return;
  }
  function pointerUp(event) {
    const edgeSnapshot = edgeGesture.getSnapshot();
    if (edgeSnapshot.value === "dragging") {
      edgeGesture.send({ type: "END" });
      const stroke = edgeGesture.getSnapshot().context;
      app.canvas.releasePointerCapture?.(event.pointerId);
      const control = terrainTarget.getSnapshot().context.control;
      if (stroke.rejection) state.message = stroke.rejection;
      else if (control && stroke.committed.length) executeWhistle(control, buildPlacementCommand(control, state.selectedIds, { edges: canonicalEdges(stroke.committed), mode: "edge-line" }).input);
      renderHud(); draw(); return;
    }
    if (terrainArea.getSnapshot().value === "dragging") {
      finishTerrainArea(event);
      return;
    }
    const snapshot = gesture.getSnapshot();
    if (snapshot.value !== "dragging") return;
    const drag = snapshot.context;
    gesture.send({ type: "END" });
    const end = point(event);
    const box = {
      left: Math.min(drag.start.x, end.x),
      right: Math.max(drag.start.x, end.x),
      top: Math.min(drag.start.y, end.y),
      bottom: Math.max(drag.start.y, end.y),
    };
    const click = Math.hypot(end.x - drag.start.x, end.y - drag.start.y) <= 5;
    if (click) {
      box.left = box.right = end.x;
      box.top = box.bottom = end.y;
    }
    const localEnd = { x: (end.x - camera.x) / camera.zoom, y: (end.y - camera.y) / camera.zoom };
    const picked = click ? worldScene.pick(localEnd) : null;
    const directHit = picked?.target ? [picked.target] : [];
    let hit = click
      ? directHit.length
        ? drag.additive
          ? state.selectedIds.includes(directHit[0])
            ? state.selectedIds.filter(id => id !== directHit[0])
            : [...state.selectedIds, directHit[0]]
          : directHit
        : drag.additive ? state.selectedIds : []
      : selectionFromSubjects(state.subjects, {
        left: (box.left - camera.x) / camera.zoom, right: (box.right - camera.x) / camera.zoom,
        top: (box.top - camera.y) / camera.zoom, bottom: (box.bottom - camera.y) / camera.zoom,
      }, drag.additive, state.selectedIds);
    if (click && !picked?.record) {
      const local = {
        x: (end.x - camera.x) / camera.zoom,
        y: (end.y - camera.y) / camera.zoom,
      };
      const deck = surfaceSubjectFromOrdered(orderedSprites, state.subjects, local, surfacePoint);
      if (deck) hit = drag.additive ? [...new Set([...state.selectedIds, deck.subject.id])] : [deck.subject.id];
    }
    selectEntities(hit);
  }
  function pointerCancel(event) {
    gesture.send({ type: "CANCEL" });
    terrainArea.send({ type: "CANCEL" });
    edgeGesture.send({ type: "CANCEL" });
    state.dragging = null;
    app.canvas.releasePointerCapture?.(event.pointerId);
    draw();
  }
  function contextMenu(event) {
    event.preventDefault();
    if (terrainTarget.getSnapshot().value === "armed") {
      terrainArea.send({ type: "CANCEL" });
      edgeGesture.send({ type: "CANCEL" });
      terrainTarget.send({ type: "CANCEL" }); closeActionBar(); state.message = "Selection"; renderHud(); return;
    }
    if (isAiming()) return;
    if (!state.ready) {
      state.message = "World is still connecting…";
      renderHud();
      return;
    }
    if (directControl) return;
    const at = point(event);
    const eligibleIds = eligibleSelectedIds(state.subjects, state.selectedIds);
    if (eligibleIds.length === 0) return;
    const selected = state.subjects.filter((subject) => eligibleIds.includes(subject.id));
    const frames = new Set(selected.map((subject) => subject.support ?? null));
    if (frames.size > 1) {
      state.message = "Select people on the same surface to move together";
      renderHud();
      return;
    }
    const frame = selected[0]?.support ?? null;
    const x = (at.x - camera.x) / camera.zoom;
    const y = (at.y - camera.y) / camera.zoom;
    const support = frame === null ? null : state.subjects.find((subject) => subject.pickable !== false && subject.id === frame);
    const displayed = displayedTerrainFrame();
    const world = frame === null
      ? displayed ? displayedTerrainPoint(x, y, displayed)?.point : { ...groundPoint(x, y), frame: null }
      : support ? surfacePoint(x, y, support) : null;
    if (!world) {
      state.message = frame === null ? "Choose a visible terrain top" : "Choose a point on the selected deck";
      renderHud();
      return;
    }
    if (orderCommand) {
      executeWhistleCommand(`${mode}:${orderCommand}`, { entities: eligibleIds, destination: world }, "Move selected entities");
      return;
    }
    for (const id of eligibleIds)
      emit({
        kind: "action",
        action: { kind: "move", entity: id, destination: world, facing: 0 },
      });
  }
  function keydown(event) {
    if (isTypingTarget(event.target)) return;
    if (!state.ready) return;
    const key = event.key.toLowerCase();
    if (key === "r" && terrainTarget.getSnapshot().value === "armed" && terrainTarget.getSnapshot().context.control?.command === "build") {
      event.preventDefault();
      const control = terrainTarget.getSnapshot().context.control;
      const group = buildControls(localControls()).find((candidate) => candidate.controls.some((item) => item.id === control.id));
      if (group) {
        const orientation = nextOrientation(group, control.input?.orientation);
        const rotated = selectedBuildControl(group, orientation);
        if (rotated) terrainTarget.send({ type: "ROTATE", control: rotated });
        renderHud(); draw();
      }
      return;
    }
    if (key === "escape" && terrainTarget.getSnapshot().value === "armed") {
      event.preventDefault(); edgeGesture.send({ type: "CANCEL" }); terrainArea.send({ type: "CANCEL" }); terrainTarget.send({ type: "ESCAPE" });
      state.message = "Selection"; closeActionBar(); renderHud(); return;
    }
    if (key === "escape" && isAiming()) { event.preventDefault(); toggleAim(); return; }
    if (directControl && directControl.key(key, true)) { event.preventDefault(); return; }
    if (mode === "survival") {
      if (key === "e" || key === "f") {
        event.preventDefault();
        executeWhistleCommand(`survival:${key === "e" ? "takeFood" : "eatFood"}`, undefined, key === "e" ? "Take food" : "Eat food");
      }
    }
  }
  function keyup(event) { if (directControl?.key(event.key, false)) event.preventDefault(); }
  function releaseDirect() { directControl?.release(); }
  function playCue(cue) {
    if (!art || !effectOwner || !cue?.kind) return;
    const subject = latestFacts.find((item) => item.id === cue.subject);
    const direction = cue.kind === "launch" && Number.isFinite(subject?.pose?.facing)
      ? ((Math.round(subject.pose.facing) % 4) + 4) % 4
      : ((Math.round(Math.atan2(cue.direction?.x ?? 0, cue.direction?.z ?? 0) / (Math.PI / 2)) % 4) + 4) % 4;
    const reaction = bindings[subject?.visual]?.reactions?.[cue.kind];
    const authored = reaction?.path.reduce((value, key) => value?.[key], art)?.[(direction + cameraGeometry.turn) % 4];
    if (subject && Array.isArray(authored)) worldScene.react(subject.id, authored, reaction.duration);
    const bank = cue.kind === "launch" ? art.effects?.flash : cue.kind === "impact" ? art.effects?.dust : null;
    const frames = Array.isArray(bank) ? bank : bank ? [bank] : [];
    const texture = frames.length ? frames[0] : undefined;
    if (frames.length) effectOwner.play({ texture, frames, lifetime: cue.kind === "launch" ? 220 : 420, sprites: 1 }, cue);
    const smoke = cue.kind === "launch" ? art.effects?.smoke : undefined;
    if (smoke) {
      const smokeFrames = Array.isArray(smoke) ? smoke : [smoke];
      effectOwner.play({ texture: smokeFrames[0], frames: smokeFrames, lifetime: 900, sprites: 1 }, cue);
    }
    audio.play(cue.kind);
  }
  function playMotionCue(cue) {
    if (!effectOwner || !art) return;
    const bank = cue.kind === "wake" ? art.effects?.ripple : art.effects?.dust;
    const frames = Array.isArray(bank) ? bank : bank ? [bank] : [];
    if (!frames.length) return;
    effectOwner.play({ texture: frames[0], frames, layer: "ground", scale: cue.kind === "wake" ? 1.5 : 1, lifetime: cue.kind === "wake" ? 700 : 260, sprites: 1 }, cue);
  }
  async function start() {
    if (directControlId || aiming) {
      nativeBinding = await import("../../generated/hive_kernel.js");
      await nativeBinding.default();
      if (aiming && typeof nativeBinding.preview_projectile !== "function") throw new Error("native projectile preview unavailable");
      if (directControlId) directControl = createDirectControl({ entity: directControlId, send: command => runtime.send(command), predict: input => JSON.parse(nativeBinding.predict_direct(JSON.stringify(input))) });
    }
    await app.init({
      resizeTo: canvasHost,
      backgroundAlpha: 0,
      antialias: false,
      resolution: 1,
      preference: "webgl",
      preferWebGLVersion: 2,
    });
    app.canvas.tabIndex = 0;
    canvasHost.appendChild(app.canvas);
    app.stage.addChild(overlay);
    const terrainPack = await loadLivingTerrainPack();
    let pack;
    try {
      pack = await loadStaticArtPack({ baseUrl: staticArtBase(import.meta.env?.BASE_URL ?? "/engine/") });
    } catch (error) {
      terrainPack.dispose();
      throw error;
    }
    art = pack.art;
    worldScene.installTerrainArt(terrainPack);
    state.disposeArt = pack.dispose;
    if (aiming) previewCache = createPreviewCache({ preview: json => nativeBinding.preview_projectile(json) });
    effectOwner = createEffectOwner({
      now: effectClock,
      maxEffects: 32,
      maxSprites: 128,
      spawn(definition, cue) {
        const texture = definition.texture;
        if (!texture) return null;
        const sprite = new Sprite(texture);
        sprite.__frames = definition.frames;
        const scale = definition.scale ?? 1;
        if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw new Error("invalid effect scale");
        sprite.__scale = scale;
        const at = cue.at ?? { x: 0, y: 0, z: 0 };
        const projected = project(at.x, at.y, at.z);
        sprite.anchor.set(art.propAnchor?.x ?? 0.5, art.propAnchor?.y ?? 1);
        sprite.position.set(projected.x * camera.zoom + camera.x, projected.y * camera.zoom + camera.y);
        sprite.scale.set(camera.zoom * scale);
        (definition.layer === "ground" ? groundEffects : transientLayer).addChild(sprite);
        return sprite;
      },
      update(sprite, opacity, _context, cue, elapsed) {
        if (!sprite) return;
        sprite.alpha = opacity;
        const at = cue?.at;
        if (at) {
          const projected = project(at.x, at.y, at.z);
          sprite.position.set(projected.x * camera.zoom + camera.x, projected.y * camera.zoom + camera.y);
          sprite.scale.set(camera.zoom * (sprite.__scale ?? 1));
        }
        if (sprite && sprite.texture && sprite.__frames?.length) sprite.texture = sprite.__frames[Math.min(sprite.__frames.length - 1, Math.floor(elapsed / 45))];
      },
      destroy(sprite) { sprite?.destroy?.(); },
    });
    app.ticker.add(draw);
    draw();
    renderHud();
    app.canvas.addEventListener("pointerdown", pointerDown);
    app.canvas.addEventListener("pointermove", pointerMove);
    app.canvas.addEventListener("pointerup", pointerUp);
    app.canvas.addEventListener("contextmenu", contextMenu);
    app.canvas.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", releaseDirect);
    document.addEventListener("visibilitychange", releaseDirect);
    app.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        camera.zoomBy(event.deltaY < 0 ? 0.1 : -0.1, point(event));
      },
      { passive: false },
    );
    resizeObserver = new ResizeObserver(() => {
      camera.reset();
      draw();
    });
    resizeObserver.observe(canvasHost);
    const keymap = createDefaultHtmlKeymap(root);
    const bindings = createBindingLookup({
      "sim.pause": "space",
      "ui.close": "escape",
      "camera.left": "left",
      "camera.right": "right",
      "camera.up": "up",
      "camera.down": "down",
      "camera.turn.left": "q",
      "camera.turn.right": "e",
      ...Object.fromEntries(WORLD_VIEW_CONTROLS.map((control) => [control.id, control.key])),
    });
    keymap.registerLayer({
      target: root,
      targetMode: "focus-within",
      enabled: () => !isTypingTarget(document.activeElement),
      bindings: bindings.bindings,
      commands: [
        {
          name: "sim.pause",
          desc: "Pause / resume",
          run: () => emit({ kind: "pause" }),
        },
        {
          name: "ui.close",
          desc: "Cancel selection",
          run: () => {
            gesture.send({ type: "CANCEL" });
            edgeGesture.send({ type: "CANCEL" });
            if (terrainTarget.getSnapshot().value === "armed") {
              terrainArea.send({ type: "CANCEL" }); terrainTarget.send({ type: "ESCAPE" });
              state.message = "Selection";
              renderHud();
              draw();
              return;
            }
            state.selectedIds = [];
            renderHud();
            draw();
          },
        },
        ...[
          ["camera.left", -24, 0],
          ["camera.right", 24, 0],
          ["camera.up", 0, -24],
          ["camera.down", 0, 24],
        ].map(([name, x, y]) => ({
          name,
          desc: "Pan camera",
          enabled: () => mode !== "survival",
          run: () => {
            camera.x += x;
            camera.y += y;
            draw();
          },
        })),
        { name: "camera.turn.left", desc: "Rotate camera left", enabled: () => mode !== "survival", run: () => rotateCamera(-1) },
        { name: "camera.turn.right", desc: "Rotate camera right", enabled: () => mode !== "survival", run: () => rotateCamera(1) },
        ...WORLD_VIEW_CONTROLS.map((control) => ({
          name: control.id,
          desc: `${control.label} voxel layer`,
          enabled: () => state.view.level + control.delta >= state.view.range.min && state.view.level + control.delta <= state.view.range.max,
          run: () => changeViewLevel(state.view.level + control.delta),
        })),
      ],
    });
    keymap.on("state", renderHud);
    unsubscribeRuntime = runtime?.subscribe?.((event) => {
      if (state.disposed) return;
      if (event.type === "connection") {
        const previousStatus = state.connection.status;
        state.connection = { status: event.status, pending: event.pending };
        if (event.status === "online" && previousStatus !== "online")
          state.message = "Connection restored";
        renderHud();
      }
      if (event.type === "state" && typeof event.paused === "boolean") {
        if (state.paused !== event.paused) directControl?.reset();
        state.paused = event.paused;
        if (state.paused) exitAim();
        if (state.paused) intendedDestinations.clear();
        renderHud();
      }
      if (event.type === "frame") {
        // A reset/restore publishes a higher epoch. Stale frames from the
        // old stream must never clear the new interpolation timeline.
        if (frameEpoch !== undefined && event.epoch < frameEpoch) return;
        if (frameEpoch !== undefined && event.epoch > frameEpoch) {
          directControl?.reset();
          terrainArea.send({ type: "CANCEL" });
          edgeGesture.send({ type: "CANCEL" });
          terrainTarget.send({ type: "CANCEL" });
          gesture.send({ type: "CANCEL" });
          state.selectedIds = [];
          state.terrainMarks = [];
          state.environmentVisuals = [];
          exitAim();
          interpolation.reset(event.epoch);
          pendingCues = [];
          worldScene.resetTimeline();
          effectOwner?.clear();
          intendedDestinations.clear();
        }
        if (interpolation.push(event, performance.now())) {
          const previousTerrain = terrainFrame;
          const newEpoch = frameEpoch === undefined || event.epoch !== frameEpoch;
          latestFacts = event.facts;
          terrainFrame = event.terrain;
          const terrainChanged = terrainFrame && (newEpoch || !previousTerrain || previousTerrain.revision !== terrainFrame.revision);
          if (terrainChanged) {
            const publishedById = new Map(event.facts.map((fact) => [fact.id, fact]));
            const actor = state.selectedIds.map((id) => publishedById.get(id)).find((fact) => fact?.pose?.position)
              ?? activeSelectionShortcuts.map(({ id }) => publishedById.get(id)).find((fact) => fact?.pose?.position);
            const observedRange = terrainLevelRange(terrainFrame);
            const range = newEpoch ? observedRange : {
              min: Math.min(state.view.range.min, observedRange.min),
              max: Math.max(state.view.range.max, observedRange.max),
            };
            const preferred = newEpoch && actor && Number.isFinite(actor.pose.position.y)
              ? Math.round(actor.pose.position.y / terrainFrame.verticalMetres - 0.5)
              : undefined;
            state.view = setTerrainLevelRange(state.view, range, newEpoch ? (preferred ?? range.max) : undefined);
          }
          if (terrainFrame && (newEpoch || !previousTerrain)) {
            const visibleFacts = event.facts.filter((fact) => projectWorldFact(fact, state.view).visible);
            camera.focus(terrainCameraFocus(visibleFacts, displayedTerrainFrame()));
          }
          if (frameEpoch === undefined || frameEpoch !== event.epoch) {
            worldScene.resetTimeline();
            awaitingEpochTransition = false;
          }
          frameEpoch = event.epoch;
          frameSequence = event.sequence;
          updateTerrainDisplay();
          if (!state.paused) directControl?.observe(event.facts);
          for (const [id, pending] of intendedDestinations) {
            const destination = pending.destination;
            const subject = event.facts.find((fact) => fact.id === id);
            const position = subject?.local?.position;
            if (!position || (subject.support ?? null) !== destination.frame ||
              Math.hypot(position.x - destination.x, position.z - destination.z) < 0.05)
              intendedDestinations.delete(id);
          }
          pendingCues = [...pendingCues, ...cueCursor.accept(event)].slice(-64);
        }
      }
      if (event.type === "presentation") {
        state.presentationFacts = event.facts;
        state.terrainMarks = event.terrainMarks;
        state.environmentVisuals = event.environmentVisuals;
        renderHud();
      }
      if (event.type === "party") {
        state.party = event.party;
        activeSelectionShortcuts = event.people.map((id, index) => ({
          id,
          label: selectionShortcuts[index]?.label ?? `Select person ${index + 1}`,
        }));
        renderHud();
      }
      if (event.type === "whistle") {
        localWhistle.update(event.agent);
        state.whistleAgent = event.agent;
        state.whistleTargets = event.targets;
        renderHud();
      }
      if (event.type === "results") {
        const rejected = event.results.find((result) => result && typeof result === "object" && result.accepted === false);
        if (rejected) {
          intendedDestinations.clear();
          const reason = typeof rejected.reason === "string" && rejected.reason.length > 0 ? `: ${rejected.reason}` : "";
          state.message = `Order rejected${reason}`;
          renderHud();
        }
      }
      if (event.type === "saved") {
        void Promise.resolve().then(() => {
          if (state.disposed) return;
          return persistence.onSaved?.(event.snapshot);
        }).then(() => {
          if (state.disposed) return;
          state.pendingSave = false;
          state.message = persistence.online ? "Saved on server" : "Saved in this browser";
          renderHud();
        }, (error) => {
          if (state.disposed) return;
          state.pendingSave = false;
          state.message = `Could not save: ${error instanceof Error ? error.message : String(error)}`;
          renderHud();
        });
      }
      if (event.type === "ready") {
        state.ready = true;
        if (state.connection.status === "online") state.message = persistence.statusLabel;
        renderHud();
      }
      if (event.type === "restored" && state.pendingRestore) {
        state.pendingRestore = false;
        state.message = "Continued from the acknowledged save";
        renderHud();
      }
      if (event.type === "error") {
        state.pendingSave = false;
        state.pendingRestore = false;
        intendedDestinations.clear();
        directControl?.reset();
        if (state.connection.status === "online") state.message = event.message;
        renderHud();
      }
    });
    runtime?.send?.({ type: "start", game: mode });
  }
  start().catch((error) => {
    if (state.disposed) return;
    state.message = `Client unavailable: ${error.message}`;
    renderHud();
  });
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      app.ticker?.remove(draw);
      unsubscribeRuntime?.();
      runtime?.dispose();
      hudRoot.unmount();
      actionBarRoot.unmount();
      actionBarHost.remove();
      gesture.stop();
      edgeGesture.stop();
      terrainTarget.stop();
      terrainArea.stop();
      aimGesture.stop();
      resizeObserver?.disconnect();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", releaseDirect);
      document.removeEventListener("visibilitychange", releaseDirect);
      directControl?.reset();
      exitAim();
      audio.dispose();
      cueCursor.dispose();
      effectOwner?.clear();
      terrainPicker.dispose();
      app.canvas?.removeEventListener("pointerdown", pointerDown);
      app.canvas?.removeEventListener("pointermove", pointerMove);
      app.canvas?.removeEventListener("pointerup", pointerUp);
      app.canvas?.removeEventListener("pointercancel", pointerCancel);
      app.canvas?.removeEventListener("contextmenu", contextMenu);
      worldScene.dispose();
      cameraGeometry.dispose();
      state.disposeArt?.();
      for (const child of overlay.removeChildren())
        child.destroy?.({
          children: true,
          texture: false,
          textureSource: false,
        });
      app.destroy(true, {
        children: true,
        texture: false,
        textureSource: false,
      });
    },
    send: emit,
    diagnostics(query = {}) {
      const picked = query.pick ? worldScene.pick(query.pick) : undefined;
      return Object.freeze({ ...(picked ? { picked: { id: picked.record?.id, part: picked.record?.part, target: picked.target, occluded: picked.occluded } } : {}),
        ...(query.project ? { projected: project(query.project.x, query.project.y, query.project.z) } : {}),
        ...(query.terrainAt ? { terrainAt: displayedTerrainPoint(query.terrainAt.x, query.terrainAt.y, displayedTerrainFrame()) } : {}),
        spatialDraw: worldScene.metrics(), visibleDrawRecords: orderedSprites.length,
        frameSequence, frameEpoch, paused: state.paused, camera: { x: camera.x, y: camera.y, zoom: camera.zoom, turn: cameraGeometry.turn },
        view: { level: state.view.level, cutaway: state.view.cutaway }, selectedIds: [...state.selectedIds],
        subjects: state.subjects.map(({id,x,y,z,support,visual,placement,pickable}) => ({id,x,y,z,support,visual,placement,pickable,screen:project(x,y,z)})),
        ...(query.scene ? { records: worldScene.snapshot(), surfaces: displayedTerrainFrame()?.surfaces } : {}) });
    },
  };
}
