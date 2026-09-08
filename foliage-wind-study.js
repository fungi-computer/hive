import * as THREE from "three";
import { Application, Container, Rectangle, Sprite, Text } from "pixi.js";
import { anchor, bake } from "./src/art.js";
import {
  camera,
  HEIGHT,
  project,
  WIDTH,
  worldCamera,
} from "./src/art/scale.js";
import { clearing, tree } from "./src/art/clearing.js";
import { visibleHitAreaFor } from "./src/visual-hit-geometry.js";
import { TREE_CELLS } from "./src/world.js";
import { grassClump, windTree } from "./foliage-wind-study-wind.js";

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
  width: 1000,
  height: 1030,
  resolution: 1,
  antialias: false,
  background: "#34433b",
});
document.querySelector("#stage").append(app.canvas);
const prop = camera(112, 112, 1.1),
  grassCamera = camera(32, 32, 0.25);
const propAnchor = anchor(prop),
  grassAnchor = anchor(grassCamera);
const textures = new Set(),
  motion = [],
  clickTargets = [];
const report = {
  ready: false,
  frames: 0,
  playing: true,
  phase: 0,
  lastPicked: null,
  rows: [],
  neutralParity: {},
  fixedWood: {},
  textureCount: 0,
  rgbaBytes: 0,
};
app.stage.eventMode = "static";
app.stage.hitArea = new Rectangle(0, 0, 1000, 1030);
app.stage.on("pointertap", () => {
  report.lastPicked = "background";
});
function label(text, x, y, size = 12) {
  const t = new Text({
    text,
    style: { fontFamily: "monospace", fontSize: size, fill: "#ecdfc5" },
  });
  t.position.set(x, y);
  app.stage.addChild(t);
}
function bakeOwned(s, c = prop, w = 112, h = 112, ink = true) {
  const materials = new Set();
  if (s.userData.ownedMaterials)
    s.traverse((o) => {
      if (o.isMesh) materials.add(o.material);
    });
  const texture = bake(renderer, s, c, w, h, ink);
  materials.forEach((material) => material.dispose());
  textures.add(texture);
  report.rgbaBytes += w * h * 4;
  return texture;
}
const pixels = (texture) =>
  texture.source.resource
    .getContext("2d")
    .getImageData(0, 0, texture.width, texture.height).data;
const hash = async (data) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
function bounds(texture) {
  const p = pixels(texture),
    w = texture.width,
    h = texture.height;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1,
    count = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (p[(y * w + x) * 4 + 3]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        count++;
      }
  return {
    minX,
    minY,
    maxX,
    maxY,
    count,
    clipped: minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1,
  };
}
function woodSignature(s) {
  s.updateMatrixWorld(true);
  const records = [];
  for (const child of s.children) {
    if (child.name === "wind-canopy" || child.isGroup) continue;
    child.traverse((o) => {
      if (o.isMesh)
        records.push({
          matrix: o.matrixWorld.elements,
          position: Array.from(o.geometry.attributes.position.array),
        });
    });
  }
  return JSON.stringify(records);
}
function sprite(texture, parent, x, y, scale, anchorPoint, id = null) {
  const s = new Sprite(texture);
  s.anchor.set(anchorPoint.x, anchorPoint.y);
  s.position.set(x, y);
  s.scale.set(scale);
  parent.addChild(s);
  s.eventMode = id ? "static" : "none";
  if (id) {
    s.hitArea = visibleHitAreaFor(texture, anchorPoint);
    s.cursor = "pointer";
    s.on("pointertap", (event) => {
      event.stopPropagation();
      report.lastPicked = id;
    });
  }
  return s;
}
function animated(
  bank,
  x,
  y,
  scale,
  anchorPoint,
  id,
  offset = 0,
  parent = app.stage,
) {
  const s = sprite(bank[0], parent, x, y, scale, anchorPoint, id);
  motion.push({ sprite: s, bank, anchor: anchorPoint, id, offset });
  return s;
}
const treeBank = {};
for (const [column, stage] of ["standing", "notched", "stump"].entries()) {
  const bank = [];
  let signature;
  for (let frame = 0; frame < (stage === "stump" ? 1 : 8); frame++) {
    const s = windTree(stage, frame / 8),
      current = woodSignature(s);
    signature ??= current;
    if (current !== signature) throw new Error(`Wind moved wood: ${stage}`);
    bank.push(bakeOwned(s));
  }
  treeBank[stage] = bank;
  const neutral = bakeOwned(tree(stage));
  report.neutralParity[stage] =
    (await hash(pixels(bank[0]))) === (await hash(pixels(neutral)));
  report.fixedWood[stage] = true;
  report.rows.push({
    id: stage,
    hashes: await Promise.all(bank.map((t) => hash(pixels(t)))),
    bounds: bank.map(bounds),
  });
  label(`${stage} · desktop 2× / native 1×`, 15 + column * 330, 20);
  const large = animated(
    bank,
    105 + column * 330,
    200,
    2,
    propAnchor,
    `tree-${stage}`,
  );
  animated(bank, 240 + column * 330, 200, 1, propAnchor, `native-${stage}`);
  clickTargets.push({ sprite: large, id: `tree-${stage}`, anchor: propAnchor });
}
label("Eight canopy poses · native 1× · same roots, trunk and camera", 15, 243);
for (let frame = 0; frame < 8; frame++) {
  sprite(
    treeBank.standing[frame],
    app.stage,
    70 + frame * 120,
    365,
    1,
    propAnchor,
  );
  label(String(frame + 1), 64 + frame * 120, 376);
}
const grassBank = [];
// Grass sits in the painterly, unoutlined ground family rather than acquiring
// an opaque dark border around every blade at this tiny scale.
for (let frame = 0; frame < 8; frame++)
  grassBank.push(bakeOwned(grassClump(frame / 8), grassCamera, 32, 32, false));
