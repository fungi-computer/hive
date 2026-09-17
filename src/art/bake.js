import * as THREE from "three";
import { Texture } from "pixi.js";
import { registerVisibleTexture } from "../visual-hit-geometry.js";

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

// Scratch query output, not remembered size: every bake reads its actual renderer.
const bakeSize = new THREE.Vector2();
export function renderBakeCanvas(
  renderer,
  s,
  c,
  w,
  h,
  { ink = true, releaseGeometry = true } = {},
) {
  renderer.getSize(bakeSize);
  if (bakeSize.x !== w || bakeSize.y !== h) renderer.setSize(w, h, false);
  else renderer.setViewport(0, 0, w, h);
  renderer.render(s, c);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create a terrain bake canvas");
  ctx.drawImage(renderer.domElement, 0, 0);
  if (ink) outline(ctx, w, h);
  s.traverse((o) => {
    if (releaseGeometry && o.geometry) o.geometry.dispose();
  });
  return { canvas, context: ctx };
}

export function bake(
  renderer,
  s,
  c,
  w,
  h,
  ink = true,
  releaseGeometry = true,
  options = {},
) {
  const rendered = renderBakeCanvas(renderer, s, c, w, h, {
    ink,
    releaseGeometry,
  });
  const { canvas, context } = rendered;
  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  if (options.interactive !== false)
    registerVisibleTexture(
      texture,
      context.getImageData(0, 0, w, h).data,
      w,
      h,
    );
  return texture;
}
