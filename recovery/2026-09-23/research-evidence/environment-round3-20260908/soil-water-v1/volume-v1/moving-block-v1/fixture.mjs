import { REFERENCE_SOIL } from '../../column-v1/source-v2/soil.mjs';
import { createVolumeGeometry } from '../geometry.mjs';
import { createVolume } from '../volume.mjs';

export const FIXTURE = Object.freeze({ totalHeadM: -1.6, pondMassKg: 1,
  endS: 600, restartS: 300, dtS: Object.freeze([12, 6, 3]),
  minimumInteriorAxisTransferKg: 1e-5, minimumCentralGainKg: 0.1,
  symmetryKg: 2e-7, refinementFactor: 0.8, refinementFloorTheta: 1e-11 });

export function movingBlockDescriptor() {
  const low = { ...REFERENCE_SOIL, id: 'synthetic-low-k-layer-si-v1', ksMPerS: 1e-6 };
  const cells = [];
  for (let x = -1; x <= 1; x++) for (let y = -3; y <= -1; y++) for (let z = -1; z <= 1; z++)
    cells.push({ at: [x, y, z], soilId: y === -2 ? low.id : REFERENCE_SOIL.id });
  return { regionId: 'localized-finite-pond-layered-3d-block', revision: 0,
    spacingM: [1, 0.54, 1], exterior: 'closed', definitions: [REFERENCE_SOIL, low], cells,
    reservoirs: [{ id: 'pond', areaM2: 1 }],
    ports: [{ cell: [0, -1, 0], side: 'y+', reservoirId: 'pond' }], closedFaces: [] };
}

export function createMovingBlock() {
  const descriptor = movingBlockDescriptor(), g = createVolumeGeometry(descriptor), owner = createVolume(descriptor);
  const stocks = g.nodes.map(node => ({ nodeId: node.id, massKg: node.kind === 'reservoir' ? FIXTURE.pondMassKg :
    g.densityKgM3 * node.volumeM3 * g.soils[node.soilId].at(FIXTURE.totalHeadM - node.centerM[1]).theta }));
  return { g, owner, initial: owner.initial({ stocks }) };
}
