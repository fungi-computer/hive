import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainFaceAppearance } from "./terrain-face-appearance.js";

test("terrain appearance distinguishes natural tops, cut soil, stone and sides on one atlas", () => {
  const owner = createTerrainFaceAppearance();
  const natural = owner.appearance({ cell: [0, 4, 0], face: "top", material: 1, cap: false, generatedTop: 4 });
  const cut = owner.appearance({ cell: [0, 3, 0], face: "top", material: 1, cap: true, generatedTop: 4 });
  const earth = owner.appearance({ cell: [0, 3, 0], face: "south", material: 1, cap: false, generatedTop: 4 });
  const stone = owner.appearance({ cell: [0, 3, 0], face: "south", material: 2, cap: false, generatedTop: 4 });
  assert.equal(natural.texture.source, cut.texture.source);
  assert.notDeepEqual(natural.uvs, cut.uvs);
  assert.notDeepEqual(cut.uvs, earth.uvs);
  assert.notDeepEqual(earth.uvs, stone.uvs);
  owner.dispose();
});
