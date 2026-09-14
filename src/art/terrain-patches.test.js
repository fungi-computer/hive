import test from "node:test";
import assert from "node:assert/strict";
import { patchShapes, terrainPatch, cliffPart } from "./terrain-patches.js";

function interval(mask, side) {
  const ranges = [];
  for (const shape of patchShapes(mask)) {
    const points = shape.getPoints(16);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const coordinate = side === "left" || side === "right" ? "x" : "y";
      const fixed = side === "left" || side === "top" ? -0.5 : 0.5;
      if (a[coordinate] !== fixed || b[coordinate] !== fixed) continue;
      const other = coordinate === "x" ? "y" : "x";
      ranges.push([Math.min(a[other], b[other]), Math.max(a[other], b[other])]);
    }
  }
  // Normalize coincident vertices and adjacent line segments into edge coverage.
  return [-0.375, -0.125, 0.125, 0.375].map((p) =>
    ranges.some(([a, b]) => p >= a && p <= b),
  );
}

test("every legal neighboring binary mask has identical shared-edge coverage", () => {
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 16; b++) {
      if (
        Boolean(a & 2) === Boolean(b & 1) &&
        Boolean(a & 4) === Boolean(b & 8)
      )
        assert.deepEqual(
          interval(a, "right"),
          interval(b, "left"),
          `horizontal ${a}/${b}`,
        );
      if (
        Boolean(a & 8) === Boolean(b & 1) &&
        Boolean(a & 4) === Boolean(b & 2)
      )
        assert.deepEqual(
          interval(a, "bottom"),
          interval(b, "top"),
          `vertical ${a}/${b}`,
        );
    }
});

test("binary ambiguity is explicit and all surface shapes stay within their patch", () => {
  assert.equal(patchShapes(5).length, 2);
  assert.equal(patchShapes(10).length, 2);
  assert.equal(patchShapes(0).length, 0);
  assert.equal(patchShapes(15).length, 1);
  for (let mask = 0; mask < 16; mask++)
    for (const shape of patchShapes(mask))
      for (const point of shape.getPoints(24))
        assert.ok(Math.abs(point.x) <= 0.5 && Math.abs(point.y) <= 0.5);
});

test("all authored variants and cliff facings contain finite geometry", () => {
  const scenes = [];
  for (const kind of ["grass", "rock", "damp"])
    for (let mask = 0; mask < 16; mask++)
      for (let variant = 0; variant < 3; variant++)
        scenes.push(terrainPatch(kind, mask, variant));
  for (const kind of ["earth", "stone", "grass-lip"])
    for (let facing = 0; facing < 4; facing++)
      for (let variant = 0; variant < 3; variant++)
        scenes.push(cliffPart(kind, facing, variant));
  for (const scene of scenes)
    scene.traverse((object) => {
      if (!object.geometry) return;
      assert.ok(
        [...object.geometry.attributes.position.array].every(Number.isFinite),
      );
      object.geometry.dispose();
    });
  assert.equal(scenes.length, 180);
});
