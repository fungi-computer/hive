import test from 'node:test';
import assert from 'node:assert/strict';
import { createWetClearing } from './wet-clearing.mjs';
import { createExcavationAdapter } from './excavation.mjs';
import { createVolumeGeometry } from '../../engine/environment/soil/index.js';

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

test('unknown side water, actual stone floor and corruption reject without changing the current owner', () => {
  const { adapter, input, target } = createWetClearing({ connected: true });
  const cut = adapter.excavate(input, { at: target }).state, frozen = adapter.encode(cut);
  assert.throws(() => adapter.excavate(cut, { at: [target[0], target[1] - 1, target[2]] }), /porous floor/);
  assert.throws(() => adapter.excavate(cut, { at: [-1, target[1], target[2]] }), /canonical water ownership/);
  const duplicate = structuredClone(cut); duplicate.exports.push({ ...duplicate.exports[0] });
  assert.throws(() => adapter.parse(duplicate), /one wet-spoil/);
  const missing = structuredClone(cut); missing.exports.length = 0;
  assert.throws(() => adapter.parse(missing), /one wet-spoil/);
  const wrong = structuredClone(cut); wrong.soilState.identity += 'wrong';
  assert.throws(() => adapter.parse(wrong), /identity/);
  assert.equal(adapter.encode(cut), frozen);
});

test('all known stock capacities are derived from current world geometry, without saved duplicate columns', () => {
  const { adapter, input } = createWetClearing({ connected: true });
  const geometry = createVolumeGeometry(adapter.definition.baseSoilGeometry);
  assert.equal(geometry.nodes.length, 32);
  assert.deepEqual(Object.keys(input).sort(), ['version', 'identity', 'world', 'soilState', 'initialWaterKg', 'exports'].sort());
  assert.throws(() => adapter.parse({ ...input, soilGeometry: geometry.descriptor }), /checkpoint fields/);
});
