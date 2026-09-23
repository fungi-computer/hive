import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { geometry } from '../transport-v2/checkpoint/geometry.mjs';
import { createFiniteGas, LIMITS } from '../finite-momentum-v1/finite-gas.mjs';
import { createBuoyancyOracle } from '../linear-buoyancy-oracle-v1/oracle.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const started = performance.now(), cpuStarted = process.cpuUsage();
const lengths = [4, 2.16, 4], gravity = [0, -9.81, 0], pressurePa = 100000;
const specificR = 8.31446261815324 / .02897, rho0 = pressurePa / (specificR * 300), probeDt = 1 / 1024;
const sourcePaths = ['qualify.mjs', 'CONTRACT.md', '../finite-momentum-v1/finite-gas.mjs',
  '../finite-momentum-v1/momentum.mjs', '../finite-momentum-v1/projection.mjs', '../finite-momentum-v1/geometry-owner.mjs',
  '../transport-v2/checkpoint/geometry.mjs', '../finite-thermo-v1/checkpoint/thermodynamics.mjs',
  '../finite-thermo-v1/checkpoint/definitions.mjs', '../linear-buoyancy-oracle-v1/oracle.mjs',
  '../linear-buoyancy-oracle-v1/run-v1/proof.json'];
const hash = (path) => createHash('sha256').update(readFileSync(directory + path)).digest('hex');
const sourcePins = Object.fromEntries(sourcePaths.map((path) => [path, hash(path)]));
writeFileSync(directory + 'run-source-inventory.json', JSON.stringify(sourcePins, null, 2) + '\n');
const frozenInventory = JSON.parse(readFileSync(directory + '../finite-momentum-v1/handoff-inventory.json', 'utf8'));
let checks = 0, returnedRKSteps = 0, exposedEulerStages = 0, activeCase = null;
const groups = [], cases = {}, errors = {};
const sum = (values) => values.reduce((a, b) => a + b, 0);
const maximum = (values) => values.reduce((a, b) => Math.max(a, Math.abs(b)), 0);
const rms = (values) => Math.sqrt(sum(values.map((x) => x * x)) / values.length);
const difference = (a, b) => a.map((x, i) => x - b[i]);
const relativeL2 = (a, b) => rms(difference(a, b)) / rms(b);
function ok(value, message) { checks++; assert(value, message); }
function equal(actual, expected) { checks++; assert.deepEqual(actual, expected); }
function rejects(fn, pattern) { checks++; assert.throws(fn, pattern); }
function close(name, actual, expected, absolute, relative = 0) {
  checks++; const error = Math.abs(actual - expected); errors[name] = { actual, expected, absoluteError: error };
  assert(Number.isFinite(actual) && error <= absolute + relative * Math.abs(expected), `${name}: ${actual} vs ${expected}`);
}
function group(name, body) { const t = performance.now(); body(); groups.push({ name, wallSeconds: (performance.now() - t) / 1000 }); }
function frozenSources() {
  equal(hash('../finite-momentum-v1/handoff-inventory.json'), 'd645331384767f52eb55bfcf8928bba3fa47cf0b7a6fa620bca490764ddcd70c');
  equal(hash('../linear-buoyancy-oracle-v1/oracle.mjs'), '3994179249750d872d478e16f9642019b345104211c91a611e849a53b4b7f9c8');
  equal(hash('../linear-buoyancy-oracle-v1/run-v1/proof.json'), '6787123a8cabd3b979fe77d5b5a55284639c22471bdd24c108e506f6f895e2c7');
  for (const [path, expected] of Object.entries(frozenInventory)) equal(hash('../finite-momentum-v1/' + path), expected);
  for (const [path, expected] of Object.entries(sourcePins)) equal(hash(path), expected);
}
function budget() { ok(returnedRKSteps + exposedEulerStages <= 180, '180 returned RK-step/Euler-probe budget'); }
function advance(fixture, initial, interval, dtMax) {
  const out = fixture.gas.advance(initial, interval, { dtMax, maxSteps: Math.round(interval / dtMax) });
  returnedRKSteps += out.state.steps - initial.steps; budget(); return out;
}
function write(name, value) { writeFileSync(directory + name, JSON.stringify(value, null, 2) + '\n'); }
function retainCase(label, fixture, output, measurements = {}) {
  activeCase = { label, n: fixture.n, epsilon: fixture.epsilon, spacing: fixture.spacing,
    initial: fixture.initial, output, measurements };
  write('case-' + label + '.json', activeCase);
}

