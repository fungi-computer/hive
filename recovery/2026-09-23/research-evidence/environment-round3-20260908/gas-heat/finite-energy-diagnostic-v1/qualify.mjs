import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { geometry } from '../transport-v2/checkpoint/geometry.mjs';
import { createBuoyancyOracle } from '../linear-buoyancy-oracle-v1/oracle.mjs';
import { createFiniteGas, LIMITS } from './finite-gas.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const started = performance.now(), cpuStarted = process.cpuUsage();
const read = (path) => readFileSync(directory + path);
const hash = (path) => createHash('sha256').update(read(path)).digest('hex');
const write = (path, value) => writeFileSync(directory + path, JSON.stringify(value, null, 2) + '\n');
const json = (value) => JSON.parse(JSON.stringify(value));
const sum = (values) => values.reduce((n, x) => n + x, 0);
const baselinePins = JSON.parse(read('baseline-inventory.json'));
const baseline = JSON.parse(read('../finite-buoyancy-v1/moving-8-32.json'));
const baselineCase = JSON.parse(read('../finite-buoyancy-v1/case-moving-8-32.json'));
const sourcePaths = ['qualify.mjs', 'CONTRACT.md', 'finite-gas.mjs', 'momentum.mjs', 'projection.mjs',
  'geometry-owner.mjs', 'energy-diagnostics.mjs', 'baseline-inventory.json', '../transport-v2/checkpoint/geometry.mjs',
  '../finite-thermo-v1/checkpoint/definitions.mjs', '../finite-thermo-v1/checkpoint/thermodynamics.mjs',
  '../linear-buoyancy-oracle-v1/oracle.mjs'];
const sourcePins = Object.fromEntries(sourcePaths.map((path) => [path, hash(path)]));
write('run-source-inventory.json', sourcePins);
let checks = 0, activeStep = null, output = null, result = null;
const residuals = {};
function ok(value, message) { checks++; assert(value, message); }
function equal(value, expected) { checks++; assert.deepEqual(value, expected); }
function close(name, actual, expected, terms = []) {
  const error = Math.abs(actual - expected), scale = sum([actual, expected, ...terms].map(Math.abs));
  const tolerance = 1e-10 + 1e-10 * scale;
  residuals[name] = { actual, expected, error, tolerance };
  ok(Number.isFinite(actual) && Number.isFinite(expected) && error <= tolerance, name);
}
function pins() {
  for (const [path, expected] of Object.entries({ ...baselinePins, ...sourcePins })) equal(hash(path), expected);
  for (const owner of ['finite-momentum-v1', 'finite-buoyancy-v1']) {
    const inventory = JSON.parse(read('../' + owner + '/handoff-inventory.json'));
    for (const [path, expected] of Object.entries(inventory)) equal(hash('../' + owner + '/' + path), expected);
  }
  equal(hash('projection.mjs'), hash('../finite-momentum-v1/projection.mjs'));
  equal(hash('geometry-owner.mjs'), hash('../finite-momentum-v1/geometry-owner.mjs'));
}

function fixture() {
  const lengths = [4, 2.16, 4], spacing = lengths.map((x) => x / 8), pressurePa = 100000;
  const rho0 = pressurePa / ((8.31446261815324 / .02897) * 300);
  const g = geometry({ size: [8, 8, 8], spacing, periodic: [true, false, true], domainId: 'finite-buoyancy-8',
    viscosity: 0, thermalDiffusivity: 0, tracerDiffusivity: 0, buoyancy: false });
  const gas = createFiniteGas(g, { gravity: [0, -9.81, 0] });
  const oracle = createBuoyancyOracle({ lengthsM: lengths, densityKgM3: rho0, epsilon: .1, gravityMS2: 9.81 });
  const densityKgM3 = g.cells.map((cell) => oracle.averages(cell.center, spacing).densityKgM3);
  return { g, gas, initial: gas.initial({ pressurePa, densityKgM3 }) };
}

