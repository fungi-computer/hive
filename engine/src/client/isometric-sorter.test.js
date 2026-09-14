import test from "node:test";
import assert from "node:assert/strict";
import { createIsometricSorter, pickFromOrdered, storeyBandFor, subjectSortFootprint } from "./isometric-sorter.js";

const node = (id, x, z, extra = {}) => ({
  id,
  footprint: [{ x, y: 0, z }],
  screenBounds: {
    left: x * 10,
    right: x * 10 + 20,
    top: z * 10,
    bottom: z * 10 + 20,
  },
  ...extra,
});

test("orders projected points behind to in front", () => {
  const sorter = createIsometricSorter();
  assert.deepEqual(
    sorter
      .order([node("front", 2, 2), node("back", 0, 0)])
      .map((entry) => entry.id),
    ["back", "front"],
  );
});

test("long footprint endpoints create one relation only when projected bounds overlap", () => {
  const sorter = createIsometricSorter();
  const wall = node("wall", 1, 1, {
    footprint: [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ],
    screenBounds: { left: 0, right: 50, top: 0, bottom: 20 },
  });
  const actor = node("actor", 2, 2, {
    screenBounds: { left: 20, right: 30, top: 10, bottom: 20 },
    moving: true,
  });
  assert.deepEqual(
    sorter.order([actor, wall]).map((entry) => entry.id),
    ["wall", "actor"],
  );
  assert.deepEqual(
    sorter.order([node("isolated", 20, 20), wall]).map((entry) => entry.id),
    ["isolated", "wall"],
  );
});

test("point-line ordering is independent of endpoint and input order", () => {
  const sorter = createIsometricSorter();
  const wall = (footprint) => node("wall", 0, 0, {
    footprint,
    screenBounds: { left: -20, right: 40, top: -20, bottom: 40 },
  });
  const behind = node("behind", -1, -1, {
    screenBounds: { left: -20, right: 10, top: -20, bottom: 10 },
  });
  const inFront = node("front", 3, 3, {
    screenBounds: { left: 10, right: 40, top: 10, bottom: 40 },
  });
  const forward = wall([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]);
  const reversed = wall([{ x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }]);
  assert.deepEqual(sorter.order([forward, inFront, behind]).map((entry) => entry.id), ["behind", "wall", "front"]);
  assert.deepEqual(sorter.order([inFront, reversed, behind]).map((entry) => entry.id), ["behind", "wall", "front"]);
});

test("static relations cache and explicit invalidation clear only affected pairs", () => {
  const sorter = createIsometricSorter();
  sorter.order([node("a", 0, 0), node("b", 1, 1), node("c", 4, 4)]);
  assert.equal(sorter.cacheSize(), 3);
  sorter.invalidate(["b"]);
  assert.equal(sorter.cacheSize(), 1);
  sorter.invalidate();
  assert.equal(sorter.cacheSize(), 0);
});

test("static geometry signatures replace stale cached relations and inactive pairs are pruned", () => {
  const sorter = createIsometricSorter();
  const a = node("a", 0, 0);
  const b = node("b", 1, 1);
  sorter.order([a, b]);
  assert.equal(sorter.cacheSize(), 1);
  sorter.order([a]);
  assert.equal(sorter.cacheSize(), 0);
  sorter.order([a, b]);
  const moved = { ...b, footprint: [{ x: 20, y: 0, z: 20 }] };
  sorter.order([a, moved]);
  assert.equal(sorter.cacheSize(), 1);
});

test("moving nodes bypass the static cache and results are input-order independent", () => {
  const sorter = createIsometricSorter();
  const moving = node("actor", 1, 1, { moving: true });
  const staticNode = node("wall", 0, 0);
  const one = sorter.order([moving, staticNode]).map((entry) => entry.id);
  const two = sorter.order([staticNode, moving]).map((entry) => entry.id);
  assert.deepEqual(one, two);
  assert.equal(sorter.cacheSize(), 0);
});

test("cycles are deterministic and picking chooses the last visible ordered silhouette", () => {
  const sorter = createIsometricSorter();
  const a = node("a", 0, 0, {
    screenBounds: { left: 0, right: 10, top: 0, bottom: 10 },
  });
  const b = node("b", 0, 0, {
    screenBounds: { left: 0, right: 10, top: 0, bottom: 10 },
  });
  const ordered = sorter.order([b, a]);
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    ["a", "b"],
  );
  assert.equal(pickFromOrdered(ordered, [a, b]).node.id, "b");
  assert.equal(pickFromOrdered(ordered, [{ ...b, pickable: false }]).target, null);
});

test("storey conversion requires canonical vertical metres", () => {
  assert.equal(storeyBandFor({ y: 4 }, 2), 2);
  assert.equal(storeyBandFor({ y: 99, support: { level: 3 } }), 3);
  assert.throws(() => storeyBandFor({ y: 4 }), /positive vertical metres/);
});

test("canonical compact, bed, wall, and stair placement records become lawful footprints", () => {
  const subject = { x: 10, y: 4, z: 7 };
  assert.deepEqual(subjectSortFootprint(subject), [{ x: 10, y: 4, z: 7 }]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "footprint", alignedFootprint: [[0, 0], [1, 0]] }), [
    { x: 10, y: 4, z: 7 },
    { x: 11, y: 4, z: 7 },
  ]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "stair", entrance: [0, 0, 0], landing: [0, 2, 2] }), [
    { x: 10, y: 4, z: 7 },
    { x: 10, y: 6, z: 9 },
  ]);
});