function makeFixture(n, epsilon) {
  const spacing = lengths.map((length) => length / n);
  const g = geometry({ size: [n, n, n], spacing, periodic: [true, false, true],
    domainId: 'finite-buoyancy-' + n, viscosity: 0, thermalDiffusivity: 0, tracerDiffusivity: 0, buoyancy: false });
  const gas = createFiniteGas(g, { gravity });
  const oracle = epsilon === 0 ? null : createBuoyancyOracle({ lengthsM: lengths, densityKgM3: rho0, epsilon, gravityMS2: 9.81 });
  const density = g.cells.map((cell) => oracle ? oracle.averages(cell.center, spacing).densityKgM3 : rho0);
  const initial = gas.initial({ pressurePa, densityKgM3: density });
  return { n, epsilon, g, gas, oracle, spacing, initial };
}

function reconstructPhysical(fixture, before, after, receipt, name) {
  const { g, gas } = fixture, layout = gas.layout;
  const mass = [...before.massKg], energy = [...before.internalEnergyJ]; let potentialChange = 0;
  for (const face of g.faces) {
    const dm = receipt.massTransferKg[face.k], dh = receipt.enthalpyTransferJ[face.k];
    mass[face.i] -= dm; mass[face.j] += dm; energy[face.i] -= dh; energy[face.j] += dh;
    potentialChange += dm * 9.81 * (g.cells[face.j].center[1] - g.cells[face.i].center[1]);
  }
  equal(receipt.heatTransferJ, Array(g.n).fill(0));
  close(name + '_local_mass', maximum(difference(mass, after.massKg)), 0, 1e-10);
  close(name + '_local_U', maximum(difference(energy, after.internalEnergyJ)), 0, 1e-8);
  const momentum = layout.nodes.map((node) => node.fixed ? 0 : before.faceMomentumKgMS[node.face]);
  for (const edge of layout.interfaces) {
    const dp = receipt.momentumTransferKgMS[edge.k]; momentum[edge.i] -= dp; momentum[edge.j] += dp;
  }
  for (const node of layout.nodes) momentum[node.k] += receipt.bodyImpulseKgMS[node.k] + receipt.wallImpulseKgMS[node.k];
  for (const face of g.faces) momentum[layout.faceNode[face.k]] += receipt.pressureImpulseKgMS[face.k];
  const expected = layout.nodes.map((node) => node.fixed ? 0 : after.faceMomentumKgMS[node.face]);
  close(name + '_local_P', maximum(difference(momentum, expected)), 0, 1e-10);
  return potentialChange;
}