function donorLaws(d, key) {
  close(key + '.pairing', d.donorPairingResidualJ, 0, [d.linearWorkJ, d.donorDissipationJ]);
  close(key + '.finite', d.finiteIdentityResidualJ, 0, [d.kineticChangeJ, d.linearWorkJ, d.forwardRemainderJ]);
  close(key + '.combined', d.combinedResidualJ, 0, [d.kineticChangeJ, d.donorDissipationJ, d.forwardRemainderJ]);
  ok(d.donorDissipationJ >= 0 && d.forwardRemainderJ >= 0, key + ' nonnegative terms');
  ok(d.kineticChangeJ <= 1e-10 && d.forwardRemainderJ <= d.donorDissipationJ + 1e-10, key + ' donor convexity');
}
function pressureLaws(d, key) {
  close(key + '.target', d.targetWorkJ, 0);
  close(key + '.gradient', d.gradientPairingResidualJ, 0, [d.afterImpulseWorkJ, d.residualWorkJ]);
  close(key + '.finite', d.finiteIdentityResidualJ, 0, [d.kineticChangeJ, d.afterImpulseWorkJ, d.correctionNormJ]);
  close(key + '.combined', d.combinedResidualJ, 0, [d.kineticChangeJ, d.residualWorkJ, d.correctionNormJ]);
  ok(d.correctionNormJ >= 0 && Math.abs(d.residualWorkJ) <= d.residualWorkBoundJ + 1e-15, key + ' norm and residual bound');
  ok(d.pinResidualM3S <= 1e-10, key + ' all-cell pressure pin');
  ok(d.impulseMetricResidualKgMS <= 1e-10 + 1e-10 * d.impulseMagnitudeKgMS, key + ' physical pressure impulse metric');
  ok(d.kineticChangeJ <= d.residualWorkJ + 1e-10, key + ' zero-target pressure norm');
}
function stageLaws(stage, key) {
  equal(stage.weight, .5); equal(stage.interval, 1 / 32);
  donorLaws(stage.transport.donor, key + '.donor');
  const b = stage.transport.body, g = stage.gravity;
  close(key + '.body', b.finiteIdentityResidualJ, 0, [b.kineticChangeJ, b.oldVelocityWorkJ, b.timeRemainderJ]);
  close(key + '.wall', stage.transport.wallResidualJ, 0, [stage.transport.wallKChangeJ, b.wallRemovalNormJ]);
  ok(stage.transport.wallKChangeJ <= 1e-10 && b.wallRemovalNormJ >= 0, key + ' wall norm');
  close(key + '.gravity', g.donorGapResidualJ, 0, [g.oldVelocityWorkJ, g.potentialFromFluxJ, g.donorGapJ]);
  close(key + '.potential', g.potentialResidualJ, 0, [g.observedPotentialChangeJ, g.potentialFromFluxJ]);
  close(key + '.external', g.externalBodyWorkJ, 0, [g.oldVelocityWorkJ, b.oldVelocityWorkJ]);
  pressureLaws(stage.projection, key + '.projection');
}

function stepLaws(step, i) {
  activeStep = { index: i, diagnostic: step };
  equal(step.start, i / 32); equal(step.end, (i + 1) / 32); equal(step.rejected, 0);
  equal(step.first.forceTime, step.start); equal(step.second.forceTime, step.start + 1 / 32);
  stageLaws(step.first, `${i}.first`); stageLaws(step.second, `${i}.second`);
  equal(step.finalProjection.weight, 1); equal(step.finalProjection.constraintTime, step.end);
  pressureLaws(step.finalProjection, `${i}.final`);
  close(`${i}.Jensen`, step.average.residualJ, 0, [step.average.jensenJ, step.average.kineticChangeJ]);
  ok(step.average.jensenJ <= 0, 'RK convexity');
  close(`${i}.mechanical`, step.mechanicalResidualJ, 0, [step.mechanicalChangeJ, step.donorDissipationJ,
    step.gravityGapJ, step.timeSplitRemainderJ]);
}

