import * as THREE from "three";
import { Application, Sprite } from "pixi.js";
import "@fungi.computer/caps/styles.css";
import "./style.css";
import { scene, group } from "../../art/geometry.js";
import { camera } from "../../art/scale.js";
import { bake, bakeCanvas } from "./bake.js";
import { brewhouseScene } from "./composition.js";
import { buildProp, PROP_BUILDERS } from "./props.js";
import { BREWHOUSE } from "./template.js";

const width = 400,
  height = 360;
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const app = new Application();
await app.init({
  canvas: document.querySelector("#house"),
  width,
  height,
  backgroundAlpha: 0,
  antialias: false,
  resolution: 1,
});
app.stop();
const sprite = new Sprite();
app.stage.addChild(sprite);
const state = { mode: "dollhouse", facing: 0 };
const exports = {},
  metrics = [],
  propFacings = {};
let currentTexture;
function bounds(canvas) {
  const { width: w, height: h } = canvas,
    data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1,
    count = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 128) {
        minX = Math.min(x, minX);
        minY = Math.min(y, minY);
        maxX = Math.max(x, maxX);
        maxY = Math.max(y, maxY);
        count++;
      }
  return {
    minX,
    minY,
    maxX,
    maxY,
    count,
    margin: Math.min(minX, minY, w - 1 - maxX, h - 1 - maxY),
  };
}
function draw() {
  const s = brewhouseScene(state.mode, state.facing);
  const cameraTarget =
    state.mode === "exploded" ? 4.0 : state.mode === "ground" ? 1.1 : 2.4;
  const c = camera(width, height, cameraTarget);
  const old = currentTexture;
  currentTexture = bake(renderer, s, c, width, height);
  sprite.texture = currentTexture;
  old?.destroy(true);
  app.render();
  exports.house = sprite.texture.source.resource;
  document.querySelector("#status").textContent =
    `${{ dollhouse: "Cutaway", exterior: "Finished exterior", ground: "Brewing floor", upper: "Upper bedroom", exploded: "Separated storeys" }[state.mode]} · View ${state.facing + 1} of 4`;
  for (const button of document.querySelectorAll("[data-mode]")) {
    const active = button.dataset.mode === state.mode;
    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("btn-primary", active);
  }
  for (const [kind, facings] of Object.entries(propFacings)) {
    document
      .querySelector(`[data-kind="${kind}"] canvas`)
      ?.replaceWith(facings[state.facing]);
  }
}
document.querySelector("#views").addEventListener("click", (event) => {
  const button = event.target.closest("[data-mode]");
  if (button) {
    state.mode = button.dataset.mode;
    draw();
  }
});
document.querySelector("#turn").addEventListener("click", () => {
  state.facing = (state.facing + 1) % 4;
  draw();
});
draw();
const labels = {
  kettle: "Hollow copper kettle & hearth",
  fermenter: "Fermentation tun",
  cask: "Coopered keg",
  workbench: "Herbalist’s bench",
  bar: "Serving counter",
  stool: "Three-legged stool",
  grainSack: "Open grain sack",
  bucket: "Open water pail",
  dryingRack: "Herb drying rack",
  bookcase: "Books & little bottles",
  lantern: "Iron lantern",
  sign: "The Copper Familiar",
  bottle: "Corked bottle",
  tankard: "Foaming tankard",
};
for (const kind of Object.keys(PROP_BUILDERS)) {
  propFacings[kind] = [];
  for (let facing = 0; facing < 4; facing++) {
    const s = scene(),
      model = group(s);
    model.rotation.y = (facing * Math.PI) / 2;
    buildProp(kind, model);
    const modelBounds = new THREE.Box3().setFromObject(model);
    const canvas = bakeCanvas(renderer, s, camera(112, 112, 1.1), 112, 112);
    canvas.dataset.prop = kind;
    canvas.setAttribute("aria-label", `${labels[kind]}, view ${facing + 1}`);
    propFacings[kind].push(canvas);
    metrics.push({
      kind,
      facing,
      visualBounds: {
        min: modelBounds.min.toArray(),
        max: modelBounds.max.toArray(),
      },
      ...bounds(canvas),
    });
  }
  const canvas = propFacings[kind][0];
  exports[kind] = canvas;
  const card = document.createElement("div");
  card.className = "prop-card";
  card.dataset.kind = kind;
  card.append(canvas);
  const label = document.createElement("p");
  label.textContent = labels[kind];
  card.append(label);
  document.querySelector("#props").append(card);
  await new Promise(requestAnimationFrame);
}
window.__BREWHOUSE = {
  ready: true,
  state,
  metrics,
  propFacings,
  template: BREWHOUSE,
  exports,
  draw,
  bounds,
  renderer,
  app,
};
window.addEventListener(
  "pagehide",
  () => {
    renderer.dispose();
    app.destroy(true, { children: true, texture: true, textureSource: true });
  },
  { once: true },
);
