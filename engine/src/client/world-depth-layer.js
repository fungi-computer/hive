import {
  Container,
  Mesh,
  MeshGeometry,
  RenderTarget,
  RenderTexture,
  Shader,
  State,
} from "pixi.js";
import {
  compareWorldDepthItems,
  createWorldDepthPicker,
  worldDepthBounds,
  worldDepthBasis,
} from "./world-depth.js";

export const WORLD_DEPTH_VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
in vec2 aDepthUV;
out vec2 vUV;
out vec2 vDepthUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
void main() {
  vUV = aUV;
  vDepthUV = aDepthUV;
  vColor = uWorldColorAlpha * uColor;
  mat3 transform = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((transform * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}`;

export const WORLD_DEPTH_FRAGMENT = `#version 300 es
in vec2 vUV;
in vec2 vDepthUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uColorTexture;
uniform sampler2D uDepthTexture;
uniform float uOriginDepth;
uniform float uLocalMin;
uniform float uLocalMax;
uniform float uNearDepth;
uniform float uFarDepth;
float decodeDepth24(vec3 encoded) {
  return dot(encoded, vec3(65536.0, 256.0, 1.0)) / 65793.0;
}
void main() {
  vec4 color = texture(uColorTexture, vUV);
  if (color.a <= 0.5) discard;
  float localDepth = mix(uLocalMin, uLocalMax, decodeDepth24(texture(uDepthTexture, vDepthUV).rgb));
  float worldDepth = uOriginDepth + localDepth;
  gl_FragDepth = (uNearDepth - worldDepth) / (uNearDepth - uFarDepth);
  finalColor = color * vColor;
}`;

export const TRANSPARENT_WORLD_FRAGMENT = `#version 300 es
in vec2 vUV;
in vec2 vDepthUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uColorTexture;
uniform sampler2D uDepthTexture;
uniform float uOriginDepth;
uniform float uLocalMin;
uniform float uLocalMax;
uniform float uNearDepth;
uniform float uFarDepth;
uniform float uAlpha;
float decodeDepth24(vec3 encoded) {
  return dot(encoded, vec3(65536.0, 256.0, 1.0)) / 65793.0;
}
void main() {
  vec4 color = texture(uColorTexture, vUV);
  if (color.a <= 0.001) discard;
  float localDepth = mix(uLocalMin, uLocalMax, decodeDepth24(texture(uDepthTexture, vDepthUV).rgb));
  float worldDepth = uOriginDepth + localDepth;
  gl_FragDepth = (uNearDepth - worldDepth) / (uNearDepth - uFarDepth);
  finalColor = vec4(color.rgb * vColor.rgb, color.a * vColor.a * uAlpha);
}`;

export const TRANSPARENT_WORLD_STATE = Object.freeze({
  depthTest: true,
  depthMask: false,
  blend: true,
});

export function transparentWorldComposition(items, roleOrder) {
  if (!Array.isArray(items) || items.length > 256)
    throw new Error("transparent world input exceeds bound");
  return Object.freeze(items.map((item) => {
    if (item.pickable) throw new Error("transparent world item is pickable");
    const alpha = item.alpha ?? 1;
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1)
      throw new Error("transparent world alpha out of range");
    return Object.freeze({ ...item, alpha, pickable: false });
  }).sort((left, right) =>
    (left.order ?? 100) - (right.order ?? 100) ||
    compareWorldDepthItems(left, right, roleOrder)));
}

function finite(value, name) {
  if (!Number.isFinite(value)) throw new Error(`invalid world depth ${name}`);
  return value;
}

function frameOf(value, name) {
  const frame = value?.frame ?? value;
  if (!frame || !["x", "y", "width", "height"].every((key) => Number.isSafeInteger(frame[key])) ||
      frame.x < 0 || frame.y < 0 || frame.width <= 0 || frame.height <= 0)
    throw new Error(`invalid ${name} frame`);
  return frame;
}

/** Exact normalized atlas coordinates; no inset or guessed full-texture UVs. */
export function atlasFrameUV(frameValue, atlasWidth, atlasHeight) {
  const frame = frameOf(frameValue, "atlas");
  if (!Number.isSafeInteger(atlasWidth) || !Number.isSafeInteger(atlasHeight) || atlasWidth <= 0 || atlasHeight <= 0 ||
      frame.x + frame.width > atlasWidth || frame.y + frame.height > atlasHeight)
    throw new Error("atlas frame exceeds texture");
  const left = frame.x / atlasWidth, top = frame.y / atlasHeight;
  const right = (frame.x + frame.width) / atlasWidth, bottom = (frame.y + frame.height) / atlasHeight;
  return Object.freeze([left, top, right, top, right, bottom, left, bottom]);
}

export function worldDepthItemKey(item) {
  return JSON.stringify([String(item.entityId), String(item.visualPartId)]);
}

function originDepth(item, basis) {
  const origin = item.worldOrigin;
  return finite(origin.x, "origin x") * basis[0] + finite(origin.y, "origin y") * basis[1] + finite(origin.z, "origin z") * basis[2];
}

function textureSize(texture, frame, name) {
  const source = texture?.source;
  const width = frame.atlasWidth ?? source?.width;
  const height = frame.atlasHeight ?? source?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw new Error(`invalid ${name} atlas size`);
  return [width, height];
}

function makeGeometry(item) {
  const colorFrame = frameOf(item.colorFrame, "color");
  const depthFrame = frameOf(item.depthFrame, "depth");
  if (colorFrame.width !== depthFrame.width || colorFrame.height !== depthFrame.height)
    throw new Error("color/depth frame dimensions differ");
  const anchor = item.anchor;
  const ax = finite(anchor?.x, "anchor x"), ay = finite(anchor?.y, "anchor y");
  const geometry = new MeshGeometry({
    positions: new Float32Array([-ax * colorFrame.width, -ay * colorFrame.height, (1 - ax) * colorFrame.width, -ay * colorFrame.height, (1 - ax) * colorFrame.width, (1 - ay) * colorFrame.height, -ax * colorFrame.width, (1 - ay) * colorFrame.height]),
    uvs: new Float32Array(atlasFrameUV(item.colorFrame, ...textureSize(item.colorTexture, colorFrame, "color"))),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  geometry.addAttribute("aDepthUV", new Float32Array(atlasFrameUV(item.depthFrame, ...textureSize(item.depthTexture, depthFrame, "depth"))));
  return geometry;
}

function updateGeometry(record, item) {
  const colorFrame = frameOf(item.colorFrame, "color");
  const depthFrame = frameOf(item.depthFrame, "depth");
  const signature = worldDepthGeometrySignature(item);
  if (record.signature === signature) return;
  const ax = finite(item.anchor?.x, "anchor x"), ay = finite(item.anchor?.y, "anchor y");
  record.geometry.positions = new Float32Array([-ax * colorFrame.width, -ay * colorFrame.height, (1 - ax) * colorFrame.width, -ay * colorFrame.height, (1 - ax) * colorFrame.width, (1 - ay) * colorFrame.height, -ax * colorFrame.width, (1 - ay) * colorFrame.height]);
  record.geometry.uvs = new Float32Array(atlasFrameUV(item.colorFrame, ...textureSize(item.colorTexture, colorFrame, "color")));
  record.geometry.getBuffer("aDepthUV").data = new Float32Array(atlasFrameUV(item.depthFrame, ...textureSize(item.depthTexture, depthFrame, "depth")));
  record.geometry.getBuffer("aDepthUV").update();
  record.signature = signature;
}

export function worldDepthGeometrySignature(item) {
  const colorFrame = frameOf(item.colorFrame, "color");
  const depthFrame = frameOf(item.depthFrame, "depth");
  const [colorWidth, colorHeight] = textureSize(item.colorTexture, colorFrame, "color");
  const [depthWidth, depthHeight] = textureSize(item.depthTexture, depthFrame, "depth");
  return JSON.stringify([
    colorFrame.x, colorFrame.y, colorFrame.width, colorFrame.height, colorWidth, colorHeight,
    depthFrame.x, depthFrame.y, depthFrame.width, depthFrame.height, depthWidth, depthHeight,
    item.anchor?.x, item.anchor?.y,
  ]);
}

function setTransform(mesh, transform) {
  mesh.position.set(finite(transform?.x, "screen x"), finite(transform?.y, "screen y"));
  mesh.scale.set(finite(transform?.scaleX ?? transform?.scale ?? 1, "scale x"), finite(transform?.scaleY ?? transform?.scale ?? 1, "scale y"));
}

function destroyWorldDepthRecord(record) {
  record.mesh.destroy({ texture: false });
  record.geometry.destroy();
  record.shader.destroy();
}

/** Pixi WebGL2 owner for the opaque world depth pass and its shared CPU picker. */
export function createWorldDepthLayer({ width, height, resolution = 1, roleOrder } = {}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    throw new Error("invalid world depth layer size");
  const container = new Container();
  container.eventMode = "none";
  const transparentContainer = new Container();
  transparentContainer.eventMode = "none";
  const renderTexture = RenderTexture.create({ width, height, resolution });
  const target = new RenderTarget({ width, height, resolution, colorTextures: [renderTexture], depth: true, depthStencilTexture: true });
  const picker = createWorldDepthPicker({ roleOrder });
  const records = new Map();
  const transparentRecords = new Map();
  let opaqueCreated = 0;
  let opaqueDestroyed = 0;
  let transparentCreated = 0;
  let transparentDestroyed = 0;
  let disposed = false;
  let activeBounds = null;

  function update(items, towardCamera) {
    if (disposed) throw new Error("world depth layer is disposed");
    const visible = items.filter((item) => item.visible !== false);
    const bounds = worldDepthBounds(visible, towardCamera);
    activeBounds = bounds;
    const basis = worldDepthBasis(towardCamera);
    picker.update(items, basis);
    const active = new Set();
    if (!bounds) {
      container.removeChildren();
      for (const [key, record] of records) { destroyWorldDepthRecord(record); records.delete(key); opaqueDestroyed++; }
      return null;
    }
    const ordered = [...visible].sort((a, b) => compareWorldDepthItems(a, b, roleOrder));
    for (const [index, item] of ordered.entries()) {
      const key = worldDepthItemKey(item); active.add(key);
      let record = records.get(key);
      if (!record) {
        const geometry = makeGeometry(item);
        geometry.batchMode = "no-batch";
        const shader = Shader.from({ gl: { name: "hive-world-depth", vertex: WORLD_DEPTH_VERTEX, fragment: WORLD_DEPTH_FRAGMENT }, resources: {
          uColorTexture: item.colorTexture.source,
          uDepthTexture: item.depthTexture.source,
          depthUniforms: { uOriginDepth: { value: 0, type: "f32" }, uLocalMin: { value: 0, type: "f32" }, uLocalMax: { value: 1, type: "f32" }, uNearDepth: { value: 1, type: "f32" }, uFarDepth: { value: 0, type: "f32" } },
        } });
        const state = State.for2d(); state.blend = false; state.depthTest = true; state.depthMask = true;
        const mesh = new Mesh({ geometry, shader, state });
        record = { mesh, geometry, shader }; records.set(key, record); opaqueCreated++;
      }
      updateGeometry(record, item);
      const range = item.depthFrame.depthRange;
      record.shader.resources.uColorTexture = item.colorTexture.source;
      record.shader.resources.uDepthTexture = item.depthTexture.source;
      const uniforms = record.shader.resources.depthUniforms;
      uniforms.uOriginDepth.value = originDepth(item, bounds.basis);
      uniforms.uLocalMin.value = finite(range.min, "depth min"); uniforms.uLocalMax.value = finite(range.max, "depth max");
      uniforms.uNearDepth.value = bounds.nearDepth; uniforms.uFarDepth.value = bounds.farDepth;
      setTransform(record.mesh, item.screenTransform); record.mesh.visible = true;
      if (!record.mesh.parent) container.addChild(record.mesh);
      container.setChildIndex(record.mesh, index);
    }
    for (const [key, record] of records) if (!active.has(key)) {
      container.removeChild(record.mesh);
      destroyWorldDepthRecord(record);
      records.delete(key);
      opaqueDestroyed++;
    }
    return bounds;
  }

  return Object.freeze({ container, target, texture: renderTexture, picker, update,
    render(renderer, clearColor = [0, 0, 0, 0]) {
      if (renderer?.name !== "webgl" || renderer.context?.webGLVersion !== 2) throw new Error("world-depth-requires-webgl2");
      renderer.render({ target, container, clear: true, clearColor });
    },
    /** Compose translucent terrain water against the already populated depth
     * attachment. It is submitted after the opaque pass and never writes it. */
    renderTransparent(renderer, items = []) {
      if (disposed) throw new Error("world depth layer is disposed");
      if (renderer?.name !== "webgl" || renderer.context?.webGLVersion !== 2)
        throw new Error("world-depth-requires-webgl2");
      if (!activeBounds) throw new Error("transparent world requires opaque pass");
      const ordered = transparentWorldComposition(items, roleOrder);
      const active = new Set();
      for (const [index, item] of ordered.entries()) {
        if (!item.colorTexture || !item.depthTexture)
          throw new Error("transparent world item requires paired textures");
        const key = worldDepthItemKey(item); active.add(key);
        let record = transparentRecords.get(key);
        if (!record) {
          const geometry = makeGeometry(item);
          geometry.batchMode = "no-batch";
          const shader = Shader.from({ gl: { name: "hive-transparent-world", vertex: WORLD_DEPTH_VERTEX, fragment: TRANSPARENT_WORLD_FRAGMENT }, resources: {
            uColorTexture: item.colorTexture.source,
            uDepthTexture: item.depthTexture.source,
            depthUniforms: {
              uOriginDepth: { value: 0, type: "f32" }, uLocalMin: { value: 0, type: "f32" }, uLocalMax: { value: 1, type: "f32" },
              uNearDepth: { value: 1, type: "f32" }, uFarDepth: { value: 0, type: "f32" }, uAlpha: { value: 1, type: "f32" },
            },
          } });
          const state = State.for2d();
          Object.assign(state, TRANSPARENT_WORLD_STATE);
          const mesh = new Mesh({ geometry, shader, state });
          record = { mesh, geometry, shader }; transparentRecords.set(key, record); transparentCreated++;
        }
        updateGeometry(record, item);
        record.shader.resources.uColorTexture = item.colorTexture.source;
        record.shader.resources.uDepthTexture = item.depthTexture.source;
        const uniforms = record.shader.resources.depthUniforms;
        uniforms.uOriginDepth.value = originDepth(item, activeBounds.basis);
        uniforms.uLocalMin.value = finite(item.depthFrame.depthRange.min, "depth min");
        uniforms.uLocalMax.value = finite(item.depthFrame.depthRange.max, "depth max");
        uniforms.uNearDepth.value = activeBounds.nearDepth;
        uniforms.uFarDepth.value = activeBounds.farDepth;
        uniforms.uAlpha.value = item.alpha;
        setTransform(record.mesh, item.screenTransform);
        record.mesh.visible = true;
        if (!record.mesh.parent) transparentContainer.addChild(record.mesh);
        transparentContainer.setChildIndex(record.mesh, index);
      }
      for (const [key, record] of transparentRecords) if (!active.has(key)) {
        transparentContainer.removeChild(record.mesh);
        destroyWorldDepthRecord(record);
        transparentRecords.delete(key);
        transparentDestroyed++;
      }
      renderer.render({ target, container: transparentContainer, clear: false });
    },
    diagnostics() {
      return Object.freeze({
        opaque: Object.freeze({ active: records.size, created: opaqueCreated, destroyed: opaqueDestroyed }),
        transparent: Object.freeze({ active: transparentRecords.size, created: transparentCreated, destroyed: transparentDestroyed }),
      });
    },
    resize(nextWidth, nextHeight) {
      if (!Number.isSafeInteger(nextWidth) || !Number.isSafeInteger(nextHeight) || nextWidth <= 0 || nextHeight <= 0) throw new Error("invalid world depth resize");
      // The target listens to its color source and resizes both attachments once.
      target.resize(nextWidth, nextHeight, resolution);
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const record of records.values()) destroyWorldDepthRecord(record);
      for (const record of transparentRecords.values()) destroyWorldDepthRecord(record);
      records.clear(); container.destroy({ children: false }); target.destroy(); renderTexture.destroy(true);
      transparentRecords.clear(); transparentContainer.destroy({ children: false });
    },
  });
}
