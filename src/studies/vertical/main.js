import { VERTICAL_LAYOUT, VERTICAL_LAYOUT_LABEL } from "../../fixtures/vertical-layout.ts";
import { box, group, scene } from "../../../art/geometry.js";
import { floor } from "../../../art/floor.js";
import { stair } from "../../../art/stair.js";
import { camera, STOREY_HEIGHT } from "../../../art/scale.js";

const WIDTH = 760;
const HEIGHT = 500;
const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector("#vertical-canvas"),
  alpha: true,
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const state = { layer: "cutaway", zoom: 1 };

function authoredSite(next) {
  return { ...next, direction: 0, work: 0, finishedAt: 0 };
}

function addWall(parent, site, cutaway) {
  const x = site.x - 6;
  const z = site.z - 5;
  const y = site.level * STOREY_HEIGHT;
  // Keep the front and right faces open in the cutaway so the authored rooms
  // remain readable while every visible piece still follows the fixture cell.
  if (cutaway && (z === 2 || x === 2)) return;
  const wall = group(parent, x, y, z);
  box(wall, "#d0b27a", 0, 1.02, 0, 0.9, 2.02, 0.12);
  box(wall, "#765238", -0.39, 1.02, 0, 0.1, 2.1, 0.2);
  box(wall, "#765238", 0.39, 1.02, 0, 0.1, 2.1, 0.2);
  box(wall, "#9b754b", 0, 0.08, 0, 1.02, 0.12, 0.2);
  box(wall, "#9b754b", 0, 2.02, 0, 1.02, 0.12, 0.2);
}

function addRoof(parent, site) {
  const roof = group(parent, site.x - 6, site.level * STOREY_HEIGHT, site.z - 5);
  box(roof, "#62745b", 0, 0.08, 0, 0.96, 0.16, 0.96);
  box(roof, "#8e6945", 0, 0.19, -0.36, 1.02, 0.08, 0.09);
  box(roof, "#8e6945", 0, 0.19, 0.36, 1.02, 0.08, 0.09);
}

function buildStudyScene() {
  const root = scene();
  const model = group(root, -0.1, 0, 0);
  const cutaway = state.layer === "cutaway";
  const visible = (level) =>
    state.layer === "cutaway" ||
    (state.layer === "ground" && level === 0) ||
    (state.layer === "upper" && (level === 1 || level === 2)) ||
    (state.layer === "roof" && level === 3);
  for (const raw of VERTICAL_LAYOUT) {
    const site = authoredSite(raw);
    if (!visible(site.level)) continue;
    const x = site.x - 6;
    const z = site.z - 5;
    if (site.type === "floor") floor(group(model, x, site.level * STOREY_HEIGHT, z), "finished");
    else if (site.type === "wall" || site.type === "door") addWall(model, site, cutaway);
    else if (site.type === "roof") addRoof(model, site);
    else if (site.type === "stair") {
      const stairGroup = group(model, x, site.level * STOREY_HEIGHT, z);
      stair(stairGroup, "finished");
    } else if (site.type === "brew-station") {
      const station = group(model, x, site.level * STOREY_HEIGHT, z);
      box(station, "#716955", 0, 0.12, 0, 0.88, 0.24, 0.7);
      box(station, "#b86842", 0, 0.65, 0, 0.42, 0.7, 0.42);
      box(station, "#d2b77e", 0, 1.03, 0, 0.5, 0.06, 0.5);
    }
  }
  return root;
}

function draw() {
  const root = buildStudyScene();
  const view = camera(WIDTH, HEIGHT, 2.45);
  view.zoom = state.zoom;
  view.updateProjectionMatrix();
  renderer.render(root, view);
  root.traverse((object) => object.geometry?.dispose());
  renderer.clearDepth();
  document.querySelector("#vertical-status").textContent =
    `${state.layer === "cutaway" ? "Cutaway" : `${state.layer[0].toUpperCase()}${state.layer.slice(1)} layer`} · ${VERTICAL_LAYOUT.length} authored pieces · zoom ${state.zoom.toFixed(1)}×`;
  for (const button of document.querySelectorAll("[data-layer]")) {
    const active = button.dataset.layer === state.layer;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("btn-primary", active);
  }
}

document.querySelector("#vertical-views").addEventListener("click", (event) => {
  const button = event.target.closest("[data-layer]");
  if (!button) return;
  state.layer = button.dataset.layer;
  draw();
});
document.querySelector("#zoom-in").addEventListener("click", () => {
  state.zoom = Math.min(1.8, state.zoom + 0.2);
  draw();
});
document.querySelector("#zoom-out").addEventListener("click", () => {
  state.zoom = Math.max(0.7, state.zoom - 0.2);
  draw();
});
document.querySelector("#vertical-note").textContent = VERTICAL_LAYOUT_LABEL;
draw();
