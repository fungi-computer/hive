import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createStandingWave } from './oracle.mjs';

const definition = { lengthM: 1, waterDepthM: .54, airDepthM: .54,
  waterDensityKgM3: 1000, airDensityKgM3: 1.2, gravityMS2: 9.81, amplitudeM: .002 };
const oracle = createStandingWave(definition), started = performance.now();
let checks = 0;
function close(actual, expected, tolerance, label) {
  checks++; assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} versus ${expected}, tolerance ${tolerance}`);
}
function simpson(f, lo, hi, n) {
  const dx = (hi - lo) / n;
  let total = f(lo) + f(hi);
  for (let i = 1; i < n; i++) total += (i % 2 ? 4 : 2) * f(lo + i * dx);
  return total * dx / 3;
}
const derivative = (f, x, h) => (f(x + h) - f(x - h)) / (2 * h);
const times = [0, .13, .25, .43, .5, .79, 1].map(x => x * oracle.periodS);
const residuals = { divergencePerS: 0, momentumAccelerationMS2: 0, interfacePressurePa: 0 };
for (const t of times) {
  const mode = oracle.mode(t), dx = 1e-5, dt = 1e-5 / oracle.omegaPerS;
  close(mode.kineticEnergyJPerM + mode.potentialEnergyAboveFlatJPerM,
    mode.totalPerturbationEnergyJPerM, 1e-16, 'quadratic energy sum');
  for (const x of [0, .17, .5, .91, 1]) {
    const eta = mode.amplitudeM * Math.cos(oracle.wavenumberPerM * x);
    const etaRate = mode.amplitudeRateMS * Math.cos(oracle.wavenumberPerM * x);
    const water = oracle.field('water', x, 0, t), air = oracle.field('air', x, 0, t);
    close(water.velocityMS[1], etaRate, 1e-14, 'water interface kinematics');
    close(air.velocityMS[1], etaRate, 1e-14, 'air interface kinematics');
    const pressureResidual = water.pressurePerturbationPa - air.pressurePerturbationPa -
      (definition.waterDensityKgM3 - definition.airDensityKgM3) * definition.gravityMS2 * eta;
    residuals.interfacePressurePa = Math.max(residuals.interfacePressurePa, Math.abs(pressureResidual));
    close(pressureResidual, 0, 1e-11, 'displaced-interface pressure continuity');
    close(oracle.field('water', x, -.54, t).velocityMS[1], 0, 1e-14, 'lower impermeable wall');
    close(oracle.field('air', x, .54, t).velocityMS[1], 0, 1e-14, 'upper impermeable wall');
  }
  for (const phase of ['water', 'air']) {
    const density = phase === 'water' ? 1000 : 1.2, y = phase === 'water' ? -.23 : .23;
    for (const x of [.19, .67]) {
      close(oracle.field(phase, 0, y, t).velocityMS[0], 0, 1e-14, 'left impermeable wall');
      close(oracle.field(phase, 1, y, t).velocityMS[0], 0, 1e-14, 'right impermeable wall');
      const div = derivative(v => oracle.field(phase, v, y, t).velocityMS[0], x, dx) +
        derivative(v => oracle.field(phase, x, v, t).velocityMS[1], y, dx);
      residuals.divergencePerS = Math.max(residuals.divergencePerS, Math.abs(div));
      close(div, 0, 1e-9, 'independent differential incompressibility');
      if (t > dt) for (let axis = 0; axis < 2; axis++) {
        const acceleration = derivative(v => oracle.field(phase, x, y, v).velocityMS[axis], t, dt);
        const gradient = axis === 0 ? derivative(v => oracle.field(phase, v, y, t).pressurePerturbationPa, x, dx) :
          derivative(v => oracle.field(phase, x, v, t).pressurePerturbationPa, y, dx);
        residuals.momentumAccelerationMS2 = Math.max(residuals.momentumAccelerationMS2, Math.abs(acceleration + gradient / density));
        close(acceleration + gradient / density, 0, 1e-9, 'independent linear Euler momentum');
      }
    }
  }
}

const quarter = oracle.periodS / 4, targetK = oracle.mode(quarter).kineticEnergyJPerM;
const energyQuadrature = [16, 32, 64].map(n => {
  let value = 0;
  for (const phase of ['water', 'air']) {
    const density = phase === 'water' ? 1000 : 1.2, lo = phase === 'water' ? -.54 : 0;
    value += simpson(x => simpson(y => {
      const u = oracle.field(phase, x, y, quarter).velocityMS;
      return density * (u[0] ** 2 + u[1] ** 2) / 2;
    }, lo, lo + .54, n), 0, 1, n);
  }
  return { n, kineticEnergyJPerM: value, relativeError: Math.abs(value / targetK - 1) };
});
close(energyQuadrature[2].relativeError, 0, 1e-6, 'independent integrated quadratic kinetic energy');
for (let i = 0; i < 2; i++) {
  checks++; const ratio = energyQuadrature[i].relativeError / energyQuadrature[i + 1].relativeError;
  assert.ok(ratio > 14 && ratio < 18, `independent Simpson refinement ratio ${ratio}`);
}
const pe = simpson(x => (1000 - 1.2) * 9.81 / 2 *
  (oracle.mode(0).amplitudeM * Math.cos(oracle.wavenumberPerM * x)) ** 2, 0, 1, 32);
close(pe, oracle.mode(0).potentialEnergyAboveFlatJPerM, 1e-15, 'independent displaced-column potential energy');
const limit = createStandingWave({ ...definition, airDensityKgM3: 1e-9 });
close(limit.omegaPerS ** 2, 9.81 * Math.PI * Math.tanh(Math.PI * .54), 1e-9, 'vanishing-air free-surface limit');
const snapshotPeriod = oracle.periodS;
definition.lengthM = 2;
close(oracle.periodS, snapshotPeriod, 0, 'definition snapshot');
for (const call of [() => oracle.field('water', .5, .1, 0), () => oracle.field('void', .5, 0, 0),
  () => oracle.mode(-1), () => createStandingWave({ ...definition, extra: true }),
  () => createStandingWave({ ...definition, amplitudeM: .1 }),
  () => createStandingWave({ ...definition, waterDensityKgM3: 1e308, gravityMS2: 1e308 })]) {
  checks++; assert.throws(call);
}
const pins = Object.fromEntries(['oracle.mjs', 'CONTRACT.md', 'check.mjs'].map(name => [name,
  createHash('sha256').update(readFileSync(new URL(name, import.meta.url))).digest('hex')]));
const result = { scope: 'Linear two-layer standing-wave oracle identities and quadrature only; no fluid solver run.',
  invocationId: process.env.INVOCATION_ID, passed: true, checks, pins,
  omegaPerS: oracle.omegaPerS, periodS: oracle.periodS, energyQuadrature, residuals,
  wallMilliseconds: performance.now() - started };
writeFileSync(new URL('proof.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
