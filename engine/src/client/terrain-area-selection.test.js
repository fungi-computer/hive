import test from "node:test";
import assert from "node:assert/strict";
import { createActor } from "xstate";
import { terrainAreaGestureMachine } from "./controls.js";
import {
  beginTerrainArea, cancelTerrainArea, commitTerrainArea, rectangleCells,
  updateTerrainArea, visibleTerrainAreaPreview,
} from "./terrain-area-selection.js";

test("rectangle selection is deterministic, reversible, and bounded", () => {
  assert.deepEqual(rectangleCells([2, 4, 3], [0, 4, 2]), [
    [0, 4, 2], [1, 4, 2], [2, 4, 2], [0, 4, 3], [1, 4, 3], [2, 4, 3],
  ]);
  const state = updateTerrainArea(beginTerrainArea([2, 4, 3]), [0, 4, 2]);
  assert.deepEqual(commitTerrainArea(state), rectangleCells([2, 4, 3], [0, 4, 2]));
  assert.deepEqual(cancelTerrainArea(), { start: null, current: null });
  assert.throws(() => rectangleCells([0, 4, 0], [16, 4, 0], 16), /area limit/);
  assert.throws(() => rectangleCells([0, 4, 0], [0, 5, 0]), /one level/);
});

test("preview exposes only already-published surfaces", () => {
  const frame = { surfaces: [
    { cell: [0, 4, 0], material: 1 }, { cell: [1, 4, 0], material: 2 },
    { cell: [0, 3, 1], material: 3 },
  ] };
  assert.deepEqual(visibleTerrainAreaPreview(frame, [0, 4, 0], [1, 4, 0]), frame.surfaces.slice(0, 2));
  assert.deepEqual(visibleTerrainAreaPreview(frame, [0, 4, 0], [1, 4, 1]), frame.surfaces.slice(0, 2));
});

test("XState gesture commits and cancellation clears stale rectangles", () => {
  const owner = createActor(terrainAreaGestureMachine).start();
  owner.send({ type: "BEGIN", cell: [2, 4, 3] });
  owner.send({ type: "MOVE", cell: [0, 4, 2] });
  owner.send({ type: "END" });
  assert.deepEqual(owner.getSnapshot().context.committed, { kind: "rectangle", cells: rectangleCells([2, 4, 3], [0, 4, 2]) });
  owner.send({ type: "BEGIN", cell: [1, 4, 1] });
  owner.send({ type: "MOVE", cell: [3, 4, 3] });
  owner.send({ type: "CANCEL" });
  assert.deepEqual(owner.getSnapshot().context.committed, []);
  assert.equal(owner.getSnapshot().context.start, null);
  owner.stop();
});
