import { createThermodynamics } from '../finite-thermo-v1/checkpoint/thermodynamics.mjs';
import { INERT_DEFINITION } from '../finite-thermo-v1/checkpoint/definitions.mjs';
import { project, projectionTopology, projectionDiagnostics } from './projection.mjs';
import { numericalGeometry } from './geometry-owner.mjs';

export const VERSION = 'sealed-single-species-expansion-ssprk2-v1';
export const LIMITS = Object.freeze({ courant: 0.45, eosRelative: 5e-10,
  massAbsolute: 1e-12, balanceRelative: 2e-13, energyAbsolute: 1e-8, maxHalvings: 12,
  maxSteps: 2048, maxCells: 512 });
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const positive = (x) => Number.isFinite(x) && x > 0;
const sum = (values) => { let total = 0, correction = 0;
  for (const x of values) { const y = x - correction, next = total + y; correction = (next - total) - y; total = next; } return total; };
const freezeState = (s) => Object.freeze({ ...s, massKg: Object.freeze([...s.massKg]), internalEnergyJ: Object.freeze([...s.internalEnergyJ]) });
class IntermediateEnvelope extends Error { constructor() { super('intermediate-stage temperature envelope'); } }

export function createFiniteGas(g, { speciesId = 'inert-air' } = {}) {
  g = numericalGeometry(g);
  assert(g.n <= LIMITS.maxCells, '512-cell finite study work budget');
  const components = projectionTopology(g);
  assert(components.length === 1 && !components[0].open, 'one connected sealed gas component required');
  assert(g.faces.every((f) => f.i >= 0 && f.j >= 0), 'no finite-reservoir or exterior gas faces');
  assert(g.viscosity === 0 && g.thermalDiffusivity === 0 && g.tracerDiffusivity === 0 && !g.buoyancy,
    'expansion reference has no viscosity/diffusion/gravity');
  const thermo = createThermodynamics(INERT_DEFINITION);
  const species = thermo.definition.species.find((s) => s.id === speciesId);
  assert(species, 'one supported inert species');
  const probe = thermo.read(thermo.create({ speciesMassesKg: [{ id: speciesId, massKg: 1 }], volumeM3: 1,
    internalEnergyJ: species.cvJPerKgK * 300 }));
  const gamma = probe.gamma, specificR = probe.specificGasConstantJPerKgK;
  const volume = components[0].cells.length * g.volume;
  const identity = JSON.stringify({ version: VERSION, geometry: g.identity, definition: thermo.definitionIdentity, speciesId });
  let eulerAttempts = 0, eulerStages = 0, faceEvaluations = 0, thermodynamicCellReads = 0;

  function fields(s) {
    const pressure = (gamma - 1) * sum(s.internalEnergyJ) / volume;
    assert(positive(pressure), 'positive derived chamber pressure');
    const density = new Float64Array(g.n), temperature = new Float64Array(g.n), enthalpyPerKg = new Float64Array(g.n);
    let eosError = 0;
    for (const i of components[0].cells) {
      const cell = thermo.read(thermo.create({ speciesMassesKg: [{ id: speciesId, massKg: s.massKg[i] }],
        volumeM3: g.volume, internalEnergyJ: s.internalEnergyJ[i] }));
      thermodynamicCellReads++;
      density[i] = cell.densityKgPerM3; temperature[i] = cell.temperatureK;
      enthalpyPerKg[i] = cell.enthalpyJ / s.massKg[i];
      eosError = Math.max(eosError, Math.abs(cell.pressurePa - pressure) / pressure);
    }
    assert(eosError <= LIMITS.eosRelative, 'local EOS drift exceeds declared reference tolerance');
    return { pressure, density, temperature, enthalpyPerKg, eosError };
  }

  function validate(s) {
    assert(s && typeof s === 'object' && Object.keys(s).sort().join('|') ===
      ['version', 'identity', 'massKg', 'internalEnergyJ', 'time', 'steps', 'initialMassKg', 'initialEnergyJ', 'heatInputJ'].sort().join('|'), 'canonical finite gas shape');
    assert(s.version === VERSION && s.identity === identity, 'gas geometry/definition identity');
    assert(Number.isFinite(s.time) && s.time >= 0 && Number.isSafeInteger(s.steps) && s.steps >= 0, 'canonical gas clock');
    for (const key of ['massKg', 'internalEnergyJ']) assert(Array.isArray(s[key]) && s[key].length === g.n &&
      s[key].every((x, i) => Number.isFinite(x) && (g.fluid[i] ? x > 0 : x === 0)), 'positive finite gas stock shape');
    assert(positive(s.initialMassKg) && positive(s.initialEnergyJ) && Number.isFinite(s.heatInputJ), 'finite gas balance reference');
    const massError = sum(s.massKg) - s.initialMassKg;
    const energyError = sum(s.internalEnergyJ) - s.initialEnergyJ - s.heatInputJ;
    assert(Math.abs(massError) <= LIMITS.massAbsolute + LIMITS.balanceRelative * s.initialMassKg, 'finite mass balance residual');
    assert(Math.abs(energyError) <= LIMITS.energyAbsolute + LIMITS.balanceRelative * Math.max(s.initialEnergyJ, Math.abs(s.heatInputJ)), 'finite energy balance residual');
    return { ...fields(s), massError, energyError };
  }

  function initial({ pressurePa, temperatureK }) {
    assert(positive(pressurePa) && positive(temperatureK), 'positive initial pressure/temperature');
    const massKg = g.cells.map((c) => c.fluid ? pressurePa * g.volume / (specificR * temperatureK) : 0);
    const internalEnergyJ = massKg.map((m) => m * species.cvJPerKgK * temperatureK);
    const s = { version: VERSION, identity, massKg, internalEnergyJ, time: 0, steps: 0,
      initialMassKg: sum(massKg), initialEnergyJ: sum(internalEnergyJ), heatInputJ: 0 };
    validate(s); return freezeState(s);
  }

  function heatInput(input) {
    assert((Array.isArray(input) || input instanceof Float64Array) && input.length === g.n &&
      input.every((q, i) => Number.isFinite(q) && (g.fluid[i] || q === 0)), 'finite per-cell heat W');
    return Float64Array.from(input);
  }

  function euler(s, dt, heat) {
    assert(positive(dt) && Number.isFinite(s.time + dt) && s.time + dt > s.time, 'representable stage interval');
    eulerAttempts++;
    const f = validate(s), pressureRate = (gamma - 1) * sum(heat) / volume;
    const target = Float64Array.from(heat, (q, i) => g.fluid[i] ?
      ((gamma - 1) * q - pressureRate * g.volume) / (gamma * f.pressure) : 0);
    const beta = Float64Array.from(g.faces, (face) => 2 / (f.density[face.i] + f.density[face.j]));
    const projected = project(g, new Float64Array(g.faces.length), { targetVolumeFlux: target, faceCoefficient: beta });
    const velocity = Float64Array.from(projected.velocity), outgoing = new Float64Array(g.n);
    for (const face of g.faces) {
      const q = velocity[face.k] * face.area;
      outgoing[face.i] += Math.max(q, 0); outgoing[face.j] += Math.max(-q, 0);
    }
    let courant = 0;
    for (const i of components[0].cells) courant = Math.max(courant,
      dt * (gamma * outgoing[i] / g.volume + Math.max(-heat[i], 0) / s.internalEnergyJ[i]));
    if (courant > LIMITS.courant) return null;
    const mass = [...s.massKg], energy = [...s.internalEnergyJ];
    const massTransfer = new Float64Array(g.faces.length), enthalpyTransfer = new Float64Array(g.faces.length);
    faceEvaluations += g.faces.length;
    for (const face of g.faces) {
      const q = velocity[face.k] * face.area, donor = q >= 0 ? face.i : face.j;
      const dm = dt * q * f.density[donor], dh = dm * f.enthalpyPerKg[donor];
      massTransfer[face.k] = dm; enthalpyTransfer[face.k] = dh;
      mass[face.i] -= dm; mass[face.j] += dm;
      energy[face.i] -= dh; energy[face.j] += dh;
    }
    const heatTransfer = Float64Array.from(heat, (q, i) => {
      const dq = dt * q; assert(Number.isFinite(dq), 'finite source energy'); energy[i] += dq; return dq;
    });
    const state = { ...s, massKg: mass, internalEnergyJ: energy, time: s.time + dt, steps: s.steps + 1,
      heatInputJ: s.heatInputJ + sum(heatTransfer) };
    let checked;
    try { checked = validate(state); }
    catch (error) {
      // Only the new, virtual stage's named thermodynamic-envelope rejection is
      // retriable. Identity, shape, EOS, balance and linear errors stay fatal.
      if (error instanceof RangeError && error.message === 'temperature outside definition envelope')
        throw new IntermediateEnvelope();
      throw error;
    }
    eulerStages++;
    const maxMach = g.faces.reduce((m, face) => Math.max(m, Math.abs(velocity[face.k]) /
      Math.sqrt(gamma * specificR * Math.min(f.temperature[face.i], f.temperature[face.j]))), 0);
    return { state: freezeState(state), receipt: {
      evaluationTime: s.time, evaluationPressurePa: f.pressure, pressureRatePaS: pressureRate,
      velocity: Array.from(velocity), targetVolumeFlux: Array.from(target), faceCoefficient: Array.from(beta),
      massTransferKg: Array.from(massTransfer), enthalpyTransferJ: Array.from(enthalpyTransfer), heatTransferJ: Array.from(heatTransfer),
      courant, maxMach, constraintError: projected.constraintError, linearResidual: projected.linearResidual,
      eosError: checked.eosError, massBalanceErrorKg: checked.massError, energyBalanceErrorJ: checked.energyError,
    } };
  }

  function admitAdvance(input, interval, { dtMax = 1, heatWatts, maxSteps = LIMITS.maxSteps }) {
    validate(input); const heat = heatInput(heatWatts);
    assert(Number.isFinite(interval) && interval >= 0 && positive(dtMax) && Number.isFinite(input.time + interval), 'finite advance interval');
    const end = input.time + interval;
    assert(interval === 0 || end > input.time, 'positive interval must advance representable time');
    assert(Number.isSafeInteger(maxSteps) && maxSteps > 0 && maxSteps <= LIMITS.maxSteps &&
      Math.ceil(interval / dtMax) <= maxSteps, 'bounded accepted-step work request');
    const finalBulkTemperature = (sum(input.internalEnergyJ) + sum(heat) * interval) /
      (sum(input.massKg) * species.cvJPerKgK);
    assert(Number.isFinite(finalBulkTemperature) && finalBulkTemperature >= species.minTemperatureK &&
      finalBulkTemperature <= species.maxTemperatureK, 'requested bulk endpoint outside temperature envelope');
    return { heat, end, dtMax, maxSteps };
  }

  function rungeKuttaTrial(state, dt, heat) {
    let a, b, rejected = 0;
    const retryReasons = { courant: 0, intermediateEnvelope: 0 };
    for (let attempts = 0; ; attempts++) {
      assert(attempts <= LIMITS.maxHalvings, 'finite stage retry budget');
      let reason = 'courant';
      try { a = euler(state, dt, heat); b = a && euler(a.state, dt, heat); }
      catch (error) {
        if (!(error instanceof IntermediateEnvelope)) throw error;
        a = null; b = null; reason = 'intermediateEnvelope';
      }
      if (a && b) break;
      dt /= 2; rejected++; retryReasons[reason]++;
    }
    return { dt, a, b, rejected, retryReasons };
  }

  function acceptedAdvance(input) {
    return { state: input, rejected: 0, lastStage: null, maxConstraint: 0, maxEOS: 0, maxCourant: 0, maxMach: 0,
      maxAcceptedTemperatureK: Math.max(...fields(input).temperature),
      retryReasons: { courant: 0, intermediateEnvelope: 0 },
      massTransferKg: new Float64Array(g.faces.length), enthalpyTransferJ: new Float64Array(g.faces.length),
      heatTransferJ: new Float64Array(g.n) };
  }

  function acceptTrial(accepted, { dt, a, b, rejected, retryReasons }) {
    const state = accepted.state;
    const average = { ...state, massKg: state.massKg.map((m, i) => (m + b.state.massKg[i]) / 2),
      internalEnergyJ: state.internalEnergyJ.map((u, i) => (u + b.state.internalEnergyJ[i]) / 2),
      time: state.time + dt, steps: state.steps + 1,
      heatInputJ: (state.heatInputJ + b.state.heatInputJ) / 2 };
    const acceptedFields = validate(average); accepted.state = freezeState(average);
    accepted.maxAcceptedTemperatureK = Math.max(accepted.maxAcceptedTemperatureK, ...acceptedFields.temperature);
    for (const [key, output] of [['massTransferKg', accepted.massTransferKg], ['enthalpyTransferJ', accepted.enthalpyTransferJ], ['heatTransferJ', accepted.heatTransferJ]])
      for (let i = 0; i < output.length; i++) output[i] += (a.receipt[key][i] + b.receipt[key][i]) / 2;
    for (const stage of [a, b]) {
      accepted.maxConstraint = Math.max(accepted.maxConstraint, stage.receipt.constraintError);
      accepted.maxEOS = Math.max(accepted.maxEOS, stage.receipt.eosError); accepted.maxCourant = Math.max(accepted.maxCourant, stage.receipt.courant);
      accepted.maxMach = Math.max(accepted.maxMach, stage.receipt.maxMach);
    }
    accepted.lastStage = b.receipt;
    accepted.rejected += rejected;
    accepted.retryReasons.courant += retryReasons.courant;
    accepted.retryReasons.intermediateEnvelope += retryReasons.intermediateEnvelope;
  }

  function advanceResult(input, accepted) {
    const { state, rejected, retryReasons, lastStage, maxConstraint, maxEOS, maxCourant, maxMach, maxAcceptedTemperatureK } = accepted;
    return { state, receipt: { start: input.time, end: state.time, massTransferKg: Array.from(accepted.massTransferKg),
      enthalpyTransferJ: Array.from(accepted.enthalpyTransferJ), heatTransferJ: Array.from(accepted.heatTransferJ) },
      rejected, retryReasons, lastStage, maxConstraint, maxEOS, maxCourant, maxMach, maxAcceptedTemperatureK };
  }

  function advance(input, interval, options = {}) {
    const request = admitAdvance(input, interval, options), accepted = acceptedAdvance(input);
    while (accepted.state.time < request.end) {
      assert(accepted.state.steps - input.steps < request.maxSteps, 'accepted-step work budget exhausted; input uncommitted');
      const dt = Math.min(request.dtMax, request.end - accepted.state.time);
      acceptTrial(accepted, rungeKuttaTrial(accepted.state, dt, request.heat));
    }
    return advanceResult(input, accepted);
  }

  return Object.freeze({ identity, gamma, specificR, initial, read: validate, advance,
    forwardEuler: (input, dt, heatWatts) => { validate(input); return euler(input, dt, heatInput(heatWatts)); },
    encode: (s) => { validate(s); return JSON.stringify(s); },
    decode: (text) => { assert(typeof text === 'string', 'encoded gas text'); const s = JSON.parse(text); validate(s); return freezeState(s); },
    diagnostics: () => ({ ...projectionDiagnostics(g), eulerAttempts, eulerStages, faceEvaluations, thermodynamicCellReads }),
  });
}
