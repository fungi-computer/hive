import assert from "node:assert/strict";
import test from "node:test";
import { building } from "../../../src/art/home.js";
const BED_PLACEMENT = { kind: "footprint", bakedFootprint: [[0, 0], [0, 1]], rotationPivot: [0, 0] };
const BREW_PLACEMENT = { kind: "footprint", bakedFootprint: [[0, 0], [1, 0], [0, 1], [1, 1]], rotationPivot: [0.5, 0.5] };
const STAIR_PLACEMENT = { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], rotationPivot: [0, 0, 0] };

test("original art recipes expose the datum consumed by the exporter", () => {
  for (const [type, expected] of [["bed", BED_PLACEMENT], ["stair", STAIR_PLACEMENT], ["brew-station", BREW_PLACEMENT]]) {
    const recipe = building(type, "finished", 0);
    assert.deepEqual(recipe.userData.staticPlacement, expected);
  }
});
import { resolvePlacementArtTransform, resolveStairArtEndpoints, resolveStairArtEndpoints3d, resolveWorldArtPlacement, rotatePlacementPoint } from "./art-placement.js";

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

test("real retained bindings resolve decoded depth metadata for bed, brewer, and stairs", () => {
  const decodedDepth = { visualBounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 } };
  const bed = resolveWorldArtPlacement({
    subjectPlacement: { kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "east" },
    artPlacement: BED_PLACEMENT,
    orientation: "east", decodedDepth,
  });
  assert.deepEqual([...bed.alignedFootprint].sort(), [[-1, 0], [0, 0]]);
  const brewer = resolveWorldArtPlacement({
    subjectPlacement: { kind: "footprint", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], orientation: "south" },
    artPlacement: BREW_PLACEMENT,
    orientation: "south", decodedDepth,
  });
  assert.equal(brewer.alignedFootprint.length, 4);
  const stair = resolveWorldArtPlacement({
    subjectPlacement: { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], orientation: "west" },
    artPlacement: STAIR_PLACEMENT,
    orientation: "west", decodedDepth,
  });
  assert.deepEqual(stair.landing, [2, 2.16, 0]);
  assert.throws(() => resolveWorldArtPlacement({
    subjectPlacement: { kind: "footprint", footprint: [[0, 0], [2, 0]], orientation: "north" },
    artPlacement: BED_PLACEMENT,
    orientation: "north", decodedDepth,
  }), /footprint does not match/);
  assert.throws(() => resolveWorldArtPlacement({
    subjectPlacement: { kind: "stair", entrance: [0, 0, 0], landing: [0, 2, 2], orientation: "north" },
    artPlacement: STAIR_PLACEMENT,
    orientation: "north", decodedDepth,
  }), /endpoints do not match/);
});
