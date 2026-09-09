import { requireCondition } from './soil.mjs';

const equalAt = (a, b) => a.every((n, i) => n === b[i]);

function bottomBoundary(input, floors, sides, cells, physical) {
  if (input.bottom === 'sealed') {
    requireCondition(floors.length === 0 && sides.length > 0,
      'sealed column has no floor ports and at least one actual porous side');
    requireCondition(sides.every(port => physical.rimYM - cells[port.cell].centerM[1] <= cells[port.cell].maxHeadM),
      'column rim lies within its side retention envelopes');
    // Without floor suction, negative trial heads would have zero storage and
    // zero side derivatives: a singular, nonphysical multiplier. Depth itself
    // is the pressure variable, including its exact dry endpoint at zero.
    return { bottom: 'sealed', minHeadM: 0 };
  }
  requireCondition(floors.length === 1, 'porous column has exactly one actual floor port');
  const floor = floors[0], floorCell = cells[floor.cell];
  requireCondition(floorCell.maxHeadM >= physical.heightM, 'pit rim lies within its floor retention envelope');
  requireCondition(floor.face.centerM[1] === physical.baseYM && floor.face.areaM2 === physical.areaM2,
    'actual pit floor dimensions');
  return { bottom: 'porous', minHeadM: floorCell.minHeadM,
    floorNode: floor.cell, floorFaceId: floor.face.id };
}

/** One finite vertical column: an explicit run of air voxels, an owned bottom,
 * and every modeled soil side. Height is physical capacity, never a drawing flag. */
export function pitNode(input, attached, cells, spacing) {
  const at = input.at, heightM = spacing[1] * input.heightCells, areaM2 = spacing[0] * spacing[2];
  const baseYM = at[1] * spacing[1], rimYM = (at[1] + input.heightCells) * spacing[1];
  const inColumn = point => point[0] === at[0] && point[2] === at[2] &&
    point[1] >= at[1] && point[1] < at[1] + input.heightCells;
  requireCondition(!cells.some(cell => inColumn(cell.at)), 'pit and porous cell cannot share a voxel');
  const roles = attached.map(port => {
    const neighbor = [...cells[port.cell].at]; neighbor[port.face.axis] += port.sign;
    requireCondition(inColumn(neighbor),
      'pit contacts are actual adjacent voxel faces');
    requireCondition(port.face.axis !== 1 || (port.sign === 1 && equalAt(neighbor, at)),
      'pit has inward side/floor ports and no soil roof');
    return { ...port, role: port.face.axis === 1 ? 'floor' : 'side' };
  });
  const floors = roles.filter(p => p.role === 'floor'), sides = roles.filter(p => p.role === 'side');
  requireCondition(sides.length <= 4 * input.heightCells, 'bounded actual soil side faces');
  const attachedNodes = new Set(roles.map(port => port.cell));
  for (const [index, cell] of cells.entries()) {
    const horizontal = Math.abs(cell.at[0] - at[0]) + Math.abs(cell.at[2] - at[2]);
    const side = horizontal === 1 && cell.at[1] >= at[1] && cell.at[1] < at[1] + input.heightCells;
    const floor = horizontal === 0 && cell.at[1] === at[1] - 1;
    requireCondition(!(horizontal === 0 && cell.at[1] === at[1] + input.heightCells),
      'vented column has no modeled soil roof');
    if (side || (floor && input.bottom === 'porous'))
      requireCondition(attachedNodes.has(index), 'every adjacent porous cell binds its actual unlined pit face');
  }
  const boundary = bottomBoundary(input, floors, sides, cells, { baseYM, rimYM, heightM, areaM2 });
  requireCondition(sides.every(p => p.face.areaM2 === areaM2 * spacing[1] / spacing[p.face.axis]),
    'actual pit side dimensions');
  return Object.freeze({ id: `reservoir:${input.id}`, reservoirId: input.id, kind: 'pit', at,
    elevationM: baseYM, baseYM, rimYM, areaM2, heightM, heightCells: input.heightCells, portCount: attached.length,
    ...boundary,
    sideNodes: Object.freeze(sides.map(p => p.cell).sort((a, b) =>
      cells[a].id < cells[b].id ? -1 : cells[a].id > cells[b].id ? 1 : 0)),
    maxHeadM: heightM,
    minMassKg: 0, maxMassKg: 1000 * areaM2 * heightM });
}

// A saturated side above the dry basin bottom must expose an atmospheric
// seepage reference. This supplies a deterministic initial guess, not a saved
// pressure or a permanent zero-psi constraint on a porous floor multiplier.
export function dryPitReference(g, massKg, index) {
  const node = g.nodes[index];
  return node.kind === 'pit' && massKg[index] === 0 &&
    node.sideNodes.some(i => massKg[i] === g.nodes[i].maxMassKg);
}
