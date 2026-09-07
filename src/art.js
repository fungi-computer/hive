// Original Three geometry -> fixed low-resolution canvas textures -> Pixi.
// Reference pictures never enter this pipeline.
import * as THREE from "three";
import { Texture } from "pixi.js";
import { camera, worldCamera } from "./art/geometry.js";
import { clearing, tree } from "./art/clearing.js";
import { shelter } from "./art/shelter.js";
import { outsider, goblin } from "./art/pawns.js";
export { project } from "./art/geometry.js";

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const art = {
    ground: bake(renderer, clearing(), worldCamera, 480, 320, false),
    pawn: {},
    tree: {},
  };
  const pawnCamera = camera(96, 96, 2.8, 0.65),
    treeCamera = camera(160, 160, 14 / 3, 1.35);
  art.pawnAnchor = anchor(pawnCamera);
  art.treeAnchor = anchor(treeCamera);
  renderer.shadowMap.enabled = false;
  for (const pose of ["idle", "walk", "chop", "build"]) {
    art.pawn[pose] = [];
    for (const dir of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const count = pose === "idle" ? 2 : 8;
      art.pawn[pose].push(
        Array.from({ length: count }, (_, f) =>
          bake(renderer, outsider(pose, f / count, dir), pawnCamera, 96, 96),
        ),
      );
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  art.goblin = [0, 0.5].map((phase) =>
    bake(renderer, goblin(phase), pawnCamera, 96, 96),
  );
  for (const stage of ["standing", "notched", "stump"])
    art.tree[stage] = bake(renderer, tree(stage), treeCamera, 160, 160);
  art.shelter = {};
  for (const stage of ["stakes", "frame", "finished"])
    art.shelter[stage] = bake(renderer, shelter(stage), treeCamera, 160, 160);
  renderer.dispose();
  return art;
}
