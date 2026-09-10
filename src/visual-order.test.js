import test from "node:test";
import assert from "node:assert/strict";
import {
  visualDepth,
  structureDepth,
  waterDepth,
  waterBehindStructure,
} from "./visual-order.js";
const floor = {
  id: "floor",
  type: "floor",
  x: 8,
  z: 8,
  level: 1,
  direction: 0,
  finishedAt: 0,
};
const water = { id: "cell:1,19,127", x: 8, z: 8, height: 2.16 + 0.002 };

test("upper-floor water sorts above support but below the ordinary actor", () => {
  const depth = waterDepth(water, [floor]);
  assert(depth > structureDepth(floor));
  assert(depth < visualDepth(floor, 0.45));
  assert.equal(waterBehindStructure(water, depth, floor), false);
});

test("covering multi-cell art behind the water requires its original silhouette, not anchor retargeting", () => {
  const station = { ...floor, id: "station", type: "brew-station", x: 7, z: 7 };
  const depth = waterDepth(water, [floor, station]);
  assert.equal(structureDepth(station), 14 + 0.35 + 0.15);
  assert.equal(waterBehindStructure(water, depth, station), true);
  assert.equal(
    waterBehindStructure(water, depth, { ...station, x: 2, z: 2 }),
    false,
  );
  assert.equal(
    waterBehindStructure(water, depth, { ...station, level: 0 }),
    false,
  );
  assert.equal(
    waterBehindStructure(water, depth, { ...station, level: 2 }),
    false,
  );
  assert.equal(
    waterBehindStructure(water, depth, { ...floor, type: "wall", z: 9 }),
    false,
  );
});
