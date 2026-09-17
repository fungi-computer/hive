import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";

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
