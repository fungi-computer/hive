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

test("static relations cache and explicit invalidation clear the static graph", () => {
  const sorter = createIsometricSorter();
  sorter.order([node("a", 0, 0), node("b", 1, 1), node("c", 4, 4)]);
  assert.equal(sorter.cacheSize(), 3);
  sorter.invalidate(["b"]);
  assert.equal(sorter.cacheSize(), 0);
  sorter.invalidate();
  assert.equal(sorter.cacheSize(), 0);
});

test("moving broad phase does not relation-test distant records", () => {
  const sorter = createIsometricSorter();
  const actor = node("actor", 0, 0, {
    moving: true,
    screenBounds: { left: 0, right: 20, top: 0, bottom: 20 },
  });
  const near = node("near", 1, 1, {
    screenBounds: { left: 10, right: 30, top: 10, bottom: 30 },
  });
  const distant = node("distant", 100, 100, {
    screenBounds: { left: 1000, right: 1020, top: 1000, bottom: 1020 },
  });
  sorter.order([distant, actor, near]);
  assert.equal(sorter.diagnostics().relationTests, 1);
});

test("static graph reuse and explicit invalidation are observable", () => {
  const sorter = createIsometricSorter();
  const a = node("a", 0, 0);
  const b = node("b", 1, 1);
  sorter.order([a, b]);
  assert.equal(sorter.diagnostics().relationTests, 1);
  sorter.order([b, a]);
  assert.equal(sorter.diagnostics().relationTests, 0);
  sorter.invalidate(["a"]);
  sorter.order([a, b]);
  assert.equal(sorter.diagnostics().relationTests, 1);
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
  assert.deepEqual(subjectSortFootprint(subject, { kind: "stair", entrance: [0, 0, 0], landing: [0, 2, -2] }), [
    { x: 10, y: 4, z: 7 },
    { x: 10, y: 6, z: 5 },
  ]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "edge", axis: "x", endpoints: [[-0.5, 0], [0.5, 0]] }), [
    { x: 9.5, y: 4, z: 7 },
    { x: 10.5, y: 4, z: 7 },
  ]);
  assert.deepEqual(subjectSortFootprint(subject, { kind: "edge", axis: "z", endpoints: [[0, -0.5], [0, 0.5]] }), [
    { x: 10, y: 4, z: 6.5 },
    { x: 10, y: 4, z: 7.5 },
  ]);
});

test("one-cell walls stay points while beds, stairs, and 2x2 brewers use stable multi-cell relations", () => {
  const sorter = createIsometricSorter();
  const bounds = { left: -100, right: 100, top: -100, bottom: 100 };
  const wall = node("wall", 0, 0, { screenBounds: bounds });
  const bed = node("bed", 0, 0, { screenBounds: bounds, footprint: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] });
  const brewer = node("brewer", 0, 0, { screenBounds: bounds, footprint: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }] });
  const far = node("far", -3, -3, { screenBounds: bounds });
  const near = node("near", 3, 3, { screenBounds: bounds });
  assert.deepEqual(sorter.order([near, brewer, far]).map((entry) => entry.id), ["far", "brewer", "near"]);
  assert.deepEqual(sorter.order([near, brewer, far].reverse()).map((entry) => entry.id), ["far", "brewer", "near"]);
  assert.deepEqual(sorter.order([wall, bed, far]).map((entry) => entry.id), ["far", "bed", "wall"]);
});

test("long and area footprints do not invent depth outside their projected extent", () => {
  const sorter = createIsometricSorter();
  const screenBounds = { left: -200, right: 200, top: -200, bottom: 200 };
  const line = node("a-line", 0, 0, {
    footprint: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
    screenBounds,
  });
  const besideLine = node("z-point", 10, -8, { moving: true, screenBounds });
  assert.deepEqual(sorter.order([besideLine, line]).map((entry) => entry.id), ["a-line", "z-point"]);

  const area = node("z-area", 0, 0, {
    footprint: [
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 0, y: 0, z: 2 }, { x: 2, y: 0, z: 2 },
    ],
    screenBounds,
  });
  const besideArea = node("a-point", 10, -5, { moving: true, screenBounds });
  assert.deepEqual(sorter.order([area, besideArea]).map((entry) => entry.id), ["a-point", "z-area"]);
});

test("multipart stair geometry keeps an actor between both rails at every facing and height", () => {
  const sorter = createIsometricSorter();
  const bounds = { left: -100, right: 100, top: -100, bottom: 100 };
  for (const facing of [0, 1, 2, 3]) {
    const angle = facing * Math.PI / 2;
    const rotate = (x, z, y = 0) => ({
      x: x * Math.cos(angle) - z * Math.sin(angle),
      y,
      z: x * Math.sin(angle) + z * Math.cos(angle),
    });
    for (const progress of [0.05, 0.5, 0.95]) {
      const actor = rotate(0, progress * 2, progress * 2.16);
      const surface = {
        id: `stair-${facing}`,
        part: "surface",
        partRole: "supporting-surface",
        role: "structure",
        relationPolicy: "multipart-geometry",
        storeyBand: 0,
        footprint: [rotate(-0.5, 0), rotate(0.5, 0), rotate(0.5, 2, 2.16), rotate(-0.5, 2, 2.16)],
        screenBounds: bounds,
      };
      const nodes = [-0.43, 0.43].map((x, index) => ({
        id: `stair-${facing}`,
        part: index ? "rail.right" : "rail.left",
        partRole: "upright-boundary",
        role: "structure",
        relationPolicy: "multipart-geometry",
        storeyBand: index,
        footprint: [rotate(x, 0), rotate(x, 2, 2.16)],
        screenBounds: bounds,
      }));
      nodes.unshift(surface);
      nodes.push({ id: "actor", part: "body", role: "actor", moving: true, relationPolicy: "actor", storeyBand: 0, footprint: [actor], screenBounds: bounds });
      const ordered = sorter.order(nodes);
      const reversed = sorter.order([...nodes].reverse());
      assert.deepEqual(ordered.map((node) => node.part), reversed.map((node) => node.part));
      assert(ordered.findIndex((node) => node.part === "surface") < ordered.findIndex((node) => node.id === "actor"));
      // In the stair's local support frame the actor remains between the two
      // semantic rail boundaries at entrance, middle and landing contact.
      assert(Math.abs(actor.x * Math.cos(-angle) - actor.z * Math.sin(-angle)) < 1e-9);
      const railIndexes = ordered.map((node, index) => node.part.startsWith("rail.") ? index : -1).filter((index) => index >= 0);
      assert.equal(railIndexes.length, 2);
      assert.equal(ordered.filter((node) => node.id === "actor").length, 1);
      const actorIndex = ordered.findIndex((node) => node.id === "actor");
      assert(actorIndex > Math.min(...railIndexes) && actorIndex < Math.max(...railIndexes));
    }
  }
});
