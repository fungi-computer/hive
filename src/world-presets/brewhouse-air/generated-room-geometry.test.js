import test from "node:test";
import assert from "node:assert/strict";
import {
  initialTerrain,
  terrainGeometry,
  TERRAIN_FRAME,
} from "../goblin-terrain.ts";
import { createStructureGeometry } from "../../structure-environment.ts";
import {
  generatedBrewhouseRoom,
  roomExteriorBoundary,
} from "./generated-room.ts";
import { BREWHOUSE_ROOM } from "./room.ts";
const world = ([x, y, z]) => [
  x + TERRAIN_FRAME.x,
  y + TERRAIN_FRAME.y,
  z + TERRAIN_FRAME.z,
];
const bounds = {
  min: world(BREWHOUSE_ROOM.bounds.min),
  max: world(BREWHOUSE_ROOM.bounds.max),
};
function query(sites) {
  const terrain = terrainGeometry(initialTerrain());
  return createStructureGeometry(
    { terrain, sites },
    {
      min: world([2, -1, 2]),
      max: [...world([12, 0, 11])].map((v, i) =>
        i === 1 ? terrain.bounds.max[1] : v,
      ),
    },
  );
}
function wallColumn(level, x, z) {
  const isPerimeter = x === 4 || x === 9 || z === 4 || z === 8,
    isDoor = z === 8 && x === (level === 0 ? 6 : 7);
  if (!isPerimeter || isDoor) return [];
  const cells = [];
  for (let y = level * 4; y < (level + 1) * 4; y++)
    cells.push(`cell:${world([x, y, z]).join()}`);
  return cells;
}
function expectedWallCells() {
  const cells = [];
  for (let level = 0; level < 2; level++)
    for (let x = 4; x <= 9; x++)
      for (let z = 4; z <= 8; z++) cells.push(...wallColumn(level, x, z));
  return cells.sort();
}
function expectedInteriorFaces() {
  const faces = [];
  for (let x = 5; x <= 8; x++)
    for (let z = 5; z <= 7; z++) {
      if (x !== 8) faces.push(`y:${world([x, 4, z]).join()}`);
      faces.push(`y:${world([x, 8, z]).join()}`);
    }
  return faces.sort();
}
function openRoom() {
  return generatedBrewhouseRoom(initialTerrain(), {
    open: true,
    revision: 0,
  });
}
function assertWallGeometry(room) {
  assert.deepEqual(room.definition.size, [8, 9, 7]);
  assert.deepEqual(
    [...room.definition.openSides].sort(),
    ["x-", "x+", "z-", "z+", "y+"].sort(),
  );
  assert(
    !room.definition.openSides.includes("y-"),
    "wholly closed floor retains the existing no-slip side policy",
  );
  assert.deepEqual(room.definition.solidCells, expectedWallCells());
}
function checkedExterior(room) {
  const expectedFaces = expectedInteriorFaces(),
    physical = query(BREWHOUSE_ROOM.sites),
    raster = physical.region(bounds),
    exterior = roomExteriorBoundary(physical, bounds, room.ambientPlaneY);
  assert.deepEqual(raster.closedFaceIds, expectedFaces);
  assert.deepEqual(
    [...room.definition.closedFaces].sort(),
    [...new Set([...expectedFaces, ...exterior.closedFaces])].sort(),
  );
  return { exterior, physical };
}
function assertGroundCollar(room, physical, exterior) {
  assert.equal(
    room.ambientPlaneY,
    terrainGeometry(initialTerrain()).bounds.max[1],
  );
  assert.equal(
    physical.exterior(world([3, 0, 5]), "x", -1, room.ambientPlaneY),
    "outdoor",
  );
  for (let x = 3; x < 11; x++)
    for (let z = 3; z < 10; z++)
      assert(exterior.closedFaces.includes(`y:${world([x, 0, z]).join()}`));
}

test("registered504-cell room preserves exact wall and interior-face geometry with checked exterior masks", () => {
  const room = openRoom();
  assertWallGeometry(room);
  const { physical, exterior } = checkedExterior(room);
  assertGroundCollar(room, physical, exterior);
});

test("roof outside the raster leaves an empty continuation that the actual producer refuses", () => {
  const sites = [
    ...BREWHOUSE_ROOM.sites,
    {
      id: "outside-roof",
      type: "roof",
      x: 2,
      z: 5,
      level: 1,
      direction: 0,
      finishedAt: 0,
    },
  ];
  const original = query(BREWHOUSE_ROOM.sites),
    roofed = query(sites);
  assert.deepEqual(
    roofed.region(bounds).solidCellIds,
    original.region(bounds).solidCellIds,
  );
  assert.deepEqual(
    roofed.region(bounds).closedFaceIds,
    original.region(bounds).closedFaceIds,
  );
  const plane = terrainGeometry(initialTerrain()).bounds.max[1];
  assert.equal(roofed.point(world([2, 0, 5])), "empty");
  assert.equal(
    roofed.exterior(world([3, 0, 5]), "x", -1, plane),
    "needs-neighbor",
  );
  assert.throws(
    () => roomExteriorBoundary(roofed, bounds, plane),
    /needs neighboring air region/,
  );
  assert.equal(
    roofed.face("x", world([3, 0, 5])),
    "open",
    "rejection must not fabricate a wall",
  );
});
