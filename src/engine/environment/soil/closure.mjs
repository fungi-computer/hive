import { compensatedSum } from './soil.mjs';
import { ConvergenceFailure, evaluateTrial, solveHeads } from './newton.mjs';
import { NUMERICS, balanceTolerance, canonicalIds, maxAbs, validHead } from './state.mjs';

function mobileAnchor(g, massKg) {
  const order = canonicalIds(g);
  for (const kind of ['reservoir', 'pit', 'soil']) for (const i of order) {
    const node = g.nodes[i];
    if (node.kind === kind && massKg[i] > node.minMassKg && massKg[i] < node.maxMassKg) return i;
  }
  throw new ConvergenceFailure('no strict mobile stock for conservation-equation elimination');
}

function eliminateConservation(g, oldMassKg, solved) {
  const heads = [...solved.headM], massKg = [...solved.massFromHeadKg], total = compensatedSum(oldMassKg);
  if (compensatedSum(massKg) === total) return { heads, massKg, anchor: null, correctionKg: 0 };
  const anchor = mobileAnchor(g, massKg), node = g.nodes[anchor];
  const replacement = total - compensatedSum(massKg.filter((_, i) => i !== anchor));
  const correctionKg = replacement - massKg[anchor];
  if (!Number.isFinite(replacement) || replacement <= node.minMassKg || replacement >= node.maxMassKg ||
    Math.abs(correctionKg) > NUMERICS.closureKg)
    throw new ConvergenceFailure('mobile conservation closure exceeds strict branch or residual limit');
  massKg[anchor] = replacement;
  heads[anchor] = node.kind === 'soil' ?
    g.soils[node.soilId].unsaturatedHead(replacement / (g.densityKgM3 * node.volumeM3)) :
    replacement / (g.densityKgM3 * node.areaM2);
  return { heads, massKg, anchor, correctionKg };
}

function normalizeWetHeads(g, closed) {
  const normalizations = [];
  for (const [i, node] of g.nodes.entries()) {
    if (node.kind === 'soil' || closed.massKg[i] === 0) continue;
    const previousHeadM = closed.heads[i];
    closed.heads[i] = closed.massKg[i] / (g.densityKgM3 * node.areaM2);
    normalizations.push({ nodeId: node.id, massKg: closed.massKg[i], previousHeadM,
      headM: closed.heads[i], deltaHeadM: closed.heads[i] - previousHeadM });
  }
  return normalizations;
}

// B is positive outward incidence. Preserve constitutive transfer on all chords;
// only the stable tree carries the small remaining continuity discrepancy.
function conservativeFaceLedger(g, oldMassKg, massKg, checked, dtS, work) {
  const constitutiveTransferKg = Array.from(checked.volumeRateM3S, q => g.densityKgM3 * dtS * q);
  const transferKg = [...constitutiveTransferKg], subtree = oldMassKg.map((m, i) => m - massKg[i]);
  for (const [k, face] of g.faces.entries()) {
    subtree[face.left] -= transferKg[k]; subtree[face.right] += transferKg[k];
    work.closureFaceVisits++;
  }
  const initialContinuityKg = maxAbs(subtree), treeCorrectionKg = Array(g.faces.length).fill(0);
  for (let k = g.tree.order.length - 1; k > 0; k--) {
    const child = g.tree.order[k], faceIndex = g.tree.parentFace[child], face = g.faces[faceIndex];
    const delta = face.left === child ? subtree[child] : -subtree[child];
    treeCorrectionKg[faceIndex] = delta; transferKg[faceIndex] += delta;
    subtree[g.tree.parent[child]] += subtree[child]; work.closureTreeVisits++;
  }
  return { transferKg, constitutiveTransferKg, treeCorrectionKg, initialContinuityKg,
    rootCompatibilityKg: subtree[g.tree.root] };
}

function boundaryFacts(g, closed) {
  return g.nodes.flatMap((node, i) => {
    if (node.kind === 'soil') return [];
    const depthM = closed.massKg[i] / (g.densityKgM3 * node.areaM2), headM = closed.heads[i];
    return [{ nodeId: node.id, portCount: node.portCount, massKg: closed.massKg[i], depthM,
      headM, gapM: depthM - headM, ...(node.kind === 'pit' ? { kind: 'pit', rimDepthM: node.heightM } : {}) }];
  });
}

