import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { geometry } from '../transport-v2/checkpoint/geometry.mjs';
import { createMomentumOracle } from '../momentum-oracle-v1/oracle.mjs';
import { createFiniteGas } from './finite-gas.mjs';
import { momentumGeometry, dualTransfers, totalMomentum } from './momentum.mjs';

const root = fileURLToPath(new URL('.', import.meta.url)), started = performance.now(), cpuStarted = process.cpuUsage();
const paths = ['finite-gas.mjs', 'momentum.mjs', 'projection.mjs', 'geometry-owner.mjs', 'qualify.mjs', 'CONTRACT.md',
  '../momentum-oracle-v1/oracle.mjs', '../transport-v2/checkpoint/geometry.mjs',
  '../finite-thermo-v1/checkpoint/thermodynamics.mjs', '../finite-thermo-v1/checkpoint/definitions.mjs'];
const sourcePins = Object.fromEntries(paths.map((p) => [p, createHash('sha256').update(readFileSync(root + p)).digest('hex')]));
writeFileSync(root + 'run-source-inventory.json', JSON.stringify(sourcePins, null, 2) + '\n');
let checks = 0, acceptedSteps = 0; const groups = [], cases = {}, errors = {};
const sum = (a) => a.reduce((n, x) => n + x, 0), maxAbs = (a) => a.reduce((n, x) => Math.max(n, Math.abs(x)), 0);
const equal = (a, b) => { checks++; assert.deepEqual(a, b); };
const ok = (condition, message) => { checks++; assert(condition, message); };
const close = (name, actual, expected, absolute, relative = 0) => {
  checks++; const error = Math.abs(actual - expected); errors[name] = { actual, expected, absoluteError: error };
  assert(Number.isFinite(actual) && error <= absolute + relative * Math.abs(expected), `${name}: ${actual} vs ${expected}`);
};
const reject = (fn, pattern) => { checks++; assert.throws(fn, pattern); };
const group = (name, fn) => { const t = performance.now(); fn(); groups.push({ name, wallSeconds: (performance.now() - t) / 1000 }); };
const makeGeometry = (spec) => geometry({ viscosity: 0, thermalDiffusivity: 0, tracerDiffusivity: 0, buoyancy: false, ...spec });
const R = 8.31446261815324 / .02897, rho0 = 100000 / (R * 300), gamma = 1.4;
const advance = (gas, s, interval, options) => {
  const out = gas.advance(s, interval, { ...options, maxSteps: options.maxSteps ?? 64 });
  acceptedSteps += out.state.steps - s.steps; ok(acceptedSteps <= 240, '240 accepted-step proof budget');
  return out;
};
const l2 = (a, b) => Math.sqrt(sum(a.map((x, i) => (x - b[i]) ** 2)) / a.length);

