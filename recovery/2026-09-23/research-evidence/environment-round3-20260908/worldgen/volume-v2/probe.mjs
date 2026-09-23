import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createWorldSpec, floorDiv, mod, sampleCell } from '../height-sea/terrain.js';
import { createVoxelWorld, MATERIAL, worldIdentity } from './voxel-world.mjs';

const here = new URL('./', import.meta.url);
const output = new URL('./run-v1/', import.meta.url);
const pocketContract = Object.freeze({
  seed: 'volume-v2-fixed-cave-pocket-v1',
  region: Object.freeze({ minX: -64, maxXExclusive: 64, minY: -48, maxYExclusive: 16, minZ: -64, maxZExclusive: 64 }),
  shape: Object.freeze({ width: 3, height: 4, depth: 3 }),
});
const SIDE = 16;
const VOLUME = SIDE ** 3;
const report = {
  scope: 'isolated height-authoritative voxel cave base and codec; no pathfinding, traversal, natural entrances, live fluid/gas stock, biome, page, or game integration',
  pocketContract,
  checks: [], errors: [], hashes: {}, timing: {},
};
const hash = async (relative) => createHash('sha256').update(await readFile(new URL(relative, import.meta.url))).digest('hex');
const index = (x, y, z) => (mod(y, SIDE) * SIDE + mod(z, SIDE)) * SIDE + mod(x, SIDE);
const brickKey = (x, y, z) => `${floorDiv(x, SIDE)},${floorDiv(y, SIDE)},${floorDiv(z, SIDE)}`;
async function check(name, fn) {
  const started = performance.now(); await fn(); report.checks.push({ name, ms: Number((performance.now() - started).toFixed(3)) });
}
function collectFixedRegionBricks(world) {
  const { region } = pocketContract;
  const snapshots = new Map();
  for (let z = floorDiv(region.minZ, SIDE); z <= floorDiv(region.maxZExclusive - 1, SIDE); z += 1)
    for (let y = floorDiv(region.minY, SIDE); y <= floorDiv(region.maxYExclusive - 1, SIDE); y += 1)
      for (let x = floorDiv(region.minX, SIDE); x <= floorDiv(region.maxXExclusive - 1, SIDE); x += 1) {
        const snapshot = world.readBrick({ x, y, z }); snapshots.set(snapshot.key, snapshot);
      }
  return snapshots;
}
function snapshotMaterial(snapshots, x, y, z) {
  const snapshot = snapshots.get(brickKey(x, y, z));
  if (!snapshot) throw new Error(`scan misses ${x},${y},${z}`);
  return snapshot.material[index(x, y, z)];
}
function findFixedPocket(snapshots) {
  const { region, shape } = pocketContract;
  for (let y = region.minY; y <= region.maxYExclusive - shape.height; y += 1)
    for (let z = region.minZ; z <= region.maxZExclusive - shape.depth; z += 1)
      for (let x = region.minX; x <= region.maxXExclusive - shape.width; x += 1) {
        let empty = true;
        for (let dy = 0; dy < shape.height && empty; dy += 1)
          for (let dz = 0; dz < shape.depth && empty; dz += 1)
            for (let dx = 0; dx < shape.width; dx += 1)
              if (snapshotMaterial(snapshots, x + dx, y + dy, z + dz) !== MATERIAL.air) { empty = false; break; }
        if (empty) return { x, y, z };
      }
  return null;
}

