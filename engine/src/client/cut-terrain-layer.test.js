import test from "node:test";
import assert from "node:assert/strict";
import { Texture } from "pixi.js";
import { createCutTerrainLayer, waterDrawRecord } from "./cut-terrain-layer.js";
import { createOrderingProjection } from "./ordering-projection.js";

function chunk(key) {
  const min = key.map(value => value * 8), max = min.map(value => value + 8);
  return { key, min, max, surfaces: [], columns: Array.from({ length: 8 }, (_, x) =>
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
    baseline: { protocolVersion: 3, bounds: { minX: 0, maxX: 8, minY: 0, maxY: 8, minZ: 0, maxZ: 8 },
      verticalMetres: 0.54, materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] },
    surfaces: [{ cell: [4, 0, 4], material: 1, generatedTop: 0 }], structureSurfaces: [],
    water: [{ at: [4, 0, 4], level: 4, liquidVolumeM3: 0.5 }] };
  layer.update(terrain, 2);
  const camera = { x: 13, y: 17, zoom: 2 }, view = { cutaway: true, level: 0, range: { min: 0, max: 7 } };
  layer.position(camera, view, { width: 640, height: 400 });
  await Promise.resolve(); await Promise.resolve();
  layer.position(camera, view, { width: 640, height: 400 });
  assert.equal(reads, 1);
  assert.equal(layer.coverage.viewComplete, true);
  assert(layer.sortableItems.some(record => record.id.startsWith("terrain:")));
  const retained = layer.retainedRecords;
  const water = retained.records.find(record => record.id === "water:4:0:4");
  assert(water, "water joins the retained physical record stream");
  assert.equal(layer.retainedRecords.revision, retained.revision);
  assert.equal(layer.retainedRecords.records.find(record => record.id === "water:4:0:4"), water,
    "unchanged water retains its record identity");
  layer.update({ ...terrain, water: [{ ...terrain.water[0], liquidVolumeM3: 0.8 }] }, 2);
  assert.strictEqual(layer.retainedRecords.records.find(record => record.id === "water:4:0:4"), water,
    "volume-only changes do not invalidate a visually unchanged water surface");
  layer.applyOrder(layer.sortableItems);
  assert.equal(layer.container.x, 13);
  assert.equal(layer.container.y, 17);
  assert.equal(layer.container.scale.x, 2);
  const beforePan = layer.sortableItems;
  layer.position({ ...camera, x: camera.x - 8 }, view, { width: 640, height: 400 });
  assert.equal(layer.sortableItems[0], beforePan[0], "small pans retain prepared face records");
  assert.equal(layer.retainedRecords.revision, retained.revision, "small pans retain the complete record revision");
  layer.position({ ...camera, x: -250 }, view, { width: 640, height: 400 });
  const afterPan = layer.sortableItems;
  assert.equal(reads, 1, "panning inside resident chunk demand does not fetch terrain again");
  assert.strictEqual(afterPan, beforePan, "same-demand pan keeps prepared chunk faces without repacking");
  layer.dispose(); layer.dispose();
});

