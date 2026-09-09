import assert from "node:assert/strict";
import { createWetClearing } from "../../src/world-presets/seepage/wet-clearing.mjs";

const bounds = { min: [-4, 11, 124], max: [5, 18, 133] };
const recipe = createWetClearing({ connected: true });
const { adapter, input, target } = recipe;
const initialWire = adapter.encode(input);
const modeledAt = (scene, at) =>
  scene.cells.some(
    (cell) => cell.theta !== null && cell.at.every((n, i) => n === at[i]),
  );

const initialScene = adapter.scene(input, bounds);
assert.equal(modeledAt(initialScene, target), true);

const first = adapter.excavate(input, { at: target }).state;
const watched = adapter.advance(first, 6).state;
const neighbor = [target[0] + 1, target[1], target[2]];
const adjacent = adapter.excavate(watched, { at: neighbor }).state;
const deep = [neighbor[0], neighbor[1] - 1, neighbor[2]];
const ledge = adapter.excavate(adjacent, { at: deep }).state;
const flowing = adapter.advance(ledge, 6).state;
const scene = adapter.scene(flowing, bounds);

assert.equal(adapter.encode(input), initialWire);
assert.equal(flowing.world.revision, 3);
assert.equal(flowing.exports.length, 3);
assert.equal(flowing.soilState.timeS, 12);
assert.equal(scene.water.length, 2);
assert.equal(
  scene.water.find((column) => column.at.every((n, i) => n === deep[i]))?.rimYM,
  scene.water.find((column) => column.at.every((n, i) => n === target[i]))
    ?.rimYM,
);
assert.ok(scene.water.every((column) => column.massKg > 0));
assert.ok(Math.abs(scene.balance.residualKg) < 2e-9);

const checkpoint = adapter.encode(flowing);
const reopened = createWetClearing({ connected: true });
const restored = reopened.adapter.decode(checkpoint);
assert.equal(reopened.adapter.encode(restored), checkpoint);
assert.deepEqual(reopened.adapter.scene(restored, bounds), scene);

const boundary = [-1, target[1], target[2]];
assert.equal(modeledAt(initialScene, boundary), true);
assert.throws(
  () => adapter.excavate(input, { at: boundary }),
  /canonical water ownership/,
);
assert.equal(adapter.encode(input), initialWire);

console.log(
  JSON.stringify({
    worldId: recipe.source.id.worldId,
    revision: scene.revision,
    timeS: scene.timeS,
    waterColumns: scene.water.length,
    removedWetSoilVoxels: scene.exports.length,
    totalWaterKg: scene.balance.totalWaterKg,
    residualKg: scene.balance.residualKg,
  }),
);
