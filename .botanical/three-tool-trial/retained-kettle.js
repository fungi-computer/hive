// Ignored-only devtools fixture. Unlike the production bake, this retains the
// original exported kettle scene and its renderer for inspection.
import * as THREE from "three";
import { camera } from "../../src/art/scale.js";

const canvas = document.querySelector("canvas");
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(256, 256, false);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const json = await fetch("./output/brewhouse-kettle.r185.json").then((response) => {
  if (!response.ok) throw new Error(`Could not load kettle artifact: ${response.status}`);
  return response.json();
});
const scene = new THREE.ObjectLoader().parse(json);
let originalNodes = 0;
scene.traverse(() => originalNodes++);
const view = camera(256, 256, 0.9);
view.name = "Hive baked-prop camera";
scene.add(view);

let frame = 0;
function render() {
  renderer.render(scene, view);
  frame = requestAnimationFrame(render);
}
render();
window.__HIVE_THREE_TOOL_TRIAL__ = {
  scene,
  renderer,
  camera: view,
  three: THREE.REVISION,
  originalNodes,
  errors: [],
};
window.addEventListener("error", (event) => {
  window.__HIVE_THREE_TOOL_TRIAL__.errors.push(String(event.error || event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  window.__HIVE_THREE_TOOL_TRIAL__.errors.push(String(event.reason));
});
window.addEventListener(
  "pagehide",
  () => {
    cancelAnimationFrame(frame);
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : [])
        materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    renderer.dispose();
  },
  { once: true },
);