test("cut terrain services all camera batches without synchronous coverage reentry", async () => {
  const requests = [];
  const runtime = { terrainChunks: async request => {
    requests.push(request);
    return { kind: "ready", requestId: request.requestId, epoch: request.epoch,
      terrainRevision: request.terrainRevision, chunks: request.chunks.map(chunk) };
  } };
  const projection = createOrderingProjection();
  const camera = { x: 320, y: 180, zoom: 1 };
  const view = { cutaway: true, level: 8, range: { min: 0, max: 15 } };
  const screen = { width: 640, height: 400 };
  let layer, depth = 0, maximumDepth = 0;
  let done, fail;
  const complete = new Promise((resolve, reject) => { done = resolve; fail = reject; });
  layer = createCutTerrainLayer({ runtime, projection, onCoverage: event => {
    depth++; maximumDepth = Math.max(maximumDepth, depth);
    try {
      if (event.kind === "error") throw event.error;
      layer.position(camera, view, screen);
      if (layer.coverage.demandComplete) done();
    } catch (error) { fail(error); }
    finally { depth--; }
  } });
  layer.installArt({ body: () => ({ texture: Texture.WHITE, uvs: [0,0,0,1,1,1,1,0] }),
    cover: () => ({ texture: Texture.WHITE, uvs: [0,0,0,1,1,1,1,0] }), dispose() {} });
  layer.update({ revision: 1, placementRevision: 1, verticalMetres: 0.54,
    baseline: { protocolVersion: 3, bounds: { minX: -16, maxX: 16, minY: 0, maxY: 16, minZ: -16, maxZ: 16 },
      verticalMetres: 0.54, materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] },
    surfaces: [], structureSurfaces: [], water: [] }, 1);
  layer.position(camera, view, screen);
  await Promise.race([complete, new Promise((_, reject) => setTimeout(() => reject(new Error("coverage stalled")), 1000))]);
  assert(requests.length > 1, "fixture exercises successive bounded request batches");
  assert(requests.every(request => request.chunks.length <= 8));
  assert.equal(maximumDepth, 1);
  assert.equal(layer.coverage.coverage.every(item => item.status === "ready"), true);
  layer.dispose();
});

test("a cut change drops old caps and cover while replacement coverage loads", async () => {
  const pending = [];
  const runtime = { terrainChunks: request => new Promise(resolve => pending.push({ request, resolve })) };
  const layer = createCutTerrainLayer({ runtime, projection: createOrderingProjection() });
  layer.installArt({ body: () => ({ texture: Texture.WHITE, uvs: [0,0,0,1,1,1,1,0] }),
    cover: () => ({ texture: Texture.WHITE, uvs: [0,0,0,1,1,1,1,0] }), dispose() {} });
  layer.update({ revision: 1, placementRevision: 1, verticalMetres: 0.54,
    baseline: { protocolVersion: 3, bounds: { minX: 0, maxX: 8, minY: 0, maxY: 24, minZ: 0, maxZ: 8 },
      verticalMetres: 0.54, materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] },
    surfaces: [{ cell: [4, 0, 4], material: 1, generatedTop: 0,
      cover: { kind: "grass", condition: "green", height: "full" } }],
    structureSurfaces: [], water: [] }, 1);
  const camera = { x: 320, y: 180, zoom: 1 }, screen = { width: 640, height: 400 };
  const view = level => ({ cutaway: true, level, range: { min: 0, max: 23 } });
  layer.position(camera, view(0), screen);
  const first = pending.shift();
  first.resolve({ kind: "ready", requestId: first.request.requestId, epoch: first.request.epoch,
    terrainRevision: first.request.terrainRevision, chunks: first.request.chunks.map(chunk) });
  await Promise.resolve(); await Promise.resolve();
  layer.position(camera, view(0), screen);
  assert(layer.retainedRecords.records.some(record => record.role === "terrain-cover"));
  layer.applyOrder(layer.sortableItems);
  layer.position(camera, view(16), screen);
  assert.equal(layer.coverage.demandComplete, false);
  assert.equal(layer.retainedRecords.records.some(record => record.role === "terrain-cover"), false);
  assert.equal(layer.retainedRecords.records.some(record => record.id.startsWith("terrain:")), false);
  layer.dispose();
});

