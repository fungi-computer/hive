import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { geometry } from '../transport-v2/checkpoint/geometry.mjs';
import * as frozen from '../transport-v2/checkpoint/solver.mjs';
import * as legacy from './boussinesq-reference.mjs';
import { project, projectionDiagnostics, integratedDivergence } from './projection.mjs';
import { createFiniteGas } from './finite-gas.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const start = performance.now(), cpuStart = process.cpuUsage();
const paths = ['geometry-owner.mjs', 'projection.mjs', 'finite-gas.mjs', 'boussinesq-reference.mjs', 'qualify.mjs', 'CONTRACT.md',
  '../LOW-MACH-HEATING-ORACLE.md', '../transport-v2/checkpoint/geometry.mjs', '../transport-v2/checkpoint/solver.mjs',
  '../transport-v2/checkpoint/transport.mjs', '../transport-v2/checkpoint/physics.mjs',
  '../finite-thermo-v1/checkpoint/thermodynamics.mjs', '../finite-thermo-v1/checkpoint/definitions.mjs'];
const sourcePins = Object.fromEntries(paths.map((p) => [p, createHash('sha256').update(readFileSync(root + p)).digest('hex')]));
writeFileSync(root + 'source-inventory.json', JSON.stringify(sourcePins, null, 2) + '\n');
const groups = [], cases = {}, errors = {};
let checks = 0;
const sum = (a) => a.reduce((n, x) => n + x, 0);
const maxAbs = (a) => a.reduce((n, x) => Math.max(n, Math.abs(x)), 0);
const maxDifference = (a, b) => a.reduce((n, x, i) => Math.max(n, Math.abs(x - b[i])), 0);
const close = (name, actual, expected, abs = 1e-10, rel = 0) => {
  checks++; const error = Math.abs(actual - expected);
  errors[name] = { actual, expected, absoluteError: error };
  assert(Number.isFinite(actual) && error <= abs + rel * Math.abs(expected), `${name}: ${actual} != ${expected}`);
};
const equal = (a, b) => { checks++; assert.deepEqual(a, b); };
const ok = (condition, message) => { checks++; assert(condition, message); };
const reject = (fn, pattern) => { checks++; assert.throws(fn, pattern); };
const group = (name, fn) => { const before = performance.now(); fn(); groups.push({ name, seconds: (performance.now() - before) / 1000 }); };
const gasGeometry = (options = {}) => geometry({ size: [32, 2], spacing: [.25, .54], extrusion: 1,
  viscosity: 0, thermalDiffusivity: 0, tracerDiffusivity: 0, buoyancy: false,
  domainId: 'finite-heater-fixed-strip-v1', ...options });
const smallGeometry = (options = {}) => gasGeometry({ size: [3, 2], spacing: [1, .54], solid: [3, 4, 5],
  domainId: 'three-cell-local-law-v1', ...options });
const Rgas = 8.31446261815324 / .02897, gamma = 1.4;

function densityOracle(lo, hi, time) {
  const L = 8, a = 4, p0 = 100000, rho0 = p0 / (Rgas * 300), r = (p0 + 200 * time) / p0;
  const rhoHot = rho0 * r ** (-1 / gamma), rhoCold = rho0 * r ** (1 / gamma);
  const front = L - (L - a) * r ** (-1 / gamma);
  const cuts = [lo, ...[a, front].filter((x) => x > lo && x < hi), hi].sort((x, y) => x - y);
  let integral = 0;
  for (let i = 1; i < cuts.length; i++) {
    const x = cuts[i - 1], y = cuts[i], mid = (x + y) / 2;
    if (mid <= a) integral += rhoHot * (y - x);
    else if (mid >= front) integral += rhoCold * (y - x);
    else integral += rhoHot * (L - a) ** 2 * (1 / (L - y) - 1 / (L - x));
  }
  return integral / (hi - lo);
}

