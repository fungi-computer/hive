import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { parseStaticArtManifest } from "../../../src/art/static-manifest.js";
import { writeDepth24 } from "../../../src/art/depth-image.js";
import { building } from "../../../src/art/home.js";
import { createWorldDepthPicker } from "./world-depth.js";
import { TRANSPARENT_WORLD_STATE, transparentWorldComposition } from "./world-depth-layer.js";

const manifest = parseStaticArtManifest(JSON.parse(fs.readFileSync(new URL("../../../public/generated-art/goblin-static-art-v4/manifest.json", import.meta.url))));

function frame(value, alpha = 255) {
  const pixels = new Uint8Array(4);
  writeDepth24(pixels, 0, value / 10);
  pixels[3] = alpha;
  return { pixels, atlasWidth: 1, atlasHeight: 1, frame: { x: 0, y: 0, width: 1, height: 1 }, depthRange: { min: 0, max: 10 } };
}

function item(entityId, depth, extra = {}) {
  return {
    entityId,
    visualPartId: "body",
    physicalRole: "structure",
    worldOrigin: { x: 0, y: 0, z: 0 },
    screenTransform: { x: 100, y: 100, scale: 12 },
    anchor: { x: 0.5, y: 0.5 },
    depthFrame: frame(depth),
    visible: true,
    pickable: true,
    ...extra,
  };
}

function retainedPaths(kind) {
  return manifest.entries.filter((entry) => entry.path[0] === "buildings" && entry.path[1] === kind);
}

test("D3 retained original-art scene covers bed, brewer, stair sections and all facings", () => {
  const recipes = [
    building("bed", "finished", 0),
    building("brew-station", "finished", 0),
    ...[0, 1, 2, 3].map((facing) => building("stair", "finished", facing)),
  ];
  assert.equal(recipes.length, 6);
  assert(recipes.every((recipe) => recipe.userData.staticPlacement));
  for (const kind of ["bed", "brew-station", "stair"]) {
    const entries = retainedPaths(kind);
    assert(entries.length > 0);
    assert(entries.every((entry) => entry.placement));
  }
  assert.equal(retainedPaths("stair").filter((entry) => entry.path[3] === 0).length, 3);

  const picker = createWorldDepthPicker({ bucketSize: 16 });
  const scene = [
    item("bed", 4, { visualPartId: "bed", physicalRole: "structure" }),
    item("person-front", 8, { visualPartId: "body", physicalRole: "actor" }),
    item("brewer", 6, { visualPartId: "brewer", physicalRole: "structure" }),
    item("person-behind", 2, { visualPartId: "behind", physicalRole: "actor" }),
    item("stair-bottom", 3, { visualPartId: "bottom", physicalRole: "structure", screenTransform: { x: 80, y: 100, scale: 12 } }),
    item("stair-mid", 5, { visualPartId: "mid", physicalRole: "structure", screenTransform: { x: 100, y: 100, scale: 12 } }),
    item("stair-landing", 7, { visualPartId: "landing", physicalRole: "structure", screenTransform: { x: 120, y: 100, scale: 12 } }),
    item("upper-hidden", 10, { visualPartId: "upper", physicalRole: "structure", visible: false }),
    item("lower-person", 1, { visualPartId: "lower", physicalRole: "actor" }),
  ];
  picker.update(scene, [1, 0, 0]);
  picker.update([scene[0], scene[3]], [1, 0, 0]);
  assert.equal(picker.pick({ x: 100, y: 100 }).entityId, "bed");
  picker.update([scene[2], scene[1]], [1, 0, 0]);
  assert.equal(picker.pick({ x: 100, y: 100 }).entityId, "person-front");
  picker.update(scene, [1, 0, 0]);
  assert.equal(picker.pick({ x: 100, y: 100 }).entityId, "person-front");
  assert.equal(picker.pick({ x: 80, y: 100 }).entityId, "stair-bottom");
  assert.equal(picker.pick({ x: 120, y: 100 }).entityId, "stair-landing");
  assert.equal(picker.pick({ x: 100, y: 101 }).entityId, "person-front");
  assert.equal(picker.pick({ x: 100, y: 100 }).entityId, "person-front");
});

test("D4 cutaway and opaque occlusion apply before selection, while water only tests depth", () => {
  const lower = item("lower", 2, { physicalRole: "actor" });
  const upper = item("upper", 9, { visible: false, physicalRole: "structure" });
  const wall = item("wall", 8, { pickable: false, physicalRole: "structure" });
  const picker = createWorldDepthPicker();
  picker.update([lower, upper], [1, 0, 0]);
  assert.equal(picker.pick({ x: 100, y: 100 }).target, "lower");
  picker.update([lower, wall], [1, 0, 0]);
  assert.equal(picker.pick({ x: 100, y: 100 }).target, null);
  const water = { entityId: "water", visualPartId: "surface", physicalRole: "water", order: 1, alpha: 0.7, pickable: false };
  assert.deepEqual(transparentWorldComposition([water]), [water]);
  assert.deepEqual(TRANSPARENT_WORLD_STATE, { depthTest: true, depthMask: false, blend: true });
});

test("D5 permutation proof reports bounded candidate work and retained depth memory", () => {
  const scene = [item("bed", 4), item("person", 8, { physicalRole: "actor" }), item("brewer", 6)];
  const picker = createWorldDepthPicker({ bucketSize: 16 });
  const started = performance.now();
  const winners = new Set();
  for (const order of [scene, [...scene].reverse(), [scene[1], scene[2], scene[0]]]) {
    picker.update(order, [1, 0, 0]);
    winners.add(picker.pick({ x: 100, y: 100 }).entityId);
  }
  const elapsedMs = performance.now() - started;
  const depthBytes = scene.reduce((total, entry) => total + entry.depthFrame.pixels.byteLength, 0);
  const report = { elapsedMs, depthBytes, candidates: scene.length * 3, winners: [...winners] };
  assert.deepEqual(report.winners, ["person"]);
  assert(report.candidates <= 256);
  assert(report.depthBytes <= 1024);
  assert(elapsedMs < 1000);
});
