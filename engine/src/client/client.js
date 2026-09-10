import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { loadStaticArtPack } from "../../../src/art/static-pack.js";
import { isTypingTarget, selectionFromSubjects } from "./controls.js";

function findTexture(value, wanted, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (wanted.some((part) => value.path?.join?.(".") === part)) return value.texture;
  for (const [key, child] of Object.entries(value)) {
    if (child?.source && child?.frame) return child;
    const found = findTexture(child, wanted, seen);
    if (found) return found;
  }
  return null;
}

function makeSubjects(mode) {
  const names = mode === "survival" ? ["Rook"] : mode === "formations" ? ["North", "Moss", "Pip", "Vale"] : ["Moss", "Pip", "Vale", "Rook"];
  return names.map((name, index) => ({ id: `${mode}-${index + 1}`, name, x: 250 + index * 72, y: 210 + (index % 2) * 38, screen: { x: 0, y: 0 } }));
}

export function createHiveClient({ root, mode, title, subtitle, source, runtime = null }) {
  const state = { paused: false, selectedIds: [], hoverId: null, dragging: null, disposed: false, subjects: makeSubjects(mode), message: runtime ? "Connecting to the world…" : "Runtime pending — this page is a client shell." };
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(state));
  const emit = (action) => { runtime?.send?.(action); state.message = `Admitted action: ${action.kind}`; notify(); };
  const canvasHost = document.createElement("div"); canvasHost.className = "hive-canvas";
  const hud = document.createElement("aside"); hud.className = "hive-hud";
  root.replaceChildren(canvasHost, hud);
  const app = new Application();
  const overlay = new Container();
  let art = null;
  let resizeObserver = null;

  function renderHud() {
    hud.innerHTML = `<div class="hive-kicker">HIVE / ${mode}</div><h1>${title}</h1><p>${subtitle}</p><p class="hive-status">${state.message}</p><div class="hive-controls"><button data-action="pause">${state.paused ? "Resume" : "Pause"}</button><button data-action="reset">Reset view</button><button data-action="save">Save</button></div><div class="hive-selection"><strong>Selected</strong><span>${state.selectedIds.length ? state.selectedIds.join(", ") : "none"}</span></div><div class="hive-actions">${mode === "survival" ? "WASD / arrows move · E open · F consume" : "Click selects · Shift adds · drag selects a group · right click orders"}</div><a class="hive-source" href="${source}" target="_blank" rel="noreferrer">View TypeScript source ↗</a><nav><a href="./">Hub</a><a href="./colony.html">Colony</a><a href="./survival.html">Survival</a><a href="./formations.html">Formations</a><a href="../index.html">Old game</a></nav>`;
    hud.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => {
      const kind = button.dataset.action;
      if (kind === "pause") state.paused = !state.paused;
      if (kind === "reset") { state.selectedIds = []; state.hoverId = null; camera.reset(); }
      emit({ kind }); renderHud();
    }));
  }

  const camera = { x: 0, y: 0, zoom: 1, reset() { this.x = this.y = 0; this.zoom = 1; draw(); } };
  function screenPoint(subject) { return { x: subject.x * camera.zoom + camera.x, y: subject.y * camera.zoom + camera.y }; }
  function draw() {
    if (!app.stage) return;
    overlay.removeChildren();
    const ground = art?.ground ? new Sprite(art.ground) : new Graphics().rect(0, 0, 640, 400).fill(0x24352e);
    ground.anchor?.set?.(0.5); ground.position.set(320 + camera.x, 200 + camera.y); ground.scale.set(camera.zoom); overlay.addChild(ground);
    for (const subject of state.subjects) {
      subject.screen = screenPoint(subject);
      const marker = new Graphics().ellipse(subject.screen.x, subject.screen.y, 18, 9).fill(state.selectedIds.includes(subject.id) ? 0xe8c779 : 0x5f8f7c);
      marker.eventMode = "none"; overlay.addChild(marker);
      const label = new Text({ text: subject.name, style: { fontFamily: "Stipe, sans-serif", fontSize: 12, fill: 0xf7edcf } }); label.anchor.set(0.5, 1); label.position.set(subject.screen.x, subject.screen.y - 12); overlay.addChild(label);
    }
  }
  function point(event) { const rect = app.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
  function pointerDown(event) { if (isTypingTarget(event.target) || event.button !== 0) return; state.dragging = { start: point(event), current: point(event), additive: event.shiftKey }; app.canvas.setPointerCapture?.(event.pointerId); }
  function pointerMove(event) { if (!state.dragging) return; state.dragging.current = point(event); }
  function pointerUp(event) { if (!state.dragging) return; const drag = state.dragging; state.dragging = null; const end = point(event); const box = { left: Math.min(drag.start.x, end.x), right: Math.max(drag.start.x, end.x), top: Math.min(drag.start.y, end.y), bottom: Math.max(drag.start.y, end.y) }; const hit = selectionFromSubjects(state.subjects, box, drag.additive); if (Math.abs(end.x - drag.start.x) < 6 && Math.abs(end.y - drag.start.y) < 6) state.selectedIds = drag.additive ? [...new Set([...state.selectedIds, ...hit])] : hit; else state.selectedIds = drag.additive ? [...new Set([...state.selectedIds, ...hit])] : hit; emit({ kind: "select", ids: state.selectedIds }); renderHud(); draw(); }
  function keydown(event) { if (isTypingTarget(event.target)) return; const key = event.key.toLowerCase(); if (key === " " || key === "spacebar") { event.preventDefault(); state.paused = !state.paused; emit({ kind: "pause" }); renderHud(); } else if (mode === "survival" && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) emit({ kind: "move", direction: key }); else if (key === "escape") { state.dragging = null; state.selectedIds = []; renderHud(); draw(); } }
  async function start() {
    await app.init({ resizeTo: canvasHost, backgroundAlpha: 0, antialias: false, resolution: 1 }); canvasHost.appendChild(app.canvas); app.stage.addChild(overlay); art = await loadStaticArtPack(); draw(); renderHud();
    app.canvas.addEventListener("pointerdown", pointerDown); app.canvas.addEventListener("pointermove", pointerMove); app.canvas.addEventListener("pointerup", pointerUp); app.canvas.addEventListener("pointercancel", () => { state.dragging = null; }); window.addEventListener("keydown", keydown); resizeObserver = new ResizeObserver(draw); resizeObserver.observe(canvasHost);
  }
  start().catch((error) => { state.message = `Art unavailable: ${error.message}`; renderHud(); });
  return { state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, dispose() { if (state.disposed) return; state.disposed = true; resizeObserver?.disconnect(); window.removeEventListener("keydown", keydown); app.canvas?.removeEventListener("pointerdown", pointerDown); app.canvas?.removeEventListener("pointermove", pointerMove); app.canvas?.removeEventListener("pointerup", pointerUp); art?.dispose?.(); app.destroy(true, { children: true, texture: false, textureSource: false }); }, send: emit };
}
