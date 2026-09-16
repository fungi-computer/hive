import assert from "node:assert/strict";
import test from "node:test";
import { createTerrainLayer, terrainBakePadding, terrainScreenTransform } from "./terrain-layer.js";
import { camera } from "../../../src/art/prop-camera.js";

test("terrain layer owns an ordinary Pixi terrain sprite and repeatable disposal", () => {
  const layer = createTerrainLayer();
  assert.equal(layer.drawItem, undefined);
  assert.strictEqual(layer.waterTile, layer.waterTile);
  assert.equal(layer.waterTile.colorTexture.source.width, 32);
  assert.equal(layer.waterTile.colorTexture.source.height, 16);
  layer.dispose();
  layer.dispose();
});

test("terrain transform scales the centered bake offset", () => {
  assert.deepEqual(terrainScreenTransform({ x: 10, y: 20, zoom: 2 }), {
    x: -1654,
    y: -1116,
    scale: 2,
  });
});

test("terrain bake retains the dual-grid half-cell overhang at chunk seams", () => {
  const padding = terrainBakePadding(camera(2304, 1536, 1.03, 256));
  assert.ok(padding.x >= 10);
  assert.ok(padding.y >= 6);
});
