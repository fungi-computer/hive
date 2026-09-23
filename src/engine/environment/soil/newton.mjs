import { requireCondition } from './soil.mjs';
import { REGION_LIMITS } from './geometry.mjs';
import { mixedResidual } from './residual.mjs';
import { pressureGuess } from './guess.mjs';
import { solveNewtonDirection } from './linear.mjs';
import { NUMERICS, maxAbs, validHead } from './state.mjs';

export class ConvergenceFailure extends Error {
  constructor(message) { super(message); this.name = 'ConvergenceFailure'; }
}

export function evaluateTrial(g, oldMassKg, heads, dtS, work) {
  requireCondition(work.evaluations < work.evaluationLimit, 'request nonlinear evaluation budget');
  work.evaluations++;
  const result = mixedResidual(g, oldMassKg, heads, dtS);
  work.faceEvaluations += g.faces.length;
  return { ...result, normKg: maxAbs(result.residualKg) };
}

function reduceResidual(g, oldMassKg, dtS, current, direction, work) {
  let factor = 1;
  for (let trial = 0; trial < REGION_LIMITS.maxLineSearch; trial++, factor /= 2) {
    work.lineTrials++;
    const heads = current.headM.map((h, i) => h + factor * direction[i]);
    if (!heads.every((h, i) => validHead(g.nodes[i], h))) continue;
    const candidate = evaluateTrial(g, oldMassKg, heads, dtS, work);
    if (candidate.normKg <= NUMERICS.solveKg || candidate.normKg < current.normKg * (1 - 1e-4 * factor))
      return candidate;
  }
  throw new ConvergenceFailure('bounded Newton line search did not reduce the mixed residual');
}

export function solveHeads(g, oldMassKg, dtS, work) {
  let current = evaluateTrial(g, oldMassKg, pressureGuess(g, oldMassKg, work), dtS, work);
  try {
    for (let iteration = 0; iteration < REGION_LIMITS.maxIterations; iteration++) {
      if (current.normKg <= NUMERICS.solveKg) return current;
      work.iterations++;
      const direction = solveNewtonDirection(g, current, dtS, work);
      current = reduceResidual(g, oldMassKg, dtS, current, direction, work);
    }
    throw new ConvergenceFailure('bounded Newton iteration limit');
  } catch (error) {
    error.candidate = { phase: 'newton-current-iterate', dtS, headM: [...current.headM],
      massFromHeadKg: [...current.massFromHeadKg], mixedResidualKg: [...current.residualKg], normKg: current.normKg };
    throw error;
  }
}
