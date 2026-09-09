import test from 'node:test';
import assert from 'node:assert/strict';
import { createWetClearing } from './wet-clearing.mjs';
import { createExcavationAdapter } from './excavation.mjs';
import { createVolumeGeometry } from '../../engine/environment/soil/index.js';
import { createVoxelWorld, MATERIAL } from '../height-caves.mjs';
import { deriveTopology } from './topology.mjs';

const bounds = { min: [-4, 11, 124], max: [5, 18, 133] };
const column = (adapter, state, at) => adapter.read(state).soil.nodes.find(node =>
  node.kind === 'pit' && node.at[0] === at[0] && node.at[2] === at[2]);

test('two real generated cuts regenerate shared contacts, preserve prior water and exchange through one face', () => {
  const { adapter, input, command, target, source } = createWetClearing({ connected: true });
  assert.equal(source.generatedSoilCells, 32);
  const first = adapter.excavate(input, command).state;
  const wet = adapter.advance(first, 300).state;
  const before = column(adapter, wet, target), frozen = adapter.encode(wet);
  assert.ok(before.massKg > 0);
  const nextAt = [target[0] + 1, target[1], target[2]];
  const second = adapter.excavate(wet, { at: nextAt }).state;
  assert.equal(adapter.encode(wet), frozen);
  const retained = column(adapter, second, target), newColumn = column(adapter, second, nextAt);
  assert.equal(retained.nodeId, before.nodeId);
  assert.equal(retained.massKg, before.massKg);
  assert.equal(newColumn.massKg, 0);
  assert.equal(second.soilState.timeS, wet.soilState.timeS);
  assert.equal(second.soilState.steps, wet.soilState.steps);
  assert.equal(second.world.revision, 2);
  assert.equal(second.exports.length, 2);
  const flowing = adapter.advance(second, 6);
  const surfaces = flowing.receipt.faceIds.flatMap((id, i) => id.startsWith('surface:') ? [i] : []);
  assert.equal(surfaces.length, 1);
  assert.ok(flowing.receipt.faceTransferKg[surfaces[0]] > 0);
  assert.ok(column(adapter, flowing.state, nextAt).massKg > 0);
  assert.ok(Math.abs(flowing.balance.residualKg) < 2e-9);
  const scene = adapter.scene(flowing.state, bounds);
  assert.equal(scene.water.length, 2);
  assert.deepEqual(scene.water.map(water => water.id), scene.water.map(water => water.id).sort());
  assert.equal(scene.cells.filter(cell => cell.theta !== null).length, 30);
  const fresh = createExcavationAdapter(adapter.definition);
  const restored = fresh.decode(adapter.encode(flowing.state));
  assert.deepEqual(fresh.advance(restored, 6).state, adapter.advance(flowing.state, 6).state);
});

test('unknown side water, unowned stone excavation and corruption reject without changing the current owner', () => {
  const { adapter, input, target } = createWetClearing({ connected: true });
  const cut = adapter.excavate(input, { at: target }).state, frozen = adapter.encode(cut);
  assert.throws(() => adapter.excavate(cut, { at: [target[0], target[1] - 2, target[2]] }), /remaining owned/);
  assert.throws(() => adapter.excavate(cut, { at: [-1, target[1], target[2]] }), /canonical water ownership/);
  const duplicate = structuredClone(cut); duplicate.exports.push({ ...duplicate.exports[0] });
  assert.throws(() => adapter.parse(duplicate), /one wet-spoil/);
  const missing = structuredClone(cut); missing.exports.length = 0;
  assert.throws(() => adapter.parse(missing), /one wet-spoil/);
  const wrong = structuredClone(cut); wrong.soilState.identity += 'wrong';
  assert.throws(() => adapter.parse(wrong), /identity/);
  const outside = structuredClone(cut);
  const world = createVoxelWorld(outside.world.identity, { checkpoint: outside.world });
  assert.equal(world.readPoint({ x: 3, y: target[1], z: target[2] }), MATERIAL.soil);
  assert.equal(world.edit({ expectedRevision: 1, cells: [{ x: 3, y: target[1], z: target[2],
    expectedMaterial: MATERIAL.soil, material: MATERIAL.air }] }).ok, true);
  outside.world = world.save();
  assert.throws(() => adapter.parse(outside), /exactly match the removed/);
  assert.equal(adapter.encode(cut), frozen);
});

