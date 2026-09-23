import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createMomentumOracle } from './oracle.mjs';

const start = performance.now();
const lengthsM = [4, 2.16, 4], rho = 1.17, wave = lengthsM.map((l) => 2 * Math.PI / l);
const oracle = createMomentumOracle({ lengthsM, densityKgPerM3: rho });
let checks = 0, maxQuadratureError = 0, maxDerivativeError = 0;
const near = (a, b, tolerance) => { checks++; assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}, tolerance ${tolerance}`); };

// Independent continuous point expressions; no averaged expressions or solver
// residual are used by the quadrature integrand.
function point(x, t) {
  const [kx, ky, kz] = wave, [X, Y, Z] = x;
  const A = 0.04 * Math.cos(t), Adot = -0.04 * Math.sin(t), B = 0.001;
  const sx = Math.sin(kx * X), sy = Math.sin(ky * Y), sz = Math.sin(kz * Z);
  const cx = Math.cos(kx * X), cy = Math.cos(ky * Y), cz = Math.cos(kz * Z);
  const u = [A * sy, A * sz, A * sx];
  const gradient = [-rho * B * kx * sx * cy * cz, -rho * B * ky * cx * sy * cz, -rho * B * kz * cx * cy * sz];
  const f = [Adot * sy + A * A * ky * cy * sz + gradient[0] / rho,
    Adot * sz + A * A * kz * cz * sx + gradient[1] / rho,
    Adot * sx + A * A * kx * cx * sy + gradient[2] / rho];
  return [...u, ...f, rho * B * cx * cy * cz, 0.5 * rho * u.reduce((s, v) => s + v * v, 0)];
}

function gauss(n) {
  const result = [];
  for (let i = 0; i < n; i++) {
    let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), derivative;
    for (let iteration = 0; iteration < 32; iteration++) {
      let p = 1, previous = 0;
      for (let k = 1; k <= n; k++) { const old = p; p = ((2 * k - 1) * x * p - (k - 1) * previous) / k; previous = old; }
      derivative = n * (x * p - previous) / (x * x - 1);
      const delta = p / derivative; x -= delta;
      if (Math.abs(delta) < 2e-16) break;
      assert.ok(iteration < 31, 'quadrature root iteration bound');
    }
    result.push([x, 2 / ((1 - x * x) * derivative * derivative)]);
  }
  return result;
}

const rule = gauss(16);
near(rule.reduce((s, [, w]) => s + w, 0), 2, 2e-14);
const cases = [
  { c: [0.25, 0.13, 0.51], h: [1, 0.54, 1], t: 0.37 },
  { c: [3.95, -0.08, -0.4], h: [0.5, 0.27, 0.5], t: 0.83 },
  { c: [2, 1.08, 2], h: lengthsM, t: 0.37 },
  { c: [0.17, 0.42, 0.91], h: [0, 0.54, 1], t: 1 },
];
for (const { c, h, t } of cases) {
  const integrated = new Float64Array(8);
  for (const [x, wx] of rule) for (const [y, wy] of rule) for (const [z, wz] of rule) {
    const p = point([c[0] + h[0] * x / 2, c[1] + h[1] * y / 2, c[2] + h[2] * z / 2], t);
    for (let i = 0; i < p.length; i++) integrated[i] += p[i] * wx * wy * wz / 8;
  }
  const a = oracle.averages(c, h, t);
  const exact = [...a.velocityMPerS, ...a.bodyAccelerationMPerS2, a.perturbationPressurePa, a.kineticEnergyDensityJPerM3];
  exact.forEach((v, i) => { maxQuadratureError = Math.max(maxQuadratureError, Math.abs(v - integrated[i])); near(v, integrated[i], 1e-11); });
}

const dt = 1e-5, dx = 1e-5;
for (const { c, t } of cases.slice(0, 2)) {
  const a = oracle.averages(c, [0, 0, 0], t), minusT = point(c, t - dt), plusT = point(c, t + dt);
  let divergence = 0;
  const gradient = [], transport = [0, 0, 0];
  for (let b = 0; b < 3; b++) {
    const minus = [...c], plus = [...c]; minus[b] -= dx; plus[b] += dx;
    const m = point(minus, t), p = point(plus, t);
    divergence += (p[b] - m[b]) / (2 * dx);
    gradient[b] = (p[6] - m[6]) / (2 * dx);
    for (let axis = 0; axis < 3; axis++) transport[axis] += a.velocityMPerS[b] * (p[axis] - m[axis]) / (2 * dx);
  }
  near(divergence, 0, 1e-12);
  for (let axis = 0; axis < 3; axis++) {
    const force = (plusT[axis] - minusT[axis]) / (2 * dt) + transport[axis] + gradient[axis] / rho;
    maxDerivativeError = Math.max(maxDerivativeError, Math.abs(force - a.bodyAccelerationMPerS2[axis]));
    near(force, a.bodyAccelerationMPerS2[axis], 1e-9);
  }
}
const whole = oracle.averages([2, 1.08, 2], lengthsM, 0.37);
for (const u of whole.velocityMPerS) near(u, 0, 1e-16);
near(whole.kineticEnergyDensityJPerM3, 0.75 * rho * (0.04 * Math.cos(0.37)) ** 2, 1e-16);
console.log(JSON.stringify({ pass: true, scope: 'continuous oracle only; no gas solver', checks,
  maxQuadratureError, maxDerivativeError, elapsedMs: performance.now() - start }));
