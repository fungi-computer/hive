import test from 'node:test';
import assert from 'node:assert/strict';
import { createWetClearing } from './wet-clearing.mjs';
import { createExcavationAdapter } from './excavation.mjs';
import { deriveTopology } from './topology.mjs';
import { createVolumeGeometry, balanceTolerance, REGION_LIMITS } from '../../engine/environment/soil/index.js';
import { createVoxelWorld, MATERIAL } from '../height-caves.mjs';
import { parseTerrain, terrainDigProblem } from '../goblin-terrain.ts';

const findPit = (facts, x) => facts.soil.nodes.find(node => node.kind === 'pit' && node.at[0] === x);
const stocks = facts => new Map(facts.soil.nodes.map(node => [node.nodeId, node.massKg]));

function ledge() {
  const recipe = createWetClearing({ connected: true }), { adapter } = recipe;
  const wet = adapter.advance(adapter.excavate(recipe.input, recipe.command).state, 300).state;
  const next = adapter.excavate(wet, { at: [1, 14, 128] }).state;
  const two = adapter.excavate(next, { at: [1, 13, 128] }).state;
  // Actual flow from the previously qualified ledge supplies the receiving
  // shaft's water. A stone cut must preserve nonzero stock, not just zero.
  return { ...recipe, two: adapter.advance(two, 6).state };
}

function compareFlow(adapter, state) {
  const world = createVoxelWorld(state.world.identity, { checkpoint: state.world });
  const { owner } = deriveTopology(adapter.definition, world);
  const coarse = adapter.advance(state, 6), fine = owner.advance(state.soilState, 6, { dtMaxS: .1 });
  const facts = adapter.read(coarse.state), reference = owner.read(fine.state);
  const errorM = Math.max(...reference.nodes.filter(node => node.kind === 'pit').map(node =>
    Math.abs(node.depthM - facts.soil.nodes.find(actual => actual.nodeId === node.nodeId).depthM)));
  assert.ok(errorM <= .0054, `predeclared water-height error ${errorM} m`);
  for (const result of [coarse, fine]) {
    assert.ok(result.receipt.aggregateResidual.pairKg <= 2e-9);
    assert.ok(result.receipt.maxAbsMetrics.mixedKg <= 2e-9);
    assert.ok(result.receipt.maxAbsMetrics.faceLawKg <= 2e-9);
  }
  assert.ok(Math.abs(facts.balance.residualKg) <= balanceTolerance(state.initialWaterKg));
  const geometry = createVolumeGeometry(owner.geometry);
  facts.soil.nodes.forEach((node, i) => {
    assert.ok(node.massKg >= geometry.nodes[i].minMassKg && node.massKg <= geometry.nodes[i].maxMassKg);
  });
  assert.equal(geometry.nodes.filter(node => node.kind === 'soil').length, 29);
  const lower = geometry.nodes.find(node => node.kind === 'pit' && node.at[0] === 1);
  assert.equal(lower.bottom, 'sealed');
  assert.equal(Object.hasOwn(lower, 'floorNode'), false);
  assert.equal(Object.hasOwn(lower, 'floorFaceId'), false);
  const lowerIndex = geometry.nodes.indexOf(lower);
  assert.ok(geometry.faces.every(face => !(face.pitRole === 'floor' &&
    (face.left === lowerIndex || face.right === lowerIndex))));
  // Numerical continuity closure must not create an exchange through stone.
  const sealedContacts = adapter.read(state).contacts.filter(face => face.material === 'stone');
  assert.ok(sealedContacts.length > 0);
  assert.ok(sealedContacts.every(face => !coarse.receipt.faceIds.includes(face.faceId)));
  const edge = coarse.receipt.faceIds.findIndex(id => id.startsWith('surface:'));
  assert.ok(edge >= 0 && coarse.receipt.faceTransferKg[edge] > 0, 'actual signed downhill transfer');
  return { state: coarse.state, owner, measurement: { heightCells: lower.heightCells,
    errorM, residualKg: facts.balance.residualKg, pairKg: coarse.receipt.aggregateResidual.pairKg,
    surfaceTransferKg: coarse.receipt.faceTransferKg[edge], coarseSteps: coarse.receipt.steps.length,
    fineSteps: fine.receipt.steps.length, matrixUpdates: coarse.work.matrixUpdates } };
}

