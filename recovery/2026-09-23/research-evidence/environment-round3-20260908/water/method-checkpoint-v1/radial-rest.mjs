import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { circleRectangleArea } from './circle-area.mjs';
import { createStepper } from './candidate.mjs';
import { makeFixture, step, restore, serialize, stableDt, sum } from './reference/solver.mjs';

const stamp = process.argv[2] ?? new Date().toISOString().replaceAll(':', '-');
const dir = new URL(`runs/${stamp}-radial-rest/`, import.meta.url); mkdirSync(dir, { recursive: true });
const hashes = {};
for (const name of ['candidate.mjs', 'admission.mjs', 'circle-area.mjs', 'radial-rest.mjs', 'RADIAL-REST-PREDECLARED.md']) {
  const b = readFileSync(new URL(name, import.meta.url)); hashes[name] = createHash('sha256').update(b).digest('hex'); writeFileSync(new URL(name, dir), b);
}
const outcomes = [];
const save = (name, x) => writeFileSync(new URL(name, dir), JSON.stringify(x, null, 2) + '\n');
function experiment(name, fn) {
  const start = performance.now();
  try {
    const r = { name, status: 'completed', ...fn(), elapsedMs: performance.now() - start }; outcomes.push(r); save(`${name}.json`, r);
    console.log(JSON.stringify({ ...r, final: undefined, fronts: r.fronts?.map(({ threshold, axisRadius, diagonalRadius, relativeAxisDiagonalBias, missingRays, multipleCrossingRays }) => ({ threshold, axisRadius, diagonalRadius, relativeAxisDiagonalBias, missingRays, multipleCrossingRays })) }));
  } catch (error) { const r = { name, status: 'harness-or-law-failed', elapsedMs: performance.now() - start, error: error.stack }; outcomes.push(r); save(`${name}.json`, r); console.log(JSON.stringify(r)); }
}
function fixture(n, kind, eta = null) {
  const s = makeFixture({ n, length: 32, fixture: 'blank', model: 'swe', roughness: 0 }), dx = s.geom.dx;
  s.geom.fixture = kind === 'radial' ? 'radial' : 'rest';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (kind === 'radial') s.V[i] = .27 * circleRectangleArea(x * dx - 16, (x + 1) * dx - 16, y * dx - 16, (y + 1) * dx - 16, 6);
    else { s.geom.z[i] = (x + .5) * dx < 16 ? 0 : .54; s.V[i] = Math.max(0, eta - s.geom.z[i]) * s.geom.area; }
  }
  s.initialVolume = sum(s.V); return s;
}
function advance(initial, ceiling) {
  const owner = createStepper(initial); let reference = restore(serialize(initial)), restarted = null;
  let steps = 0, minDepth = Infinity, largestCheckpointBalance = 0;
  while (owner.time < 2 - 1e-12) {
    if (!restarted && owner.time >= 1 - 1e-12) {
      const snapshot = owner.checkpoint();
      largestCheckpointBalance = Math.max(largestCheckpointBalance, Math.abs(sum(snapshot.V) + snapshot.collected - snapshot.initialVolume));
      restarted = createStepper(JSON.parse(JSON.stringify(snapshot)));
    }
    const bound = owner.stableDt(ceiling); assert.equal(bound, stableDt(reference, ceiling));
    const dt = Math.min(bound, 2 - owner.time, restarted ? Infinity : 1 - owner.time);
    const r = owner.step(dt); reference = step(reference, dt).state; if (restarted) restarted.step(dt);
    minDepth = Math.min(minDepth, r.diagnostics.minDepth); steps++;
    if (steps > 1000) throw Error('bounded interval quota');
  }
  const final = owner.checkpoint();
  for (const [label, expected] of [['dense', serialize(reference)], ['restart', restarted.checkpoint()]]) {
    if (JSON.stringify(final) !== JSON.stringify(expected)) {
      const file = `checkpoint-mismatch-${outcomes.length}-${label}.json`; save(file, { actual: final, expected });
      throw Error(`exact checkpoint mismatch; see ${file}`);
    }
  }
  largestCheckpointBalance = Math.max(largestCheckpointBalance, Math.abs(sum(final.V) + final.collected - final.initialVolume));
  assert.ok(largestCheckpointBalance <= Math.max(1, final.initialVolume) * 1e-10 && minDepth >= -1e-12);
  return { final, steps, minDepth, largestCheckpointBalance, exactDenseFinal: true, exactRestartFinal: true, ownerStabilityExact: true };
}
function sample(s, X, Y) {
  const { n, dx, area } = s.geom, gx = X / dx - .5, gy = Y / dx - .5;
  const x = Math.max(0, Math.min(n - 2, Math.floor(gx))), y = Math.max(0, Math.min(n - 2, Math.floor(gy)));
  const u = Math.max(0, Math.min(1, gx - x)), v = Math.max(0, Math.min(1, gy - y));
  return ((1 - u) * (1 - v) * s.V[y * n + x] + u * (1 - v) * s.V[y * n + x + 1] + (1 - u) * v * s.V[(y + 1) * n + x] + u * v * s.V[(y + 1) * n + x + 1]) / area;
}
function fronts(s, threshold) {
  const rays = [], missingRays = [], multipleCrossingRays = [];
  for (let k = 0; k < 64; k++) {
    const angle = 2 * Math.PI * k / 64, c = Math.cos(angle), q = Math.sin(angle), stride = s.geom.dx / 16;
    const value = r => sample(s, 16 + r * c, 16 + r * q) - threshold;
    let previousRadius = 0, previous = value(0); const crossings = [];
    for (let r = stride; r <= 15 + 1e-12; r += stride) {
      const current = value(r);
      if ((previous >= 0) !== (current >= 0)) {
        let lo = previousRadius, hi = r, loAbove = previous >= 0;
        for (let j = 0; j < 40; j++) { const mid = (lo + hi) / 2; if ((value(mid) >= 0) === loAbove) lo = mid; else hi = mid; }
        crossings.push({ radius: (lo + hi) / 2, outward: loAbove });
      }
      previous = current; previousRadius = r;
    }
    if (!crossings.length) missingRays.push(k);
    if (crossings.length !== 1 || !crossings[0]?.outward) multipleCrossingRays.push(k);
    rays.push({ angle, crossings, radius: crossings.length === 1 && crossings[0].outward ? crossings[0].radius : null });
  }
  const meanAt = indices => indices.every(i => rays[i].radius !== null) ? indices.reduce((a, i) => a + rays[i].radius, 0) / indices.length : null;
  const axisRadius = meanAt([0, 16, 32, 48]), diagonalRadius = meanAt([8, 24, 40, 56]);
  const relativeAxisDiagonalBias = axisRadius !== null && diagonalRadius !== null ? Math.abs(axisRadius - diagonalRadius) / ((axisRadius + diagonalRadius) / 2) : null;
  return { threshold, axisRadius, diagonalRadius, relativeAxisDiagonalBias, missingRays, multipleCrossingRays, rays };
}
function historicalFront(s) {
  let axis = -Infinity, diagonal = -Infinity; const { n, dx, area } = s.geom;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (s.V[y * n + x] / area < .01) continue;
    const X = (x + .5) * dx - 16, Y = (y + .5) * dx - 16, r = Math.hypot(X, Y);
    if (Math.abs(Y) <= dx / 2 + .001 && X > 0) axis = Math.max(axis, r);
    if (Math.abs(X - Y) < .001 && X > 0) diagonal = Math.max(diagonal, r);
  }
  return { axisRadius: axis, diagonalRadius: diagonal, relativeRadiusBias: Math.abs(axis - diagonal) / ((axis + diagonal) / 2) };
}
function rotation(s) {
  const { n } = s.geom; let volume = 0, momentum = 0, discharge = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const a = (n - 1 - x) * n + y, b = y * n + x;
    volume = Math.max(volume, Math.abs(s.V[b] - s.V[a]));
    momentum = Math.max(momentum, Math.abs(s.mx[b] + s.my[a]), Math.abs(s.my[b] - s.mx[a]));
  }
  for (const f of s.geom.faces) {
    const id = f.axis === 0 ? s.geom.yids[(n - f.x) * n + f.y] : s.geom.xids[(n - 1 - f.x) * (n + 1) + f.y];
    discharge = Math.max(discharge, Math.abs(s.q[f.id] - (f.axis === 0 ? -1 : 1) * s.q[id]));
  }
  assert.ok(Math.max(volume, momentum, discharge) <= 1e-10); return { volume, momentum, discharge };
}

