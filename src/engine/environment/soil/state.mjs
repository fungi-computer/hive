import { compensatedSum, requireCondition } from './soil.mjs';
import { dryPitReference } from './pit.mjs';
import { assertWorldRecord as exactRecord, assertWorldArray } from '../../world/data-contract.mjs';

export const VERSION = 'rigid-richards-boundary-volume-be-v2';
export const NUMERICS = Object.freeze({ solveKg: 1e-10, acceptedKg: 2e-9, closureKg: 2e-9,
  balanceKg: 2e-11, linearKg: 1e-10, minDtS: 1e-6, maxDtS: 120, maxIntervalS: 7200 });
export const freezeState = s => Object.freeze({ ...s, massKg: Object.freeze([...s.massKg]) });
export const elevation = node => node.kind === 'soil' ? node.centerM[1] : node.elevationM;
export const balanceTolerance = total => NUMERICS.balanceKg + 64 * Number.EPSILON * Math.abs(total);
export const maxAbs = values => values.reduce((n, x) => Math.max(n, Math.abs(x)), 0);
export const canonicalIds = g => g.nodes.map((_, i) => i).sort((a, b) =>
  g.nodes[a].id < g.nodes[b].id ? -1 : g.nodes[a].id > g.nodes[b].id ? 1 : 0);


function massBalance(initialTotalKg, boundaryKg, totalMassKg) {
  requireCondition(Number.isFinite(initialTotalKg) && initialTotalKg > 0 &&
    Number.isFinite(boundaryKg) && Number.isFinite(totalMassKg), 'finite regional mass ledger');
  // Cancel the largest opposing ledger terms before the small remaining stock.
  // A historical reference must not inflate the current physical allowance.
  const scaleKg = Math.abs(totalMassKg);
  const terms = [totalMassKg, -initialTotalKg, -boundaryKg].sort((a, b) => Math.abs(b) - Math.abs(a));
  const residualKg = compensatedSum(terms);
  requireCondition(Math.abs(residualKg) <= balanceTolerance(scaleKg), 'finite regional mass balance');
  return { residualKg, scaleKg };
}

export function validHead(node, h) {
  return Number.isFinite(h) && h >= node.minHeadM && h <= node.maxHeadM &&
    (node.kind !== 'reservoir' || node.portCount === 1 || h > 0);
}

export function canonicalAnchors(g, massKg) {
  const anchors = [];
  for (const i of canonicalIds(g)) {
    const node = g.nodes[i], mass = massKg[i];
    if (node.kind === 'soil' && mass < node.maxMassKg) {
      const soil = g.soils[node.soilId];
      const h = mass === node.minMassKg ? node.minHeadM :
        soil.unsaturatedHead(mass / (g.densityKgM3 * node.volumeM3));
      requireCondition(validHead(node, h), 'canonical unsaturated stock has a supported inverse');
      anchors.push({ node: i, headM: h, totalHeadM: h + elevation(node) });
    } else if (node.kind !== 'soil' && mass > 0) {
      const h = mass / (g.densityKgM3 * node.areaM2);
      requireCondition(validHead(node, h), 'canonical wet stock has a supported depth');
      anchors.push({ node: i, headM: h, totalHeadM: h + elevation(node) });
    }
  }
  if (anchors.length === 0) for (const i of canonicalIds(g)) {
    if (dryPitReference(g, massKg, i))
      anchors.push({ node: i, headM: 0, totalHeadM: g.nodes[i].baseYM,
        cause: 'exposed-saturated-side-atmospheric-reference' });
  }
  requireCondition(anchors.length > 0, 'unanchored fully saturated dry-boundary region');
  return anchors;
}

export function validateState(g, identity, s) {
  exactRecord(s, ['version', 'identity', 'massKg', 'initialTotalKg', 'boundaryKg', 'timeS', 'steps'],
    'canonical porous-region state fields');
  requireCondition(s.version === VERSION && s.identity === identity, 'region geometry/definition/solver identity');
  requireCondition(Number.isFinite(s.timeS) && s.timeS >= 0 && Number.isSafeInteger(s.steps) && s.steps >= 0,
    'canonical porous-region clock');
  assertWorldArray(s.massKg, g.nodes.length, 'canonical dense mass array');
  requireCondition(s.massKg.length === g.nodes.length && s.massKg.every((m, i) => Number.isFinite(m) && m >= g.nodes[i].minMassKg && m <= g.nodes[i].maxMassKg &&
      (g.nodes[i].kind !== 'reservoir' || g.nodes[i].portCount === 1 || m > 0)),
    'exact pore/boundary capacity and wet multi-port reservoir stock');
  const totalMassKg = compensatedSum(s.massKg);
  const balance = massBalance(s.initialTotalKg, s.boundaryKg, totalMassKg);
  return { totalMassKg, ...balance, anchors: canonicalAnchors(g, s.massKg) };
}

export function initialState(g, identity, input) {
  exactRecord(input, ['stocks'], 'initial stock fields');
  assertWorldArray(input.stocks, g.nodes.length, 'bounded initial stocks');
  requireCondition(input.stocks.length === g.nodes.length, 'one explicit stock entry per geometry node');
  const index = new Map(g.nodes.map((n, i) => [n.id, i])), seen = new Set(), massKg = Array(g.nodes.length);
  for (const entry of input.stocks) {
    exactRecord(entry, ['massKg', 'nodeId'], 'initial stock entry');
    requireCondition(index.has(entry.nodeId) && !seen.has(entry.nodeId), 'unique known stock ID and exact initial fields');
    seen.add(entry.nodeId); massKg[index.get(entry.nodeId)] = entry.massKg;
  }
  const s = { version: VERSION, identity, massKg, initialTotalKg: compensatedSum(massKg), boundaryKg: 0, timeS: 0, steps: 0 };
  validateState(g, identity, s); return freezeState(s);
}
