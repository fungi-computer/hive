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
  assert.equal(buffer.delayMs, 200);
  const arrivals = [0, 120, 215, 330, 420, 560, 640, 780, 1300];
  let next = 0;
  const renderAt = (now) => {
    while (next < arrivals.length && arrivals[next] <= now) {
      const time = next / 10;
      buffer.push(frame(next, time, next * 10), arrivals[next]);
      next += 1;
    }
    return buffer.render(now)[0]?.pose.position.x;
  };
  // The renderer sees only arrivals that have actually happened. Uneven
  // delivery still produces a steady delayed timeline after warm-up.
  assert.equal(renderAt(0), 0);
  assert.equal(renderAt(500), 30);
  assert.equal(renderAt(600), 40);
  assert.equal(renderAt(700), 50);
  assert.equal(renderAt(800), 60);

  // A publication gap holds the last committed pose, then resumes from the
  // new sample without rewinding the already displayed server time.
  assert.equal(renderAt(1200), 70);
  assert.equal(renderAt(1300), 70);
  assert.equal(renderAt(1400), 70);
  assert.ok(Math.abs(renderAt(1450) - 75) < 1e-9);
  assert.equal(renderAt(1500), 80);
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

test("facing wraps across the quarter-turn boundary", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(
    {
      epoch: "one",
      sequence: 1,
      time: 1,
      facts: [{ id: "a", pose: { position: { x: 0, y: 0, z: 0 }, facing: 0 } }],
    },
    1000,
  );
  const wrapped = {
    epoch: "one",
    sequence: 2,
    time: 2,
    facts: [{ id: "a", pose: { position: { x: 0, y: 0, z: 0 }, facing: 3 } }],
  };
  buffer.push(wrapped, 2000);
  assert.equal(buffer.render(1500)[0].pose.facing, -0.5);
  assert.equal(buffer.render(2000)[0].pose.facing, 3);
});

test("feedback clock follows displayed world time and freezes with pause", () => {
  const buffer = createInterpolationBuffer({ delayMs: 100 });
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(frame(1, 1, 10), 1000);
  buffer.render(500);
  assert.equal(buffer.presentationTime(), 0.4);
  buffer.render(9000, { paused: true });
  assert.equal(buffer.presentationTime(), 0.4);
  buffer.reset();
  assert.equal(buffer.presentationTime(), -Infinity);
});
