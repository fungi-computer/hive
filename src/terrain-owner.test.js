import test from "node:test";
import assert from "node:assert/strict";
import {
  initialTerrain,
  parseTerrain,
  terrainEnvironment,
  terrainGeometry,
  terrainMaterial,
  terrainCell,
  terrainDigProblem,
  excavateTerrain,
  terrainExcavatedVoxels,
  terrainExcavatedColumns,
  terrainGeometryKey,
  terrainRevision,
  TERRAIN_FRAME,
} from "./terrain.ts";
import { createVoxelWorld, MATERIAL } from "./world-presets/height-caves.mjs";
import {
  GOBLIN_WORLD_IDENTITY,
  GOBLIN_MAP_SIDE,
} from "./world-presets/goblin-environment/content.ts";

const soil = [0, 14, 128],
  stone = [0, 12, 128];

test("one generated terrain covers every playable column without a wet-fixture admission list", () => {
  const state = initialTerrain();
  assert.deepEqual(Object.keys(state).sort(), ["identity", "version", "world"]);
  assert.equal(terrainEnvironment(state).terrain, terrainGeometry(state));
  assert.equal(terrainEnvironment(state), terrainEnvironment(state));
  for (let x = 0; x < GOBLIN_MAP_SIDE; x++)
    for (let z = 0; z < GOBLIN_MAP_SIDE; z++) {
      const fact = terrainCell(state, x, z);
      assert(
        [MATERIAL.soil, MATERIAL.stone].includes(
          terrainMaterial(state, [...fact.voxel]),
        ),
      );
      assert.equal(terrainDigProblem(state, [...fact.voxel]), null);
    }
  assert.notEqual(
    terrainDigProblem(state, [TERRAIN_FRAME.x - 1, 14, 128]),
    null,
  );
  assert.notEqual(terrainDigProblem(state, [0, -65, 128]), null);
  assert.notEqual(terrainDigProblem(state, [0, 64, 128]), null);
});

test("voxel-only successors retain original soil and stone identity without water or yields", () => {
  const original = initialTerrain(),
    bytes = JSON.stringify(original);
  assert.equal(terrainMaterial(original, soil), MATERIAL.soil);
  assert.equal(terrainMaterial(original, stone), MATERIAL.stone);
  const first = excavateTerrain(original, soil),
    second = excavateTerrain(first, stone);
  assert.equal(JSON.stringify(original), bytes);
  assert.equal(terrainMaterial(first, stone), MATERIAL.stone);
  assert.equal(terrainMaterial(second, soil), MATERIAL.air);
  assert.equal(terrainMaterial(second, stone), MATERIAL.air);
  assert.equal(terrainRevision(second), terrainRevision(original) + 2);
  const records = new Map(
    terrainExcavatedVoxels(second).map((record) => [
      record.at.join(),
      record.materialId,
    ]),
  );
  assert.deepEqual(
    records,
    new Map([
      [stone.join(), MATERIAL.stone],
      [soil.join(), MATERIAL.soil],
    ]),
  );
  assert.equal(terrainExcavatedColumns(second).length, 1);
  assert.equal(terrainExcavatedVoxels(original).length, 0);
  assert.throws(() => excavateTerrain(second, soil), /already empty/);
  assert.deepEqual(parseTerrain(JSON.parse(JSON.stringify(second))), second);
  assert.throws(() => {
    terrainExcavatedVoxels(second)[0].at[1] = 999;
  });
});

test("natural empty cells are not excavated records and mutable/parallel inputs cannot alias", () => {
  const original = initialTerrain();
  assert.equal(terrainMaterial(original, [0, 15, 128]), MATERIAL.air);
  assert.equal(terrainExcavatedVoxels(original).length, 0);
  const a = excavateTerrain(original, soil),
    b = excavateTerrain(original, stone);
  assert.equal(terrainRevision(a), terrainRevision(b));
  assert.notEqual(terrainGeometryKey(a), terrainGeometryKey(b));
  assert.equal(terrainMaterial(a, stone), MATERIAL.stone);
  assert.equal(terrainMaterial(b, soil), MATERIAL.soil);
  const external = JSON.parse(JSON.stringify(original));
  assert.equal(terrainMaterial(external, soil), MATERIAL.soil);
  external.world = JSON.parse(JSON.stringify(a.world));
  assert.equal(terrainMaterial(external, soil), MATERIAL.air);
  assert.equal(terrainMaterial(original, soil), MATERIAL.soil);
});

test("current restore rejects retired fields, foreign edits and non-removal material changes", () => {
  const state = initialTerrain();
  assert.throws(() => parseTerrain({ ...state, soilState: {} }));
  assert.throws(() => parseTerrain({ ...state, exports: [] }));
  assert.throws(() => parseTerrain({ ...state, version: 0 }));
  function edited(at, material) {
    const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY, {
      checkpoint: state.world,
    });
    assert(
      world.edit({
        expectedRevision: state.world.revision,
        cells: [{ ...at, material, expectedMaterial: world.readPoint(at) }],
      }).ok,
    );
    return { ...state, world: world.save() };
  }
  assert.throws(
    () =>
      parseTerrain(
        edited({ x: TERRAIN_FRAME.x - 1, y: 12, z: 128 }, MATERIAL.air),
      ),
    /outside the playable/,
  );
  assert.throws(
    () => parseTerrain(edited({ x: 0, y: 15, z: 128 }, MATERIAL.soil)),
    /only original soil or stone removal/,
  );
});
