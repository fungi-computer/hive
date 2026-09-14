import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { building } from "../../../src/art/home.js";
import { parseStaticArtManifest } from "../../../src/art/static-manifest.js";
import { colonyConstructionVisuals } from "../games/colony-construction-visuals.ts";
import { resolvePlacementArtTransform, resolveStairArtEndpoints, resolveWorldArtPlacement, rotatePlacementPoint } from "./art-placement.js";

const recipePlacement = (type) => building(type, "finished", 0).userData.staticPlacement;
const BED_PLACEMENT = recipePlacement("bed");
const BREW_PLACEMENT = recipePlacement("brew-station");
const STAIR_PLACEMENT = recipePlacement("stair");

test("original art recipes expose the datum consumed by the exporter", () => {
  for (const [type, expected] of [["bed", BED_PLACEMENT], ["stair", STAIR_PLACEMENT], ["brew-station", BREW_PLACEMENT]]) {
    const recipe = building(type, "finished", 0);
    assert.deepEqual(recipe.userData.staticPlacement, expected);
  }
});
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

test("recipe footprints align every native bed and brewer facing", () => {
  const decodedDepth = { visualBounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 } };
  for (const [type, placement] of [["bed", BED_PLACEMENT], ["brew-station", BREW_PLACEMENT]]) {
    for (const orientation of ["north", "east", "south", "west"]) {
      const catalog = type === "bed" ? "timber-bed" : "brew-station";
      const [visual] = colonyConstructionVisuals({ query: () => [{ id: type, get: () => ({ catalog, x: 3, y: 14, z: -2, orientation, phase: "finished", seconds: 4 }) }] });
      const result = resolveWorldArtPlacement({
        subjectPlacement: visual.placement,
        artPlacement: placement,
        orientation,
        decodedDepth,
      });
      const expected = placement.bakedFootprint.map((cell) => rotatePlacementPoint(cell, orientation));
      assert.equal(result.alignedFootprint.length, expected.length, type);
      for (const cell of expected)
        assert.ok(result.alignedFootprint.some((candidate) => candidate.every((value, index) => Math.abs(value - cell[index]) < 1e-9)), `${type}:${orientation}`);
    }
  }
});

test("recipe stair endpoints align all four native directions", () => {
  const decodedDepth = { visualBounds: { minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 2, maxZ: 2 } };
  for (const orientation of ["north", "east", "south", "west"]) {
    const [visual] = colonyConstructionVisuals({ query: () => [{ id: "stair", get: () => ({ catalog: "timber-stair", x: 3, y: 14, z: -2, orientation, phase: "finished", seconds: 4 }) }] });
    const result = resolveWorldArtPlacement({
      subjectPlacement: visual.placement,
      artPlacement: STAIR_PLACEMENT,
      orientation,
      decodedDepth,
    });
    const expectedEntrance = [
      ...rotatePlacementPoint([STAIR_PLACEMENT.entrance[0], STAIR_PLACEMENT.entrance[2]], orientation),
    ];
    const expectedLanding = rotatePlacementPoint([STAIR_PLACEMENT.landing[0], STAIR_PLACEMENT.landing[2]], orientation);
    assert.deepEqual(result.entrance, [expectedEntrance[0], STAIR_PLACEMENT.entrance[1], expectedEntrance[1]]);
    assert.deepEqual(result.landing, [expectedLanding[0], STAIR_PLACEMENT.landing[1], expectedLanding[1]]);
  }
});

test("v4 manifest retains recipe placement for every bed, brewer, and stair frame", () => {
  const manifest = parseStaticArtManifest(JSON.parse(readFileSync("public/generated-art/goblin-static-art-v4/manifest.json", "utf8")));
  const recipes = new Map([["bed", BED_PLACEMENT], ["brew-station", BREW_PLACEMENT], ["stair", STAIR_PLACEMENT]]);
  const entries = manifest.entries.filter((entry) => recipes.has(entry.path[1]));
  assert.equal(entries.length, 82);
  for (const entry of entries) assert.deepEqual(entry.placement, recipes.get(entry.path[1]));
  for (const type of ["bed", "brew-station"])
    assert.deepEqual(new Set(entries.filter((entry) => entry.path[1] === type && entry.path.length === 4).map((entry) => entry.path.at(-1))), new Set([0, 1]));
  assert.deepEqual(new Set(entries.filter((entry) => entry.path[1] === "stair" && entry.path.length === 4).map((entry) => entry.path.at(-1))), new Set([0, 1, 2, 3]));
});
