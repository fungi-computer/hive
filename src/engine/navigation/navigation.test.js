import test from "node:test";
import assert from "node:assert/strict";
import { compilePhysicalGeometry } from "../world/physical-geometry.ts";
import {
  admitEdge,
  route,
  beginRoute,
  advanceRoute,
  stopRoute,
  position,
  edgeStillClear,
} from "./index.ts";
import { traversalSchema } from "./schema.ts";

const human = {
  maxWadingDepthM: 0.25,
  clearanceVoxels: 4,
  flatTicks: 6,
  upTicks: 12,
  downTicks: 9,
};
const cat = { ...human, clearanceVoxels: 1, maxWadingDepthM: 0.05 };
const p = (x, y = 0, z = 0) => ({ x, y, z });
function space(primitives = [], links = []) {
  const bounds = { min: [-3, -2, -3], max: [7, 14, 7] };
  const geometry = compilePhysicalGeometry(
    { bounds, solidAt: (_x, y, _z) => y < 0 },
    bounds,
    primitives,
  );
  return { ...geometry, links, access: () => "allowed" };
}
const step = (x) => ({ kind: "solid", min: [x, 0, 0], max: [x + 1, 1, 1] });

test("weighted routes choose six flat edges over four slower up/down edges", () => {
  const found = route(space([step(1), step(3)]), p(0), p(4), human);
  assert.equal(found.kind, "route");
  assert.equal(found.ticks, 36);
  assert.equal(found.edges.length, 6);
  assert.ok(
    found.edges.every((edge) => edge.kind === "flat" && edge.duration === 6),
  );
});

test("one-voxel admission checks the lifted body sweep, with an explicit smaller profile", () => {
  const geometry = space([
    step(1),
    { kind: "solid", min: [0, 4, 0], max: [1, 5, 1] },
  ]);
  assert.equal(admitEdge(geometry, p(0), p(1, 1), human).kind, "blocked");
  const admitted = admitEdge(geometry, p(0), p(1, 1), cat);
  assert.equal(admitted.kind, "edge");
  assert.equal(admitted.edge.duration, 12);
  assert.equal(admitEdge(geometry, p(0), p(1, 2), cat).kind, "blocked");
});

test("an admitted body copies only physical coordinates and round-trips its edge", () => {
  const body = {
    ...p(0),
    id: "rowan",
    task: { kind: "carry" },
    traversal: null,
  };
  beginRoute(body, space(), [p(1)], human);
  assert.deepEqual(body.traversal.edge.from, p(0));
  assert.deepEqual(
    traversalSchema.parse(JSON.parse(JSON.stringify(body.traversal))),
    body.traversal,
  );
  body.task.kind = "changed";
  assert.deepEqual(body.traversal.edge.sweep[0], p(0));
});

test("stopping a paid edge retains exact progress until the safe endpoint", () => {
  const body = { ...p(0), traversal: null },
    geometry = space();
  beginRoute(body, geometry, [p(1), p(2)], human);
  assert.equal(advanceRoute(body, geometry, human), "moving");
  const before = position(body);
  stopRoute(body);
  assert.deepEqual(position(body), before);
  assert.equal(body.traversal.elapsed, 1);
  for (let tick = 1; tick < 6; tick++) advanceRoute(body, geometry, human);
  assert.deepEqual({ x: body.x, y: body.y, z: body.z }, p(1));
  assert.equal(body.traversal, null);
});

test("next-edge obstruction reports blocked at the safe endpoint, not final arrival", () => {
  const body = { ...p(0), traversal: null },
    geometry = space();
  beginRoute(body, geometry, [p(1), p(2)], human);
  for (let tick = 0; tick < 5; tick++) advanceRoute(body, geometry, human);
  const changed = space([{ kind: "solid", min: [2, 0, 0], max: [3, 4, 1] }]);
  assert.equal(advanceRoute(body, changed, human), "blocked");
  assert.equal(body.x, 1);
  assert.equal(body.traversal, null);
});

test("removing a stair invalidates its admitted link even with both endpoint floors", () => {
  const link = {
    id: "stair-a",
    from: p(0),
    via: [p(1, 2)],
    to: p(2, 4),
    duration: 18,
  };
  const floor = { kind: "face", axis: "y", at: 4, min: [2, 0], max: [3, 1] };
  const admitted = admitEdge(space([floor], [link]), p(0), p(2, 4), human);
  assert.equal(admitted.kind, "edge");
  assert.equal(admitted.edge.link, "stair-a");
  assert.equal(edgeStillClear(space([floor]), admitted.edge, human), false);
});

