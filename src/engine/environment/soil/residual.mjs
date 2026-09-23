import { requireCondition } from './soil.mjs';
import { darcyFaces } from './faces.mjs';

// Solver-owned working arrays only. No canonical initial water or accepted
// state is created by compiling/evaluating geometry or a trial pressure.
export function mixedResidual(g, oldMassKg, headInput, dtS) {
  const count = g.nodes.length;
  requireCondition(Array.isArray(oldMassKg) && oldMassKg.length === count &&
    oldMassKg.every((m, i) => Number.isFinite(m) && m >= g.nodes[i].minMassKg && m <= g.nodes[i].maxMassKg),
    'one finite canonical stock per physical node');
  requireCondition((Array.isArray(headInput) || headInput instanceof Float64Array) && headInput.length === count,
    'one derived pressure unknown per graph node');
  requireCondition(Number.isFinite(dtS) && dtS > 0 && dtS <= 120, 'bounded positive backward-Euler interval');
  const heads = Float64Array.from(headInput), massFromHeadKg = new Float64Array(count),
    capacityKgPerM = new Float64Array(count), fields = [];
  for (const [i, node] of g.nodes.entries()) {
    requireCondition(Number.isFinite(heads[i]) && heads[i] >= node.minHeadM && heads[i] <= node.maxHeadM,
      'derived head inside physical node definition envelope');
    requireCondition(node.kind !== 'reservoir' || node.portCount === 1 || heads[i] > 0,
      'multi-port reservoir must stay wet; dry suction pass-through unsupported');
    if (node.kind === 'soil') {
      const f = g.soils[node.soilId].at(heads[i]), factor = g.densityKgM3 * node.volumeM3;
      fields.push(f); massFromHeadKg[i] = factor * f.theta; capacityKgPerM[i] = factor * f.capacityPerM;
    } else {
      const factor = g.densityKgM3 * node.areaM2;
      fields.push(null); massFromHeadKg[i] = factor * Math.max(heads[i], 0);
      capacityKgPerM[i] = heads[i] >= 0 ? factor : 0;
    }
  }
  const face = darcyFaces(g, heads, fields);
  const residualKg = Float64Array.from(massFromHeadKg, (mass, i) => mass - oldMassKg[i]);
  for (const [k, f] of g.faces.entries()) {
    const transferKg = g.densityKgM3 * dtS * face.volumeRateM3S[k];
    residualKg[f.left] += transferKg; residualKg[f.right] -= transferKg;
  }
  requireCondition(residualKg.every(Number.isFinite), 'finite paired mixed mass residual');
  return { headM: heads, massFromHeadKg, capacityKgPerM, residualKg, ...face };
}
