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

const human = { clearanceVoxels: 4, flatTicks: 6, upTicks: 12, downTicks: 9 };
const cat = { ...human, clearanceVoxels: 1 };
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
  assert.equal(edgeStillClear(space([floor]), admitted.edge), false);
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
