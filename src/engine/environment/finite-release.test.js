import assert from "node:assert/strict";
import test from "node:test";
import { createFiniteRelease } from "./finite-release.ts";
const close = (actual, expected) =>
  assert(
    Math.abs(actual - expected) <=
      8 * Number.EPSILON * Math.max(Math.abs(actual), Math.abs(expected)),
    `${actual} differs from ${expected} beyond interval arithmetic roundoff`,
  );

test("one host-clock profile supplies finite rates and exhausts without another cursor", () => {
  const release = createFiniteRelease({
    durationS: 6,
    totals: { heatJ: 1800, smokeKg: 0.0002 },
  });
  assert.deepEqual(release.plan(null, 2, 1, 1e-6), {
    status: "ready",
    segments: [{ seconds: 1, rates: null }],
  });
  const crossing = release.plan(1, 6, 3, 1e-6);
  assert.equal(crossing.status, "ready");
  assert.deepEqual(
    crossing.segments.map((s) => s.seconds),
    [1, 2],
  );
  assert.equal(crossing.segments[0].rates.heatJ, 300);
  close(crossing.segments[0].rates.smokeKg, 0.0002 / 6);
  assert.equal(crossing.segments[1].rates, null);
  assert.deepEqual(release.plan(1, 6, 3, 1e-6), crossing);
  assert.deepEqual(release.read(1, 7), {
    fraction: 1,
    remainingS: 0,
    endsAtS: 7,
    released: { heatJ: 1800, smokeKg: 0.0002 },
  });
  assert.equal(release.read(1, 100).released.heatJ, 1800);
});

test("partitioned host intervals release the same finite totals for content-defined channels", () => {
  const definition = { durationS: 4, totals: { coolingJ: -12, nutrientKg: 2 } };
  const release = createFiniteRelease(definition);
  definition.totals.nutrientKg = 999;
  const observed = { coolingJ: 0, nutrientKg: 0 };
  for (const [at, seconds] of [
    [3, 1],
    [4, 2],
    [6, 2],
  ]) {
    const plan = release.plan(3, at, seconds, 1e-6);
    assert.equal(plan.status, "ready");
    for (const segment of plan.segments)
      if (segment.rates)
        for (const channel of Object.keys(observed))
          observed[channel] += segment.rates[channel] * segment.seconds;
  }
  assert.deepEqual(observed, { coolingJ: -12, nutrientKg: 2 });
  assert.deepEqual(release.read(3, 8).released, observed);
  assert(Object.isFrozen(release.definition.totals));
});

test("represented source-end equality does not manufacture a short coast segment", () => {
  const release = createFiniteRelease({
    durationS: 0.6,
    totals: { charge: 3 },
  });
  assert.deepEqual(release.plan(0.3, 0.3, 0.6, 1e-6), {
    status: "ready",
    segments: [{ seconds: 0.6, rates: { charge: 5 } }],
  });
  assert.equal(release.read(0.3, 0.3 + 0.6).fraction, 1);
  assert.equal(release.read(0.3, 0.3 + 0.6).released.charge, 3);
});

test("large host clocks and interval partitions cannot enlarge a finite release", () => {
  const start = 1e10;
  const release = createFiniteRelease({
    durationS: 0.1,
    totals: { heatJ: 1800, smokeKg: 0.0002 },
  });
  const endsAt = release.read(start, start).endsAtS;
  assert.notEqual(
    endsAt - start,
    0.1,
    "fixture exposes represented span rounding",
  );
  for (const times of [
    [start, start + 0.2],
    [start, start + 0.03, start + 0.06, start + 0.2],
  ]) {
    const received = { heatJ: 0, smokeKg: 0 };
    for (let i = 1; i < times.length; i++) {
      const plan = release.plan(
        start,
        times[i - 1],
        times[i] - times[i - 1],
        1e-6,
      );
      assert.equal(plan.status, "ready");
      for (const segment of plan.segments)
        if (segment.rates)
          for (const channel of Object.keys(received))
            received[channel] += segment.rates[channel] * segment.seconds;
    }
    const exhausted = release.read(start, endsAt).released;
    for (const channel of Object.keys(received))
      close(received[channel], exhausted[channel]);
  }
});

test("a real short active piece, coast or owed remainder is retained by rejection", () => {
  const release = createFiniteRelease({ durationS: 6, totals: { heat: 18 } });
  for (const [at, seconds] of [
    [0, 5.9999995],
    [0, 6.0000005],
    [5.9999995, 0.1],
  ])
    assert.deepEqual(release.plan(0, at, seconds, 1e-6), {
      status: "blocked",
      reason: "subminimum-interval",
    });
  assert.equal(release.plan(0, 0, 6, 1e-6).status, "ready");
  assert.deepEqual(release.plan(0, 2, 0, 1e-6), {
    status: "ready",
    segments: [],
  });
});

test("invalid definitions and clocks fail before a release plan exists", () => {
  assert.throws(() =>
    createFiniteRelease({ durationS: 0, totals: { heat: 1 } }),
  );
  assert.throws(() => createFiniteRelease({ durationS: 1, totals: {} }));
  assert.throws(() =>
    createFiniteRelease({
      durationS: Number.MAX_VALUE,
      totals: { heat: Number.MIN_VALUE },
    }),
  );
  const release = createFiniteRelease({ durationS: 6, totals: { heat: 18 } });
  assert.throws(() => release.read(2, 1), /after the host clock/);
  assert.throws(
    () => release.plan(1e30, 1e30, 1, 1e-6),
    /arithmetic resolution/,
  );
  assert.throws(() => release.plan(null, 0, -1, 1e-6));
  assert.throws(() => release.plan(null, 0, 1, 0));
});
