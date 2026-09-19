import assert from "node:assert/strict";
import test from "node:test";
import { createCameraGeometryOwner } from "./camera-geometry-owner.js";
import { project } from "./geometry.js";

test("a client's four camera turns share drawing and inverse placement geometry", () => {
  const camera = createCameraGeometryOwner();
  const point = { x: 2, y: 0.27, z: -3 };
  const original = camera.project(point.x, point.y, point.z);
  assert(Math.abs(original.x - project(point.x, point.y, point.z).x) < 1e-7);
  for (let turn = 0; turn < 4; turn++) {
    const screen = camera.project(point.x, point.y, point.z);
    const inverse = camera.planePoint(screen.x, screen.y, point.y);
    assert(Math.abs(inverse.x - point.x) < 1e-7 && Math.abs(inverse.z - point.z) < 1e-7,
      `view ${turn} returns the same world point`);
    assert.deepEqual(camera.terrainPlaneCell(screen.x, screen.y, 0, 0.54), [2,0,-3]);
    camera.rotate(1);
  }
  assert.equal(camera.turn, 0);
  const final = camera.project(point.x, point.y, point.z);
  assert(Math.abs(final.x - original.x) < 1e-7 && Math.abs(final.y - original.y) < 1e-7);
  camera.dispose();
});
