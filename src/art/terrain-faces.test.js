import assert from "node:assert/strict";
import { test } from "node:test";
import {
  affectedTerrainColumns,
  changedTerrainColumns,
  terrainFaceBounds,
  terrainChunkKey,
} from "./terrain-faces.js";

const surface = (x, y, z, material = 1) => ({ cell: [x, y, z], material });

test("terrain diff uses column content and reports removals", () => {
  const before = [surface(0, 2, 0), surface(1, 3, 0)];
  const after = [surface(0, 2, 0), surface(1, 4, 0), surface(2, 1, 0)];
  assert.deepEqual(changedTerrainColumns(before, after), [
    { x: 1, z: 0 },
    { x: 2, z: 0 },
  ]);
  assert.deepEqual(changedTerrainColumns(after, [surface(0, 2, 0)]), [
    { x: 1, z: 0 },
    { x: 2, z: 0 },
  ]);
});

test("height changes include neighboring wall owners and chunk grouping handles signed cells", () => {
  assert.deepEqual(affectedTerrainColumns([{ x: 8, z: -1 }]), [
    { x: 7, z: -1 },
    { x: 8, z: -2 },
    { x: 8, z: -1 },
    { x: 8, z: 0 },
    { x: 9, z: -1 },
  ]);
  assert.equal(terrainChunkKey(-1, -1), "-1,-1");
  assert.equal(terrainChunkKey(8, -1), "1,-1");
});

test("dirty bounds include the old and new neighbor wall heights", () => {
  const before = [surface(0, 4, 0), surface(1, 1, 0)];
  const after = [surface(0, 2, 0), surface(1, 1, 0)];
  const bounds = terrainFaceBounds(
    before,
    [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
    1,
    (x, y, z) => ({ x: x * 10, y: y * 10 + z }),
  );
  const next = terrainFaceBounds(
    after,
    [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ],
    1,
    (x, y, z) => ({ x: x * 10, y: y * 10 + z }),
  );
  assert.deepEqual(bounds, { left: -5, top: 4.5, right: 15, bottom: 45.5 });
  assert.deepEqual(next, { left: -5, top: 4.5, right: 15, bottom: 25.5 });
});
