import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import * as old from '../volume-v2/voxel-world.mjs';
import * as current from './voxel-world.mjs';
const out = new URL('./run-v1/', import.meta.url);
await mkdir(out, { recursive: true });
const identity = old.worldIdentity({ worldId: 'physical-height-query', seed: 'volume-v2-fixed-cave-pocket-v1' });
const report = { scope: 'same voxel recipe/codec with narrowed exact physical-height query; no new world or physics', checks: [], errors: [] };
const a = old.createVoxelWorld(identity), b = current.createVoxelWorld(identity);
const check = (name, run) => { run(); report.checks.push(name); };
try {
  check('same full world identity, material definitions and initial save', () => {
    assert.deepEqual(current.worldIdentity({ worldId: identity.worldId, seed: identity.base.heightSeed }), identity);
    assert.deepEqual(current.MATERIAL, old.MATERIAL); assert.deepEqual(a.save(), b.save());
  });
  const bricks = [{ x: 1, y: -4, z: -5 }, { x: 1, y: -3, z: -5 }, { x: 1, y: -4, z: -4 }, { x: 1, y: -3, z: -4 },
    { x: -1, y: -1, z: -1 }, { x: 0, y: -1, z: -1 }, { x: -1, y: -1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: -1, y: 0, z: -1 }, { x: 0, y: 0, z: -1 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  const snapshots = [];
  const startA = performance.now();
  for (const brick of bricks) snapshots.push(a.readBrick(brick));
  const oldMs = performance.now() - startA, startB = performance.now();
  for (let i = 0; i < bricks.length; i++) assert.deepEqual(b.readBrick(bricks[i]), snapshots[i]);
  const newMs = performance.now() - startB;
  report.checks.push('every byte of12 actual cave/negative-boundary/near-surface bricks remains identical');
  report.observation = { oldMs, newMs, bricks: bricks.length, decodedCells: bricks.length * 4096,
    old: a.stats(), current: b.stats(), limitation: 'single sequential shared-host observation, not controlled speedup benchmark; output comparisons included in candidate time' };
  const at = { x: 19, y: -47, z: -62 }, material = a.read(at);
  check('actual edit/eviction and both codec directions preserve canonical state', () => {
    const edit = { expectedRevision: 0, cells: [{ ...at, expectedMaterial: material, material: material === old.MATERIAL.air ? old.MATERIAL.stone : old.MATERIAL.air }] };
    assert.deepEqual(a.edit(edit), b.edit(edit)); a.evictAll(); b.evictAll();
    assert.equal(a.read(at), b.read(at)); assert.deepEqual(a.save(), b.save());
    const oldFromNew = old.createVoxelWorld(identity, { checkpoint: JSON.parse(JSON.stringify(b.save())) });
    const newFromOld = current.createVoxelWorld(identity, { checkpoint: JSON.parse(JSON.stringify(a.save())) });
    assert.equal(oldFromNew.read(at), newFromOld.read(at)); assert.deepEqual(oldFromNew.save(), newFromOld.save());
  });
  const saved = b.save();
  await writeFile(new URL('world.json', out), JSON.stringify(saved));
  const restored = current.createVoxelWorld(identity, { checkpoint: JSON.parse(await readFile(new URL('world.json', out), 'utf8')) });
  assert.deepEqual(restored.save(), saved); assert.equal(restored.read(at), b.read(at));
  report.checks.push('actual file reopen restores the same generated and changed voxel');
} catch (e) { report.errors.push(e.stack); process.exitCode = 1; }
report.hashes = {};
for (const file of ['./voxel-world.mjs', './qualify.mjs', '../volume-v2/voxel-world.mjs', '../height-sea/terrain.js'])
  report.hashes[file] = createHash('sha256').update(await readFile(new URL(file, import.meta.url))).digest('hex');
await writeFile(new URL('proof.json', out), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ checks: report.checks.length, errors: report.errors, observation: report.observation && { oldMs: report.observation.oldMs, newMs: report.observation.newMs, bricks: report.observation.bricks } }));
