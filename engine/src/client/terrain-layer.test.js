import assert from "node:assert/strict";
import test from "node:test";
import { copyTerrainDepthPixels, createTerrainLayer, terrainScreenTransform } from "./terrain-layer.js";

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
