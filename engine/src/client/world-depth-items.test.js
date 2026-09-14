import assert from "node:assert/strict";
import test from "node:test";
import { subjectWorldDepthItem } from "./world-depth-items.js";
import { resolveWorldArtPlacement } from "./art-placement.js";

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
  const item = subjectWorldDepthItem({ ...value, anchor: { x: 0.5, y: 1 }, scale: 2, physicalRole: "actor" });
  assert.deepEqual(item.colorFrame, { frame: { x: 4, y: 6, width: 8, height: 10 }, atlasWidth: 64, atlasHeight: 32 });
  assert.equal(item.depthFrame, value.depth);
  assert.equal(item.depthTexture, value.depthTexture);
  assert.deepEqual(item.worldOrigin, { x: 1, y: 2, z: 3 });
  assert.deepEqual(item.screenTransform, { x: 40, y: 50, scale: 2 });
});

test("physical role is explicit content data rather than a sprite-name branch", () => {
  for (const physicalRole of ["floor", "structure", "actor", "item"]) {
    const value = fixture();
    assert.equal(subjectWorldDepthItem({ ...value, anchor: { x: 0.5, y: 1 }, scale: 1, physicalRole }).physicalRole, physicalRole);
  }
  const value = fixture();
  assert.throws(() => subjectWorldDepthItem({ ...value, anchor: { x: 0.5, y: 1 }, scale: 1 }), /subject role/);
});

test("missing paired depth is an explicit renderer failure", () => {
  const value = fixture();
  value.art.depthByTexture.clear();
  assert.throws(
    () => subjectWorldDepthItem({ ...value, anchor: { x: 0.5, y: 1 }, scale: 1, physicalRole: "actor" }),
    /visual depth unavailable/,
  );
});

test("paired color/depth item applies one shared long-object datum", () => {
  const value = fixture();
  const item = subjectWorldDepthItem({
    ...value,
    anchor: { x: 0.5, y: 1 },
    scale: 1,
    physicalRole: "structure",
    placement: { offset: [4, 1], screenOffset: [6, -3] },
  });
  assert.deepEqual(item.worldOrigin, { x: 5, y: 2, z: 4 });
  assert.deepEqual(item.screenTransform, { x: 46, y: 47, scale: 1 });
});

test("caller-shaped resolved placement reaches the paired depth item as one tuple", () => {
  const value = fixture();
  const resolved = resolveWorldArtPlacement({
    subjectPlacement: { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], orientation: "east" },
    artPlacement: { kind: "stair", entrance: [0, 0, 0], landing: [0, 2.16, 2], rotationPivot: [0, 0, 0] },
    orientation: "east",
    decodedDepth: { visualBounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 2.16, maxZ: 2 } },
  });
  const item = subjectWorldDepthItem({
    ...value,
    anchor: { x: 0.5, y: 1 },
    scale: 1,
    physicalRole: "structure",
    placement: { offset: resolved.offset, screenOffset: [6, -3] },
  });
  assert.deepEqual(item.screenTransform, { x: 46, y: 47, scale: 1 });
});
