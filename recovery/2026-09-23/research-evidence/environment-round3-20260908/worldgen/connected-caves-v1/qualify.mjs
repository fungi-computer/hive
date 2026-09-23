import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createVoxelWorld, worldIdentity, MATERIAL } from './voxel-world.mjs';
import { createVoxelWorld as createOld, worldIdentity as oldIdentity } from '../volume-query-v1/voxel-world.mjs';
import { createCaveFeatures, CAVE_FEATURE_RECIPE } from './features.mjs';
import { createWorldSpec } from '../height-sea/terrain.js';

const start = performance.now(), checks = [], fixtures = [];
const output = new URL('./run-v1/', import.meta.url);
await mkdir(output, { recursive: true });
const digest = b => createHash('sha256').update(b).digest('hex');
const id = worldIdentity({ worldId: 'connected-cave-fixed-fixture-v1' });
const world = createVoxelWorld(id), old = createOld(oldIdentity({ worldId: id.worldId }));
const features = createCaveFeatures({ spec: createWorldSpec(), units: id.base.units, bounds: id.base.bounds });
const key = ({ x, y, z }) => `${x},${y},${z}`;
const gridPoint = p => ({ x: Math.floor(p[0]), y: Math.floor(p[1] / 0.54), z: Math.floor(p[2]) });
const members = shape => {
  const { min, max } = shape.boundsMetres;
  const lo = gridPoint(min), hi = gridPoint(max), result = [];
  for (let z = lo.z; z <= hi.z; z++) for (let x = lo.x; x <= hi.x; x++) {
    const column = features.column(x, z);
    for (let y = lo.y; y <= hi.y; y++) if (column(y)) result.push({ x, y, z });
  }
  return result;
};
function componentOf(cells, entrance) {
  const set = new Set(cells.map(key)), visited = new Set(), pending = [entrance];
  assert(set.has(key(entrance)));
  while (pending.length) {
    const p = pending.pop(), k = key(p); if (visited.has(k) || !set.has(k)) continue;
    visited.add(k);
    for (const axis of ['x', 'y', 'z']) for (const sign of [-1, 1]) pending.push({ ...p, [axis]: p[axis] + sign });
  }
  return visited;
}
function brickAddresses(cells) {
  const addresses = new Map();
  for (const cell of cells) {
    const at = Object.fromEntries(['x', 'y', 'z'].map(a => [a, Math.floor(cell[a] / 16)]));
    addresses.set(key(at), at);
  }
  return [...addresses.values()].sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
}
const materialIndex = (p, origin) => ((p.y - origin.y) * 16 + p.z - origin.z) * 16 + p.x - origin.x;
const snapshots = new Map();

