import test from "node:test";
import assert from "node:assert/strict";
import { patchShapes, terrainPatch, terrainPatchEmissions, cliffPart } from "./terrain-patches.js";
import { terrainPatchPlacements, terrainCliffPlacements } from "./terrain-columns.js";
import { terrainColumnMap } from "./terrain-faces.js";

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

test("terrain cover emissions face upward for the shared one-sided material", () => {
  for (let mask = 1; mask < 16; mask++) {
    const emissions = terrainPatchEmissions("grass", mask);
    for (const { vertices } of emissions) {
      if (vertices.length < 3) continue;
      const [a, b, c] = vertices;
      const ab = b.map((value, index) => value - a[index]);
      const ac = c.map((value, index) => value - a[index]);
      const normalY = ab[2] * ac[0] - ab[0] * ac[2];
      assert.ok(normalY > 0, `terrain mask ${mask} emitted a downward face`);
    }
  }
});

const surface = (x, y, z, material = 1, generatedTop = y) => ({ cell: [x, y, z], material, generatedTop });

test("dual-grid patches require four same-height physical neighbors", () => {
  const full = [surface(0, 0, 0), surface(1, 0, 0), surface(1, 0, 1), surface(0, 0, 1)];
  const placements = terrainPatchPlacements(full);
  assert.ok(placements.some(({ kind, mask }) => kind === "grass" && mask === 15));
  const hole = terrainPatchPlacements(full.slice(1));
  assert.ok(hole.length > 0);
  assert.ok(hole.every(({ mask }) => mask !== 15));
  const stepped = terrainPatchPlacements(full.map((item, i) => i === 2 ? { ...item, cell: [1, 1, 1] } : item));
  assert.ok(stepped.length > 0);
  assert.ok(stepped.every(({ mask }) => mask !== 15));
  assert.deepEqual(terrainPatchPlacements(full), terrainPatchPlacements([...full].reverse()));
});

test("canonical chunk ownership makes seam placement disjoint, including negative coordinates", () => {
  const surfaces = [surface(-8, 0, 0), surface(-7, 0, 0), surface(-7, 0, 1), surface(-8, 0, 1)];
  const full = terrainPatchPlacements(surfaces);
  const index = terrainColumnMap(surfaces);
  const left = terrainPatchPlacements(surfaces.filter(({ cell: [x] }) => x < -7), index, 1, 0.54, "-1,0");
  const right = terrainPatchPlacements(surfaces.filter(({ cell: [x] }) => x >= -7), index, 1, 0.54, "0,0");
  const ids = (items) => new Set(items.map(({ x, z, kind, mask }) => `${x},${z}:${kind}:${mask}`));
  assert.equal([...ids(left)].filter((id) => ids(right).has(id)).length, 0);
  assert.deepEqual(new Set([...ids(left), ...ids(right)]), ids(full.filter(({ x, z }) => (x === -8 || x === -7) && (z === 0 || z === 1))));
});

test("material precedence and exposed cliff lips follow physical facts", () => {
  const full = [surface(0, 0, 0, 1, 0), surface(1, 0, 0, 2, 0), surface(1, 0, 1, 1, 0), surface(0, 0, 1, 1, 0)];
  const patches = terrainPatchPlacements(full);
  assert.ok(patches.some(({ kind, mask }) => kind === "grass" && mask === 13));
  assert.ok(patches.some(({ kind, mask }) => kind === "rock" && mask === 2));
  const cliffs = terrainCliffPlacements([surface(0, 1, 0, 1, 1), surface(1, 0, 0, 1, 0)]);
  assert.ok(cliffs.some(({ kind }) => kind === "grass-lip"));
  assert.ok(cliffs.some(({ kind }) => kind === "earth"));
  assert.ok(cliffs.filter(({ kind }) => kind === "grass-lip").length >= 3);
  const drop = terrainCliffPlacements([surface(0, 3, 0, 1, 3), surface(1, 0, 0, 1, 0)]);
  assert.equal(drop.filter(({ kind, x, z }) => kind === "earth" && x === 0.5 && z === 0).length, 3);
  assert.equal(drop.filter(({ kind, x, z }) => kind === "grass-lip" && x === 0.5 && z === 0).length, 1);
});
