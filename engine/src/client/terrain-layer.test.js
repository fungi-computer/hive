import assert from "node:assert/strict";
import test from "node:test";
import { copyTerrainDepthPixels, createTerrainLayer, terrainScreenTransform } from "./terrain-layer.js";

test("terrain layer has no opaque sprite owner and disposal is repeatable", () => {
  const layer = createTerrainLayer();
  assert.equal(layer.drawItem, undefined);
  layer.dispose();
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