try {
  assert.notDeepEqual(id.base, oldIdentity({ worldId: id.worldId }).base);
  assert.equal(id.base.cave.sampleNamespace, 'height-sea-cave-density-v2');
  assert.throws(() => createVoxelWorld(id, { checkpoint: old.save() }), /mismatch/);
  checks.push({ name: 'new component identity; no silent old-world migration', pass: true });

  // Fixed before running: both are inland default-seed owner regions, one signed.
  for (const region of [{ x: 0, z: 4 }, { x: -1, z: 4 }]) {
    const shape = world.caveFeature(region);
    assert.equal(shape.present, true, `fixed region ${key({ ...region, y: 0 })} must have a pit; absence is a retained fixture failure`);
    const cells = members(shape), connected = componentOf(cells, shape.entranceCell), addresses = brickAddresses(cells);
    assert.equal(connected.size, cells.length, 'entire capsule/chamber union has six-face connectivity');
    assert(addresses.length > 1, 'feature crosses actual storage-brick boundaries');
    assert(cells.some(p => p.y < shape.bedLevel - id.base.cave.protectedSolidLayers));
    let preservedOutside = 0, newlyCarved = 0;
    for (const at of addresses) {
      const current = world.readBrick(at), before = old.readBrick(at);
      snapshots.set(key(at), { at, hash: digest(current.material) });
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const gx = current.origin.x + x, gz = current.origin.z + z, isFeature = features.column(gx, gz);
        for (let y = 0; y < 16; y++) {
          const gy = current.origin.y + y, index = (y * 16 + z) * 16 + x;
          if (isFeature(gy)) {
            assert.equal(current.material[index], MATERIAL.air, 'actual material caller carves the generated feature');
            newlyCarved += before.material[index] !== MATERIAL.air;
          } else { assert.equal(current.material[index], before.material[index], 'unrelated cavity/base geometry remains exact'); preservedOutside++; }
        }
      }
      for (const p of cells.filter(p => p.x >= current.origin.x && p.x < current.origin.x + 16 && p.y >= current.origin.y && p.y < current.origin.y + 16 && p.z >= current.origin.z && p.z < current.origin.z + 16))
        assert.equal(world.read(p), current.material[materialIndex(p, current.origin)], 'real point/brick caller agreement');
    }
    assert(newlyCarved > 0);
    for (const point of shape.pointsMetres) assert(connected.has(key(gridPoint(point))), 'every route junction lies in connected voxel void');
    const endpoint = shape.pointsMetres.at(-1);
    assert(Math.abs(endpoint[1] - ((shape.bedLevel - 18 + 0.5) * 0.54)) < 1e-12, 'logical y is converted to physical metres');
    fixtures.push({ region, shape, carvedFeatureCells: cells.length, connectedCells: connected.size, storageBricks: addresses.length,
      newlyCarvedFromOldSolid: newlyCarved, preservedOutsideCells: preservedOutside });
  }
  checks.push({ name: 'actual signed surface entrances, gallery/chamber and six-face connectivity', pass: true });

  world.evictAll(); const reverse = createVoxelWorld(id, { maxResidentBricks: 1 });
  for (const { at, hash } of [...snapshots.values()].reverse()) assert.equal(digest(reverse.readBrick(at).material), hash);
  assert(reverse.stats().residentBricks <= 1);
  const snapshot = reverse.caveFeature(fixtures[0].region); snapshot.pointsMetres[0][0] += 1000;
  assert.deepEqual(reverse.caveFeature(fixtures[0].region), fixtures[0].shape);
  checks.push({ name: 'request order, bounded eviction and descriptor snapshot ownership', pass: true });

  const entrance = fixtures[0].shape.entranceCell;
  assert.equal(world.read(entrance), MATERIAL.air);
  assert.equal(world.edit({ expectedRevision: 0, cells: [{ ...entrance, expectedMaterial: MATERIAL.air, material: MATERIAL.stone }] }).ok, true);
  const saved = world.save(); await writeFile(new URL('world.json', output), JSON.stringify(saved));
  world.evictAll();
  const reloaded = createVoxelWorld(id, { checkpoint: JSON.parse(await readFile(new URL('world.json', output), 'utf8')) });
  assert.deepEqual(reloaded.save(), saved); assert.equal(reloaded.read(entrance), MATERIAL.stone);
  const stale = reloaded.edit({ expectedRevision: 0, cells: [{ ...entrance, expectedMaterial: MATERIAL.stone, material: MATERIAL.air }] });
  assert.equal(stale.ok, false); assert.deepEqual(reloaded.save(), saved);
  const changedIdentity = structuredClone(saved); changedIdentity.identity.base.features.radiusMetres = 9;
  assert.throws(() => createVoxelWorld(id, { checkpoint: changedIdentity }), /mismatch/);
  reloaded.edit({ expectedRevision: 1, cells: [{ ...entrance, expectedMaterial: MATERIAL.stone, material: MATERIAL.air }] });
  assert.equal(reloaded.save().changes.length, 0); assert.equal(reloaded.save().revision, 2);
  checks.push({ name: 'filled entrance survives real file reopen; stale/foreign admission and base-equal reversion', pass: true });

  for (let x = -16; x < 16; x++) features.atRegion(x, 4);
  assert(features.stats().residentDescriptors <= CAVE_FEATURE_RECIPE.cacheCapRegions);
  assert.throws(() => features.column(-2049, 0), /outside/);
  assert.throws(() => features.column(0.5, 0), /integer/);
  assert.throws(() => features.atRegion(16, 4), /outside/);
  for (const y of [0.5, NaN, Infinity, -65, 64]) {
    assert.throws(() => features.column(0, 512)(y), /vertical voxel/);
    assert.throws(() => features.column(entrance.x, entrance.z)(y), /vertical voxel/);
  }
  checks.push({ name: 'bounded regional descriptors and explicit finite-domain admission', pass: true });
} catch (error) {
  checks.push({ pass: false, error: error.stack }); process.exitCode = 1;
}
const sources = {};
for (const name of ['voxel-world.mjs', 'features.mjs', 'qualify.mjs', 'CONTRACT.md']) {
  const bytes = await readFile(new URL(name, import.meta.url));
  sources[name] = digest(bytes); await writeFile(new URL(name, output), bytes);
}
const report = { pass: checks.every(c => c.pass), checks, fixtures, identity: id, sources,
  implementation: world.stats(), reverseOrderFixtures: snapshots.size, featureWork: features.stats(),
  elapsedMs: performance.now() - start, limits: ['voxel-centre geometry, not smooth collision', 'dry margin checks entrance column only; whole gallery may intersect outside terrain', 'pit is not a human-walkability/stair proof',
    'no initialized air/liquid or physical excavation settlement', 'no live game or browser integration', 'two fixed regions, not global capacity or full ecology'] };
await writeFile(new URL('proof.json', output), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, checks: report.checks, fixtureCounts: fixtures.map(f => ({ region: f.region, cells: f.carvedFeatureCells, bricks: f.storageBricks })),
  elapsedMs: report.elapsedMs, proof: output.pathname + 'proof.json' }));