report.rows.push({
  id: "grass",
  hashes: await Promise.all(grassBank.map((t) => hash(pixels(t)))),
  bounds: grassBank.map(bounds),
});
label("Grass poses · 1× and 2× · roots stay planted", 15, 411);
for (let frame = 0; frame < 8; frame++) {
  sprite(grassBank[frame], app.stage, 49 + frame * 120, 490, 1, grassAnchor);
  sprite(grassBank[frame], app.stage, 88 + frame * 120, 490, 2, grassAnchor);
}
label(
  "Live grove · original clearing at native 1× · shared poses, staggered timing",
  15,
  538,
);
const grove = new Container();
grove.position.set(15, 585);
grove.sortableChildren = true;
app.stage.addChild(grove);
const ground = bakeOwned(clearing(), worldCamera, WIDTH, HEIGHT, false);
const groundSprite = new Sprite(ground);
groundSprite.zIndex = -1000;
groundSprite.eventMode = "none";
grove.addChild(groundSprite);
const grassCells = [
  [2, 3],
  [3, 2],
  [4, 2],
  [10, 1],
  [11, 2],
  [12, 3],
  [2, 8],
  [2, 10],
  [3, 11],
  [10, 11],
  [11, 12],
  [12, 11],
  [6, 11],
  [7, 12],
  [9, 2],
  [1, 8],
  [12, 7],
  [10, 12],
];
TREE_CELLS.forEach(([x, z], index) => {
  const at = project(x, z),
    s = animated(
      treeBank.standing,
      at.x,
      at.y,
      1,
      propAnchor,
      `grove-${index}`,
      index,
      grove,
    );
  s.zIndex = (x + z) * 10 + 2;
});
grassCells.forEach(([x, z], index) => {
  const at = project(x + 0.14 * ((index % 3) - 1), z + 0.11 * (index % 2)),
    s = animated(grassBank, at.x, at.y, 1, grassAnchor, null, index * 3, grove);
  s.zIndex = (x + z) * 10;
});
label(
  "Subtle canopy drift.\nSoft grass tips.\nNo moving roots.\n\nFinite texture bank.\nNo live mesh baking.\nNo world ticks.",
  710,
  667,
  14,
);
let elapsed = 0,
  lastFrame = -1;
function setFrame(frame) {
  report.phase = frame;
  for (const item of motion) {
    const texture = item.bank[(frame + item.offset) % item.bank.length];
    item.sprite.texture = texture;
    if (item.id) item.sprite.hitArea = visibleHitAreaFor(texture, item.anchor);
  }
  document.querySelector("#phase").textContent =
    `Pose ${frame + 1}/8 · 4 second breeze`;
}
app.ticker.add((tick) => {
  if (!report.playing) return;
  elapsed += tick.deltaMS;
  const frame = Math.floor((elapsed % 4000) / 500);
  if (frame === lastFrame) return;
  lastFrame = frame;
  report.frames++;
  setFrame(frame);
});
document.querySelector("#pause").onclick = () => {
  report.playing = !report.playing;
  document.querySelector("#pause").textContent = report.playing
    ? "Pause motion"
    : "Resume motion";
};
setFrame(0);
renderer.dispose();
app.render();
report.textureCount = textures.size;
report.ready = true;
let disposed = false;
function dispose() {
  if (disposed) return;
  disposed = true;
  app.destroy(true, { children: true });
  textures.forEach((t) => t.destroy(true));
  textures.clear();
  motion.length = 0;
  clickTargets.length = 0;
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) dispose();
});
function points() {
  return clickTargets.map((item) => {
    const { sprite: s, anchor: a, id } = item,
      p = pixels(s.texture),
      w = s.texture.width,
      h = s.texture.height;
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const at = (y * w + x) * 4;
        if (
          p[at + 3] !== 255 ||
          [-w * 4, -4, 4, w * 4].some((d) => p[at + d + 3] !== 255)
        )
          continue;
        const global = s.toGlobal({
          x: x + 0.5 - a.x * w,
          y: y + 0.5 - a.y * h,
        });
        return { id, body: { x: global.x, y: global.y } };
      }
    return { id, body: null };
  });
}
function transparentPoint() {
  const { sprite: s, anchor: a } = clickTargets[0],
    w = s.texture.width;
  if (pixels(s.texture)[(2 * w + w - 2) * 4 + 3] !== 0)
    throw new Error("Expected transparent tree corner");
  const p = s.toGlobal({
    x: w - 1.5 - a.x * w,
    y: 2.5 - a.y * s.texture.height,
  });
  return { x: p.x, y: p.y };
}
window.__WIND = {
  report,
  dispose,
  points,
  transparentPoint,
  setFrame(frame) {
    setFrame(frame);
    app.render();
  },
  capture() {
    app.render();
    return app.canvas.toDataURL();
  },
};
