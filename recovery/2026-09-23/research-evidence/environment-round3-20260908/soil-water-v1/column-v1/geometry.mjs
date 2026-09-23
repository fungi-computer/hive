import { requireCondition } from './soil.mjs';

export const LIMITS = Object.freeze({ maxCells: 64, maxSteps: 4096, maxIntervalS: 7200,
  minDtS: 1e-6, maxDtS: 120, maxHalvings: 12, maxIterations: 64,
  maxLineSearch: 18, maxEvaluations: 250000, solveKg: 1e-10,
  acceptedKg: 2e-9, closureKg: 2e-9, balanceKg: 2e-11 });

export function createGeometry(input, soil) {
  requireCondition(input && typeof input === 'object' && Object.keys(input).every(key =>
    ['cells', 'lengthM', 'areaM2', 'pondAreaM2', 'standpipeAreaM2', 'groundM'].includes(key)),
    'supported homogeneous column geometry fields');
  const { cells, lengthM, areaM2, pondAreaM2 = areaM2,
    standpipeAreaM2 = null, groundM = 0 } = input;
  requireCondition(Number.isSafeInteger(cells) && cells >= 2 && cells <= LIMITS.maxCells,
    '2..64 soil cells');
  requireCondition(Number.isFinite(lengthM) && lengthM >= 0.1 && lengthM <= 8 &&
    Number.isFinite(areaM2) && areaM2 >= 0.01 && areaM2 <= 4 &&
    Number.isFinite(pondAreaM2) && pondAreaM2 >= 0.01 && pondAreaM2 <= 8 &&
    (standpipeAreaM2 === null || Number.isFinite(standpipeAreaM2) &&
      standpipeAreaM2 >= 0.01 && standpipeAreaM2 <= 8) &&
    Number.isFinite(groundM) && Math.abs(groundM) <= 1000, 'bounded SI column geometry');
  const dz = lengthM / cells, volume = areaM2 * dz, rho = soil.definition.densityKgM3;
  const nodes = [{ kind: 'pond', z: groundM, area: pondAreaM2, volume: null }];
  for (let i = 0; i < cells; i++) nodes.push({ kind: 'soil', z: groundM - (i + 0.5) * dz,
    area: areaM2, volume });
  if (standpipeAreaM2 !== null) nodes.push({ kind: 'standpipe', z: groundM - lengthM,
    area: standpipeAreaM2, volume: null });
  for (const node of nodes) {
    node.minMass = node.kind === 'soil' ? rho * volume * soil.minimumTheta : 0;
    node.maxMass = node.kind === 'soil' ? rho * volume * soil.definition.porosity :
      rho * node.area * soil.definition.maxHeadM;
    Object.freeze(node);
  }
  const faces = nodes.slice(1).map((right, k) => {
    const boundary = nodes[k].kind !== 'soil' || right.kind !== 'soil';
    return Object.freeze({ left: k, right: k + 1, area: areaM2,
      leftDistance: boundary ? dz / 4 : dz / 2,
      rightDistance: boundary ? dz / 4 : dz / 2 });
  });
  const descriptor = Object.freeze({ cells, lengthM, areaM2, pondAreaM2, standpipeAreaM2, groundM });
  return Object.freeze({ descriptor, identity: JSON.stringify(descriptor), rho, dz,
    nodes: Object.freeze(nodes), faces: Object.freeze(faces), soil });
}

export function stockAt(g, node, h) {
  const f = g.soil.at(h);
  if (node.kind === 'soil') return { mass: g.rho * node.volume * f.theta,
    derivative: g.rho * node.volume * f.capacityPerM, ...f };
  return { mass: g.rho * node.area * Math.max(h, 0),
    derivative: h >= 0 ? g.rho * node.area : 0, ...f };
}

export function guessHeads(g, mass) {
  const heads = Array(g.nodes.length).fill(null), anchors = [];
  for (const [i, node] of g.nodes.entries()) {
    if (node.kind === 'soil' && mass[i] < node.maxMass)
      heads[i] = mass[i] === node.minMass ? g.soil.definition.minHeadM :
        g.soil.unsaturatedHead(mass[i] / (g.rho * node.volume));
    if (node.kind !== 'soil' && mass[i] > 0) heads[i] = mass[i] / (g.rho * node.area);
    if (heads[i] !== null) anchors.push(i);
  }
  requireCondition(anchors.length > 0, 'unanchored fully saturated dry-boundary column');
  for (const [i, node] of g.nodes.entries()) {
    if (heads[i] !== null || node.kind !== 'soil') continue;
    let left = null, right = null;
    for (const a of anchors) { if (a < i) left = a; else if (a > i) { right = a; break; } }
    const a = left ?? right, b = right ?? left;
    const ha = heads[a] + g.nodes[a].z, hb = heads[b] + g.nodes[b].z;
    const totalHead = a === b ? ha : ha + (hb - ha) *
      (node.z - g.nodes[a].z) / (g.nodes[b].z - g.nodes[a].z);
    heads[i] = Math.max(0, totalHead - node.z);
  }
  for (const [i, node] of g.nodes.entries()) if (heads[i] === null) {
    const adjacent = i === 0 ? 1 : i - 1;
    heads[i] = Math.min(0, heads[adjacent] + g.nodes[adjacent].z - node.z);
  }
  requireCondition(heads.every(h => Number.isFinite(h) && h >= g.soil.definition.minHeadM &&
    h <= g.soil.definition.maxHeadM), 'canonical pressure guess outside supported head envelope');
  return heads;
}
