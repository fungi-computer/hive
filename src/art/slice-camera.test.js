import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { camera } from "./prop-camera.js";
import { sliceCamera } from "./slice-camera.js";

test("signed high/deep slice depth fits without changing original screen projection", () => {
  const original = camera(640, 400, 1.03);
  const originalPosition = original.position.clone();
  const vertices = [
    { x: 14, y: (59 - 15) * 0.54, z: 14 },
    { x: 0, y: (-64 - 15) * 0.54, z: 0 },
    // Foreground depth-mask vertex, not only the liquid crop.
    { x: 14, y: 0, z: 14 },
  ];
  const fitted = sliceCamera(original, vertices);
  for (const { x, y, z } of vertices) {
    const point = new THREE.Vector3(x - 7, y, z - 7);
    const before = point.clone().project(original),
      after = point.clone().project(fitted);
    assert(Math.abs(before.x - after.x) < 1e-12);
    assert(Math.abs(before.y - after.y) < 1e-12);
    assert(after.z > -1 && after.z < 1);
  }
  assert.deepEqual(original.position, originalPosition);
  assert.equal(original.near, 0.1);
  assert.equal(original.far, 80);
});
