import { worldIdentity, createVoxelWorld, MATERIAL } from '../world-presets/height-caves.mjs';
import { createWorldSpec, sampleTerrain } from '../world-presets/height.js';
import { createVolume, createVolumeGeometry } from '../engine/environment/soil/index.js';
import { requireCondition, metric } from '../world-presets/seepage/world-binding.mjs';
const REFERENCE_SOIL = Object.freeze({ id: 'synthetic-rigid-loam-si-v1', thetaR: 0.05, porosity: 0.45, alphaPerM: 2, n: 2, ksMPerS: 1e-4, ell: 0.5, minHeadM: -4, maxHeadM: 8, densityKgM3: 1000 });
import { createExcavationAdapter } from '../world-presets/seepage/excavation.mjs';

// One fixed generated location, never a terrain/seed search. These are explicit
// initial water stocks from the retained synthetic law, not generated moisture.
export function fixedExcavationFixture({ soleTargetAnchor = false } = {}) {
  const spec = createWorldSpec({ seed: 'hive-world-lab-seed-20260907' });
  const id = worldIdentity({ worldId: 'one-generated-soil-excavation', seed: spec.seed });
  const world = createVoxelWorld(id), cells = [];
  let target = null;
  for (const x of [-1, 0, 1]) for (const z of [127, 128, 129]) {
    const { bedLevel } = sampleTerrain(spec, x, z, 1);
    requireCondition(Number.isSafeInteger(bedLevel) && bedLevel > 0, 'fixed fixture is inland above sea datum');
    for (const y of [bedLevel - 2, bedLevel - 1]) {
      requireCondition(world.readPoint({ x, y, z }) === MATERIAL.soil, 'fixed fixture has its two real generated soil layers');
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
  const adapter = createExcavationAdapter({ worldIdentity: id, regionId: descriptor.regionId });
  const input = adapter.initial({ world: world.save(), soilGeometry: soil.geometry, soilState: water });
  return { adapter, input, target, targetId, command: { operationId: 'first-wet-soil-cut',
    expectedWorldRevision: input.world.revision, at: target }, world, source: { id, columns: 9,
    generatedSoilCells: cells.length, seed: spec.seed, waterTableYM, soleTargetAnchor } };
}