function physicalLaws(fixture, before, after, receipt, name) {
  const { gas, g } = fixture, a = gas.read(before), b = gas.read(after);
  const potentialFromMass = reconstructPhysical(fixture, before, after, receipt, name);
  close(name + '_total_mass', sum(after.massKg), sum(before.massKg), LIMITS.massAbsolute, LIMITS.balanceRelative);
  close(name + '_total_U', sum(after.internalEnergyJ), sum(before.internalEnergyJ), LIMITS.energyAbsolute, LIMITS.balanceRelative);
  equal(after.heatInputJ, before.heatInputJ);
  const kineticKeys = ['advectionKChangeJ', 'bodyKChangeJ', 'wallConstraintKChangeJ', 'pressureKChangeJ', 'rkAveragingKChangeJ'];
  const operationChange = sum(kineticKeys.map((key) => receipt[key]));
  const kineticScale = Math.max(Math.abs(a.kineticEnergyJ), Math.abs(b.kineticEnergyJ), sum(kineticKeys.map((key) => Math.abs(receipt[key]))));
  close(name + '_K_operations', b.kineticEnergyJ - a.kineticEnergyJ, operationChange, 1e-10 + 1e-10 * kineticScale);
  close(name + '_PE_from_mass', b.potentialEnergyJ - a.potentialEnergyJ, potentialFromMass, 1e-9);
  close(name + '_PE_operations', receipt.potentialEnergyChangeJ, potentialFromMass, 1e-9);
  ok(b.constraintError <= 1e-10 && b.eosError <= 5e-10 && b.maxMach <= .01, name + ' admitted field envelope');
  ok(Math.min(...b.temperature) >= 200 && Math.max(...b.temperature) <= 600, name + ' definition temperature range');
  return { massResidualKg: b.massError, energyResidualJ: b.energyError, momentumResidualKgMS: b.momentumErrorsKgMS,
    constraintM3S: b.constraintError, eosRelative: b.eosError, maxMach: b.maxMach,
    temperatureRangeK: [Math.min(...b.temperature), Math.max(...b.temperature)],
    kineticChangeJ: b.kineticEnergyJ - a.kineticEnergyJ, potentialChangeJ: b.potentialEnergyJ - a.potentialEnergyJ,
    mechanicalResidualJ: b.kineticEnergyJ + b.potentialEnergyJ - a.kineticEnergyJ - a.potentialEnergyJ,
    operations: Object.fromEntries([...kineticKeys, 'potentialEnergyChangeJ'].map((key) => [key, receipt[key]])),
    cells: g.n, faces: g.faces.length, work: gas.diagnostics() };
}

function analyticFaces(fixture) {
  const { gas, oracle } = fixture;
  return gas.layout.faceNode.map((id) => {
    const node = gas.layout.nodes[id]; return oracle.averages(node.centerM, node.widthsM).accelerationMS2[node.axis];
  });
}
function components(g, actual, expected) {
  return [0, 1, 2].map((axis) => {
    const ids = g.faces.filter((face) => face.axis === axis).map((face) => face.k);
    return relativeL2(ids.map((i) => actual[i]), ids.map((i) => expected[i]));
  });
}
function pressureScale(stage, pressure) {
  const p = stage.potentialPaS.map((x) => x / stage.interval);
  const ratio = (Math.max(...p) - Math.min(...p)) / pressure;
  ok(Number.isFinite(ratio) && ratio < .001, 'small pressure impulse-rate range'); return ratio;
}
function initialPressure(fixture, stage) {
  const { g, oracle, spacing } = fixture;
  const numerical = stage.potentialPaS.map((phi) => phi / stage.interval);
  const background = g.cells.map((cell) => -rho0 * 9.81 * cell.center[1]);
  const perturbation = numerical.map((p, i) => p - numerical[0] - (background[i] - background[0]));
  const analytical = g.cells.map((cell) => oracle.averages(cell.center, spacing).pressurePerturbationPa);
  const expected = analytical.map((p) => p - analytical[0]);
  return { relativeL2: relativeL2(perturbation, expected), maxErrorPa: maximum(difference(perturbation, expected)),
    rangeToP0: pressureScale(stage, pressurePa), forceTime: stage.forceEvaluationTime, constraintTime: stage.constraintTime, interval: stage.interval,
    constraintM3S: stage.constraintError, linearResidual: stage.linearResidual, iterations: stage.iterations };
}

