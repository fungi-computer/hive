import { compensatedSum, requireCondition } from './soil.mjs';
import { LIMITS, stockAt, guessHeads } from './geometry.mjs';
import { solveTridiagonal } from './linear.mjs';

export class ConvergenceFailure extends Error {}
const maxAbs = values => Math.max(...values.map(Math.abs));
const balanceTolerance = total => LIMITS.balanceKg + 64 * Number.EPSILON * Math.abs(total);

function faceLaw(g, face, heads, fields) {
  const left = fields[face.left], right = fields[face.right];
  const a = face.leftDistance / left.conductivityMPerS;
  const b = face.rightDistance / right.conductivityMPerS, resistance = a + b;
  const mobility = face.area / resistance;
  const difference = heads[face.left] + g.nodes[face.left].z -
    heads[face.right] - g.nodes[face.right].z;
  const dLeft = mobility * (1 + difference * a / resistance *
    left.conductivityDerivativePerS / left.conductivityMPerS);
  const dRight = mobility * (-1 + difference * b / resistance *
    right.conductivityDerivativePerS / right.conductivityMPerS);
  return { volumeRateM3S: mobility * difference, dLeft, dRight };
}

export function evaluate(g, oldMass, dt, heads, work) {
  requireCondition(++work.evaluations <= work.evaluationLimit, 'request nonlinear evaluation budget');
  const fields = g.nodes.map((node, i) => stockAt(g, node, heads[i]));
  const residual = fields.map((f, i) => f.mass - oldMass[i]);
  const diagonal = fields.map(f => f.derivative), lower = [], upper = [], fluxes = [];
  for (const face of g.faces) {
    const f = faceLaw(g, face, heads, fields), factor = g.rho * dt;
    fluxes.push(f.volumeRateM3S);
    residual[face.left] += factor * f.volumeRateM3S;
    residual[face.right] -= factor * f.volumeRateM3S;
    diagonal[face.left] += factor * f.dLeft;
    upper.push(factor * f.dRight);
    lower.push(-factor * f.dLeft);
    diagonal[face.right] -= factor * f.dRight;
  }
  requireCondition([...residual, ...diagonal, ...lower, ...upper, ...fluxes].every(Number.isFinite),
    'finite mixed residual and analytic Jacobian');
  work.faceEvaluations += g.faces.length;
  return { fields, residual, diagonal, lower, upper, fluxes, norm: maxAbs(residual) };
}

function lineSearch(g, oldMass, dt, heads, current, direction, work) {
  const { minHeadM, maxHeadM } = g.soil.definition;
  let factor = 1;
  for (let trial = 0; trial < LIMITS.maxLineSearch; trial++, factor /= 2) {
    work.lineTrials++;
    const candidate = heads.map((h, i) => h + factor * direction[i]);
    if (!candidate.every(h => Number.isFinite(h) && h >= minHeadM && h <= maxHeadM)) continue;
    const result = evaluate(g, oldMass, dt, candidate, work);
    if (result.norm <= LIMITS.solveKg || result.norm < current.norm * (1 - 1e-4 * factor))
      return { heads: candidate, evaluation: result };
  }
  throw new ConvergenceFailure('bounded Newton line search did not reduce the mixed residual');
}

function solveHeads(g, oldMass, dt, work) {
  let heads = guessHeads(g, oldMass), current = evaluate(g, oldMass, dt, heads, work);
  for (let iteration = 0; iteration < LIMITS.maxIterations; iteration++) {
    if (current.norm <= LIMITS.solveKg) return { heads, evaluation: current };
    work.iterations++;
    const direction = solveTridiagonal(current.lower, current.diagonal, current.upper,
      current.residual.map(r => -r));
    const accepted = lineSearch(g, oldMass, dt, heads, current, direction, work);
    heads = accepted.heads; current = accepted.evaluation;
  }
  throw new ConvergenceFailure('bounded Newton iteration limit');
}