try {
  group('unequal-density pressure mobility and sealed compatibility', () => {
    const g = smallGeometry(), rho = [250, 300, 400].map((t) => 100000 / (Rgas * t));
    const predicted = [.01, -.015], beta = g.faces.map((f) => 2 / (rho[f.i] + rho[f.j]));
    const first = project(g, predicted, { faceCoefficient: beta });
    const phi = [...first.potential];
    close('mobility_zero_flow', maxAbs(first.velocity), 0, 2e-10);
    for (const f of g.faces) close(`mobility_impulse_jump_${f.k}`, phi[f.i] - phi[f.j], -predicted[f.k] * f.distance / beta[f.k], 2e-10);
    const secondBeta = beta.map((b, i) => b * (i === 0 ? 1.3 : .7));
    const second = project(g, predicted, { faceCoefficient: secondBeta });
    close('changed_coeff_zero_flow', maxAbs(second.velocity), 0, 2e-10);
    for (const f of g.faces) close(`changed_coeff_jump_${f.k}`, second.potential[f.i] - second.potential[f.j], -predicted[f.k] * f.distance / secondBeta[f.k], 2e-10);
    equal(projectionDiagnostics(g).coefficientBuilds, 2);
    equal(projectionDiagnostics(g).topologyBuilds, 1);
    close('gauge_cell_residual', integratedDivergence(g, second.velocity)[0], 0, 1e-10);
    const disconnected = gasGeometry({ size: [4, 2], spacing: [1, .54], solid: [4, 5, 6, 7], walls: ['x:2,0,0'] });
    const target = [1e-3, 0, -1e-3, 0, 0, 0, 0, 0];
    reject(() => project(disconnected, new Float64Array(disconnected.faces.length), { targetVolumeFlux: target }), /incompatible sealed component/);
    equal(projectionDiagnostics(disconnected).pressureSolves, 0);
    reject(() => createFiniteGas(disconnected), /one connected sealed/);
    cases.mobility = { densitiesKgM3: rho, coefficients: beta, provisionalVelocityMS: predicted, potentialPaS: phi,
      work: projectionDiagnostics(g) };
  });

  group('actual Boussinesq consumer uses the extracted operator', () => {
    const g = geometry({ size: [4, 4, 4], spacing: [.5, .54, .5], periodic: [true, true, true], domainId: 'boussinesq-extraction-check-v1' });
    const f = () => ({ sources: [{ cell: 5, heatJS: 30, smokeKgS: 1e-6 }] });
    const before = frozen.initial(g), old = frozen.advance(g, before, .15, { dtMax: .05, forcingAt: f });
    const next = legacy.advance(g, before, .15, { dtMax: .05, forcingAt: f });
    for (const key of ['velocity', 'smoke', 'heat']) close(`legacy_${key}`, maxDifference(old.state[key], next.state[key]), 0, 1e-9);
    equal(next.state.time, old.state.time); equal(next.state.steps, old.state.steps);
    ok(legacy.diagnostics(g).pressureSolves > 0, 'actual legacy advance used shared pressure owner');
    cases.legacy = { work: legacy.diagnostics(g), maxDivergence: next.maxDivergence };
  });

  group('private geometry lifetime and descriptor identity', () => {
    const g = smallGeometry(), gas = createFiniteGas(g), initial = gas.initial({ pressurePa: 100000, temperatureK: 300 });
    const heat = [540, 0, 0, 0, 0, 0];
    const control = gas.advance(initial, 1, { dtMax: 1, heatWatts: heat });
    // These externally reachable derived arrays never belong to the bound solve.
    g.faces[0].area *= 3; g.fluid[0] = 0; g.fixed[1] = 1;
    g.cells[0].fluid = false; g.stencil[0][0][0].center = 300;
    equal(gas.advance(initial, 1, { dtMax: 1, heatWatts: heat }).state, control.state);
    const b = geometry({ size: [3, 3], spacing: [1, .54], domainId: 'owned-legacy-geometry-v1' });
    const b0 = legacy.initial(b), opts = { dtMax: .05, forcingAt: () => ({ sources: [{ cell: 1, heatJS: 10 }] }) };
    const bc = legacy.advance(b, b0, .1, opts);
    const transportControl = legacy.transport(b, b0, Array(b.faces.length).fill(0), .05, opts.forcingAt());
    b.faces[0].distance *= 2; b.fluid[1] = 0; b.cells[1].fluid = false;
    equal(legacy.advance(b, b0, .1, opts).state, bc.state);
    equal(legacy.transport(b, b0, Array(b.faces.length).fill(0), .05, opts.forcingAt()), transportControl);
    const changed = createFiniteGas(smallGeometry({ origin: [1, 0, 0] }));
    reject(() => changed.decode(gas.encode(initial)), /identity/);
    const forged = JSON.parse(g.identity); forged.faces[0][3] *= 2;
    reject(() => createFiniteGas({ identity: JSON.stringify(forged) }), /does not reproduce/);
  });

  group('three-cell local mass and enthalpy receipts', () => {
    const g = smallGeometry(), gas = createFiniteGas(g), s = gas.initial({ pressurePa: 100000, temperatureK: 300 });
    const out = gas.forwardEuler(s, 1, [540, 0, 0, 0, 0, 0]);
    const pDot = (gamma - 1) * 1000 / 3, rho0 = 100000 / (Rgas * 300);
    const expectedVelocity = [2 * pDot / (gamma * 100000), pDot / (gamma * 100000)];
    for (const f of g.faces) {
      close(`local_velocity_${f.k}`, out.receipt.velocity[f.k], expectedVelocity[f.k], 2e-10);
      close(`local_mass_face_${f.k}`, out.receipt.massTransferKg[f.k], expectedVelocity[f.k] * .54 * rho0, 1e-12);
      close(`local_enthalpy_face_${f.k}`, out.receipt.enthalpyTransferJ[f.k], [360, 180][f.k], 1e-8);
    }
    for (let i = 0; i < 3; i++) close(`local_energy_change_${i}`, out.state.internalEnergyJ[i] - s.internalEnergyJ[i], 180, 1e-8);
    equal(out.state.massKg.slice(3), [0, 0, 0]); equal(out.state.internalEnergyJ.slice(3), [0, 0, 0]);
    close('local_global_mass', sum(out.state.massKg), sum(s.massKg), 1e-12);
    close('local_global_heat', sum(out.state.internalEnergyJ) - sum(s.internalEnergyJ), 540, 1e-8);
    cases.local = out;
  });

  group('rest, uniform heating, intermediate envelope and atomic work admission', () => {
    const g = smallGeometry(), gas = createFiniteGas(g), initial = gas.initial({ pressurePa: 100000, temperatureK: 300 });
    const zero = Array(g.n).fill(0), uniform = g.cells.map((c) => c.fluid ? 100 * g.volume : 0);
    const rest = gas.advance(initial, 10, { dtMax: 1, heatWatts: zero });
    equal(rest.state.massKg, initial.massKg); equal(rest.state.internalEnergyJ, initial.internalEnergyJ);
    const heated = gas.advance(initial, 10, { dtMax: 1, heatWatts: uniform });
    equal(heated.state.massKg, initial.massKg);
    close('uniform_temperature', gas.read(heated.state).temperature[0], 301.2, 1e-9);
    close('uniform_flow', maxAbs(heated.lastStage.velocity), 0, 1e-12);
    const hot = gas.initial({ pressurePa: 100000, temperatureK: 590 });
    const nineK = hot.internalEnergyJ.map((u) => u / 590 * 9);
    const admitted = gas.advance(hot, 1, { dtMax: 1, heatWatts: nineK });
    close('admitted_599K', gas.read(admitted.state).temperature[0], 599, 1e-9);
    ok(admitted.retryReasons.intermediateEnvelope > 0, 'intermediate-only envelope caused bounded reduction');
    const pin = gas.encode(hot);
    reject(() => gas.advance(hot, 1, { dtMax: 1, heatWatts: nineK.map((q) => q * 2) }), /endpoint outside/);
    reject(() => gas.advance(hot, 1, { dtMax: 1, maxSteps: 1, heatWatts: nineK }), /work budget exhausted/);
    equal(gas.encode(hot), pin);
    const late = { ...initial, time: 2 ** 53 };
    reject(() => gas.advance(late, .125, { dtMax: 1, heatWatts: zero }), /representable time/);
    reject(() => gas.advance(initial, 3000, { dtMax: 1, heatWatts: zero }), /work request/);
    reject(() => gas.advance(initial, 1, { dtMax: 1, heatWatts: zero.map((q, i) => i ? q : NaN) }), /finite per-cell/);
    cases.envelope = { steps: admitted.state.steps, retries: admitted.rejected, reasons: admitted.retryReasons,
      heatRequestedJ: sum(nineK), heatStoredJ: sum(admitted.state.internalEnergyJ) - sum(hot.internalEnergyJ) };
  });

  group('fixed 64-cell heated strip: temporal and exact spatial comparison', () => {
    const results = [];
    for (const dtMax of [4, 2, 1]) {
      const caseStart = performance.now(), cpu = process.cpuUsage();
      const g = gasGeometry(), gas = createFiniteGas(g), initial = gas.initial({ pressurePa: 100000, temperatureK: 300 });
      const heatWatts = g.cells.map((c) => c.center[0] < 4 ? 1000 * g.volume : 0);
      const out = gas.advance(initial, 100, { dtMax, heatWatts }), f = gas.read(out.state);
      const exactMass = g.cells.map((c) => densityOracle(c.at[0] * .25, (c.at[0] + 1) * .25, 100) * g.volume);
      const l1 = sum(out.state.massKg.map((m, i) => Math.abs(m - exactMass[i]))) / initial.initialMassKg;
      const probe = g.cells.filter((c) => c.center[0] >= 7).map((c) => c.i);
      const coldExact = 100000 / (Rgas * 300) * 1.2 ** (1 / gamma);
      const cold = sum(probe.map((i) => f.density[i])) / probe.length;
      const coldRelativeError = Math.abs(cold - coldExact) / coldExact;
      let velocityError = 0;
      for (const face of g.faces) {
        const time = out.lastStage.evaluationTime, p = 100000 + 200 * time, x = face.center[0];
        const expected = face.axis === 0 ? 200 / (gamma * p) * (x <= 4 ? x : 8 - x) : 0;
        velocityError = Math.max(velocityError, Math.abs(out.lastStage.velocity[face.k] - expected));
      }
      close(`strip_dt${dtMax}_pressure`, f.pressure, 120000, 0, 1e-9);
      close(`strip_dt${dtMax}_source`, out.state.heatInputJ, 432000, 1e-6);
      close(`strip_dt${dtMax}_velocity`, velocityError, 0, 2e-10);
      close(`strip_dt${dtMax}_oracle_mass`, sum(exactMass), initial.initialMassKg, 1e-11);
      ok(l1 < .02, 'full density profile resolves bounded first-order reference');
      ok(out.maxMach < 1e-3 && out.maxAcceptedTemperatureK <= 600, 'declared thermal/low-speed envelope');
      equal(out.rejected, 0); equal(out.state.time, 100);
      const massReconstructed = [...initial.massKg], energyReconstructed = [...initial.internalEnergyJ];
      for (const face of g.faces) {
        const dm = out.receipt.massTransferKg[face.k], dh = out.receipt.enthalpyTransferJ[face.k];
        massReconstructed[face.i] -= dm; massReconstructed[face.j] += dm;
        energyReconstructed[face.i] -= dh; energyReconstructed[face.j] += dh;
      }
      for (let i = 0; i < g.n; i++) energyReconstructed[i] += out.receipt.heatTransferJ[i];
      close(`strip_dt${dtMax}_mass_receipts`, maxDifference(out.state.massKg, massReconstructed), 0, 1e-11);
      close(`strip_dt${dtMax}_energy_receipts`, maxDifference(out.state.internalEnergyJ, energyReconstructed), 0, 1e-6);
      const used = process.cpuUsage(cpu);
      const result = { dtMax, seconds: (performance.now() - caseStart) / 1000, cpuSeconds: (used.user + used.system) / 1e6,
        cells: g.n, faces: g.faces.length, steps: out.state.steps, pressurePa: f.pressure, l1RelativeMassError: l1,
        coldRelativeError, coldDensityKgM3: cold, coldExactKgM3: coldExact, frontMetres: 8 - 4 * 1.2 ** (-1 / gamma),
        velocityErrorMS: velocityError, massErrorKg: f.massError, energyErrorJ: f.energyError,
        eosError: out.maxEOS, constraintErrorM3S: out.maxConstraint, maxCourant: out.maxCourant,
        maxMach: out.maxMach, maxAcceptedTemperatureK: out.maxAcceptedTemperatureK, work: gas.diagnostics() };
      writeFileSync(root + `strip-dt${dtMax}.json`, JSON.stringify({ result, state: out.state, receipt: out.receipt, exactMassKg: exactMass }, null, 2) + '\n');
      results.push(result);
    }
    const ratios = [results[0].coldRelativeError / results[1].coldRelativeError, results[1].coldRelativeError / results[2].coldRelativeError];
    ok(ratios.every((r) => r > 3 && r < 5), 'cold temporal ratios remain near second order with numerical diffusion disclosed');
    ok(results[2].coldRelativeError < 1e-6, 'finest cold error');
    cases.strip = { results, coldRatios: ratios, note: 'Far-cold errors still contain numerical diffusion; full-profile error retains fixed-mesh spatial error.' };
  });

  group('actual finite-state file restart and foreign identity', () => {
    const g = gasGeometry(), gas = createFiniteGas(g), initial = gas.initial({ pressurePa: 100000, temperatureK: 300 });
    const heatWatts = g.cells.map((c) => c.center[0] < 4 ? 1000 * g.volume : 0);
    const half = gas.advance(initial, 50, { dtMax: 1, heatWatts });
    writeFileSync(root + 'restart-state.json', gas.encode(half.state));
    const restored = createFiniteGas(gasGeometry());
    const saved = restored.decode(readFileSync(root + 'restart-state.json', 'utf8'));
    const next = restored.advance(saved, 50, { dtMax: 1, heatWatts });
    const uninterrupted = JSON.parse(readFileSync(root + 'strip-dt1.json', 'utf8')).state;
    equal(next.state, uninterrupted);
    const otherSpecies = createFiniteGas(gasGeometry(), { speciesId: 'inert-helium' });
    reject(() => otherSpecies.decode(gas.encode(half.state)), /identity/);
    reject(() => restored.decode(JSON.stringify({ ...saved, pressurePa: 110000 })), /shape/);
    equal(saved.time, 50); equal(next.state.time, 100);
  });

  const cpu = process.cpuUsage(cpuStart);
  const report = { status: 'pass', sourcePins, groups, checks, errors, cases,
    wallSeconds: (performance.now() - start) / 1000, cpuSeconds: (cpu.user + cpu.system) / 1e6, rssBytes: process.memoryUsage().rss };
  ok(report.wallSeconds <= 30, '30-second focused proof budget');
  report.checks = checks;
  writeFileSync(root + 'qualification-v1.json', JSON.stringify(report, null, 2) + '\n');
  writeFileSync(root + 'source-inventory.json', JSON.stringify(sourcePins, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, groups: groups.length, checks, wallSeconds: report.wallSeconds,
    cpuSeconds: report.cpuSeconds, rssBytes: report.rssBytes, strip: cases.strip }));
} catch (error) {
  writeFileSync(root + 'qualification-v1-failed.json', JSON.stringify({ status: 'fail', sourcePins, groups, checks, errors, cases,
    wallSeconds: (performance.now() - start) / 1000, error: error.stack }, null, 2) + '\n');
  throw error;
}
