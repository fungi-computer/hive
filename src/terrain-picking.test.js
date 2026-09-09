import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import {
  initialTerrain,
  excavateTerrain,
  advanceTerrain,
  parseTerrain,
} from "./terrain.ts";
import { terrainSurfaces } from "./terrain-surface-geometry.js";
import { createTerrainPicker } from "./terrain-picking.js";
import { worldCamera, WIDTH, HEIGHT } from "./art/scale.js";

function pixel(x, y, z) {
  const p = new Vector3(x - 7, y, z - 7).project(worldCamera);
  return { x: ((p.x + 1) * WIDTH) / 2, y: ((1 - p.y) * HEIGHT) / 2 };
}

test("generated face picking matches real floor and occluding rim after edits and reload", () => {
  let terrain = initialTerrain();
  const picker = createTerrainPicker(15);
  picker.update(terrain);
  assert.deepEqual(picker.pick(pixel(7, 0, 9)).cell, { x: 7, z: 9, level: 0 });
  terrain = excavateTerrain(terrain, [0, 14, 128]);
  picker.update(terrain);
  const floor = picker.pick(pixel(6.65, -0.54, 8.65));
  assert.equal(floor.kind, "pit-floor");
  assert.deepEqual(floor.cell, { x: 7, z: 9, level: 0 });
  const wall = picker.pick(pixel(6.5, -0.25, 9));
  assert.equal(wall.kind, "cut-wall");
  assert.deepEqual(wall.cell, floor.cell);
  assert.deepEqual(wall.owner, { x: 6, z: 9, level: 0 });
  // A point on the far part of the floor is hidden by the nearer intact rim.
  assert.equal(picker.pick(pixel(7.49, -0.54, 9.49)).kind, "ground");
  const loaded = parseTerrain(terrain);
  picker.update(loaded);
  assert.deepEqual(picker.pick(pixel(6.65, -0.54, 8.65)).cell, floor.cell);
  picker.update(advanceTerrain(loaded, 0.05));
  assert.deepEqual(
    picker.pick(pixel(6.65, -0.54, 8.65)).ownerVoxel,
    [0, 13, 128],
  );
  assert.equal(picker.pick({ x: 0, y: 0 }), null);
});

test("adjacent cuts expose a continuous floor without an internal earth wall", () => {
  let terrain = initialTerrain();
  for (const x of [0, 1]) terrain = excavateTerrain(terrain, [x, 14, 128]);
  const faces = terrainSurfaces(terrain, 15).filter(
    (f) => f.cell.z === 9 && [7, 8].includes(f.cell.x),
  );
  assert.equal(faces.filter((f) => f.kind === "pit-floor").length, 2);
  assert.equal(faces.filter((f) => f.kind === "cut-wall").length, 6);
  assert.ok(
    !faces.some(
      (f) => f.kind === "cut-wall" && f.vertices.every((v) => v.x === 7.5),
    ),
  );
});
