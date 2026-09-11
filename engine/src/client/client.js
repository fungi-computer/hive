import { createDirectControl } from "./direct-control.js";
import { project, groundPoint, surfacePoint } from "./geometry.js";
import { aimGroundPoint, createPreviewCache, fireInput } from "./aiming.js";
import { createCueCursor, createEffectOwner } from "./effects.js";
import { createMotionCueOwner } from "./motion.js";
import { createAudioOwner } from "./audio.js";
import { presentationCommand } from "../presentation.ts";
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
} from "./controls.js";
import { createActor } from "xstate";
import { createDefaultHtmlKeymap } from "@opentui/keymap/html";
import {
  createBindingLookup,
  formatCommandBindings,
} from "@opentui/keymap/extras";
import { DEFAULT_VISUAL_BINDINGS } from "./visual-bindings.js";
import { resolveStaticVisual } from "./visual-resolver.js";

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
    aim: { active: false, launcherId: null, point: null, target: null, elevation: 0.12, velocity: null, preview: null },
    message: runtime
      ? "Connecting to the world…"
      : "Runtime pending — waiting for the browser Worker.",
  };
  const gesture = createActor(pointerGestureMachine).start();
  const aimGesture = createActor(aimGestureMachine).start();
  const isAiming = () => aimGesture.getSnapshot().value === "aiming";
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(state));
  const emit = (action) => {
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
      persistence.save?.();
    } else if (runtime && action.kind === "reset") {
      try {
        persistence.newWorld((remote) => {
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
        persistence.continue?.();
      } catch (error) {
        state.pendingRestore = false;
        state.message = error.message;
      }
    }
    notify();
  };
  const canvasHost = document.createElement("div");
  canvasHost.className = "hive-canvas";
  const hud = document.createElement("aside");
  hud.className = "hive-hud";
  const hudRoot = createRoot(hud);
  root.replaceChildren(canvasHost, hud);
  const app = new Application();
  const overlay = new Container();
  const actorLayer = new Container();
  const transientLayer = new Container();
  const dragGraphic = new Graphics();
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

  function prepareNewWorld(remote) {
    if (remote) state.ready = false;
    state.pendingSave = false;
    state.pendingRestore = false;
    state.subjects = [];
    latestFacts = [];
    state.presentationFacts = [];
    state.presentationControls = [];
    state.dragging = null;
    intendedDestinations.clear();
    directControl?.reset();
    gesture.send({ type: "CANCEL" });
    exitAim();
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
    return latestFacts.find((fact) => fact.id === aiming.launcherId && state.selectedIds.includes(fact.id));
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
    state.subjects = (directControl && !state.paused ? directControl.display(visibleFacts) : visibleFacts)
      .filter((fact) => fact.pose?.position && fact.visual)
      .map((fact) => ({
        id: fact.id,
        name: fact.label || fact.id,
        x: fact.pose.position.x,
        y: fact.pose.position.y,
        z: fact.pose.position.z,
        facing: fact.pose.facing,
        visual: fact.visual,
        local: fact.local,
        support: fact.support,
        surface: fact.surface,
        projectile: fact.projectile,
        pose: fact.pose,
        screen: { x: 0, y: 0 },
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
      overlay.addChild(groundSprite, actorLayer, transientLayer);
    }
    dragGraphic.clear();
    dragGraphic.visible = false;
    groundSprite.position.set(
      320 * camera.zoom + camera.x,
      200 * camera.zoom + camera.y,
    );
    groundSprite.scale.set(camera.zoom);
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
      const frames = reactionFrames ?? (isStatic
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
        : frames[(animation?.frame ?? 0) % Math.max(1, frames.length)];
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
    if (isAiming()) {
      state.aim.point = at;
      try { state.aim.target = aimGroundPoint(at, camera); updateAimPreview(); } catch { state.aim.target = null; }
      fireAim(); return;
    }
    gesture.send({ type: "BEGIN", point: at, additive: event.shiftKey });
    app.canvas.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
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
      const deck = state.subjects.find(
        (subject) => subject.surface && surfacePoint(local.x, local.y, subject),
      );
      if (deck) hit = drag.additive ? [...new Set([...state.selectedIds, deck.id])] : [deck.id];
    }
    selectEntities(hit);
  }
  function contextMenu(event) {
    event.preventDefault();
    if (isAiming()) return;
    if (!state.ready) {
      state.message = "World is still connecting…";
      renderHud();
      return;
    }
    if (directControl) return;
    const at = point(event);
    const selected = state.subjects.filter((subject) => state.selectedIds.includes(subject.id));
    const frames = new Set(selected.map((subject) => subject.support ?? null));
    if (frames.size > 1) {
      state.message = "Select people on the same surface to move together";
      renderHud();
      return;
    }
    const frame = selected[0]?.support ?? null;
    const x = (at.x - camera.x) / camera.zoom;
    const y = (at.y - camera.y) / camera.zoom;
    const support = frame === null ? null : state.subjects.find((subject) => subject.id === frame);
    const world = frame === null
      ? { ...groundPoint(x, y), frame: null }
      : support ? surfacePoint(x, y, support) : null;
    if (!world) {
      state.message = "Choose a point on the selected deck";
      renderHud();
      return;
    }
    if (orderCommand) {
      if (state.selectedIds.length)
        runtime.send({
          type: "command",
          name: orderCommand,
          input: { entities: state.selectedIds, destination: world },
        });
      return;
    }
    for (const id of state.selectedIds)
      emit({
        kind: "action",
        action: { kind: "move", entity: id, destination: world, facing: 0 },
      });
  }
  function keydown(event) {
    if (isTypingTarget(event.target)) return;
    if (!state.ready) return;
    const key = event.key.toLowerCase();
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
    effectOwner.play({ texture: frames[0], frames, lifetime: cue.kind === "wake" ? 700 : 260, sprites: 1 }, cue);
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
        const at = cue.at ?? { x: 0, y: 0, z: 0 };
        const projected = project(at.x, at.y, at.z);
        sprite.anchor.set(art.propAnchor?.x ?? 0.5, art.propAnchor?.y ?? 1);
        sprite.position.set(projected.x * camera.zoom + camera.x, projected.y * camera.zoom + camera.y);
        sprite.scale.set(camera.zoom);
        transientLayer.addChild(sprite);
        return sprite;
      },
      update(sprite, opacity, _context, cue, elapsed) {
        if (!sprite) return;
        sprite.alpha = opacity;
        const at = cue?.at;
        if (at) {
          const projected = project(at.x, at.y, at.z);
          sprite.position.set(projected.x * camera.zoom + camera.x, projected.y * camera.zoom + camera.y);
          sprite.scale.set(camera.zoom);
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
      ],
    });
    keymap.on("state", renderHud);
    unsubscribeRuntime = runtime?.subscribe?.((event) => {
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
          interpolation.reset(event.epoch);
          pendingCues = [];
          subjectReactions.clear();
          effectOwner?.clear();
          animationClock.reset();
          intendedDestinations.clear();
        }
        if (interpolation.push(event, performance.now())) {
          latestFacts = event.facts;
          if (frameEpoch === undefined || frameEpoch !== event.epoch) {
            animationClock.reset();
            awaitingEpochTransition = false;
          }
          frameEpoch = event.epoch;
          frameSequence = event.sequence;
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
        renderHud();
      }
      if (event.type === "results" && event.results.some((result) =>
        result && typeof result === "object" && result.accepted === false))
        intendedDestinations.clear();
      if (event.type === "saved") {
        state.pendingSave = false;
        try {
          persistence.onSaved?.(event.snapshot);
          state.message = persistence.online ? "Saved on server" : "Saved in this browser";
        } catch (error) {
          state.message = `Could not save: ${error.message}`;
        }
        renderHud();
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
