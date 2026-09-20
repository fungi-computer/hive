import * as THREE from "three";
import { COURT, DENSE } from "./fixture.js";
import { createDepthStudy } from "./renderer.js";
import "./page.css";

const app = document.querySelector("#app");
app.innerHTML = `<h1>Rendering experiment · local scene</h1><p>Original Three art with ordinary GPU depth. This fixture is deterministic and has no game backend.</p><div class="stage"><div class="canvas-wrap"><canvas width="640" height="400" aria-label="Three depth study"></canvas></div><section class="controls"><fieldset><legend>Scene</legend><div class="row"><label>Preset <select id="preset"><option value="court">16×16 court</option><option value="dense">32×32 authored stress fixture</option></select></label><button id="reset-scene">Reset scene</button><button id="reset-view">Reset view</button></div><div class="row"><button id="water">Water: off</button><button id="loop">Repeat view loop</button></div></fieldset><fieldset><legend>View</legend><div class="row"><button data-turn="-1">◀ Q</button><button data-turn="1">E ▶</button><label>Azimuth <input id="azimuth" type="range" min="0" max="360" value="0"></label></div><div class="row"><button id="zoom-out">−</button><button id="zoom-in">+</button><button id="layer-down">Layer −</button><button id="layer-up">Layer +</button><button id="full">Full terrain</button></div><div class="row"><button id="play">Play</button><label>Pose <input id="scrub" type="range" min="0" max="12" step="0.01" value="0"></label></div></fieldset><fieldset><legend>Proof controls</legend><div class="row"><button id="evict">Evict chunks</button><button id="rebuild">Rebuild chunks</button></div><div id="status"></div></fieldset><div class="help">Drag to pan · wheel to zoom · Q/E or arrow keys rotate · click an object or terrain. Cutting hides objects supported above the selected layer; retained objects stay whole.</div></section></div>`;

const canvas = app.querySelector("canvas"), status = app.querySelector("#status");
let current = COURT, playing = false, waterOn = false, replay = 0, last = performance.now();
const view = createDepthStudy({ canvas, onSelection: selection => { status.dataset.selection = selection ? JSON.stringify(selection) : ""; updateStatus(); } });
window.__depthStudy = view;
const initial = { target: { x: 0, y: 0.4, z: 0 }, azimuth: 0, zoom: 1.3, cutLevel: null };
view.setScene(current); view.setView(initial);
function updateStatus() { const info = view.inspect(); status.textContent = `Selected: ${status.dataset.selection || "none"}\nChunks ${info.chunks} · triangles ${Math.round(info.triangles || 0)} · geometry ${info.geometries}\nRender ${info.renderMs.toFixed(2)}ms · view azimuth ${Math.round(info.view.azimuth * 180 / Math.PI)}° · layer ${info.view.cutLevel ?? "full"}`; }
function setCut(level) { view.setView({ cutLevel: level }); updateStatus(); }
function rotate(delta) { const info = view.inspect(); view.setView({ azimuth: info.view.azimuth + delta * Math.PI / 2 }); document.querySelector("#azimuth").value = ((info.view.azimuth + delta * Math.PI / 2) * 180 / Math.PI + 360) % 360; updateStatus(); }
document.querySelectorAll("[data-turn]").forEach(button => button.onclick = () => rotate(Number(button.dataset.turn)));
document.querySelector("#azimuth").oninput = event => { view.setView({ azimuth: Number(event.target.value) * Math.PI / 180 }); updateStatus(); };
document.querySelector("#zoom-in").onclick = () => { view.setView({ zoom: view.inspect().view.zoom * 1.15 }); updateStatus(); };
document.querySelector("#zoom-out").onclick = () => { view.setView({ zoom: view.inspect().view.zoom / 1.15 }); updateStatus(); };
document.querySelector("#layer-down").onclick = () => setCut(Math.max(-1, (view.inspect().view.cutLevel ?? 1) - 1));
document.querySelector("#layer-up").onclick = () => setCut(Math.min(1, (view.inspect().view.cutLevel ?? -1) + 1));
document.querySelector("#full").onclick = () => setCut(null);
document.querySelector("#reset-view").onclick = () => { view.setView(initial); document.querySelector("#azimuth").value = 0; updateStatus(); };
document.querySelector("#preset").onchange = event => { current = event.target.value === "dense" ? DENSE : COURT; view.setScene(current); view.setView(initial); updateStatus(); };
document.querySelector("#reset-scene").onclick = () => { view.setScene(current); view.setView(initial); replay = 0; document.querySelector("#scrub").value = 0; updateStatus(); };
document.querySelector("#water").onclick = event => { waterOn = !waterOn; view.setWater(waterOn); event.target.textContent = `Water: ${waterOn ? "on" : "off"}`; updateStatus(); };
document.querySelector("#evict").onclick = () => { view.evictTerrain(); updateStatus(); };
document.querySelector("#rebuild").onclick = () => { view.rebuildTerrain(); updateStatus(); };
document.querySelector("#play").onclick = event => { playing = !playing; event.target.textContent = playing ? "Pause" : "Play"; };
document.querySelector("#scrub").oninput = event => { replay = Number(event.target.value); view.setReplayTime(replay); updateStatus(); };
document.querySelector("#loop").onclick = async event => { event.target.disabled = true; for (let i = 0; i < 20; i++) { view.setView({ target: { x: 5, y: 0, z: 5 }, cutLevel: -1, azimuth: Math.PI / 2 }); view.setView(initial); } updateStatus(); event.target.disabled = false; };
let dragging = false, lastPointer = null;
canvas.onpointerdown = event => { dragging = true; lastPointer = event; canvas.setPointerCapture(event.pointerId); };
canvas.onpointermove = event => { if (!dragging) return; const dx = event.clientX - lastPointer.clientX, dz = event.clientY - lastPointer.clientY; const info = view.inspect(); view.setView({ target: { x: info.view.target.x - dx / 40, y: 0, z: info.view.target.z + dz / 40 } }); lastPointer = event; updateStatus(); };
canvas.onpointerup = event => { dragging = false; canvas.releasePointerCapture(event.pointerId); };
canvas.onclick = event => { if (Math.abs(event.clientX - (lastPointer?.clientX ?? event.clientX)) < 3) view.pick({ cssX: event.clientX, cssY: event.clientY }); };
canvas.onwheel = event => { event.preventDefault(); const info = view.inspect(); view.setView({ zoom: info.view.zoom * (event.deltaY < 0 ? 1.08 : 0.92) }); updateStatus(); };
window.onkeydown = event => { if (event.key.toLowerCase() === "q" || event.key === "ArrowLeft") rotate(-1); if (event.key.toLowerCase() === "e" || event.key === "ArrowRight") rotate(1); };
function frame(now) { const dt = Math.min(0.1, (now - last) / 1000); last = now; if (playing) { replay += dt; document.querySelector("#scrub").value = replay % 12; view.setReplayTime(replay); } view.render(); if (now % 15 < 1) updateStatus(); requestAnimationFrame(frame); }
window.addEventListener("resize", () => { const width = Math.min(640, canvas.parentElement.clientWidth - 8); view.resize({ cssWidth: width, cssHeight: width * 400 / 640 }); });
updateStatus(); requestAnimationFrame(frame);
