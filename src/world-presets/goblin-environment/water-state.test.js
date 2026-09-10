import test from "node:test";
import assert from "node:assert/strict";
import { createVoxelWorld } from "../height-caves.mjs";
import { GOBLIN_WORLD_IDENTITY, GOBLIN_FRAME } from "./content.ts";
import { goblinTerrainProjection } from "./terrain-projection.ts";
import {
  initialWaterEnvironment,
  parseWaterEnvironment,
  prepareWaterEnvironmentGeometry,
  waterEnvironmentFacts,
  waterEnvironmentGeometry,
  exchangeWaterEnvironment,
} from "./water-state.ts";

function clearing() {
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY);
  const source = { terrain: goblinTerrainProjection(world.save()), sites: [] };
  return { world, source, state: initialWaterEnvironment(source) };
}

test("the game water component reconstructs from actual terrain and sites without a saved query or clock", () => {
  const { world, source, state } = clearing();
  const geometry = waterEnvironmentGeometry(state, source);
  assert.equal(waterEnvironmentGeometry(state, source), geometry);
  assert.deepEqual(Object.keys(state).sort(), [
    "ceilingY",
    "geometryRevision",
    "version",
    "water",
  ]);
  const coldSource = {
    terrain: goblinTerrainProjection(world.save()),
    sites: [],
  };
  const restored = parseWaterEnvironment(structuredClone(state), coldSource);
  assert.deepEqual(restored, state);
  const forged = structuredClone(state);
  forged.water.initialTotalKg += 1;
  forged.water.boundaryKg -= 1;
  assert.throws(
    () => parseWaterEnvironment(forged, coldSource),
    /original generated supply/,
  );
  assert.deepEqual(
    waterEnvironmentFacts(restored, coldSource),
    waterEnvironmentFacts(state, source),
  );
  const built = {
    terrain: source.terrain,
    sites: [
      {
        id: "upper-floor",
        type: "floor",
        x: 7,
        z: 9,
        level: 1,
        direction: 0,
        finishedAt: 0,
      },
    ],
  };
  assert.throws(
    () => parseWaterEnvironment(state, built),
    /definition|coverage|water/i,
  );
  const next = prepareWaterEnvironmentGeometry(state, source, built);
  assert.equal(next.status, "applied");
  assert.equal(next.state.geometryRevision, 1);
  assert.notEqual(
    waterEnvironmentGeometry(next.state, built).physical,
    geometry.physical,
  );
  assert.deepEqual(next.receipt.removedPoreWater, []);
  assert.equal(
    waterEnvironmentFacts(next.state, built).initialTotalKg,
    state.water.initialTotalKg,
  );
  assert.deepEqual(
    parseWaterEnvironment(structuredClone(next.state), built),
    next.state,
  );
});

test("the real excavation candidate exposes pore custody while a vessel boundary keeps the original baseline", () => {
  const { world, source, state } = clearing();
  const before = structuredClone(state);
  const target = waterEnvironmentFacts(state, source).cells.find(
    (cell) =>
      cell.kind === "soil" &&
      cell.at[0] === GOBLIN_FRAME.x + 7 &&
      cell.at[2] === GOBLIN_FRAME.z + 9,
  );
  assert(target);
  const [x, y, z] = target.at;
  assert.equal(
    world.edit({
      expectedRevision: 0,
      cells: [{ x, y, z, expectedMaterial: 1, material: 0 }],
    }).ok,
    true,
  );
  const after = { terrain: goblinTerrainProjection(world.save()), sites: [] };
  const prepared = prepareWaterEnvironmentGeometry(state, source, after);
  assert.equal(prepared.status, "applied");
  assert.deepEqual(
    state,
    before,
    "preparation cannot publish or edit its predecessor",
  );
  assert.equal(prepared.receipt.removedPoreWater.length, 1);
  assert.equal(prepared.receipt.removedPoreWater[0].massKg, target.massKg);
  assert.equal(prepared.receipt.removedPoreWater[0].id, target.id);
  const filled = exchangeWaterEnvironment(prepared.state, after, {
    id: target.id,
    direction: "deposit",
    massKg: 1,
  });
  assert.equal(filled.receipt.boundaryKg, 1);
  const dryGeometry = waterEnvironmentGeometry(prepared.state, after);
  const wetGeometry = waterEnvironmentGeometry(filled.state, after);
  assert.equal(wetGeometry.physical, dryGeometry.physical);
  assert.equal(wetGeometry.definition, dryGeometry.definition);
  assert.notEqual(wetGeometry.facts, dryGeometry.facts);
  assert.equal(waterEnvironmentGeometry(filled.state, after), wetGeometry);
  const emptied = exchangeWaterEnvironment(filled.state, after, {
    id: target.id,
    direction: "withdraw",
    massKg: 1,
  });
  assert.equal(emptied.receipt.boundaryKg, -1);
  assert.equal(emptied.state.water.initialTotalKg, state.water.initialTotalKg);
  assert.equal(emptied.state.water.boundaryKg, -target.massKg);
  assert.deepEqual(
    parseWaterEnvironment(structuredClone(emptied.state), after),
    emptied.state,
  );
  assert.throws(
    () => parseWaterEnvironment(emptied.state, source),
    /definition|water/i,
  );
});
