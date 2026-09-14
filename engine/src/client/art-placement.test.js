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

test("real retained bindings resolve placement metadata for bed, brewer, and stairs", () => {
  const bed = resolveWorldArtPlacement({
    subjectPlacement: { kind: "footprint", footprint: [[0, 0], [0, 1]], orientation: "east" },
    artPlacement: BED_PLACEMENT,
    orientation: "east",
  });
  assert.deepEqual([...bed.alignedFootprint].sort(), [[-1, 0], [0, 0]]);
  const brewer = resolveWorldArtPlacement({
    subjectPlacement: { kind: "footprint", footprint: [[0, 0], [1, 0], [0, 1], [1, 1]], orientation: "south" },
    artPlacement: BREW_PLACEMENT,
    orientation: "south",
  });
  assert.equal(brewer.alignedFootprint.length, 4);
  const stair = resolveWorldArtPlacement({
    subjectPlacement: { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, -2], orientation: "west" },
    artPlacement: STAIR_PLACEMENT,
    orientation: "west",
  });
  assert.deepEqual(stair.landing, [-2, 2.16, 0]);
  assert.throws(() => resolveWorldArtPlacement({
    subjectPlacement: { kind: "footprint", footprint: [[0, 0], [2, 0]], orientation: "north" },
    artPlacement: BED_PLACEMENT,
    orientation: "north",
  }), /footprint does not match/);
  assert.throws(() => resolveWorldArtPlacement({
    subjectPlacement: { kind: "stair", entrance: [0, 0, 0], landing: [0, 2, 2], orientation: "north" },
    artPlacement: STAIR_PLACEMENT,
    orientation: "north",
  }), /endpoints do not match/);
});

test("recipe footprints align every native bed and brewer facing", () => {
  for (const [type, placement] of [["bed", BED_PLACEMENT], ["brew-station", BREW_PLACEMENT]]) {
    for (const orientation of ["north", "east", "south", "west"]) {
      const catalog = type === "bed" ? "timber-bed" : "brew-station";
      const [visual] = colonyConstructionVisuals({ query: () => [{ id: type, get: () => ({ catalog, x: 3, y: 14, z: -2, orientation, phase: "finished", seconds: 4 }) }] });
      const result = resolveWorldArtPlacement({
        subjectPlacement: visual.placement,
        artPlacement: placement,
        orientation,
      });
      const expected = placement.bakedFootprint.map((cell) => rotatePlacementPoint(cell, orientation));
      assert.equal(result.alignedFootprint.length, expected.length, type);
      for (const cell of expected)
        assert.ok(result.alignedFootprint.some((candidate) => candidate.every((value, index) => Math.abs(value - cell[index]) < 1e-9)), `${type}:${orientation}`);
    }
  }
});

test("recipe stair endpoints align all four native directions", () => {
  for (const orientation of ["north", "east", "south", "west"]) {
    const [visual] = colonyConstructionVisuals({ query: () => [{ id: "stair", get: () => ({ catalog: "timber-stair", x: 3, y: 14, z: -2, orientation, phase: "finished", seconds: 4 }) }] });
    const result = resolveWorldArtPlacement({
      subjectPlacement: visual.placement,
      artPlacement: STAIR_PLACEMENT,
      orientation,
    });
    const expectedEntrance = [
      ...rotatePlacementPoint([STAIR_PLACEMENT.entrance[0], STAIR_PLACEMENT.entrance[2]], orientation),
    ];
    const expectedLanding = rotatePlacementPoint([STAIR_PLACEMENT.landing[0], STAIR_PLACEMENT.landing[2]], orientation);
    assert.deepEqual(result.entrance, [expectedEntrance[0], STAIR_PLACEMENT.entrance[1], expectedEntrance[1]]);
    assert.deepEqual(result.landing, [expectedLanding[0], STAIR_PLACEMENT.landing[1], expectedLanding[1]]);
  }
});

test("canonical stair datum resolves to the native cardinal directions", () => {
  const expected = { north: [0, -2], east: [2, 0], south: [0, 2], west: [-2, 0] };
  for (const orientation of Object.keys(expected)) {
    const [visual] = colonyConstructionVisuals({ query: () => [{ id: "stair", get: () => ({ catalog: "timber-stair", x: 3, y: 14, z: -2, orientation, phase: "finished", seconds: 4 }) }] });
    const result = resolveWorldArtPlacement({ subjectPlacement: visual.placement, artPlacement: STAIR_PLACEMENT, orientation });
    assert.deepEqual([result.landing[0], result.landing[2]], expected[orientation]);
    assert.equal(result.landing[1], 2.16);
  }
});

test("superseded v5 manifest is rejected instead of being silently accepted", () => {
  const input = JSON.parse(readFileSync("public/generated-art/goblin-static-art-v5/manifest.json", "utf8"));
  assert.throws(() => parseStaticArtManifest(input), /unsupported/);
});
