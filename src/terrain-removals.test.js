import test from "node:test";
import assert from "node:assert/strict";
import {
  initialTerrain,
  terrainEnvironment,
  excavateTerrain,
  parseTerrain,
} from "./terrain.ts";
import {
  initialWaterEnvironment,
  prepareWaterEnvironmentGeometry,
  parseWaterEnvironment,
} from "./world-presets/goblin-environment/water-state.ts";
import {
  initialTerrainRemovals,
  prepareTerrainRemoval,
  parseTerrainRemovals,
  removedWaterKg,
} from "./terrain-removals.ts";
import { excavationYield } from "./terrain-yields.ts";
import {
  GOBLIN_FRAME,
  GOBLIN_MAP_SIDE,
} from "./world-presets/goblin-environment/content.ts";

function original() {
  const terrain = initialTerrain(),
    source = { terrain: terrainEnvironment(terrain), sites: [] };
  return {
    terrain,
    source,
    water: initialWaterEnvironment(source),
    removals: initialTerrainRemovals(terrain),
  };
}
function soilTarget(fixture) {
  return fixture.source.terrain.originalSoil.find(
    ([x, , z]) =>
      x >= GOBLIN_FRAME.x &&
      x < GOBLIN_FRAME.x + GOBLIN_MAP_SIDE &&
      z >= GOBLIN_FRAME.z &&
      z < GOBLIN_FRAME.z + GOBLIN_MAP_SIDE,
  );
}
function cut(before, target) {
  const terrain = excavateTerrain(before.terrain, target);
  const source = { terrain: terrainEnvironment(terrain), sites: [] };
  const prepared = prepareWaterEnvironmentGeometry(
    before.water,
    before.source,
    source,
  );
  assert.equal(prepared.status, "applied");
  const removals = prepareTerrainRemoval(
    before.removals,
    before.terrain,
    terrain,
    target,
    prepared.receipt.removedPoreWater,
  );
  return {
    terrain,
    source,
    water: prepared.state,
    removals,
    receipt: prepared.receipt,
  };
}

test("actual soil removal carries its pore water exactly once through cold restore", () => {
  const before = original(),
    target = soilTarget(before),
    after = cut(before, target);
  assert(target);
  const removed = after.receipt.removedPoreWater[0];
  assert.equal(after.removals.length, 1);
  assert.equal(after.removals[0].waterKg, removed.massKg);
  assert(removed.massKg > 0);
  assert.equal(
    after.water.water.initialTotalKg,
    before.water.water.initialTotalKg,
  );
  assert.equal(after.water.water.boundaryKg, -removedWaterKg(after.removals));
  assert.equal(
    excavationYield(before.removals, after.removals, target).material,
    "soil",
  );
  assert.equal(before.removals.length, 0);
  assert.equal(before.terrain.world.revision, 0);
  const terrain = parseTerrain(structuredClone(after.terrain));
  const records = parseTerrainRemovals(
    structuredClone(after.removals),
    terrain,
  );
  assert.deepEqual(records, after.removals);
  assert.deepEqual(
    parseWaterEnvironment(structuredClone(after.water), {
      terrain: terrainEnvironment(terrain),
      sites: [],
    }),
    after.water,
  );
});

test("actual stone removal adds a bulk source without inventing pore water or replacing soil history", () => {
  const first = cut(original(), soilTarget(original()));
  const target = [...first.removals[0].at];
  do target[1]--;
  while (first.source.terrain.material(target) !== 2);
  const second = cut(first, target);
  assert.equal(second.receipt.removedPoreWater.length, 0);
  assert.equal(
    excavationYield(first.removals, second.removals, target).material,
    "stone",
  );
  assert.deepEqual(second.removals[0], first.removals[0]);
  assert.equal(second.removals[1].waterKg, 0);
  assert.equal(second.water.water.boundaryKg, first.water.water.boundaryKg);
});

test("spoil admission rejects unrelated exports, duplicated sources and getter-bearing records", () => {
  const before = original(),
    target = soilTarget(before),
    after = cut(before, target);
  assert.throws(
    () =>
      prepareTerrainRemoval(
        before.removals,
        before.terrain,
        after.terrain,
        target,
        [],
      ),
    /exact water removal receipt/,
  );
  assert.throws(
    () =>
      prepareTerrainRemoval(
        before.removals,
        before.terrain,
        after.terrain,
        target,
        [...after.receipt.removedPoreWater, after.receipt.removedPoreWater[0]],
      ),
    /exact water removal receipt/,
  );
  assert.throws(
    () =>
      parseTerrainRemovals(
        [...after.removals, ...after.removals],
        after.terrain,
      ),
    /actual excavation/,
  );
  const wrong = structuredClone(after.removals);
  wrong[0].at[0]++;
  assert.throws(
    () => parseTerrainRemovals(wrong, after.terrain),
    /exact original material source/,
  );
  let invoked = false;
  const getter = {
    ...after.removals[0],
    get waterKg() {
      invoked = true;
      return 1;
    },
  };
  assert.throws(
    () => parseTerrainRemovals([getter], after.terrain),
    /terrain removal/,
  );
  assert.equal(invoked, false);
});