test("water draw records preserve the physical surface independently of Pixi sprites", () => {
  const record = waterDrawRecord({ at: [4, -2, 7], level: 5, liquidVolumeM3: 1 }, {
    verticalMetres: 0.56,
    projection: (x, y, z) => ({ x: x * 10 - z * 10, y: x * 4 + z * 4 - y * 8 }),
  });
  assert.equal(record.id, "water:4:-2:7");
  assert.equal(record.role, "water");
  assert.equal(record.renderPass, "transparent");
  assert.equal(record.attachment.kind, "liquid-surface");
  assert.deepEqual(record.attachment.point, record.footprint[0]);
  assert.equal("supports" in record.attachment, false, "water ordering uses its level, not a solid-cell support");
  assert.equal(record.pickable, false);
  assert.equal(record.footprint[0].x, 4);
  assert.equal(record.footprint[0].z, 7);
  assert(Math.abs(record.footprint[0].y - (-2.5 * 0.56 + (5 / 7) * 0.56)) < 1e-12);
  assert.equal("display" in record, false);
});

function testTerrain(bounds, surfaces = []) {
  return { revision: 1, placementRevision: 1, verticalMetres: 0.54,
    baseline: { protocolVersion: 3, bounds, verticalMetres: 0.54,
      materials: [{ slot: 0, solid: false }, { slot: 1, solid: true, art: "earth" }] },
    surfaces, structureSurfaces: [], water: [] };
}

async function readyLayer(layer, camera, view, screen) {
  for (let attempt = 0; attempt < 128; attempt++) {
    layer.position(camera, view, screen);
    if (layer.coverage.demandComplete) return;
    await Promise.resolve(); await Promise.resolve();
  }
  assert.fail("fixture terrain demand did not complete");
}

function testLayer(onCoverage) {
  let reads = 0;
  const runtime = { terrainChunks: async request => {
    reads++;
    return { kind: "ready", requestId: request.requestId, epoch: request.epoch,
      terrainRevision: request.terrainRevision, chunks: request.chunks.map(chunk) };
  } };
  const layer = createCutTerrainLayer({ runtime, projection: createOrderingProjection(), onCoverage });
  const style = texture => ({ texture, uvs: [0,0,0,1,1,1,1,0] });
  layer.installArt({ body: () => style(Texture.WHITE),
    cover: ({ height }) => style(height === "short" ? Texture.EMPTY : Texture.WHITE), dispose() {} });
  return { layer, reads: () => reads };
}

test("returning from an over-budget viewport restores the exact previous terrain demand", async () => {
  const notifications = [];
  const { layer, reads } = testLayer(event => notifications.push(event.kind));
  try {
    layer.update(testTerrain({ minX: -512, maxX: 512, minY: 0, maxY: 8, minZ: -512, maxZ: 512 }), 1);
    const camera = { x: 0, y: 0, zoom: 2 }, screen = { width: 640, height: 400 };
    const view = { cutaway: true, level: 0, range: { min: 0, max: 7 } };
    await readyLayer(layer, camera, view, screen);
    const before = layer.retainedRecords, beforeReads = reads();
    assert(before.records.length > 0, "precondition: resident terrain is presented");
    layer.position(camera, view, { width: 40000, height: 40000 });
    await Promise.resolve();
    assert(notifications.includes("view-budget"), "precondition: actual viewport planner rejected demand");
    assert.equal(layer.retainedRecords.records.length, 0, "over-budget scene drops stale terrain");
    layer.position(camera, view, screen);
    const restored = layer.retainedRecords;
    assert(restored.revision > before.revision);
    assert.equal(restored.records.length, before.records.length, "same demand must restore its record count");
    assert.deepEqual(restored.records.map(record => `${record.id}/${record.part}`),
      before.records.map(record => `${record.id}/${record.part}`), "same demand must republish its terrain");
    assert(restored.records.every((record, index) => record === before.records[index]), "prepared faces remain reusable");
    assert.equal(reads(), beforeReads, "restoring resident demand needs no additional terrain reads");
  } finally { layer.dispose(); }
});