test('actual generated stone deepens a wet column through y=0 to17 cells with the same stock and clock', t => {
  const { adapter, two } = ledge(), before = adapter.read(two), wire = adapter.encode(two);
  const lower = findPit(before, 1);
  assert.ok(lower.massKg > 0);
  const three = adapter.excavate(two, { at: [1, 12, 128] }).state;
  const threeFacts = adapter.read(three), threePit = findPit(threeFacts, 1);
  assert.deepEqual(stocks(threeFacts), stocks(before));
  assert.equal(threePit.nodeId, lower.nodeId);
  assert.equal(threePit.capacityKg, 1620);
  assert.equal(threePit.baseYM, 12 * .54);
  assert.equal(threePit.rimYM, 15 * .54);
  assert.equal(threeFacts.timeS, before.timeS);
  assert.equal(threeFacts.steps, before.steps);
  assert.equal(three.initialWaterKg, two.initialWaterKg);
  assert.equal(three.soilState.initialTotalKg, two.soilState.initialTotalKg);
  assert.deepEqual(three.exports.filter(entry => entry.kind === 'porous'), two.exports);
  const stone = three.exports.find(entry => entry.kind === 'impermeable');
  assert.deepEqual(stone, { id: 'excavation:cell:1,12,128', kind: 'impermeable',
    at: [1, 12, 128], materialId: MATERIAL.stone, quantity: 1, waterKg: 0, sourceVoxelM3: .54 });
  assert.equal(adapter.encode(two), wire);
  const shortFlow = compareFlow(adapter, three);
  let state = shortFlow.state;
  const retained = stocks(adapter.read(state)), retainedTime = state.soilState.timeS;
  const retainedSteps = state.soilState.steps;
  for (let y = 11; y >= -2; y--) {
    const previous = state, frozen = adapter.encode(previous);
    state = adapter.excavate(previous, { at: [1, y, 128] }).state;
    assert.equal(adapter.encode(previous), frozen);
    assert.deepEqual(stocks(adapter.read(state)), retained);
    assert.equal(state.soilState.timeS, retainedTime);
    assert.equal(state.soilState.steps, retainedSteps);
    assert.equal(state.soilState.initialTotalKg, previous.soilState.initialTotalKg);
  }
  const deep = adapter.read(state), deepPit = findPit(deep, 1);
  assert.equal(deepPit.nodeId, lower.nodeId);
  assert.equal(deepPit.heightCells, 17);
  assert.equal(deepPit.baseYM, -1.08);
  assert.equal(deepPit.rimYM, 15 * .54);
  assert.equal(deepPit.capacityKg, 9180);
  assert.equal(state.world.revision, 18);
  assert.equal(state.exports.length, 18);
  assert.equal(state.exports.filter(entry => entry.kind === 'porous').length, 3);
  assert.equal(state.exports.filter(entry => entry.kind === 'impermeable').length, 15);
  assert.ok(state.exports.every(entry => entry.quantity === 1 && entry.sourceVoxelM3 === .54));
  const world = createVoxelWorld(state.world.identity, { checkpoint: state.world });
  assert.equal(world.inspect({ x: 1, y: -2, z: 128 }).generatedMaterial, MATERIAL.stone);
  assert.equal(world.readPoint({ x: 1, y: -2, z: 128 }), MATERIAL.air);
  assert.equal(world.readPoint({ x: 1, y: -3, z: 128 }), MATERIAL.stone);
  const fresh = createExcavationAdapter(adapter.definition), restored = fresh.decode(adapter.encode(state));
  assert.deepEqual(restored, state);
  const deepFlow = compareFlow(adapter, state);
  assert.deepEqual(fresh.advance(restored, 6).state, deepFlow.state);
  assert.deepEqual(fresh.decode(adapter.encode(deepFlow.state)), deepFlow.state);
  assert.equal(REGION_LIMITS.maxColumnHeightCells, 32);
  assert.throws(() => createVolumeGeometry({ ...deepFlow.owner.geometry,
    reservoirs: deepFlow.owner.geometry.reservoirs.map(column => column.id === 'column-p1-p128'
      ? { ...column, heightCells: 33 } : column) }), /column height in1\.\.32/);
  t.diagnostic(JSON.stringify({ threeCell: shortFlow.measurement, seventeenCell: deepFlow.measurement,
    initialWaterKg: state.initialWaterKg, removedSoil: 3, removedStone: 15,
    removedVolumeM3: state.exports.length * .54, hydraulicUnknowns: deep.soil.nodes.length }));
});

test('stone source provenance, exact tagged fields and unsupported topology reject without mutating admitted state', () => {
  const { adapter, input } = createWetClearing({ connected: true });
  let state = adapter.excavate(input, { at: [1, 14, 128] }).state;
  state = adapter.excavate(state, { at: [1, 13, 128] }).state;
  state = adapter.excavate(state, { at: [1, 12, 128] }).state;
  const frozen = adapter.encode(state), facts = adapter.read(state);
  for (const change of [
    entry => { entry.waterKg = .1; }, entry => { entry.materialId = MATERIAL.soil; },
    entry => { entry.quantity = 2; }, entry => { entry.sourceVoxelM3 *= 2; },
    entry => { entry.at[0] = 2; }, entry => { entry.id = 'excavation:cell:2,12,128'; },
    entry => { entry.nodeId = 'fake-soil'; }, entry => { entry.soilId = 'fake-soil'; },
    entry => { entry.kind = 'porous'; },
  ]) {
    const forged = structuredClone(state);
    change(forged.exports.find(entry => entry.kind === 'impermeable'));
    assert.throws(() => adapter.parse(forged));
  }
  const missing = structuredClone(state); missing.exports.pop();
  assert.throws(() => adapter.parse(missing), /one excavation source/);
  const duplicate = structuredClone(state); duplicate.exports[0] = duplicate.exports[1];
  assert.throws(() => adapter.parse(duplicate), /unique removal source/);
  const old = { ...state, version: 'height-caves-connected-excavation-v5' };
  assert.throws(() => adapter.parse(old), /identity/);
  assert.throws(() => adapter.excavate(state, { at: [1, 12, 128] }), /remaining original solid/);
  assert.throws(() => adapter.excavate(state, { at: [1, 10, 128] }), /deepen the bottom/);
  assert.throws(() => adapter.excavate(state, { at: [2, 12, 128] }), /deepen the bottom/);
  assert.throws(() => adapter.excavate(input, { at: [1, 13, 128] }), /unobstructed vertical vent/);
  // Neither the main target gate nor its current soil-only save/yield contract
  // is broadened by a more capable independent engine consumer.
  assert.equal(typeof terrainDigProblem(state, [1, 11, 128]), 'string');
  assert.throws(() => parseTerrain(state), /Main-game stone material yields/);
  assert.equal(adapter.encode(state), frozen);
  assert.deepEqual(adapter.read(state), facts);
});
