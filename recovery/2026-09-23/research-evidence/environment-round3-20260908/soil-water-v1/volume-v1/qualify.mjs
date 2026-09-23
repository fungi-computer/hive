import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createColumn } from '../column-v1/source-v2/column.mjs';
import { REFERENCE_SOIL, compensatedSum } from '../column-v1/source-v2/soil.mjs';
import { createVolumeGeometry } from './geometry.mjs';
import { createVolume } from './volume.mjs';
import { mixedResidual } from './residual.mjs';
import { solveNewtonDirection } from './linear.mjs';
import { NUMERICS, balanceTolerance, maxAbs, elevation } from './state.mjs';
import { referenceColumnDescriptor, hydrostaticVolumeDescriptor, saturatedPathDescriptor,
  explicitFixtureStocks } from './first-caller.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url)), output = process.argv[2];
assert.ok(output, 'explicit owned output directory required');
assert.ok(!fs.existsSync(output), 'fresh proof output required; preserve previous packet');
fs.mkdirSync(output, { recursive: true });
const localSources = ['CONTRACT.md', 'geometry.mjs', 'faces.mjs', 'residual.mjs', 'first-caller.mjs',
  'state.mjs', 'guess.mjs', 'linear.mjs', 'newton.mjs', 'closure.mjs', 'volume.mjs', 'qualify.mjs'];
