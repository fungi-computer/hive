import test from 'node:test';
import assert from 'node:assert/strict';
import { createVolume, createVolumeGeometry } from './index.js';

function fixture(waterKg = 3.4, reservoir = false) {
  const soil = { id: 'exchange-loam', thetaR: .05, porosity: .45, alphaPerM: 2,
    n: 2, ksMPerS: 1e-4, ell: .5, minHeadM: -4, maxHeadM: 8, densityKgM3: 1000 };
  const cells = reservoir ? [[0, 0, 0], [0, 0, 1]] : [[0, 0, 0], [0, 1, 0]];
  const descriptor = { regionId: 'finite-exchange', revision: 0, spacingM: [1, .54, 1], exterior: 'closed',
    definitions: [soil], cells: cells.map(at => ({ at, soilId: soil.id })),
    reservoirs: [reservoir ? { id: 'water', areaM2: 1 } :
      { id: 'water', kind: 'vented-pit', at: [1, 0, 0], heightCells: 2, bottom: 'sealed' }],
    ports: cells.map(cell => ({ cell, side: 'x+', reservoirId: 'water' })), closedFaces: [] };
  const owner = createVolume(descriptor), geometry = createVolumeGeometry(descriptor);
  const state = owner.initial({ stocks: geometry.nodes.map(node => ({ nodeId: node.id,
    massKg: node.kind === 'soil' ? 100 : waterKg })) });
  return { owner, geometry, state };
}
const command = (direction, massKg, nodeId = 'reservoir:water') => ({ nodeId, direction, massKg });
const water = (owner, state) => owner.read(state).nodes.find(node => node.nodeId === 'reservoir:water').massKg;

test('2kg withdrawal/deposit preserves fractional field stock, fixed reference and clock', () => {
  const { owner, state } = fixture(), before = owner.encode(state);
  const draw = owner.exchange(state, command('withdraw', 2));
  assert.equal(owner.encode(state), before);
  assert.equal(water(owner, draw.state), 1.4);
  assert.equal(draw.state.initialTotalKg, state.initialTotalKg);
  assert.equal(draw.state.boundaryKg, -2);
  assert.equal(draw.state.timeS, state.timeS); assert.equal(draw.state.steps, state.steps);
  assert.deepEqual(draw.state.massKg.slice(0, 2), state.massKg.slice(0, 2));
  assert.deepEqual(draw.receipt, { nodeId: 'reservoir:water', direction: 'withdraw', massKg: 2,
    beforeKg: 3.4, afterKg: 1.4, boundaryBeforeKg: 0, boundaryAfterKg: -2, timeS: 0 });
  assert.ok(Object.isFrozen(draw.state) && Object.isFrozen(draw.state.massKg) && Object.isFrozen(draw.receipt));
  const fresh = createVolume(owner.geometry), reopened = fresh.decode(owner.encode(draw.state));
  assert.deepEqual(fresh.exchange(reopened, command('deposit', 2)).state, state);
  assert.equal(owner.read(draw.state).totalMassKg, state.initialTotalKg - 2);
  const next = owner.advance(draw.state, .2, { dtMaxS: .1 });
  assert.equal(next.state.timeS, .2); assert.equal(next.state.steps, 2);
  assert.equal(next.state.initialTotalKg, state.initialTotalKg); assert.equal(next.state.boundaryKg, -2);
  assert.deepEqual(next.state, fresh.advance(reopened, .2, { dtMaxS: .1 }).state);
  assert.ok(Math.abs(next.receipt.aggregateResidual.totalKg) < 2e-9);
});

test('stock eligibility is strict even within solver tolerance; invalid commands leave inputs unchanged', () => {
  const { owner, state } = fixture(), before = owner.encode(state);
  for (const invalid of [command('withdraw', 3.4 + 1e-12), command('deposit', 1080 - 3.4 + 1e-12),
    command('deposit', 0), command('withdraw', -1), command('deposit', NaN), command('deposit', Infinity),
    command('withdraw', 1, 'absent'), command('withdraw', 1, 'cell:0,0,0'),
    { ...command('withdraw', 1), extra: true }, command('other', 1)]) {
    assert.throws(() => owner.exchange(state, invalid));
    assert.equal(owner.encode(state), before);
  }
  const empty = owner.exchange(state, command('withdraw', 3.4)).state;
  assert.equal(water(owner, empty), 0);
  assert.throws(() => owner.exchange(empty, command('withdraw', Number.MIN_VALUE)), /insufficient/);
  const full = owner.exchange(empty, command('deposit', 1080)).state;
  assert.equal(water(owner, full), 1080);
  assert.throws(() => owner.exchange(full, command('deposit', Number.MIN_VALUE)), /capacity/);
  const { owner: limited, state: wet } = fixture(3.4, true), frozen = limited.encode(wet);
  assert.throws(() => limited.exchange(wet, command('withdraw', 3.4)), /wet multi-port/);
  assert.equal(limited.encode(wet), frozen);
});

test('boundary arithmetic rejects a failed second half while exactly represented tiny stock is legal', () => {
  const { owner, state } = fixture(0);
  const tiny = owner.exchange(state, command('deposit', 1e-15));
  assert.equal(water(owner, tiny.state), 1e-15); assert.equal(tiny.state.boundaryKg, 1e-15);
  assert.deepEqual(owner.exchange(tiny.state, command('withdraw', 1e-15)).state, state);
  // Algebraically consistent current wire, but its large opposing ledger terms
  // cannot resolve a2kg operation safely. Node arithmetic alone would succeed.
  const coarse = owner.decode(JSON.stringify({ ...state, massKg: [100, 100, 800],
    initialTotalKg: 2 ** 54 + 1000, boundaryKg: -(2 ** 54) }));
  const frozen = owner.encode(coarse);
  assert.throws(() => owner.exchange(coarse, command('withdraw', 2)), /arithmetic resolution/);
  assert.equal(owner.encode(coarse), frozen);
  const active = fixture(3.4), prior = active.owner.encode(active.state);
  assert.throws(() => active.owner.exchange(active.state, command('withdraw', Number.MIN_VALUE)), /arithmetic resolution/);
  assert.equal(active.owner.encode(active.state), prior);
});

test('current canonical boundary rejects predecessor fields, accessors and corrupt balances', () => {
  const { owner, state } = fixture();
  const old = { ...state }; delete old.boundaryKg;
  assert.throws(() => owner.decode(JSON.stringify(old)), /fields/);
  assert.throws(() => owner.decode(JSON.stringify({ ...state, boundaryKg: 1 })), /mass balance/);
  assert.throws(() => owner.decode(JSON.stringify({ ...state, initialTotalKg: 1e300, boundaryKg: -1e300 })), /mass balance/);
  assert.throws(() => owner.decode(JSON.stringify({ ...state, version: 'rigid-richards-connected-volume-be-v1' })), /identity/);
  let accessed = 0;
  const input = { ...state }, cmd = command('deposit', 2);
  Object.defineProperty(input, 'boundaryKg', { enumerable: true, get() { accessed++; return 0; } });
  Object.defineProperty(cmd, 'massKg', { enumerable: true, get() { accessed++; return 2; } });
  assert.throws(() => owner.exchange(input, command('deposit', 2)), /fields/);
  assert.throws(() => owner.exchange(state, cmd), /fields/);
  const entries = [...state.massKg];
  Object.defineProperty(entries, '0', { enumerable: true, get() { accessed++; return 100; } });
  assert.throws(() => owner.exchange({ ...state, massKg: entries }, command('deposit', 2)), /entries/);
  assert.equal(accessed, 0);
});
