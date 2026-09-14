import test from "node:test";
import assert from "node:assert/strict";
import { writeDepth24 } from "./art/depth-image.js";
import {
  compareWorldDepthItems,
  pickWorldDepth,
  worldDepthBounds,
} from "./world-depth-layer.js";

function frame(depth, alpha = 255) {
  const pixels = new Uint8Array(4);
  writeDepth24(pixels, 0, depth);
  pixels[3] = alpha;
  return { pixels, atlasWidth: 1, frame: { x: 0, y: 0, width: 1, height: 1 }, depthRange: [0, 10] };
}
function item(id, depth, extra = {}) {
  return {
    entityId: id,
    visualPartId: "body",
    worldOrigin: [0, 0, 0],
    screenTransform: { x: 0, y: 0 },
    anchor: { x: 0, y: 0 },
    depthFrame: frame(depth),
    depthRange: { min: 0, max: 10 },
    visible: true,
    pickable: true,
    ...extra,
  };
}

test("world depth bounds are finite and shared by every visible item", () => {
  const bounds = worldDepthBounds([item("a", 0), item("b", 1, { worldOrigin: [2, 0, 0] })], [1, 0, 0]);
  assert.ok(bounds.nearDepth > bounds.farDepth);
  assert.deepEqual(bounds.basis, [1, 0, 0]);
});

test("CPU picking chooses nearest pixel before applying pickability", () => {
  const wall = item("wall", 0.8, { pickable: false });
  const person = item("person", 0.2);
  const result = pickWorldDepth([person, wall], { x: 0, y: 0 }, [1, 0, 0]);
  assert.equal(result.item.entityId, "wall");
  assert.equal(result.target, null);
});

test("transparent pixels do not occlude and equal depth has deterministic role/id ties", () => {
  const hidden = item("hidden", 0, { depthFrame: frame(0, 0) });
  const actor = item("z", 0.5, { physicalRole: "actor" });
  const floor = item("a", 0.5, { physicalRole: "floor" });
  assert.equal(pickWorldDepth([hidden, actor, floor], { x: 0, y: 0 }, [1, 0, 0]).item.entityId, "a");
  assert.ok(compareWorldDepthItems(floor, actor) < 0);
});

test("static pack depth metadata uses its checked min/max object shape", () => {
  const wall = item("wall", 0.9, { depthFrame: { ...frame(0.9), depthRange: { min: -2, max: 3 } } });
  const actor = item("actor", 0.1, { depthFrame: { ...frame(0.1), depthRange: { min: -2, max: 3 } } });
  assert.equal(pickWorldDepth([actor, wall], { x: 0, y: 0 }, [1, 0, 0]).item.entityId, "wall");
});
