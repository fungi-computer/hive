import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileWaterSprites,
  waterSpriteReconciliationSteps,
  waterCellKey,
} from "./water-sprite-reconciler.js";

const cell = (x, volume = 1) => ({
  at: [x, 2, 0],
  liquidVolumeM3: volume,
  level: 3,
});

test("water reconciliation retains unchanged keyed sprites and disposes removed cells", () => {
  const created = [];
  const disposed = [];
  const updates = [];
  const options = {
    key: waterCellKey,
    create: (value) => {
      const sprite = { id: value.at[0] };
      created.push(sprite);
      return sprite;
    },
    update: (sprite, value) => updates.push([sprite, value]),
    dispose: (sprite) => disposed.push(sprite),
  };
  const first = reconcileWaterSprites(new Map(), [cell(1), cell(2)], options);
  const second = reconcileWaterSprites(first, [cell(2), cell(3)], options);

  assert.strictEqual(
    second.get(waterCellKey(cell(2))).sprite,
    first.get(waterCellKey(cell(2))).sprite,
  );
  assert.equal(created.length, 3);
  assert.deepEqual(disposed, [first.get(waterCellKey(cell(1))).sprite]);
  assert.equal(updates.length, 4);
});

test("water reconciliation removes zero-volume cells", () => {
  const disposed = [];
  const options = {
    key: waterCellKey,
    create: () => ({}),
    update() {},
    dispose: (sprite) => disposed.push(sprite),
  };
  const first = reconcileWaterSprites(new Map(), [cell(1)], options);
  const second = reconcileWaterSprites(first, [cell(1, 0)], options);
  assert.equal(second.size, 0);
  assert.equal(disposed.length, 1);
});

test("stepped reconciliation yields before each cell and retirement; synchronous driver uses the same operation", () => {
  const removed = { sprite: { id: 0 } },
    retained = { sprite: { id: 1 } },
    previous = new Map([
      ["0:2:0", removed],
      ["1:2:0", retained],
    ]),
    events = [];
  const steps = waterSpriteReconciliationSteps(previous, [cell(1), cell(2)], {
    key: waterCellKey,
    create: (value) => {
      events.push("create");
      return { id: value.at[0] };
    },
    update: (sprite, value, existing) =>
      events.push(existing ? "reuse" : "update"),
    dispose: () => events.push("dispose"),
  });
  assert.deepEqual(events, []);
  assert.equal(steps.next().done, false);
  assert.deepEqual(events, []);
  assert.equal(steps.next().done, false);
  assert.deepEqual(events, ["reuse"]);
  assert.equal(steps.next().done, false);
  assert.deepEqual(events, ["reuse", "create", "update"]);
  assert.equal(steps.next().done, false);
  assert.deepEqual(events, ["reuse", "create", "update", "dispose"]);
  const last = steps.next();
  assert(last.done);
  assert.strictEqual(last.value.get("1:2:0"), retained);
  assert.equal(last.value.size, 2);
});
