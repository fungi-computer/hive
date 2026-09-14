import assert from "node:assert/strict";
import test from "node:test";
import { BufferImageSource, Texture } from "pixi.js";
import { writeDepth24 } from "../../../src/art/depth-image.js";
import { atlasFrameUV, createWorldDepthLayer, worldDepthItemKey } from "./world-depth-layer.js";

test("atlas UVs use the exact frame rectangle", () => {
  assert.deepEqual(atlasFrameUV({ frame: { x: 2, y: 4, width: 8, height: 6 } }, 32, 24), [
    2 / 32, 4 / 24, 10 / 32, 4 / 24, 10 / 32, 10 / 24, 2 / 32, 10 / 24,
  ]);
});

test("stable visual keys and permutation independent role order", () => {
  assert.equal(worldDepthItemKey({ entityId: "e", visualPartId: "p" }), "e:p");
  const layerSource = String(createWorldDepthLayer);
  assert.match(layerSource, /sort\(\(a, b\) => compareWorldDepthItems/);
});

test("layer rejects invalid sizes before allocating render resources", () => {
  assert.throws(() => createWorldDepthLayer({ width: 0, height: 10 }), /invalid world depth layer size/);
});

function texture(r, g, b, a = 255) {
  return new Texture({ source: new BufferImageSource({ resource: new Uint8Array([r, g, b, a]), width: 1, height: 1, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
}

test("Pixi resources survive update, resize, and idempotent disposal", () => {
  const layer = createWorldDepthLayer({ width: 32, height: 24 });
  const colorTexture = texture(255, 0, 0);
  const depthBytes = new Uint8Array([0, 0, 0, 255]);
  writeDepth24(depthBytes, 0, 0.5);
  const depthTexture = new Texture({ source: new BufferImageSource({ resource: depthBytes, width: 1, height: 1, format: "rgba8unorm", alphaMode: "no-premultiply-alpha", scaleMode: "nearest" }) });
  const item = { entityId: "actor", visualPartId: "body", physicalRole: "actor", colorTexture, colorFrame: { frame: { x: 0, y: 0, width: 1, height: 1 } }, depthTexture, depthFrame: { frame: { x: 0, y: 0, width: 1, height: 1 }, depthRange: { min: 0, max: 1 } }, worldOrigin: { x: 0, y: 0, z: 0 }, screenTransform: { x: 8, y: 8, scale: 4 }, anchor: { x: 0.5, y: 0.5 }, visible: true, pickable: true };
  if (typeof document === "undefined") {
    // Shader compilation asks Pixi's browser adapter for a WebGL precision probe.
    // Construction, attachment allocation, resize, and disposal remain executable here.
    assert.throws(() => layer.update([item], [1, 0, 0]), /document is not defined/);
  } else {
    layer.update([item], [1, 0, 0]);
  }
  assert.equal(layer.target.depth, true);
  assert.ok(layer.target.depthStencilTexture);
  layer.resize(48, 40);
  assert.equal(layer.target.width, 48);
  assert.equal(layer.target.height, 40);
  layer.dispose();
  layer.dispose();
  assert.throws(() => layer.update([], [1, 0, 0]), /disposed/);
  colorTexture.destroy(true);
  depthTexture.destroy(true);
});