experiment('fixed-step-refined-identity', () => {
  const coarse = fixture(32, 'rest', .81), fine = fixture(64, 'rest', .81);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) assert.equal(fine.geom.z[y * 64 + x], coarse.geom.z[Math.floor(y / 2) * 32 + Math.floor(x / 2)]);
  return { stepHeight: .54, fineCellsChecked: 4096, coarseDx: 1, fineDx: .5 };
});
for (const ceiling of [.02, .01]) for (const n of [32, 64]) {
  experiment(`radial-n${n}-dt${ceiling}`, () => {
    const initial = fixture(n, 'radial'), r = advance(initial, ceiling);
    return { ...r, n, ceiling, initialVolume: initial.initialVolume, expectedInitialVolume: Math.PI * 36 * .27,
      fronts: [.001, .01, .05].map(threshold => fronts(r.final, threshold)), historicalOneCm: historicalFront(r.final), quarterTurn: rotation(r.final) };
  });
  for (const eta of [.81, .27]) experiment(`step-rest-eta${eta}-n${n}-dt${ceiling}`, () => {
    const initial = fixture(n, 'rest', eta), r = advance(initial, ceiling); let depthDrift = 0, momentumDrift = 0;
    for (let i = 0; i < initial.V.length; i++) { depthDrift = Math.max(depthDrift, Math.abs(r.final.V[i] - initial.V[i]) / initial.geom.area); momentumDrift = Math.max(momentumDrift, Math.abs(r.final.mx[i]), Math.abs(r.final.my[i])); }
    assert.ok(depthDrift <= 1e-11 && momentumDrift <= 1e-11);
    return { ...r, n, ceiling, eta, stepHeight: .54, depthDrift, momentumDrift };
  });
}
const criteria = [];
for (const ceiling of [.02, .01]) {
  const coarse = outcomes.find(o => o.name === `radial-n32-dt${ceiling}`), fine = outcomes.find(o => o.name === `radial-n64-dt${ceiling}`);
  if (!coarse?.fronts || !fine?.fronts) continue;
  const a = coarse.fronts.find(f => f.threshold === .01), b = fine.fronts.find(f => f.threshold === .01);
  const valid = !a.missingRays.length && !a.multipleCrossingRays.length && !b.missingRays.length && !b.multipleCrossingRays.length;
  criteria.push({ ceiling, interpolated: { coarseBias: a.relativeAxisDiagonalBias, fineBias: b.relativeAxisDiagonalBias,
    pass: valid && a.relativeAxisDiagonalBias < .1 && b.relativeAxisDiagonalBias < a.relativeAxisDiagonalBias },
    historicalCellCentre: { coarseBias: coarse.historicalOneCm.relativeRadiusBias, fineBias: fine.historicalOneCm.relativeRadiusBias,
      pass: coarse.historicalOneCm.relativeRadiusBias < .1 && fine.historicalOneCm.relativeRadiusBias < coarse.historicalOneCm.relativeRadiusBias } });
}
console.log(JSON.stringify({ criteria }));
save('manifest.json', { stamp, hashes, outcomes: outcomes.map(({ final, ...r }) => r), criteria });
if (outcomes.some(o => o.status !== 'completed') || criteria.some(c => !c.interpolated.pass || !c.historicalCellCentre.pass)) process.exitCode = 1;
console.log(`Saved ${dir.pathname}`);
