import test from 'node:test';
import assert from 'node:assert/strict';
import { createVolume, createVolumeGeometry, compensatedSum } from './index.js';

function fixture(timeS, moving = false) {
  const definition = { id: 'clock-loam', thetaR: .05, porosity: .45, alphaPerM: 2,
    n: 2, ksMPerS: 1e-4, ell: .5, minHeadM: -4, maxHeadM: 8, densityKgM3: 1000 };
  const descriptor = { regionId: 'clock-volume', revision: 0, spacingM: [1, .54, 1], exterior: 'closed',
    definitions: [definition], cells: [[0, 0, 0], [1, 0, 0]].map(at => ({ at, soilId: definition.id })),
    reservoirs: [], ports: [], closedFaces: [], surfaceEdges: [] };
  const owner = createVolume(descriptor), geometry = createVolumeGeometry(descriptor);
  const initial = owner.initial({ stocks: geometry.nodes.map((node, i) => ({ nodeId: node.id,
    massKg: 1000 * node.volumeM3 * geometry.soils[definition.id].at(moving && i === 1 ? -.8 : -.2).theta })) });
  const state = owner.decode(JSON.stringify({ ...initial, timeS }));
  return { owner, state };
}

function assertSolved(result, startS, intervalS, expectedSteps, dtMaxS) {
  assert.equal(result.state.timeS, startS + intervalS);
  assert.equal(result.receipt.endS, result.state.timeS);
  assert.equal(result.receipt.steps.length, expectedSteps);
  assert.equal(compensatedSum(result.receipt.steps.map(step => step.dtS)), intervalS);
  let previous = startS;
  for (const step of result.receipt.steps) {
    assert.equal(step.startS, previous);
    assert.ok(step.endS > step.startS);
    assert.ok(step.dtS >= 1e-6 && step.dtS <= 120);
    assert.ok(step.dtS <= dtMaxS + 16 * Number.EPSILON * Math.max(1, intervalS, dtMaxS));
    previous = step.endS;
  }
}

test('nonzero64s clock solves the complete1s interval in ten decimal steps', () => {
  const { owner, state } = fixture(64);
  const frozen = JSON.stringify(state);
  const result = owner.advance(state, 1, { dtMaxS: .1, maxSteps: 10 });
  assertSolved(result, 64, 1, 10, .1);
  assert.deepEqual(result.state.massKg, state.massKg);
  assert.equal(JSON.stringify(state), frozen);
  assert.equal(result.receipt.rejectedStages.length, 0);
});

test('512 accepted steps do not accumulate absolute-clock rounding into an unsolved tail', () => {
  const { owner, state } = fixture(1_000_000);
  const result = owner.advance(state, 12.8, { dtMaxS: .025, maxSteps: 512 });
  assertSolved(result, 1_000_000, 12.8, 512, .025);
  assert.deepEqual(result.state.massKg, state.massKg);
});

test('each recorded dt owns the actual paired material solve and restart remains exact', () => {
  const { owner, state } = fixture(64, true);
  const result = owner.advance(state, 1, { dtMaxS: .1 });
  assertSolved(result, 64, 1, 10, .1);
  assert.notDeepEqual(result.state.massKg, state.massKg);
  const fromZero = fixture(0, true);
  const translated = fromZero.owner.advance(fromZero.state, 1, { dtMaxS: .1 });
  assert.deepEqual(result.state.massKg, translated.state.massKg);
  assert.deepEqual(result.receipt.faceTransferKg, translated.receipt.faceTransferKg);
  for (const step of result.receipt.steps)
    assert.ok(step.metrics.pairKg <= 2e-9 && step.metrics.mixedKg <= 2e-9);
  const fresh = createVolume(owner.geometry);
  const restored = fresh.decode(owner.encode(result.state));
  assert.deepEqual(fresh.advance(restored, 1, { dtMaxS: .1 }).state,
    owner.advance(result.state, 1, { dtMaxS: .1 }).state);
});

test('largest physical step remains bounded and a nondecimal final interval is solved', () => {
  const { owner, state } = fixture(64);
  const result = owner.advance(state, 240.25, { dtMaxS: 120, maxSteps: 3 });
  assertSolved(result, 64, 240.25, 3, 120);
  assert.deepEqual(result.receipt.steps.map(step => step.dtS), [120, 120, .25]);
});

test('coarse absolute timestamp rejects before physical work without corrupting current state', () => {
  const { owner, state } = fixture(1e12), frozen = owner.encode(state);
  assert.throws(() => owner.advance(state, 1, { dtMaxS: .1 }), /clock resolution/);
  assert.equal(owner.encode(state), frozen);
  const unchanged = owner.advance(state, 0, { dtMaxS: .1 });
  assert.equal(unchanged.state, state);
  assert.equal(unchanged.receipt.steps.length, 0);
});