test("malformed later intent and unsupported duration reject before body mutation", () => {
  const body = { ...p(0), traversal: null },
    before = structuredClone(body),
    geometry = space();
  assert.throws(
    () => beginRoute(body, geometry, [p(1), p(2, 0.5)], human),
    /footing/,
  );
  assert.deepEqual(body, before);
  assert.throws(
    () => beginRoute(body, geometry, [p(1)], { ...human, flatTicks: 4097 }),
    /profile/,
  );
  assert.deepEqual(body, before);
});

test("repeated explicit stair links retain their own identities across a route", () => {
  const links = [
    {
      id: "lower-stair",
      from: p(0),
      via: [p(1, 2)],
      to: p(2, 4),
      duration: 18,
    },
    {
      id: "upper-stair",
      from: p(2, 4),
      via: [p(3, 6)],
      to: p(4, 8),
      duration: 18,
    },
  ];
  const found = route(space([], links), p(0), p(4, 8), human);
  assert.equal(found.kind, "route");
  assert.equal(found.ticks, 36);
  assert.deepEqual(
    found.edges.map((edge) => edge.link),
    ["lower-stair", "upper-stair"],
  );
  assert.notEqual(
    route(space([], links.slice(1)), p(0), p(4, 8), human).kind,
    "route",
  );
});

test("parallel links choose the cheapest clear edge with stable identity, including ordinary alternatives", () => {
  const from = p(0),
    to = p(2);
  const detour = [p(0, 0, 1), p(1, 0, 1), p(2, 0, 1)];
  const links = [
    { id: "blocked", from, to, via: [p(1)], duration: 6 },
    { id: "expensive", from, to, via: detour, duration: 30 },
    { id: "clear-z", from, to, via: detour, duration: 12 },
    { id: "clear-a", from, to, via: detour, duration: 12 },
  ];
  const obstruction = { kind: "solid", min: [1, 0, 0], max: [2, 4, 1] };
  for (const ordered of [links, links.toReversed()]) {
    const geometry = space([obstruction], ordered);
    const admitted = admitEdge(geometry, from, to, human);
    assert.equal(admitted.kind, "edge");
    assert.equal(admitted.edge.link, "clear-a");
    assert.equal(admitted.edge.duration, 12);
    const found = route(geometry, from, to, human);
    assert.equal(found.kind, "route");
    assert.equal(found.ticks, 12);
  }
  const adjacent = space(
    [],
    [{ id: "short-link", from, to: p(1), via: [], duration: 3 }],
  );
  const admitted = admitEdge(adjacent, from, p(1), human);
  assert.equal(admitted.kind, "edge");
  assert.equal(admitted.edge.link, "short-link");
  assert.equal(admitted.edge.duration, 3);
});

test("access sees each swept body base and paid water refusal retains exact progress", () => {
  let deep = false;
  const calls = [];
  const geometry = {
    ...space(),
    access(at, body) {
      calls.push({
        at: { ...at },
        footing: { ...body.footing },
        profile: body.profile,
      });
      return deep && at.x === 1 ? "blocked" : "allowed";
    },
  };
  const body = { ...p(0), traversal: null };
  assert.equal(beginRoute(body, geometry, [p(1)], human).kind, "edge");
  assert(calls.some(({ at, footing }) => at.y === 3 && footing.y === 0));
  assert(
    calls.every(
      ({ at, footing, profile }) =>
        at.x === footing.x &&
        at.z === footing.z &&
        footing.y === 0 &&
        profile === human,
    ),
  );
  assert.equal(advanceRoute(body, geometry, human), "moving");
  const paid = structuredClone(body);
  deep = true;
  assert.equal(advanceRoute(body, geometry, human), "waiting");
  assert.deepEqual(body, paid);
  deep = false;
  for (let i = 1; i < 6; i++) advanceRoute(body, geometry, human);
  assert.deepEqual(body, { ...p(1), traversal: null });
});

test("lifted step clearance retains each swept column's actual footing", () => {
  const calls = [];
  const geometry = {
    ...space([step(1)]),
    access(at, body) {
      calls.push({ at: { ...at }, footing: { ...body.footing } });
      return "allowed";
    },
  };
  const result = admitEdge(geometry, p(0), p(1, 1), human);
  assert.equal(result.kind, "edge");
  assert.equal(result.edge.duration, 12);
  assert(
    calls.some(
      ({ at, footing }) => at.x === 0 && at.y === 4 && footing.y === 0,
    ),
  );
  assert(calls.every(({ at, footing }) => footing.y === (at.x === 0 ? 0 : 1)));
});
