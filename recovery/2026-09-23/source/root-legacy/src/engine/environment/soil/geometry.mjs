import { createSoil, SOIL_FIELDS, requireCondition } from './soil.mjs';
import { pitNode } from './pit.mjs';

export const REGION_LIMITS = Object.freeze({ maxCells: 64, maxReservoirs: 8, maxPorts: 64,
  maxFaces: 384, maxUnknowns: 72, maxSteps: 512, maxIterations: 64, maxLineSearch: 18,
  maxHalvings: 12, maxEvaluations: 250000, maxMatrixUpdates: 30000000 });
const AXES = Object.freeze(['x', 'y', 'z']);
const key = at => at.join(',');
const compareAt = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const ownKeys = (input, keys, label) => requireCondition(input && typeof input === 'object' &&
  Object.keys(input).every(k => keys.includes(k)), label);
const identifier = id => typeof id === 'string' && /^[a-z][a-z0-9-]{0,95}$/.test(id);

function coordinate(at) {
  requireCondition(Array.isArray(at) && at.length === 3 &&
    [0, 1, 2].every(i => Object.hasOwn(at, i) && Number.isSafeInteger(at[i])),
    'signed integer voxel coordinate');
  requireCondition(at.every(n => Math.abs(n) <= 1000000), 'bounded numerical coordinate magnitude');
  return Object.freeze([...at]);
}

function definitions(inputs) {
  requireCondition(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= 8,
    '1..8 explicit soil definitions');
  const owners = Object.create(null);
  for (const input of inputs) {
    createSoil(input); // Validate all fields before canonical property ordering.
    requireCondition(identifier(input.id) && !Object.hasOwn(owners, input.id), 'unique soil definition ID');
    const ordered = Object.fromEntries(SOIL_FIELDS.map(k => [k, input[k]]));
    owners[input.id] = createSoil(ordered);
  }
  return Object.freeze(owners);
}

function soilNodes(inputs, soils, spacing) {
  requireCondition(Array.isArray(inputs) && inputs.length >= 2 && inputs.length <= REGION_LIMITS.maxCells,
    '2..64 explicitly defined porous voxels');
  const seen = new Set();
  const nodes = inputs.map(input => {
    ownKeys(input, ['at', 'soilId'], 'porous voxel fields');
    const at = coordinate(input.at), id = `cell:${key(at)}`, soil = soils[input.soilId];
    requireCondition(soil && !seen.has(id), 'known soil ID and unique voxel'); seen.add(id);
    const volumeM3 = spacing[0] * spacing[1] * spacing[2], rho = soil.definition.densityKgM3;
    return Object.freeze({ id, kind: 'soil', at, soilId: input.soilId,
      centerM: Object.freeze(at.map((n, axis) => (n + 0.5) * spacing[axis])),
      volumeM3, minMassKg: rho * volumeM3 * soil.minimumTheta,
      maxMassKg: rho * volumeM3 * soil.definition.porosity,
      minHeadM: soil.definition.minHeadM, maxHeadM: soil.definition.maxHeadM });
  });
  return nodes.sort((a, b) => compareAt(a.at, b.at));
}

function faceDescriptor(at, axis, sign, spacing) {
  const faceAt = [...at]; if (sign > 0) faceAt[axis]++;
  return { id: `${AXES[axis]}:${key(faceAt)}`, axis, at: Object.freeze(faceAt),
    centerM: Object.freeze(faceAt.map((n, a) => (n + (a === axis ? 0 : 0.5)) * spacing[a])),
    areaM2: spacing[0] * spacing[1] * spacing[2] / spacing[axis] };
}

function reservoirInputs(inputs) {
  requireCondition(Array.isArray(inputs) && inputs.length <= REGION_LIMITS.maxReservoirs,
    '0..8 finite reservoir definitions');
  const ids = new Set();
  return inputs.map(input => {
    const pit = input?.kind === 'vented-pit';
    ownKeys(input, pit ? ['id', 'kind', 'at'] : ['id', 'areaM2'], 'finite reservoir definition fields');
    requireCondition(identifier(input.id) && !ids.has(input.id), 'unique finite reservoir ID'); ids.add(input.id);
    if (pit) return Object.freeze({ id: input.id, kind: 'vented-pit', at: coordinate(input.at) });
    requireCondition(Number.isFinite(input.areaM2) && input.areaM2 >= 0.01 && input.areaM2 <= 8,
      'bounded positive reservoir surface area');
    return Object.freeze({ id: input.id, areaM2: input.areaM2 });
  }).sort((a, b) => compareText(a.id, b.id));
}

