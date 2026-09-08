import * as THREE from "three";
import { camera } from "../../art/scale.js";
import { building } from "../../art/home.js";
import { bakeCanvas } from "../brewhouse/bake.js";
import { mixedShelf, PROFILES } from "../../art/mixed-shelf.js";

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const prop = camera(112, 112, 1.1);
const frames = {};
const native = document.createElement("canvas");
native.width = 448;
native.height = PROFILES.length * 132;
const nc = native.getContext("2d");
nc.fillStyle = "#34433b";
nc.fillRect(0, 0, native.width, native.height);
nc.font = "11px monospace";
const displays = [];
let facing = 0;

for (const [row, profile] of PROFILES.entries()) {
  const pair = [0, 1].map((direction) => bakeCanvas(renderer, mixedShelf(profile.key, direction), prop, 112, 112));
  frames[profile.key] = pair;
  nc.fillStyle = "#eee1c5";
  nc.fillText(`${profile.key}  /  ${profile.wood} wood + ${profile.herbs} herb`, 8, row * 132 + 14);
  pair.forEach((frame, i) => nc.drawImage(frame, 56 + i * 224, row * 132 + 20));
  const section = document.createElement("article");
  section.className = "profile";
  const c = document.createElement("canvas");
  c.width = c.height = 112;
  const label = document.createElement("h3");
  label.textContent = profile.key.replaceAll("-", " ");
  const counts = document.createElement("p");
  counts.textContent = profile.wood || profile.herbs ? `${profile.wood} wood · ${profile.herbs} herb` : "Empty";
  section.append(c, label, counts);
  document.querySelector("#profiles").append(section);
  displays.push({ c, pair });
}
document.querySelector("#contact").append(native);
const reference = [0, 1].map((dir) => bakeCanvas(renderer, building("shelf", "filled", dir), prop, 112, 112));
function render() {
  for (const { c, pair } of displays) {
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 112, 112);
    ctx.drawImage(pair[facing], 0, 0);
  }
  document.querySelector("#status").textContent = `Direction ${facing + 1} · 10 bounded contents profiles`;
}
document.querySelector("#turn").addEventListener("click", () => { facing = 1 - facing; render(); });
render();
renderer.dispose();
window.__MIXED_SHELF = { ready: true, frames, native, reference, get facing() { return facing; } };
