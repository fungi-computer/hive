import * as THREE from "three";
import { Texture } from "pixi.js";
import { registerVisibleTexture } from "../visual-hit-geometry.js";
import { makeLinearDepthImage } from "./depth-image.js";

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

function projectedDepthRange(scene, towardCamera) {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene, true);
  if (bounds.isEmpty()) throw new Error("Cannot bake depth for empty geometry");
  let min = Infinity;
  let max = -Infinity;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const depth = towardCamera.dot(new THREE.Vector3(x, y, z));
        min = Math.min(min, depth);
        max = Math.max(max, depth);
      }
  if (max - min < 1e-8) {
    min -= 0.5;
    max += 0.5;
  }
  return { min, max };
}

/** First-class matching color/depth bake for opaque world art. Depth pixels
 * contain linear 24-bit local camera-facing depth and alpha coverage. */
export function renderBakePairCanvas(
  renderer,
  scene,
  camera,
  width,
  height,
  { ink = true, releaseGeometry = true } = {},
) {
  renderer.getSize(bakeSize);
  if (bakeSize.x !== width || bakeSize.y !== height)
    renderer.setSize(width, height, false);
  else renderer.setViewport(0, 0, width, height);

  const colorCanvas = document.createElement("canvas");
  colorCanvas.width = width;
  colorCanvas.height = height;
  const colorContext = colorCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!colorContext) throw new Error("Unable to create a color bake canvas");
  renderer.render(scene, camera);
  colorContext.drawImage(renderer.domElement, 0, 0);
  const sourceColor = colorContext.getImageData(0, 0, width, height);
  if (ink) outline(colorContext, width, height);
  const finalColor = colorContext.getImageData(0, 0, width, height);

  const depthCanvas = document.createElement("canvas");
  depthCanvas.width = width;
  depthCanvas.height = height;
  const depthContext = depthCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!depthContext) throw new Error("Unable to create a depth bake canvas");
  const priorOverride = scene.overrideMaterial;
  const priorClearColor = renderer.getClearColor(new THREE.Color());
  const priorClearAlpha = renderer.getClearAlpha();
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
    blending: THREE.NoBlending,
  });
  let packedDepth;
  try {
    renderer.setClearColor(0, 0);
    scene.overrideMaterial = depthMaterial;
    renderer.render(scene, camera);
    depthContext.drawImage(renderer.domElement, 0, 0);
    packedDepth = depthContext.getImageData(0, 0, width, height);
  } finally {
    scene.overrideMaterial = priorOverride;
    renderer.setClearColor(priorClearColor, priorClearAlpha);
    depthMaterial.dispose();
  }

  const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
  const towardCamera = cameraDirection.multiplyScalar(-1).normalize();
  const range = projectedDepthRange(scene, towardCamera);
  const bounds = new THREE.Box3().setFromObject(scene, true);
  const linear = makeLinearDepthImage({
    sourceColor: sourceColor.data,
    finalColor: finalColor.data,
    packedDepth: packedDepth.data,
    width,
    height,
    cameraNear: camera.near,
    cameraFar: camera.far,
    cameraDepth: camera.position.dot(towardCamera),
    minDepth: range.min,
    maxDepth: range.max,
  });
  const image = depthContext.createImageData(width, height);
  image.data.set(linear);
  depthContext.putImageData(image, 0, 0);

  if (releaseGeometry) scene.traverse((object) => object.geometry?.dispose());
  return {
    colorCanvas,
    depthCanvas,
    depthPixels: linear,
    depthRange: Object.freeze(range),
    visualBounds: Object.freeze({
      minX: bounds.min.x,
      minY: bounds.min.y,
      minZ: bounds.min.z,
      maxX: bounds.max.x,
      maxY: bounds.max.y,
      maxZ: bounds.max.z,
    }),
    towardCamera: Object.freeze({
      x: towardCamera.x,
      y: towardCamera.y,
      z: towardCamera.z,
    }),
  };
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
