import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createColumn } from './column.mjs';
import { createSoil, REFERENCE_SOIL, compensatedSum } from './soil.mjs';
import { solveTridiagonal } from './linear.mjs';
import { createGeometry, stockAt } from './geometry.mjs';
import { evaluate } from './solve.mjs';
import { explicitUnsaturatedReference } from './explicit-reference.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const output = process.argv[2];
assert.ok(output, 'explicit owned output directory required');
fs.mkdirSync(output, { recursive: true });
const sourceFiles = ['CONTRACT.md', 'CORRECTION.md', 'soil.mjs', 'geometry.mjs', 'linear.mjs', 'solve.mjs',
  'column.mjs', 'explicit-reference.mjs', 'qualify.mjs'];
const sourceDirectory = path.join(output, 'sources'); fs.mkdirSync(sourceDirectory, { recursive: true });
const inventory = Object.fromEntries(sourceFiles.map(file => {
  const bytes = fs.readFileSync(path.join(directory, file));
  fs.writeFileSync(path.join(sourceDirectory, file), bytes);
  return [file, createHash('sha256').update(bytes).digest('hex')];
}));
fs.writeFileSync(path.join(output, 'source-inventory.json'), JSON.stringify(inventory, null, 2));
const results = [], start = performance.now(), cpu = process.cpuUsage();
let checks = 0, currentProgress = [];
const record = value => { currentProgress.push(value); };
const check = (condition, label) => { checks++; assert.ok(condition, label); };
const near = (actual, expected, tolerance, label) => check(Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} vs ${expected}, tolerance ${tolerance}`);
const group = (name, run) => {
  const before = checks; currentProgress = [];
  try {
    const value = run(); results.push({ name, checks: checks - before, ...value });
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ failedGroup: name,
      checks, completedGroups: results, currentProgress, inventory,
      error: { name: error.name, message: error.message, stack: error.stack, partial: error.partial,
        candidateBoundaries: error.candidateBoundaries, wetBoundaryNormalizations: error.wetBoundaryNormalizations },
      elapsedMs: performance.now() - start }, null, 2));
    throw error;
  }
};
const soil = createSoil(), rho = soil.definition.densityKgM3;
const geometry = (cells, lower = false) => ({ cells, lengthM: 1, areaM2: 1,
  pondAreaM2: 1, standpipeAreaM2: lower ? 1 : null });
const massAt = (h, cells) => rho / cells * soil.at(h).theta;

function fromHeads(owner, heads, pondDepth = 0, lowerDepth = null) {
  const scale = rho * owner.geometry.areaM2 * owner.geometry.lengthM / owner.geometry.cells;
  return owner.initial({ waterMassKg: heads.map(h => scale * soil.at(h).theta),
    pondMassKg: rho * owner.geometry.pondAreaM2 * pondDepth,
    standpipeMassKg: lowerDepth === null ? null : rho * owner.geometry.standpipeAreaM2 * lowerDepth });
}

function verifyReceipt(owner, input, result) {
  const reconstructed = [...input.massKg];
  for (let face = 0; face < result.receipt.faceTransferKg.length; face++) {
    reconstructed[face] -= result.receipt.faceTransferKg[face];
    reconstructed[face + 1] += result.receipt.faceTransferKg[face];
  }
  near(Math.max(...reconstructed.map((m, i) => Math.abs(m - result.state.massKg[i]))), 0,
    2e-8, 'aggregate paired receipt reconstructs all endpoint stocks');
  near(owner.read(result.state).totalMassKg, owner.read(input).totalMassKg, 2e-8, 'finite total water');
  for (const step of result.receipt.steps) {
    check(step.metrics.darcyKg <= 2e-9 && step.metrics.constitutiveKg <= 2e-9 &&
      Math.abs(step.metrics.totalKg) <= 1e-9, 'accepted actual mixed and Darcy residuals');
    check(Math.abs(step.closure.correctionKg) <= 2e-9, 'bounded disclosed conservation elimination');
  }
  check(owner.read(result.state).soil.every(c => c.poreAirM3 >= 0), 'no overfilled pores');
}

group('constitutive SI envelope, analytic derivatives and pivoted linear solve', () => {
  near(soil.at(0).theta, 0.45, 0, 'saturated fraction');
  near(soil.at(0).conductivityMPerS, 1e-4, 0, 'saturated m/s');
  for (const h of [-4, -1, -0.5, -0.01]) {
    const f = soil.at(h);
    near(soil.unsaturatedHead(f.theta), h, 2e-12, 'inverse negative retention');
    if (h > -4) {
      const e = 1e-6, a = soil.at(h - e), b = soil.at(h + e);
      near((b.theta - a.theta) / (2 * e), f.capacityPerM, 1e-7, 'analytic capacity derivative');
      near((b.conductivityMPerS - a.conductivityMPerS) / (2 * e),
        f.conductivityDerivativePerS, 1e-9, 'analytic conductivity derivative');
    }
  }
  assert.throws(() => soil.at(-4.01), /envelope/); checks++;
  assert.throws(() => soil.unsaturatedHead(0.45), /unsaturated/); checks++;
  const x = solveTridiagonal([2, 3], [0, 4, 5], [1, 2], [2, 16, 21]);
  near(x[0], 1, 1e-14, 'adjacent pivot x0'); near(x[1], 2, 1e-14, 'pivot x1');
  near(x[2], 3, 1e-14, 'pivot x2');
  const g = createGeometry(geometry(2, true), soil);
  for (const heads of [[0.03, -0.3, -0.1, 0.2], [-0.2, -0.4, 0.1, 0.3]]) {
    const oldMass = heads.map((h, i) => stockAt(g, g.nodes[i], h).mass);
    const work = { evaluations: 0, evaluationLimit: 100, faceEvaluations: 0 };
    const actual = evaluate(g, oldMass, 5, heads, work), epsilon = 1e-6;
    for (let j = 0; j < heads.length; j++) {
      const a = [...heads], b = [...heads]; a[j] -= epsilon; b[j] += epsilon;
      const ra = evaluate(g, oldMass, 5, a, work).residual;
      const rb = evaluate(g, oldMass, 5, b, work).residual;
      for (let i = 0; i < heads.length; i++) {
        const analytic = i === j ? actual.diagonal[i] : j === i + 1 ? actual.upper[i] :
          j === i - 1 ? actual.lower[j] : 0;
        near((rb[i] - ra[i]) / (2 * epsilon), analytic, 1e-5 * Math.max(1, Math.abs(analytic)),
          'independent finite-difference full mixed Jacobian away from branch junctions');
      }
    }
  }
  return { definition: REFERENCE_SOIL, minimumTheta: soil.minimumTheta };
});

group('hydrostatic water table and ponded rest', () => {
  const output = [];
  for (const totalHead of [-0.35, 0.1]) {
    const owner = createColumn(geometry(8, true));
    const heads = Array.from({ length: 8 }, (_, i) => totalHead + (i + 0.5) / 8);
    const initial = fromHeads(owner, heads, Math.max(totalHead, 0), totalHead + 1);
    const run = owner.advance(initial, 3600, { dtMaxS: 120 });
    record({ totalHeadM: totalHead, input: initial, result: run });
    verifyReceipt(owner, initial, run);
    near(Math.max(...run.state.massKg.map((m, i) => Math.abs(m - initial.massKg[i]))), 0, 2e-8,
      'hydrostatic stock rest');
    near(Math.max(...run.receipt.faceTransferKg.map(Math.abs)), 0, 2e-8, 'hydrostatic zero flux');
    near(Math.max(...run.lastStep.headM.map((h, i) => {
      const z = i === 0 ? 0 : i === 9 ? -1 : -(i - 0.5) / 8;
      return Math.abs(h + z - totalHead);
    })), 0, 2e-8, 'physical hydrostatic total head');
    output.push({ totalHeadM: totalHead, work: run.work });
  }
  return { cases: output };
});

group('finite saturated reservoirs: exact discrete law and continuous-time refinement in both directions', () => {
  const cases = [], resistance = 1 / soil.definition.ksMPerS, rate = 2 / resistance;
  for (const [top, bottom] of [[0.2, 1.1], [0.1, 1.2]]) {
    const errors = [];
    for (const dt of [60, 30, 15]) {
      const owner = createColumn(geometry(8, true));
      const initial = fromHeads(owner, Array(8).fill(1), top, bottom);
      const run = owner.advance(initial, 600, { dtMaxS: dt });
      record({ top, bottom, dt, input: initial, result: run });
      verifyReceipt(owner, initial, run);
      const delta0 = top - (bottom - 1);
      const delta = run.state.massKg[0] / rho - (run.state.massKg.at(-1) / rho - 1);
      const discrete = delta0 / (1 + dt * rate) ** (600 / dt);
      const continuous = delta0 * Math.exp(-rate * 600), error = Math.abs(delta - continuous);
      near(delta, discrete, 2e-10, 'backward-Euler reservoir exponential multiplier');
      check(run.receipt.faceTransferKg[0] * delta0 > 0, 'actual infiltration/reversed-seepage sign');
      check(run.state.massKg.slice(1, 9).every((m, i) => m === initial.massKg[i + 1]),
        'exact saturated pore masses, no pressure storage');
      errors.push(error);
      cases.push({ topDepthM: top, bottomDepthM: bottom, dtS: dt, deltaM: delta,
        discreteExpectedM: discrete, continuousExpectedM: continuous, errorM: error, work: run.work });
    }
    check(errors[0] / errors[1] > 1.8 && errors[1] / errors[2] > 1.8,
      'first-order continuous-time convergence');
  }
  return { resistanceSPerM2: resistance, decayRatePerS: rate, cases };
});

group('finite lower wetting and depletion create real mobile branches', () => {
  const cases = [];
  for (const config of [{ name: 'newly wet lower standpipe', soilHead: 1, top: 0.001, bottom: 0 },
    { name: 'finite lower donor exhausts', soilHead: -0.5, top: 0, bottom: 0.001 }]) {
    const owner = createColumn(geometry(8, true));
    const initial = fromHeads(owner, Array(8).fill(config.soilHead), config.top, config.bottom);
    const run = owner.advance(initial, 60, { dtMaxS: 1 });
    record({ config, input: initial, result: run });
    verifyReceipt(owner, initial, run);
    if (config.bottom === 0) {
      check(run.state.massKg.at(-1) > 0 && run.state.massKg[0] === 0,
        'new lower wet stock and actual top exhaustion');
      check(run.state.massKg.slice(1, 9).some((m, i) => m < initial.massKg[i + 1]),
        'soil actually desaturates while finite lower store grows');
    } else {
      check(run.state.massKg.at(-1) === 0, 'lower finite donor really exhausts');
      check(run.receipt.faceTransferKg.at(-1) < 0, 'upward lower-donor transfer');
    }
    cases.push({ ...config, finalTopKg: run.state.massKg[0], finalLowerKg: run.state.massKg.at(-1),
      totalLowerTransferKg: run.receipt.faceTransferKg.at(-1),
      lastLowerTransferKg: run.lastStep.transferKg.at(-1),
      lastLowerHeadM: run.lastStep.headM.at(-1), work: run.work });
  }
  return { cells: 8, intervalS: 60, dtMaxS: 1, cases };
});

const nonlinear = new Map();
group('finite pond exhaustion, mesh/time refinement and independent finer explicit mass reference', () => {
  const cases = [], end = 300;
  for (const [cells, dt] of [[8, 2], [16, 1], [32, 0.5], [32, 0.25]]) {
    const owner = createColumn(geometry(cells));
    const initial = fromHeads(owner, Array(cells).fill(-0.5), 0.001);
    const run = owner.advance(initial, end, { dtMaxS: dt });
    record({ cells, dt, input: initial, result: run });
    verifyReceipt(owner, initial, run);
    check(run.state.massKg[0] === 0, 'finite pond actually exhausts');
    const theta = owner.read(run.state).soil.map(c => c.theta);
    nonlinear.set(`${cells}/${dt}`, { owner, initial, run, theta });
    cases.push({ cells, dtS: dt, theta, pondMassKg: run.state.massKg[0], work: run.work,
      maximumClosureKg: Math.max(...run.receipt.steps.map(s => Math.abs(s.closure.correctionKg))) });
  }
  const reference = explicitUnsaturatedReference({ cells: 32, lengthM: 1, areaM2: 1,
    initialHeadM: -0.5, pondDepthM: 0.001, intervalS: end, dtMaxS: 0.025 });
  const referenceFine = explicitUnsaturatedReference({ cells: 32, lengthM: 1, areaM2: 1,
    initialHeadM: -0.5, pondDepthM: 0.001, intervalS: end, dtMaxS: 0.0125 });
  check(reference.exhaustedAtS !== null && reference.pondMassKg === 0,
    'independent time integrator exhausts actual donor');
  near(reference.massErrorKg, 0, 2e-8, 'independent explicit paired-mass conservation');
  const l1 = (a, b) => compensatedSum(a.map((v, i) => Math.abs(v - b[i]))) / a.length;
  const explicitRefinement = l1(reference.theta, referenceFine.theta);
  check(explicitRefinement < 1e-5, 'independent explicit reference time refinement');
  const coarse = nonlinear.get('32/0.5'), fine = nonlinear.get('32/0.25');
  const coarseError = l1(coarse.theta, referenceFine.theta), fineError = l1(fine.theta, referenceFine.theta);
  check(fineError < coarseError && fineError < 0.002, 'BE converges toward finer independent explicit profile');
  const restrict = a => Array.from({ length: a.length / 2 }, (_, i) => (a[2 * i] + a[2 * i + 1]) / 2);
  const mesh8 = l1(nonlinear.get('8/2').theta, restrict(nonlinear.get('16/1').theta));
  const mesh16 = l1(nonlinear.get('16/1').theta, restrict(fine.theta));
  check(mesh16 < mesh8 && mesh16 < 0.01, 'bounded joint time/mesh refinement');
  fs.writeFileSync(path.join(output, 'nonlinear-reference.json'), JSON.stringify({ reference, referenceFine }, null, 2));
  return { endS: end, cases, explicitReference: { steps: reference.steps,
    exhaustedAtS: reference.exhaustedAtS, minimumMarginKg: reference.minimumMarginKg },
    coarseL1Theta: coarseError, fineL1Theta: fineError, explicitRefinementL1Theta: explicitRefinement,
    mesh8L1Theta: mesh8, mesh16L1Theta: mesh16,
    scope: 'independent forward-time mass stepping; same constitutive and face discretization, not a published benchmark reproduction' };
});

group('canonical restart, strict rejection and immutable input/definition lifetime', () => {
  const owner = createColumn(geometry(8));
  const initial = fromHeads(owner, Array(8).fill(-0.5), 0.001);
  const full = owner.advance(initial, 100, { dtMaxS: 2 });
  const first = owner.advance(initial, 50, { dtMaxS: 2 });
  const saved = path.join(output, 'soil-save.json'); fs.writeFileSync(saved, owner.encode(first.state));
  const fresh = createColumn(geometry(8));
  const resumed = fresh.advance(fresh.decode(fs.readFileSync(saved, 'utf8')), 50, { dtMaxS: 2 });
  assert.deepEqual(resumed.state, full.state); checks++;
  check(!owner.encode(first.state).includes('headM'), 'no pressure cache in canonical save');
  const snapshot = owner.encode(initial);
  const rejects = [
    () => owner.advance(initial, 10, { dtMaxS: 10, maxEvaluations: 1 }),
    () => owner.advance(initial, 20, { dtMaxS: 10, maxSteps: 1 }),
    () => owner.advance({ ...initial, timeS: 1e300 }, 1),
    () => owner.decode(JSON.stringify({ ...initial, identity: 'other geometry' })),
    () => owner.decode(JSON.stringify({ ...initial, massKg: initial.massKg.map((m, i) => i === 1 ? 100 : m) })),
    () => owner.initial({ waterMassKg: Array(8).fill(massAt(0, 8)), pondMassKg: 0 }),
    () => owner.initial({ waterMassKg: Array(8).fill(0), pondMassKg: 1 }),
  ];
  for (const reject of rejects) { assert.throws(reject); checks++; near(owner.encode(initial) === snapshot ? 0 : 1, 0, 0, 'input preserved after rejection'); }
  const definition = { ...REFERENCE_SOIL }, shape = geometry(8);
  const isolated = createColumn(shape, definition), id = isolated.identity;
  definition.porosity = 0.99; shape.cells = 64;
  check(isolated.identity === id && isolated.definition.porosity === 0.45 && isolated.geometry.cells === 8,
    'private definition/geometry snapshot');
  return { rejectionCases: rejects.length, exactFreshOwnerFileRestart: true };
});

const proof = { version: 'soil-column-fixed-qualification-v1', groups: results.length, checks, results,
  elapsedMs: performance.now() - start, cpu: process.cpuUsage(cpu), memory: process.memoryUsage(), inventory };
fs.writeFileSync(path.join(output, 'proof.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ groups: proof.groups, checks, elapsedMs: proof.elapsedMs,
  output: path.resolve(output) }));
