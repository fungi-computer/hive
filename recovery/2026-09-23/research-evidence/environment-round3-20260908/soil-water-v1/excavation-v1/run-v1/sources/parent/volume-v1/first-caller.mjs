import { REFERENCE_SOIL, requireCondition } from '../column-v1/source-v2/soil.mjs';

// Fixed fixture definitions. Nothing runs at import or initializes terrain
// water. The qualifier consumes these explicit finite stocks through one solver.
const LOW_K = Object.freeze({ ...REFERENCE_SOIL, id: 'synthetic-low-k-layer-si-v1', ksMPerS: 1e-6 });
const base = regionId => ({ regionId, revision: 0, spacingM: [1, 0.54, 1], exterior: 'closed',
  definitions: [REFERENCE_SOIL, LOW_K], cells: [], reservoirs: [], ports: [], closedFaces: [] });

export function referenceColumnDescriptor() {
  const d = base('voxel-line-column-reference');
  d.cells = [-4, -3, -2, -1].map(y => ({ at: [0, y, 0], soilId: REFERENCE_SOIL.id }));
  d.reservoirs = [{ id: 'top', areaM2: 1 }, { id: 'bottom', areaM2: 1 }];
  d.ports = [{ cell: [0, -1, 0], side: 'y+', reservoirId: 'top' },
    { cell: [0, -4, 0], side: 'y-', reservoirId: 'bottom' }];
  return d;
}

export function hydrostaticVolumeDescriptor() {
  const d = base('signed-three-dimensional-water-table');
  for (const x of [-1, 0]) for (const y of [-3, -2, -1]) for (const z of [4, 5])
    d.cells.push({ at: [x, y, z], soilId: REFERENCE_SOIL.id });
  d.reservoirs = [{ id: 'lower', areaM2: 4 }];
  for (const x of [-1, 0]) for (const z of [4, 5])
    d.ports.push({ cell: [x, -3, z], side: 'y-', reservoirId: 'lower' });
  return d;
}

export function saturatedPathDescriptor({ axis = 'x', parallelPaths = 1, lowK = true } = {}) {
  requireCondition(['x', 'y', 'z'].includes(axis) && [1, 2].includes(parallelPaths) && typeof lowK === 'boolean',
    'fixed series/parallel fixture choices');
  const d = base(`saturated-${axis}-${parallelPaths}-path${lowK ? '-layer' : ''}`);
  const index = ['x', 'y', 'z'].indexOf(axis), parallel = axis === 'z' ? 0 : 2;
  d.reservoirs = [{ id: 'low-face', areaM2: 1 }, { id: 'high-face', areaM2: 1 }];
  for (let path = 0; path < parallelPaths; path++) {
    for (let step = 0; step < 3; step++) {
      const at = [0, 0, 0]; at[index] = step; at[parallel] = path;
      d.cells.push({ at, soilId: lowK && step === 1 ? LOW_K.id : REFERENCE_SOIL.id });
      if (step === 0) d.ports.push({ cell: at, side: `${axis}-`, reservoirId: 'low-face' });
      if (step === 2) d.ports.push({ cell: at, side: `${axis}+`, reservoirId: 'high-face' });
    }
  }
  return d;
}

export function explicitFixtureStocks(g, { totalHeadM, unsaturatedHeadM, reservoirDepthsM = {} }) {
  requireCondition(Number.isFinite(totalHeadM) !== Number.isFinite(unsaturatedHeadM),
    'one explicit fixture soil distribution');
  return g.nodes.map(node => {
    if (node.kind === 'soil') {
      const h = Number.isFinite(totalHeadM) ? totalHeadM - node.centerM[1] : unsaturatedHeadM;
      return g.densityKgM3 * node.volumeM3 * g.soils[node.soilId].at(h).theta;
    }
    const depth = reservoirDepthsM[node.reservoirId];
    requireCondition(Number.isFinite(depth) && depth >= 0 && depth <= node.maxHeadM,
      'explicit finite boundary fixture water depth');
    return g.densityKgM3 * node.areaM2 * depth;
  });
}
