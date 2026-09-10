import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@fungi.computer/caps/components/button";
import { Card, CardContent } from "@fungi.computer/caps/components/card";
import { loadStaticArtPack } from "../../../src/art/static-pack.js";
import { isTypingTarget, selectionFromSubjects, pointerGestureMachine } from "./controls.js";
import { createActor } from "xstate";
import { createKeys } from "../../../src/keys.js";

export function createHiveClient({ root, mode, title, subtitle, source, runtime = null }) {
  const state = { paused: false, selectedIds: [], hoverId: null, dragging: null, disposed: false, subjects: [], message: runtime ? "Connecting to the world…" : "Runtime pending — waiting for the browser Worker." };
  const gesture = createActor(pointerGestureMachine).start();
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(state));
  const emit = (action) => { runtime?.send?.(action); notify(); };
  const canvasHost = document.createElement("div"); canvasHost.className = "hive-canvas";
  const hud = document.createElement("aside"); hud.className = "hive-hud";
  const hudRoot = createRoot(hud);
  root.replaceChildren(canvasHost, hud);
  const app = new Application();
  const overlay = new Container();
  let art = null;
  let resizeObserver = null;

  function renderHud() {
    const act = (kind) => {
      if (kind === "pause") state.paused = !state.paused;
      if (kind === "reset") { state.selectedIds = []; state.hoverId = null; camera.reset(); }
      emit({ kind }); renderHud();
    };
    hudRoot.render(React.createElement(Card, { variant: "outline", className: "hive-card" }, React.createElement(CardContent, null,
      React.createElement("div", { className: "hive-kicker" }, `HIVE / ${mode}`), React.createElement("h1", null, title), React.createElement("p", null, subtitle), React.createElement("p", { className: "hive-status" }, state.message), React.createElement("div", { className: "hive-controls" }, React.createElement(Button, { onClick: () => act("pause"), size: "sm" }, state.paused ? "Resume" : "Pause"), React.createElement(Button, { onClick: () => act("reset"), size: "sm", variant: "secondary" }, "Reset view"), React.createElement(Button, { onClick: () => act("save"), size: "sm", variant: "outline" }, "Save")), React.createElement("div", { className: "hive-selection" }, React.createElement("strong", null, "Selected"), React.createElement("span", null, state.selectedIds.length ? state.selectedIds.join(", ") : "none")), React.createElement("div", { className: "hive-actions" }, mode === "survival" ? "WASD / arrows move · E open · F consume" : "Click selects · Shift adds · drag selects a group · right click orders"), React.createElement("a", { className: "hive-source", href: source }, "View TypeScript source ↗"), React.createElement("nav", null, React.createElement("a", { href: "./" }, "Hub"), React.createElement("a", { href: "./colony.html" }, "Colony"), React.createElement("a", { href: "./survival.html" }, "Survival"), React.createElement("a", { href: "./formations.html" }, "Formations"), React.createElement("a", { href: "../index.html" }, "Old game"))));
  }

  const camera = { x: 0, y: 0, zoom: 1, reset() { this.x = this.y = 0; this.zoom = 1; draw(); } };
  function screenPoint(subject) { return { x: subject.x * camera.zoom + camera.x, y: subject.y * camera.zoom + camera.y }; }
  function draw() {
    if (!app.stage) return;
    overlay.removeChildren();
    const ground = art?.ground ? new Sprite(art.ground) : new Graphics().rect(0, 0, 640, 400).fill(0x24352e);
    ground.anchor?.set?.(0.5); ground.position.set(320 + camera.x, 200 + camera.y); ground.scale.set(camera.zoom); overlay.addChild(ground);
    const subjectTexture = art?.figures?.goblin?.idle?.[0]?.[0] || art?.figures?.cat?.idle?.[0]?.[0];
    for (const subject of state.subjects) {
      subject.screen = screenPoint(subject);
      const marker = new Graphics().ellipse(subject.screen.x, subject.screen.y, 18, 9).stroke({ color: state.selectedIds.includes(subject.id) ? 0xe8c779 : 0x5f8f7c, width: 2 });
      marker.eventMode = "none"; overlay.addChild(marker);
      if (subjectTexture) { const pawn = new Sprite(subjectTexture); pawn.anchor.set(0.5, art.pawnAnchor?.y ?? 0.75); pawn.position.set(subject.screen.x, subject.screen.y); pawn.scale.set(.62); pawn.eventMode = "none"; overlay.addChild(pawn); }
      const label = new Text({ text: subject.name, style: { fontFamily: "Stipe, sans-serif", fontSize: 12, fill: 0xf7edcf } }); label.anchor.set(0.5, 1); label.position.set(subject.screen.x, subject.screen.y - 12); overlay.addChild(label);
    }
  }
  function point(event) { const rect = app.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function pointerDown(event) { if (isTypingTarget(event.target) || event.button !== 0) return; gesture.send({ type: "BEGIN" }); state.dragging = { start: point(event), current: point(event), additive: event.shiftKey }; app.canvas.setPointerCapture?.(event.pointerId); }
  function pointerMove(event) { if (!state.dragging) return; state.dragging.current = point(event); }
  function pointerUp(event) { if (!state.dragging) return; gesture.send({ type: "END" }); const drag = state.dragging; state.dragging = null; const end = point(event); const box = { left: Math.min(drag.start.x, end.x), right: Math.max(drag.start.x, end.x), top: Math.min(drag.start.y, end.y), bottom: Math.max(drag.start.y, end.y) }; const hit = selectionFromSubjects(state.subjects, box, drag.additive, state.selectedIds); state.selectedIds = hit; emit({ kind: "select", entities: state.selectedIds }); renderHud(); draw(); }
  function contextMenu(event) { event.preventDefault(); const at = point(event); emit({ kind: mode === "formations" ? "group-order" : "move", entities: state.selectedIds, destination: { x: at.x, y: 0, z: at.y }, facing: 0 }); }
  function keydown(event) { if (isTypingTarget(event.target)) return; const key = event.key.toLowerCase(); if (key === " " || key === "spacebar") { event.preventDefault(); state.paused = !state.paused; emit({ kind: "pause" }); renderHud(); } else if (mode === "survival" && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) emit({ kind: "move", direction: key }); else if (key === "escape") { state.dragging = null; state.selectedIds = []; renderHud(); draw(); } }
  async function start() {
    await app.init({ resizeTo: canvasHost, backgroundAlpha: 0, antialias: false, resolution: 1 }); canvasHost.appendChild(app.canvas); app.stage.addChild(overlay); const pack = await loadStaticArtPack(); art = pack.art; state.disposeArt = pack.dispose; draw(); renderHud();
    app.canvas.addEventListener("pointerdown", pointerDown); app.canvas.addEventListener("pointermove", pointerMove); app.canvas.addEventListener("pointerup", pointerUp); app.canvas.addEventListener("contextmenu", contextMenu); app.canvas.addEventListener("pointercancel", () => { gesture.send({ type: "CANCEL" }); state.dragging = null; }); window.addEventListener("keydown", keydown); resizeObserver = new ResizeObserver(draw); resizeObserver.observe(canvasHost);
    createKeys(root, () => state, emit, renderHud);
    runtime?.subscribe?.((event) => { if (event.type === "frame") { state.subjects = event.facts.filter((fact) => fact.pose?.position).map((fact) => ({ id: fact.id, name: fact.label || fact.id, x: fact.pose.position.x * 36 + 280, y: fact.pose.position.z * 24 + 180, visual: fact.visual, screen: { x: 0, y: 0 } })); draw(); renderHud(); } if (event.type === "error") { state.message = event.message; renderHud(); } });
  }
  start().catch((error) => { state.message = `Art unavailable: ${error.message}`; renderHud(); });
  return { state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, dispose() { if (state.disposed) return; state.disposed = true; gesture.stop(); resizeObserver?.disconnect(); window.removeEventListener("keydown", keydown); app.canvas?.removeEventListener("pointerdown", pointerDown); app.canvas?.removeEventListener("pointermove", pointerMove); app.canvas?.removeEventListener("pointerup", pointerUp); app.canvas?.removeEventListener("contextmenu", contextMenu); state.disposeArt?.(); overlay.removeChildren().forEach((child) => child.destroy?.({ children: true })); app.destroy(true, { children: true, texture: false, textureSource: false }); }, send: emit };
}
