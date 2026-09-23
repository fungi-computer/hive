import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createStepper } from './candidate.mjs';
import { SI_UNITS } from './admission.mjs';
import { steppedDiversion, dynamicChannel } from './fixtures.mjs';
import { step, makeFixture, restore, serialize, edit, stableDt } from './reference/solver.mjs';

const stamp = process.argv[2] ?? new Date().toISOString().replaceAll(':', '-');
const dir = new URL(`runs/${stamp}-boundary/`, import.meta.url);
mkdirSync(dir, { recursive: true });
const hashes = {};
for (const name of ['candidate.mjs', 'admission.mjs', 'boundary-proof.mjs', 'fixtures.mjs', 'BOUNDARY-PREDECLARED.md']) {
  const bytes = readFileSync(new URL(name, import.meta.url));
  hashes[name] = createHash('sha256').update(bytes).digest('hex'); writeFileSync(new URL(name, dir), bytes);
}
const referencePath = new URL('runs/wet-receipts-wet-receipts/wet-diversion-edited-32.json', import.meta.url);
const referenceBytes = readFileSync(referencePath);
hashes.wetReference = createHash('sha256').update(referenceBytes).digest('hex');
const wet = JSON.parse(referenceBytes).final;
const outcomes = [];
const save = (name, data) => writeFileSync(new URL(name, dir), JSON.stringify(data, null, 2) + '\n');
function experiment(name, fn) {
  const start = performance.now();
  try { const result = { name, status: 'passed', elapsedMs: 0, ...fn() }; result.elapsedMs = performance.now() - start; outcomes.push(result); save(`${name}.json`, result); console.log(JSON.stringify({ ...result, final: undefined })); }
  catch (error) { const result = { name, status: 'failed', elapsedMs: performance.now() - start, error: error.stack }; outcomes.push(result); save(`${name}.json`, result); console.log(JSON.stringify(result)); }
}
const clone = x => JSON.parse(JSON.stringify(x));
const stateBytes = x => JSON.stringify(x);
function sameArray(a, b, label) {
  assert.equal(a.length, b.length, `${label}.length`);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) throw Error(`${label}[${i}]: ${a[i]} != ${b[i]}`);
}
function sameResult(expected, actual) {
  for (const key of ['V', 'q', 'mx', 'my']) sameArray(expected.state[key], actual.state[key], key);
  sameArray(expected.exchanges, actual.exchanges, 'exchanges'); sameArray(expected.withdrawals, actual.withdrawals, 'withdrawals');
  assert.deepEqual(actual.interval, expected.interval); assert.deepEqual(actual.diagnostics, expected.diagnostics);
  for (const key of ['time', 'stepCount', 'collected', 'initialVolume']) assert.equal(actual.state[key], expected.state[key], key);
}

experiment('corrupt-admission', () => {
  const base = serialize(steppedDiversion()), cases = [
    ['reordered-face-array', s => { [s.geom.faces[0], s.geom.faces[1]] = [s.geom.faces[1], s.geom.faces[0]]; }],
    ['duplicate-face-id', s => { s.geom.faces[1].id = 0; }],
    ['wrong-endpoint', s => { s.geom.faces[1].a = 2; }],
    ['wrong-axis', s => { s.geom.faces[1].axis = 1; }],
    ['wrong-stencil', s => { s.geom.faces[1].collinear[0] = -1; }],
    ['wrong-lookup', s => { s.geom.xids[1] = 0; }],
    ['open-outer-wall', s => { s.geom.faces[0].open = true; }],
    ['negative-spacing', s => { s.geom.dx = -2; }],
    ['mismatched-area', s => { s.geom.area = 3; }],
    ['mismatched-length', s => { s.geom.length = 65; }],
    ['bad-grid-size', s => { s.geom.n = 31; }],
    ['fractional-revision', s => { s.geom.revision = .5; }],
    ['unknown-revision', s => { s.geom.revision = 7; }],
    ['bed-nan', s => { s.geom.z[0] = NaN; }],
    ['bad-solid-bit', s => { s.geom.solid[0] = 2; }],
    ['unknown-region', s => { s.geom.region[0] = 8; }],
    ['negative-volume', s => { s.V[0] = -1; }],
    ['infinite-volume', s => { s.V[0] = Infinity; }],
    ['infinite-momentum', s => { s.mx[0] = Infinity; }],
    ['dry-momentum', s => { s.mx[0] = 1; }],
    ['solid-volume', s => { s.V[0] = 1; s.initialVolume++; }],
    ['short-history', s => { s.mx.pop(); }],
    ['nonfinite-discharge', s => { s.q[0] = NaN; }],
    ['closed-face-discharge', s => { s.q[0] = 1; }],
    ['wrong-stock-ledger', s => { s.initialVolume++; }],
    ['clock-step-mismatch', s => { s.time = 1; }],
    ['negative-clock', s => { s.time = -1; }],
    ['wrong-gate-history', s => { s.events.gate = true; s.geom.revision = 1; }],
    ['unknown-field', s => { s.units = 'feet'; }],
  ];
  for (const [name, corrupt] of cases) {
    const bad = clone(base); corrupt(bad);
    assert.throws(() => createStepper(bad), undefined, name);
  }
  assert.throws(() => createStepper(base, { units: { ...SI_UNITS, length: 'ft' } }), /units/);
  assert.throws(() => createStepper(base, { active: 'yes' }), /active/);
  assert.throws(() => createStepper(base, { unitScale: .54 }), /options/);
  return { rejectedStates: cases.map(([name]) => name), rejectedOptions: 3 };
});

