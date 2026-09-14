import assert from "node:assert/strict";
import test from "node:test";
import { writeDepth24 } from "../../../src/art/depth-image.js";
import {
  compareWorldDepthItems,
  createWorldDepthPicker,
  worldDepthBounds,
} from "./world-depth.js";
import {
  transparentWorldComposition,
  TRANSPARENT_WORLD_STATE,
} from "./world-depth-layer.js";

function depthFrame(value, alpha = 255) {
  const pixels = new Uint8Array(4);
  writeDepth24(pixels, 0, value);
  pixels[3] = alpha;
  return {
    pixels,
    atlasWidth: 1,
    atlasHeight: 1,
    frame: { x: 0, y: 0, width: 1, height: 1 },
    depthRange: { min: 0, max: 10 },
  };
}

function item(entityId, value, extra = {}) {
  return {
    entityId,
    visualPartId: "body",
    physicalRole: "actor",
    worldOrigin: { x: 0, y: 0, z: 0 },
    screenTransform: { x: 32, y: 32, scale: 8 },
    anchor: { x: 0.5, y: 0.5 },
    depthFrame: depthFrame(value),
    visible: true,
    pickable: true,
    ...extra,
  };
}

test("one finite world depth interval covers all visible origins", () => {
  const result = worldDepthBounds(
    [item("far", 0), item("near", 1, { worldOrigin: { x: 5, y: 0, z: 0 } })],
    { x: 1, y: 0, z: 0 },
  );
  assert(result.nearDepth > 15);
  assert(result.farDepth < 0);
  assert.deepEqual(result.basis, [1, 0, 0]);
});

test("depth picking chooses the front pixel before applying pickability", () => {
  const picker = createWorldDepthPicker();
  picker.update(
    [item("person", 0.2), item("wall", 0.8, { pickable: false })],
    [1, 0, 0],
  );
  assert.deepEqual(picker.pick({ x: 32, y: 32 }), {
    entityId: "wall",
    visualPartId: "body",
    depth: 8,
    target: null,
  });
});

test("transparent depth cannot occlude and floor wins an exact terrain tie", () => {
  const floor = item("floor", 0.5, { physicalRole: "floor" });
  const terrain = item("terrain", 0.5, { physicalRole: "terrain" });
  const transparent = item("front", 1, { depthFrame: depthFrame(1, 0) });
  const picker = createWorldDepthPicker();
  picker.update([terrain, transparent, floor], [1, 0, 0]);
  assert.equal(picker.pick({ x: 32, y: 32 }).target, "floor");
  assert(compareWorldDepthItems(floor, terrain) < 0);
});

test("screen buckets preserve scaled pixels and permutation-stable winners", () => {
  const near = item("near", 0.7, {
    screenTransform: { x: 140, y: 90, scaleX: 16, scaleY: 12 },
  });
  const far = item("far", 0.3, {
    screenTransform: { x: 140, y: 90, scaleX: 16, scaleY: 12 },
  });
  for (const items of [
    [near, far],
    [far, near],
  ]) {
    const picker = createWorldDepthPicker({ bucketSize: 32 });
    picker.update(items, [1, 0, 0]);
    assert.equal(picker.pick({ x: 140, y: 90 }).target, "near");
    assert.equal(picker.pick({ x: 100, y: 90 }), null);
  }
});

test("transparent water is bounded, deterministic, alpha checked, and non-pickable", () => {
  const water = (id, order = 1) => ({ entityId: id, visualPartId: "surface", physicalRole: "water", order, alpha: 0.7, pickable: false });
  assert.deepEqual(transparentWorldComposition([water("b"), water("a")]).map(item => item.entityId), ["a", "b"]);
  assert.deepEqual(TRANSPARENT_WORLD_STATE, { depthTest: true, depthMask: false, blend: true });
  assert.throws(() => transparentWorldComposition([{ ...water("bad"), pickable: true }]), /pickable/);
  assert.throws(() => transparentWorldComposition([{ ...water("bad"), alpha: 2 }]), /alpha/);
  assert.throws(() => transparentWorldComposition(Array.from({ length: 257 }, (_, i) => water(String(i)))), /bound/);
});
