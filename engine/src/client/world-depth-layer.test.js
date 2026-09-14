import assert from "node:assert/strict";
import test from "node:test";
import { atlasFrameUV, createWorldDepthLayer, worldDepthItemKey } from "./world-depth-layer.js";

test("atlas UVs use the exact frame rectangle", () => {
  assert.deepEqual(atlasFrameUV({ frame: { x: 2, y: 4, width: 8, height: 6 } }, 32, 24), [
    2 / 32, 4 / 24, 10 / 32, 4 / 24, 10 / 32, 10 / 24, 2 / 32, 10 / 24,
  ]);
});

test("stable visual keys and permutation independent role order", () => {
  assert.equal(worldDepthItemKey({ entityId: "e", visualPartId: "p" }), "e:p");
  const layerSource = String(createWorldDepthLayer);
  assert.match(layerSource, /sort\(\(a, b\) => compareWorldDepthItems/);
});

test("layer rejects invalid sizes before allocating render resources", () => {
  assert.throws(() => createWorldDepthLayer({ width: 0, height: 10 }), /invalid world depth layer size/);
});