const retainedSources = ['soil.mjs', 'geometry.mjs', 'linear.mjs', 'solve.mjs', 'column.mjs'];
const inventory = {};
for (const [prefix, files] of [['.', localSources], ['../column-v1/source-v2', retainedSources]]) {
  for (const name of files) {
    const key = prefix === '.' ? name : `column-reference/${name}`;
    const bytes = fs.readFileSync(path.join(directory, prefix, name)), destination = path.join(output, 'sources', key);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, bytes);
    inventory[key] = createHash('sha256').update(bytes).digest('hex');
  }
}
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
write('source-inventory.json', inventory); // Before any numerical group.
const start = performance.now(), cpu = process.cpuUsage(), results = [];
let checks = 0, progress = [];
const check = (condition, label) => { checks++; assert.ok(condition, label); };
const near = (actual, expected, tolerance, label) => check(Number.isFinite(actual) &&
  Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}, tolerance ${tolerance}`);
const record = value => progress.push(value);
function group(name, run) {
  progress = []; const before = checks;
  try { const value = run(); results.push({ name, ...value, checks: checks - before }); }
  catch (error) {
    write('failure.json', { failedGroup: name, checks, completedGroups: results, progress, inventory,
      error: { name: error.name, message: error.message, stack: error.stack, candidate: error.candidate,
        partial: error.partial }, elapsedMs: performance.now() - start });
    throw error;
  }
}

function fixture(descriptor, settings) {
  const g = createVolumeGeometry(descriptor), owner = createVolume(descriptor);
  const masses = explicitFixtureStocks(g, settings);
  const state = owner.initial({ stocks: g.nodes.map((n, i) => ({ nodeId: n.id, massKg: masses[i] })) });
  return { descriptor, g, owner, state };
}

function verify(f, input, result) {
  const total = compensatedSum(input.massKg), balance = balanceTolerance(total);
  near(f.owner.read(result.state).totalMassKg, total, balance, 'finite canonical total');
  const paired = [...input.massKg];
  for (const [k, face] of f.g.faces.entries()) {
    const transfer = result.receipt.faceTransferKg[k];
    paired[face.left] -= transfer; paired[face.right] += transfer;
  }
  near(maxAbs(paired.map((m, i) => m - result.state.massKg[i])), 0,
    NUMERICS.acceptedKg + 64 * Number.EPSILON * total, 'one aggregate paired face ledger');
  for (const step of result.receipt.steps) {
    const m = step.metrics;
    check([m.mixedKg, m.constitutiveKg, m.darcyKg, m.treeCorrectionKg].every(x => x <= 2e-9),
      'actual mixed/constitutive/Darcy/tree residuals');
    check(m.pairKg <= balance && Math.abs(m.totalKg) <= balance &&
      Math.abs(m.rootCompatibilityKg) <= balance && m.chordDifferenceKg === 0,
    'paired conservation and unchanged Darcy chords');
    check(step.massKg.every((stock, i) => stock >= f.g.nodes[i].minMassKg && stock <= f.g.nodes[i].maxMassKg),
      'strict geometric pore/boundary bounds');
  }
  check(Object.values(result.work).every(Number.isFinite), 'every work counter finite');
  check(result.work.peakDenseBytes <= 72 * 72 * 8 && result.work.matrixUpdates <= 30000000,
    'actual dense allocation/update bounds');
}

function runFixture(f, seconds, dt, label) {
  const before = f.owner.encode(f.state), result = f.owner.advance(f.state, seconds, { dtMaxS: dt });
  // Preserve actual complete successful diagnostics before any following assertion.
  write(`${label}.json`, result); record({ label, work: result.work, maxima: result.receipt.maxAbsMetrics,
    aggregateResidual: result.receipt.aggregateResidual, finalMassKg: result.state.massKg });
  check(f.owner.encode(f.state) === before, 'input preserved after successful advance');
  verify(f, f.state, result); return result;
}

function jacobianEntry(g, e, dt, row, column) {
  let value = row === column ? e.capacityKgPerM[row] : 0;
  for (const [k, face] of g.faces.entries()) {
    const derivative = column === face.left ? e.derivativeLeftM2S[k] :
      column === face.right ? e.derivativeRightM2S[k] : 0;
    if (row === face.left) value += g.densityKgM3 * dt * derivative;
    if (row === face.right) value -= g.densityKgM3 * dt * derivative;
  }
  return value;
}

function pivotFixture() {
  // Independent linear-only known matrix [[-.01,-.5],[.02,1.5]], x=[2,3].
  // This exercises the exact owner through its coefficient representation;
  // these coefficients are not claimed as a sampled soil state.
  const g = { nodes: [{}, {}], faces: [{ left: 0, right: 1 }], densityKgM3: 1 };
  const e = { capacityKgPerM: [0.01, 1], derivativeLeftM2S: [-0.02],
    derivativeRightM2S: [-0.5], residualKg: [1.52, -4.54] };
  const work = Object.fromEntries(['matrixAssemblyAdds', 'matrixBuilds', 'peakDenseBytes',
    'pivotComparisons', 'matrixSwapEntries', 'factorDivisions', 'matrixUpdates', 'rhsUpdates',
    'backSubProducts', 'backSubDivisions', 'maxLinearResidualKg'].map(k => [k, 0]));
  work.matrixUpdateLimit = 100;
  const solved = solveNewtonDirection(g, e, 1, work);
  near(solved[0], 2, 1e-12, 'dense row-pivot known x0'); near(solved[1], 3, 1e-12, 'dense row-pivot known x1');
  check(work.matrixSwapEntries === 2 && work.matrixUpdates === 1, 'actual pivot/update counted');
  return work;
}

group('all-axis metric, full Jacobian finite differences and actual dense pivot', () => {
  const d = hydrostaticVolumeDescriptor(), g = createVolumeGeometry(d), epsilon = 1e-6, dt = 5;
  const heads = g.nodes.map((n, i) => n.kind === 'soil' ? -0.25 - 0.017 * i : 0.2);
  const oldMass = [...mixedResidual(g, g.nodes.map(n => n.kind === 'soil' ? n.maxMassKg : 200), heads, dt).massFromHeadKg];
  const e = mixedResidual(g, oldMass, heads, dt);
  for (let column = 0; column < heads.length; column++) {
    const a = [...heads], b = [...heads]; a[column] -= epsilon; b[column] += epsilon;
    const ra = mixedResidual(g, oldMass, a, dt), rb = mixedResidual(g, oldMass, b, dt);
    for (let row = 0; row < heads.length; row++) {
      const analytic = jacobianEntry(g, e, dt, row, column);
      near((rb.residualKg[row] - ra.residualKg[row]) / (2 * epsilon), analytic,
        1e-5 * Math.max(1, Math.abs(analytic)), 'full nonsymmetric finite-difference Jacobian away from h=0');
    }
  }
  for (const face of g.faces) {
    near(face.areaM2, face.axis === 1 ? 1 : 0.54, 0, 'physical face square metres');
    near(face.leftDistanceM + face.rightDistanceM,
      (face.axis === 1 ? 0.54 : 1) * (face.boundary ? 0.5 : 1), 0, 'physical face resistance distance');
  }
  check(g.faces.some(f => f.axis === 0) && g.faces.some(f => f.axis === 1) && g.faces.some(f => f.axis === 2),
    'one connected graph includes all three directions');
  return { unknowns: g.nodes.length, faces: g.faces.length, chords: g.tree.chords.length, pivotWork: pivotFixture() };
});

group('line specialization versus the frozen accepted column owner', () => {
  const cases = [
    { name: 'line-hydrostatic', settings: { totalHeadM: -0.6, reservoirDepthsM: { top: 0, bottom: 1.56 } }, seconds: 600, dt: 60 },
    { name: 'line-top-exhaustion-lower-wetting', settings: { unsaturatedHeadM: 0,
      reservoirDepthsM: { top: 0.001, bottom: 0 } }, seconds: 60, dt: 1 },
    { name: 'line-lower-finite-supply', settings: { unsaturatedHeadM: -0.5,
      reservoirDepthsM: { top: 0, bottom: 0.001 } }, seconds: 300, dt: 1 }
  ];
  const comparisons = [];
  for (const c of cases) {
    const f = fixture(referenceColumnDescriptor(), c.settings);
    const column = createColumn({ cells: 4, lengthM: 2.16, areaM2: 1, pondAreaM2: 1,
      standpipeAreaM2: 1, groundM: 0 }, REFERENCE_SOIL);
    const cellIndices = f.g.nodes.map((n, i) => ({ n, i })).filter(x => x.n.kind === 'soil')
      .sort((a, b) => b.n.at[1] - a.n.at[1]).map(x => x.i);
    const top = f.g.nodes.findIndex(n => n.reservoirId === 'top'), bottom = f.g.nodes.findIndex(n => n.reservoirId === 'bottom');
    const mapping = [top, ...cellIndices, bottom];
    const old = column.initial({ waterMassKg: cellIndices.map(i => f.state.massKg[i]),
      pondMassKg: f.state.massKg[top], standpipeMassKg: f.state.massKg[bottom] });
    const actual = runFixture(f, c.seconds, c.dt, c.name);
    const reference = column.advance(old, c.seconds, { dtMaxS: c.dt });
    write(`${c.name}-column.json`, reference);
    const errorKg = maxAbs(mapping.map((i, k) => actual.state.massKg[i] - reference.state.massKg[k]));
    near(errorKg, 0, 2e-6, 'same metric/retention/boundary laws across graph and column algebra');
    if (c.name === 'line-top-exhaustion-lower-wetting') {
      check(actual.state.massKg[top] === 0 && actual.state.massKg[bottom] > 0,
        'real top exhaustion and initially dry single-port lower wetting');
    }
    if (c.name === 'line-lower-finite-supply') check(actual.state.massKg[bottom] < f.state.massKg[bottom],
      'finite lower supply actually leaves its source; exhaustion is recorded, not presumed');
    comparisons.push({ name: c.name, errorKg, topKg: actual.state.massKg[top], bottomKg: actual.state.massKg[bottom],
      graphWork: actual.work, columnWork: reference.work });
  }
  return { comparisons };
});

group('true signed 3D hydrostatic water table and ponded rest', () => {
  const cases = [];
  for (const totalHeadM of [-0.6, 0.1]) {
    const d = hydrostaticVolumeDescriptor();
    if (totalHeadM > 0) {
      d.reservoirs.push({ id: 'top', areaM2: 4 });
      for (const x of [-1, 0]) for (const z of [4, 5]) d.ports.push({ cell: [x, -1, z], side: 'y+', reservoirId: 'top' });
    }
    const f = fixture(d, { totalHeadM, reservoirDepthsM: { lower: totalHeadM + 1.62, top: totalHeadM } });
    const result = runFixture(f, 3600, 120, totalHeadM < 0 ? '3d-water-table' : '3d-ponded-rest');
    near(maxAbs(result.state.massKg.map((m, i) => m - f.state.massKg[i])), 0, 2e-8, '3D hydrostatic stock rest');
    near(maxAbs(result.receipt.faceTransferKg), 0, 2e-8, 'x/y/z hydrostatic face rest');
    check(f.g.tree.chords.length > 0, 'rest fixture is not a chain of isolated columns');
    cases.push({ totalHeadM, unknowns: f.g.nodes.length, faces: f.g.faces.length,
      chordFaces: f.g.tree.chords.length, work: result.work, maxima: result.receipt.maxAbsMetrics });
  }
  return { cases };
});

function pathSettings(g, sourceHeadM, sinkHeadM) {
  return { totalHeadM: (sourceHeadM + sinkHeadM) / 2,
    reservoirDepthsM: Object.fromEntries(g.nodes.filter(n => n.kind === 'reservoir').map(n =>
      [n.reservoirId, (n.reservoirId === 'low-face' ? sourceHeadM : sinkHeadM) - elevation(n)])) };
}

function conductanceCase(axis, parallelPaths, lowK) {
  const d = saturatedPathDescriptor({ axis, parallelPaths, lowK }), g = createVolumeGeometry(d);
  const f = fixture(d, pathSettings(g, 4.2, 3.8));
  const source = g.nodes.findIndex(n => n.reservoirId === 'low-face'), sink = g.nodes.findIndex(n => n.reservoirId === 'high-face');
  // Independent series resistance: each of the three cells contributes its
  // complete axis width; boundary half-distances restore the two end halves.
  const widthM = axis === 'y' ? 0.54 : 1, areaM2 = axis === 'y' ? 1 : 0.54;
  const resistance = widthM / areaM2 * (2 / 1e-4 + 1 / (lowK ? 1e-6 : 1e-4));
  const conductanceM2S = parallelPaths / resistance, lambdaPerS = 2 * conductanceM2S;
  const results = [];
  for (const dt of [60, 30, 15]) {
    const result = runFixture(f, 600, dt, `conductance-${axis}-${parallelPaths}-${lowK ? 'layer' : 'uniform'}-dt${dt}`);
    const H = i => result.state.massKg[i] / 1000 + elevation(g.nodes[i]);
    const differenceM = H(source) - H(sink), multiplier = 1 / (1 + lambdaPerS * dt);
    const beDifferenceM = 0.4 * multiplier ** (600 / dt), continuousM = 0.4 * Math.exp(-lambdaPerS * 600);
    near(differenceM, beDifferenceM, 2e-10, 'independent finite-reservoir BE resistance law');
    near(H(source) + H(sink), 8, 2e-11, 'shared reservoir head sum without duplicated stock');
    check(result.state.massKg.every((m, i) => g.nodes[i].kind !== 'soil' || m === g.nodes[i].maxMassKg),
      'saturated path retains exact finite pore capacity');
    check(result.receipt.steps.every(step => step.metrics.boundaries.every(b => b.massKg > 0)),
      'series/parallel reservoirs stay strictly wet');
    if (parallelPaths === 2) check(g.tree.chords.some(k => result.receipt.steps.some(step =>
      Math.abs(step.ledger.darcyTransferKg[k]) > 1e-6)), 'cyclic moving case preserves a nonzero Darcy chord');
    results.push({ dtS: dt, differenceM, beDifferenceM, continuousM,
      continuousErrorM: Math.abs(differenceM - continuousM), work: result.work,
      maxima: result.receipt.maxAbsMetrics });
  }
  check(results[1].continuousErrorM < 0.75 * results[0].continuousErrorM &&
    results[2].continuousErrorM < 0.75 * results[1].continuousErrorM, 'finite-time refinement toward independent exponential');
  return { axis, parallelPaths, lowK, resistanceSPerM2: resistance, conductanceM2S, lambdaPerS, results };
}

group('independent all-axis series/parallel low-K conductance and finite source/sink flow', () => {
  const cases = [];
  for (const axis of ['x', 'y', 'z']) for (const parallelPaths of [1, 2]) cases.push(conductanceCase(axis, parallelPaths, true));
  cases.push(conductanceCase('x', 1, false));
  for (const axis of ['x', 'y', 'z']) {
    const one = cases.find(c => c.axis === axis && c.parallelPaths === 1);
    const two = cases.find(c => c.axis === axis && c.parallelPaths === 2);
    near(two.conductanceM2S, 2 * one.conductanceM2S, 0, 'parallel area doubles conductance, not reservoir mass');
  }
  const gx = cases.find(c => c.axis === 'x' && c.parallelPaths === 1).conductanceM2S;
  const gy = cases.find(c => c.axis === 'y' && c.parallelPaths === 1).conductanceM2S;
  near(gy / gx, 1 / (0.54 * 0.54), 1e-14, 'actual voxel aspect-ratio conductance');
  return { cases };
});

group('lateral initially dry single-port reservoir receives finite stock', () => {
  const d = saturatedPathDescriptor({ axis: 'x', parallelPaths: 1, lowK: false });
  const f = fixture(d, { unsaturatedHeadM: 0, reservoirDepthsM: { 'low-face': 0.05, 'high-face': 0 } });
  const result = runFixture(f, 60, 1, 'lateral-dry-sink');
  const source = f.g.nodes.findIndex(n => n.reservoirId === 'low-face'), sink = f.g.nodes.findIndex(n => n.reservoirId === 'high-face');
  check(result.state.massKg[source] < f.state.massKg[source] && result.state.massKg[sink] > 0,
    'actual finite lateral source loss and dry sink wetting');
  near(result.state.massKg[source] + result.state.massKg[sink], 50, 2e-9, 'lateral source/sink stock without saturation storage');
  return { sourceKg: result.state.massKg[source], sinkKg: result.state.massKg[sink],
    work: result.work, maxima: result.receipt.maxAbsMetrics };
});

function expectRejectedUnchanged(input, action, label) {
  const before = JSON.stringify(input); let caught;
  try { action(); } catch (error) { caught = error; }
  check(caught instanceof Error, label); check(JSON.stringify(input) === before, `${label}: unchanged input`);
  return { label, name: caught.name, message: caught.message, partial: caught.partial ?? null };
}

group('canonical insertion independence, actual file restart and bounded atomic rejection', () => {
  const d = saturatedPathDescriptor({ axis: 'x', parallelPaths: 2, lowK: true }), g = createVolumeGeometry(d);
  const f = fixture(d, pathSettings(g, 4.2, 3.8));
  const reordered = structuredClone(d);
  for (const key of ['cells', 'reservoirs', 'definitions', 'ports', 'closedFaces']) reordered[key].reverse();
  const other = createVolume(reordered);
  check(other.identity === f.owner.identity, 'canonical descriptor independent of insertion');
  const stocks = f.g.nodes.map((n, i) => ({ nodeId: n.id, massKg: f.state.massKg[i] })).reverse();
  const otherState = other.initial({ stocks });
  check(other.encode(otherState) === f.owner.encode(f.state), 'explicit stock order independent');
  const once = runFixture(f, 120, 10, 'restart-unsplit');
  const first = f.owner.advance(f.state, 60, { dtMaxS: 10 }); write('restart-first.json', first);
  fs.writeFileSync(path.join(output, 'soil-volume-save.json'), f.owner.encode(first.state));
  const fresh = createVolume(reordered), loaded = fresh.decode(fs.readFileSync(path.join(output, 'soil-volume-save.json'), 'utf8'));
  const continued = fresh.advance(loaded, 60, { dtMaxS: 10 }); write('restart-continued.json', continued);
  check(fresh.encode(continued.state) === f.owner.encode(once.state), 'exact aligned canonical fresh-owner file restart');
  const permutedResult = other.advance(otherState, 120, { dtMaxS: 10 });
  check(JSON.stringify(permutedResult) === JSON.stringify(once), 'all outputs and counted work independent of insertion');
  const beforeMutation = other.identity; reordered.cells[0].at[0] += 10; reordered.definitions[0].ksMPerS /= 2;
  check(other.identity === beforeMutation && other.encode(otherState) === f.owner.encode(f.state), 'owned immutable definition/geometry lifetime');
  const badDry = structuredClone(f.state), reservoir = f.g.nodes.findIndex(n => n.kind === 'reservoir');
  badDry.initialTotalKg -= badDry.massKg[reservoir]; badDry.massKg[reservoir] = 0;
  const over = structuredClone(f.state); over.massKg[0] += 1; over.initialTotalKg += 1;
  const wrong = structuredClone(f.state); wrong.identity += 'changed';
  const rejects = [
    expectRejectedUnchanged(badDry, () => f.owner.read(badDry), 'dry multi-port suction manifold rejected'),
    expectRejectedUnchanged(over, () => f.owner.read(over), 'no overfilled geometric pores'),
    expectRejectedUnchanged(wrong, () => f.owner.read(wrong), 'wrong geometry/definition identity'),
    expectRejectedUnchanged(f.state, () => f.owner.advance(f.state, 120, { dtMaxS: 10, maxSteps: 1 }), 'step admission budget'),
    expectRejectedUnchanged(f.state, () => f.owner.advance(f.state, 10, { dtMaxS: 10, maxEvaluations: 1 }), 'actual evaluation budget'),
    expectRejectedUnchanged(f.state, () => f.owner.advance(f.state, 10, { dtMaxS: 10, maxMatrixUpdates: 1 }), 'actual dense update budget'),
    expectRejectedUnchanged(f.state, () => f.owner.advance(f.state, 10, { imaginaryOption: 1 }), 'unknown option')
  ];
  const partial = expectRejectedUnchanged(f.state, () => f.owner.advance(f.state, 20,
    { dtMaxS: 10, maxEvaluations: 3 }), 'whole request rejected after one local accepted step');
  check(partial.partial?.committed === false && partial.partial.receipt.steps.length === 1 &&
    partial.partial.lastLocalState.timeS === 10, 'failed whole request retains evidence but commits no partial state');
  rejects.push(partial);
  const sealed = structuredClone(referenceColumnDescriptor()); sealed.reservoirs = []; sealed.ports = [];
  const sealedGeometry = createVolumeGeometry(sealed), sealedOwner = createVolume(sealed);
  const sealedStocks = { stocks: sealedGeometry.nodes.map(n => ({ nodeId: n.id, massKg: n.maxMassKg })) };
  rejects.push(expectRejectedUnchanged(sealedStocks, () => sealedOwner.initial(sealedStocks), 'unanchored saturated sealed geometry'));
  const disconnected = structuredClone(sealed); disconnected.cells[0].at[0] = 10;
  rejects.push(expectRejectedUnchanged(disconnected, () => createVolume(disconnected), 'disconnected pressure graph'));
  const port = structuredClone(d); port.ports[0].cell = [200, 0, 0];
  rejects.push(expectRejectedUnchanged(port, () => createVolume(port), 'unknown reservoir port cell'));
  const sparse = structuredClone(d); sparse.spacingM = Array(3);
  rejects.push(expectRejectedUnchanged(sparse, () => createVolume(sparse), 'sparse metric array'));
  write('rejections.json', rejects);
  return { rejects: rejects.map(({ label, name, message }) => ({ label, name, message })),
    restartHash: createHash('sha256').update(f.owner.encode(once.state)).digest('hex') };
});

write('proof.json', { status: 'passed', groups: results.length, checks, results, inventory,
  elapsedMs: performance.now() - start, cpuMicros: process.cpuUsage(cpu), rssBytes: process.memoryUsage().rss,
  timingScope: 'qualifier wall and whole-process CPU delta after module loading and source pinning; includes fixtures, file receipts and frozen-column comparisons; not a controlled benchmark',
  scope: 'bounded connected rigid-pore constant-density Richards graph in actual voxel metric; no excavation, gas/free-water join or large-world scaling claim' });
process.stdout.write(JSON.stringify({ status: 'passed', groups: results.length, checks, elapsedMs: performance.now() - start }) + '\n');