function mobileIndex(g, mass) {
  const mobile = i => mass[i] > g.nodes[i].minMass && mass[i] < g.nodes[i].maxMass;
  if (mobile(0)) return 0;
  for (let i = 1; i <= g.descriptor.cells; i++)
    if (mobile(i)) return i;
  const last = g.nodes.length - 1;
  if (g.nodes[last].kind === 'standpipe' && mobile(last)) return last;
  throw new ConvergenceFailure('no supported mobile stock for conservation-equation elimination');
}

function eliminateConservation(g, oldMass, solved) {
  const heads = [...solved.heads], mass = solved.evaluation.fields.map(f => f.mass);
  const total = compensatedSum(oldMass);
  if (compensatedSum(mass) === total) return { heads, mass, anchor: null, correctionKg: 0 };
  const anchor = mobileIndex(g, mass), node = g.nodes[anchor];
  const replacement = total - compensatedSum(mass.filter((_, i) => i !== anchor));
  const correctionKg = replacement - mass[anchor];
  if (!Number.isFinite(replacement) || replacement <= node.minMass || replacement >= node.maxMass ||
    Math.abs(correctionKg) > LIMITS.closureKg)
    throw new ConvergenceFailure('mobile conservation closure exceeds branch or residual limit');
  mass[anchor] = replacement;
  heads[anchor] = node.kind === 'soil' ?
    g.soil.unsaturatedHead(replacement / (g.rho * node.volume)) : replacement / (g.rho * node.area);
  return { heads, mass, anchor, correctionKg };
}

function reconstructTransfers(oldMass, mass) {
  const changes = mass.map((m, i) => oldMass[i] - m), transfers = [];
  let prefix = 0, correction = 0;
  for (let i = 0; i < changes.length - 1; i++) {
    const y = changes[i] - correction, next = prefix + y;
    correction = (next - prefix) - y; prefix = next; transfers.push(prefix);
  }
  return transfers;
}

function closureMetrics(g, oldMass, dt, closed, checked) {
  const transferKg = reconstructTransfers(oldMass, closed.mass);
  const paired = [...oldMass];
  for (const [k, face] of g.faces.entries()) {
    paired[face.left] -= transferKg[k]; paired[face.right] += transferKg[k];
  }
  const constitutiveKg = maxAbs(checked.fields.map((f, i) => f.mass - closed.mass[i]));
  const darcyKg = maxAbs(transferKg.map((m, i) => m - g.rho * dt * checked.fluxes[i]));
  const pairKg = maxAbs(paired.map((m, i) => m - closed.mass[i]));
  const totalKg = compensatedSum(closed.mass) - compensatedSum(oldMass);
  const complementarity = g.nodes.reduce((max, node, i) => {
    if (node.kind === 'soil') return max;
    const d = closed.mass[i] / (g.rho * node.area), h = closed.heads[i];
    requireCondition(d >= 0 && d - h >= 0,
      'finite boundary complementarity inequality');
    return Math.max(max, Math.abs(d * (d - h)));
  }, 0);
  return { transferKg, constitutiveKg, darcyKg, darcyM3S: darcyKg / (g.rho * dt),
    pairKg, totalKg, complementarityM2: complementarity };
}

export function solveStep(g, oldMass, dt, work) {
  const solved = solveHeads(g, oldMass, dt, work);
  const closed = eliminateConservation(g, oldMass, solved);
  const checked = evaluate(g, oldMass, dt, closed.heads, work);
  const metrics = closureMetrics(g, oldMass, dt, closed, checked);
  const balance = balanceTolerance(compensatedSum(oldMass));
  const validBounds = closed.mass.every((m, i) => Number.isFinite(m) &&
    m >= g.nodes[i].minMass && m <= g.nodes[i].maxMass);
  if (!validBounds || metrics.constitutiveKg > LIMITS.acceptedKg ||
    metrics.darcyKg > LIMITS.acceptedKg || metrics.pairKg > balance ||
    Math.abs(metrics.totalKg) > balance || checked.norm > LIMITS.acceptedKg ||
    metrics.complementarityM2 > 1e-12)
    throw new ConvergenceFailure('post-closure mixed/face/stock residual exceeds accepted limits');
  return { mass: closed.mass, heads: closed.heads, metrics,
    closure: { node: closed.anchor, correctionKg: closed.correctionKg } };
}
