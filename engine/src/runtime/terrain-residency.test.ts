import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  chunkCoordinate,
  residentChunks,
  TerrainChunkResidency,
} from "./terrain-residency";

test("chunk identity uses floor division across negative boundaries", () => {
  assert.equal(chunkCoordinate(-1, 16), -1);
  assert.equal(chunkCoordinate(-16, 16), -1);
  assert.equal(chunkCoordinate(-17, 16), -2);
  assert.deepEqual(residentChunks([-1, -17], { chunkSize: 16, radius: 0 }), [
    { x: -1, z: -2 },
  ]);
});

test("interest crossing enters nearby chunks and evicts presentation only", () => {
  const residency = new TerrainChunkResidency<string>({
    chunkSize: 16,
    radius: 1,
  });
  const first = residency.update([0, 0], (address) => ({
    revision: 4,
    value: `${address.x},${address.z}`,
  }));
  assert.equal(first.entered.length, 9);
  const moved = residency.update([16, 0], (address) => ({
    revision: 4,
    value: `${address.x},${address.z}`,
  }));
  assert.equal(moved.entered.length, 3);
  assert.equal(moved.evicted.length, 3);
  assert.equal(residency.values().length, 9);
});

test("stale chunk revisions are rejected", () => {
  const residency = new TerrainChunkResidency<string>({
    chunkSize: 16,
    radius: 0,
  });
  residency.update([0, 0], () => ({ revision: 7, value: "fresh" }));
  assert.equal(residency.apply({ x: 0, z: 0 }, 6, "stale"), false);
  assert.deepEqual(residency.values(), ["fresh"]);
  assert.equal(residency.apply({ x: 0, z: 0 }, 8, "new"), true);
});