function compilePorts(inputs, lookup, reservoirs, spacing) {
  requireCondition(Array.isArray(inputs) && inputs.length <= REGION_LIMITS.maxPorts, 'bounded explicit finite ports');
  const ports = [], used = new Set(), reservoirIds = new Set(reservoirs.map(r => r.id));
  for (const input of inputs) {
    ownKeys(input, ['cell', 'side', 'reservoirId'], 'finite port fields');
    const at = coordinate(input.cell), cell = lookup.get(key(at));
    requireCondition(cell !== undefined && ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'].includes(input.side) &&
      reservoirIds.has(input.reservoirId), 'port has a known porous cell, side and finite reservoir');
    const axis = AXES.indexOf(input.side[0]), sign = input.side[1] === '+' ? 1 : -1;
    const neighbor = [...at]; neighbor[axis] += sign;
    requireCondition(!lookup.has(key(neighbor)), 'reservoir ports bind exterior faces only');
    const face = faceDescriptor(at, axis, sign, spacing);
    requireCondition(!used.has(face.id), 'one reservoir binding per physical face'); used.add(face.id);
    ports.push(Object.freeze({ face, cell, sign, reservoirId: input.reservoirId }));
  }
  return ports.sort((a, b) => compareText(a.face.id, b.face.id));
}

function reservoirNodes(inputs, ports, cells, spacing) {
  return inputs.map(input => {
    const attached = ports.filter(p => p.reservoirId === input.id);
    requireCondition(attached.length > 0, 'every finite reservoir has a physical port');
    if (input.kind === 'vented-pit') return pitNode(input, attached, cells, spacing);
    const elevationM = attached[0].face.centerM[1];
    requireCondition(attached.every(p => p.face.centerM[1] === elevationM),
      'first finite reservoir ports share one physical elevation');
    const minHeadM = Math.max(...attached.map(p => cells[p.cell].minHeadM));
    const maxHeadM = Math.min(...attached.map(p => cells[p.cell].maxHeadM));
    requireCondition(minHeadM < 0 && maxHeadM > 0, 'finite reservoir shares a supported head envelope');
    return Object.freeze({ id: `reservoir:${input.id}`, reservoirId: input.id, kind: 'reservoir',
      elevationM, areaM2: input.areaM2, portCount: attached.length, minHeadM, maxHeadM, minMassKg: 0,
      maxMassKg: 1000 * input.areaM2 * maxHeadM });
  });
}

function compileFaces(cells, nodes, lookup, ports, closedInputs, spacing) {
  requireCondition(Array.isArray(closedInputs) && closedInputs.length <= 3 * cells.length &&
    closedInputs.every(id => typeof id === 'string') && new Set(closedInputs).size === closedInputs.length,
    'unique bounded interior closed-face IDs');
  const closed = new Set(closedInputs), recognized = new Set(), seen = new Set();
  const portByFace = new Map(ports.map(p => [p.face.id, p]));
  const reservoirIndex = new Map(nodes.map((n, i) => [n.reservoirId, i]).filter(([id]) => id));
  const faces = [], closedFaces = [];
  for (const [i, cell] of cells.entries()) for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const face = faceDescriptor(cell.at, axis, sign, spacing);
    if (seen.has(face.id)) continue; seen.add(face.id);
    const otherAt = [...cell.at]; otherAt[axis] += sign;
    const other = lookup.get(key(otherAt)), port = portByFace.get(face.id);
    if (other !== undefined && closed.has(face.id)) {
      recognized.add(face.id); closedFaces.push(Object.freeze(face)); continue;
    }
    if (other === undefined && !port) { closedFaces.push(Object.freeze(face)); continue; }
    const neighbor = other ?? reservoirIndex.get(port.reservoirId);
    const left = sign > 0 ? i : neighbor, right = sign > 0 ? neighbor : i;
    const boundary = other === undefined;
    faces.push(Object.freeze({ ...face, left, right, boundary,
      ...(boundary && nodes[neighbor].kind === 'pit' ? { pitRole: face.axis === 1 ? 'floor' : 'side' } : {}),
      leftSoilId: boundary ? cell.soilId : nodes[left].soilId,
      rightSoilId: boundary ? cell.soilId : nodes[right].soilId,
      leftDistanceM: spacing[axis] / (boundary ? 4 : 2),
      rightDistanceM: spacing[axis] / (boundary ? 4 : 2) }));
  }
  requireCondition(recognized.size === closed.size, 'closed face must identify an existing interior soil face');
  requireCondition(faces.length <= REGION_LIMITS.maxFaces, 'bounded active Darcy faces');
  const order = (a, b) => a.axis - b.axis || compareAt(a.at, b.at);
  return { faces: Object.freeze(faces.sort(order)), closedFaces: Object.freeze(closedFaces.sort(order)) };
}

