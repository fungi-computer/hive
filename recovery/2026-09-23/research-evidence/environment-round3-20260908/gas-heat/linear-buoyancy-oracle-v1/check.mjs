import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createBuoyancyOracle } from './oracle.mjs';

const root = fileURLToPath(new URL('.', import.meta.url)), started = performance.now();
const out = root + 'run-v1/'; mkdirSync(out, { recursive: true });
const pins = Object.fromEntries(['oracle.mjs', 'CONTRACT.md', 'check.mjs'].map(file => {
  const bytes = readFileSync(root + file); writeFileSync(out + file, bytes);
  return [file, createHash('sha256').update(bytes).digest('hex')];
}));
let checks = 0; const errors = [];
function near(label, actual, expected, tolerance) {
  checks++; const error = Math.abs(actual - expected); errors.push({ label, error });
  assert(Number.isFinite(actual) && error <= tolerance, `${label}: ${actual} vs ${expected}`);
}

function gauss(n) {
  const points = [];
  for (let i = 0; i < n; i++) {
    let x = Math.cos(Math.PI * (i + .75) / (n + .5)), derivative = 0;
    for (let iteration = 0; iteration < 20; iteration++) {
      let p0 = 1, p1 = x;
      for (let degree = 2; degree <= n; degree++) {
        const p = ((2 * degree - 1) * x * p1 - (degree - 1) * p0) / degree;
        p0 = p1; p1 = p;
      }
      derivative = n * (x * p1 - p0) / (x * x - 1);
      const change = p1 / derivative; x -= change;
      if (Math.abs(change) < 2e-16) break;
    }
    points.push([x, 2 / ((1 - x * x) * derivative * derivative)]);
  }
  return points;
}

// Pointwise mathematical expression, independent of the production average.
function point(config, xyz) {
  const [Lx, Ly, Lz] = config.lengthsM, rho = config.densityKgM3;
  const [kx, ky, kz] = [2 * Math.PI / Lx, Math.PI / Ly, config.varyingZ ? 2 * Math.PI / Lz : 0];
  const [x, y, z] = xyz, B = config.gravityMS2 * config.epsilon, K2 = kx * kx + ky * ky + kz * kz;
  const q = Math.cos(kx * x) * Math.sin(ky * y) * Math.cos(kz * z);
  const pi = -rho * B * ky / K2 * Math.cos(kx * x) * Math.cos(ky * y) * Math.cos(kz * z);
  const gradient = [rho * B * ky * kx / K2 * Math.sin(kx * x) * Math.cos(ky * y) * Math.cos(kz * z),
    rho * B * ky * ky / K2 * q,
    rho * B * ky * kz / K2 * Math.cos(kx * x) * Math.cos(ky * y) * Math.sin(kz * z)];
  return [rho * (1 - config.epsilon * q), B * q,
    -gradient[0] / rho, B * q - gradient[1] / rho, -gradient[2] / rho, pi, ...gradient];
}

function quadrature(config, center, widths, rule) {
  const total = Array(9).fill(0);
  for (const [x, wx] of rule) for (const [y, wy] of rule) for (const [z, wz] of rule) {
    const at = [x, y, z].map((v, axis) => center[axis] + v * widths[axis] / 2);
    const value = point(config, at), weight = wx * wy * wz / 8;
    for (let i = 0; i < total.length; i++) total[i] += weight * value[i];
  }
  return total;
}

