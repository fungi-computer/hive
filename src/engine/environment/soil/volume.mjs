import { compensatedSum, requireCondition } from './soil.mjs';
import { createVolumeGeometry, REGION_LIMITS } from './geometry.mjs';
import { ConvergenceFailure } from './newton.mjs';
import { solveStep } from './closure.mjs';
import { VERSION, NUMERICS, freezeState, initialState, validateState, maxAbs } from './state.mjs';
import { SURFACE_EXCHANGE_VERSION } from './surface-exchange.mjs';

function admitRequest(g, identity, input, intervalS, options) {
  validateState(g, identity, input);
  requireCondition(options && typeof options === 'object' && Object.keys(options).every(k =>
    ['dtMaxS', 'maxSteps', 'maxEvaluations', 'maxMatrixUpdates'].includes(k)), 'supported region work options');
  const { dtMaxS = 10, maxSteps = REGION_LIMITS.maxSteps,
    maxEvaluations = REGION_LIMITS.maxEvaluations, maxMatrixUpdates = REGION_LIMITS.maxMatrixUpdates } = options;
  requireCondition(Number.isFinite(intervalS) && intervalS >= 0 && intervalS <= NUMERICS.maxIntervalS &&
    Number.isFinite(input.timeS + intervalS) && (intervalS === 0 || input.timeS + intervalS > input.timeS),
    'finite representable region interval');
  requireCondition(Number.isFinite(dtMaxS) && dtMaxS >= NUMERICS.minDtS && dtMaxS <= NUMERICS.maxDtS &&
    Number.isSafeInteger(maxSteps) && maxSteps > 0 && maxSteps <= REGION_LIMITS.maxSteps &&
    Math.ceil(intervalS / dtMaxS) <= maxSteps && Number.isSafeInteger(input.steps + maxSteps),
    'bounded region timestep and accepted steps');
  requireCondition(Number.isSafeInteger(maxEvaluations) && maxEvaluations > 0 &&
    maxEvaluations <= REGION_LIMITS.maxEvaluations && Number.isSafeInteger(maxMatrixUpdates) &&
    maxMatrixUpdates > 0 && maxMatrixUpdates <= REGION_LIMITS.maxMatrixUpdates, 'bounded nonlinear/linear work request');
  return { endS: input.timeS + intervalS, dtMaxS, maxSteps, maxEvaluations, maxMatrixUpdates };
}

function newWork(request) {
  return { evaluations: 0, evaluationLimit: request.maxEvaluations, faceEvaluations: 0,
    iterations: 0, lineTrials: 0, rejected: 0, guessEdgeVisits: 0, guessNodeReads: 0, guessProjections: 0,
    matrixBuilds: 0, matrixAssemblyAdds: 0, peakDenseBytes: 0, pivotComparisons: 0, matrixSwapEntries: 0,
    factorDivisions: 0, matrixUpdates: 0, matrixUpdateLimit: request.maxMatrixUpdates, rhsUpdates: 0,
    backSubProducts: 0, backSubDivisions: 0, maxLinearResidualKg: 0,
    closureFaceVisits: 0, closureTreeVisits: 0 };
}

function boundedStep(g, state, proposedDtS, work, rejectedStages) {
  let dtS = proposedDtS;
  for (let attempt = 0; attempt <= REGION_LIMITS.maxHalvings; attempt++) {
    requireCondition(dtS >= NUMERICS.minDtS && state.timeS + dtS > state.timeS,
      'representable bounded reduced timestep');
    try { return { ...solveStep(g, state.massKg, dtS, work), dtS }; }
    catch (error) {
      if (!(error instanceof ConvergenceFailure)) throw error;
      work.rejected++;
      rejectedStages.push({ startS: state.timeS, dtS, attempt, message: error.message,
        candidate: error.candidate ?? null });
      if (attempt === REGION_LIMITS.maxHalvings) throw error;
      dtS /= 2;
    }
  }
  throw new Error('unreachable bounded region retry');
}

function proposedStep(state, request, intervalS) {
  const remaining = request.endS - state.timeS;
  const roundoff = 16 * Number.EPSILON * Math.max(1, intervalS, request.dtMaxS);
  // Absorb only summation roundoff into the last actual solve. Never advance
  // the clock through an unsolved tiny tail or change the global physical cap.
  if (remaining <= request.dtMaxS + roundoff)
    return remaining <= NUMERICS.maxDtS ? remaining : remaining / 2;
  return request.dtMaxS;
}