function probe(n, epsilon) {
  const fixture = makeFixture(n, epsilon), { gas, initial, g } = fixture;
  const stage = gas.forwardEuler(initial, probeDt); retainCase(`probe-${n}-${epsilon}`, fixture, stage);
  ok(stage !== null, 'admitted initial Euler probe'); exposedEulerStages++; budget();
  equal(stage.state.massKg, initial.massKg); equal(stage.state.internalEnergyJ, initial.internalEnergyJ);
  equal(stage.receipt.massTransferKg, Array(g.faces.length).fill(0));
  const receipt = { ...stage.receipt, pressureImpulseKgMS: stage.receipt.pressure.pressureImpulseKgMS,
    pressureKChangeJ: stage.receipt.pressure.pressureKChangeJ, rkAveragingKChangeJ: 0 };
  const laws = physicalLaws(fixture, initial, stage.state, receipt, 'probe_' + n + '_' + epsilon);
  const velocity = Array.from(gas.read(stage.state).velocity), acceleration = velocity.map((u) => u / probeDt);
  if (epsilon === 0) {
    close('uniform_gravity_rest', maximum(velocity), 0, 1e-9);
    return { fixture, acceleration, result: { n, epsilon, exposedEulerStage: true, laws } };
  }
  const expected = analyticFaces(fixture), expectedMomentumRate = gas.layout.faceNode.map((id, face) => rho0 * gas.layout.nodes[id].volumeM3 * expected[face]);
  const result = { n, epsilon, exposedEulerStage: true, interval: probeDt,
    accelerationRelativeL2: relativeL2(acceleration, expected), componentRelativeL2: components(g, acceleration, expected),
    momentumRateRelativeL2: relativeL2(stage.state.faceMomentumKgMS.map((p) => p / probeDt), expectedMomentumRate),
    pressure: initialPressure(fixture, stage.receipt.pressure), laws };
  write(`initial-${n}-${epsilon}.json`, { result, initial, state: stage.state, receipt: stage.receipt });
  return { fixture, acceleration, normalized: acceleration.map((a) => a / epsilon), result };
}

function runShort(initialProbe, time) {
  const fixture = makeFixture(8, .001), out = advance(fixture, fixture.initial, time, time / 8);
  retainCase('short-' + time, fixture, out);
  const velocity = Array.from(fixture.gas.read(out.state).velocity), response = velocity.map((u) => u / time);
  const discreteDrift = relativeL2(response, initialProbe.acceleration);
  retainCase('short-' + time, fixture, out, { discreteDrift, response });
  const result = { time, dt: time / 8, returnedRKSteps: out.state.steps,
    discreteInitialRelativeDrift: discreteDrift, continuumInitialRelativeError: relativeL2(response, analyticFaces(fixture)),
    maxVelocityMS: maximum(velocity), massChangeRelativeL1: sum(difference(out.state.massKg, fixture.initial.massKg).map(Math.abs)) / fixture.initial.initialMassKg,
    maxStageConstraintM3S: out.maxConstraint, maxStageEOSRelative: out.maxEOS, maxStageMach: out.maxMach,
    laws: physicalLaws(fixture, fixture.initial, out.state, out.receipt, 'short_' + time) };
  return { result, out };
}

function movement(fixture, state) {
  const { g, gas, oracle } = fixture, velocity = Array.from(gas.read(state).velocity);
  const light = [], heavy = []; let correlation = 0;
  for (const face of g.faces) if (face.axis === 1) {
    const node = gas.layout.nodes[gas.layout.faceNode[face.k]], anomaly = oracle.averages(node.centerM, node.widthsM).densityAnomalyKgM3;
    if (anomaly < -1e-12) light.push(velocity[face.k]);
    if (anomaly > 1e-12) heavy.push(velocity[face.k]);
    correlation += -anomaly * velocity[face.k] * node.volumeM3;
  }
  const componentRms = [0, 1, 2].map((axis) => rms(g.faces.filter((face) => face.axis === axis).map((face) => velocity[face.k])));
  return { lightMeanYVelocityMS: sum(light) / light.length, heavyMeanYVelocityMS: sum(heavy) / heavy.length,
    initialLightnessVelocityCorrelation: correlation, componentRmsMS: componentRms, maxVelocityMS: maximum(velocity),
    massChangeRelativeL1: sum(difference(state.massKg, fixture.initial.massKg).map(Math.abs)) / fixture.initial.initialMassKg };
}

