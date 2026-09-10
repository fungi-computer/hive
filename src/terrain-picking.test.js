import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { initialTerrain, excavateTerrain, parseTerrain } from "./terrain.ts";
import { terrainFacesInRectangle } from "./camera.js";
import { terrainDesignationCells } from "./ui-actions.ts";
import {
  observedTerrainSurfaces,
  terrainSurfaces,
} from "./terrain-surface-geometry.js";
import { createTerrainPicker } from "./terrain-picking.js";
import { worldCamera, WIDTH, HEIGHT } from "./art/scale.js";

function pixel(x, y, z) {
  const p = new Vector3(x - 7, y, z - 7).project(worldCamera);
  return { x: ((p.x + 1) * WIDTH) / 2, y: ((1 - p.y) * HEIGHT) / 2 };
}

test("generated face picking matches real floor and occluding rim after edits and reload", () => {
  let terrain = initialTerrain();
  const picker = createTerrainPicker(15);
  picker.update(terrainSurfaces(terrain, 15));
  assert.deepEqual(picker.pick(pixel(7, 0, 9)).cell, { x: 7, z: 9, level: 0 });
  terrain = excavateTerrain(terrain, [0, 14, 128]);
  picker.update(terrainSurfaces(terrain, 15));
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
  picker.update(terrainSurfaces(loaded, 15));
  assert.deepEqual(picker.pick(pixel(6.65, -0.54, 8.65)).cell, floor.cell);
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

test("underground rectangle and single-face selection share exact observed voxel owners", () => {
  // Authored remembered slice only, not an earned chamber or visibility proof.
  const observed = [];
  for (const x of [0, 1]) {
    observed.push({
      at: { x, y: 11, z: 128 },
      solid: false,
      terrainSolid: false,
      faces: [false, false, false, false, false, false],
    });
    observed.push({
      at: { x, y: 10, z: 128 },
      solid: true,
      terrainSolid: true,
      faces: [false, false, false, false, false, false],
    });
  }
  const faces = observedTerrainSurfaces({ version: 1, observed }, -1);
  const picker = createTerrainPicker(15);
  picker.update(faces);
  const selected = terrainFacesInRectangle(
    picker,
    faces,
    { x: -1000, y: -1000 },
    { x: 2000, y: 2000 },
    -1,
  );
  assert.deepEqual(terrainDesignationCells("dig", selected), [
    { kind: "dig", voxel: [0, 10, 128] },
    { kind: "dig", voxel: [1, 10, 128] },
  ]);
  const at = pixel(7, -2.16, 9);
  assert.deepEqual(terrainFacesInRectangle(picker, faces, at, at, -1), [
    picker.pick(at),
  ]);
  assert.deepEqual(terrainFacesInRectangle(picker, faces, null, at, 0), []);
  picker.update([]);
  assert.deepEqual(
    terrainFacesInRectangle(
      picker,
      [],
      { x: -1000, y: -1000 },
      { x: 2000, y: 2000 },
      -1,
    ),
    [],
  );
});

test("a rectangle cannot designate a face hidden behind the nearest current slice face", () => {
  const rear = {
    kind: "pit-floor",
    cell: { x: 7, z: 7, level: -1 },
    ownerVoxel: [0, 10, 126],
    vertices: [
      { x: 6.5, y: -2.16, z: 6.5 },
      { x: 7.5, y: -2.16, z: 6.5 },
      { x: 7.5, y: -2.16, z: 7.5 },
      { x: 6.5, y: -2.16, z: 7.5 },
    ],
  };
  const front = {
    ...rear,
    ownerVoxel: [0, 11, 126],
    vertices: [
      { x: 4, y: -1.62, z: 4 },
      { x: 10, y: -1.62, z: 4 },
      { x: 10, y: -1.62, z: 10 },
      { x: 4, y: -1.62, z: 10 },
    ],
  };
  const picker = createTerrainPicker(15);
  const faces = [rear, front];
  picker.update(faces);
  const selected = terrainFacesInRectangle(
    picker,
    faces,
    { x: -1000, y: -1000 },
    { x: 2000, y: 2000 },
    -1,
  );
  assert(!selected.includes(rear));
  assert(selected.includes(front));
});
