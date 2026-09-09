import { requireCondition } from './soil.mjs';

// Surface connections have no private stock. Their endpoints are existing
// finite columns and the common opening is derived from actual voxel extents.
export function compileSurfaceEdges(inputs, nodes, spacing) {
  requireCondition(Array.isArray(inputs) && inputs.length <= 16, 'bounded surface connections');
  const index = new Map(nodes.flatMap((n, i) => n.kind === 'pit' ? [[n.reservoirId, i]] : []));
  const seen = new Set(), definitions = [], faces = [];
  for (const input of inputs) {
    requireCondition(input && typeof input === 'object' &&
      Object.keys(input).sort().join('|') === 'coefficient|left|right', 'exact surface connection fields');
    let left = index.get(input.left), right = index.get(input.right);
    requireCondition(left !== undefined && right !== undefined && left !== right,
      'surface connection joins two finite voxel columns');
    requireCondition(Number.isFinite(input.coefficient) && input.coefficient >= 0 && input.coefficient <= 1,
      'explicit dimensionless broad-crest coefficient in0..1');
    let a = nodes[left], b = nodes[right];
    requireCondition(Math.abs(a.at[0] - b.at[0]) + Math.abs(a.at[2] - b.at[2]) === 1,
      'surface columns share one horizontal face');
    const axis = a.at[0] !== b.at[0] ? 0 : 2;
    if (a.at[axis] > b.at[axis]) { [left, right] = [right, left]; [a, b] = [b, a]; }
    const baseLevel = Math.max(a.at[1], b.at[1]);
    const rimLevel = Math.min(a.at[1] + a.heightCells, b.at[1] + b.heightCells);
    requireCondition(baseLevel < rimLevel, 'surface connection has a real open vertical interval');
    requireCondition(a.at[1] + a.heightCells === b.at[1] + b.heightCells,
      'vented surface columns share one modeled rim; roof/orifice flow is unsupported');
    const at = [...a.at]; at[axis]++; at[1] = baseLevel;
    const id = `surface:${axis === 0 ? 'x' : 'z'}:${at.join(',')}`;
    requireCondition(!seen.has(id), 'one connection per physical surface opening'); seen.add(id);
    const openingLengthM = spacing[axis === 0 ? 2 : 0];
    faces.push(Object.freeze({ id, kind: 'surface', left, right, axis, at: Object.freeze(at),
      crestM: baseLevel * spacing[1], openingLengthM, coefficient: input.coefficient }));
    definitions.push(Object.freeze({ left: a.reservoirId, right: b.reservoirId, coefficient: input.coefficient }));
  }
  const order = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  faces.sort(order);
  definitions.sort((a, b) => a.left < b.left ? -1 : a.left > b.left ? 1 : a.right < b.right ? -1 : a.right > b.right ? 1 : 0);
  return { definitions: Object.freeze(definitions), faces: Object.freeze(faces) };
}
