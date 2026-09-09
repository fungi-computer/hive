import test from 'node:test';
import assert from 'node:assert/strict';
import { createWetClearing } from './wet-clearing.mjs';
import { createExcavationAdapter } from './excavation.mjs';

const bounds = { min: [-1, 12, 127], max: [3, 17, 131] };

test('retained admission cannot leak a successful or failed excavation into an older world', () => {
  const { adapter, input, command } = createWetClearing({ connected: true });
  const originalScene = adapter.scene(input, bounds), wire = adapter.encode(input);
  const next = adapter.excavate(input, command).state;
  assert.deepEqual(adapter.scene(input, bounds), originalScene);
  assert.equal(adapter.encode(input), wire);
  assert.equal(adapter.scene(next, bounds).water.length, 1);
  const nextScene = adapter.scene(next, bounds);
  assert.throws(() => adapter.excavate(next, { at: [-1, 14, 128] }), /canonical water ownership/);
  assert.deepEqual(adapter.scene(next, bounds), nextScene);
  assert.deepEqual(adapter.scene(input, bounds), originalScene);

  // Equal world revision is not equal geography. Each owner-produced branch
  // keeps its actual cut, even after the original state's geometry was cached.
  const alternative = adapter.excavate(input, { at: [1, 14, 128] }).state;
  assert.equal(alternative.world.revision, next.world.revision);
  assert.notDeepEqual(adapter.scene(alternative, bounds), nextScene);
  for (const state of [input, next, alternative]) {
    const fresh = createExcavationAdapter(adapter.definition);
    const reopened = fresh.decode(adapter.encode(state));
    assert.deepEqual(adapter.advance(state, .05), fresh.advance(reopened, .05));
  }
});

test('only admitted immutable checkpoints reuse derived data; untrusted wire and read projections cannot poison it', () => {
  const { adapter, input, command } = createWetClearing({ connected: true });
  const cut = adapter.excavate(input, command).state;
  const prior = adapter.encode(cut), facts = adapter.read(cut);
  assert.throws(() => { facts.soil.nodes[0].massKg = 0; }, TypeError);
  assert.throws(() => { facts.contacts[0].neighbor[0] = 99; }, TypeError);
  assert.throws(() => { facts.balance.totalWaterKg = 0; }, TypeError);
  const exposedScene = adapter.scene(cut, bounds);
  exposedScene.exports[0].waterKg = 0;
  exposedScene.water[0].at[0] = 999;
  assert.equal(adapter.encode(cut), prior);

  const wire = structuredClone(cut);
  const admitted = adapter.parse(wire);
  wire.exports[0].waterKg += 1;
  assert.throws(() => adapter.parse(wire), /retain the original water/);
  assert.equal(adapter.encode(admitted), prior);
  let calls = 0;
  const accessor = { ...cut };
  Object.defineProperty(accessor, 'soilState', { enumerable: true, get() { calls++; return cut.soilState; } });
  Object.freeze(accessor);
  assert.throws(() => adapter.parse(accessor), /region-record-invalid/);
  assert.equal(calls, 0);
  assert.deepEqual(adapter.read(cut), facts);
});
