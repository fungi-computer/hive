import { worldIdentity, createVoxelWorld, MATERIAL } from '../height-caves.mjs';
import { createWorldSpec, sampleTerrain } from '../height.js';
import { createVolume, createVolumeGeometry, balanceTolerance } from '../../engine/environment/soil/index.js';
import { requireCondition, metric } from './world-binding.mjs';
const REFERENCE_SOIL = Object.freeze({ id: 'synthetic-rigid-loam-si-v1', thetaR: 0.05, porosity: 0.45, alphaPerM: 2, n: 2, ksMPerS: 1e-4, ell: 0.5, minHeadM: -4, maxHeadM: 8, densityKgM3: 1000 });
import { createExcavationAdapter } from './excavation.mjs';

// One fixed generated location, never a terrain/seed search. These are explicit
// initial water stocks from the retained synthetic law, not generated moisture.
export function createWetClearing({ soleTargetAnchor = false, connected = false } = {}) {
  const spec = createWorldSpec({ seed: 'hive-world-lab-seed-20260907' });
  const id = worldIdentity({ worldId: 'one-generated-soil-excavation', seed: spec.seed });
  const world = createVoxelWorld(id), cells = [];
  let target = null;
  for (const x of connected ? [-1, 0, 1, 2] : [-1, 0, 1])
    for (const z of connected ? [127, 128, 129, 130] : [127, 128, 129]) {
    const { bedLevel } = sampleTerrain(spec, x, z, 1);
    requireCondition(Number.isSafeInteger(bedLevel) && bedLevel > 0, 'wet-clearing recipe is inland above sea datum');
    for (const y of [bedLevel - 2, bedLevel - 1]) {
      requireCondition(world.readPoint({ x, y, z }) === MATERIAL.soil, 'wet-clearing recipe has its two real generated soil layers');
      cells.push({ at: [x, y, z], soilId: REFERENCE_SOIL.id });
    }
    if (x === 0 && z === 128) target = [x, bedLevel - 1, z];
  }
  const descriptor = { regionId: 'generated-pit-region', revision: world.describe().revision,
    spacingM: metric(world).spacingM, exterior: 'closed', definitions: [REFERENCE_SOIL],
    cells, reservoirs: [], ports: [], closedFaces: [] };
  const geometry = createVolumeGeometry(descriptor), soil = createVolume(descriptor);
  const targetId = `cell:${target.join(',')}`;
  const waterTableYM = target[1] * descriptor.spacingM[1] + .15;
  const stocks = geometry.nodes.map(node => ({ nodeId: node.id,
    massKg: 1000 * node.volumeM3 * geometry.soils[node.soilId].at(soleTargetAnchor
      ? node.id !== targetId ? 0 : -.5
      : waterTableYM - node.centerM[1]).theta }));
  const water = soil.initial({ stocks });
  const adapter = createExcavationAdapter({ worldIdentity: id, baseSoilGeometry: soil.geometry, surfaceCoefficient: .5 });
  const input = adapter.initial({ world: world.save(), soilState: water });
  // The registered recipe owns its starting stock. A composed consumer must
  // additionally qualify any external boundary against its actual counterpart.
  function parseState(value) {
    const state = adapter.parse(value);
    requireCondition(state.soilState.initialTotalKg === input.soilState.initialTotalKg,
      'clearing retains its defined initial water stock');
    return state;
  }
  function parseClosedState(value) {
    const state = parseState(value), facts = adapter.read(state);
    requireCondition(Math.abs(facts.balance.exchangeWaterKg) <= balanceTolerance(facts.soil.totalMassKg),
      'closed clearing has no external water exchange');
    return state;
  }
  return { adapter, input, parseState, parseClosedState, target, targetId, command: { at: target }, source: { id, columns: connected ? 16 : 9,
    generatedSoilCells: cells.length, seed: spec.seed, waterTableYM, soleTargetAnchor } };
}
