import test from "node:test";
import assert from "node:assert/strict";
import { Texture } from "pixi.js";
import { createCutTerrainLayer } from "./cut-terrain-layer.js";
import { createOrderingProjection } from "./ordering-projection.js";

function chunk(key) {
  const min = key.map(value => value * 8), max = min.map(value => value + 8);
  return { key, min, max, columns: Array.from({ length: 8 }, (_, x) =>
    Array.from({ length: 8 }, (_, z) => ({ x: min[0] + x, z: min[2] + z,
      runs: [{ minY: min[1], maxY: Math.min(1, max[1]), material: 1 },
        ...(max[1] > 1 ? [{ minY: Math.max(1, min[1]), maxY: max[1], material: 0 }] : [])] }))
      .flat()).flat() };
}

test("live cut terrain layer requests bounded coverage and shares one camera transform", async () => {
  let reads = 0;
  const runtime = { terrainChunks: async request => {
    reads++;
    return { kind: "ready", requestId: request.requestId, epoch: request.epoch,
      terrainRevision: request.terrainRevision, chunks: request.chunks.map(chunk) };
  } };
  const layer = createCutTerrainLayer({ runtime, projection: createOrderingProjection() });
  layer.installArt({ body: () => ({ texture: Texture.WHITE, uvs: [0,0,0,1,1,1,1,0] }), cover: () => ({ texture: Texture.WHITE, uvs: [0,0,0,1,1,1,1,0] }), dispose() {} });
  const terrain = { revision: 1, placementRevision: 1, verticalMetres: 0.54,
    baseline: { protocolVersion: 2, bounds: { minX: 0, maxX: 8, minY: 0, maxY: 8, minZ: 0, maxZ: 8 },
      verticalMetres: 0.54, materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] },
    surfaces: [{ cell: [4, 0, 4], material: 1, generatedTop: 0 }], structureSurfaces: [], water: [] };
  layer.update(terrain, 2);
  const camera = { x: 13, y: 17, zoom: 2 }, view = { cutaway: true, level: 0, range: { min: 0, max: 7 } };
  layer.position(camera, view, { width: 640, height: 400 });
  await Promise.resolve(); await Promise.resolve();
  layer.position(camera, view, { width: 640, height: 400 });
  assert.equal(reads, 1);
  assert.equal(layer.coverage.viewComplete, true);
  assert(layer.sortableItems.some(record => record.id.startsWith("terrain:")));
  layer.applyOrder(layer.sortableItems);
  assert.equal(layer.container.x, 13);
  assert.equal(layer.container.y, 17);
  assert.equal(layer.container.scale.x, 2);
  layer.dispose(); layer.dispose();
});
