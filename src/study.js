import * as THREE from "three";
import { Application, Sprite, Graphics } from "pixi.js";
import { bake, anchor } from "./art.js";
import { scene, box, cylinder } from "./art/geometry.js";
import { figure } from "./art/figures.js";
import "./study.css";

// One world unit projects to a 32 × 16 ground diamond. With this orthographic
// camera a vertical world unit projects to ~19.6 px. Canvas padding has no role
// in world scale. The gameplay camera is unchanged while this study is reviewed.
const PIXELS_PER_UNIT = 16 * Math.SQRT2;
const KINDS = ["rowan", "knight", "wizard", "goblin", "cat"];
const FRAME_WIDTH = 48,
  FRAME_HEIGHT = 64;
const imageUrls = new WeakMap();
function camera(width, height, targetY) {
  const c = new THREE.OrthographicCamera(
    -width / PIXELS_PER_UNIT / 2,
    width / PIXELS_PER_UNIT / 2,
    height / PIXELS_PER_UNIT / 2,
    -height / PIXELS_PER_UNIT / 2,
    0.1,
    80,
  );
  c.position.set(12, Math.sqrt(288) * Math.tan(Math.PI / 6) + targetY, 12);
  c.lookAt(0, targetY, 0);
  c.updateMatrixWorld();
  return c;
}
function plinth() {
  const s = scene();
  for (let x = -1; x <= 1; x++)
    for (let z = -1; z <= 1; z++) {
      box(s, (x + z) % 2 ? "#756f51" : "#807658", x, -0.1, z, 0.97, 0.18, 0.97);
    }
  // Original sparse tufts; no reference tile pixels are used.
  for (let i = 0; i < 7; i++) {
    const x = Math.sin(i * 3.1) * 1.28,
      z = Math.cos(i * 2.6) * 1.27;
    cylinder(s, i % 2 ? "#858c52" : "#677642", x, 0.045, z, 0, 0.055, 0.18, 3);
  }
  return s;
}
function doorway() {
  const s = scene();
  for (const side of [-1, 1]) {
    box(s, "#695342", side * 0.58, 1.13, -0.38, 0.2, 2.26, 0.22);
    box(s, "#a48a5d", side * 0.57, 1.11, -0.245, 0.065, 2.2, 0.035);
  }
  box(s, "#816749", 0, 2.25, -0.38, 1.42, 0.18, 0.25);
  box(s, "#b09a6f", 0, 2.355, -0.38, 1.5, 0.065, 0.3);
  return s;
}
function pixels(texture) {
  return texture.source.resource;
}
function imageUrl(texture) {
  if (!imageUrls.has(texture))
    imageUrls.set(texture, pixels(texture).toDataURL("image/png"));
  return imageUrls.get(texture);
}
function bounds(canvas) {
  const data = canvas
    .getContext("2d")
    .getImageData(0, 0, canvas.width, canvas.height).data;
  const box = { left: canvas.width, top: canvas.height, right: -1, bottom: -1 };
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++)
      if (data[(y * canvas.width + x) * 4 + 3]) {
        box.left = Math.min(box.left, x);
        box.right = Math.max(box.right, x);
        box.top = Math.min(box.top, y);
        box.bottom = Math.max(box.bottom, y);
      }
  return {
    ...box,
    width: box.right - box.left + 1,
    height: box.bottom - box.top + 1,
  };
}
async function studyArt() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const portrait = camera(FRAME_WIDTH, FRAME_HEIGHT, 1.03);
  const prop = camera(128, 128, 0.8);
  const art = {
    anchor: anchor(portrait),
    propAnchor: anchor(prop),
    figures: {},
    metrics: {},
  };
  art.plinth = bake(renderer, plinth(), prop, 128, 128);
  art.door = bake(renderer, doorway(), prop, 128, 128);
  for (const kind of KINDS) {
    art.figures[kind] = { idle: [], walk: [] };
    art.metrics[kind] = [];
    for (let direction = 0; direction < 4; direction++) {
      for (const pose of ["idle", "walk"]) {
        const frames = [];
        for (let frame = 0; frame < (pose === "walk" ? 8 : 1); frame++) {
          const texture = bake(
            renderer,
            figure(kind, frame / 8, (direction * Math.PI) / 2, pose),
            portrait,
            FRAME_WIDTH,
            FRAME_HEIGHT,
          );
          frames.push(texture);
          art.metrics[kind].push({
            pose,
            direction,
            frame,
            ...bounds(pixels(texture)),
          });
        }
        art.figures[kind][pose].push(frames);
      }
    }
    await new Promise(requestAnimationFrame);
  }
  renderer.dispose();
  return art;
}
function sprite(texture, at, origin) {
  const s = new Sprite(texture);
  s.anchor.set(origin.x, origin.y);
  s.position.set(...at);
  return s;
}
async function start() {
  const art = await studyArt();
  const app = new Application();
  await app.init({
    width: 640,
    height: 140,
    background: 0x23352d,
    antialias: false,
    resolution: 1,
    preference: "webgl",
  });
  document.querySelector("#loading").remove();
  document.querySelector("#stage").append(app.canvas);
  app.canvas.setAttribute(
    "aria-label",
    "Five original figures standing on tiled plinths, with a timber doorway behind Rowan and a small cat at the end.",
  );
  const figures = [],
    detailImages = [];
  KINDS.forEach((kind, i) => {
    const at = [64 + 128 * i, 95];
    app.stage.addChild(sprite(art.plinth, at, art.propAnchor));
    if (!i) app.stage.addChild(sprite(art.door, at, art.propAnchor));
    const shadow = new Graphics()
      .ellipse(at[0], at[1], kind === "wizard" ? 8 : 5, 2.5)
      .fill({ color: 0x293329, alpha: 0.4 });
    app.stage.addChild(shadow);
    const actor = sprite(art.figures[kind].walk[0][0], at, art.anchor);
    figures.push(actor);
    app.stage.addChild(actor);
    const card = document.createElement("div");
    card.className = "detail";
    const img = new Image();
    img.alt = `${kind}, enlarged original sprite`;
    img.width = FRAME_WIDTH;
    img.height = FRAME_HEIGHT;
    const caption = document.createElement("p");
    caption.textContent = "Enlarged · same pixels";
    card.append(img, caption);
    document.querySelector(".details").append(card);
    detailImages.push(img);
  });
  let direction = 0,
    pose = "walk",
    playing = true,
    elapsed = 0,
    previous = "";
  function render() {
    const frame = pose === "walk" ? Math.floor(elapsed / 125) % 8 : 0;
    const key = `${direction},${pose},${frame}`;
    if (key === previous) return;
    previous = key;
    KINDS.forEach((kind, i) => {
      const texture = art.figures[kind][pose][direction][frame];
      figures[i].texture = texture;
      detailImages[i].src = imageUrl(texture);
    });
  }
  document.querySelectorAll("[data-pose]").forEach((button) => {
    button.onclick = () => {
      pose = button.dataset.pose;
      elapsed = 0;
      document
        .querySelectorAll("[data-pose]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      render();
    };
  });
  document.querySelector("#play").onclick = (event) => {
    playing = !playing;
    event.currentTarget.textContent = playing ? "Pause" : "Play";
    event.currentTarget.setAttribute("aria-pressed", String(playing));
  };
  document.querySelector("#turn").onclick = () => {
    direction = (direction + 1) % 4;
    render();
  };
  document.querySelector("#zoom").onclick = (event) => {
    const native = document
      .querySelector("#scene-content")
      .classList.toggle("native");
    event.currentTarget.textContent = native ? "Fit view" : "Native pixels";
  };
  app.ticker.maxFPS = 30;
  app.ticker.add((ticker) => {
    if (playing) elapsed += Math.min(ticker.deltaMS, 100);
    render();
  });
  render();
  window.__STUDY = {
    ready: true,
    metrics: art.metrics,
    get state() {
      return {
        direction,
        pose,
        playing,
        frame: pose === "walk" ? Math.floor(elapsed / 125) % 8 : 0,
      };
    },
  };
}
start().catch((error) => {
  console.error(error);
  const loading = document.querySelector("#loading");
  if (loading)
    loading.textContent = "The study could not open. Reload to try again.";
});
