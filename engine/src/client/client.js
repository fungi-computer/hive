import { project, groundPoint } from "./geometry.js";
import { presentationCommand } from "../presentation.ts";
import { animationFrames, createAnimationClock } from "./animation.js";
import { createInterpolationBuffer } from "./interpolation.js";
import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@fungi.computer/caps/components/button";
import { Card, CardContent } from "@fungi.computer/caps/components/card";
import { loadStaticArtPack } from "../../../src/art/static-pack.js";
import {
  isTypingTarget,
  selectionFromSubjects,
  pointerGestureMachine,
} from "./controls.js";
import { createActor } from "xstate";
import { createDefaultHtmlKeymap } from "@opentui/keymap/html";
import {
  createBindingLookup,
  formatCommandBindings,
} from "@opentui/keymap/extras";

export function createHiveClient({
  root,
  mode,
  title,
  subtitle,
  source,
  runtime,
  orderCommand,
}) {
  const state = {
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
    message: runtime
      ? "Connecting to the world…"
      : "Runtime pending — waiting for the browser Worker.",
  };
  const saveKey = `hive-fresh-browser/${mode}`;
  const gesture = createActor(pointerGestureMachine).start();
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(state));
  const emit = (action) => {
    if (runtime && action.kind === "action")
      runtime.send({ type: "action", action: action.action });
    else if (runtime && action.kind === "pause")
      runtime.send({ type: state.paused ? "resume" : "pause" });
    else if (runtime && action.kind === "save") {
      state.pendingSave = true;
      state.message = "Save requested…";
      runtime.send({ type: "save" });
    } else if (runtime && action.kind === "reset") {
      animationClock.reset();
      interpolation.reset();
      frameEpoch = undefined;
      frameSequence = 0;
      runtime.send({ type: "reset" });
    } else if (action.kind === "continue") {
      try {
        const saved = localStorage.getItem(saveKey);
        if (!saved) throw new Error("No saved world yet");
        const snapshot = JSON.parse(saved);
        state.pendingRestore = true;
        state.message = "Continue requested…";
        animationClock.reset();
        interpolation.reset();
        frameEpoch = undefined;
        frameSequence = 0;
        runtime.send({ type: "restore", snapshot });
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
  actorLayer.sortableChildren = true;
  const actorCache = new Map();
  const animationClock = createAnimationClock();
  const interpolation = createInterpolationBuffer();
  let frameSequence = 0;
  let frameEpoch;
  let groundSprite = null;
  let art = null;
  let resizeObserver = null;
  let unsubscribeRuntime = null;

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
            React.createElement(
              Button,
              { onClick: () => act("pause"), size: "sm" },
              state.paused ? "Resume" : "Pause",
            ),
            React.createElement(
              Button,
              { onClick: () => act("reset"), size: "sm", variant: "secondary" },
              "Reset world",
            ),
            React.createElement(
              Button,
              {
                onClick: () => act("save"),
                disabled: state.pendingSave || state.pendingRestore,
                size: "sm",
                variant: "outline",
              },
              "Save",
            ),
            React.createElement(
              Button,
              {
                onClick: () => act("continue"),
                disabled: state.pendingSave || state.pendingRestore,
                size: "sm",
                variant: "outline",
              },
              "Continue",
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
          React.createElement(
            "div",
            { className: "hive-actions" },
            mode === "survival"
              ? "Select survivor · WASD / arrows move · E take bread · F eat"
              : "Click selects · Shift adds · drag selects a group · right click orders",
          ),
          state.presentationFacts.length || state.presentationControls.length
            ? React.createElement(
                "div",
                { className: "hive-presentation" },
                state.presentationFacts.map((fact) =>
                  React.createElement(
                    "div",
                    { key: fact.id },
                    `${fact.label}: ${fact.value}`,
                  ),
                ),
                state.presentationControls.map((control) =>
                  React.createElement(
                    Button,
                    {
                      key: control.id,
                      size: "sm",
                      onClick: () =>
                        runtime?.send(
                          presentationCommand(control, state.selectedIds),
                        ),
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
    state.subjects = interpolation
      .render(performance.now(), { paused: state.paused })
      .filter((fact) => fact.pose?.position)
      .map((fact) => ({
        id: fact.id,
        name: fact.label || fact.id,
        x: fact.pose.position.x,
        y: fact.pose.position.y,
        z: fact.pose.position.z,
        facing: fact.pose.facing,
        visual: fact.visual,
        screen: { x: 0, y: 0 },
      }));
    if (!groundSprite) {
      groundSprite = art?.ground
        ? new Sprite(art.ground)
        : new Graphics().rect(0, 0, 640, 400).fill(0x24352e);
      groundSprite.anchor?.set?.(0.5);
      overlay.addChild(groundSprite, actorLayer, transientLayer);
    }
    for (const child of transientLayer.removeChildren())
      child.destroy?.({ children: true, texture: false, textureSource: false });
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
    for (const subject of [...state.subjects].sort(
      (a, b) => a.x + a.z - b.x - b.z,
    )) {
      subject.screen = screenPoint(subject);
      const isContainer = subject.visual === "crate";
      let entry = actorCache.get(subject.id);
      if (!entry) {
        entry = {
          container: new Container(),
          marker: new Graphics(),
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
      entry.marker
        .clear()
        .ellipse(0, 0, 18, 9)
        .stroke({
          color: state.selectedIds.includes(subject.id) ? 0xe8c779 : 0x5f8f7c,
          width: 2,
        });
      entry.marker.visible = state.selectedIds.includes(subject.id);
      const figure = art?.figures?.goblin || art?.figures?.cat;
      const frames = isContainer
        ? []
        : animationFrames(
            figure,
            animation?.direction ?? 0,
            animation?.walking ?? false,
          );
      const texture = isContainer
        ? art?.buildings?.shelf?.finished?.[0]
        : frames[(animation?.frame ?? 0) % Math.max(1, frames.length)];
      if (texture) entry.pawn.texture = texture;
      entry.pawn.visible = Boolean(texture);
      entry.pawn.anchor.set(
        0.5,
        isContainer ? art.propAnchor.y : art.pawnAnchor.y,
      );
      entry.pawn.scale.set(camera.zoom);
      entry.label.text = subject.name;
      entry.label.anchor.set(0.5, 1);
      entry.label.position.set(0, -12);
      entry.label.visible = state.selectedIds.includes(subject.id);
      entry.container.position.set(subject.screen.x, subject.screen.y);
      entry.container.zIndex = subject.x + subject.z;
      actorLayer.setChildIndex(entry.container, actorLayer.children.length - 1);
    }
    const drag = gesture.getSnapshot().context;
    if (
      gesture.getSnapshot().value === "dragging" &&
      drag.start &&
      drag.current
    )
      transientLayer.addChild(
        new Graphics()
          .rect(
            Math.min(drag.start.x, drag.current.x),
            Math.min(drag.start.y, drag.current.y),
            Math.abs(drag.current.x - drag.start.x),
            Math.abs(drag.current.y - drag.start.y),
          )
          .fill({ color: 0xe8c779, alpha: 0.12 })
          .stroke({ color: 0xe8c779, width: 1 }),
      );
  }
  function point(event) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function pointerDown(event) {
    if (isTypingTarget(event.target) || event.button !== 0) return;
    app.canvas.focus();
    const at = point(event);
    gesture.send({ type: "BEGIN", point: at, additive: event.shiftKey });
    app.canvas.setPointerCapture?.(event.pointerId);
  }
  function pointerMove(event) {
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
    const hit = selectionFromSubjects(
      state.subjects,
      box,
      drag.additive,
      state.selectedIds,
    );
    state.selectedIds = hit;
    emit({ kind: "select", entities: state.selectedIds });
    renderHud();
    draw();
  }
  function contextMenu(event) {
    event.preventDefault();
    const at = point(event);
    const world = groundPoint(
      (at.x - camera.x) / camera.zoom,
      (at.y - camera.y) / camera.zoom,
    );
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
    const key = event.key.toLowerCase();
    if (mode === "survival") {
      const id = state.selectedIds[0];
      const actor = state.subjects.find((subject) => subject.id === id);
      if (
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(key) &&
        actor
      ) {
        const destination = {
          x:
            actor.x +
            (key === "a" || key === "arrowleft"
              ? -1
              : key === "d" || key === "arrowright"
                ? 1
                : 0),
          y: actor.y,
          z:
            actor.z +
            (key === "w" || key === "arrowup"
              ? -1
              : key === "s" || key === "arrowdown"
                ? 1
                : 0),
        };
        emit({
          kind: "action",
          action: { kind: "move", entity: id, destination },
        });
      } else if (key === "e" || key === "f") {
        event.preventDefault();
        runtime.send({
          type: "command",
          name: key === "e" ? "takeFood" : "eatFood",
        });
      }
    }
  }
  async function start() {
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
        state.paused = event.paused;
        renderHud();
      }
      if (event.type === "frame") {
        if (interpolation.push(event, performance.now())) {
          animationClock.reset();
          frameEpoch = event.epoch;
          frameSequence = event.sequence;
          draw();
          renderHud();
        }
      }
      if (event.type === "presentation") {
        state.presentationFacts = event.facts;
        state.presentationControls = event.controls;
        renderHud();
      }
      if (event.type === "saved") {
        state.pendingSave = false;
        try {
          localStorage.setItem(saveKey, JSON.stringify(event.snapshot));
          state.message = "Saved in this browser";
        } catch (error) {
          state.message = `Could not save: ${error.message}`;
        }
        renderHud();
      }
      if (event.type === "ready") {
        state.message = "World ready";
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
      resizeObserver?.disconnect();
      window.removeEventListener("keydown", keydown);
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
