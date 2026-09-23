import { createSoil, compensatedSum, requireCondition } from './soil.mjs';
import { createGeometry, guessHeads, LIMITS } from './geometry.mjs';
import { solveStep, ConvergenceFailure } from './solve.mjs';

const VERSION = 'rigid-richards-finite-boundaries-be-v1';
const freezeState = state => Object.freeze({ ...state, massKg: Object.freeze([...state.massKg]) });
const stateKeys = ['version', 'identity', 'massKg', 'initialTotalKg', 'timeS', 'steps'].sort().join('|');

export function createColumn(geometry, soilDefinition) {
  const soil = createSoil(soilDefinition), g = createGeometry(geometry, soil);
  const identity = JSON.stringify({ version: VERSION, geometry: g.identity, soil: soil.identity,
    faceRule: 'series-centre-half-trace-quarter-v1', solver: 'analytic-newton-conservative-closure-v1' });

  function validate(s) {
    requireCondition(s && typeof s === 'object' && Object.keys(s).sort().join('|') === stateKeys,
      'canonical soil state fields');
    requireCondition(s.version === VERSION && s.identity === identity, 'column definition/geometry identity');
    requireCondition(Number.isFinite(s.timeS) && s.timeS >= 0 && Number.isSafeInteger(s.steps) && s.steps >= 0,
      'canonical column clock');
    requireCondition(Array.isArray(s.massKg) && s.massKg.length === g.nodes.length &&
      s.massKg.every((m, i) => Number.isFinite(m) && m >= g.nodes[i].minMass && m <= g.nodes[i].maxMass),
      'water mass outside exact pore/boundary capacity');
    const total = compensatedSum(s.massKg);
    requireCondition(Number.isFinite(s.initialTotalKg) && s.initialTotalKg > 0 &&
      Math.abs(total - s.initialTotalKg) <= LIMITS.balanceKg + 64 * Number.EPSILON * s.initialTotalKg,
      'canonical total water balance');
    const initialGuess = guessHeads(g, s.massKg);
    return { totalMassKg: total, initialGuessHeadM: initialGuess,
      soil: g.nodes.slice(1, 1 + g.descriptor.cells).map((node, i) => {
        const mass = s.massKg[i + 1], theta = mass / (g.rho * node.volume);
        return { massKg: mass, theta, effectiveSaturation: (theta - soil.definition.thetaR) /
          (soil.definition.porosity - soil.definition.thetaR),
          saturation: theta / soil.definition.porosity,
          poreAirM3: (node.maxMass - mass) / g.rho,
          retentionHeadM: mass === node.maxMass ? null : initialGuess[i + 1] };
      }), pondMassKg: s.massKg[0], standpipeMassKg: g.descriptor.standpipeAreaM2 === null ? null : s.massKg.at(-1) };
  }

  function initial(input) {
    requireCondition(input && typeof input === 'object' && Object.keys(input).every(key =>
      ['waterMassKg', 'pondMassKg', 'standpipeMassKg'].includes(key)), 'canonical initial water fields');
    const { waterMassKg, pondMassKg = 0, standpipeMassKg = null } = input;
    requireCondition(Array.isArray(waterMassKg) && waterMassKg.length === g.descriptor.cells,
      'one initial canonical mass per soil cell');
    requireCondition(g.descriptor.standpipeAreaM2 === null ? standpipeMassKg === null :
      Number.isFinite(standpipeMassKg), 'finite standpipe matches geometry');
    const massKg = [pondMassKg, ...waterMassKg];
    if (g.descriptor.standpipeAreaM2 !== null) massKg.push(standpipeMassKg);
    const state = { version: VERSION, identity, massKg, initialTotalKg: compensatedSum(massKg), timeS: 0, steps: 0 };
    validate(state); return freezeState(state);
  }

  function admitRequest(input, intervalS, options) {
    validate(input);
    requireCondition(options && typeof options === 'object' && Object.keys(options).every(key =>
      ['dtMaxS', 'maxSteps', 'maxEvaluations'].includes(key)), 'supported column work options');
    const { dtMaxS = 10, maxSteps = LIMITS.maxSteps, maxEvaluations = LIMITS.maxEvaluations } = options;
    requireCondition(Number.isFinite(intervalS) && intervalS >= 0 && intervalS <= LIMITS.maxIntervalS &&
      Number.isFinite(input.timeS + intervalS) && (intervalS === 0 || input.timeS + intervalS > input.timeS),
      'finite representable column interval');
    requireCondition(Number.isFinite(dtMaxS) && dtMaxS >= LIMITS.minDtS && dtMaxS <= LIMITS.maxDtS &&
      Number.isSafeInteger(maxSteps) && maxSteps > 0 && maxSteps <= LIMITS.maxSteps &&
      Math.ceil(intervalS / dtMaxS) <= maxSteps && Number.isSafeInteger(input.steps + maxSteps),
      'bounded column time/step request');
    requireCondition(Number.isSafeInteger(maxEvaluations) && maxEvaluations > 0 &&
      maxEvaluations <= LIMITS.maxEvaluations, 'bounded nonlinear evaluation request');
    return { end: input.timeS + intervalS, dtMaxS, maxSteps, maxEvaluations };
  }

  function trialStep(state, proposedDt, work) {
    let dt = proposedDt;
    for (let attempt = 0; attempt <= LIMITS.maxHalvings; attempt++) {
      requireCondition(dt >= LIMITS.minDtS && state.timeS + dt > state.timeS,
        'representable bounded reduced timestep');
      try { return { ...solveStep(g, state.massKg, dt, work), dt }; }
      catch (error) {
        if (!(error instanceof ConvergenceFailure)) throw error;
        work.rejected++;
        if (attempt === LIMITS.maxHalvings) throw error;
        dt /= 2;
      }
    }
    throw new Error('unreachable bounded timestep loop');
  }

  function advance(input, intervalS, options = {}) {
    const request = admitRequest(input, intervalS, options);
    const work = { evaluations: 0, evaluationLimit: request.maxEvaluations,
      faceEvaluations: 0, iterations: 0, lineTrials: 0, rejected: 0 };
    let state = input, lastStep = null;
    const transfers = Array(g.faces.length).fill(0), steps = [];
    try {
      while (state.timeS < request.end) {
        requireCondition(state.steps - input.steps < request.maxSteps,
          'accepted column step budget exhausted; input uncommitted');
        const trial = trialStep(state, Math.min(request.dtMaxS, request.end - state.timeS), work);
        const next = { ...state, massKg: trial.mass, timeS: state.timeS + trial.dt, steps: state.steps + 1 };
        validate(next);
        lastStep = { startS: state.timeS, endS: next.timeS, headM: trial.heads,
          transferKg: trial.metrics.transferKg, metrics: trial.metrics, closure: trial.closure };
        for (let i = 0; i < transfers.length; i++) transfers[i] += trial.metrics.transferKg[i];
        steps.push(lastStep); state = freezeState(next);
      }
    } catch (error) {
      // Inspectable numerical evidence only. The request returns no committed
      // result and has never mutated input; this is not a continuation token.
      error.partial = { committed: false, lastLocalState: state, lastStep,
        faceTransferKg: [...transfers], steps, work: { ...work } };
      throw error;
    }
    return { state, receipt: { startS: input.timeS, endS: state.timeS,
      faceTransferKg: transfers, steps }, lastStep, work };
  }

  return Object.freeze({ identity, definition: soil.definition, geometry: g.descriptor,
    initial, read: validate, advance,
    encode: state => { validate(state); return JSON.stringify(state); },
    decode: raw => {
      requireCondition(typeof raw === 'string' && raw.length <= 32768, 'bounded encoded soil state');
      const state = JSON.parse(raw); validate(state); return freezeState(state);
    } });
}
