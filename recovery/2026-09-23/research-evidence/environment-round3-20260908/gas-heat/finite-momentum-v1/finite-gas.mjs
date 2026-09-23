import { createThermodynamics } from '../finite-thermo-v1/checkpoint/thermodynamics.mjs';
import { INERT_DEFINITION } from '../finite-thermo-v1/checkpoint/definitions.mjs';
import { projectionTopology, projectionDiagnostics, integratedDivergence } from './projection.mjs';
import { numericalGeometry } from './geometry-owner.mjs';
import { momentumGeometry, dualMasses, velocityFromMomentum, totalMomentum, kineticEnergy,
  transportMomentum, projectMomentum } from './momentum.mjs';

export const VERSION = 'sealed-single-species-conservative-momentum-ssprk2-v1';
export const LIMITS = Object.freeze({ courant: 0.45, eosRelative: 5e-10,
  massAbsolute: 1e-12, balanceRelative: 2e-13, energyAbsolute: 1e-8,
  momentumAbsolute: 1e-10, momentumRelative: 5e-12, constraintAbsolute: 1e-10,
  maxMach: 0.01, maxHalvings: 12, maxSteps: 2048, maxCells: 512 });
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const positive = (x) => Number.isFinite(x) && x > 0;
const sum = (values) => { let total = 0, correction = 0;
  for (const x of values) { const y = x - correction, next = total + y; correction = (next - total) - y; total = next; } return total; };
const vectors = ['massKg', 'internalEnergyJ', 'faceMomentumKgMS', 'initialMomentumKgMS', 'bodyImpulseKgMS', 'pressureImpulseKgMS', 'wallImpulseKgMS'];
const freezeState = (s) => Object.freeze(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, vectors.includes(k) ? Object.freeze([...v]) : v])));
const emptyForce = Object.freeze({ identity: 'zero-external-body-acceleration-v1', sample: () => 0 });
class IntermediateEnvelope extends Error { constructor() { super('intermediate-stage temperature envelope'); } }

