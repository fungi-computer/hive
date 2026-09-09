import { MATERIAL } from '../height-caves.mjs';
import { coordinate, exactFields, requireCondition, key, xyz } from './world-binding.mjs';

export const SCENE_CELL_LIMIT = 4096;

/** A bounded debug projection of the validated combined owner. No saved view state,
 * invented reservoir geometry, unknown water stock, or second material map. */
export function readScene(checked, state, input) {
  exactFields(input, ['min', 'max'], 'scene bounds');
  const min = coordinate(input.min), max = coordinate(input.max);
  const bounds = checked.world.describe().layout.bounds;
  const axes = ['X', 'Y', 'Z'];
  let count = 1;
  for (let i = 0; i < 3; i++) {
    requireCondition(min[i] < max[i] && min[i] >= bounds[`min${axes[i]}`] &&
      max[i] <= bounds[`max${axes[i]}`], 'nonempty scene bounds inside world');
    count *= max[i] - min[i];
  }
  requireCondition(count <= SCENE_CELL_LIMIT, 'scene cell budget exceeded');
  const pores = new Map(checked.facts.nodes.filter(n => n.kind === 'soil').map(n => [n.nodeId, n]));
  const cells = [];
  for (let y = min[1]; y < max[1]; y++) for (let z = min[2]; z < max[2]; z++)
    for (let x = min[0]; x < max[0]; x++) {
      const at = [x, y, z], material = checked.world.readPoint(xyz(at));
      if (material === MATERIAL.air) continue;
      const pore = pores.get(`cell:${key(at)}`);
      cells.push({ at, material, theta: pore?.theta ?? null });
    }
  const columns = checked.facts.nodes.filter(n => n.kind === 'pit');
  return {
    bounds: { min, max }, spacingM: [...checked.physical.spacingM],
    revision: state.world.revision, timeS: checked.soil.timeS,
    sampledCells: count, cells,
    // A null theta means unmodeled pore water, never a dry-soil assertion.
    water: columns.map(pit => ({ id: pit.nodeId, at: [...pit.at], depthM: pit.depthM, massKg: pit.massKg,
      baseYM: pit.baseYM, rimYM: pit.rimYM })),
    balance: { ...checked.balance }, exports: structuredClone(state.exports),
  };
}
