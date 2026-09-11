import * as THREE from "three";
import { Application, Sprite, Graphics } from "pixi.js";
import { anchor } from "./src/art.js";
import { bake } from "./src/art/bake.js";
import { camera } from "./src/art/scale.js";
import { figure } from "./src/art/figures.js";
import { DEMONS, demon, courtyard, chessTable } from "./devil-study-figures.js";

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const portrait = camera(80, 80),
  courtCamera = camera(480, 260, 0.65);
const textures = {};
for (const kind of Object.keys(DEMONS)) {
  textures[kind] = {};
  for (const pose of ["idle", "walk", "offer"]) {
    textures[kind][pose] = [];
    for (let facing = 0; facing < 4; facing++) {
      textures[kind][pose].push(
        Array.from({ length: 8 }, (_, frame) =>
          bake(
            renderer,
            demon(kind, frame / 8, (facing * Math.PI) / 2, pose),
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
const comparisons = {
  rowan: bake(renderer, figure("rowan", 0, 0, "idle"), portrait, 80, 80),
  cat: bake(renderer, figure("cat", 0, 0, "idle"), portrait, 80, 80),
};
const rowanBack = bake(
  renderer,
  figure("rowan", 0, Math.PI, "idle"),
  portrait,
  80,
  80,
);
const floor = bake(renderer, courtyard(), courtCamera, 480, 260, false);
const board = bake(renderer, chessTable(), portrait, 80, 80);
renderer.dispose();

const app = new Application();
await app.init({
  canvas: document.querySelector("#court"),
  width: 480,
  height: 260,
  resolution: 1,
  antialias: false,
  backgroundAlpha: 0,
  autoDensity: false,
});
app.stage.addChild(new Sprite(floor));
const animated = [];
const footAnchor = anchor(portrait);
function place(texture, x, z, shadow = true) {
  const point = new THREE.Vector3(x, 0, z).project(courtCamera);
  const sx = Math.round((point.x + 1) * 240),
    sy = Math.round((1 - point.y) * 130);
  if (shadow) {
    const mark = new Graphics()
      .ellipse(0, 0, 7, 2.5)
      .fill({ color: 0x28232d, alpha: 0.45 });
    mark.position.set(sx, sy);
    app.stage.addChild(mark);
  }
  const sprite = new Sprite(texture);
  sprite.anchor.set(footAnchor.x, footAnchor.y);
  sprite.position.set(sx, sy);
  app.stage.addChild(sprite);
  return sprite;
}
const cast = [
  { type: "devil", x: -0.4, z: -0.8, dir: 0 },
  { type: "imp", x: 1.2, z: -1.5, dir: 0 },
  { type: "porter", x: -2.0, z: 0.2, dir: 0 },
  { type: "board", x: 0, z: 0.35 },
  { type: "rowan", x: 0.5, z: 1.55 },
  { type: "cat", x: -0.6, z: 2.3 },
].sort((a, b) => a.x + a.z - b.x - b.z);
for (const member of cast) {
  const frames = textures[member.type]?.offer[member.dir];
  const texture =
    frames?.[0] ||
    { board, rowan: rowanBack, cat: comparisons.cat }[member.type];
  const sprite = place(texture, member.x, member.z, member.type !== "board");
  if (frames) animated.push({ sprite, frames });
}

const lineup = document.querySelector("#lineup"),
  ctx = lineup.getContext("2d");
ctx.imageSmoothingEnabled = false;
let playing = true,
  pose = "idle",
  facing = 0,
  elapsed = 0,
  frame = 0;
function drawLineup() {
  ctx.fillStyle = "#34323c";
  ctx.fillRect(0, 0, lineup.width, lineup.height);
  const kinds = ["rowan", "devil", "imp", "porter", "cat"];
  kinds.forEach((kind, index) => {
    const x = 8 + index * 96;
    ctx.fillStyle = "#403c47";
    ctx.fillRect(x, 7, 88, 106);
    ctx.fillStyle = "#716b70";
    ctx.fillRect(x + 13, 72, 62, 1);
    const texture = textures[kind]?.[pose][facing][frame] || comparisons[kind];
    ctx.drawImage(texture.source.resource, x + 4, 2);
    ctx.fillStyle = "#dfcda9";
    ctx.font = "10px Georgia";
    ctx.textAlign = "center";
    ctx.fillText(
      DEMONS[kind]?.name || (kind === "rowan" ? "Rowan" : "Bramble"),
      x + 44,
      96,
    );
  });
}
function draw() {
  for (const a of animated) a.sprite.texture = a.frames[frame];
  drawLineup();
  app.render();
}
draw();
app.ticker.add(({ deltaMS }) => {
  if (!playing) return;
  elapsed += deltaMS;
  const next = Math.floor(elapsed / (pose === "idle" ? 400 : 100)) % 8;
  if (next !== frame) {
    frame = next;
    draw();
  }
});
document.querySelector("#play").addEventListener("click", (event) => {
  playing = !playing;
  event.currentTarget.textContent = playing ? "Pause motion" : "Play motion";
});
for (const next of ["idle", "walk", "offer"])
  document.querySelector(`#pose-${next}`).addEventListener("click", () => {
    pose = next;
    elapsed = 0;
    frame = 0;
    for (const button of document.querySelectorAll("[data-pose]"))
      button.setAttribute("aria-pressed", String(button.dataset.pose === next));
    draw();
  });
document.querySelector("#turn").addEventListener("click", () => {
  facing = (facing + 1) % 4;
  document.querySelector("#facing").textContent = `${facing + 1} / 4`;
  draw();
});
document.querySelector("#loading").hidden = true;
window.__DEVILS = {
  ready: true,
  textures,
  get playing() {
    return playing;
  },
  get frame() {
    return frame;
  },
  get pose() {
    return pose;
  },
  get facing() {
    return facing;
  },
  native: { sprite: [80, 80], tile: [32, 16], court: [480, 260] },
};