function receipts(name, g, gas, initial, out, gravity = Array(g.dimensions).fill(0)) {
  const f = gas.read(out.state), before = gas.read(initial);
  close(name + '_mass', sum(out.state.massKg), sum(initial.massKg), 1e-11);
  close(name + '_heat', sum(out.state.internalEnergyJ) - sum(initial.internalEnergyJ), out.state.heatInputJ - initial.heatInputJ, 1e-6);
  const m = [...initial.massKg], u = [...initial.internalEnergyJ]; let expectedPE = 0;
  for (const face of g.faces) {
    const dm = out.receipt.massTransferKg[face.k], dh = out.receipt.enthalpyTransferJ[face.k];
    m[face.i] -= dm; m[face.j] += dm; u[face.i] -= dh; u[face.j] += dh;
    const potential = (cell) => -sum(gravity.map((a, d) => a * cell.center[['x', 'y', 'z'].indexOf(g.axes[d])]));
    expectedPE += dm * (potential(g.cells[face.j]) - potential(g.cells[face.i]));
  }
  for (let i = 0; i < g.n; i++) u[i] += out.receipt.heatTransferJ[i];
  close(name + '_mass_receipts', maxAbs(m.map((x, i) => x - out.state.massKg[i])), 0, 1e-10);
  close(name + '_U_receipts', maxAbs(u.map((x, i) => x - out.state.internalEnergyJ[i])), 0, 1e-6);
  const layout = gas.layout, momentum = layout.nodes.map((node) => node.fixed ? 0 : initial.faceMomentumKgMS[node.face]);
  for (const edge of layout.interfaces) {
    const dp = out.receipt.momentumTransferKgMS[edge.k]; momentum[edge.i] -= dp; momentum[edge.j] += dp;
  }
  for (const node of layout.nodes) momentum[node.k] += out.receipt.bodyImpulseKgMS[node.k] + out.receipt.wallImpulseKgMS[node.k];
  for (const face of g.faces) momentum[layout.faceNode[face.k]] += out.receipt.pressureImpulseKgMS[face.k];
  const momentumResidual = layout.nodes.map((node) => momentum[node.k] - (node.fixed ? 0 : out.state.faceMomentumKgMS[node.face]));
  close(name + '_local_momentum_receipts', maxAbs(momentumResidual), 0, 1e-10);
  const kineticKeys = ['advectionKChangeJ', 'bodyKChangeJ', 'wallConstraintKChangeJ', 'pressureKChangeJ', 'rkAveragingKChangeJ'];
  const kineticChange = sum(kineticKeys.map((k) => out.receipt[k]));
  close(name + '_kinetic_operations', f.kineticEnergyJ - before.kineticEnergyJ, kineticChange,
    1e-10 + 1e-10 * Math.max(Math.abs(before.kineticEnergyJ), Math.abs(f.kineticEnergyJ), sum(kineticKeys.map((k) => Math.abs(out.receipt[k])))));
  close(name + '_PE_receipts', f.potentialEnergyJ - before.potentialEnergyJ, expectedPE, 1e-9);
  ok(out.maxConstraint <= 1e-10 && out.maxEOS <= 5e-10 && out.maxMach <= .01, name + ' constraint/model bounds');
  const pressureRangeToP0 = Object.fromEntries(['first', 'second'].map((key) => {
    const stage = out.lastStepPressure[key], pressure = stage.potentialPaS.map((x) => x / stage.interval);
    return [key, (Math.max(...pressure) - Math.min(...pressure)) / f.pressure];
  }));
  ok(Object.values(pressureRangeToP0).every((x) => Number.isFinite(x) && x < .001), name + ' perturbation pressure scale');
  equal(out.lastStepPressure.first.weight, .5); equal(out.lastStepPressure.second.weight, .5); equal(out.lastStepPressure.final.weight, 1);
  return { massResidualKg: f.massError, energyResidualJ: f.energyError, momentumResidualKgMS: f.momentumErrorsKgMS,
    constraintM3S: out.maxConstraint, eosRelative: out.maxEOS, maxMach: out.maxMach, maxTemperatureK: out.maxAcceptedTemperatureK,
    pressureRangeToP0,
    kineticEnergyJ: f.kineticEnergyJ, potentialEnergyJ: f.potentialEnergyJ,
    mechanicalChangeJ: f.kineticEnergyJ + f.potentialEnergyJ - before.kineticEnergyJ - before.potentialEnergyJ,
    operationReceipts: Object.fromEntries([...kineticKeys, 'potentialEnergyChangeJ'].map((k) => [k, out.receipt[k]])), work: gas.diagnostics() };
}

function expectedCells(g, node) {
  const candidates = [-1, 0].map((offset) => {
    const at = [...node.at]; at[node.axis] += offset;
    if (g.periodic[node.axis]) at[node.axis] = ((at[node.axis] % g.size[node.axis]) + g.size[node.axis]) % g.size[node.axis];
    if (at[node.axis] < 0 || at[node.axis] >= g.size[node.axis]) return -1;
    let stride = 1, index = 0; for (let d = 0; d < g.dimensions; d++) { index += stride * at[d]; stride *= g.size[d]; } return index;
  });
  return candidates.filter((i) => i >= 0);
}