const base = { lengthsM: [4, 2.16, 4], densityKgM3: 1.17, epsilon: .01, gravityMS2: 9.81, varyingZ: true };
try {
  const rule = gauss(12);
  for (const power of [0, 2, 10, 22]) near('quadrature moment ' + power,
    rule.reduce((sum, [x, w]) => sum + w * x ** power, 0), 2 / (power + 1), 3e-14);
  for (const varyingZ of [false, true]) {
    const config = { ...base, varyingZ }, oracle = createBuoyancyOracle(config);
    for (const [center, widths] of [
      [[2, 1.08, 2], [4, 2.16, 4]], [[.73, .82, 1.29], [.42, .27, .61]],
      [[1.12, .77, 2.16], [0, .54, .5]], [[.51, 1.12, 1.91], [0, 0, 0]],
    ]) {
      const f = oracle.averages(center, widths);
      const actual = [f.densityKgM3, f.buoyancyMS2, ...f.accelerationMS2,
        f.pressurePerturbationPa, ...f.pressureGradientPaM];
      const expected = quadrature(config, center, widths, rule);
      actual.forEach((value, i) => near('independent box average ' + varyingZ + '/' + i, value, expected[i], 2e-12));
    }
    const p = [.37, .83, 1.19], h = 1e-5, zero = [0, 0, 0];
    let divergence = 0, laplacian = 0;
    for (let axis = 0; axis < 3; axis++) {
      const lo = [...p], hi = [...p]; lo[axis] -= h; hi[axis] += h;
      const a = oracle.averages(lo, zero), b = oracle.averages(hi, zero), middle = oracle.averages(p, zero);
      near('pressure gradient ' + varyingZ + '/' + axis,
        (b.pressurePerturbationPa - a.pressurePerturbationPa) / (2 * h), middle.pressureGradientPaM[axis], 2e-11);
      divergence += (b.accelerationMS2[axis] - a.accelerationMS2[axis]) / (2 * h);
      laplacian += (b.pressureGradientPaM[axis] - a.pressureGradientPaM[axis]) / (2 * h);
    }
    near('solenoidal initial acceleration ' + varyingZ, divergence, 0, 2e-11);
    const lo = [...p], hi = [...p]; lo[1] -= h; hi[1] += h;
    const source = base.densityKgM3 * (oracle.averages(hi, zero).buoyancyMS2 - oracle.averages(lo, zero).buoyancyMS2) / (2 * h);
    near('pressure Poisson equation ' + varyingZ, laplacian, source, 3e-11);
    for (const y of [0, 2.16]) near('sealed normal acceleration ' + varyingZ + '/' + y,
      oracle.averages([.37, y, 1.19], zero).accelerationMS2[1], 0, 1e-16);
  }
  const relative = [], p = [.37, .83, 1.19];
  for (const epsilon of [.01, .005, .0025]) {
    const f = createBuoyancyOracle({ ...base, epsilon }).averages(p, [0, 0, 0]);
    const actual = f.pressureGradientPaM.map((gradient, axis) =>
      (axis === 1 ? -base.gravityMS2 : 0) -
      (gradient - (axis === 1 ? base.densityKgM3 * base.gravityMS2 : 0)) / f.densityKgM3);
    relative.push(Math.hypot(...actual.map((a, axis) => a - f.accelerationMS2[axis])) / epsilon);
  }
  for (let i = 1; i < relative.length; i++) near('small-epsilon momentum remainder ratio ' + i,
    relative[i - 1] / relative[i], 2, .02);
  const input = { ...base, lengthsM: [...base.lengthsM] }, oracle = createBuoyancyOracle(input);
  const before = oracle.averages(p, [0, 0, 0]); input.lengthsM[0] = 100; input.epsilon = .1;
  assert.deepEqual(oracle.averages(p, [0, 0, 0]), before); checks++;
  assert.throws(() => createBuoyancyOracle({ ...base, epsilon: .5 })); checks++;
  assert.throws(() => oracle.averages(p, [-1, 0, 0])); checks++;
  const report = { status: 'pass', checks, errors, epsilonRemainder: relative,
    elapsedMs: performance.now() - started, pins };
  writeFileSync(out + 'proof.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks, elapsedMs: report.elapsedMs, pins }));
} catch (error) {
  writeFileSync(out + 'failure.json', JSON.stringify({ status: 'fail', checks, errors, pins,
    message: error.stack, elapsedMs: performance.now() - started }, null, 2));
  throw error;
}
