import test from "node:test";
import assert from "node:assert/strict";
import { Texture } from "pixi.js";
import { createCutTerrainLayer, waterDrawRecord } from "./cut-terrain-layer.js";
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
  const beforePan = layer.sortableItems;
  layer.position({ ...camera, x: camera.x - 8 }, view, { width: 640, height: 400 });
  assert.equal(layer.sortableItems[0], beforePan[0], "small pans retain prepared face records");
  layer.position({ ...camera, x: -250 }, view, { width: 640, height: 400 });
  const afterPan = layer.sortableItems;
  assert.equal(reads, 1, "panning inside resident chunk demand does not fetch terrain again");
  const previousIds = new Set(beforePan.map(record => record.id));
  assert(afterPan.some(record => !previousIds.has(record.id)), "same-demand pan reveals previously culled terrain");
  layer.dispose(); layer.dispose();
});

test("water draw records preserve the physical surface independently of Pixi sprites", () => {
  const record = waterDrawRecord({ at: [4, -2, 7], level: 5, liquidVolumeM3: 1 }, {
    verticalMetres: 0.56,
    projection: (x, y, z) => ({ x: x * 10 - z * 10, y: x * 4 + z * 4 - y * 8 }),
  });
  assert.equal(record.id, "water:4:-2:7");
  assert.equal(record.role, "water");
  assert.equal(record.pickable, false);
  assert.equal(record.footprint[0].x, 4);
  assert.equal(record.footprint[0].z, 7);
  assert(Math.abs(record.footprint[0].y - (-2.5 * 0.56 + (5 / 7) * 0.56)) < 1e-12);
  assert.equal("display" in record, false);
});