function recordStep(prior, next, trial, receipt) {
  const step = { startS: prior.timeS, endS: next.timeS, dtS: trial.dtS,
    headM: trial.headM, massKg: trial.massKg, ledger: trial.ledger, metrics: trial.metrics, closure: trial.closure };
  for (let k = 0; k < receipt.faceTransferKg.length; k++) receipt.faceTransferKg[k] += trial.ledger.transferKg[k];
  for (const [key, value] of Object.entries(trial.metrics)) if (typeof value === 'number')
    receipt.maxAbsMetrics[key] = Math.max(receipt.maxAbsMetrics[key] ?? 0, Math.abs(value));
  receipt.maxAbsMetrics.stockClosureKg = Math.max(receipt.maxAbsMetrics.stockClosureKg ?? 0,
    Math.abs(trial.closure.correctionKg));
  receipt.steps.push(step); receipt.endS = next.timeS;
}

function receiptBalance(g, input, state, receipt) {
  const paired = [...input.massKg];
  for (const [k, face] of g.faces.entries()) {
    paired[face.left] -= receipt.faceTransferKg[k]; paired[face.right] += receipt.faceTransferKg[k];
  }
  const pairKg = maxAbs(paired.map((m, i) => m - state.massKg[i]));
  const totalKg = compensatedSum(state.massKg) - compensatedSum(input.massKg);
  requireCondition(Number.isFinite(pairKg) && pairKg <= NUMERICS.acceptedKg +
    64 * Number.EPSILON * input.initialTotalKg, 'aggregate paired face receipt differs from canonical result');
  return { pairKg, totalKg };
}

function readFacts(g, identity, state) {
  const checked = validateState(g, identity, state);
  return { totalMassKg: checked.totalMassKg, nodes: g.nodes.map((node, i) => {
    const massKg = state.massKg[i];
    if (node.kind !== 'soil') return { nodeId: node.id, kind: node.kind, massKg,
      depthM: massKg / (g.densityKgM3 * node.areaM2), ports: node.portCount,
      ...(node.kind === 'pit' ? { at: node.at, baseYM: node.baseYM, rimYM: node.rimYM,
        heightCells: node.heightCells, capacityKg: node.maxMassKg, atmosphere: 'vented-unmodeled' } : {}) };
    return { nodeId: node.id, kind: node.kind, massKg, theta: massKg / (g.densityKgM3 * node.volumeM3),
      poreAirM3: (node.maxMassKg - massKg) / g.densityKgM3,
      retentionHeadM: checked.anchors.find(a => a.node === i)?.headM ?? null };
  }) };
}

export function createVolume(descriptor) {
  const g = createVolumeGeometry(descriptor);
  const identity = JSON.stringify({ version: VERSION, geometry: g.identity,
    faceRule: 'series-centre-half-trace-quarter-v1', solver: 'analytic-dense-newton-tree-closure-v1',
    pressureGuess: 'stable-id-multisource-bfs-canonical-stock-v1', dryBoundary: 'single-port-only-v1',
    surfaceExchange: SURFACE_EXCHANGE_VERSION,
    ...(g.nodes.some(n => n.kind === 'pit') ? {
      pitBoundary: 'voxel-column-integrated-side-single-floor-positive-depth-v2',
      dryPitReference: 'exposed-saturated-side-atmosphere-v1' } : {}) });

  function advance(input, intervalS, options = {}) {
    const request = admitRequest(g, identity, input, intervalS, options), work = newWork(request);
    const receipt = { startS: input.timeS, endS: input.timeS, faceIds: g.faces.map(f => f.id),
      faceTransferKg: Array(g.faces.length).fill(0), steps: [], rejectedStages: [], maxAbsMetrics: {} };
    let state = input;
    try {
      while (state.timeS < request.endS) {
        requireCondition(receipt.steps.length < request.maxSteps, 'accepted region step budget exhausted; input uncommitted');
        const trial = boundedStep(g, state, proposedStep(state, request, intervalS), work, receipt.rejectedStages);
        const next = freezeState({ ...state, massKg: trial.massKg,
          timeS: state.timeS + trial.dtS, steps: state.steps + 1 });
        validateState(g, identity, next); recordStep(state, next, trial, receipt); state = next;
      }
      receipt.aggregateResidual = receiptBalance(g, input, state, receipt);
    } catch (error) {
      // Diagnostic local progress is explicitly uncommitted, never a new input
      // or an instruction to retry after side effects. Input was never mutated.
      error.partial = { committed: false, lastLocalState: state, receipt, work: { ...work } };
      throw error;
    }
    return { state, receipt, work };
  }

  return Object.freeze({ identity, geometry: g.descriptor, initial: input => initialState(g, identity, input),
    read: state => readFacts(g, identity, state), advance,
    encode: state => { validateState(g, identity, state); return JSON.stringify(state); },
    decode: raw => {
      requireCondition(typeof raw === 'string' && raw.length <= 131072, 'bounded encoded regional water state');
      const state = JSON.parse(raw); validateState(g, identity, state); return freezeState(state);
    } });
}
