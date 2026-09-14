import * as THREE from "three";
import {
  Application,
  BufferImageSource,
  Container,
  Mesh,
  MeshGeometry,
  RenderTarget,
  RenderTexture,
  Shader,
  Sprite,
  State,
  Texture,
} from "pixi.js";
import { renderBakePairCanvas } from "../../art/bake.js";
import { building } from "../../art/home.js";
import { figure } from "../../art/figures.js";
import { box, scene } from "../../art/geometry.js";
import { camera } from "../../art/prop-camera.js";
import { decodeDepth24 } from "../../art/depth-image.js";

const WIDTH = 640;
const HEIGHT = 400;
const NEAR_DEPTH = 20;
const FAR_DEPTH = -20;

const vertex = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
void main() {
  vUV = aUV;
  vColor = uWorldColorAlpha * uColor;
  mat3 transform = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((transform * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}`;

const fragment = `#version 300 es
in vec2 vUV;
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
  float localDepth = mix(uLocalMin, uLocalMax, decodeDepth24(texture(uDepthTexture, vUV).rgb));
  float worldDepth = uOriginDepth + localDepth;
  gl_FragDepth = (uNearDepth - worldDepth) / (uNearDepth - uFarDepth);
  finalColor = color * vColor;
}`;

function renderer() {
  const value = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  value.setPixelRatio(1);
  value.setClearColor(0, 0);
  value.outputColorSpace = THREE.SRGBColorSpace;
  return value;
}

function anchorFor(view) {
  const foot = new THREE.Vector3(0, 0, 0).project(view);
  return { x: 0.5, y: (1 - foot.y) / 2 };
}

function screenOffset(view, width, height, origin) {
  const zero = new THREE.Vector3(0, 0, 0).project(view);
  const point = new THREE.Vector3(origin.x, origin.y, origin.z).project(view);
  return {
    x: ((point.x - zero.x) * width) / 2,
    y: ((zero.y - point.y) * height) / 2,
  };
}

function terrainScene() {
  const value = scene();
  box(value, "#806143", 0, -0.27, 0, 1, 0.54, 1);
  box(value, "#9a744f", 0, 0.015, 0, 0.98, 0.03, 0.98);
  return value;
}

function bakeItem(threeRenderer, source, view, width, height, origin, id) {
  const pair = renderBakePairCanvas(threeRenderer, source, view, width, height);
  const color = Texture.from(pair.colorCanvas);
  const depth = new Texture({ source: new BufferImageSource({
    resource: new Uint8Array(pair.depthPixels),
    width,
    height,
    format: "rgba8unorm",
    alphaMode: "no-premultiply-alpha",
    scaleMode: "nearest",
  }) });
  const proofCanvas = document.createElement("canvas");
  proofCanvas.width = width;
  proofCanvas.height = height;
  const proofContext = proofCanvas.getContext("2d");
  const proofPixels = proofContext.createImageData(width, height);
  const sourcePixels = pair.colorCanvas.getContext("2d").getImageData(0, 0, width, height).data;
  const proofColor = id === "bed" ? [255, 0, 0] : id === "person" ? [0, 255, 0] : [0, 0, 255];
  for (let offset = 0; offset < sourcePixels.length; offset += 4) {
    proofPixels.data.set(proofColor, offset);
    proofPixels.data[offset + 3] = sourcePixels[offset + 3];
  }
  proofContext.putImageData(proofPixels, 0, 0);
  const proof = Texture.from(proofCanvas);
  color.source.scaleMode = "nearest";
  depth.source.scaleMode = "nearest";
  proof.source.scaleMode = "nearest";
  const anchor = anchorFor(view);
  const offset = screenOffset(view, width, height, origin);
  const toward = new THREE.Vector3(
    pair.towardCamera.x,
    pair.towardCamera.y,
    pair.towardCamera.z,
  );
  return {
    id,
    width,
    height,
    anchor,
    x: WIDTH / 2 + offset.x,
    y: HEIGHT / 2 + offset.y,
    originDepth: toward.dot(new THREE.Vector3(origin.x, origin.y, origin.z)),
    minDepth: pair.depthRange.min,
    maxDepth: pair.depthRange.max,
    color,
    proof,
    proofColor,
    depth,
    depthBytes: pair.depthCanvas.getContext("2d").getImageData(0, 0, width, height).data,
    colorBytes: pair.colorCanvas.getContext("2d").getImageData(0, 0, width, height).data,
  };
}

function meshFor(item, mode = "color") {
  const left = -item.anchor.x * item.width;
  const top = -item.anchor.y * item.height;
  const geometry = new MeshGeometry({
    positions: new Float32Array([
      left, top,
      left + item.width, top,
      left + item.width, top + item.height,
      left, top + item.height,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  geometry.batchMode = "no-batch";
  const shader = Shader.from({
    gl: { name: "hive-depth-feasibility", vertex, fragment },
    resources: {
      uColorTexture: (mode === "proof" ? item.proof : item.color).source,
      uDepthTexture: item.depth.source,
      depthUniforms: {
        uOriginDepth: { value: item.originDepth, type: "f32" },
        uLocalMin: { value: item.minDepth, type: "f32" },
        uLocalMax: { value: item.maxDepth, type: "f32" },
        uNearDepth: { value: NEAR_DEPTH, type: "f32" },
        uFarDepth: { value: FAR_DEPTH, type: "f32" },
      },
    },
  });
  const state = State.for2d();
  state.blend = false;
  state.depthTest = true;
  state.depthMask = true;
  const mesh = new Mesh({ geometry, shader, state });
  mesh.position.set(item.x, item.y);
  return mesh;
}

function cpuDepthAt(item, x, y) {
  const localX = Math.floor(x + 0.5 - (item.x - item.anchor.x * item.width));
  const localY = Math.floor(y + 0.5 - (item.y - item.anchor.y * item.height));
  if (localX < 0 || localY < 0 || localX >= item.width || localY >= item.height)
    return null;
  const offset = (localY * item.width + localX) * 4;
  if (item.colorBytes[offset + 3] <= 128) return null;
  const local = item.minDepth + decodeDepth24(item.depthBytes, offset) * (item.maxDepth - item.minDepth);
  return item.originDepth + local;
}

function depthCandidates(items, x, y) {
  return items
    .map((item) => ({ item, depth: cpuDepthAt(item, x, y) }))
    .filter(({ depth }) => depth !== null)
    .sort((left, right) => right.depth - left.depth || left.item.id.localeCompare(right.item.id));
}

function overlapFacts(items) {
  let overlap = 0;
  const winners = new Set();
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      const candidates = depthCandidates(items, x, y);
      if (candidates.length < 2) continue;
      overlap++;
      winners.add(candidates[0].item.id);
    }
  return { overlap, winners: [...winners].sort() };
}

function colorDistance(left, right) {
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}

function verifyProofPixels(pixels, items, flipY, dx, dy) {
  let total = 0;
  let correct = 0;
  const correctWinners = new Set();
  for (let rawY = 0; rawY < HEIGHT; rawY++)
    for (let x = 0; x < WIDTH; x++) {
      const y = (flipY ? HEIGHT - 1 - rawY : rawY) + dy;
      const candidates = depthCandidates(items, x + dx, y);
      if (candidates.length < 2) continue;
      total++;
      const offset = (rawY * WIDTH + x) * 4;
      const rendered = pixels.slice(offset, offset + 3);
      const winnerDistance = colorDistance(rendered, candidates[0].item.proofColor);
      const loserDistance = Math.min(...candidates.slice(1).map(({ item }) => colorDistance(rendered, item.proofColor)));
      if (winnerDistance < loserDistance) {
        correct++;
        correctWinners.add(candidates[0].item.id);
      }
    }
  return { total, correct, winners: [...correctWinners].sort(), flipY, dx, dy };
}

async function main() {
  const host = document.querySelector("#depth-feasibility");
  const output = host.querySelector("output");
  const app = new Application();
  await app.init({
    width: WIDTH,
    height: HEIGHT,
    preference: ["webgl"],
    backgroundColor: 0x1d2722,
    antialias: false,
    resolution: 1,
  });
  if (app.renderer.name !== "webgl") throw new Error("depth-feasibility-requires-webgl");
  if (app.renderer.context.webGLVersion !== 2)
    throw new Error("depth-feasibility-requires-webgl2");
  app.renderer.gl.depthFunc(app.renderer.gl.LESS);
  app.renderer.gl.clearDepth(1);
  app.stop();
  const threeRenderer = renderer();
  const prop = camera(112, 112, 1.1);
  const portrait = camera(80, 80, 1.03);
  const items = [
    bakeItem(threeRenderer, terrainScene(), prop, 112, 112, { x: 0, y: 0, z: 0 }, "terrain"),
    bakeItem(threeRenderer, building("bed", "finished", 0), prop, 112, 112, { x: 0, y: 0, z: 0 }, "bed"),
    bakeItem(threeRenderer, figure("rowan", 0.25, 0, "walk"), portrait, 80, 80, { x: 0.15, y: 0, z: 0.45 }, "person"),
  ];
  threeRenderer.dispose();

  const renderTexture = RenderTexture.create({ width: WIDTH, height: HEIGHT, resolution: 1 });
  const target = new RenderTarget({
    width: WIDTH,
    height: HEIGHT,
    colorTextures: [renderTexture],
    depth: true,
  });
  const renderOrder = (ordered, mode = "color") => {
    const layer = new Container();
    for (const item of ordered) layer.addChild(meshFor(item, mode));
    app.renderer.render({ target, container: layer, clear: true, clearColor: [0.114, 0.153, 0.133, 1] });
    const extracted = app.renderer.extract.canvas(renderTexture);
    const pixels = extracted.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data.slice();
    layer.destroy({ children: true });
    return pixels;
  };
  const forward = renderOrder(items);
  const reverse = renderOrder([...items].reverse());
  if (forward.length !== reverse.length || forward.some((byte, index) => byte !== reverse[index]))
    throw new Error("depth-render-depends-on-submission-order");
  let visiblePixels = 0;
  for (let offset = 0; offset < forward.length; offset += 4)
    if (forward[offset] !== 29 || forward[offset + 1] !== 39 || forward[offset + 2] !== 34)
      visiblePixels++;
  if (visiblePixels < 100) throw new Error(`depth-render-blank:${visiblePixels}`);
  const facts = overlapFacts(items);
  if (facts.overlap < 20 || !facts.winners.includes("bed") || !facts.winners.includes("person"))
    throw new Error(`depth-overlap-insufficient:${JSON.stringify(facts)}`);
  const proofPixels = renderOrder(items, "proof");
  const proofCandidates = [];
  for (const flipY of [false, true])
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        proofCandidates.push(verifyProofPixels(proofPixels, items, flipY, dx, dy));
  const proofFacts = proofCandidates.sort((left, right) =>
    right.correct / right.total - left.correct / left.total || right.correct - left.correct)[0];
  if (proofFacts.total < 100 || proofFacts.correct / proofFacts.total < 0.98 ||
      proofFacts.dx !== 0 || proofFacts.dy !== 0 ||
      !proofFacts.winners.includes("bed") || !proofFacts.winners.includes("person"))
    throw new Error(`depth-render-picked-wrong-surfaces:${JSON.stringify(proofFacts)}`);
  renderOrder(items);

  const view = new Sprite(renderTexture);
  app.stage.addChild(view);
  app.renderer.render(app.stage);
  host.prepend(app.canvas);
  output.value = `PASS — ${visiblePixels} visible pixels, ${facts.overlap} overlapping pixels; bed and person each win where physically nearer; reverse submission is byte-identical.`;
  globalThis.__HIVE_DEPTH_FEASIBILITY__ = Object.freeze({
    status: "pass",
    visiblePixels,
    overlap: facts.overlap,
    winners: facts.winners,
    proofCorrect: proofFacts.correct,
    proofTotal: proofFacts.total,
    readbackFlippedY: proofFacts.flipY,
  });
}

main().catch((error) => {
  const output = document.querySelector("#depth-feasibility output");
  output.value = `FAIL — ${error instanceof Error ? error.message : String(error)}`;
  globalThis.__HIVE_DEPTH_FEASIBILITY__ = Object.freeze({ status: "fail", message: output.value });
  throw error;
});
