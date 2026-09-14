import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlacementArtTransform, resolveStairArtEndpoints, rotatePlacementPoint } from "./art-placement.js";

test("long retained footprints align all cells for both axial facings", () => {
  const north = resolvePlacementArtTransform({
    physicalFootprint: [[4, 7], [4, 8]],
    bakedFootprint: [[0, 0], [0, 1]],
    orientation: "north",
  });
  assert.deepEqual(north.offset, [4, 7]);
  assert.deepEqual(north.alignedFootprint, [[4, 7], [4, 8]]);

  const east = resolvePlacementArtTransform({
    physicalFootprint: [[4, 7], [5, 7]],
    bakedFootprint: [[0, 0], [0, 1]],
    orientation: "east",
  });
  assert.deepEqual([...east.alignedFootprint].sort(), [[4, 7], [5, 7]]);
});

test("datum mismatch is rejected instead of stretching or mirroring original pixels", () => {
  assert.throws(() => resolvePlacementArtTransform({
    physicalFootprint: [[0, 0], [1, 0], [2, 0]],
    bakedFootprint: [[0, 0], [0, 1]],
    orientation: "north",
  }), /footprint does not match/);
});

test("native cardinal transform and retained stair endpoints stay paired", () => {
  assert.deepEqual(rotatePlacementPoint([1, 2], "east"), [-2, 1]);
  for (const orientation of ["north", "east", "south", "west"]) {
    const entrance = rotatePlacementPoint([0, 0], orientation);
    const landing = rotatePlacementPoint([0, 2], orientation);
    const result = resolveStairArtEndpoints({
      entrance: [0, 0], landing: [0, 2],
      physicalEntrance: entrance, physicalLanding: landing,
      orientation,
    });
    assert.deepEqual(result.entrance, entrance);
    assert.deepEqual(result.landing, landing);
  }
});
