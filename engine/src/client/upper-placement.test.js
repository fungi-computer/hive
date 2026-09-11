import { strict as assert } from "node:assert";
import { test } from "node:test";
import { structureAnchor, upperPlacementAt, upperPlacementCandidates } from "./upper-placement.js";
const frame = { verticalMetres: 1, surfaces: [{ cell: [0, 0, 0], material: 1 }], structureSurfaces: [{ cell: [0, 4, 0] }] };
const project = (x, y, z) => ({ x, y: z + y });
test("upper placement is limited to empty neighbors of a published anchor", () => {
  assert.deepEqual(structureAnchor(frame, [0, 4, 0]), [0, 4, 0]);
  assert.deepEqual(upperPlacementCandidates(frame, [0, 4, 0]), [[-1, 4, 0], [1, 4, 0], [0, 4, -1], [0, 4, 1]]);
  assert.deepEqual(upperPlacementCandidates(frame, [8, 4, 8]), []);
});
test("pointer selection returns only a candidate plane cell", () => {
  assert.deepEqual(upperPlacementAt({ x: 0.75, y: 4.75 }, frame, [0, 4, 0], project), [1, 4, 0]);
  assert.equal(upperPlacementAt({ x: 8, y: 8 }, frame, [0, 4, 0], project), null);
});
