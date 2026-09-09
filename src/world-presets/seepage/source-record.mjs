import { MATERIAL } from '../height-caves.mjs';
import { balanceTolerance, compensatedSum } from '../../engine/environment/soil/index.js';
import { key, xyz, same, exactFields, requireCondition } from './world-binding.mjs';

const soilNodeId = at => `cell:${key(at)}`;

/** Material interpretation belongs to this preset. The world supplies original
 * provenance; an absent water node never implies an impermeable dry material. */
export function removalSource(config, world, at) {
  const materialId = world.inspect(xyz(at)).generatedMaterial;
  const common = { id: `excavation:cell:${key(at)}`, at: [...at], materialId, quantity: 1 };
  if (materialId === MATERIAL.soil) {
    const source = config.baseSoilGeometry.cells.find(cell => same(cell.at, at));
    requireCondition(source, 'excavation soil has canonical water ownership');
    return { ...common, kind: 'porous', nodeId: soilNodeId(at), soilId: source.soilId };
  }
  requireCondition(materialId === MATERIAL.stone, 'excavation requires supported original soil or impermeable stone');
  return { ...common, kind: 'impermeable' };
}

function validateRecord(config, entry, source, voxelM3) {
  requireCondition(source && entry.kind === source.kind, 'unique removal source and material kind');
  const fields = source.kind === 'porous'
    ? ['id', 'kind', 'at', 'materialId', 'quantity', 'nodeId', 'soilId', 'waterKg', 'sourceVoxelM3']
    : ['id', 'kind', 'at', 'materialId', 'quantity', 'waterKg', 'sourceVoxelM3'];
  exactFields(entry, fields, 'exact tagged excavation source fields');
  requireCondition(Object.entries(source).every(([field, value]) => same(entry[field], value)) &&
    entry.sourceVoxelM3 === voxelM3, 'removal record matches canonical source material, coordinate and finite volume');
  if (source.kind === 'impermeable') {
    requireCondition(entry.waterKg === 0, 'impermeable removal exports zero water');
    return;
  }
  const node = config.baseNodes.get(source.nodeId);
  requireCondition(node && Number.isFinite(entry.waterKg) &&
    entry.waterKg >= node.minMassKg && entry.waterKg <= node.maxMassKg,
    'porous removal has actual source pore capacity');
}

export function validateLedger(config, state, facts, removed, voxelM3) {
  requireCondition(Array.isArray(state.exports) && state.exports.length === removed.length,
    'one excavation source record for each removed voxel');
  const expected = new Map(removed.map(source => [source.id, source]));
  for (const entry of state.exports) {
    const source = expected.get(entry.id);
    validateRecord(config, entry, source, voxelM3);
    expected.delete(entry.id);
  }
  requireCondition(state.exports.every((entry, i, entries) => i === 0 || entries[i - 1].id < entry.id),
    'excavation source records have canonical identity order');
  const exportWaterKg = compensatedSum(state.exports.map(entry => entry.waterKg));
  const pitWaterKg = compensatedSum(facts.nodes.filter(node => node.kind === 'pit').map(node => node.massKg));
  const totalWaterKg = compensatedSum([facts.totalMassKg, exportWaterKg]);
  requireCondition(Number.isFinite(state.initialWaterKg) && state.initialWaterKg > 0 &&
    Math.abs(totalWaterKg - state.initialWaterKg) <= balanceTolerance(state.initialWaterKg),
    'soil plus finite spoil plus columns must retain the original water total');
  return { retainedWaterKg: facts.totalMassKg - pitWaterKg, exportWaterKg, pitWaterKg,
    totalWaterKg, residualKg: totalWaterKg - state.initialWaterKg };
}
