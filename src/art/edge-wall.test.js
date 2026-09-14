import test from "node:test";
import assert from "node:assert/strict";
import {
  EDGE_WALL_FAMILY,
  edgeWallJoinVariant,
  edgeWallPlacement,
  endpointJoinKind,
  validateEdgeWallPlacement,
} from "./edge-wall-contract.js";
import { edgeWallGeometry } from "./edge-wall-geometry.js";

const empty = () => ({
  negative: { tangent: false, normalNegative: false, normalPositive: false },
  positive: { tangent: false, normalNegative: false, normalPositive: false },
});

test("edge wall source contract uses endpoint adjacency and rejects legacy masks", () => {
  const placement = edgeWallPlacement("x", [-4, 0, 7], empty());
  assert.equal(placement.family, EDGE_WALL_FAMILY);
  assert.throws(() => validateEdgeWallPlacement({ ...placement, mask: 5 }), /Unknown edge wall placement field/);
});

test("endpoint adjacency classifies end, straight, corner, T and cross", () => {
  assert.equal(endpointJoinKind(empty().negative), "end");
  assert.equal(endpointJoinKind({ tangent: true, normalNegative: false, normalPositive: false }), "straight");
  assert.equal(endpointJoinKind({ tangent: false, normalNegative: true, normalPositive: false }), "corner");
  assert.equal(endpointJoinKind({ tangent: false, normalNegative: true, normalPositive: true }), "t");
  assert.equal(endpointJoinKind({ tangent: true, normalNegative: true, normalPositive: true }), "cross");
  const adjacency = empty();
  adjacency.negative.normalNegative = true;
  adjacency.positive.tangent = true;
  assert.equal(edgeWallJoinVariant(adjacency), "corner");
});

test("wall segment follows either grid edge tangent and straddles its boundary", () => {
  const x = edgeWallGeometry(edgeWallPlacement("x", [0, 0, 0], empty(), "frame"));
  const z = edgeWallGeometry(edgeWallPlacement("z", [0, 0, 0], empty(), "frame"));
  assert.deepEqual(x.boxes[0], { role: "plank", color: "#8e6a43", x: 0, y: 1.08, z: 0, w: 0.25, h: 2.16, d: 1 });
  assert.deepEqual(z.boxes[0], { role: "plank", color: "#8e6a43", x: 0, y: 1.08, z: 0, w: 1, h: 2.16, d: 0.25 });
});

test("perpendicular endpoint join art changes with adjacency and stage", () => {
  const adjacency = empty();
  adjacency.positive.normalPositive = true;
  const stakes = edgeWallGeometry(edgeWallPlacement("x", [2, 0, -3], adjacency, "stakes"));
  const finished = edgeWallGeometry(edgeWallPlacement("x", [2, 0, -3], adjacency, "finished"));
  assert.equal(stakes.variant, "corner");
  assert.equal(stakes.boxes.filter(({ role }) => role.startsWith("endpoint-join")).length, 1);
  assert.equal(finished.boxes.filter(({ role }) => role === "plank").length, 4);
  assert.equal(finished.boxes.some(({ role }) => role === "endpoint-join-corner"), true);
});
