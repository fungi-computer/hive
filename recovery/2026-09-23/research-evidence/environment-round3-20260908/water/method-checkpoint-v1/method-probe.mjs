import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { circleRectangleArea } from './circle-area.mjs';
import { createStepper } from './candidate.mjs';
import { makeFixture, G, sum, step as denseStep } from './reference/solver.mjs';

const stamp = process.argv[2] ?? new Date().toISOString().replaceAll(':', '-');
const dir = new URL(`runs/${stamp}-method-probe/`, import.meta.url); mkdirSync(dir, { recursive: true });
const hashes = {};
for (const name of ['candidate.mjs', 'admission.mjs', 'circle-area.mjs', 'method-probe.mjs', 'METHOD-PROBE-PREDECLARED.md']) {
  const b = readFileSync(new URL(name, import.meta.url)); hashes[name] = createHash('sha256').update(b).digest('hex'); writeFileSync(new URL(name, dir), b);
}
const outcomes = [];
const save = (name, x) => writeFileSync(new URL(name, dir), JSON.stringify(x, null, 2) + '\n');
function experiment(name, fn) {
  const start = performance.now();
  try { const r = { name, status: 'passed', ...fn(), elapsedMs: performance.now() - start }; outcomes.push(r); save(`${name}.json`, r); console.log(JSON.stringify(r)); }
  catch (error) { const r = { name, status: 'harness-failed', elapsedMs: performance.now() - start, error: error.stack }; outcomes.push(r); save(`${name}.json`, r); console.log(JSON.stringify(r)); }
}

experiment('analytic-circle-cell-areas', () => {
  function areas(n, cx = 16, cy = 16) {
    const dx = 32 / n, a = new Float64Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a[y * n + x] = circleRectangleArea(x * dx - cx, (x + 1) * dx - cx, y * dx - cy, (y + 1) * dx - cy, 6);
    const total = sum(a), relativeError = Math.abs(total - Math.PI * 36) / (Math.PI * 36);
    assert.ok(relativeError < 1e-10); return { a, total, relativeError };
  }
  const coarse = areas(32), fine = areas(64), offset = areas(64, 15.3, 16.2);
  let maxPartitionError = 0, maxSymmetryError = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const part = fine.a[(2 * y) * 64 + 2 * x] + fine.a[(2 * y) * 64 + 2 * x + 1] + fine.a[(2 * y + 1) * 64 + 2 * x] + fine.a[(2 * y + 1) * 64 + 2 * x + 1];
    maxPartitionError = Math.max(maxPartitionError, Math.abs(part - coarse.a[y * 32 + x]));
    maxSymmetryError = Math.max(maxSymmetryError, Math.abs(coarse.a[y * 32 + x] - coarse.a[x * 32 + 31 - y]));
  }
  assert.ok(maxPartitionError <= 1e-10 && maxSymmetryError <= 1e-10);
  assert.ok(Math.abs(circleRectangleArea(0, 6, 0, 6, 6) - Math.PI * 9) <= 1e-10);
  return { coarseTotal: coarse.total, fineTotal: fine.total, analyticTotal: Math.PI * 36,
    relativeErrors: [coarse.relativeError, fine.relativeError, offset.relativeError], maxPartitionError, maxSymmetryError };
});

function steadyPair(hL, uL, stepHeight) {
  const q = hL * uL, headL = hL + uL * uL / (2 * G), headR = headL - stepHeight;
  const critical = Math.cbrt(q * q / G), minimumHead = 1.5 * critical;
  assert.ok(hL < critical && headR > minimumHead, 'supercritical branch must exist');
  let lo = Number.EPSILON, hi = critical;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2, value = mid + q * q / (2 * G * mid * mid);
    if (value > headR) lo = mid; else hi = mid;
  }
  const hR = (lo + hi) / 2, uR = q / hR;
  const energyResidual = Math.abs(hL + uL * uL / (2 * G) - (stepHeight + hR + uR * uR / (2 * G)));
  const dischargeResidual = Math.abs(q - hR * uR);
  assert.ok(energyResidual <= 1e-11 && dischargeResidual <= 1e-11);
  return { hL, uL, hR, uR, q, critical, energyResidual, dischargeResidual };
}

function reconstructed(pair, stepHeight) {
  const { hL, hR, uL, uR } = pair;
  const ha = Math.max(0, hL - stepHeight), hb = hR;
  const speed = Math.max(Math.abs(uL) + Math.sqrt(G * ha), Math.abs(uR) + Math.sqrt(G * hb));
  const mass = (ha * uL + hb * uR - speed * (hb - ha)) / 2;
  const momentum = (ha * uL * uL + hb * uR * uR + G * (ha * ha + hb * hb) / 2 - speed * (hb * uR - ha * uL)) / 2;
  return { ha, hb, mass, leftMomentum: momentum + G * (hL * hL - ha * ha) / 2, rightMomentum: momentum,
    upstreamReconstructionFraction: ha / hL };
}

for (const hL of [.27, .54, .81]) for (const n of [16, 32]) experiment(`moving-step-h${hL}-dx${16 / n}`, () => {
  const pair = steadyPair(hL, 6, .54), expected = reconstructed(pair, .54);
  const s = makeFixture({ n, length: 16, model: 'swe', fixture: 'blank', roughness: 0 });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, left = x < n / 2;
    s.geom.z[i] = left ? 0 : .54; s.V[i] = (left ? pair.hL : pair.hR) * s.geom.area; s.mx[i] = pair.q;
  }
  s.initialVolume = sum(s.V);
  const solver = createStepper(s), dt = solver.stableDt(.001), actual = solver.step(dt), dense = denseStep(s, dt);
  const f = s.geom.faces[s.geom.xids[Math.floor(n / 2) * (n + 1) + n / 2]], { a, b } = f;
  const actualMass = actual.exchanges[f.id] / (s.geom.dx * dt);
  const uniformLeft = pair.hL * pair.uL * pair.uL + G * pair.hL * pair.hL / 2;
  const uniformRight = pair.hR * pair.uR * pair.uR + G * pair.hR * pair.hR / 2;
  const actualLeftMomentum = uniformLeft - s.geom.dx / dt * (actual.state.mx[a] - s.mx[a]);
  const actualRightMomentum = uniformRight + s.geom.dx / dt * (actual.state.mx[b] - s.mx[b]);
  assert.ok(Math.abs(actualMass - expected.mass) < 1e-10);
  assert.ok(Math.abs(actualLeftMomentum - expected.leftMomentum) < 1e-10);
  assert.ok(Math.abs(actualRightMomentum - expected.rightMomentum) < 1e-10);
  assert.equal(actual.exchanges[f.id], dense.exchanges[f.id]);
  const methodFailure = actualMass <= 0;
  return { status: methodFailure ? 'observed-method-failure' : 'diagnostic-only', stepHeight: .54, horizontalDx: s.geom.dx, pair, reconstruction: expected,
    actual: { massFlux: actualMass, leftMomentum: actualLeftMomentum, rightMomentum: actualRightMomentum },
    relativeSteadyMassError: Math.abs(actualMass - pair.q) / pair.q, directionPreserved: !methodFailure,
    denseMatchesActual: true, methodFailure,
    assumption: 'Frictionless constant-discharge, supercritical Bernoulli bottom-transition path; not a physically validated exposed waterfall.' };
});
save('manifest.json', { stamp, hashes, outcomes });
if (outcomes.some(x => x.status === 'harness-failed' || x.methodFailure)) process.exitCode = 1;
console.log(`Saved ${dir.pathname}`);