function basisCase(size, periodic) {
  const g = makeGeometry({ size, spacing: size.length === 2 ? [1, .54] : [1, .54, 1], periodic,
    origin: [-2, -1, -3], domainId: 'basis-' + size.length + '-' + periodic.join('-') });
  const d = momentumGeometry(g), basis = new Float64Array(g.faces.length);
  for (const node of d.nodes) {
    const cells = expectedCells(g, node); equal(node.cells, cells); close('dual_volume_' + node.k + '_' + g.domainId, node.volumeM3, cells.length * g.volume / 2, 0);
    if (node.fixed) ok(!g.periodic[node.axis] && (node.at[node.axis] === 0 || node.at[node.axis] === g.size[node.axis]), 'fixed node is a sealed boundary half volume');
    else { equal(node.at, g.faces[node.face].at); equal(node.axis, g.faces[node.face].axis); equal(d.faceNode[node.face], node.k); }
    for (let a = 0; a < 3; a++) {
      const dim = g.axes.indexOf(['x', 'y', 'z'][a]);
      if (dim < 0) { close('unused_axis_center_' + node.k + '_' + g.domainId, node.centerM[a], (g.origin[a] + .5) * g.metric.extrusion, 0); continue; }
      const at = node.at[dim], own = dim === node.axis, boundary = own && !g.periodic[dim] && (at === 0 || at === g.size[dim]);
      const offset = own ? (boundary ? (at === 0 ? .25 : -.25) : 0) : .5;
      close('dual_center_' + a + '_' + node.k + '_' + g.domainId, node.centerM[a], (g.origin[a] + at + offset) * g.metric.spacing[dim], 1e-14);
      close('dual_width_' + a + '_' + node.k + '_' + g.domainId, node.widthsM[a], g.metric.spacing[dim] * (boundary ? .5 : 1), 1e-14);
    }
  }
  for (const f of g.faces) {
    basis.fill(0); basis[f.k] = 1;
    const primalD = new Float64Array(g.n); primalD[f.i]++; primalD[f.j]--;
    const transfer = dualTransfers(g, basis), actual = new Float64Array(d.nodes.length);
    for (const edge of d.interfaces) { actual[edge.i] += transfer[edge.k]; actual[edge.j] -= transfer[edge.k]; }
    const expected = d.nodes.map((node) => sum(expectedCells(g, node).map((i) => primalD[i] * .5)));
    equal(Array.from(actual), expected);
  }
  equal(new Set(d.faceNode).size, g.faces.length);
  return { size, periodic, cells: g.n, primalBasisFaces: g.faces.length, dualVolumes: d.nodes.length, dualInterfaces: d.interfaces.length };
}

function translation(nx, ny) {
  const hx = 8 / nx, hy = 2.16 / ny, C = .08;
  const g = makeGeometry({ size: [nx, ny], spacing: [hx, hy], periodic: [true, false], domainId: 'translation-' + nx });
  const meanDensity = (x, t) => rho0 * (1 + .2 * Math.sin(2 * Math.PI * (x - C * t) / 8) * Math.sin(Math.PI * hx / 8) / (Math.PI * hx / 8));
  const gas = createFiniteGas(g), initial = gas.initial({ pressurePa: 100000,
    densityKgM3: g.cells.map((c) => meanDensity(c.center[0], 0)), faceVelocityMS: g.faces.map((f) => f.axis === 0 ? C : 0) });
  const out = advance(gas, initial, 1, { dtMax: 1 / 16, maxSteps: 16 }), f = gas.read(out.state);
  const exact = g.cells.map((c) => meanDensity(c.center[0], 1) * g.volume), relativeL1 = sum(out.state.massKg.map((m, i) => Math.abs(m - exact[i]))) / initial.initialMassKg;
  close('translation_' + nx + '_velocity', maxAbs(Array.from(f.velocity, (u, k) => u - (g.faces[k].axis === 0 ? C : 0))), 0, 1e-9);
  close('translation_' + nx + '_momentum', totalMomentum(g, out.state.faceMomentumKgMS)[0], totalMomentum(g, initial.faceMomentumKgMS)[0], 1e-10);
  ok(maxAbs(out.receipt.massTransferKg) > 0 && maxAbs(out.receipt.momentumTransferKgMS) > 0, 'real moving mass and momentum');
  return { nx, ny, relativeL1, result: receipts('translation_' + nx, g, gas, initial, out) };
}

