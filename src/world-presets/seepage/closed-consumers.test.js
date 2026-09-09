import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openRegion } from '../../engine/region/index.ts';
import { sqliteTestOwner } from '../../engine/region/sqlite-test-owner.mjs';
import { parseTerrain, parseClosedTerrain, advanceTerrain, terrainFacts, terrainCell, terrainWater,
  excavateTerrain } from '../goblin-terrain.ts';
import { createWetClearing } from './wet-clearing.mjs';
import { createWetRegionProgram } from './region.ts';

const transfer = { nodeId: 'reservoir:column-p0-p128', direction: 'deposit', massKg: 2 };
function fixture() {
  const recipe = createWetClearing({ connected: true });
  const state = recipe.adapter.excavate(recipe.input, recipe.command).state;
  return { ...recipe, state };
}
function rejectClosed(recipe, value, error) {
  assert.throws(() => recipe.parseClosedState(value), error);
  assert.throws(() => parseClosedTerrain(value), error);
  assert.throws(() => createWetRegionProgram().parseState({ environment: value }), error);
}

test('closed game and independent recipe preserve actual flow and porous export through fresh admission', () => {
  const recipe = fixture(), { adapter, state } = recipe;
  const flowing = adapter.advance(state, .2).state;
  const cut = adapter.excavate(flowing, { at: [1, 14, 128] }).state;
  const fresh = createWetClearing({ connected: true });
  const reopened = fresh.parseClosedState(fresh.adapter.decode(adapter.encode(cut)));
  assert.deepEqual(reopened, cut);
  assert.deepEqual(parseTerrain(structuredClone(cut)), cut);
  assert.deepEqual(createWetRegionProgram().parseState({ environment: cut }).environment, cut);
  assert.equal(reopened.soilState.initialTotalKg, recipe.input.soilState.initialTotalKg);
  assert.equal(reopened.soilState.timeS, .2);
  assert.equal(reopened.exports.length, 2);
});

test('closed consumers reject unpaired field deposits while intrinsic terrain keeps the registered baseline', () => {
  const recipe = fixture(), { adapter, state } = recipe;
  const forged = structuredClone(state);
  forged.exports[0].waterKg -= 1;
  // Intrinsic pore capacity is still valid. Only the composed closed balance
  // knows that the removed kg must remain in this exact spoil ledger.
  assert.doesNotThrow(() => adapter.parse(forged));
  rejectClosed(recipe, forged, /no external water exchange/);
  const supplied = adapter.exchange(state, transfer).state;
  assert.deepEqual(adapter.decode(adapter.encode(supplied)), supplied);
  rejectClosed(recipe, supplied, /no external water exchange/);
  for (const readOrChange of [() => terrainFacts(supplied), () => terrainWater(supplied),
    () => terrainCell(supplied, 7, 9), () => advanceTerrain(supplied, .2),
    () => excavateTerrain(supplied, [1, 14, 128])])
    assert.doesNotThrow(readOrChange);
  // Editing the historical reference as well would hide the transfer from a
  // net-exchange-only check. The concrete recipe owns the known starting stock.
  const hidden = structuredClone(supplied);
  hidden.soilState.initialTotalKg += 2;
  hidden.soilState.boundaryKg -= 2;
  assert.equal(adapter.read(hidden).balance.exchangeWaterKg, 0);
  rejectClosed(recipe, hidden, /defined initial water stock/);
});

test('the independent Region refuses an unpaired checkpoint on actual SQLite reopen', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const owner = sqliteTestOwner(db);
  const open = () => openRegion({ owner, region: 'closed-water', program: createWetRegionProgram() });
  const region = open();
  region.dispatch('wet-world-player', { id: 'cut', expectedRevision: 0,
    command: { kind: 'excavate', at: [0, 14, 128] } });
  const before = region.readCommitted();
  assert.deepEqual(open().readCommitted(), before);
  const recipe = createWetClearing({ connected: true });
  const environment = recipe.adapter.exchange(before.state.environment, transfer).state;
  const forged = JSON.stringify({ environment });
  db.prepare('UPDATE hive_region SET state_json=?,state_bytes=? WHERE singleton=1')
    .run(forged, Buffer.byteLength(forged));
  assert.throws(open, /no external water exchange/);
  assert.equal(db.prepare('SELECT state_json FROM hive_region WHERE singleton=1').get().state_json, forged);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM hive_region_receipts').get().n, 1);
});