function runMoving(n, dt) {
  const fixture = makeFixture(n, .1), out = advance(fixture, fixture.initial, 1, dt);
  retainCase(`moving-${n}-${1 / dt}`, fixture, out);
  const laws = physicalLaws(fixture, fixture.initial, out.state, out.receipt, 'moving_' + n + '_' + dt), moved = movement(fixture, out.state);
  retainCase(`moving-${n}-${1 / dt}`, fixture, out, { laws, movement: moved });
  ok(moved.lightMeanYVelocityMS > .01 && moved.heavyMeanYVelocityMS < -.01 && moved.initialLightnessVelocityCorrelation > 0, 'light rises and heavy sinks');
  ok(moved.componentRmsMS[0] > .005 && moved.componentRmsMS[2] > .005 && moved.maxVelocityMS > .05, 'actual three-axis circulation');
  ok(moved.massChangeRelativeL1 > 1e-4 && laws.kineticChangeJ > 1e-4 && laws.potentialChangeJ < -1e-4, 'density relocates and releases gravity energy');
  const mechanicalRelativeResidual = Math.abs(laws.mechanicalResidualJ) / Math.max(Math.abs(laws.kineticChangeJ), Math.abs(laws.potentialChangeJ));
  const phasePressure = Object.fromEntries(['first', 'second'].map((key) => [key, pressureScale(out.lastStepPressure[key], fixture.gas.read(out.state).pressure)]));
  const result = { n, epsilon: .1, time: 1, dt, returnedRKSteps: out.state.steps, rejected: out.rejected,
    movement: moved, mechanicalRelativeResidual, phasePressure, maxStageConstraintM3S: out.maxConstraint,
    maxStageEOSRelative: out.maxEOS, maxStageMach: out.maxMach, laws };
  write(`moving-${n}-${1 / dt}.json`, { result, initial: fixture.initial, state: out.state, receipt: out.receipt, lastStepPressure: out.lastStepPressure });
  return { fixture, result, out };
}

