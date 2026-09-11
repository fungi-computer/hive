import { createTerrainLayer } from "./terrain-layer.js";
import { createDirectControl } from "./direct-control.js";
import { project, groundPoint, surfacePoint, terrainPoint, terrainHit, terrainPlaneCell } from "./geometry.js";
import { aimGroundPoint, createPreviewCache, fireInput } from "./aiming.js";
import { createCueCursor, createEffectOwner } from "./effects.js";
import { createMotionCueOwner } from "./motion.js";
import { createAudioOwner } from "./audio.js";
import { presentationCommand, terrainPresentationCommand, terrainAreaPresentationCommand } from "../presentation.ts";
import { animationFrames, createAnimationClock } from "./animation.js";
import { createInterpolationBuffer } from "./interpolation.js";
import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@fungi.computer/caps/components/button";
import { Slider } from "@fungi.computer/caps/components/slider";
import { Card, CardContent } from "@fungi.computer/caps/components/card";
import { loadStaticArtPack } from "../../../src/art/static-pack.js";
import {
  isTypingTarget,
  selectionFromSubjects,
  pointerGestureMachine,
  aimGestureMachine,
  terrainTargetMachine,
  terrainAreaGestureMachine,
  WORLD_VIEW_CONTROLS,
  surfaceSubjectAt,
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
import { resolveStaticVisual } from "./visual-resolver.js";
import { terrainCameraFocus } from "./camera-focus.js";

import { rectangleCells, visibleTerrainAreaPreview } from "./terrain-area-selection.js";

const displayedNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function createHiveClient({
  root,
  mode,
  title,
  subtitle,
  source,
  runtime,
  persistence,
  orderCommand,
  directControlId,
  controlHelp,
  selectionShortcuts = [],
  visualBindings = DEFAULT_VISUAL_BINDINGS,
  environment = "clearing",
  aiming = null,
  worldView = {},
}) {
  if (!persistence) throw new Error("Hive client requires a persistence capability");
  let directControl;
  let nativeBinding;
  const bindings = { ...DEFAULT_VISUAL_BINDINGS, ...visualBindings };
  const state = {
    ready: false,
    paused: false,
    selectedIds: [],
    hoverId: null,
    dragging: null,
    disposed: false,
    subjects: [],
    pendingSave: false,
    pendingRestore: false,
    presentationFacts: [],
    presentationControls: [],
    terrainMarks: [],
    view: createWorldView(worldView),
    aim: { active: false, launcherId: null, point: null, target: null, elevation: 0.12, velocity: null, preview: null },
    message: runtime
      ? "Connecting to the world…"
      : "Runtime pending — waiting for the browser Worker.",
  };
  const gesture = createActor(pointerGestureMachine).start();
  const aimGesture = createActor(aimGestureMachine).start();
  const terrainTarget = createActor(terrainTargetMachine).start();
  const terrainArea = createActor(terrainAreaGestureMachine).start();
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
      runtime.send({ type: "action", action: action.action });
    else if (runtime && action.kind === "pause")
      runtime.send({ type: state.paused ? "resume" : "pause" });
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
  function changeViewLevel(level) {
    terrainArea.send({ type: "CANCEL" });
    const next = setWorldViewLevel(state.view, level);
    if (next.level === state.view.level) return;
    state.view = next;
    gesture.send({ type: "CANCEL" });
    exitAim();
    state.dragging = null;
    state.hoverId = null;
    updateTerrainDisplay();
    draw();
    renderHud();
  }
  function setCutaway(value) {
    terrainArea.send({ type: "CANCEL" });
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
  root.replaceChildren(canvasHost, hud);
  const app = new Application();
  const overlay = new Container();
  const groundEffects = new Container();
  groundEffects.eventMode = "none";
  const actorLayer = new Container();
  const transientLayer = new Container();
  const dragGraphic = new Graphics();
  const terrainMarksGraphic = new Graphics();
  const aimGraphic = new Graphics();
  const aimArcGraphic = new Graphics();
  transientLayer.addChild(dragGraphic, aimGraphic, aimArcGraphic);
  actorLayer.sortableChildren = true;
  const actorCache = new Map();
  const animationClock = createAnimationClock();
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
  const terrainLayer = createTerrainLayer();
  let terrainFrame;
  let markSurfaceSource;
  let markSurfaces;
  const terrainProjection = createTerrainProjectionCache();
  let art = null;
  let resizeObserver = null;
  let unsubscribeRuntime = null;
  const cueCursor = createCueCursor();
  let effectOwner;
  let previewCache;
  const subjectReactions = new Map();
  const audio = createAudioOwner();
  let latestFacts = [];
  let pendingCues = [];
  const effectClock = () => Math.max(0, interpolation.presentationTime()) * 1000;
  function displayedTerrainFrame() { return terrainProjection.update(terrainFrame, state.view, frameEpoch); }
  function updateTerrainDisplay() {
    terrainLayer.update(displayedTerrainFrame(), frameEpoch, state.view.cutaway ? `cut:${state.view.level}` : "full");
  }

  function prepareNewWorld(remote) {
    if (remote) state.ready = false;
    state.pendingSave = false;
    state.pendingRestore = false;
    state.subjects = [];
    latestFacts = [];
    state.presentationFacts = [];
    state.presentationControls = [];
    state.terrainMarks = [];
    terrainFrame = undefined;
    terrainProjection.update(undefined, state.view, undefined);
    terrainLayer.update(undefined, undefined);
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
    subjectReactions.clear();
    pendingCues = [];
    interpolation.reset();
    animationClock.reset();
    motionCues.reset();
    for (const entry of actorCache.values())
      entry.container.destroy({ children: true, texture: false, textureSource: false });
    actorCache.clear();
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
    runtime?.send({ type: "command", name: aiming.command, input: { velocity } });
    aimGesture.send({ type: "FIRE" });
    exitAim();
  }
  function renderHud() {
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
          null,
          React.createElement(
            "div",
            { className: "hive-kicker" },
            `HIVE / ${mode}`,
          ),
          React.createElement("h1", null, title),
          React.createElement("p", null, subtitle),
          React.createElement("p", { className: "hive-status" }, state.message),
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
            ),
            aiming && selectedLauncher()
              ? React.createElement(Button, {
                  size: "sm",
                  variant: isAiming() ? "secondary" : "outline",
                  onClick: () => toggleAim(),
                }, isAiming() ? "Exit aim" : "Aim cannon")
              : null,
            directControl ? React.createElement(Button, { size: "sm", variant: "outline", onClick: () => { directControl.setPrediction(!directControl.predictionEnabled); app.canvas?.focus(); renderHud(); } }, directControl.predictionEnabled ? "Prediction on" : "Prediction off") : null,
            ...selectionShortcuts.map(({ id, label }) => React.createElement(
              Button,
              { key: id, size: "sm", variant: "outline",
                disabled: !state.subjects.some((subject) => subject.id === id),
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
              state.ready ? persistence.statusLabel : "Connecting…",
            ),
          ),
          React.createElement(
            "div",
            { className: "hive-selection" },
            React.createElement("strong", null, "Selected"),
            React.createElement(
              "span",
              null,
              state.selectedIds.length ? state.selectedIds.join(", ") : "none",
            ),
          ),
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
          ),
          state.presentationFacts.length || state.presentationControls.length
            ? React.createElement(
                "div",
                { className: "hive-presentation" },
                state.presentationFacts.map((fact) =>
                  React.createElement(
                    "div",
                    { key: fact.id },
                    `${fact.label}: ${typeof fact.value === "number" ? displayedNumber.format(fact.value) : fact.value}`,
                  ),
                ),
                state.presentationControls.map((control) =>
                  React.createElement(
                    Button,
                    {
                      key: control.id,
                      size: "sm",
                      disabled: !state.ready,
                      onClick: () => {
                        if (control.target === "terrain-cell" || control.target === "terrain-area" || control.target === "world-surface") {
                          exitAim();
                          gesture.send({ type: "CANCEL" });
                          terrainArea.send({ type: "CANCEL" });
                          terrainTarget.send({ type: "ARM", control });
                          state.message = control.target === "terrain-area"
                            ? `${control.label}: drag a rectangle; Escape exits`
                            : `${control.label}: choose a visible ${control.target === "world-surface" ? "ground or building surface" : "terrain top"}; Escape exits`;
                          renderHud();
                          return;
                        }
                        if (aiming) audio.unlock();
                        return state.ready && runtime?.send(
                          presentationCommand(control, state.selectedIds),
                        );
                      },
                    },
                    control.label,
                  ),
                ),
              )
            : null,
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
  }

  const camera = {
    x: 0,
    y: 0,
    zoom: canvasHost.clientWidth >= 900 ? 2 : 1,
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
      this.zoom = canvasHost.clientWidth >= 900 ? 2 : 1;
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
  function screenPoint(subject) {
    const projected = project(subject.x, subject.y, subject.z);
    return {
      x: projected.x * camera.zoom + camera.x,
      y: projected.y * camera.zoom + camera.y,
    };
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
        pose: fact.pose,
        screen: { x: 0, y: 0 },
        pickable: projectWorldFact(fact, state.view).pickable,
      }));
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
      overlay.addChild(groundSprite, terrainLayer.container, terrainMarksGraphic, groundEffects, actorLayer, transientLayer);
    }
    dragGraphic.clear();
    dragGraphic.visible = false;
    groundSprite.position.set(
      320 * camera.zoom + camera.x,
      200 * camera.zoom + camera.y,
    );
    groundSprite.scale.set(camera.zoom);
    groundSprite.visible = !terrainFrame;
    terrainLayer.position(camera);
    terrainMarksGraphic.clear();
    const displayedTerrain = displayedTerrainFrame();
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
        const color = mark.status === "working" ? 0xd99a4a : mark.status === "blocked" ? 0xb85757 : 0xe8c779;
        terrainMarksGraphic.poly(corners).stroke({ color, width: 2, alpha: 0.85 });
      }
    }
    const animationById = new Map(
      animationClock
        .sample(state.subjects, {
          now: performance.now(),
          paused: state.paused,
          sequence: frameSequence,
        })
        .map((sample) => [sample.id, sample]),
    );
    const liveIds = new Set(state.subjects.map((subject) => subject.id));
    for (const [id, entry] of actorCache) {
      if (liveIds.has(id)) continue;
      entry.container.destroy({
        children: true,
        texture: false,
        textureSource: false,
      });
      actorCache.delete(id);
    }
    const byId = new Map(state.subjects.map((subject) => [subject.id, subject]));
    const supportDepth = (subject, seen = new Set()) => {
      if (!subject.support || seen.has(subject.id)) return 0;
      const parent = byId.get(subject.support);
      if (!parent) return 0;
      seen.add(subject.id);
      return 1 + supportDepth(parent, seen);
    };
    const orderedSubjects = [...state.subjects].sort((a, b) => {
      const depth = supportDepth(a) - supportDepth(b);
      return depth || a.x + a.z - b.x - b.z || a.id.localeCompare(b.id);
    });
    for (const [renderRank, subject] of orderedSubjects.entries()) {
      subject.renderRank = renderRank;
      subject.screen = screenPoint(subject);
      const binding = bindings[subject.visual];
      if (!binding)
        throw new Error(`no visual binding for ${subject.visual ?? "missing visual"}`);
      if (!new Set(["figure", "static"]).has(binding.kind))
        throw new Error(`invalid visual binding for ${subject.visual}`);
      const isStatic = binding?.kind === "static";
      let entry = actorCache.get(subject.id);
      if (!entry) {
        entry = {
          container: new Container(),
          marker: new Graphics()
            .ellipse(0, 0, 18, 9)
            .stroke({ color: 0xe8c779, width: 2 }),
          pawn: new Sprite(),
          label: new Text({
            style: {
              fontFamily: getComputedStyle(root).fontFamily,
              fontSize: 12,
              fill: 0xf7edcf,
            },
          }),
        };
        entry.container.eventMode = "none";
        entry.container.addChild(entry.marker, entry.pawn, entry.label);
        actorLayer.addChild(entry.container);
        actorCache.set(subject.id, entry);
      }
      const animation = animationById.get(subject.id);
      entry.marker.visible = state.selectedIds.includes(subject.id);
      const figure = art?.figures?.[binding.key];
      const reaction = subjectReactions.get(subject.id);
      const reactionFrames = reaction && reaction.until > effectClock()
        ? reaction.frames : null;
      if (reaction && !reactionFrames) subjectReactions.delete(subject.id);
      const heldKind = subject.inventory?.items.find(item => item.quantity > 0 && binding.carryPoses?.[item.kind])?.kind;
      const carryPose = heldKind && binding.carryPoses[heldKind];
      const carryFrames = carryPose && figure?.[carryPose]?.[animation?.direction ?? 0];
      const frames = reactionFrames ?? carryFrames ?? (isStatic
        ? []
        : animationFrames(
            figure,
            animation?.direction ?? 0,
            animation?.walking ?? false,
          ));
      const physicalFacing = ((Math.round(subject.facing ?? 0) % 4) + 4) % 4;
      const staticVisual = isStatic
        ? (subject.projectile?.state === "embedded" && art.projectiles?.cannonballEmbedded
          ? { texture: art.projectiles.cannonballEmbedded, anchor: art.propAnchor }
          : resolveStaticVisual(art, binding, physicalFacing))
        : undefined;
      const texture = reactionFrames?.length
        ? reactionFrames[Math.min(reactionFrames.length - 1, Math.floor((effectClock() - reaction.started) / 45))]
        : isStatic
        ? staticVisual?.texture
        : frames[(carryFrames && !animation?.walking ? 0 : animation?.frame ?? 0) % Math.max(1, frames.length)];
      if (art && !texture)
        throw new Error(`visual asset unavailable for ${subject.visual}`);
      if (texture) entry.pawn.texture = texture;
      entry.pawn.visible = Boolean(texture);
      entry.pawn.anchor.set(
        0.5,
        isStatic ? staticVisual?.anchor?.y : art?.pawnAnchor?.y,
      );
      entry.pawn.scale.set(camera.zoom);
      entry.label.text = subject.name;
      entry.label.anchor.set(0.5, 1);
      entry.label.position.set(0, -12);
      entry.label.visible = state.selectedIds.includes(subject.id);
      entry.container.position.set(subject.screen.x, subject.screen.y);
      entry.container.zIndex = renderRank;
    }
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
    const area = terrainArea.getSnapshot();
    const displayed = displayedTerrainFrame();
    if (area.value === "dragging" && displayed) {
      for (const surface of visibleTerrainAreaPreview(displayed, area.context.start, area.context.current)) {
        const [x,y,z] = surface.cell;
        const points = [[x-.5,z-.5],[x+.5,z-.5],[x+.5,z+.5],[x-.5,z+.5]].flatMap(([a,b]) => {
          const p = project(a,(y+.5)*displayed.verticalMetres,b);
          return [p.x*camera.zoom+camera.x,p.y*camera.zoom+camera.y];
        });
        dragGraphic.poly(points).fill({color:0xe8c779,alpha:.22}).stroke({color:0xe8c779,width:1});
      }
      dragGraphic.visible = true;
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
      const hit = displayed && terrainHit((at.x - camera.x) / camera.zoom, (at.y - camera.y) / camera.zoom, displayed);
      const structure = hit?.kind === "structure-top";
      const surface = (hit?.kind === "terrain-top" || (structure && targetControl.target === "world-surface")) && hit.surface;
      if (!surface) {
        state.message = targetControl.target === "world-surface" ? "Choose a visible ground or building surface" : "Choose a visible terrain top";
        renderHud();
        return;
      }
      if (targetControl.target === "terrain-area") {
        terrainArea.send({ type: "BEGIN", cell: surface.cell });
        app.canvas.setPointerCapture?.(event.pointerId);
        draw();
        return;
      }
      runtime?.send(terrainPresentationCommand(targetControl, state.selectedIds, { cell: surface.cell, ...(structure ? { source: "structure" } : { material: surface.material }) }));
      return;
    }
    if (isAiming()) {
      state.aim.point = at;
      try { state.aim.target = aimGroundPoint(at, camera); updateAimPreview(); } catch { state.aim.target = null; }
      fireAim(); return;
    }
    gesture.send({ type: "BEGIN", point: at, additive: event.shiftKey });
    app.canvas.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
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
      try {
        rectangleCells(context.start, cell, 256);
        terrainArea.send({ type: "MOVE", cell });
        state.message = `Designate ${visibleTerrainAreaPreview(displayed, context.start, cell).length} visible cells`;
      } catch (error) {
        terrainArea.send({ type: "CANCEL" });
        state.message = error.message;
      }
      renderHud(); draw(); return;
    }
    if (isAiming()) {
      state.aim.point = point(event);
      aimGesture.send({ type: "MOVE", point: state.aim.point });
      try { state.aim.target = aimGroundPoint(state.aim.point, camera); updateAimPreview(); } catch { state.aim.target = null; }
      draw();
      return;
    }
    if (gesture.getSnapshot().value !== "dragging") return;
    gesture.send({ type: "MOVE", point: point(event) });
    draw();
  }
  function pointerUp(event) {
    if (terrainArea.getSnapshot().value === "dragging") {
      pointerMove(event);
      if (terrainArea.getSnapshot().value !== "dragging") {
        app.canvas.releasePointerCapture?.(event.pointerId);
        return;
      }
      const { start, current } = terrainArea.getSnapshot().context;
      const control = terrainTarget.getSnapshot().context.control;
      terrainArea.send({ type: "END" });
      app.canvas.releasePointerCapture?.(event.pointerId);
      if (control?.target === "terrain-area") {
        runtime?.send(terrainAreaPresentationCommand(control, state.selectedIds, { start, end: current }));
        state.message = `${control.label} submitted`;
      }
      renderHud(); draw(); return;
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
    const directHit = selectionFromSubjects(state.subjects, box, false, []);
    let hit = selectionFromSubjects(
      state.subjects,
      box,
      drag.additive,
      state.selectedIds,
    );
    if (click && !directHit.length) {
      const local = {
        x: (end.x - camera.x) / camera.zoom,
        y: (end.y - camera.y) / camera.zoom,
      };
      const deck = surfaceSubjectAt(state.subjects, local, surfacePoint);
      if (deck) hit = drag.additive ? [...new Set([...state.selectedIds, deck.id])] : [deck.id];
    }
    selectEntities(hit);
  }
  function contextMenu(event) {
    event.preventDefault();
    if (terrainTarget.getSnapshot().value === "armed") {
      terrainArea.send({ type: "CANCEL" });
      terrainTarget.send({ type: "CANCEL" }); state.message = "Selection"; renderHud(); return;
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
      ? displayed ? terrainPoint(x, y, displayed)?.point : { ...groundPoint(x, y), frame: null }
      : support ? surfacePoint(x, y, support) : null;
    if (!world) {
      state.message = frame === null ? "Choose a visible terrain top" : "Choose a point on the selected deck";
      renderHud();
      return;
    }
    if (orderCommand) {
      runtime.send({
        type: "command",
        name: orderCommand,
        input: { entities: eligibleIds, destination: world },
      });
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
    if (key === "escape" && terrainTarget.getSnapshot().value === "armed") {
      event.preventDefault(); terrainArea.send({ type: "CANCEL" }); terrainTarget.send({ type: "ESCAPE" });
      state.message = "Selection"; renderHud(); return;
    }
    if (key === "escape" && isAiming()) { event.preventDefault(); toggleAim(); return; }
    if (directControl && directControl.key(key, true)) { event.preventDefault(); return; }
    if (mode === "survival") {
      if (key === "e" || key === "f") {
        event.preventDefault();
        runtime.send({
          type: "command",
          name: key === "e" ? "takeFood" : "eatFood",
        });
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
    const authored = reaction?.path.reduce((value, key) => value?.[key], art)?.[direction];
    if (subject && Array.isArray(authored)) subjectReactions.set(subject.id, {
      frames: authored, started: effectClock(), until: effectClock() + reaction.duration, direction,
    });
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
    });
    app.canvas.tabIndex = 0;
    canvasHost.appendChild(app.canvas);
    app.stage.addChild(overlay);
    const pack = await loadStaticArtPack();
    art = pack.art;
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
    app.canvas.addEventListener("pointercancel", () => {
      gesture.send({ type: "CANCEL" });
      terrainArea.send({ type: "CANCEL" });
      state.dragging = null;
    });
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
    terrainTarget.send({ type: "CANCEL" });
          gesture.send({ type: "CANCEL" });
          state.selectedIds = [];
          state.terrainMarks = [];
          exitAim();
          interpolation.reset(event.epoch);
          pendingCues = [];
          subjectReactions.clear();
          effectOwner?.clear();
          animationClock.reset();
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
              ?? selectionShortcuts.map(({ id }) => publishedById.get(id)).find((fact) => fact?.pose?.position);
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
            animationClock.reset();
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
        state.presentationControls = event.controls;
        state.terrainMarks = event.terrainMarks;
        renderHud();
      }
      if (event.type === "results" && event.results.some((result) =>
        result && typeof result === "object" && result.accepted === false))
        intendedDestinations.clear();
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
        state.message = persistence.statusLabel;
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
        state.message = event.message;
        renderHud();
      }
    });
    runtime?.send?.({ type: "start", game: mode });
  }
  start().catch((error) => {
    if (state.disposed) return;
    state.message = `Art unavailable: ${error.message}`;
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
      gesture.stop();
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
      app.canvas?.removeEventListener("pointerdown", pointerDown);
      app.canvas?.removeEventListener("pointermove", pointerMove);
      app.canvas?.removeEventListener("pointerup", pointerUp);
      app.canvas?.removeEventListener("contextmenu", contextMenu);
      terrainLayer.dispose();
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
  };
}