function stableTopology(nodes, faces) {
  const adjacency = nodes.map(() => []);
  for (const [face, f] of faces.entries()) {
    adjacency[f.left].push({ node: f.right, face }); adjacency[f.right].push({ node: f.left, face });
  }
  for (const list of adjacency) list.sort((a, b) => compareText(nodes[a.node].id, nodes[b.node].id) || a.face - b.face);
  const parent = Array(nodes.length).fill(-1), parentFace = Array(nodes.length).fill(-1), order = [0];
  parent[0] = 0;
  for (let cursor = 0; cursor < order.length; cursor++) for (const edge of adjacency[order[cursor]]) {
    if (parent[edge.node] !== -1) continue;
    parent[edge.node] = order[cursor]; parentFace[edge.node] = edge.face; order.push(edge.node);
  }
  requireCondition(order.length === nodes.length, 'one connected admitted soil/reservoir graph required');
  const used = new Set(parentFace.filter(i => i >= 0));
  const tree = Object.freeze({ root: 0, parent: Object.freeze(parent), parentFace: Object.freeze(parentFace),
    order: Object.freeze(order), chords: Object.freeze(faces.map((_, i) => i).filter(i => !used.has(i))) });
  return { tree, adjacency: Object.freeze(adjacency.map(list => Object.freeze(list.map(Object.freeze)))) };
}

export function createVolumeGeometry(input) {
  ownKeys(input, ['version', 'regionId', 'revision', 'spacingM', 'exterior', 'definitions', 'cells',
    'reservoirs', 'ports', 'closedFaces'], 'connected porous region descriptor fields');
  requireCondition(identifier(input.regionId) && Number.isSafeInteger(input.revision) && input.revision >= 0,
    'explicit porous region identity/revision');
  requireCondition(Array.isArray(input.spacingM) && input.spacingM.length === 3 &&
    [0, 1, 2].every(i => Object.hasOwn(input.spacingM, i) && Number.isFinite(input.spacingM[i]) && input.spacingM[i] >= 0.01 && input.spacingM[i] <= 8) &&
    input.exterior === 'closed',
    'explicit positive bounded voxel metric and closed exterior policy required');
  const spacing = Object.freeze([...input.spacingM]);
  const soils = definitions(input.definitions), cells = soilNodes(input.cells, soils, spacing);
  const lookup = new Map(cells.map((n, i) => [key(n.at), i]));
  const reservoirDefs = reservoirInputs(input.reservoirs), ports = compilePorts(input.ports, lookup, reservoirDefs, spacing);
  const pitCount = reservoirDefs.filter(r => r.kind === 'vented-pit').length;
  requireCondition(pitCount <= 1, 'first shared-owner candidate admits one finite pit');
  const version = pitCount === 0 ? 'rigid-soil-voxel-graph-v1' : 'rigid-soil-voxel-pit-graph-v1';
  requireCondition(input.version === undefined || input.version === version,
    'supported porous geometry descriptor version');
  const nodes = Object.freeze([...cells, ...reservoirNodes(reservoirDefs, ports, cells, spacing)]);
  requireCondition(nodes.length <= REGION_LIMITS.maxUnknowns, 'bounded shared pressure unknowns');
  const compiled = compileFaces(cells, nodes, lookup, ports, input.closedFaces, spacing);
  const topology = stableTopology(nodes, compiled.faces);
  const descriptor = Object.freeze({ version, regionId: input.regionId,
    revision: input.revision, spacingM: spacing, exterior: 'closed',
    definitions: Object.freeze(Object.keys(soils).sort(compareText).map(id => soils[id].definition)),
    cells: Object.freeze(cells.map(n => Object.freeze({ at: n.at, soilId: n.soilId }))),
    reservoirs: Object.freeze(reservoirDefs), ports: Object.freeze(ports.map(p => Object.freeze({
      cell: cells[p.cell].at, side: `${AXES[p.face.axis]}${p.sign > 0 ? '+' : '-'}`,
      reservoirId: p.reservoirId }))), closedFaces: Object.freeze([...input.closedFaces].sort(compareText)) });
  return Object.freeze({ descriptor, identity: JSON.stringify(descriptor), nodes,
    ...compiled, ...topology, soils, densityKgM3: 1000 });
}
