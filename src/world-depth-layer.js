import { Container } from "pixi.js";
import { decodeDepth24 } from "./art/depth-image.js";

/**
 * The opaque world is submitted as a small, bounded list of already projected
 * frames. This module owns the CPU counterpart of the depth pass; it never
 * creates simulation objects or advances a clock.
 */

const DEFAULT_ROLE_ORDER = Object.freeze({
  terrain: 0,
  floor: 1,
  structure: 2,
  actor: 3,
  item: 4,
});

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`world-depth-invalid-${label}`);
  return value;
}

function roleRank(item, roleOrder) {
  return roleOrder[item.physicalRole ?? item.role] ?? 100;
}

/** Stable submission tie policy for exactly coplanar quantized pixels. */
export function compareWorldDepthItems(left, right, roleOrder = DEFAULT_ROLE_ORDER) {
  const role = roleRank(left, roleOrder) - roleRank(right, roleOrder);
  if (role) return role;
  const entity = String(left.entityId).localeCompare(String(right.entityId));
  if (entity) return entity;
  return String(left.visualPartId ?? "").localeCompare(String(right.visualPartId ?? ""));
}

/** Return one finite metric interval shared by every visible opaque item. */
export function worldDepthBounds(items, towardCamera, margin = 1e-4) {
  if (!Array.isArray(towardCamera) || towardCamera.length !== 3)
    throw new Error("world-depth-invalid-camera-basis");
  const length = Math.hypot(...towardCamera);
  if (!(length > 0) || !Number.isFinite(length))
    throw new Error("world-depth-invalid-camera-basis");
  if (!Number.isFinite(margin) || margin < 0 || margin >= 0.5)
    throw new Error("world-depth-invalid-margin");
  const basis = towardCamera.map((value) => value / length);
  let near = -Infinity;
  let far = Infinity;
  for (const item of items) {
    if (!item.visible) continue;
    const origin = item.worldOrigin ?? [0, 0, 0];
    const dot = origin[0] * basis[0] + origin[1] * basis[1] + origin[2] * basis[2];
    const range = item.depthRange ?? item.localDepthRange;
    if (!range || range.length !== 2 || !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[1] < range[0])
      throw new Error("world-depth-missing-range");
    near = Math.max(near, dot + finite(range[1], "range"));
    far = Math.min(far, dot + finite(range[0], "range"));
  }
  if (!Number.isFinite(near) || !Number.isFinite(far)) return null;
  const span = Math.max(Math.abs(near - far), 1);
  return Object.freeze({ nearDepth: near + span * margin, farDepth: far - span * margin, basis });
}

function framePixel(item, x, y) {
  const frame = item.depthFrame?.frame ?? item.depthFrame;
  if (!frame) return null;
  const transform = item.screenTransform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const anchor = item.anchor ?? { x: 0, y: 0 };
  const sx = transform.scaleX ?? transform.scale ?? 1;
  const sy = transform.scaleY ?? transform.scale ?? 1;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx === 0 || sy === 0) return null;
  const localX = (x - (transform.x ?? item.screenX ?? 0)) / sx + anchor.x * frame.width;
  const localY = (y - (transform.y ?? item.screenY ?? 0)) / sy + anchor.y * frame.height;
  const px = Math.floor(localX), py = Math.floor(localY);
  if (px < 0 || py < 0 || px >= frame.width || py >= frame.height) return null;
  return { px, py, atlasX: frame.x + px, atlasY: frame.y + py };
}

function itemDepth(item, pixel, basis) {
  const depth = item.depthFrame;
  const pixels = depth?.pixels;
  const width = depth?.atlasWidth ?? depth?.width;
  if (!pixels || !Number.isSafeInteger(width)) return null;
  const offset = (pixel.atlasY * width + pixel.atlasX) * 4;
  if (offset < 0 || offset + 3 >= pixels.length || pixels[offset + 3] === 0) return null;
  const encoded = decodeDepth24(pixels, offset);
  const range = depth.depthRange ?? item.depthRange;
  if (!range || range.length !== 2) return null;
  const origin = item.worldOrigin ?? [0, 0, 0];
  return origin[0] * basis[0] + origin[1] * basis[1] + origin[2] * basis[2] + range[0] + encoded * (range[1] - range[0]);
}

/** Pick the nearest opaque surface, retaining occlusion from nonpickable art. */
export function pickWorldDepth(items, point, basis, bounds = null, roleOrder = DEFAULT_ROLE_ORDER) {
  const ordered = [];
  for (const item of items) {
    if (!item.visible) continue;
    const pixel = framePixel(item, point.x, point.y);
    if (!pixel) continue;
    const depth = itemDepth(item, pixel, basis);
    if (depth !== null) ordered.push({ item, depth });
  }
  ordered.sort((a, b) => {
    const distance = b.depth - a.depth;
    return Math.abs(distance) > 1e-12 ? distance : compareWorldDepthItems(a.item, b.item, roleOrder);
  });
  const winner = ordered[0];
  if (!winner) return null;
  return { ...winner, target: winner.item.pickable ? winner.item.entityId : null };
}

function vertexShader() {
  return `in vec2 aPosition; in vec2 aUV; out vec2 vUV; void main(){vUV=aUV;gl_Position=vec4(aPosition,0.0,1.0);}`;
}

function fragmentShader() {
  return `in vec2 vUV; uniform sampler2D uColor; uniform sampler2D uDepth; uniform vec2 uDepthRange; uniform vec2 uWorldRange; out vec4 finalColor; void main(){vec4 color=texture(uColor,vUV);if(color.a==0.0)discard;vec4 packed=texture(uDepth,vUV);float encoded=packed.r+packed.g/256.0+packed.b/65536.0;float worldDepth=uWorldRange.x+mix(uDepthRange.x,uDepthRange.y,encoded);gl_FragDepth=(uWorldRange.x-worldDepth)/(uWorldRange.x-uWorldRange.y);finalColor=color;}`;
}

/** Public-Pixi owner. Mesh construction is deliberately injectable for headless proofs. */
export function createWorldDepthLayer({ parent = null, renderer = null, roleOrder = DEFAULT_ROLE_ORDER } = {}) {
  const container = new Container();
  container.label = "opaque-world-depth";
  container.sortableChildren = false;
  const meshes = new Map();
  let items = [], disposed = false;
  let sharedBounds = null;
  function setItems(next, towardCamera) {
    if (disposed) throw new Error("world-depth-disposed");
    items = next.filter((item) => item.visible);
    sharedBounds = worldDepthBounds(items, towardCamera);
    return sharedBounds;
  }
  function pick(point, towardCamera) {
    const activeBounds = sharedBounds ?? worldDepthBounds(items, towardCamera);
    return pickWorldDepth(items, point, activeBounds.basis, activeBounds, roleOrder);
  }
  function resize(width, height) { if (renderer?.resize) renderer.resize(width, height); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of meshes.values()) mesh.destroy({ children: true });
    meshes.clear();
    container.destroy({ children: true });
  }
  if (parent) parent.addChild(container);
  return Object.freeze({ container, setItems, pick, resize, dispose, items: () => items.slice(), meshes });
}

export { DEFAULT_ROLE_ORDER };