experiment('private-input-borrowed-view-and-retained-checkpoint', () => {
  const input = clone(wet), solver = createStepper(input), before = stateBytes(solver.checkpoint());
  const publicState = solver.state, retained = solver.checkpoint(), sibling = solver.checkpoint();
  input.V.fill(0); input.mx.fill(0); input.geom.z[0] = 999; input.geom.faces[0].collinear[0] = 999; input.events.gate = false;
  retained.V.fill(0); retained.q.fill(99); retained.mx.fill(99); retained.my.fill(99);
  retained.geom.z[0] = 999; retained.geom.solid[0] = 0; retained.geom.faces[0].transverse[0] = 999;
  retained.geom.xids[0] = 999; retained.events.gate = false;
  assert.equal(stateBytes(solver.checkpoint()), before); assert.equal(stateBytes(sibling), before);
  for (const mutate of [() => { publicState.V[0] = 1; }, () => { publicState.mx[0] = 1; },
    () => { publicState.geom.z[0] = 1; }, () => { publicState.geom.faces[0].collinear[0] = 1; },
    () => { publicState.events.gate = false; }, () => { publicState.time = -1; }]) assert.throws(mutate, TypeError);
  assert.equal(publicState.V.buffer, undefined); assert.equal(publicState.V.set, undefined);
  assert.equal(Object.getPrototypeOf(publicState.V), null);
  publicState.V.reduce((sum, value, index, view) => { assert.equal(view, publicState.V); return sum + value; }, 0);
  const result = solver.step(.025, { withdrawRate: .06 });
  assert.throws(() => { result.exchanges[0] = 7; }, TypeError);
  assert.throws(() => { result.withdrawals[0] = 7; }, TypeError);
  assert.throws(() => { result.interval.end = -1; }, TypeError);
  const held = solver.checkpoint(), heldBytes = stateBytes(held);
  for (let i = 0; i < 4; i++) solver.step(.025, { withdrawRate: .06 });
  assert.equal(stateBytes(held), heldBytes); assert.equal(stateBytes(sibling), before);
  return { inputIndependent: true, checkpointGeometryAndHistoryIndependent: true, viewsReadOnly: true, retainedAcrossLaterSteps: true };
});

experiment('replacement-is-not-arbitrary-geometry-edit', () => {
  const solver = createStepper(wet), before = stateBytes(solver.checkpoint());
  for (const [name, change] of [
    ['same-shaped-bed', s => { s.geom.z[0] += .54; }],
    ['same-shaped-units', s => { s.geom.length *= 2; s.geom.dx *= 2; s.geom.area *= 4; }],
    ['solver-roughness', s => { s.roughness += .01; }],
    ['new-initial-supply', s => { const i = s.V.findIndex(v => v > 0); s.V[i]++; s.initialVolume++; }],
    ['reordered-faces', s => { s.geom.faces.reverse(); }],
  ]) {
    const bad = solver.checkpoint(); change(bad); assert.throws(() => solver.replace(bad), undefined, name);
    assert.equal(stateBytes(solver.checkpoint()), before);
  }
  const retained = solver.checkpoint(); solver.step(.025, { withdrawRate: .06 }); solver.replace(retained);
  assert.equal(stateBytes(solver.checkpoint()), before);
  retained.geom.z[0] = 999; retained.mx.fill(0); assert.equal(stateBytes(solver.checkpoint()), before);
  return { invalidReplacementAtomic: true, sameGeometryCheckpointRestoreExact: true };
});