function hydrostatic(stratified) {
  const g = makeGeometry({ size: [4, 4, 4], spacing: [1, .54, 1], periodic: [true, false, true], domainId: 'hydrostatic-' + stratified });
  const gravity = [0, -9.81, 0], H = 2.16, alpha = stratified ? .2 : 0;
  const gas = createFiniteGas(g, { gravity }), initial = gas.initial({ pressurePa: 100000,
    densityKgM3: g.cells.map((c) => rho0 * (1 - alpha * c.center[1] / H)) });
  const out = advance(gas, initial, .5, { dtMax: 1 / 16, maxSteps: 8 }), f = gas.read(out.state);
  close('hydrostatic_velocity_' + stratified, maxAbs(f.velocity), 0, 1e-9);
  close('hydrostatic_mass_still_' + stratified, maxAbs(out.state.massKg.map((m, i) => m - initial.massKg[i])), 0, 1e-10);
  close('hydrostatic_U_still_' + stratified, maxAbs(out.state.internalEnergyJ.map((u, i) => u - initial.internalEnergyJ[i])), 0, 1e-6);
  const expected = g.cells.map((c) => -rho0 * 9.81 * (c.center[1] - alpha * c.center[1] ** 2 / (2 * H))), range = Math.max(...expected) - Math.min(...expected);
  const stageErrors = {};
  for (const key of ['first', 'second']) {
    const p = out.lastStepPressure[key], numerical = p.potentialPaS.map((x) => x / p.interval);
    const error = maxAbs(numerical.map((x, i) => x - numerical[0] - (expected[i] - expected[0])));
    close('hydrostatic_pressure_' + stratified + '_' + key, error, 0, 1e-6 + 1e-8 * range);
    stageErrors[key] = { errorPa: error, forceTime: p.forceEvaluationTime, constraintTime: p.constraintTime, weight: p.weight };
  }
  return { stratified, stageErrors, hydrostaticRangeToP0: range / f.pressure, result: receipts('hydrostatic_' + stratified, g, gas, initial, out, gravity) };
}

function oracleCase(n, dtMax) {
  const spacing = [4 / n, 2.16 / n, 4 / n], g = makeGeometry({ size: [n, n, n], spacing, periodic: [true, true, true], domainId: 'oracle-' + n });
  const oracle = createMomentumOracle({ lengthsM: [4, 2.16, 4], densityKgPerM3: rho0 });
  const bodyForce = { identity: oracle.identity, sample: (node, time) => oracle.averages(node.centerM, node.widthsM, time).bodyAccelerationMPerS2[node.axis] };
  const gas = createFiniteGas(g, { bodyForce }), layout = gas.layout;
  const referenceVelocity = (time) => layout.faceNode.map((i) => { const node = layout.nodes[i]; return oracle.averages(node.centerM, node.widthsM, time).velocityMPerS[node.axis]; });
  const initial = gas.initial({ pressurePa: 100000, faceVelocityMS: referenceVelocity(0) });
  const out = advance(gas, initial, 1, { dtMax, maxSteps: Math.ceil(1 / dtMax) }), f = gas.read(out.state), expected = referenceVelocity(1);
  const relativeVelocityL2 = l2(Array.from(f.velocity), expected) / Math.sqrt(sum(expected.map((x) => x * x)) / expected.length);
  const exactMomentum = layout.faceNode.map((i) => {
    const node = layout.nodes[i]; return oracle.averages(node.centerM, node.widthsM, 1).momentumDensityKgM2S[node.axis] * node.volumeM3;
  });
  const relativeMomentumL2 = l2(out.state.faceMomentumKgMS, exactMomentum) / Math.sqrt(sum(exactMomentum.map((x) => x * x)) / exactMomentum.length);
  const pressure = {};
  for (const key of ['first', 'second']) {
    const stage = out.lastStepPressure[key];
    const analytical = g.cells.map((c) => oracle.averages(c.center, spacing, stage.forceEvaluationTime).perturbationPressurePa);
    const numerical = stage.potentialPaS.map((x) => x / stage.interval), reference = analytical.map((x) => x - analytical[0]);
    const gaugeRemoved = numerical.map((x) => x - numerical[0]);
    pressure[key] = { relativeL2: l2(gaugeRemoved, reference) / Math.sqrt(sum(reference.map((x) => x * x)) / reference.length),
      forceTime: stage.forceEvaluationTime, constraintTime: stage.constraintTime, weight: stage.weight, interval: stage.interval };
  }
  const result = { n, dtMax, relativeVelocityL2, relativeMomentumL2, pressure,
    finalConstraintImpulsePaS: maxAbs(out.lastStepPressure.final.potentialPaS), result: receipts('oracle_' + n + '_' + dtMax, g, gas, initial, out) };
  writeFileSync(root + `oracle-${n}-${1 / dtMax}.json`, JSON.stringify({ result, state: out.state, receipt: out.receipt, lastStepPressure: out.lastStepPressure }, null, 2) + '\n');
  return { result, out, velocity: Array.from(f.velocity), gas, g, initial, bodyForce };
}

