import assert from "node:assert/strict";
import { test } from "node:test";
import { createInterpolationBuffer } from "./interpolation.js";

const fact = (id, x) => ({
  id,
  pose: { position: { x, y: 0, z: 0 }, facing: 0 },
});
const frame = (sequence, time, x, id = "a", epoch = "one") => ({
  epoch,
  sequence,
  time,
  facts: [fact(id, x)],
});

test("smooths jitter between stable IDs without mutating receipts", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  const first = frame(0, 0, 0);
  const second = frame(1, 1, 10);
  buffer.push(first, 0);
  buffer.push(second, 1000);
  assert.equal(buffer.render(500)[0].pose.position.x, 5);
  assert.equal(first.facts[0].pose.position.x, 0);
});

test("rejects stale time and epochs, bounds history, and resets explicitly", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push(frame(2, 2, 2), 2000);
  assert.equal(buffer.push(frame(3, 1, 1), 3000), false);
  assert.equal(buffer.push(frame(1, 3, 1), 3000), false);
  assert.equal(buffer.push(frame(3, 3, 3, "a", "two"), 3000), false);
  for (let sequence = 3; sequence < 43; sequence++)
    assert.equal(
      buffer.push(frame(sequence, sequence, sequence), sequence * 1000),
      true,
    );
  assert.equal(buffer.size(), 32);
  buffer.reset("two");
  buffer.push(frame(0, 0, 0, "b", "two"), 0);
  assert.equal(buffer.size(), 1);
  assert.equal(buffer.render(0)[0].id, "b");
});

test("pause freezes the displayed pose and explicit resume avoids a time jump", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(frame(1, 1, 10), 1000);
  assert.equal(buffer.render(500)[0].pose.position.x, 5);
  assert.equal(buffer.render(9000, { paused: true })[0].pose.position.x, 5);
  assert.equal(buffer.render(9001, { paused: false })[0].pose.position.x, 5);
  buffer.push(frame(2, 2, 20), 10000);
  assert.equal(buffer.render(10001, { paused: false })[0].pose.position.x, 20);
});

test("packet loss still interpolates known receipts and exact time uses membership", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push({ epoch: "one", sequence: 0, time: 0, facts: [fact("a", 0)] }, 0);
  buffer.push(
    { epoch: "one", sequence: 2, time: 2, facts: [fact("a", 20)] },
    2000,
  );
  const between = buffer.render(1000);
  assert.equal(between.length, 1);
  assert.equal(between[0].id, "a");
  assert.equal(between[0].pose.position.x, 10);

  buffer.push(
    { epoch: "one", sequence: 3, time: 3, facts: [fact("b", 30)] },
    3000,
  );
  const exact = buffer.render(3000);
  assert.deepEqual(
    exact.map(({ id }) => id),
    ["b"],
  );
});

test("starvation reanchors when a new receipt arrives", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(frame(1, 1, 10), 1000);
  assert.equal(buffer.render(5000)[0].pose.position.x, 10);
  buffer.push(frame(2, 2, 20), 6000);
  buffer.push(frame(3, 3, 30), 7000);
  assert.equal(buffer.render(6500)[0].pose.position.x, 25);
});

test("reanchoring does not move the displayed pose backward", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(frame(1, 10, 10), 10000);
  assert.equal(buffer.render(9500)[0].pose.position.x, 9.5);
  assert.equal(buffer.render(20000)[0].pose.position.x, 10);
  buffer.push(frame(2, 10.5, 10.5), 21000);
  assert.equal(buffer.render(21001)[0].pose.position.x, 10.5);
});

test("default delayed clock cannot rewind after short recovery", () => {
  const buffer = createInterpolationBuffer();
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(frame(1, 1, 10), 1000);
  buffer.render(2000);
  buffer.push(frame(2, 1.033, 10.33), 2033);
  assert.equal(buffer.render(2033)[0].pose.position.x, 10);
  assert.ok(buffer.render(2100)[0].pose.position.x >= 10);
});

test("online cadence buffers delayed and jittered publications", () => {
  const buffer = createInterpolationBuffer({ cadence: "online" });
  assert.equal(buffer.cadence, "online");
  assert.equal(buffer.delayMs, 500);
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(frame(1, 0.25, 25), 310);
  buffer.push(frame(2, 0.5, 50), 590);
  // At 800ms the two-sample delay leaves us between the first two
  // publications; no extrapolation is needed despite receipt jitter.
  assert.equal(buffer.render(800)[0].pose.position.x, 30);
  assert.equal(buffer.render(1000)[0].pose.position.x, 50);
});

test("supported children interpolate in parent-local space", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  const supported = (sequence, time, facing) => ({
    epoch: "one",
    sequence,
    time,
    facts: [
      { id: "ship", pose: { position: { x: 0, y: 0, z: 0 }, facing } },
      {
        id: "crew",
        support: "ship",
        local: { position: { x: 1, y: 0, z: 0 }, facing: 0 },
        pose: { position: { x: 1, y: 0, z: 0 }, facing: 0 },
      },
    ],
  });
  buffer.push(supported(0, 0, 0), 0);
  buffer.push(supported(1, 1, 1), 1000);
  const crew = buffer.render(500).find((fact) => fact.id === "crew");
  assert.ok(crew);
  assert.ok(Math.abs(crew.pose.position.x - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(crew.pose.position.z - Math.SQRT1_2) < 1e-9);
  assert.equal(crew.local.position.x, 1);
});
