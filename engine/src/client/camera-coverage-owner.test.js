import test from "node:test";
import assert from "node:assert/strict";
import { createCameraCoverageOwner } from "./camera-coverage-owner.js";

const view = { left: 0, right: 400, top: 0, bottom: 300 };
const shifted = x => ({ ...view, left: view.left + x, right: view.right + x });

test("camera hysteresis retains demand across small pans and zoom-in, then replaces at the margin", () => {
  const owner = createCameraCoverageOwner();
  let calls = 0;
  const plan = rect => ({ kind: "ready", regions: [[++calls, 0, 0]], rect });
  const first = owner.update(view, "epoch1/turn0/level2", plan);
  assert.deepEqual(first.rect, { left: -128, right: 528, top: -128, bottom: 428 });
  assert.strictEqual(owner.update(shifted(72), "epoch1/turn0/level2", plan), first);
  assert.strictEqual(owner.update({ left: 100, right: 300, top: 80, bottom: 220 }, "epoch1/turn0/level2", plan), first);
  assert.equal(calls, 1, "retained camera movement does not enumerate terrain again");
  const second = owner.update(shifted(90), "epoch1/turn0/level2", plan);
  assert.notStrictEqual(second, first);
  assert.equal(owner.snapshot().withinPrepared, true);
  owner.update(shifted(90), "epoch1/turn1/level2", plan);
  owner.update(shifted(90), "epoch1/turn1/level3", plan);
  owner.update(shifted(90), "epoch2/turn1/level3", plan);
  assert.equal(calls, 5, "rotation, cut and new world each replan coverage");
  owner.reset();
  assert.equal(owner.snapshot().prepared, undefined);
});

test("zoom-out padding adapts to the fixed budget and rejects an oversized visible view", () => {
  const owner = createCameraCoverageOwner();
  const plan = rect => rect.right - rect.left > 470 ? { kind: "view-budget", limit: 12 } : { kind: "ready", regions: [] };
  assert.equal(owner.update(view, "1", plan).kind, "ready");
  assert.equal(owner.snapshot().padding, 32);
  assert.equal(owner.update({ ...view, right: 800 }, "1", plan).kind, "view-budget");
  assert.equal(owner.snapshot().padding, 0);
  assert.equal(owner.update(view, "1", plan).kind, "ready", "returning from an oversized view replans");
});