try {
  frozenSources();
  let initialFine, initialAnchor, finiteFine;
  group('initial spatial and amplitude acceleration under actual gravity', () => {
    const coarse = probe(4, .005), epsilonCases = [.02, .01, .005].map((epsilon) => probe(8, epsilon)); initialFine = epsilonCases[2];
    const first = rms(difference(epsilonCases[0].normalized, epsilonCases[1].normalized));
    const second = rms(difference(epsilonCases[1].normalized, epsilonCases[2].normalized));
    cases.initial = { coarse: coarse.result, fine: epsilonCases.map((p) => p.result), amplitudeDifferences: [first, second], amplitudeRatio: first / second };
    ok(coarse.result.accelerationRelativeL2 < .35 && initialFine.result.accelerationRelativeL2 < .15 &&
      initialFine.result.accelerationRelativeL2 / coarse.result.accelerationRelativeL2 < .7, 'initial acceleration spatial discrimination');
    ok(cases.initial.amplitudeRatio >= 1.6 && cases.initial.amplitudeRatio <= 2.5, 'initial nonlinear amplitude discrimination');
    ok(initialFine.result.pressure.relativeL2 < .25, 'initial perturbational pressure');
    initialAnchor = probe(8, .001); cases.initial.anchor = initialAnchor.result; cases.uniform = probe(8, 0).result;
  });
  group('short-time evolution distinct from initial amplitude and mesh floors', () => {
    const short = [.25, .125, .0625].map((time) => runShort(initialAnchor, time)); cases.shortTime = short.map((c) => c.result);
    for (let i = 1; i < short.length; i++) ok(short[i].result.discreteInitialRelativeDrift < .7 * short[i - 1].result.discreteInitialRelativeDrift, 'shorter time approaches discrete initial acceleration');
    ok(short[2].result.discreteInitialRelativeDrift < .02, 'small shortest-time evolution remainder');
  });
  group('finite three-dimensional density circulation and mechanical quality', () => {
    const coarse = runMoving(4, 1 / 32), fineTime = runMoving(8, 1 / 16); finiteFine = runMoving(8, 1 / 32);
    cases.moving = { coarse: coarse.result, fineCoarseTime: fineTime.result, fine: finiteFine.result,
      temporalVelocityDifferenceMS: rms(difference(Array.from(fineTime.fixture.gas.read(fineTime.out.state).velocity), Array.from(finiteFine.fixture.gas.read(finiteFine.out.state).velocity))) };
    ok(finiteFine.result.mechanicalRelativeResidual < .3, 'finite moving mechanical residual below30percent');
  });
  group('actual moving file restart and authority rejection', () => {
    const halfFixture = makeFixture(8, .1), half = advance(halfFixture, halfFixture.initial, .5, 1 / 32);
    retainCase('restart-half', halfFixture, half);
    ok(movement(halfFixture, half.state).massChangeRelativeL1 > 0, 'save holds an actually moved density field');
    writeFileSync(directory + 'moving-restart.json', halfFixture.gas.encode(half.state));
    const fresh = makeFixture(8, .1), saved = fresh.gas.decode(readFileSync(directory + 'moving-restart.json', 'utf8'));
    const continued = advance(fresh, saved, .5, 1 / 32); retainCase('restart-continued', { ...fresh, initial: saved }, continued);
    equal(continued.state, finiteFine.out.state);
    physicalLaws(fresh, saved, continued.state, continued.receipt, 'continued');
    const before = fresh.gas.encode(saved), changedGravity = createFiniteGas(fresh.g, { gravity: [0, -9.8, 0] });
    rejects(() => changedGravity.decode(before), /identity/);
    const foreignGeometry = geometry({ size: [8, 8, 8], spacing: [.5, .27, .5], periodic: [true, false, true],
      domainId: 'other-buoyancy-window', viscosity: 0, thermalDiffusivity: 0, tracerDiffusivity: 0, buoyancy: false });
    rejects(() => createFiniteGas(foreignGeometry, { gravity }).decode(before), /identity/);
    rejects(() => fresh.gas.advance(saved, .5, { dtMax: 1 / 32, maxSteps: 1 }), /work request/);
    equal(fresh.gas.encode(saved), before);
    cases.restart = { savedTime: saved.time, finalTime: continued.state.time, exactState: true, gravityMismatchRejected: true, domainMismatchRejected: true };
  });
  frozenSources();
  const cpu = process.cpuUsage(cpuStarted), wallSeconds = (performance.now() - started) / 1000;
  ok(wallSeconds <= 30, '30-second whole numerical packet');
  const report = { status: 'pass', sourcePins, checks, groups, returnedRKSteps, exposedEulerStages,
    wallSeconds, cpuSeconds: (cpu.user + cpu.system) / 1e6, finalRSSBytes: process.memoryUsage().rss, errors, cases };
  write('qualification-v1.json', report);
  console.log(JSON.stringify({ status: report.status, checks, groups: groups.length, returnedRKSteps, exposedEulerStages,
    wallSeconds, cpuSeconds: report.cpuSeconds, finalRSSBytes: report.finalRSSBytes, initial: cases.initial, moving: cases.moving }));
} catch (error) {
  const cpu = process.cpuUsage(cpuStarted);
  write('qualification-v1-failed.json', { status: 'fail', sourcePins, checks, groups, returnedRKSteps, exposedEulerStages,
    wallSeconds: (performance.now() - started) / 1000, cpuSeconds: (cpu.user + cpu.system) / 1e6,
    finalRSSBytes: process.memoryUsage().rss, errors, cases, activeCase, error: error.stack }); throw error;
}
