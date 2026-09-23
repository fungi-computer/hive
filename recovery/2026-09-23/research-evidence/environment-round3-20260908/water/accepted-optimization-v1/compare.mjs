import { makeFixture, step, stableDt, serialize, restore, edit, metrics, G } from './reference/solver.mjs';
import { createStepper } from './candidate.mjs';
import { steppedDiversion, steppedRest, dynamicChannel, fullyWet } from './fixtures.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';

const suite = process.argv[2] ?? 'qualification';
const stamp = process.argv[3] ?? new Date().toISOString().replaceAll(':', '-');
const dir = new URL(`runs/${stamp}-${suite}/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const hashes = {};
for (const name of ['candidate.mjs', 'fixtures.mjs', 'compare.mjs', 'PREDECLARED.md']) {
  const bytes = readFileSync(new URL(name, import.meta.url));
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(new URL(name, dir), bytes);
}
hashes.reference = createHash('sha256').update(readFileSync(new URL('./reference/solver.mjs', import.meta.url))).digest('hex');
const outcomes = [];
function save(name, data) { writeFileSync(new URL(name, dir), JSON.stringify(data, null, 2) + '\n'); }
function experiment(name, fn) {
  const start = performance.now();
  try {
    const data = fn();
    const result = { name, status: 'passed', elapsedMs: performance.now() - start, ...data };
    outcomes.push(result); save(`${name}.json`, result);
    console.log(JSON.stringify({ ...result, final: undefined, initial: undefined }));
  } catch (error) {
    const result = { name, status: 'failed', error: error.stack, elapsedMs: performance.now() - start };
    outcomes.push(result); save(`${name}.json`, result); console.log(JSON.stringify(result));
  }
}
function sameArray(a, b, label) {
  assert.equal(a.length, b.length, `${label}.length`);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Number.isFinite(a[i]) && Number.isFinite(b[i]), `${label}[${i}] finite`);
    if (a[i] !== b[i]) throw Error(`${label}[${i}]: ${a[i]} != ${b[i]}`);
  }
}
function sameState(a, b, label) {
  for (const field of ['V', 'q', 'mx', 'my']) sameArray(a[field], b[field], `${label}.${field}`);
  for (const field of ['time', 'stepCount', 'collected', 'initialVolume', 'model', 'roughness']) assert.equal(a[field], b[field], `${label}.${field}`);
  assert.deepEqual(a.events, b.events);
  assert.equal(a.geom.revision, b.geom.revision);
}
function sameResult(a, b, label) {
  sameState(a.state, b.state, label);
  sameArray(a.exchanges, b.exchanges, `${label}.exchanges`);
  sameArray(a.withdrawals, b.withdrawals, `${label}.withdrawals`);
  assert.deepEqual(a.interval, b.interval, `${label}.interval`);
  assert.deepEqual(a.diagnostics, b.diagnostics, `${label}.diagnostics`);
}
function compare(initial, { end = 8, maxDt = .05, edits = false, withdrawRate = 0, gateAt = 2, digAt = 5 } = {}) {
  let reference = restore(serialize(initial));
  const dense = createStepper(initial, { active: false }), active = createStepper(initial);
  let resumed = null, restartAt = end / 2, snapshot = null, steps = 0, maxBalance = 0, minDepth = Infinity;
  let gateBeforeOpen = 0, maxWithdrawn = 0, wetEdit = null, historyLossDifference = null;
  while (reference.time < end - 1e-10) {
    if (edits && !reference.events.gate && reference.time >= gateAt - 1e-10) {
      reference = edit(reference, 'gate-open'); dense.replace(edit(dense.state, 'gate-open')); active.replace(edit(active.state, 'gate-open'));
      if (resumed) resumed.replace(edit(resumed.state, 'gate-open'));
    }
    if (edits && !reference.events.dig && reference.time >= digAt - 1e-10) {
      const before = reference;
      reference = edit(reference, 'dig-pond'); dense.replace(edit(dense.state, 'dig-pond')); active.replace(edit(active.state, 'dig-pond'));
      if (resumed) resumed.replace(edit(resumed.state, 'dig-pond'));
      sameArray(before.V, reference.V, 'edit-preserves-every-cell-volume');
      wetEdit = { time: before.time, pondBefore: metrics(before).pond, pondAfter: metrics(reference).pond, everyCellVolumePreserved: true };
    }
    if (!resumed && reference.time >= restartAt - 1e-10) {
      snapshot = JSON.stringify(active.checkpoint());
      resumed = createStepper(restore(JSON.parse(snapshot)));
      assert.equal(JSON.stringify(resumed.checkpoint()), snapshot);
      const original = restore(JSON.parse(snapshot)), noMomentum = restore(JSON.parse(snapshot));
      noMomentum.mx.fill(0); noMomentum.my.fill(0);
      const probeDt = Math.min(stableDt(original, maxDt), stableDt(noMomentum, maxDt));
      const a = step(original, probeDt).state, b = step(noMomentum, probeDt).state;
      historyLossDifference = 0;
      for (let i = 0; i < a.V.length; i++) historyLossDifference += Math.abs(a.V[i] - b.V[i]);
    }
    let dt = Math.min(stableDt(reference, maxDt), end - reference.time);
    if (!resumed) dt = Math.min(dt, restartAt - reference.time);
    if (edits && !reference.events.gate) dt = Math.min(dt, gateAt - reference.time);
    if (edits && !reference.events.dig) dt = Math.min(dt, digAt - reference.time);
    const expected = step(reference, dt, { withdrawRate });
    const da = dense.step(dt, { withdrawRate }), aa = active.step(dt, { withdrawRate });
    sameResult(expected, da, `step${steps}.dense`); sameResult(expected, aa, `step${steps}.active`);
    if (resumed) sameResult(expected, resumed.step(dt, { withdrawRate }), `step${steps}.restart`);
    if (!reference.events.gate) for (const f of reference.geom.faces) if (f.gate) gateBeforeOpen += Math.abs(aa.exchanges[f.id]);
    reference = expected.state; steps++;
    for (const value of aa.withdrawals) maxWithdrawn = Math.max(maxWithdrawn, value);
    maxBalance = Math.max(maxBalance, Math.abs(metrics(reference).balanceError));
    minDepth = Math.min(minDepth, expected.diagnostics.minDepth);
    if (steps > 5000) throw Error('bounded checkpoint step quota exceeded');
  }
  assert.ok(maxBalance <= Math.max(1, initial.initialVolume) * 1e-10);
  assert.ok(minDepth >= -1e-12);
  assert.equal(gateBeforeOpen, 0);
  assert.equal(JSON.stringify(active.checkpoint()), JSON.stringify(serialize(reference)));
  assert.equal(JSON.stringify(resumed.checkpoint()), JSON.stringify(serialize(reference)));
  return { steps, maxBalance, minDepth, gateBeforeOpen, maxWithdrawn, wetEdit, historyLossDifference, final: serialize(reference), metrics: metrics(reference), dense: dense.stats(), active: active.stats(), restartExact: true, retainedSnapshotTime: JSON.parse(snapshot).time };
}

if (suite === 'qualification') {
  experiment('same-stepped-physical-geometry', () => {
    const coarse = steppedDiversion(32), fine = steppedDiversion(64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const a = Math.floor(y / 2) * 32 + Math.floor(x / 2), b = y * 64 + x;
      assert.equal(coarse.geom.z[a], fine.geom.z[b]);
      assert.equal(coarse.geom.solid[a], fine.geom.solid[b]);
      assert.equal(coarse.geom.region[a], fine.geom.region[b]);
      assert.ok(Math.abs(fine.geom.z[b] / .1 - Math.round(fine.geom.z[b] / .1)) < 1e-12);
    }
    return { cellsCompared: 4096, voxelHeightMetres: .1, coarseDx: 2, fineDx: 1 };
  });
  experiment('stepped-lake-rest', () => {
    const initial = steppedRest(), result = compare(initial);
    let depthDrift = 0, momentumDrift = 0;
    for (let i = 0; i < initial.V.length; i++) {
      depthDrift = Math.max(depthDrift, Math.abs(result.final.V[i] - initial.V[i]) / initial.geom.area);
      momentumDrift = Math.max(momentumDrift, Math.abs(result.final.mx[i]), Math.abs(result.final.my[i]));
    }
    assert.ok(depthDrift <= 1e-11 && momentumDrift <= 1e-11);
    return { ...result, depthDrift, momentumDrift };
  });
  for (const n of [32, 64]) experiment(`stepped-diversion-${n}`, () => compare(steppedDiversion(n), { edits: true, withdrawRate: .06 }));
  for (const n of [64, 128]) experiment(`dry-dam-${n}`, () => {
    const initial = makeFixture({ n, length: 32, fixture: 'dam', model: 'swe', roughness: 0 });
    const result = compare(initial, { end: 2, maxDt: .02 });
    const c = Math.sqrt(G), dx = initial.geom.dx;
    let error = 0, exactMass = 0;
    for (let x = 0; x < n; x++) {
      const xi = ((x + .5) * dx - 16) / 2;
      const exact = xi <= -c ? 1 : xi >= 2 * c ? 0 : (2 * c - xi) ** 2 / (9 * G);
      const actual = result.final.V[Math.floor(n / 2) * n + x] / initial.geom.area;
      error += Math.abs(actual - exact) * dx; exactMass += exact * dx;
    }
    const normalizedDepthL1 = error / exactMass;
    assert.ok(normalizedDepthL1 <= .08);
    return { ...result, normalizedDepthL1 };
  });
  experiment('rejected-step-retains-canonical-state', () => {
    const initial = makeFixture({ n: 16, length: 16, fixture: 'dam', model: 'swe', roughness: 0 });
    const candidate = createStepper(initial), before = JSON.stringify(candidate.checkpoint());
    assert.throws(() => candidate.step(100), /outgoing budget/);
    assert.equal(JSON.stringify(candidate.checkpoint()), before);
    const dt = stableDt(initial, .02);
    sameResult(step(initial, dt), candidate.step(dt), 'retry');
    return { unchangedAfterRejection: true, retryMatchesDense: true };
  });
} else if (suite === 'wet-receipts') {
  experiment('wet-diversion-edited-32', () => {
    const result = compare(steppedDiversion(32), { end: 120, edits: true, gateAt: 2, digAt: 40, withdrawRate: .06 });
    assert.ok(result.wetEdit.pondBefore > 1, 'dig must touch an actually wet pond');
    assert.ok(result.metrics.pond > 1 && result.metrics.collected > 1, 'pond and downstream demand must receive real water');
    assert.ok(result.maxWithdrawn > 0, 'nonzero withdrawal receipts');
    assert.ok(result.historyLossDifference > 1e-6, 'momentum loss must measurably change continuation');
    return result;
  });
  experiment('closed-diversion-32', () => {
    const result = compare(steppedDiversion(32), { end: 120, withdrawRate: .06 });
    assert.equal(result.metrics.pond, 0);
    assert.ok(result.metrics.collected > 1);
    return result;
  });
} else if (suite === 'timing') {
  const samples = 5, count = 160, n = 64, dt = .025;
  for (const [name, fixture] of [['dynamic-sparse-channel', dynamicChannel], ['fully-wet', fullyWet]]) experiment(name, () => {
    const initial = fixture(n), timings = { reference: [], workspace: [], active: [] }, records = {};
    // Warm all variants on a small fixed batch. Rotate measured order each pass.
    for (let trial = -1; trial < samples; trial++) {
      const order = ['reference', 'workspace', 'active'];
      if (trial >= 0) for (let k = 0; k < trial % 3; k++) order.push(order.shift());
      for (const method of order) {
        let state = restore(serialize(initial));
        const solver = method === 'reference' ? null : createStepper(initial, { active: method === 'active' });
        const start = performance.now();
        for (let k = 0; k < (trial < 0 ? 40 : count); k++) {
          if (solver) solver.step(dt); else state = step(state, dt).state;
        }
        const elapsed = performance.now() - start;
        if (trial >= 0) timings[method].push(elapsed);
        records[method] = solver ? solver.checkpoint() : serialize(state);
        if (solver) records[`${method}Stats`] = solver.stats();
      }
      for (const method of ['workspace', 'active']) assert.equal(JSON.stringify(records[method]), JSON.stringify(records.reference));
    }
    const distribution = values => {
      const sorted = [...values].sort((a, b) => a - b);
      return { samplesMs: values, p50Ms: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
    };
    const summarized = Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, distribution(v)]));
    const E = initial.geom.faces.length, N = initial.V.length;
    const faceRatio = records.activeStats.faceEvaluations / (E * count);
    const elapsedRatio = summarized.active.p50Ms / summarized.reference.p50Ms;
    const targetPass = name === 'fully-wet' ? elapsedRatio <= 1.1 : faceRatio <= .5;
    return { n, cells: N, faces: E, steps: count, simulatedSeconds: count * dt, finalExact: true,
      initialWetFraction: Array.from(initial.V).filter(v => v > 0).length / N,
      timings: summarized, faceRatio, elapsedRatio, targetPass,
      referenceTypedArrayAllocationPerStep: { arrays: 15, bytes: (8 * N + 7 * E) * 8 },
      active: records.activeStats, workspace: records.workspaceStats,
      processMemory: process.memoryUsage(), processPeakRssKiB: process.resourceUsage().maxRSS };
  });
} else throw Error(`unknown suite ${suite}`);

save('manifest.json', { suite, stamp, hashes, node: process.version, platform: process.platform, arch: process.arch,
  timestamp: new Date().toISOString(), outcomes: outcomes.map(({ final, ...rest }) => rest) });
console.log(`Saved ${dir.pathname}`);
if (outcomes.some(o => o.status !== 'passed' || o.targetPass === false)) process.exitCode = 1;
