import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceExchange, SURFACE_EXCHANGE_VERSION } from './surface-exchange.mjs';

const input = (left, right, changes = {}) => ({ leftSurfaceM: left, rightSurfaceM: right,
  crestM: 0.54, openingLengthM: 1, coefficient: 0.5, ...changes });
function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} differs from ${expected}`);
}
const flux = value => surfaceExchange(value).volumeRateM3S;

test('dry, subcrest and closed openings have no discharge or Jacobian', () => {
  const zero = { volumeRateM3S: 0, derivativeLeftM2S: 0, derivativeRightM2S: 0 };
  for (const value of [input(0.54, 0.54), input(0.3, -0.2), input(0, 0.54),
    input(5, -2, { coefficient: 0 })]) assert.deepEqual(surfaceExchange(value), zero);
  assert.equal(SURFACE_EXCHANGE_VERSION, 'broad-crested-normalized-cms-067-v1');
});

test('0.54m ledge free discharge matches dimensional weir relation and explicit coefficients', () => {
  // A 0.27m-deep donor stands over the 0.54m crest; the lower pool is below it.
  const value = input(0.81, 0.27, { openingLengthM: 2 });
  const independent = value.coefficient * Math.sqrt(9.81 * 0.27 ** 3) * value.openingLengthM;
  near(flux(value), independent);
  assert.ok(flux(value) > 0);
  near(flux({ ...value, rightSurfaceM: -3 }), independent);
  near(flux({ ...value, coefficient: 1 }), independent * 2);
  near(flux({ ...value, openingLengthM: 4 }), independent * 2);
  const saved = JSON.stringify(value);
  assert.deepEqual(surfaceExchange(value), surfaceExchange(JSON.parse(saved)));
  assert.equal(JSON.stringify(value), saved);
  assert.ok(Object.isFrozen(surfaceExchange(value)));
});

test('reversal is antisymmetric with monotone head derivatives', () => {
  for (const [left, right] of [[0.81, 0.27], [1.54, 1.24], [1.54, 1.53], [0.55, 0.54]]) {
    const a = surfaceExchange(input(left, right)), b = surfaceExchange(input(right, left));
    assert.equal(b.volumeRateM3S, -a.volumeRateM3S);
    assert.equal(b.derivativeLeftM2S, -a.derivativeRightM2S);
    assert.equal(b.derivativeRightM2S, -a.derivativeLeftM2S);
    assert.ok(a.derivativeLeftM2S >= 0 && a.derivativeRightM2S <= 0);
    assert.ok(b.derivativeLeftM2S >= 0 && b.derivativeRightM2S <= 0);
  }
});

test('wet equality has exactly zero flow and the finite limiting Jacobian', () => {
  const value = input(1.54, 1.54), result = surfaceExchange(value);
  assert.equal(result.volumeRateM3S, 0);
  const slope = 0.5 * Math.sqrt(9.81) * 3 / 0.33;
  near(result.derivativeLeftM2S, slope);
  near(result.derivativeRightM2S, -slope);
  // A nearby wet difference must not disappear through ratio rounding.
  const close = input(1, 1 - Number.EPSILON, { crestM: -100 });
  assert.ok(flux(close) > 0);
  const expected = surfaceExchange(input(1, 1, { crestM: -100 })).derivativeLeftM2S * Number.EPSILON;
  assert.ok(Math.abs(flux(close) / expected - 1) < 1e-12);
  assert.equal(flux(input(1e250, 1e250, { crestM: 0 })), 0);
});

test('normalized submerged rating has its declared midpoint and releases free flow below onset', () => {
  const full = 0.5 * Math.sqrt(9.81);
  near(flux(input(1.54, 1.375)), full * 0.875); // r=.835: half way from .67 to 1.
  near(flux(input(1.54, 1.21)), full);
  assert.ok(flux(input(1.54, 1.50)) < flux(input(1.54, 1.375)));
});

test('analytic Jacobian agrees with finite differences through free, submerged and equality branches', () => {
  const epsilon = 1e-7;
  for (const value of [input(0.81, 0.27), input(1.54, 1.04), input(1.54, 1.21),
    input(1.54, 1.37), input(1.54, 1.539), input(1.54, 1.54), input(1.24, 1.54)]) {
    const result = surfaceExchange(value);
    for (const [field, derivative] of [['leftSurfaceM', 'derivativeLeftM2S'],
      ['rightSurfaceM', 'derivativeRightM2S']]) {
      const numerical = (flux({ ...value, [field]: value[field] + epsilon }) -
        flux({ ...value, [field]: value[field] - epsilon })) / (2 * epsilon);
      near(result[derivative], numerical, 2e-6);
    }
  }
});

test('submergence onset, dry crest and equal-head endpoints are continuous', () => {
  for (const downstream of [0.54, 1.21, 1.54]) {
    const center = surfaceExchange(input(1.54, downstream));
    for (const offset of [-1e-9, 1e-9]) {
      const side = surfaceExchange(input(1.54, downstream + offset));
      for (const key of Object.keys(center)) near(side[key], center[key], 2e-7);
    }
  }
  for (const depth of [1e-6, 1e-9, 1e-12]) {
    const result = surfaceExchange(input(depth, -1, { crestM: 0 }));
    near(result.volumeRateM3S / depth ** 1.5, 0.5 * Math.sqrt(9.81));
    near(result.derivativeLeftM2S / Math.sqrt(depth), 0.75 * Math.sqrt(9.81));
    assert.equal(result.derivativeRightM2S, 0);
  }
});

test('boundary admits only exact finite data without invoking accessors', () => {
  for (const malformed of [null, [], { ...input(1, 0), unknown: 1 },
    input(1, 0, { coefficient: -1 }), input(1, 0, { coefficient: 1.01 }),
    input(1, 0, { openingLengthM: 0 }), input(Infinity, 0), input(NaN, 0),
    input(1, 0, { crestM: -Infinity })]) assert.throws(() => surfaceExchange(malformed));
  const missing = input(1, 0); delete missing.crestM;
  assert.throws(() => surfaceExchange(missing));
  let reads = 0;
  const accessor = input(1, 0);
  Object.defineProperty(accessor, 'coefficient', { get() { reads++; return 0.5; } });
  assert.throws(() => surfaceExchange(accessor));
  assert.equal(reads, 0);
  assert.throws(() => surfaceExchange(input(1e308, 0, { crestM: -1e308 })));
});
