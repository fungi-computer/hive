import test from 'node:test';
import assert from 'node:assert/strict';
import { createVolume, createVolumeGeometry, compensatedSum } from './index.js';
import { mixedResidual } from './residual.mjs';
import { canonicalAnchors } from './state.mjs';

const loam = (conductivity = 1e-4) => ({ id: 'floor-loam', thetaR: .05, porosity: .45,
  alphaPerM: 2, n: 2, ksMPerS: conductivity, ell: .5, minHeadM: -4, maxHeadM: 8, densityKgM3: 1000 });
function descriptor(cells, reservoirs, ports, surfaceEdges = [], conductivity = 1e-4) {
  return { regionId: 'sealed-floor', revision: 0, spacingM: [1, .54, 1], exterior: 'closed',
    definitions: [loam(conductivity)], cells: cells.map(at => ({ at, soilId: 'floor-loam' })),
    reservoirs, ports, surfaceEdges, closedFaces: [] };
}
function open(value, water = {}, head = null) {
  const geometry = createVolumeGeometry(value), owner = createVolume(value);
  const state = owner.initial({ stocks: geometry.nodes.map(node => ({ nodeId: node.id,
    massKg: node.kind === 'soil' ? head === null ? node.maxMassKg :
      1000 * node.volumeM3 * geometry.soils[node.soilId].at(head - node.centerM[1]).theta :
      water[node.reservoirId] ?? 0 })) });
  return { descriptor: value, geometry, owner, state };
}
function sideColumn() {
  return descriptor([[0, 0, 0], [0, 1, 0]],
    [{ id: 'well', kind: 'vented-pit', at: [1, 0, 0], heightCells: 2, bottom: 'sealed' }],
    [{ cell: [0, 0, 0], side: 'x+', reservoirId: 'well' },
      { cell: [0, 1, 0], side: 'x+', reservoirId: 'well' }]);
}
const water = (owner, state, id = 'well') => owner.read(state).nodes.find(node => node.nodeId === `reservoir:${id}`);
function conserved(before, after) {
  assert.ok(Math.abs(compensatedSum(before.massKg) - compensatedSum(after.massKg)) <= 2e-9);
}

test('dry sealed column wets through real side ports without a floor node or external water', () => {
  const { geometry, owner, state } = open(sideColumn());
  const index = geometry.nodes.findIndex(node => node.kind === 'pit'), node = geometry.nodes[index];
  assert.equal(node.bottom, 'sealed'); assert.equal(node.minHeadM, 0);
  assert.equal(node.maxMassKg, 1080);
  assert.equal(Object.hasOwn(node, 'floorNode'), false);
  assert.equal(Object.hasOwn(node, 'floorFaceId'), false);
  assert.equal(geometry.nodes.filter(node => node.kind === 'soil').length, 2);
  const incident = geometry.faces.filter(face => face.left === index || face.right === index);
  assert.equal(incident.length, 2); assert.ok(incident.every(face => face.pitRole === 'side'));
  const anchor = canonicalAnchors(geometry, state.massKg).find(anchor => anchor.node === index);
  assert.equal(anchor.headM, 0);
  const frozen = JSON.stringify(state), result = owner.advance(state, 2, { dtMaxS: .1 });
  assert.equal(JSON.stringify(state), frozen);
  assert.ok(water(owner, result.state).massKg > 0);
  assert.ok(result.work.maxDryDirectionCorrectionM < 1e-18);
  assert.equal(water(owner, result.state).bottom, 'sealed');
  conserved(state, result.state);
  for (const step of result.receipt.steps) {
    assert.ok(step.massKg[index] >= 0 && step.headM[index] >= 0);
    assert.equal(step.headM[index], step.massKg[index] / 1000);
  }
});

test('an empty sealed column has no suction branch or withdrawal into dry unsaturated sides', () => {
  const { owner, geometry, state } = open(sideColumn(), {}, -.5);
  const result = owner.advance(state, 1, { dtMaxS: .1 });
  assert.equal(water(owner, result.state).massKg, 0);
  conserved(state, result.state);
  const heads = geometry.nodes.map(node => node.kind === 'soil' ? -.5 - node.centerM[1] : -1e-5);
  assert.throws(() => mixedResidual(geometry, state.massKg, heads, .1), /head inside physical/);
});

