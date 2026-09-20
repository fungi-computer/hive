import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainFaceAppearance, terrainArtFace, terrainArtMask } from "./terrain-face-appearance.js";
import { createOrderingProjection } from "./ordering-projection.js";
import { createVisibleHitArea } from "../../../src/visual-hit-geometry.js";

const projection = { project: ({ x, y, z }) => ({ x: x * 32 - z * 32, y: (x + z) * 16 - y * 32 }) };

test("terrain appearance delegates body and cover selection to one checked art pack", () => {
  const calls = [];
  const pack = {
    body: input => { calls.push(["body", input]); return { texture: { source: {} }, uvs: [0,0,0,1,1,1,1,0] }; },
    cover: input => { calls.push(["cover", input]); return { texture: { source: {} }, uvs: [0,0,0,1,1,1,1,0] }; },
  };
  const owner = createTerrainFaceAppearance({ pack });
  const body = owner.body({ cell: [2, 3, 4], face: "south", art: "earth", seed: 7, projection, verticalMetres: 0.54 });
  const cover = owner.cover({ cover: { kind: "grass", condition: "dead", height: "short" }, mask: 9,
    root: [2, 4], seed: 7, projection, surfaceY: 1.89 });
  assert.deepEqual(calls.map(([kind]) => kind), ["body", "cover"]);
  assert.deepEqual(calls[0][1], { art: "earth", face: "south", cell: [2,3,4], seed: 7 });
  assert.deepEqual(calls[1][1], { kind: "grass", condition: "dead", height: "short", mask: 9, root: [2,4], seed: 7 });
  assert.equal(body.projected.length, 4);
  assert.equal(cover.projected.length, 4);
  assert.notDeepEqual(body.projected, cover.projected);
  assert.throws(() => owner.body({ cell: [0,0,0], face: "top", projection, verticalMetres: .54 }), /no art definition/);
});

test("four camera views choose the baked visible face and rotate cover corner masks", () => {
  assert.deepEqual(["east", "west", "west", "east"].map((face, turn) => terrainArtFace(face, turn)),
    ["east", "south", "east", "south"]);
  assert.deepEqual(["south", "south", "north", "north"].map((face, turn) => terrainArtFace(face, turn)),
    ["south", "east", "south", "east"]);
  assert.deepEqual([0,1,2,3].map(turn => terrainArtMask(1, turn)), [1,8,4,2]);
  assert.deepEqual([0,1,2,3].map(turn => terrainArtMask(15, turn)), [15,15,15,15]);
});

test("upright cover preserves all baked pixels and UVs instead of clipping to its four support cells", () => {
  const silhouette = { width: 64, height: 64, rows: Array.from({ length: 65 }, (_, y) => y),
    spans: Array.from({ length: 64 }, () => [24, 39]).flat() };
  const style = { texture: { source: {} }, uvs: [.1,.2,.1,.4,.3,.4,.3,.2],
    hitArea: createVisibleHitArea(silhouette, { x: .5, y: .5 }) };
  const owner = createTerrainFaceAppearance({ pack: { body: () => style, cover: () => style } });
  const projection = createOrderingProjection();
  const picture = owner.cover({ cover: { kind: "grass", condition: "green", height: "full" },
    mask: 15, root: [0,0], projection, surfaceY: .27 });
  assert.strictEqual(picture.terrainBatch, style);
  assert.equal(picture.projected[2].y - picture.projected[0].y, 64, "the complete image quad survives");
  assert.equal(picture.supportY, .27);
  assert(picture.orderGeometry.points.some(point => point.y > .27), "blades occupy an upright ordering card");
  assert(picture.orderGeometry.points.some(point => point.y < .27), "contact ink is preserved, not cut away");
  const center = projection.project({ x: .5, y: .27, z: .5 });
  assert(picture.contains({ x: center.x, y: center.y - 30 }), "ink above the ground diamond survives");
});