function heatOracle(lo, hi) {
  const front = 8 - 4 * 1.2 ** (-1 / gamma), hot = rho0 * 1.2 ** (-1 / gamma), cold = rho0 * 1.2 ** (1 / gamma);
  const cuts = [lo, ...[4, front].filter((x) => x > lo && x < hi), hi].sort((a, b) => a - b); let integral = 0;
  for (let i = 1; i < cuts.length; i++) { const a = cuts[i - 1], b = cuts[i], mid = (a + b) / 2;
    if (mid < 4) integral += hot * (b - a); else if (mid >= front) integral += cold * (b - a); else integral += hot * 16 * (1 / (8 - b) - 1 / (8 - a)); }
  return integral / (hi - lo);
}

try {
  group('every primal basis: sealed half-volumes and periodic seams', () => {
    cases.basis = [];
    for (const size of [[3, 2], [3, 2, 2]]) for (let mask = 0; mask < 2 ** size.length; mask++)
      cases.basis.push(basisCase(size, size.map((_, d) => !!(mask & (1 << d)))));
  });
  group('variable-density translation with shared mass and momentum', () => {
    cases.translation = [translation(16, 4), translation(32, 8)];
    ok(cases.translation[1].relativeL1 < cases.translation[0].relativeL1 && cases.translation[1].relativeL1 < .02, 'translation spatial refinement');
  });
  group('isothermal and stratified hydrostatic rest', () => { cases.hydrostatic = [hydrostatic(false), hydrostatic(true)]; });
  let fineCases;
  group('continuous manufactured three-component momentum', () => {
    const coarse = oracleCase(4, 1 / 32); fineCases = [1 / 8, 1 / 16, 1 / 32].map((dt) => oracleCase(8, dt));
    const fine = fineCases[2], difference1 = l2(fineCases[0].velocity, fineCases[1].velocity), difference2 = l2(fineCases[1].velocity, fine.velocity), ratio = difference1 / difference2;
    cases.oracle = { coarse: coarse.result, fine: fineCases.map((c) => c.result), successiveVelocityL2: [difference1, difference2], temporalRatio: ratio };
    ok(coarse.result.relativeVelocityL2 < .15 && fine.result.relativeVelocityL2 < .10 && fine.result.relativeVelocityL2 / coarse.result.relativeVelocityL2 < .9, 'manufactured spatial convergence');
    ok(ratio >= 2.5 && ratio <= 5.5, 'manufactured coupled temporal order');
    ok(['first', 'second'].every((k) => fine.result.pressure[k].relativeL2 < .5), 'manufactured stage pressure diagnostic');
  });
  group('finite thermal law composed with real momentum', () => {
    const g = makeGeometry({ size: [32, 2], spacing: [.25, .54], domainId: 'momentum-heated-strip' });
    const heatWatts = g.cells.map((c) => c.center[0] < 4 ? 1000 * g.volume : 0), gas = createFiniteGas(g, { heatWatts });
    const initial = gas.initial({ pressurePa: 100000, faceVelocityMS: g.faces.map((f) => f.axis === 0 ? 200 / (gamma * 100000) * (f.center[0] <= 4 ? f.center[0] : 8 - f.center[0]) : 0) });
    const out = advance(gas, initial, 100, { dtMax: 4, maxSteps: 25 }), f = gas.read(out.state);
    close('heat_pressure', f.pressure, 120000, 1e-4); close('heat_source', out.state.heatInputJ, 432000, 1e-6);
    const exact = g.cells.map((c) => heatOracle(c.at[0] * .25, (c.at[0] + 1) * .25) * g.volume);
    const relativeL1 = sum(exact.map((m, i) => Math.abs(out.state.massKg[i] - m))) / initial.initialMassKg;
    const cold = g.cells.filter((c) => c.center[0] >= 7).map((c) => f.density[c.i]), coldExact = rho0 * 1.2 ** (1 / gamma), coldError = Math.abs(sum(cold) / cold.length - coldExact) / coldExact;
    ok(relativeL1 < .02 && coldError < 2e-6, 'retained heated density law');
    const old = JSON.parse(readFileSync(root + '../finite-low-mach-v1/strip-dt4.json', 'utf8'));
    cases.heating = { relativeL1, coldError, oldNewMassMaxKg: maxAbs(out.state.massKg.map((m, i) => m - old.state.massKg[i])), result: receipts('heated', g, gas, initial, out) };
  });
  group('actual momentum file continuation, copied pressure scratch and provider identity', () => {
    const reference = fineCases[1], retained = JSON.stringify(reference.out.lastStepPressure);
    const half = advance(reference.gas, reference.initial, .5, { dtMax: 1 / 16, maxSteps: 8 });
    writeFileSync(root + 'restart-state.json', reference.gas.encode(half.state));
    const fresh = createFiniteGas(reference.g, { bodyForce: reference.bodyForce });
    const saved = fresh.decode(readFileSync(root + 'restart-state.json', 'utf8'));
    const continued = advance(fresh, saved, .5, { dtMax: 1 / 16, maxSteps: 8 }); equal(continued.state, reference.out.state);
    // These further actual projections have already reused the same geometry scratch.
    equal(JSON.stringify(reference.out.lastStepPressure), retained);
    const foreign = createFiniteGas(reference.g, { bodyForce: { identity: reference.bodyForce.identity + '-different', sample: reference.bodyForce.sample } });
    reject(() => foreign.decode(fresh.encode(saved)), /identity/);
    const changedDomain = createFiniteGas(makeGeometry({ size: [8, 8, 8], spacing: [.5, .27, .5], periodic: [true, true, true], domainId: 'foreign-oracle-domain' }), { bodyForce: reference.bodyForce });
    reject(() => changedDomain.decode(fresh.encode(saved)), /identity/);
    reject(() => fresh.decode(JSON.stringify({ ...saved, version: saved.version + '-foreign' })), /identity/);
    cases.restart = { savedTime: saved.time, finalTime: continued.state.time, exactState: true, providerMismatchRejected: true, geometryMismatchRejected: true, methodMismatchRejected: true, copiedPressureUnchanged: true };
  });
  group('fixed-source admission, envelope retry and atomic rejection', () => {
    const g = makeGeometry({ size: [3, 2], spacing: [1, .54], domainId: 'momentum-admission' });
    const heatWatts = Array(g.n).fill(100000 * g.volume / (gamma - 1) / 590 * 9), gas = createFiniteGas(g, { heatWatts });
    const hot = gas.initial({ pressurePa: 100000, temperatureK: 590 }), before = gas.encode(hot);
    const out = advance(gas, hot, 1, { dtMax: 1, maxSteps: 16 });
    close('599K_endpoint', gas.read(out.state).temperature[0], 599, 1e-9); ok(out.retryReasons.intermediateEnvelope > 0, 'actual intermediate envelope reduction');
    reject(() => gas.advance(hot, 2, { dtMax: 1 }), /endpoint/);
    reject(() => gas.advance(hot, 1, { dtMax: 1, maxSteps: 1 }), /work budget exhausted/); equal(gas.encode(hot), before);
    reject(() => gas.advance({ ...hot, time: 2 ** 53 }, .125, { dtMax: 1 }), /representable time/);
    reject(() => gas.advance(hot, 3000, { dtMax: 1 }), /work request/);
    reject(() => createFiniteGas(g, { heatWatts: Array(g.n).fill(NaN) }), /heat/);
    reject(() => createFiniteGas(makeGeometry({ size: [3, 2], spacing: [1, .54], open: ['x+'] })), /full/);
    reject(() => createFiniteGas(makeGeometry({ size: [3, 2], spacing: [1, .54], solid: [1] })), /full/);
    const changedHeat = createFiniteGas(g, { heatWatts: heatWatts.map((q) => q * .99) }); reject(() => changedHeat.decode(before), /identity/);
    cases.retry = { steps: out.state.steps, rejected: out.rejected, reasons: out.retryReasons };
  });
  const cpu = process.cpuUsage(cpuStarted), report = { status: 'pass', sourcePins, groups, checks, acceptedSteps, errors, cases,
    wallSeconds: (performance.now() - started) / 1000, cpuSeconds: (cpu.user + cpu.system) / 1e6, rssBytes: process.memoryUsage().rss };
  ok(report.wallSeconds <= 30, '30-second qualification budget'); report.checks = checks;
  writeFileSync(root + 'qualification-v1.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, groups: groups.length, checks, acceptedSteps, wallSeconds: report.wallSeconds,
    cpuSeconds: report.cpuSeconds, rssBytes: report.rssBytes, oracle: cases.oracle }));
} catch (error) {
  writeFileSync(root + 'qualification-v1-failed.json', JSON.stringify({ status: 'fail', sourcePins, groups, checks, acceptedSteps, errors, cases,
    wallSeconds: (performance.now() - started) / 1000, error: error.stack }, null, 2) + '\n'); throw error;
}
