import test from "node:test";
import assert from "node:assert/strict";
import { terrainCameraFocus } from "./camera-focus.js";

const terrain = { verticalMetres: 0.5, surfaces: [{ cell: [0, 12, 0], material: 1 }] };

test("terrain focus follows published visible actors", () => {
  assert.deepEqual(terrainCameraFocus([
    { id: "worker", visual: "goblin.worker", pose: { position: { x: 2, y: 6.5, z: -1 } } },
    { id: "guest", visual: "goblin.guest", pose: { position: { x: 4, y: 7.5, z: 1 } } },
  ], terrain), { x: 3, y: 7, z: 0 });
});

test("terrain focus falls back to the published surface projection", () => {
  assert.deepEqual(terrainCameraFocus([], terrain), { x: 0, y: 6.25, z: 0 });
  assert.equal(terrainCameraFocus([], { ...terrain, surfaces: [] }), null);
  assert.equal(terrainCameraFocus([], null), null);
});
