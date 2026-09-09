import test from "node:test";
import assert from "node:assert/strict";
import { compilePhysicalGeometry } from "./physical-geometry.ts";

test("sparse physical query preserves large finite envelopes without rasterizing terrain", () => {
  let reads = 0;
  const bounds = { min: [-10, -100, 0], max: [10, 100, 10] };
  const terrain = {
    bounds,
    solidAt(x, y, z) {
      reads++;
      return y < 0;
    },
  };
  const primitives = [
    { kind: "solid", min: [1, 0, 1], max: [2, 4, 2] },
    { kind: "face", axis: "y", at: 4, min: [1, 1], max: [2, 2] },
  ];
  const query = compilePhysicalGeometry(terrain, bounds, primitives);
  assert.equal(
    reads,
    0,
    "compilation indexes primitives, not the enclosing3D volume",
  );
  assert.equal(query.point([1, 2, 1]), "solid");
  assert.equal(query.point([0, 2, 1]), "empty");
  assert.equal(query.face("y", [1, 4, 1]), "closed");
  primitives[0].max[1] = 2;
  assert.equal(
    query.point([1, 3, 1]),
    "solid",
    "caller cannot mutate compiled primitives",
  );
  assert.throws(() => query.region(bounds), /1024/);
  const region = query.region({ min: [1, 0, 1], max: [2, 5, 2] });
  assert.deepEqual(region.solidCellIds, [
    "cell:1,0,1",
    "cell:1,1,1",
    "cell:1,2,1",
    "cell:1,3,1",
  ]);
  assert.deepEqual(region.closedFaceIds, ["y:1,4,1"]);
  assert.throws(() => region.solidCellIds.push("cell:0,0,0"));
  assert.equal(query.point([10, 0, 0]), "unresolved");
  assert.equal(query.verticalClearance([0, 0, 0], 101), "unresolved");
});

test("adjacent closure differs from roofed empty continuation and explicit vertical clearance", () => {
  const bounds = { min: [-2, -2, -2], max: [3, 8, 3] };
  const terrain = {
    bounds,
    solidAt: (x, y, z) => y < 0 || (x === -1 && y === 3 && z === 0),
  };
  const query = compilePhysicalGeometry(terrain, bounds, [
    { kind: "face", axis: "x", at: 1, min: [0, 0], max: [1, 1] },
    { kind: "solid", min: [0, 0, -1], max: [1, 1, 0] },
  ]);
  assert.equal(query.exterior([0, 0, 0], "x", -1, 8), "needs-neighbor");
  assert.equal(query.point([-1, 0, 0]), "empty");
  assert.equal(
    query.face("x", [0, 0, 0]),
    "open",
    "overhead stone is not a separating wall",
  );
  assert.equal(query.exterior([0, 0, 0], "x", 1, 8), "closed");
  assert.equal(query.exterior([0, 0, 0], "z", -1, 8), "closed");
  assert.equal(query.exterior([0, 0, 0], "z", 1, 8), "outdoor");
  assert.equal(query.exterior([0, 0, 0], "y", -1, 8), "closed");
  assert.equal(query.verticalClearance([-1, 0, 0], 8), "blocked");
  assert.equal(query.verticalClearance([0, 0, 1], 9), "unresolved");
});

test("zero-volume roofs and bounded clearance never become implicit ambient", () => {
  const bounds = { min: [0, 0, 0], max: [2, 10000, 2] };
  const terrain = { bounds, solidAt: () => false };
  const query = compilePhysicalGeometry(terrain, bounds, [
    { kind: "face", axis: "y", at: 6, min: [1, 0], max: [2, 1] },
  ]);
  assert.equal(query.exterior([0, 0, 0], "x", 1, 10), "needs-neighbor");
  assert.equal(query.point([1, 0, 0]), "empty");
  assert.equal(
    query.verticalClearance([0, 0, 0], 10000),
    "unresolved",
    "finite step budget does not invent clearance",
  );
  assert.throws(() =>
    compilePhysicalGeometry(terrain, bounds, [
      { kind: "solid", min: [0, 2, 0], max: [1, 1, 1] },
    ]),
  );
  assert.throws(
    () =>
      compilePhysicalGeometry(terrain, { min: [-1, 0, 0], max: [2, 5, 2] }, []),
    /registered terrain/,
  );
});
