import * as THREE from "three";
import { Texture } from "pixi.js";
import { registerVisibleTexture } from "../visual-hit-geometry.js";

import { outlineBakedPixels } from "./baked-depth.js";
import { validateDepthBake, renderBakedDepth } from "./baked-depth-render.js";

// Optional depth export shares the exact authored scene, camera and outline.
// Default callers keep the existing { canvas, context } result.
export function renderBakeCanvas(
  renderer, s, c, w, h,
  { ink = true, releaseGeometry = true, depth = false } = {},
) {
  if (depth) validateDepthBake(renderer, s, c);
  const size = renderer.getSize(new THREE.Vector2());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  try {
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderer.render(s, c);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create an art bake canvas");
    ctx.drawImage(renderer.domElement, 0, 0);
    const pixels = (ink || depth) ? ctx.getImageData(0, 0, w, h) : null;
    const bakedDepth = depth ? renderBakedDepth(renderer, s, c, w, h, pixels.data) : null;
    if (ink) {
      pixels.data.set(outlineBakedPixels(pixels.data, w, h, bakedDepth));
      ctx.putImageData(pixels, 0, 0);
    }
    return depth ? { canvas, context: ctx, depth: bakedDepth } : { canvas, context: ctx };
  } finally {
    // Preserve the existing bake contract: the renderer retains the requested
    // frame size so atlas loops do not resize twice for every frame.
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    if (releaseGeometry) {
      const geometries = new Set();
      s.traverse(o => { if (o.geometry) geometries.add(o.geometry); });
      for (const geometry of geometries) geometry.dispose();
    }
  }
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