function ledgerMetrics(g, oldMassKg, closed, checked, ledger, dtS) {
  const paired = [...oldMassKg];
  for (const [k, face] of g.faces.entries()) {
    paired[face.left] -= ledger.transferKg[k]; paired[face.right] += ledger.transferKg[k];
  }
  const boundaries = boundaryFacts(g, closed);
  const faceLawKg = maxAbs(ledger.transferKg.map((m, k) => m - ledger.constitutiveTransferKg[k]));
  return { mixedKg: checked.normKg,
    constitutiveKg: maxAbs(checked.massFromHeadKg.map((m, i) => m - closed.massKg[i])),
    faceLawKg, faceLawM3S: faceLawKg / (g.densityKgM3 * dtS),
    pairKg: maxAbs(paired.map((m, i) => m - closed.massKg[i])),
    totalKg: compensatedSum(closed.massKg) - compensatedSum(oldMassKg),
    treeCorrectionKg: maxAbs(ledger.treeCorrectionKg), rootCompatibilityKg: ledger.rootCompatibilityKg,
    initialContinuityKg: ledger.initialContinuityKg,
    chordDifferenceKg: maxAbs(g.tree.chords.map(k => ledger.transferKg[k] - ledger.constitutiveTransferKg[k])),
    complementarityM2: maxAbs(boundaries.map(b => b.depthM * b.gapM)), boundaries };
}

function admitClosure(g, oldMassKg, closed, metrics) {
  const balance = balanceTolerance(compensatedSum(oldMassKg));
  const bounded = closed.massKg.every((m, i) => Number.isFinite(m) &&
    m >= g.nodes[i].minMassKg && m <= g.nodes[i].maxMassKg && validHead(g.nodes[i], closed.heads[i]));
  const wetLaw = metrics.boundaries.every(b => b.depthM >= 0 && b.gapM >= 0 &&
    (b.kind === 'pit' || b.portCount === 1 || b.massKg > 0));
  const limits = [metrics.mixedKg, metrics.constitutiveKg, metrics.faceLawKg, metrics.treeCorrectionKg];
  if (!bounded || !wetLaw || !limits.every(x => Number.isFinite(x) && x <= NUMERICS.acceptedKg) ||
    !Number.isFinite(metrics.totalKg) || Math.abs(metrics.totalKg) > balance ||
    !Number.isFinite(metrics.pairKg) || metrics.pairKg > balance ||
    !Number.isFinite(metrics.rootCompatibilityKg) || Math.abs(metrics.rootCompatibilityKg) > balance ||
    metrics.chordDifferenceKg !== 0 || !Number.isFinite(metrics.complementarityM2) || metrics.complementarityM2 > 1e-12)
    throw new ConvergenceFailure('post-closure mixed/face/stock/complementarity law exceeds accepted limits');
}

export function solveStep(g, oldMassKg, dtS, work) {
  const closed = eliminateConservation(g, oldMassKg, solveHeads(g, oldMassKg, dtS, work));
  const wetBoundaryNormalizations = normalizeWetHeads(g, closed);
  try {
    if (!closed.heads.every((h, i) => validHead(g.nodes[i], h)))
      throw new ConvergenceFailure('conservation closure head outside supported branch/envelope');
    const checked = evaluateTrial(g, oldMassKg, closed.heads, dtS, work);
    const ledger = conservativeFaceLedger(g, oldMassKg, closed.massKg, checked, dtS, work);
    for (const [k, face] of g.faces.entries()) {
      if (face.pitRole !== 'side') continue;
      const leftSoil = g.nodes[face.left].kind === 'soil', pit = leftSoil ? face.right : face.left;
      const outwardKg = ledger.transferKg[k] * (leftSoil ? 1 : -1);
      if (closed.heads[pit] <= 0 && outwardKg < 0)
        throw new ConvergenceFailure('conservative closure cannot withdraw from an empty exposed pit side');
    }
    const metrics = ledgerMetrics(g, oldMassKg, closed, checked, ledger, dtS);
    admitClosure(g, oldMassKg, closed, metrics);
    return { massKg: closed.massKg, headM: closed.heads, metrics, ledger,
      closure: { nodeId: closed.anchor === null ? null : g.nodes[closed.anchor].id,
        correctionKg: closed.correctionKg, wetBoundaryNormalizations } };
  } catch (error) {
    error.candidate = { boundaries: boundaryFacts(g, closed), massKg: closed.massKg,
      headM: closed.heads, wetBoundaryNormalizations };
    throw error;
  }
}
