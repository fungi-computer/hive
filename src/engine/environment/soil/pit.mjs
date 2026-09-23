import { requireCondition } from './soil.mjs';

const equalAt = (a, b) => a.every((n, i) => n === b[i]);

/** A pit is a real one-voxel basin, with one porous floor and any actual soil sides. */
export function pitNode(input, attached, cells, spacing) {
  const at = input.at, heightM = spacing[1], areaM2 = spacing[0] * spacing[2];
  const baseYM = at[1] * heightM, rimYM = (at[1] + 1) * heightM;
  requireCondition(!cells.some(cell => equalAt(cell.at, at)), 'pit and porous cell cannot share a voxel');
  const roles = attached.map(port => {
    const delta = cells[port.cell].at.map((n, i) => n - at[i]);
    requireCondition(delta.reduce((n, d) => n + Math.abs(d), 0) === 1,
      'pit contacts are actual adjacent voxel faces');
    const axis = delta.findIndex(d => d !== 0), sign = -delta[axis];
    requireCondition(port.face.axis === axis && port.sign === sign && !(axis === 1 && delta[1] === 1),
      'pit has inward side/floor ports and no soil roof');
    return { ...port, role: axis === 1 ? 'floor' : 'side' };
  });
  const floors = roles.filter(p => p.role === 'floor'), sides = roles.filter(p => p.role === 'side');
  requireCondition(floors.length === 1 && sides.length <= 4, 'one porous pit floor and at most four soil sides');
  const attachedNodes = new Set(roles.map(port => port.cell));
  for (const [index, cell] of cells.entries()) {
    const delta = cell.at.map((n, i) => n - at[i]);
    if (delta.reduce((n, d) => n + Math.abs(d), 0) !== 1) continue;
    requireCondition(attachedNodes.has(index), 'every adjacent porous cell binds its actual unlined pit face');
  }
  const floor = floors[0], floorCell = cells[floor.cell];
  requireCondition(floorCell.maxHeadM >= heightM, 'pit rim lies within its floor retention envelope');
  requireCondition(floor.face.centerM[1] === baseYM && floor.face.areaM2 === areaM2 &&
    sides.every(p => p.face.centerM[1] === (at[1] + .5) * heightM && p.face.areaM2 === areaM2 * heightM / spacing[p.face.axis]),
    'actual pit floor and side dimensions');
  return Object.freeze({ id: `reservoir:${input.id}`, reservoirId: input.id, kind: 'pit', at,
    elevationM: baseYM, baseYM, rimYM, areaM2, heightM, portCount: attached.length,
    floorNode: floor.cell, floorFaceId: floor.face.id,
    sideNodes: Object.freeze(sides.map(p => p.cell).sort((a, b) =>
      cells[a].id < cells[b].id ? -1 : cells[a].id > cells[b].id ? 1 : 0)),
    minHeadM: floorCell.minHeadM, maxHeadM: heightM,
    minMassKg: 0, maxMassKg: 1000 * areaM2 * heightM });
}

// A saturated side above the dry basin bottom must expose an atmospheric
// seepage reference. This supplies a deterministic initial guess, not a saved
// pressure or a permanent zero-psi constraint on the one floor multiplier.
export function dryPitReference(g, massKg, index) {
  const node = g.nodes[index];
  return node.kind === 'pit' && massKg[index] === 0 &&
    node.sideNodes.some(i => massKg[i] === g.nodes[i].maxMassKg);
}