test('deepening to real generated stone makes a0.54m ledge and preserves the same water owner', () => {
  const { adapter, input, command, target } = createWetClearing({ connected: true });
  const first = adapter.advance(adapter.excavate(input, command).state, 300).state;
  const nextAt = [1, target[1], target[2]];
  const two = adapter.excavate(first, { at: nextAt }).state;
  const deepAt = [nextAt[0], nextAt[1] - 1, nextAt[2]];
  const lowerBefore = column(adapter, two, nextAt), frozen = adapter.encode(two);
  const deep = adapter.excavate(two, { at: deepAt }).state;
  const lowerAfter = column(adapter, deep, deepAt);
  assert.equal(adapter.encode(two), frozen);
  assert.equal(lowerAfter.nodeId, lowerBefore.nodeId);
  assert.equal(lowerAfter.massKg, lowerBefore.massKg);
  assert.equal(lowerAfter.bottom, 'sealed');
  assert.equal(lowerAfter.heightCells, 2);
  assert.equal(lowerAfter.capacityKg, 1080);
  assert.equal(lowerAfter.rimYM, lowerBefore.rimYM);
  assert.equal(deep.exports.length, 3);
  assert.equal(deep.soilState.timeS, two.soilState.timeS);
  assert.equal(deep.soilState.steps, two.soilState.steps);
  const currentWorld = createVoxelWorld(deep.world.identity, { checkpoint: deep.world });
  assert.equal(currentWorld.readPoint({ x: deepAt[0], y: deepAt[1] - 1, z: deepAt[2] }), MATERIAL.stone);
  const { owner } = deriveTopology(adapter.definition, currentWorld);
  const coarse = adapter.advance(deep, 6);
  const fine = owner.advance(deep.soilState, 6, { dtMaxS: .1 });
  const edge = coarse.receipt.faceIds.findIndex(id => id.startsWith('surface:'));
  assert.ok(edge >= 0 && coarse.receipt.faceTransferKg[edge] > 0);
  assert.ok(column(adapter, coarse.state, deepAt).massKg > 0);
  assert.ok(Math.abs(coarse.balance.residualKg) < 2e-9);
  // Predeclared game-scale comparison for this generated32-node/6s consumer:
  // water-height error within1% of one0.54m voxel, alongside strict conservation.
  const reference = owner.read(fine.state).nodes.filter(node => node.kind === 'pit');
  const errorM = Math.max(...reference.map(node => Math.abs(node.depthM -
    adapter.read(coarse.state).soil.nodes.find(actual => actual.nodeId === node.nodeId).depthM)));
  assert.ok(errorM <= .0054, `six-second water-height error${errorM}m`);
  const fresh = createExcavationAdapter(adapter.definition);
  const restored = fresh.decode(adapter.encode(coarse.state));
  assert.deepEqual(fresh.advance(restored, 6).state, adapter.advance(coarse.state, 6).state);
});

test('all known stock capacities are derived from current world geometry, without saved duplicate columns', () => {
  const recipe = createWetClearing({ connected: true }), { adapter, input } = recipe;
  assert.equal(Object.hasOwn(recipe, 'world'), false, 'recipe exposes no second mutable world');
  const geometry = createVolumeGeometry(adapter.definition.baseSoilGeometry);
  assert.equal(geometry.nodes.length, 32);
  assert.deepEqual(Object.keys(input).sort(), ['version', 'identity', 'world', 'soilState', 'initialWaterKg', 'exports'].sort());
  assert.throws(() => adapter.parse({ ...input, soilGeometry: geometry.descriptor }), /checkpoint fields/);
});