test('deepening remaps the same finite water identity and exports only the removed soil stock', () => {
  const original = descriptor([[0, 0, 0], [0, 1, 0], [1, 0, 0]],
    [{ id: 'well', kind: 'vented-pit', at: [1, 1, 0], heightCells: 1, bottom: 'porous' }],
    [{ cell: [1, 0, 0], side: 'y+', reservoirId: 'well' },
      { cell: [0, 1, 0], side: 'x+', reservoirId: 'well' }]);
  const before = open(original, { well: 100 });
  const wet = before.owner.advance(before.state, 1, { dtMaxS: .1 }).state;
  const priorFacts = before.owner.read(wet), removed = priorFacts.nodes.find(node => node.nodeId === 'cell:1,0,0');
  const next = open(sideColumn());
  const retained = new Map(priorFacts.nodes.map(node => [node.nodeId, node.massKg]));
  const remapped = next.owner.initial({ stocks: next.geometry.nodes.map(node => ({ nodeId: node.id,
    massKg: retained.get(node.id) })) });
  const state = next.owner.decode(JSON.stringify({ ...remapped, timeS: wet.timeS, steps: wet.steps }));
  assert.equal(water(before.owner, wet).capacityKg, 540);
  assert.equal(water(next.owner, state).capacityKg, 1080);
  assert.equal(water(next.owner, state).massKg, water(before.owner, wet).massKg);
  assert.equal(state.timeS, wet.timeS); assert.equal(state.steps, wet.steps);
  assert.ok(Math.abs(compensatedSum(state.massKg) + removed.massKg - compensatedSum(wet.massKg)) <= 2e-9);
  const fresh = createVolume(next.owner.geometry), restored = fresh.decode(next.owner.encode(state));
  assert.deepEqual(fresh.advance(restored, 1, { dtMaxS: .1 }).state,
    next.owner.advance(state, 1, { dtMaxS: .1 }).state);
});

function ledge(conductivity = 1e-4, coefficient = .5, quantities = { upper: 270 }) {
  return open(descriptor([[0, 0, 0], [0, -1, 0]],
    [{ id: 'upper', kind: 'vented-pit', at: [0, 1, 0], heightCells: 1, bottom: 'porous' },
      { id: 'lower', kind: 'vented-pit', at: [1, 0, 0], heightCells: 2, bottom: 'sealed' }],
    [{ cell: [0, 0, 0], side: 'y+', reservoirId: 'upper' },
      { cell: [0, 0, 0], side: 'x+', reservoirId: 'lower' }],
    [{ left: 'upper', right: 'lower', coefficient }], conductivity), quantities);
}

test('real0.54m ledge and sealed receiver share the original mass solve and constitutive chord', () => {
  const { geometry, owner, state } = ledge();
  const surface = geometry.faces.findIndex(face => face.kind === 'surface');
  assert.equal(geometry.faces[surface].crestM, .54);
  assert.equal(water(owner, state, 'upper').rimYM, water(owner, state, 'lower').rimYM);
  const result = owner.advance(state, 2, { dtMaxS: .1 });
  assert.ok(result.receipt.faceTransferKg[surface] > 0);
  assert.ok(water(owner, result.state, 'lower').massKg > 0);
  conserved(state, result.state);
  for (const step of result.receipt.steps) assert.equal(step.ledger.treeCorrectionKg[surface], 0);
  const closed = ledge(1e-4, 0), shut = closed.owner.advance(closed.state, 2, { dtMaxS: .1 });
  assert.equal(shut.receipt.faceTransferKg[surface], 0);
  conserved(closed.state, shut.state);
});

test('sealed ledge drainage refines toward the independent free-overflow curve', () => {
  const { owner, state } = ledge(1e-8);
  const expected = (.27 ** (-.5) + .5 * Math.sqrt(9.81) / 2) ** (-2);
  const coarse = owner.advance(state, 1, { dtMaxS: .1 }), fine = owner.advance(state, 1, { dtMaxS: .025 });
  const coarseError = Math.abs(water(owner, coarse.state, 'upper').depthM - expected);
  const fineError = Math.abs(water(owner, fine.state, 'upper').depthM - expected);
  assert.ok(fineError < coarseError * .4 && fineError < .002);
  conserved(state, fine.state);
});

test('bottom declarations reject missing policy, fictitious floor ports and unsupported side envelopes', () => {
  const missing = sideColumn(); delete missing.reservoirs[0].bottom;
  assert.throws(() => createVolume(missing), /explicit porous or sealed/);
  const porous = sideColumn(); porous.reservoirs[0].bottom = 'porous';
  assert.throws(() => createVolume(porous), /exactly one actual floor/);
  const noSide = sideColumn(); noSide.ports = [];
  assert.throws(() => createVolume(noSide), /physical port/);
  const floorPort = sideColumn(); floorPort.cells.push({ at: [1, -1, 0], soilId: 'floor-loam' });
  floorPort.ports.push({ cell: [1, -1, 0], side: 'y+', reservoirId: 'well' });
  assert.throws(() => createVolume(floorPort), /sealed column has no floor ports/);
  const lowHead = sideColumn(); lowHead.definitions[0].maxHeadM = .1;
  assert.throws(() => createVolume(lowHead), /side retention envelopes/);
  assert.throws(() => createVolume({ ...sideColumn(), version: 'rigid-soil-voxel-columns-v2' }), /descriptor version/);
});
