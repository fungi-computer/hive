import assert from "node:assert/strict";
import test from "node:test";
import { copyTerrainDepthPixels, createTerrainLayer, terrainScreenTransform, waterTileWorldOffset } from "./terrain-layer.js";
import { project, WORLD_TOWARD_CAMERA } from "./geometry.js";
import { worldDepthBasis } from "./world-depth.js";

test("terrain layer has no opaque sprite owner and disposal is repeatable", () => {
  const layer = createTerrainLayer();
  assert.equal(layer.drawItem, undefined);
  assert.strictEqual(layer.waterTile, layer.waterTile);
  assert.equal(layer.waterTile.colorTexture.source.width, 32);
  assert.equal(layer.waterTile.colorTexture.source.height, 16);
  assert.equal(layer.waterTile.depthPixels.length, 32 * 16 * 4);
  assert.ok(layer.waterTile.depthPixels.every((value) => Number.isInteger(value) && value >= 0 && value <= 255));
  layer.dispose();
  layer.dispose();
});

test("water tile keeps a bounded diamond alpha and paired metric bytes", () => {
  const layer = createTerrainLayer();
  const color = layer.waterTile.colorTexture.source.resource;
  const opaque = [...color].filter((value, index) => index % 4 === 3 && value > 0).length;
  assert.ok(opaque > 0 && opaque < 32 * 16);
  assert.equal(layer.waterTile.depthTexture.source.resource.length, layer.waterTile.depthPixels.length);
  assert.ok(new Set(layer.waterTile.depthPixels.filter((_, index) => index % 4 === 0)).size > 1);
  for (let index = 3; index < color.length; index += 4)
    assert.equal(color[index] > 0, layer.waterTile.depthPixels[index] > 0);
  const origin = project(0, 0, 0), axisX = project(1, 0, 0), axisZ = project(0, 0, 1);
  const basisX = { x: axisX.x - origin.x, y: axisX.y - origin.y }, basisZ = { x: axisZ.x - origin.x, y: axisZ.y - origin.y };
  const basis = worldDepthBasis(WORLD_TOWARD_CAMERA);
  for (const [x, y] of [[16, 8], [17, 8], [16, 9], [12, 6]]) {
    const pixel = (y * 32 + x) * 4;
    assert.ok(layer.waterTile.depthPixels[pixel + 3] > 0);
    const offset = waterTileWorldOffset(x + 0.5, y + 0.5);
    const expected = basis[0] * offset.x + basis[2] * offset.z;
    const encoded = ((layer.waterTile.depthPixels[pixel] / 255) * 65536 + (layer.waterTile.depthPixels[pixel + 1] / 255) * 256 + layer.waterTile.depthPixels[pixel + 2] / 255) / 65793;
    const decoded = -1 + encoded * 2;
    assert.ok(Math.abs(decoded - expected) <= 2 / 16777215);
  }
  assert.equal(basisX.x * basisZ.y - basisZ.x * basisX.y, 256);
  layer.dispose();
});

test("terrain transform scales the centered bake offset", () => {
  assert.deepEqual(terrainScreenTransform({ x: 10, y: 20, zoom: 2 }), { x: -1654, y: -1116, scale: 2 });
});

test("depth patch copies into the source owned by the texture", () => {
  const target = new Uint8Array([1, 2, 3, 4]);
  const source = new Uint8ClampedArray([9, 8, 7, 6]);
  assert.strictEqual(copyTerrainDepthPixels(target, source), target);
  assert.deepEqual([...target], [...source]);
});
