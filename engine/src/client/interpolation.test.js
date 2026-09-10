import assert from "node:assert/strict";
import { test } from "node:test";
import { createInterpolationBuffer } from "./interpolation.js";
const frame = (sequence, time, x, id = "a", epoch = "one") => ({
  epoch,
  sequence,
  time,
  facts: [{ id, pose: { position: { x, y: 0, z: 0 }, facing: 0 } }],
});
test("smooths jitter between stable IDs without mutating receipts", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  const first = frame(0, 0, 0);
  const second = frame(1, 1, 10);
  buffer.push(first, 0);
  buffer.push(second, 1000);
  const shown = buffer.render(500);
  assert.equal(shown[0].pose.position.x, 5);
  assert.equal(first.facts[0].pose.position.x, 0);
});
test("rejects stale sequences, resets epochs, and handles despawn/new IDs", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push(frame(2, 2, 2), 2000);
  assert.equal(buffer.push(frame(1, 1, 1), 1000), false);
  assert.equal(buffer.push(frame(0, 0, 0, "b", "two"), 0), false);
  buffer.reset("two");
  buffer.push(frame(0, 0, 0, "b", "two"), 0);
  assert.equal(buffer.size(), 1);
  assert.equal(buffer.render(0)[0].id, "b");
});
test("pause freezes and resume does not fast-forward across the gap", () => {
  const buffer = createInterpolationBuffer({ delayMs: 0 });
  buffer.push(frame(0, 0, 0), 0);
  buffer.push(frame(1, 1, 10), 1000);
  assert.equal(buffer.render(500)[0].pose.position.x, 5);
  assert.equal(buffer.render(9000, { paused: true })[0].pose.position.x, 10);
  assert.equal(buffer.render(9001)[0].pose.position.x, 10);
  buffer.push(frame(2, 2, 20), 2000);
  assert.equal(buffer.render(9002)[0].pose.position.x, 20);
});
