import assert from "node:assert/strict";
import test from "node:test";
import {
  createVisibleHitArea,
  createVisibleSilhouette,
} from "./visual-hit-geometry.js";

function rgba(width, pixels) {
  const data = new Uint8ClampedArray(width * width * 4);
  for (const [x, y] of pixels) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

test("visible silhouette keeps tall body pixels and rejects transparent padding", () => {
  const shape = createVisibleSilhouette(
    rgba(5, [
      [2, 0],
      [2, 1],
      [1, 2],
      [2, 2],
      [3, 2],
    ]),
    5,
    5,
  );
  assert.deepEqual(Array.from(shape.rows), [0, 1, 2, 3, 3, 3]);
  assert.deepEqual(Array.from(shape.spans), [2, 2, 2, 2, 1, 3]);
});

test("silhouette contains uses sprite-local coordinates and anchor", () => {
  const shape = createVisibleSilhouette(rgba(4, [[1, 2]]), 4, 4),
    hit = createVisibleHitArea(shape, { x: 0.5, y: 0.75 });
  assert.equal(hit.contains(-0.5, -0.5), true);
  assert.equal(hit.contains(-1.5, -1.5), false);
});
