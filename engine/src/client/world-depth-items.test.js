import assert from "node:assert/strict";
import test from "node:test";
import { subjectWorldDepthItem } from "./world-depth-items.js";

function fixture(overrides = {}) {
  const source = { width: 64, height: 32 };
  const texture = { source, frame: { x: 4, y: 6, width: 8, height: 10 } };
  const depthTexture = { source: { width: 64, height: 32 } };
  const depth = {
    texture: depthTexture,
    pixels: new Uint8Array(64 * 32 * 4),
    atlasWidth: 64,
    atlasHeight: 32,
    frame: { x: 4, y: 6, width: 8, height: 10 },
    depthRange: { min: -1, max: 2 },
  };
  const art = { depthByTexture: new Map([[texture, depth]]) };
  const subject = { id: "party:a:person:0", x: 1, y: 2, z: 3, screen: { x: 40, y: 50 }, pickable: true };
  return { subject: { ...subject, ...overrides }, texture, depth, depthTexture, art };
}

test("subject projection preserves the exact paired atlas frame and world origin", () => {
  const value = fixture();
  const item = subjectWorldDepthItem({ ...value, anchor: { x: 0.5, y: 1 }, scale: 2 });
  assert.deepEqual(item.colorFrame, { frame: { x: 4, y: 6, width: 8, height: 10 }, atlasWidth: 64, atlasHeight: 32 });
  assert.equal(item.depthFrame, value.depth);
  assert.equal(item.depthTexture, value.depthTexture);
  assert.deepEqual(item.worldOrigin, { x: 1, y: 2, z: 3 });
  assert.deepEqual(item.screenTransform, { x: 40, y: 50, scale: 2 });
});

test("physical role comes from world facts rather than a sprite-name branch", () => {
  for (const [subject, expected] of [
    [{}, "actor"],
    [{ visualRole: "item" }, "item"],
    [{ surface: { height: 0 } }, "structure"],
    [{ visualRole: "floor" }, "floor"],
  ]) {
    const value = fixture(subject);
    assert.equal(subjectWorldDepthItem({ ...value, anchor: { x: 0.5, y: 1 }, scale: 1 }).physicalRole, expected);
  }
});

test("missing paired depth is an explicit renderer failure", () => {
  const value = fixture();
  value.art.depthByTexture.clear();
  assert.throws(
    () => subjectWorldDepthItem({ ...value, anchor: { x: 0.5, y: 1 }, scale: 1 }),
    /visual depth unavailable/,
  );
});
