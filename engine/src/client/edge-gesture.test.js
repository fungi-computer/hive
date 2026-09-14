import test from "node:test";
import assert from "node:assert/strict";
import { acquireEdgeStroke, canonicalEdges } from "./edge-gesture.js";

const project = (x, y, z) => ({ x: x - z, y: x + z - y });

test("edge strokes canonicalize reverse drag and stay bounded", () => {
  const forward = acquireEdgeStroke([0, 3, 0], [4, 3, 0], project, 0.54);
  const reverse = acquireEdgeStroke([4, 3, 0], [0, 3, 0], project, 0.54);
  assert.deepEqual(canonicalEdges(forward), canonicalEdges(reverse));
  assert.equal(forward[0].axis, "z");
  const vertical = acquireEdgeStroke([2, 3, 0], [2, 3, 4], project, 0.54);
  const verticalReverse = acquireEdgeStroke([2, 3, 4], [2, 3, 0], project, 0.54);
  assert.equal(vertical[0].axis, "x");
  assert.deepEqual(canonicalEdges(vertical), canonicalEdges(verticalReverse));
  assert.throws(() => acquireEdgeStroke([0, 3, 0], [300, 3, 0], project, 0.54), /256/);
});

test("duplicate edges collapse and elevation cannot drift", () => {
  assert.equal(canonicalEdges([{ cell: [0, 2, 0], axis: "x" }, { cell: [0, 2, 0], axis: "x" }]).length, 1);
  assert.throws(() => acquireEdgeStroke([0, 1, 0], [1, 2, 0], project, 0.54), /elevation/);
});