const started = performance.now();
try {
  await mkdir(output, { recursive: true });
  const identity = worldIdentity({ worldId: 'volume-v2-fixed-world', seed: pocketContract.seed });
  const spec = createWorldSpec({ seed: pocketContract.seed });
  const world = createVoxelWorld(identity);
  await check('height-sea bed owns generated top and three solid protected layers', () => {
    for (const [x, z] of [[-17, -1], [-1, 0], [0, 0], [16, 15], [63, -64]]) {
      const bed = sampleCell(spec, x, z).bedLevel;
      assert.equal(world.read({ x, y: bed, z }), MATERIAL.air);
      assert.equal(world.read({ x, y: bed - 1, z }), MATERIAL.soil);
      assert.equal(world.read({ x, y: bed - 2, z }), MATERIAL.soil);
      assert.equal(world.read({ x, y: bed - 3, z }), MATERIAL.stone);
    }
  });
  let snapshots, pocket;
  await check('one fixed seed and bounded region contain a 3x4x3 generated geometric empty pocket', () => {
    snapshots = collectFixedRegionBricks(world);
    pocket = findFixedPocket(snapshots);
    assert(pocket, 'fixed cave pocket scan found no 3x4x3 empty region');
    const { shape } = pocketContract;
    for (let dz = 0; dz < shape.depth; dz += 1) for (let dx = 0; dx < shape.width; dx += 1) {
      const bed = sampleCell(spec, pocket.x + dx, pocket.z + dz).bedLevel;
      assert(pocket.y + shape.height - 1 <= bed - 4, 'geometric pocket must stay below protected surface cap');
    }
    report.pocket = { ...pocket, ...pocketContract.shape, meaning: 'generated geometric empty pocket only; not pathfinding, actor clearance, traversal, or a natural entrance' };
    report.fixedScan = { bricks: snapshots.size, temporarySnapshotBytes: snapshots.size * VOLUME, cells: 128 * 64 * 128 };
  });
  await check('negative-coordinate point and brick snapshots agree across a shared brick boundary', () => {
    const points = [
      { x: -1, y: pocket.y + 1, z: pocket.z + 1 },
      { x: 0, y: pocket.y + 1, z: pocket.z + 1 },
      { x: pocket.x, y: pocket.y, z: pocket.z },
    ];
    for (const at of points) {
      const brick = world.readBrick({ x: floorDiv(at.x, SIDE), y: floorDiv(at.y, SIDE), z: floorDiv(at.z, SIDE) });
      assert.equal(world.read(at), brick.material[index(at.x, at.y, at.z)]);
      const original = brick.material[index(at.x, at.y, at.z)]; brick.material[index(at.x, at.y, at.z)] = MATERIAL.stone;
      assert.equal(world.read(at), original, 'returned brick snapshot must not mutate cache');
    }
    const forward = world.readBrick({ x: -1, y: floorDiv(pocket.y, SIDE), z: floorDiv(pocket.z, SIDE) });
    world.evictAll();
    const reverse = world.readBrick({ x: -1, y: floorDiv(pocket.y, SIDE), z: floorDiv(pocket.z, SIDE) });
    assert.deepEqual(reverse.material, forward.material);
  });
  await check('atomic edits, eviction, actual checkpoint reload, and overlay accounting preserve cave state', async () => {
    const cave = { x: pocket.x + 1, y: pocket.y + 1, z: pocket.z + 1 };
    const capBed = sampleCell(spec, pocket.x, pocket.z).bedLevel;
    const access = { x: pocket.x, y: capBed - 3, z: pocket.z };
    assert.equal(world.read(cave), MATERIAL.air); assert.equal(world.read(access), MATERIAL.stone);
    const result = world.edit({ expectedRevision: 0, cells: [
      { ...cave, expectedMaterial: MATERIAL.air, material: MATERIAL.stone },
      { ...access, expectedMaterial: MATERIAL.stone, material: MATERIAL.air },
    ] });
    assert(result.ok); assert.equal(world.read(cave), MATERIAL.stone); assert.equal(world.read(access), MATERIAL.air);
    const beforeConflict = world.save();
    const conflict = world.edit({ expectedRevision: 1, cells: [
      { ...cave, expectedMaterial: MATERIAL.air, material: MATERIAL.stone },
      { ...access, expectedMaterial: MATERIAL.air, material: MATERIAL.stone },
    ] });
    assert.equal(conflict.reason, 'cell-changed'); assert.deepEqual(world.save(), beforeConflict);
    world.evictAll(); assert.equal(world.read(cave), MATERIAL.stone); assert.equal(world.read(access), MATERIAL.air);
    await writeFile(new URL('./checkpoint.tmp', output), JSON.stringify(world.save()));
    await rename(new URL('./checkpoint.tmp', output), new URL('./checkpoint.json', output));
    const checkpoint = JSON.parse(await readFile(new URL('./checkpoint.json', output), 'utf8'));
    const restored = createVoxelWorld(identity, { checkpoint });
    assert.deepEqual(restored.save(), world.save()); restored.evictAll();
    assert.equal(restored.read(cave), MATERIAL.stone); assert.equal(restored.read(access), MATERIAL.air);
    const stats = restored.stats();
    assert.equal(stats.changedCells, 2); assert(stats.sparseOverlayBytes > 0); assert.equal(stats.residentProjectionCapBytes, 8 * VOLUME);
    report.codec = { revision: stats.revision, changedCells: stats.changedCells, sparseOverlayBytes: stats.sparseOverlayBytes, checkpointBytes: stats.checkpointBytes, residentProjectionCapBytes: stats.residentProjectionCapBytes, caveMetricEvaluations: stats.caveMetricEvaluations };
  });
  await check('recipe identity and schema reject incompatible old voxel checkpoint', () => {
    const legacyIdentity = structuredClone(identity); legacyIdentity.base.voxelRecipe = 'surface-extrusion-two-soil-cells-v1';
    assert.throws(() => createVoxelWorld(legacyIdentity), /unsupported/);
    const malformed = { schema: 1, identity, revision: 0, changes: [] };
    assert.throws(() => createVoxelWorld(identity, { checkpoint: malformed }), /mismatch/);
  });
} catch (error) { report.errors.push(error.stack); process.exitCode = 1; }
report.timing.totalMs = Number((performance.now() - started).toFixed(3));
report.hashes = {
  sourceVoxelBase: await hash('../voxel-world.mjs'),
  heightSeaTerrain: await hash('../height-sea/terrain.js'),
  candidate: await hash('./voxel-world.mjs'),
  probe: await hash('./probe.mjs'),
};
await writeFile(new URL('./proof.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors.length, totalMs: report.timing.totalMs, pocket: report.pocket, codec: report.codec }));
