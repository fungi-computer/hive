// Original Three geometry -> fixed low-resolution canvas textures -> Pixi.
// Reference pictures never enter this pipeline.
import * as THREE from "three";
import { Texture } from "pixi.js";
import { camera, worldCamera, WIDTH, HEIGHT } from "./art/scale.js";
import { clearing, tree } from "./art/clearing.js";
import { figure } from "./art/figures.js";
import { building, woodPile, wallJoint } from "./art/home.js";
import { BUILDINGS } from "./construction.js";

function outline(ctx, w, h) {
  const src = ctx.getImageData(0, 0, w, h),
    out = ctx.createImageData(w, h);
  out.data.set(src.data);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (src.data[i + 3] > 128) continue;
      if ([-1, 1, -w, w].some((d) => src.data[i + d * 4 + 3] > 128))
        out.data.set([43, 48, 38, 255], i);
    }
  ctx.putImageData(out, 0, 0);
}
export function bake(renderer, s, c, w, h, ink = true) {
  renderer.setSize(w, h, false);
  renderer.render(s, c);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(renderer.domElement, 0, 0);
  if (ink) outline(ctx, w, h);
  s.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  return texture;
}
export function anchor(c) {
  const foot = new THREE.Vector3(0, 0, 0).project(c);
  return { x: 0.5, y: (1 - foot.y) / 2 };
}
export async function bakeArt() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const portrait = camera(80, 80),
    prop = camera(112, 112, 1.1);
  const art = {
    ground: bake(renderer, clearing(), worldCamera, WIDTH, HEIGHT, false),
    figures: {},
    tree: {},
    buildings: {},
    wood: {},
    wallJoints: {},
    pawnAnchor: anchor(portrait),
    propAnchor: anchor(prop),
  };
  const workPoses = [
    "idle",
    "walk",
    "chop",
    "build",
    "carry",
    "pickup",
    "deliver",
    "sleep",
  ];
  for (const [kind, poses] of [
    ["rowan", workPoses],
    ["witch-runner", workPoses],
    ["cat", ["idle", "walk", "sleep"]],
    ["goblin", ["idle"]],
  ]) {
    const target = (art.figures[kind] = {});
    for (const pose of poses) {
      target[pose] = [];
      for (let direction = 0; direction < 4; direction++) {
        const count = ["idle", "sleep"].includes(pose) ? 1 : 8;
        target[pose].push(
          Array.from({ length: count }, (_, frame) =>
            bake(
              renderer,
              figure(kind, frame / count, (direction * Math.PI) / 2, pose),
              portrait,
              80,
              80,
            ),
          ),
        );
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  for (const stage of ["standing", "notched", "stump"])
    art.tree[stage] = bake(renderer, tree(stage), prop, 112, 112);
  for (const type of Object.keys(BUILDINGS)) {
    art.buildings[type] = {};
    for (const stage of ["stakes", "frame", "finished"])
      art.buildings[type][stage] = [0, 1].map((direction) =>
        bake(renderer, building(type, stage, direction), prop, 112, 112),
      );
  }
  for (const stage of ["stakes", "frame", "finished"])
    art.wallJoints[stage] = Array.from({ length: 16 }, (_, mask) =>
      bake(renderer, wallJoint(stage, mask || 5), prop, 112, 112),
    );
  for (let amount = 1; amount <= 6; amount++)
    art.wood[amount] = bake(renderer, woodPile(amount), prop, 112, 112);
  renderer.dispose();
  return art;
}