experiment('owned-supported-edits', () => {
  let reference = steppedDiversion(); const solver = createStepper(reference);
  const externallyEdited = edit(reference, 'gate-open');
  assert.throws(() => solver.replace(externallyEdited), /exact geometry/);
  for (const kind of ['gate-open', 'dig-pond']) {
    const before = Array.from(solver.state.V);
    reference = edit(reference, kind); solver.edit(kind);
    assert.equal(stateBytes(solver.checkpoint()), stateBytes(serialize(reference)));
    sameArray(before, solver.state.V, 'edit preserves volumes');
    const applied = stateBytes(solver.checkpoint()); solver.edit(kind);
    assert.equal(stateBytes(solver.checkpoint()), applied, 'repeat edit no-op');
    const dt = solver.stableDt(.025); assert.equal(dt, stableDt(reference, .025));
    const expected = step(reference, dt, { withdrawRate: .06 });
    sameResult(expected, solver.step(dt, { withdrawRate: .06 })); reference = expected.state;
  }
  const before = stateBytes(solver.checkpoint());
  assert.throws(() => solver.edit('raise-bed'), /unsupported/);
  assert.equal(stateBytes(solver.checkpoint()), before);
  assert.throws(() => createStepper(dynamicChannel(16)).edit('dig-pond'), /unsupported/);
  return { exactReferenceEdits: true, everyVolumePreserved: true, repeatedEditsIdempotent: true, arbitraryEditsRejected: true };
});

experiment('wet-reference-continuation-and-history', () => {
  let reference = restore(clone(wet)); const solver = createStepper(reference); let restarted;
  let collectedBefore = reference.collected;
  for (let k = 0; k < 100; k++) {
    if (k === 50) restarted = createStepper(JSON.parse(stateBytes(solver.checkpoint())));
    const dt = solver.stableDt(.05);
    assert.equal(dt, stableDt(reference, .05));
    if (restarted) assert.equal(restarted.stableDt(.05), dt);
    const expected = step(reference, dt, { withdrawRate: .06 });
    sameResult(expected, solver.step(dt, { withdrawRate: .06 }));
    if (restarted) sameResult(expected, restarted.step(dt, { withdrawRate: .06 }));
    reference = expected.state;
  }
  assert.equal(stateBytes(solver.checkpoint()), stateBytes(serialize(reference)));
  assert.equal(stateBytes(restarted.checkpoint()), stateBytes(serialize(reference)));
  assert.ok(reference.collected > collectedBefore);
  const original = createStepper(wet), noQ = clone(wet), noMomentum = clone(wet);
  noQ.q.fill(0); noMomentum.mx.fill(0); noMomentum.my.fill(0);
  const reportDiscarded = createStepper(noQ), historyDiscarded = createStepper(noMomentum);
  original.step(.05); reportDiscarded.step(.05); historyDiscarded.step(.05);
  assert.equal(stateBytes(original.checkpoint()), stateBytes(reportDiscarded.checkpoint()));
  let lostHistoryL1 = 0;
  for (let i = 0; i < wet.V.length; i++) lostHistoryL1 += Math.abs(original.state.V[i] - historyDiscarded.state.V[i]);
  assert.ok(lostHistoryL1 > 1e-6);
  return { intervals: 100, completeStateReceiptsDiagnosticsExact: true, restartExact: true,
    ownerSelectedIntervalsMatchReference: true, withdrawnDuringContinuation: reference.collected - collectedBefore, qDiscardHasNoEffect: true, lostHistoryL1, final: solver.checkpoint() };
});

experiment('rejection-retry-and-step-allocation', () => {
  const initial = makeFixture({ n: 16, length: 16, fixture: 'dam', model: 'swe', roughness: 0 });
  const solver = createStepper(initial), before = stateBytes(solver.checkpoint());
  for (const invoke of [() => solver.step(100), () => solver.step(NaN), () => solver.step(.025, { withdrawRate: NaN }),
    () => solver.step(.025, { faceOrder: [0] })]) {
    assert.throws(invoke); assert.equal(stateBytes(solver.checkpoint()), before);
  }
  for (const maxDt of [0, -1, NaN, Infinity, '0.025']) assert.throws(() => solver.stableDt(maxDt), /maximum dt/);
  const originals = new Map(); let count = 0, bytes = 0;
  for (const key of ['Float64Array', 'Float32Array', 'Int32Array', 'Uint32Array', 'Uint8Array']) {
    const Type = globalThis[key]; originals.set(key, Type);
    globalThis[key] = new Proxy(Type, { construct(target, args) { const a = Reflect.construct(target, args); count++; bytes += a.byteLength; return a; } });
  }
  let actual;
  try { actual = solver.step(solver.stableDt(.025)); } finally { for (const [key, Type] of originals) globalThis[key] = Type; }
  assert.equal(count, 0); assert.equal(bytes, 0); sameResult(step(initial, .025), actual);
  return { rejectedCalls: 4, rejectedStabilityCeilings: 5, canonicalStateUnchanged: true, exactRetry: true, typedArraysDuringStabilityAndStep: count, typedBytesDuringStabilityAndStep: bytes };
});

save('manifest.json', { stamp, hashes, node: process.version, outcomes: outcomes.map(({ final, ...result }) => result) });
if (outcomes.some(o => o.status !== 'passed')) process.exitCode = 1;
console.log(`Saved ${dir.pathname}`);
