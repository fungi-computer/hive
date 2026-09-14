import test from "node:test";
import assert from "node:assert/strict";
import { planTerrainBandUpdates } from "./terrain-band-plan.js";

const surface = (x, y, z, top = y) => ({ cell: [x, y, z], material: 1, generatedTop: top });

test("terrain band plan rebuilds changed and neighboring levels while retaining unrelated levels", () => {
  const before = [surface(0, 0, 0), surface(1, 2, 0), surface(8, 5, 8)];
  const after = [surface(0, 1, 0), surface(1, 2, 0), surface(8, 5, 8)];
  const plan = planTerrainBandUpdates(before, after);
  assert.deepEqual(plan.rebuildLevels, [0, 1, 2]);
  assert.deepEqual(plan.levels, [1, 2, 5]);
});

test("terrain band plan removes vanished levels", () => {
  assert.deepEqual(planTerrainBandUpdates([surface(0, 4, 0)], []).removedLevels, [4]);
});
