import test from "node:test";
import assert from "node:assert/strict";
import { createVoxelWorld, MATERIAL } from "./height-caves.mjs";
import {
  initialTerrain,
  parseTerrain,
  advanceTerrain,
  excavateTerrain,
  terrainCell,
  terrainChangedColumns,
  terrainExcavatedColumns,
  terrainGeometry,
  terrainGeometryKey,
  terrainMaterial,
  terrainDigProblem,
  TERRAIN_FRAME,
  TERRAIN_VOXEL_METRIC,
  terrainWater,
} from "./goblin-terrain.ts";
const first = [0, 14, 128],
  second = [1, 14, 128];

test("terrain projection: all225 column outcomes agree with actual world before and after an exact cut", () => {
  const original = initialTerrain(),
    cut = excavateTerrain(original, first);
  for (const state of [original, cut]) {
    const world = createVoxelWorld(state.world.identity, {
        checkpoint: state.world,
      }),
      changed = [];
    for (let x = 0; x < 15; x++)
      for (let z = 0; z < 15; z++) {
        const wx = x + TERRAIN_FRAME.x,
          wz = z + TERRAIN_FRAME.z;
        const solid = world.readPoint({ x: wx, y: 14, z: wz }) !== MATERIAL.air;
        const fact = terrainCell(state, x, z);
        assert.equal(fact.support, solid);
        assert.equal(fact.solid, solid);
        assert.equal(
          world.readPoint({ x: wx, y: fact.voxel[1], z: wz }) === MATERIAL.air,
          false,
        );
        assert.equal(
          world.readPoint({ x: wx, y: fact.voxel[1] + 1, z: wz }),
          MATERIAL.air,
        );
        assert.equal(
          fact.height,
          (fact.voxel[1] + 1 - TERRAIN_FRAME.y) *
            TERRAIN_VOXEL_METRIC.verticalM,
        );
        if (!solid) changed.push({ x, z, level: 0 });
      }
    assert.deepEqual(terrainChangedColumns(state), changed);
  }
  assert.deepEqual(terrainExcavatedColumns(original), []);
  assert.deepEqual(terrainExcavatedColumns(cut), [{ x: 7, z: 9, level: 0 }]);
  for (const at of [
    [-1, 0],
    [15, 0],
    [0, 15],
    [0.5, 1],
  ])
    assert.throws(() => terrainCell(cut, ...at), /outside-clearing-terrain/);
  const geometry = terrainGeometry(cut);
  assert.throws(
    () => geometry.solidAt(0, geometry.bounds.max[1], 128),
    /outside world bounds/,
  );
});

test("terrain projection: known water-only transitions reuse geometry while actual water facts change", () => {
  const cut = excavateTerrain(initialTerrain(), first);
  const column = terrainCell(cut, 7, 9),
    changed = terrainChangedColumns(cut),
    excavated = terrainExcavatedColumns(cut),
    geometry = terrainGeometry(cut);
  const before = terrainWater(cut),
    advanced = advanceTerrain(cut, 0.05);
  assert.strictEqual(terrainCell(advanced, 7, 9), column);
  assert.strictEqual(terrainChangedColumns(advanced), changed);
  assert.strictEqual(terrainExcavatedColumns(advanced), excavated);
  assert.strictEqual(terrainGeometry(advanced), geometry);
  assert.equal(terrainGeometryKey(advanced), terrainGeometryKey(cut));
  assert.notDeepEqual(terrainWater(advanced), before);
  assert.equal(advanced.soilState.timeS, 0.05);
  assert.equal(cut.soilState.timeS, 0);
});

test("terrain projection: edits and fresh restores isolate equal-revision branches and retain old facts", () => {
  const original = initialTerrain(),
    old = terrainGeometry(original);
  const a = excavateTerrain(original, first),
    b = excavateTerrain(original, second);
  assert.equal(a.world.revision, b.world.revision);
  assert.notEqual(terrainGeometryKey(a), terrainGeometryKey(b));
  assert.equal(terrainCell(a, 7, 9).support, false);
  assert.equal(terrainCell(b, 7, 9).support, true);
  assert.equal(terrainCell(a, 8, 9).support, true);
  assert.equal(terrainCell(b, 8, 9).support, false);
  for (const state of [a, b]) {
    const restored = parseTerrain(structuredClone(state));
    assert.notStrictEqual(
      terrainCell(restored, 7, 9),
      terrainCell(state, 7, 9),
    );
    assert.deepEqual(
      terrainChangedColumns(restored),
      terrainChangedColumns(state),
    );
    assert.deepEqual(
      terrainExcavatedColumns(restored),
      terrainExcavatedColumns(state),
    );
  }
  assert.equal(old.solidAt(...first), true);
  assert.equal(terrainGeometry(a).solidAt(...first), false);
});

test("terrain projection: detached public facts and mutable unknown wires cannot poison retained queries", () => {
  const a = excavateTerrain(initialTerrain(), first),
    before = JSON.stringify(a);
  assert.throws(() => {
    terrainCell(a, 7, 9).voxel[1] = 99;
  }, TypeError);
  assert.throws(
    () => terrainChangedColumns(a).push({ x: 1, z: 1, level: 0 }),
    TypeError,
  );
  assert.throws(() => {
    terrainExcavatedColumns(a)[0].x = 99;
  }, TypeError);
  assert.throws(() => {
    terrainGeometry(a).bounds.min[1] = 99;
  }, TypeError);
  const wire = structuredClone(a);
  assert.equal(terrainWater(wire)[0].x, 7);
  assert.equal(terrainCell(wire, 7, 9).support, false);
  Object.assign(
    wire,
    structuredClone(excavateTerrain(initialTerrain(), second)),
  );
  assert.equal(terrainCell(wire, 7, 9).support, true);
  assert.equal(terrainWater(wire)[0].x, 8);
  wire.exports[0].waterKg += 1;
  assert.throws(() => terrainCell(wire, 7, 9), /retain the original water/);
  assert.throws(() => terrainWater(wire), /retain the original water/);
  assert.equal(JSON.stringify(a), before);
  assert.equal(terrainCell(a, 7, 9).support, false);
});

test("terrain projection: positive solid queries never replace actual excavation admission", () => {
  const original = initialTerrain(),
    collar = [-1, 14, 128];
  assert.equal(terrainMaterial(original, collar), MATERIAL.soil);
  terrainChangedColumns(original);
  terrainGeometry(original);
  assert(terrainDigProblem(original, collar));
  const cut = excavateTerrain(original, first);
  terrainChangedColumns(cut);
  terrainGeometry(cut);
  assert.throws(() => excavateTerrain(cut, first));
  assert.equal(terrainCell(original, 7, 9).support, true);
});
