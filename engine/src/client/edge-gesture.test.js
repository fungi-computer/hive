import test from "node:test";
import assert from "node:assert/strict";
import { acquireEdgeStroke, canonicalEdges, edgeSegmentEndpoints, nearestGridSegment } from "./edge-gesture.js";

const verticalMetres = 0.54;
const project = (x, y, z) => ({ x: (x - z) * 32, y: (x + z) * 16 - y * 20 });

test("each face uses the physical half-cell boundary and the picked cell supplies four choices", () => {
  const height = 3.5 * verticalMetres;
  assert.deepEqual(edgeSegmentEndpoints({ cell: [2, 3, 4], axis: "x" }, verticalMetres), [
    [2.5, height, 3.5], [2.5, height, 4.5],
  ]);
  assert.deepEqual(edgeSegmentEndpoints({ cell: [2, 3, 4], axis: "z" }, verticalMetres), [
    [1.5, height, 4.5], [2.5, height, 4.5],
  ]);
  const east = project(2.5, height, 4);
  const north = project(2, height, 3.5);
  assert.deepEqual(nearestGridSegment(east, project, [2, 3, 4], verticalMetres), { cell: [2, 3, 4], axis: "x", distance: 0 });
  assert.deepEqual(nearestGridSegment(north, project, [2, 3, 4], verticalMetres), { cell: [2, 3, 3], axis: "z", distance: 0 });
});

test("edge strokes are inclusive, reverse-invariant, line-locked and bounded", () => {
  const forward = acquireEdgeStroke({ cell: [0, 3, 0], axis: "z" }, [4, 3, 0]);
  const reverse = acquireEdgeStroke({ cell: [4, 3, 0], axis: "z" }, [0, 3, 0]);
  assert.equal(forward.length, 5);
  assert.deepEqual(canonicalEdges(forward), canonicalEdges(reverse));
  const vertical = acquireEdgeStroke({ cell: [2, 3, 0], axis: "x" }, [2, 3, 4]);
  assert.equal(vertical.length, 5);
  assert.throws(() => acquireEdgeStroke({ cell: [0, 3, 0], axis: "z" }, [256, 3, 0]), /256/);
  assert.throws(() => acquireEdgeStroke({ cell: [2, 3, 0], axis: "x" }, [3, 3, 4]), /initial grid line/);
  assert.throws(() => acquireEdgeStroke({ cell: [0, 1, 0], axis: "z" }, [1, 2, 0]), /elevation/);
});

test("duplicate edges collapse in numeric canonical order", () => {
  assert.deepEqual(canonicalEdges([
    { cell: [10, 2, 0], axis: "x" }, { cell: [-1, 2, 0], axis: "z" },
    { cell: [2, 2, 0], axis: "x" }, { cell: [2, 2, 0], axis: "x" },
  ]), [
    { cell: [-1, 2, 0], axis: "z" }, { cell: [2, 2, 0], axis: "x" }, { cell: [10, 2, 0], axis: "x" },
  ]);
});
