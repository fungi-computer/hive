import * as THREE from "three";
import { Application, Sprite } from "pixi.js";
import "@fungi.computer/caps/styles.css";
import { bake } from "./src/art/bake.js";
import { camera } from "./src/art/scale.js";
import { FIRE_COLORS, fireProp, fireCourt } from "./fire-study-fires.js";

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const propCamera = camera(96, 112, 1.3),
  fieldCamera = camera(480, 256, 0.65);
const textures = {},
  courts = {};
for (const color of Object.keys(FIRE_COLORS)) {
  textures[color] = {};
  courts[color] = [];
  for (const kind of ["camp", "brazier", "hearth"]) {
    textures[color][kind] = Array.from({ length: 12 }, (_, frame) =>
      bake(
        renderer,
        fireProp(kind, frame / 12, color),
        propCamera,
        96,
        112,
        false,
      ),
    );
    await new Promise(requestAnimationFrame);
  }
  for (let frame = 0; frame < 12; frame++) {
    courts[color].push(
      bake(
        renderer,
        fireCourt(frame / 12, color),
        fieldCamera,
        480,
        256,
        false,
      ),
    );
    if (frame % 4 === 3) await new Promise(requestAnimationFrame);
  }
}
renderer.dispose();
const app = new Application();
await app.init({
  canvas: document.querySelector("#court"),
  width: 480,
  height: 256,
  resolution: 1,
  antialias: false,
  backgroundAlpha: 0,
});
let playing = true,
  color = "hearth",
  frame = 0,
  elapsed = 0;
const sprite = new Sprite(courts[color][frame]);
app.stage.addChild(sprite);
const strip = document.querySelector("#strip"),
  ctx = strip.getContext("2d");
ctx.imageSmoothingEnabled = false;
function draw() {
  sprite.texture = courts[color][frame];
  ctx.fillStyle = "#252934";
  ctx.fillRect(0, 0, 480, 138);
  ["camp", "brazier", "hearth"].forEach((kind, i) => {
    ctx.drawImage(
      textures[color][kind][frame].source.resource,
      i * 160 + 32,
      -2,
    );
    ctx.fillStyle = "#ded9cb";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(
      {
        camp: "A fire for travellers",
        brazier: "A watch in the dark",
        hearth: "Somewhere warm",
      }[kind],
      i * 160 + 80,
      126,
    );
  });
  app.render();
}
app.ticker.add(({ deltaMS }) => {
  if (!playing) return;
  elapsed += deltaMS;
  const next = Math.floor(elapsed / 120) % 12;
  if (next !== frame) {
    frame = next;
    draw();
  }
});
document.querySelector("#play").addEventListener("click", (event) => {
  playing = !playing;
  event.currentTarget.textContent = playing ? "Pause motion" : "Play motion";
});
for (const button of document.querySelectorAll("[data-color]"))
  button.addEventListener("click", () => {
    color = button.dataset.color;
    frame = elapsed = 0;
    for (const b of document.querySelectorAll("[data-color]")) {
      b.setAttribute("aria-pressed", String(b === button));
      b.classList.toggle("btn-primary", b === button);
    }
    draw();
  });
draw();
document.querySelector("#loading").hidden = true;
window.__FIRE = {
  ready: true,
  textures,
  courts,
  get playing() {
    return playing;
  },
  get frame() {
    return frame;
  },
  get color() {
    return color;
  },
  native: { prop: [96, 112], court: [480, 256], tile: [32, 16] },
};
