import { createVoxelWorld, MATERIAL } from '../height-caves.mjs';
import { assertWorldRecord, assertWorldArray } from '../../engine/world/data-contract.mjs';
export function requireCondition(ok, message) { if (!ok) throw new Error(message); }

export const key = at => at.join(',');
export const xyz = at => ({ x: at[0], y: at[1], z: at[2] });
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const ordered = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(ordered)
    : Object.fromEntries(Object.keys(value).sort().map(name => [name, ordered(value[name])]))
  : value;
export const immutable = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
};
export const exactFields = assertWorldRecord;
export function coordinate(at) {
  assertWorldArray(at, 3, 'voxel coordinate');
  requireCondition(Array.isArray(at) && at.length === 3 &&
    [0, 1, 2].every(i => Object.hasOwn(at, i) && Number.isSafeInteger(at[i])),
    'three owned signed integer coordinates');
  return [...at];
}
// The game recipe owns material meaning, physical spacing and supported extent.
export function metric(world) {
  const units = world.describe().identity.base.units;
  const spacingM = [units.horizontalMetres, units.verticalMetres, units.horizontalMetres];
  return { spacingM, voxelM3: spacingM[0] * spacingM[1] * spacingM[2] };
}
export function restoreWorld(identity, checkpoint) {
  // Delegate before any property access: the owner rejects accessors, hidden
  // fields, invalid current envelopes and capacity violations.
  return createVoxelWorld(identity, { checkpoint, maxChangedCells: 4096 });
}
/** Derived physical contacts; the caller may not mistake these for admitted closed walls. */
export function pitContacts(world, descriptor, at) {
  at = coordinate(at);
  const spacing = descriptor.spacingM, names = ['x', 'y', 'z'];
  const owned = new Set(descriptor.cells.map(cell => key(cell.at))), result = [];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const neighbor = [...at]; neighbor[axis] += sign;
    const material = world.readPoint(xyz(neighbor)), faceAt = [...at];
    if (sign > 0) faceAt[axis]++;
    if (material === MATERIAL.soil)
      requireCondition(owned.has(key(neighbor)), 'every exposed adjacent soil has canonical water ownership');
    result.push({ faceId: `${names[axis]}:${key(faceAt)}`, axis, sign, neighbor,
      material: material === MATERIAL.soil ? 'soil' : material === MATERIAL.stone ? 'stone' : 'open',
      soilNodeId: material === MATERIAL.soil ? `cell:${key(neighbor)}` : null,
      centerM: faceAt.map((n, i) => (n + (i === axis ? 0 : .5)) * spacing[i]),
      areaM2: spacing[0] * spacing[1] * spacing[2] / spacing[axis] });
  }
  return result;
}
export function assertVented(world, at) {
  const bounds = world.describe().layout.bounds;
  requireCondition(at[1] + 1 < bounds.maxY, 'pit has a world cell above its opening');
  for (let y = at[1] + 1; y < bounds.maxY; y++)
    requireCondition(world.readPoint({ x: at[0], y, z: at[2] }) === MATERIAL.air,
      'first pit requires an unobstructed vertical vent to the declared exterior');
}
export function excavateWorld(world, command) {
  const result = world.edit({ expectedRevision: command.expectedWorldRevision,
    cells: [{ ...xyz(command.at), expectedMaterial: MATERIAL.soil, material: MATERIAL.air }] });
  requireCondition(result.ok && result.revision === command.expectedWorldRevision + 1,
    `world excavation rejected: ${result.reason ?? 'revision did not advance'}`);
  return result;
}
