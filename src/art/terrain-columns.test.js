import assert from "node:assert/strict";
import { test } from "node:test";
import { createTerrainSceneCache } from "./terrain-columns.js";

const surface = (x, y, z, material = 1) => ({ cell: [x, y, z], material });

test("terrain scene cache retains unaffected chunks and rebuilds neighbor chunks", () => {
  const cache = createTerrainSceneCache({ verticalMetres: 1 });
  const initial = Array.from({ length: 24 }, (_, x) => surface(x, 1, 0));
  const first = cache.update(initial);
  assert.equal(first.initial, true);
  assert.deepEqual(first.dirtyChunks, ["0,0", "1,0", "2,0"]);
  const firstGroups = [...cache.scene.children].filter(
    (child) => child.isGroup,
  );
  const changed = initial.map((entry) =>
    entry.cell[0] === 7 ? surface(7, 3, 0) : entry,
  );
  const second = cache.update(changed);
  assert.deepEqual(second.changedColumns, [{ x: 7, z: 0 }]);
  assert.deepEqual(second.affectedColumns, [
    { x: 6, z: 0 },
    { x: 7, z: -1 },
    { x: 7, z: 0 },
    { x: 7, z: 1 },
    { x: 8, z: 0 },
  ]);
  assert.deepEqual(second.dirtyChunks, ["0,-1", "0,0", "1,0"]);
  const secondGroups = [...cache.scene.children].filter(
    (child) => child.isGroup,
  );
  assert.equal(secondGroups.length, 3);
  assert.notEqual(secondGroups[0], firstGroups[0]);
  assert.notEqual(secondGroups[1], firstGroups[1]);
  assert.ok(secondGroups.includes(firstGroups[2]));
  cache.dispose();
});

test("identical projection content does not rebuild a chunk", () => {
  const cache = createTerrainSceneCache({ verticalMetres: 1 });
  const surfaces = [surface(0, 1, 0)];
  cache.update(surfaces);
  const group = [...cache.scene.children].find((child) => child.isGroup);
  const update = cache.update([surface(0, 1, 0)]);
  assert.deepEqual(update.changedColumns, []);
  assert.deepEqual(update.dirtyChunks, []);
  assert.equal(
    [...cache.scene.children].find((child) => child.isGroup),
    group,
  );
  cache.dispose();
});