test("full to short cover changes at the same terrain revision replace grass but retain ground faces", async () => {
  const { layer, reads } = testLayer();
  try {
    const surface = { cell: [4,0,4], material: 1, generatedTop: 0,
      cover: { kind: "grass", condition: "green", height: "full" } };
    const terrain = testTerrain({ minX: 0, maxX: 8, minY: 0, maxY: 8, minZ: 0, maxZ: 8 }, [surface]);
    layer.update(terrain, 1);
    const camera = { x: 0, y: 0, zoom: 1 }, screen = { width: 640, height: 400 };
    const view = { cutaway: true, level: 0, range: { min: 0, max: 7 } };
    await readyLayer(layer, camera, view, screen);
    const before = layer.retainedRecords, beforeReads = reads();
    const beforeGrass = before.records.filter(record => record.role === "terrain-cover");
    const beforeGround = before.records.filter(record => record.role !== "terrain-cover");
    assert(beforeGrass.length > 0 && beforeGround.length > 0);
    assert(beforeGrass.every(record => record.terrainBatch.texture === Texture.WHITE));
    layer.update({ ...terrain, surfaces: [{ ...surface, cover: { ...surface.cover, height: "short" } }] }, 1);
    layer.position(camera, view, screen);
    const after = layer.retainedRecords;
    const afterGrass = after.records.filter(record => record.role === "terrain-cover");
    const afterGround = after.records.filter(record => record.role !== "terrain-cover");
    assert(after.revision > before.revision);
    assert.equal(afterGrass.length, beforeGrass.length);
    assert(afterGrass.every(record => record.terrainBatch.texture === Texture.EMPTY));
    assert(afterGrass.every(record => !beforeGrass.includes(record)), "cover input change replaces projected art records");
    assert.deepEqual(afterGrass.map(record => record.mask), beforeGrass.map(record => record.mask), "mowing preserves dual-grid connectivity");
    assert(afterGround.every((record, index) => record === beforeGround[index]), "unchanged ground retains exact prepared faces");
    assert.equal(reads(), beforeReads, "mowing presentation does not reread unchanged terrain");
    assert.equal(surface.cover.height, "full", "presentation does not mutate the authoritative input");
  } finally { layer.dispose(); }
});

test("an empty complete camera demand clears paint and picking, then restores resident terrain", async () => {
  const { layer, reads } = testLayer();
  try {
    layer.update(testTerrain({ minX: 0, maxX: 8, minY: 0, maxY: 8, minZ: 0, maxZ: 8 },
      [{ cell: [4,0,4], material: 1, generatedTop: 0 }]), 1);
    const camera = { x: 0, y: 0, zoom: 2 }, screen = { width: 640, height: 400 };
    const view = { cutaway: true, level: 0, range: { min: 0, max: 7 } };
    await readyLayer(layer, camera, view, screen);
    const before = layer.retainedRecords.records, beforeReads = reads();
    assert(before.length > 0);
    layer.position({ ...camera, x: 100000 }, view, screen);
    assert.equal(layer.coverage.demandComplete, true);
    assert.equal(layer.retainedRecords.records.length, 0);
    assert.equal(layer.presentedTerrain.surfaces.length, 0);
    layer.position(camera, view, screen);
    assert.deepEqual(layer.retainedRecords.records, before);
    assert.equal(reads(), beforeReads, "return reuses bounded cached chunks");
  } finally { layer.dispose(); }
});

test("disposing a retained terrain owner releases its presented records and picking faces", async () => {
  const { layer } = testLayer();
  layer.update(testTerrain({ minX: 0, maxX: 8, minY: 0, maxY: 8, minZ: 0, maxZ: 8 }), 1);
  await readyLayer(layer, { x: 0, y: 0, zoom: 2 },
    { cutaway: true, level: 0, range: { min: 0, max: 7 } }, { width: 640, height: 400 });
  assert(layer.retainedRecords.records.length > 0);
  layer.dispose();
  assert.equal(layer.retainedRecords.records.length, 0);
  assert.equal(layer.presentedTerrain, undefined);
  assert.equal(layer.coverage.cachedChunks, 0);
});
