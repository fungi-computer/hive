import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createUpperPlacementCache, structureAnchor, upperPlacementAt, upperPlacementCandidates } from "./upper-placement.js";
import { project } from "./geometry.js";
const frame = { verticalMetres: 1, surfaces: [{ cell: [0, 0, 0], material: 1 }], structureSurfaces: [{ cell: [0, 4, 0] }] };
test("upper placement is limited to empty neighbors of a published anchor", () => {
  assert.deepEqual(structureAnchor(frame, [0, 4, 0]), [0, 4, 0]);
  assert.deepEqual(upperPlacementCandidates(frame, [0, 4, 0]), [[-1, 4, 0], [1, 4, 0], [0, 4, -1], [0, 4, 1]]);
  assert.deepEqual(upperPlacementCandidates(frame, [8, 4, 8]), []);
});
test("pointer selection returns only a candidate plane cell", () => {
  const screen = project(1, 4.5, 0);
  assert.deepEqual(upperPlacementAt(screen, frame, [0, 4, 0]), [1, 4, 0]);
  assert.equal(upperPlacementAt({ x: 8, y: 8 }, frame, [0, 4, 0]), null);
});
test("cache reuses published arrays across fresh water frames and invalidates changed arrays", () => {
  const cache = createUpperPlacementCache();
  const first = cache.candidates(frame, [0, 4, 0]);
  const waterFrame = { ...frame, water: [{ at: [0, 4, 0], massKg: 1, liquidVolumeM3: 1 }] };
  assert.equal(cache.candidates(waterFrame, [0, 4, 0]), first);
  const changed = { ...waterFrame, surfaces: [...frame.surfaces] };
  assert.notEqual(cache.candidates(changed, [0, 4, 0]), first);
});