export function createFiniteGas(inputGeometry, { speciesId = 'inert-air', heatWatts, gravity, bodyForce = emptyForce } = {}) {
  const g = numericalGeometry(inputGeometry), dual = momentumGeometry(g);
  assert(g.n <= LIMITS.maxCells, '512-cell finite study work budget');
  const components = projectionTopology(g);
  assert(components.length === 1 && !components[0].open, 'one connected sealed gas component required');
  assert(g.viscosity === 0 && g.thermalDiffusivity === 0 && g.tracerDiffusivity === 0 && !g.buoyancy,
    'momentum reference has no viscosity/diffusion/Boussinesq buoyancy');
  const thermo = createThermodynamics(INERT_DEFINITION), species = thermo.definition.species.find((s) => s.id === speciesId);
  assert(species, 'one supported inert species');
  const probe = thermo.read(thermo.create({ speciesMassesKg: [{ id: speciesId, massKg: 1 }], volumeM3: 1,
    internalEnergyJ: species.cvJPerKgK * 300 }));
  const gamma = probe.gamma, specificR = probe.specificGasConstantJPerKgK, volume = g.n * g.volume;
  const sourceHeat = heatWatts === undefined ? Array(g.n).fill(0) : heatWatts;
  assert((Array.isArray(sourceHeat) || sourceHeat instanceof Float64Array) && sourceHeat.length === g.n && sourceHeat.every(Number.isFinite), 'fixed finite per-cell heat W');
  const heat = Float64Array.from(sourceHeat);
  const acceleration = [...(gravity ?? Array(g.dimensions).fill(0))];
  assert(acceleration.length === g.dimensions && acceleration.every(Number.isFinite), 'fixed finite gravity vector');
  assert(acceleration.every((a, d) => !g.periodic[d] || a === 0), 'no gravity along a periodic axis');
  assert(bodyForce && typeof bodyForce.identity === 'string' && bodyForce.identity.trim().length > 0 && typeof bodyForce.sample === 'function', 'identified body-force provider');
  const forceIdentity = bodyForce.identity, forceSample = bodyForce.sample;
  const identity = JSON.stringify({ version: VERSION, geometry: g.identity, definition: thermo.definitionIdentity, speciesId,
    heatWatts: Array.from(heat), gravity: acceleration, bodyForceIdentity: forceIdentity });
  let eulerAttempts = 0, eulerStages = 0, faceEvaluations = 0, dualTransferAttempts = 0, dualFaceEvaluations = 0, thermodynamicCellReads = 0;

  function thermalFields(s) {
    const pressure = (gamma - 1) * sum(s.internalEnergyJ) / volume;
    assert(positive(pressure), 'positive derived chamber pressure');
    const density = new Float64Array(g.n), temperature = new Float64Array(g.n), enthalpyPerKg = new Float64Array(g.n);
    let eosError = 0;
    for (const i of components[0].cells) {
      const cell = thermo.read(thermo.create({ speciesMassesKg: [{ id: speciesId, massKg: s.massKg[i] }],
        volumeM3: g.volume, internalEnergyJ: s.internalEnergyJ[i] }));
      thermodynamicCellReads++; density[i] = cell.densityKgPerM3; temperature[i] = cell.temperatureK;
      enthalpyPerKg[i] = cell.enthalpyJ / s.massKg[i]; eosError = Math.max(eosError, Math.abs(cell.pressurePa - pressure) / pressure);
    }
    assert(eosError <= LIMITS.eosRelative, 'local EOS drift exceeds declared reference tolerance');
    return { pressure, density, temperature, enthalpyPerKg, eosError };
  }

  function targetFlux(pressure) {
    const pressureRate = (gamma - 1) * sum(heat) / volume;
    return Float64Array.from(heat, (q) => ((gamma - 1) * q - pressureRate * g.volume) / (gamma * pressure));
  }

  function momentumBalance(s) {
    const total = totalMomentum(g, s.faceMomentumKgMS), errors = [];
    for (let a = 0; a < g.dimensions; a++) {
      const error = total[a] - s.initialMomentumKgMS[a] - s.bodyImpulseKgMS[a] - s.pressureImpulseKgMS[a] - s.wallImpulseKgMS[a];
      const scale = Math.abs(s.initialMomentumKgMS[a]) + Math.abs(s.bodyImpulseKgMS[a]) + Math.abs(s.pressureImpulseKgMS[a]) + Math.abs(s.wallImpulseKgMS[a]);
      assert(Math.abs(error) <= LIMITS.momentumAbsolute + LIMITS.momentumRelative * scale, 'finite momentum impulse balance'); errors.push(error);
    }
    return { totalMomentumKgMS: total, momentumErrorsKgMS: errors };
  }

  function validate(s, constrained = true) {
    assert(s && typeof s === 'object' && Object.keys(s).sort().join('|') ===
      [...vectors, 'version', 'identity', 'time', 'steps', 'initialMassKg', 'initialEnergyJ', 'heatInputJ'].sort().join('|'), 'canonical finite momentum gas shape');
    assert(s.version === VERSION && s.identity === identity, 'gas geometry/definition/forcing identity');
    assert(Number.isFinite(s.time) && s.time >= 0 && Number.isSafeInteger(s.steps) && s.steps >= 0, 'canonical gas clock');
    for (const name of ['massKg', 'internalEnergyJ']) assert(Array.isArray(s[name]) && s[name].length === g.n && s[name].every(positive), 'positive finite gas stock shape');
    for (const name of vectors.slice(2)) assert(Array.isArray(s[name]) && s[name].length === (name === 'faceMomentumKgMS' ? g.faces.length : g.dimensions) && s[name].every(Number.isFinite), 'finite momentum stock/receipt shape');
    assert(positive(s.initialMassKg) && positive(s.initialEnergyJ) && Number.isFinite(s.heatInputJ), 'finite gas balance reference');
    const massError = sum(s.massKg) - s.initialMassKg, energyError = sum(s.internalEnergyJ) - s.initialEnergyJ - s.heatInputJ;
    assert(Math.abs(massError) <= LIMITS.massAbsolute + LIMITS.balanceRelative * s.initialMassKg, 'finite mass balance residual');
    assert(Math.abs(energyError) <= LIMITS.energyAbsolute + LIMITS.balanceRelative * Math.max(s.initialEnergyJ, Math.abs(s.heatInputJ)), 'finite energy balance residual');
    const f = thermalFields(s), balance = momentumBalance(s), velocity = velocityFromMomentum(g, s.massKg, s.faceMomentumKgMS);
    assert(velocity.every(Number.isFinite), 'finite derived velocity');
    const actual = integratedDivergence(g, velocity), target = targetFlux(f.pressure);
    let constraintError = 0, maxMach = 0;
    for (let i = 0; i < g.n; i++) constraintError = Math.max(constraintError, Math.abs(actual[i] - target[i]));
    for (const face of g.faces) maxMach = Math.max(maxMach, Math.abs(velocity[face.k]) /
      Math.sqrt(gamma * specificR * Math.min(f.temperature[face.i], f.temperature[face.j])));
    if (constrained) { assert(constraintError <= LIMITS.constraintAbsolute, 'committed velocity obeys fixed-source constraint'); assert(maxMach <= LIMITS.maxMach, 'declared low-Mach envelope'); }
    return { ...f, ...balance, velocity, constraintError, maxMach, massError, energyError,
      kineticEnergyJ: kineticEnergy(g, s.massKg, s.faceMomentumKgMS), potentialEnergyJ: potentialEnergy(s.massKg) };
  }

  function potentialEnergy(mass) {
    return sum(g.cells.map((c) => mass[c.i] * -sum(acceleration.map((a, d) => a * c.center[['x', 'y', 'z'].indexOf(g.axes[d])]))));
  }

  function initial({ pressurePa, temperatureK = 300, densityKgM3, faceVelocityMS }) {
    assert(positive(pressurePa) && positive(temperatureK), 'positive initial pressure/temperature');
    if (densityKgM3 !== undefined) assert(Array.isArray(densityKgM3) && densityKgM3.length === g.n && densityKgM3.every(positive), 'positive initial density field');
    const massKg = g.cells.map((c) => densityKgM3 ? densityKgM3[c.i] * g.volume : pressurePa * g.volume / (specificR * temperatureK));
    const internalEnergyJ = g.cells.map(() => pressurePa * g.volume / (gamma - 1));
    const velocity = faceVelocityMS ?? Array(g.faces.length).fill(0);
    assert((Array.isArray(velocity) || velocity instanceof Float64Array) && velocity.length === g.faces.length && velocity.every(Number.isFinite), 'finite initial face velocity');
    const dm = dualMasses(g, massKg), momentum = Array.from(velocity, (u, f) => u * dm[dual.faceNode[f]]);
    const s = { version: VERSION, identity, massKg, internalEnergyJ, faceMomentumKgMS: momentum, time: 0, steps: 0,
      initialMassKg: sum(massKg), initialEnergyJ: sum(internalEnergyJ), heatInputJ: 0,
      initialMomentumKgMS: totalMomentum(g, momentum), bodyImpulseKgMS: Array(g.dimensions).fill(0),
      pressureImpulseKgMS: Array(g.dimensions).fill(0), wallImpulseKgMS: Array(g.dimensions).fill(0) };
    validate(s); return freezeState(s);
  }

  function checkedStage(state, constrained) {
    try { return validate(state, constrained); }
    catch (error) {
      if (error instanceof RangeError && error.message === 'temperature outside definition envelope') throw new IntermediateEnvelope();
      throw error;
    }
  }

  function transferThermal(s, f, dt) {
    const outgoing = new Float64Array(g.n);
    for (const face of g.faces) { const q = f.velocity[face.k] * face.area;
      outgoing[face.i] += Math.max(q, 0); outgoing[face.j] += Math.max(-q, 0); }
    let courant = 0;
    for (let i = 0; i < g.n; i++) courant = Math.max(courant, dt * (gamma * outgoing[i] / g.volume + Math.max(-heat[i], 0) / s.internalEnergyJ[i]));
    if (courant > LIMITS.courant) return null;
    const mass = [...s.massKg], energy = [...s.internalEnergyJ], massTransfer = new Float64Array(g.faces.length), enthalpyTransfer = new Float64Array(g.faces.length);
    faceEvaluations += g.faces.length;
    for (const face of g.faces) {
      const q = f.velocity[face.k] * face.area, donor = q >= 0 ? face.i : face.j;
      const dm = dt * q * f.density[donor], dh = dm * f.enthalpyPerKg[donor];
      massTransfer[face.k] = dm; enthalpyTransfer[face.k] = dh;
      mass[face.i] -= dm; mass[face.j] += dm; energy[face.i] -= dh; energy[face.j] += dh;
    }
    const heatTransfer = Float64Array.from(heat, (q, i) => { const dq = dt * q; assert(Number.isFinite(dq), 'finite source energy'); energy[i] += dq; return dq; });
    return { state: { ...s, massKg: mass, internalEnergyJ: energy, time: s.time + dt, steps: s.steps + 1,
      heatInputJ: s.heatInputJ + sum(heatTransfer) }, receipt: { massTransferKg: Array.from(massTransfer), enthalpyTransferJ: Array.from(enthalpyTransfer), heatTransferJ: Array.from(heatTransfer), courant } };
  }

  function nodeTotals(values) {
    const out = Array(g.dimensions).fill(0); for (const node of dual.nodes) out[node.axis] += values[node.k]; return out;
  }
  const plus = (a, b) => a.map((x, i) => x + b[i]);

  function euler(s, dt) {
    assert(positive(dt) && Number.isFinite(s.time + dt) && s.time + dt > s.time, 'representable stage interval');
    eulerAttempts++;
    const before = validate(s), thermal = transferThermal(s, before, dt); if (!thermal) return null;
    const fields = checkedStage(thermal.state, false);
    const forcing = Float64Array.from(dual.nodes, (node) => acceleration[node.axis] + forceSample(node, s.time));
    assert(forcing.every(Number.isFinite), 'finite sampled body acceleration');
    dualTransferAttempts++;
    const moved = transportMomentum(g, s.massKg, thermal.state.massKg, s.faceMomentumKgMS, thermal.receipt.massTransferKg, dt, forcing);
    if (!moved) return null; dualFaceEvaluations += dual.interfaces.length;
    const projected = projectMomentum(g, thermal.state.massKg, moved.momentum, targetFlux(fields.pressure));
    const state = { ...thermal.state, faceMomentumKgMS: projected.momentum,
      bodyImpulseKgMS: plus(s.bodyImpulseKgMS, nodeTotals(moved.receipt.bodyImpulseKgMS)),
      wallImpulseKgMS: plus(s.wallImpulseKgMS, nodeTotals(moved.receipt.wallImpulseKgMS)),
      pressureImpulseKgMS: plus(s.pressureImpulseKgMS, totalMomentum(g, projected.receipt.pressureImpulseKgMS)) };
    const checked = checkedStage(state, true); eulerStages++;
    return { state: freezeState(state), receipt: { ...thermal.receipt, ...moved.receipt,
      pressure: { ...projected.receipt, forceEvaluationTime: s.time, constraintTime: state.time, interval: dt },
      potentialEnergyChangeJ: checked.potentialEnergyJ - before.potentialEnergyJ,
      maxMach: checked.maxMach, eosError: checked.eosError, massError: checked.massError, energyError: checked.energyError,
      momentumErrorsKgMS: checked.momentumErrorsKgMS } };
  }

  function admitAdvance(input, interval, { dtMax = 1, maxSteps = LIMITS.maxSteps }) {
    validate(input);
    assert(Number.isFinite(interval) && interval >= 0 && positive(dtMax) && Number.isFinite(input.time + interval), 'finite advance interval');
    const end = input.time + interval;
    assert(interval === 0 || end > input.time, 'positive interval must advance representable time');
    assert(Number.isSafeInteger(maxSteps) && maxSteps > 0 && maxSteps <= LIMITS.maxSteps && Math.ceil(interval / dtMax) <= maxSteps, 'bounded accepted-step work request');
    const finalBulkTemperature = (sum(input.internalEnergyJ) + sum(heat) * interval) / (sum(input.massKg) * species.cvJPerKgK);
    assert(Number.isFinite(finalBulkTemperature) && finalBulkTemperature >= species.minTemperatureK && finalBulkTemperature <= species.maxTemperatureK, 'requested bulk endpoint outside temperature envelope');
    return { end, dtMax, maxSteps };
  }

  function rungeKuttaTrial(state, dt) {
    let a, b, rejected = 0; const retryReasons = { courant: 0, intermediateEnvelope: 0 };
    for (let attempts = 0; ; attempts++) {
      assert(attempts <= LIMITS.maxHalvings, 'finite stage retry budget'); let reason = 'courant';
      try { a = euler(state, dt); b = a && euler(a.state, dt); }
      catch (error) { if (!(error instanceof IntermediateEnvelope)) throw error; a = null; b = null; reason = 'intermediateEnvelope'; }
      if (a && b) break;
      dt /= 2; rejected++; retryReasons[reason]++;
    }
    return { dt, a, b, rejected, retryReasons };
  }

  const transferLengths = { massTransferKg: g.faces.length, enthalpyTransferJ: g.faces.length, heatTransferJ: g.n,
    dualMassTransferKg: dual.interfaces.length, momentumTransferKgMS: dual.interfaces.length,
    bodyImpulseKgMS: dual.nodes.length, wallImpulseKgMS: dual.nodes.length, pressureImpulseKgMS: g.faces.length };
  function acceptedAdvance(input) {
    return { state: input, rejected: 0, retryReasons: { courant: 0, intermediateEnvelope: 0 }, lastStepPressure: null,
      transfers: Object.fromEntries(Object.entries(transferLengths).map(([k, n]) => [k, new Float64Array(n)])),
      mechanical: { advectionKChangeJ: 0, bodyKChangeJ: 0, wallConstraintKChangeJ: 0, pressureKChangeJ: 0, rkAveragingKChangeJ: 0, potentialEnergyChangeJ: 0 },
      maxConstraint: 0, maxEOS: 0, maxCourant: 0, maxDualCourant: 0, maxMach: 0,
      maxAcceptedTemperatureK: Math.max(...thermalFields(input).temperature) };
  }

  function averageState(state, b, dt) {
    const average = { ...state, time: state.time + dt, steps: state.steps + 1, heatInputJ: (state.heatInputJ + b.heatInputJ) / 2 };
    for (const k of ['massKg', 'internalEnergyJ', 'faceMomentumKgMS', 'bodyImpulseKgMS', 'wallImpulseKgMS', 'pressureImpulseKgMS']) average[k] = state[k].map((x, i) => (x + b[k][i]) / 2);
    return average;
  }

  function acceptTrial(accepted, { dt, a, b, rejected, retryReasons }) {
    const before = accepted.state, average = averageState(before, b.state, dt), fields = checkedStage(average, false);
    const finalProjection = projectMomentum(g, average.massKg, average.faceMomentumKgMS, targetFlux(fields.pressure));
    const state = { ...average, faceMomentumKgMS: finalProjection.momentum,
      pressureImpulseKgMS: plus(average.pressureImpulseKgMS, totalMomentum(g, finalProjection.receipt.pressureImpulseKgMS)) };
    const checked = checkedStage(state, true); accepted.state = freezeState(state);
    for (const [k, output] of Object.entries(accepted.transfers)) for (let i = 0; i < output.length; i++) {
      if (k === 'pressureImpulseKgMS') output[i] += (a.receipt.pressure[k][i] + b.receipt.pressure[k][i]) / 2 + finalProjection.receipt[k][i];
      else output[i] += (a.receipt[k][i] + b.receipt[k][i]) / 2;
    }
    for (const k of ['advectionKChangeJ', 'bodyKChangeJ', 'wallConstraintKChangeJ', 'potentialEnergyChangeJ']) accepted.mechanical[k] += (a.receipt[k] + b.receipt[k]) / 2;
    accepted.mechanical.pressureKChangeJ += (a.receipt.pressure.pressureKChangeJ + b.receipt.pressure.pressureKChangeJ) / 2 + finalProjection.receipt.pressureKChangeJ;
    accepted.mechanical.rkAveragingKChangeJ += fields.kineticEnergyJ - (kineticEnergy(g, before.massKg, before.faceMomentumKgMS) + kineticEnergy(g, b.state.massKg, b.state.faceMomentumKgMS)) / 2;
    for (const stage of [a, b]) {
      accepted.maxConstraint = Math.max(accepted.maxConstraint, stage.receipt.pressure.constraintError);
      accepted.maxEOS = Math.max(accepted.maxEOS, stage.receipt.eosError); accepted.maxCourant = Math.max(accepted.maxCourant, stage.receipt.courant);
      accepted.maxDualCourant = Math.max(accepted.maxDualCourant, stage.receipt.dualCourant); accepted.maxMach = Math.max(accepted.maxMach, stage.receipt.maxMach);
    }
    accepted.maxConstraint = Math.max(accepted.maxConstraint, finalProjection.receipt.constraintError);
    accepted.maxMach = Math.max(accepted.maxMach, checked.maxMach); accepted.maxEOS = Math.max(accepted.maxEOS, checked.eosError);
    accepted.maxAcceptedTemperatureK = Math.max(accepted.maxAcceptedTemperatureK, ...checked.temperature);
    accepted.lastStepPressure = { first: { weight: 0.5, ...a.receipt.pressure }, second: { weight: 0.5, ...b.receipt.pressure },
      final: { weight: 1, kind: 'endpoint-constraint-correction', constraintTime: state.time, ...finalProjection.receipt } };
    accepted.rejected += rejected; accepted.retryReasons.courant += retryReasons.courant; accepted.retryReasons.intermediateEnvelope += retryReasons.intermediateEnvelope;
  }

  function advance(input, interval, options = {}) {
    const request = admitAdvance(input, interval, options), accepted = acceptedAdvance(input);
    while (accepted.state.time < request.end) {
      assert(accepted.state.steps - input.steps < request.maxSteps, 'accepted-step work budget exhausted; input uncommitted');
      acceptTrial(accepted, rungeKuttaTrial(accepted.state, Math.min(request.dtMax, request.end - accepted.state.time)));
    }
    const transfers = Object.fromEntries(Object.entries(accepted.transfers).map(([k, a]) => [k, Array.from(a)]));
    const { state, rejected, retryReasons, lastStepPressure, mechanical, maxConstraint, maxEOS, maxCourant, maxDualCourant, maxMach, maxAcceptedTemperatureK } = accepted;
    return { state, receipt: { start: input.time, end: state.time, ...transfers, ...mechanical }, rejected, retryReasons, lastStepPressure,
      maxConstraint, maxEOS, maxCourant, maxDualCourant, maxMach, maxAcceptedTemperatureK };
  }

  return Object.freeze({ identity, gamma, specificR, initial, read: validate, advance, layout: dual,
    forwardEuler: (state, dt) => { validate(state); return euler(state, dt); },
    encode: (state) => { validate(state); return JSON.stringify(state); },
    decode: (text) => { assert(typeof text === 'string', 'encoded gas text'); const s = JSON.parse(text); validate(s); return freezeState(s); },
    diagnostics: () => ({ ...projectionDiagnostics(g), eulerAttempts, eulerStages, faceEvaluations, dualTransferAttempts,
      dualFaceEvaluations, thermodynamicCellReads, dualNodes: dual.nodes.length, dualInterfaces: dual.interfaces.length }),
  });
}
