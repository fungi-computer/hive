import { Container, Mesh, MeshGeometry, RenderTarget, RenderTexture, Shader, State } from "pixi.js";
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
    const range = item.depthRange ?? item.depthFrame?.depthRange ?? item.localDepthRange;
    const min = range?.min ?? range?.[0], max = range?.max ?? range?.[1];
    if (!range || !Number.isFinite(min) || !Number.isFinite(max) || max < min)
      throw new Error("world-depth-missing-range");
    near = Math.max(near, dot + finite(max, "range"));
    far = Math.min(far, dot + finite(min, "range"));
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
  const min = range?.min ?? range?.[0];
  const max = range?.max ?? range?.[1];
  if (!range || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  const origin = item.worldOrigin ?? [0, 0, 0];
  return origin[0] * basis[0] + origin[1] * basis[1] + origin[2] * basis[2] + min + encoded * (max - min);
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

const vertex = `#version 300 es
in vec2 aPosition; in vec2 aUV; out vec2 vUV; out vec4 vColor;
uniform mat3 uProjectionMatrix; uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix; uniform vec4 uWorldColorAlpha; uniform vec4 uColor;
void main(){vUV=aUV;vColor=uWorldColorAlpha*uColor;
gl_Position=vec4((uProjectionMatrix*uWorldTransformMatrix*uTransformMatrix*vec3(aPosition,1.0)).xy,0.0,1.0);}`;

const fragment = `#version 300 es
in vec2 vUV; in vec4 vColor; out vec4 finalColor;
uniform sampler2D uColorTexture; uniform sampler2D uDepthTexture;
uniform float uOriginDepth; uniform float uLocalMin; uniform float uLocalMax;
uniform float uNearDepth; uniform float uFarDepth;
float decodeDepth24(vec3 encoded){return dot(encoded,vec3(65536.0,256.0,1.0))/65793.0;}
void main(){vec4 color=texture(uColorTexture,vUV);if(color.a<=0.5)discard;
float localDepth=mix(uLocalMin,uLocalMax,decodeDepth24(texture(uDepthTexture,vUV).rgb));
float worldDepth=uOriginDepth+localDepth;
gl_FragDepth=(uNearDepth-worldDepth)/(uNearDepth-uFarDepth);finalColor=color*vColor;}`;

/** Public-Pixi owner. Mesh construction is deliberately injectable for headless proofs. */
export function createWorldDepthLayer({ parent = null, renderer = null, roleOrder = DEFAULT_ROLE_ORDER } = {}) {
  const container = new Container();
  container.label = "opaque-world-depth";
  container.sortableChildren = false;
  const meshes = new Map();
  let items = [], disposed = false, target = null, targetSize = null;
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
  function resize(width, height) {
    if (targetSize?.width === width && targetSize.height === height) return;
    target?.destroy(true);
    const color = RenderTexture.create({ width, height, resolution: 1 });
    target = new RenderTarget({ width, height, colorTextures: [color], depth: true });
    targetSize = { width, height };
  }
  function render({ width, height, towardCamera, clearColor = [0, 0, 0, 0] } = {}) {
    if (!renderer) throw new Error("world-depth-renderer-required");
    resize(width, height);
    const bounds = sharedBounds ?? worldDepthBounds(items, towardCamera);
    const layer = new Container();
    for (const item of items) {
      const color = item.colorFrame;
      const depth = item.depthFrame;
      const frame = color?.frame ?? color;
      const depthRange = depth.depthRange ?? item.depthRange;
      const min = depthRange.min ?? depthRange[0];
      const max = depthRange.max ?? depthRange[1];
      const geometry = new MeshGeometry({
        positions: new Float32Array([-(item.anchor?.x ?? 0) * frame.width, -(item.anchor?.y ?? 0) * frame.height, frame.width * (1 - (item.anchor?.x ?? 0)), -(item.anchor?.y ?? 0) * frame.height, frame.width * (1 - (item.anchor?.x ?? 0)), frame.height * (1 - (item.anchor?.y ?? 0)), -(item.anchor?.x ?? 0) * frame.width, frame.height * (1 - (item.anchor?.y ?? 0))]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      });
      geometry.batchMode = "no-batch";
      const origin = item.worldOrigin ?? { x: 0, y: 0, z: 0 };
      const originDepth = Array.isArray(origin) ? origin[0] * bounds.basis[0] + origin[1] * bounds.basis[1] + origin[2] * bounds.basis[2] : origin.x * bounds.basis[0] + origin.y * bounds.basis[1] + origin.z * bounds.basis[2];
      const shader = Shader.from({ gl: { name: "hive-world-depth", vertex, fragment }, resources: { uColorTexture: color.source, uDepthTexture: depth.texture.source, depthUniforms: { uOriginDepth: { value: originDepth, type: "f32" }, uLocalMin: { value: min, type: "f32" }, uLocalMax: { value: max, type: "f32" }, uNearDepth: { value: bounds.nearDepth, type: "f32" }, uFarDepth: { value: bounds.farDepth, type: "f32" } } } });
      const state = State.for2d(); state.blend = false; state.depthTest = true; state.depthMask = true;
      const mesh = new Mesh({ geometry, shader, state });
      const transform = item.screenTransform ?? {};
      mesh.position.set(transform.x ?? 0, transform.y ?? 0);
      layer.addChild(mesh);
    }
    renderer.render({ target, container: layer, clear: true, clearColor });
    layer.destroy({ children: true });
    return target;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const mesh of meshes.values()) mesh.destroy({ children: true });
    meshes.clear();
    container.destroy({ children: true });
    target?.destroy(true);
  }
  if (parent) parent.addChild(container);
  return Object.freeze({ container, setItems, pick, render, resize, dispose, items: () => items.slice(), meshes });
}

export { DEFAULT_ROLE_ORDER };
