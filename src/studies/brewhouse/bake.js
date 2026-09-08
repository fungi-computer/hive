import * as THREE from "three";
import { Texture } from "pixi.js";
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
export function bakeCanvas(renderer, s, c, w, h, ink = true) {
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
  return canvas;
}
export function bake(renderer, s, c, w, h, ink = true) {
  const texture = Texture.from(bakeCanvas(renderer, s, c, w, h, ink));
  texture.source.scaleMode = "nearest";
  return texture;
}
export function anchor(c) {
  const foot = new THREE.Vector3(0, 0, 0).project(c);
  return { x: 0.5, y: (1 - foot.y) / 2 };
}
