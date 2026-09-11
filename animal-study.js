import * as THREE from "three";
import { Application, Sprite, Graphics } from "pixi.js";
import "@fungi.computer/caps/styles.css";
import { anchor } from "./src/art.js";
import { bake } from "./src/art/bake.js";
import { camera } from "./src/art/scale.js";
import { figure } from "./src/art/figures.js";
import { ANIMALS, animal, pasture } from "./animal-study-animals.js";

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const portrait = camera(80, 80),
  fieldCamera = camera(512, 256, 0.65);
const textures = {};
for (const kind of Object.keys(ANIMALS)) {
  textures[kind] = {};
  for (const pose of ["idle", "walk", "graze"]) {
    textures[kind][pose] = [];
    for (let facing = 0; facing < 4; facing++) {
      textures[kind][pose].push(
        Array.from({ length: 8 }, (_, frame) =>
          bake(
            renderer,
            animal(kind, frame / 8, (facing * Math.PI) / 2, pose),
            portrait,
            80,
            80,
          ),
        ),
      );
      await new Promise(requestAnimationFrame);
    }
  }
  if (ANIMALS[kind].pack) {
    textures[kind].loaded = [];
    for (let facing = 0; facing < 4; facing++) {
      textures[kind].loaded.push(
        Array.from({ length: 8 }, (_, frame) =>
          bake(
            renderer,
            animal(kind, frame / 8, (facing * Math.PI) / 2, "walk", true),
            portrait,
            80,
            80,
          ),
        ),
      );
      await new Promise(requestAnimationFrame);
    }
  }
}
const comparisons = Object.fromEntries(
  ["rowan", "cat"].map((kind) => [
    kind,
    bake(renderer, figure(kind, 0, 0, "idle"), portrait, 80, 80),
  ]),
);
const floor = bake(renderer, pasture(), fieldCamera, 512, 256, false);
renderer.dispose();

const app = new Application();
await app.init({
  canvas: document.querySelector("#pasture"),
  width: 512,
  height: 256,
  resolution: 1,
  antialias: false,
  backgroundAlpha: 0,
  autoDensity: false,
});
app.stage.addChild(new Sprite(floor));
const animated = [],
  foot = anchor(portrait);
function place(kind, x, z) {
  const projected = new THREE.Vector3(x, 0, z).project(fieldCamera);
  const sx = Math.round((projected.x + 1) * 256),
    sy = Math.round((1 - projected.y) * 128);
  const mark = new Graphics()
    .ellipse(0, 0, kind === "chicken" || kind === "cat" ? 4 : 10, 3)
    .fill({ color: 0x414b36, alpha: 0.28 });
  mark.position.set(sx, sy);
  app.stage.addChild(mark);
  const sprite = new Sprite(textures[kind]?.idle[0][0] || comparisons[kind]);
  sprite.anchor.set(foot.x, foot.y);
  sprite.position.set(sx, sy);
  app.stage.addChild(sprite);
  if (textures[kind]) animated.push({ kind, sprite });
}
const cast = [
  { kind: "donkey", x: 2.4, z: -1.65 },
  { kind: "llama", x: 4.0, z: -1.6 },
  { kind: "cow", x: -3.2, z: 0.1 },
  { kind: "sheep", x: -1.1, z: 1.45 },
  { kind: "chicken", x: 1.65, z: 2.1 },
  { kind: "rowan", x: 0.45, z: -0.35 },
  { kind: "cat", x: 0.6, z: 0.7 },
].sort((a, b) => a.x + a.z - b.x - b.z);
for (const { kind, x, z } of cast) place(kind, x, z);

const lineup = document.querySelector("#lineup"),
  ctx = lineup.getContext("2d");
ctx.imageSmoothingEnabled = false;
let playing = true,
  pose = "idle",
  facing = 0,
  loaded = false,
  elapsed = 0,
  frame = 0;
function textureFor(kind) {
  const key = loaded && ANIMALS[kind]?.pack ? "loaded" : pose;
  return textures[kind]?.[key][facing][frame] || comparisons[kind];
}
function draw() {
  for (const member of animated)
    member.sprite.texture = textureFor(member.kind);
  ctx.fillStyle = "#30343a";
  ctx.fillRect(0, 0, 512, 112);
  ["rowan", "donkey", "llama", "cow", "sheep", "chicken", "cat"].forEach(
    (kind, i) => {
      const x = 4 + i * 72;
      ctx.fillStyle = "#657063";
      ctx.fillRect(x + 6, 62, 64, 1);
      ctx.drawImage(textureFor(kind).source.resource, x - 2, -10);
      ctx.fillStyle = "#e5dfcc";
      ctx.font = "10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(
        ANIMALS[kind]?.name || (kind === "rowan" ? "Rowan" : "Bramble"),
        x + 37,
        89,
      );
    },
  );
  app.render();
}
app.ticker.add(({ deltaMS }) => {
  if (!playing) return;
  elapsed += deltaMS;
  const next =
    Math.floor(elapsed / (pose === "walk" || loaded ? 135 : 330)) % 8;
  if (next !== frame) {
    frame = next;
    draw();
  }
});
document.querySelector("#play").addEventListener("click", (event) => {
  playing = !playing;
  event.currentTarget.textContent = playing ? "Pause motion" : "Play motion";
});
for (const button of document.querySelectorAll("[data-pose]"))
  button.addEventListener("click", () => {
    pose = button.dataset.pose;
    loaded = false;
    document.querySelector("#pack").checked = false;
    frame = elapsed = 0;
    for (const b of document.querySelectorAll("[data-pose]")) {
      b.setAttribute("aria-pressed", String(b === button));
      b.classList.toggle("btn-primary", b === button);
    }
    draw();
  });
document.querySelector("#turn").addEventListener("click", () => {
  facing = (facing + 1) % 4;
  document.querySelector("#facing").textContent = `${facing + 1} / 4`;
  draw();
});
document.querySelector("#pack").addEventListener("change", (event) => {
  loaded = event.target.checked;
  frame = elapsed = 0;
  draw();
});
draw();
document.querySelector("#loading").hidden = true;
window.__ANIMALS = {
  ready: true,
  textures,
  comparisons,
  get playing() {
    return playing;
  },
  get pose() {
    return pose;
  },
  get facing() {
    return facing;
  },
  get loaded() {
    return loaded;
  },
  get frame() {
    return frame;
  },
  native: { sprite: [80, 80], tile: [32, 16], pasture: [512, 256] },
};
