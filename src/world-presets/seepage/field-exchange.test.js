import test from 'node:test';
import assert from 'node:assert/strict';
import { createWetClearing } from './wet-clearing.mjs';
import { createExcavationAdapter } from './excavation.mjs';
import { compensatedSum } from '../../engine/environment/soil/index.js';

const transfer = (direction, massKg) => ({ nodeId: 'reservoir:column-p0-p128', direction, massKg });
const pit = (adapter, state) => adapter.read(state).soil.nodes.find(node => node.nodeId === transfer('', 0).nodeId);
function fixture() {
  const recipe = createWetClearing({ connected: true });
  return { ...recipe, state: recipe.adapter.excavate(recipe.input, recipe.command).state };
}
function physical(adapter, state) {
  const facts = adapter.read(state), S = compensatedSum(state.exports.map(entry => entry.waterKg));
  assert.ok(Math.abs(facts.balance.residualKg) < 2e-9);
  assert.equal(facts.balance.exportWaterKg, S);
  assert.equal(facts.balance.exchangeWaterKg, compensatedSum([state.soilState.boundaryKg, S]));
  assert.equal(Object.hasOwn(state, 'initialWaterKg'), false);
  return facts;
}

test('adapter transfers retain world/source/cache identity while field reference and clock stay fixed', () => {
  const { adapter, input, state } = fixture(), wire = adapter.encode(state);
  const supplied = adapter.exchange(state, transfer('deposit', 3.4));
  const drawn = adapter.exchange(supplied.state, transfer('withdraw', 2));
  assert.equal(pit(adapter, drawn.state).massKg, 1.4);
  assert.strictEqual(drawn.state.world, state.world); assert.strictEqual(drawn.state.exports, state.exports);
  assert.equal(drawn.state.soilState.initialTotalKg, input.soilState.initialTotalKg);
  assert.equal(drawn.state.soilState.timeS, state.soilState.timeS);
  assert.equal(drawn.state.soilState.steps, state.soilState.steps);
  assert.equal(adapter.encode(state), wire);
  assert.ok(Math.abs(physical(adapter, drawn.state).balance.exchangeWaterKg - 1.4) < 2e-11);
  const fresh = createExcavationAdapter(adapter.definition), reopened = fresh.decode(adapter.encode(drawn.state));
  assert.deepEqual(reopened, drawn.state);
  const next = adapter.advance(drawn.state, .2);
  assert.deepEqual(next.state, fresh.advance(reopened, .2).state);
  assert.equal(next.state.soilState.boundaryKg, drawn.state.soilState.boundaryKg);
  assert.equal(next.state.soilState.timeS, .2);
  physical(adapter, next.state);
  assert.throws(() => { adapter.read(drawn.state).balance.exchangeWaterKg = 0; }, TypeError);
  const rejected = adapter.encode(drawn.state);
  for (const command of [transfer('withdraw', 2), transfer('deposit', 1000),
    transfer('deposit', Number.MIN_VALUE), { ...transfer('withdraw', 1), nodeId: 'cell:0,13,128' }]) {
    assert.throws(() => adapter.exchange(drawn.state, command));
    assert.equal(adapter.encode(drawn.state), rejected);
  }
});

test('deposited water and actual porous removal share one boundary; stone preserves it and the same column', () => {
  const { adapter, input, state } = fixture();
  const deposited = adapter.exchange(state, transfer('deposit', 400)).state;
  // High real surface drives water into initially unsaturated exposed soil.
  // No pore mass is edited by the test or added through a soil-node operation.
  const soaked = adapter.advance(deposited, 1).state;
  const before = adapter.read(soaked), initialSoil = adapter.read(deposited).soil.nodes
    .filter(node => node.kind === 'soil').reduce((sum, node) => sum + node.massKg, 0);
  const afterSoil = before.soil.nodes.filter(node => node.kind === 'soil').reduce((sum, node) => sum + node.massKg, 0);
  assert.ok(afterSoil > initialSoil, 'actual deposit wets the surrounding owned soil');
  const removed = before.soil.nodes.find(node => node.nodeId === 'cell:0,13,128');
  const deep = adapter.excavate(soaked, { at: [0, 13, 128] }).state;
  assert.equal(deep.soilState.initialTotalKg, input.soilState.initialTotalKg);
  assert.equal(deep.soilState.boundaryKg, soaked.soilState.boundaryKg - removed.massKg);
  assert.equal(deep.exports.find(entry => entry.nodeId === removed.nodeId).waterKg, removed.massKg);
  assert.equal(pit(adapter, deep).massKg, pit(adapter, soaked).massKg);
  assert.equal(deep.soilState.timeS, soaked.soilState.timeS); assert.equal(deep.soilState.steps, soaked.soilState.steps);
  assert.ok(Math.abs(physical(adapter, deep).balance.exchangeWaterKg - 400) < 2e-11);
  const rock = adapter.excavate(deep, { at: [0, 12, 128] }).state;
  assert.deepEqual(rock.soilState.massKg, deep.soilState.massKg);
  assert.equal(rock.soilState.initialTotalKg, deep.soilState.initialTotalKg);
  assert.equal(rock.soilState.boundaryKg, deep.soilState.boundaryKg);
  assert.equal(pit(adapter, rock).heightCells, 3);
  physical(adapter, rock);
  const fresh = createExcavationAdapter(adapter.definition), restored = fresh.decode(adapter.encode(rock));
  assert.deepEqual(restored, rock);
  const moving = adapter.advance(rock, .2);
  assert.deepEqual(moving.state, fresh.advance(restored, .2).state);
  assert.equal(moving.state.soilState.boundaryKg, rock.soilState.boundaryKg);
  const drawn = adapter.exchange(moving.state, transfer('withdraw', 2));
  assert.ok(Math.abs(physical(adapter, drawn.state).balance.exchangeWaterKg - 398) < 2e-11);
});

test('one fixed reference replaces the outer field and exposes, rather than fabricates, a missing counterpart', () => {
  const { adapter, state } = fixture();
  const imported = adapter.exchange(state, transfer('deposit', 2)).state;
  const wire = adapter.encode(imported);
  assert.deepEqual(adapter.decode(wire), imported);
  assert.equal(physical(adapter, imported).balance.exchangeWaterKg, 2);
  // The physical parser admits a paid-by-caller boundary, without claiming a
  // material lot exists. The game's independent joined admission must close it.
  assert.throws(() => adapter.parse({ ...imported, initialWaterKg: imported.soilState.initialTotalKg }), /fields/);
  assert.throws(() => adapter.parse({ ...imported, version: 'height-caves-connected-excavation-v6' }), /identity/);
  const corrupt = structuredClone(imported); corrupt.soilState.boundaryKg += 1;
  assert.throws(() => adapter.parse(corrupt), /mass balance/);
  assert.equal(adapter.encode(imported), wire);
});
