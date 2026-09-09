import test from "node:test";
import assert from "node:assert/strict";
import {
  MATERIAL,
  createWorldSpec,
  sampleTerrain,
  worldIdentity,
  createVoxelWorld,
} from "./index.js";
import { generateChunk, sampleOverview } from "../../world-lab/terrain.js";

const identity = worldIdentity({
  worldId: "engine-geography-laws",
  seed: "volume-v2-fixed-cave-pocket-v1",
});
const spec = createWorldSpec({ seed: identity.base.heightSeed });

test("maps and solid surfaces share quantized height and sea authority", () => {
  const world = createVoxelWorld(identity);
  for (const [chunkX, chunkZ] of [[-1, 0], [0, -1], [1, 1]]) {
    const chunk = generateChunk(spec, chunkX, chunkZ);
    for (let i = 0; i < chunk.bedLevels.length; i++) {
      const x = chunkX * 16 + i % 16;
      const z = chunkZ * 16 + Math.floor(i / 16);
      const cell = sampleTerrain(spec, x, z);
      assert.equal(chunk.bedLevels[i], cell.bedLevel);
      assert.equal(cell.bedMetres, cell.bedLevel * 0.54);
      assert.equal(cell.terrain === "surface-water", cell.bedLevel < cell.seaSurfaceLevel);
      assert.equal(world.readPoint({ x, y: cell.bedLevel, z }), MATERIAL.air);
    }
  }
  const overview = sampleOverview(spec, { width: 16, height: 16 });
  assert.equal(overview.sampleCount, 256);
  assert.equal(world.stats().residentBricks, 0);
});

test("deep and elevated edits cross signed brick boundaries and survive eviction", () => {
  const world = createVoxelWorld(identity, { maxResidentBricks: 2 });
  const cells = [-49, -33, -17, -1, 15, 31, 47, 63].map((y, index) => {
    const at = { x: index % 2 ? -1 : 0, y, z: 0 };
    const expectedMaterial = world.readPoint(at);
    return {
      ...at, expectedMaterial,
      material: expectedMaterial === MATERIAL.air ? MATERIAL.stone : MATERIAL.air,
    };
  });
  assert.equal(world.edit({ expectedRevision: 0, cells }).ok, true);
  const saved = world.save();
  for (const cell of cells) {
    world.readBrick({ x: Math.floor(cell.x / 16), y: Math.floor(cell.y / 16), z: 0 });
    assert.equal(world.readPoint(cell), cell.material);
    assert(world.stats().residentBricks <= 2);
  }
  world.evictAll();
  assert.deepEqual(world.save(), saved);
  const reopened = createVoxelWorld(identity, { checkpoint: JSON.parse(JSON.stringify(saved)) });
  for (const cell of cells) assert.equal(reopened.readPoint(cell), cell.material);
  assert.equal(reopened.stats().residentBricks, 0);
  assert.deepEqual(reopened.save(), saved);
});

test("stale and partially invalid edits cannot change the physical overlay", () => {
  const world = createVoxelWorld(identity);
  const at = { x: -1, y: -32, z: -1 };
  const base = world.readPoint(at);
  const material = base === MATERIAL.air ? MATERIAL.stone : MATERIAL.air;
  const cell = { ...at, expectedMaterial: base, material };
  const before = world.save();
  assert.throws(() => world.edit({ expectedRevision: 0, cells: [cell, { ...cell, x: 2048 }] }));
  assert.deepEqual(world.save(), before);
  assert.throws(() => world.edit({ expectedRevision: 0, cells: [cell, cell] }));
  assert.deepEqual(world.save(), before);
  assert.equal(world.edit({ expectedRevision: 0, cells: [cell] }).ok, true);
  const changed = world.save();
  assert.equal(world.edit({ expectedRevision: 0, cells: [cell] }).reason, "stale-revision");
  assert.deepEqual(world.save(), changed);
  assert.equal(world.edit({ expectedRevision: 1, cells: [{ ...at, expectedMaterial: material, material: base }] }).ok, true);
  assert.equal(world.save().changes.length, 0);
  assert.equal(world.save().revision, 2);
});

test("bulk reads are caller-owned and incompatible checkpoints reject", () => {
  const world = createVoxelWorld(identity);
  const at = { x: -1, y: -1, z: -1 };
  const material = world.readPoint(at);
  world.readBrick({ x: -1, y: -1, z: -1 }).material.fill(255);
  assert.equal(world.readPoint(at), material);
  const checkpoint = world.save();
  checkpoint.identity.base.heightSeed = "different-geography";
  assert.throws(() => createVoxelWorld(identity, { checkpoint }));
  for (const y of [-65, 64, 0.5, NaN]) assert.throws(() => world.readPoint({ ...at, y }));
  assert.equal(world.save().revision, 0);
});