function totals(steps, before, after) {
  const names = ['donorDissipationJ', 'forwardRemainderJ', 'gravityGapJ', 'gravityTimeRemainderJ',
    'wallKChangeJ', 'projectionKChangeJ', 'timeSplitRemainderJ', 'reconstructedMechanicalJ', 'mechanicalChangeJ'];
  const total = Object.fromEntries(names.map((name) => [name, sum(steps.map((s) => s[name]))]));
  const jensenJ = sum(steps.map((s) => s.average.jensenJ));
  const observed = after.kineticEnergyJ - before.kineticEnergyJ + after.potentialEnergyJ - before.potentialEnergyJ;
  close('whole.mechanical', total.reconstructedMechanicalJ, observed, Object.values(total));
  close('whole.recorded_change', total.mechanicalChangeJ, observed);
  close('whole.donor', -total.donorDissipationJ + total.forwardRemainderJ, output.receipt.advectionKChangeJ);
  close('whole.wall', total.wallKChangeJ, output.receipt.wallConstraintKChangeJ);
  close('whole.projection', total.projectionKChangeJ, output.receipt.pressureKChangeJ);
  close('whole.Jensen', jensenJ, output.receipt.rkAveragingKChangeJ);
  close('whole.previous', observed, baseline.result.laws.mechanicalResidualJ);
  return { ...total, jensenJ, observedMechanicalJ: observed };
}

try {
  pins(); const { g, gas, initial } = fixture();
  equal(json(initial), baseline.initial);
  const initializedWork = gas.diagnostics(); equal(initializedWork.thermodynamicCellReads, 512);
  output = gas.advance(initial, 1, { dtMax: 1 / 32, maxSteps: 32 });
  // Persist every returned raw stage before a diagnostic law can stop this packet.
  write('output-v1.json', output); write('steps-v1.json', output.energyDiagnostics);
  const postSolveWork = gas.diagnostics();
  const { energyDiagnostics, ...oldOutput } = output;
  equal(json(oldOutput), baselineCase.output);
  equal(gas.identity, initial.identity); equal(JSON.stringify(output.state), JSON.stringify(baseline.state));
  equal(energyDiagnostics.length, 32); equal(output.state.steps, 32); equal(output.rejected, 0);
  const expectedSolveWork = { ...baseline.result.laws.work, thermodynamicCellReads: baseline.result.laws.work.thermodynamicCellReads - 2 * g.n };
  equal(postSolveWork, expectedSolveWork);
  const before = gas.read(initial), after = gas.read(output.state), postLawWork = gas.diagnostics();
  equal(postLawWork, baseline.result.laws.work);
  close('physical.mass', after.massError, 0); close('physical.U', after.energyError, 0);
  ok(after.eosError <= LIMITS.eosRelative && after.constraintError <= LIMITS.constraintAbsolute && after.maxMach <= LIMITS.maxMach, 'retained physical envelope');
  const mechanicalChangeJ = after.kineticEnergyJ + after.potentialEnergyJ - before.kineticEnergyJ - before.potentialEnergyJ;
  const mechanicalScaleJ = Math.max(Math.abs(after.kineticEnergyJ - before.kineticEnergyJ), Math.abs(after.potentialEnergyJ - before.potentialEnergyJ));
  ok(Math.abs(mechanicalChangeJ) / mechanicalScaleJ < .3, 'unchanged prior quality screen, not accurate mechanics');
  for (const [i, step] of energyDiagnostics.entries()) stepLaws(step, i);
  const integrals = totals(energyDiagnostics, before, after);
  pins(); const wallSeconds = (performance.now() - started) / 1000, cpu = process.cpuUsage(cpuStarted);
  ok(wallSeconds <= 30, '30-second single packet wall budget');
  result = { status: 'pass', checks, sourcePins, baselinePins, integrals, residuals,
    initializedWork, postSolveWork, postLawWork, recordedBaselineWork: baseline.result.laws.work,
    scopeCorrection: { postSolveExcludedValidationCellReads: 2 * g.n, initializationCellReads: 512 },
    completeSavedOutputEqual: true, canonicalSaveJSONEqual: true, cells: g.n, acceptedSteps: 32,
    eulerStages: postSolveWork.eulerStages, wallSeconds, cpuSeconds: (cpu.user + cpu.system) / 1e6,
    finalRSSBytes: process.memoryUsage().rss };
  write('qualification-v1.json', result); console.log(JSON.stringify({ ...result, residuals: undefined }));
} catch (error) {
  const cpu = process.cpuUsage(cpuStarted);
  write('qualification-v1-failed.json', { status: 'fail', checks, sourcePins, baselinePins, activeStep,
    residuals, outputRetained: output !== null, result, error: error.stack,
    wallSeconds: (performance.now() - started) / 1000, cpuSeconds: (cpu.user + cpu.system) / 1e6 });
  throw error;
}
