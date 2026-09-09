import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import {
  authoredClearingTerrain,
  removeShallowVoxel,
  backfillShallowVoxel,
} from "./terrain.ts";
import { terrainSurfaces } from "./terrain-surface-geometry.js";
import { createTerrainPicker } from "./terrain-picking.js";
import { worldCamera, WIDTH, HEIGHT } from "./art/scale.js";

function pixel(x, y, z) {
  const p = new Vector3(x - 7, y, z - 7).project(worldCamera);
  return { x: ((p.x + 1) * WIDTH) / 2, y: ((1 - p.y) * HEIGHT) / 2 };
}

test("shallow face picking matches real floor and occluding rim after edits and reload", () => {
  const terrain = authoredClearingTerrain();
  const picker = createTerrainPicker(15);
  picker.update(terrain);
  assert.deepEqual(picker.pick(pixel(7, 0, 7)).cell, { x: 7, z: 7, level: 0 });
  removeShallowVoxel(terrain, { x: 7, z: 7, level: 0 });
  picker.update(terrain);
  const floor = picker.pick(pixel(6.65, -0.54, 6.65));
  assert.equal(floor.kind, "pit-floor");
  assert.deepEqual(floor.cell, { x: 7, z: 7, level: 0 });
  const wall = picker.pick(pixel(6.5, -0.25, 7));
  assert.equal(wall.kind, "cut-wall");
  assert.deepEqual(wall.cell, floor.cell);
  assert.deepEqual(wall.owner, { x: 6, z: 7, level: 0 });
  // A point on the far part of the floor is hidden by the nearer intact rim.
  assert.equal(picker.pick(pixel(7.49, -0.54, 7.49)).kind, "ground");
  const loaded = structuredClone(terrain);
  picker.update(loaded);
  assert.deepEqual(picker.pick(pixel(6.65, -0.54, 6.65)).cell, floor.cell);
  backfillShallowVoxel(loaded, floor.cell);
  picker.update(loaded);
  assert.equal(picker.pick(pixel(7, 0, 7)).kind, "ground");
  assert.equal(picker.pick({ x: 0, y: 0 }), null);
});

test("adjacent cuts expose a continuous floor without an internal earth wall", () => {
  const terrain = authoredClearingTerrain();
  for (const x of [6, 7]) removeShallowVoxel(terrain, { x, z: 7, level: 0 });
  const faces = terrainSurfaces(terrain, 15);
  assert.equal(faces.filter((f) => f.kind === "pit-floor").length, 2);
  assert.equal(faces.filter((f) => f.kind === "cut-wall").length, 6);
  assert.ok(
    !faces.some(
      (f) => f.kind === "cut-wall" && f.vertices.every((v) => v.x === 6.5),
    ),
  );
});
