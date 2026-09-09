import test from 'node:test';
import assert from 'node:assert/strict';
import { createWetClearing } from './wet-clearing.mjs';
import { MATERIAL, createVoxelWorld } from '../height-caves.mjs';

const bounds = { min: [-4, 11, 124], max: [5, 18, 133] };
test('visible wet clearing reads edited voxels and actual finite water, surviving a fresh owner', () => {
  const recipe = createWetClearing(), { adapter, input, command, target } = recipe;
  const before = adapter.scene(input, bounds), canonical = adapter.encode(input);
  assert.equal(before.sampledCells, 567);
  const world = createVoxelWorld(input.world.identity, { checkpoint: input.world });
  for (const cell of before.cells) {
    const [x, y, z] = cell.at;
    assert.equal(cell.material, world.readPoint({ x, y, z }));
    assert.notEqual(cell.material, MATERIAL.air);
  }
  assert.equal(before.cells.filter(c => c.theta !== null).length, 18);
  before.cells[0].at[0] = 100; before.balance.totalWaterKg = 0;
  assert.equal(adapter.encode(input), canonical, 'returned scene is detached from physical state');
  const cut = adapter.excavate(input, command).state;
  const flowing = adapter.advance(cut, 60, { dtMaxS: 6 }).state;
  const scene = adapter.scene(flowing, bounds);
  assert.equal(scene.cells.some(c => c.at.every((n, i) => n === target[i])), false);
  assert.equal(scene.cells.filter(c => c.theta !== null).length, 17);
  assert.ok(scene.water.depthM > 0);
  assert.equal(scene.water.depthM * 1000, scene.water.massKg);
  assert.equal(scene.water.baseYM, target[1] * scene.spacingM[1]);
  assert.ok(Math.abs(scene.water.rimYM - scene.water.baseYM - scene.spacingM[1]) < 2e-15);
  assert.equal(scene.exports.length, 1);
  assert.ok(Math.abs(scene.balance.residualKg) < 2e-9);
  const fresh = createWetClearing();
  assert.deepEqual(fresh.adapter.scene(fresh.adapter.decode(adapter.encode(flowing)), bounds), scene);
});

test('scene requests reject oversized, outside, accessor and empty bounds before sampling', () => {
  const { adapter, input } = createWetClearing();
  assert.throws(() => adapter.scene(input, { min: [-20, -20, -20], max: [20, 20, 20] }), /budget/);
  assert.throws(() => adapter.scene(input, { min: [-5000, 0, 0], max: [0, 1, 1] }), /inside/);
  assert.throws(() => adapter.scene(input, { min: [0, 0, 0], max: [0, 1, 1] }), /nonempty/);
  let invoked = false;
  assert.throws(() => adapter.scene(input, { get min() { invoked = true; return [0, 0, 0]; }, max: [1, 1, 1] }), /fields/);
  assert.equal(invoked, false);
  const min = [0, 0, 0];
  Object.defineProperty(min, 0, { enumerable: true, get() { invoked = true; return 0; } });
  assert.throws(() => adapter.scene(input, { min, max: [1, 1, 1] }), /plain/);
  assert.equal(invoked, false);
});
