import assert from "node:assert/strict";
import test from "node:test";
import { createVoxelWorld } from "../height-caves.mjs";
import { GOBLIN_WORLD_IDENTITY } from "./content.ts";
import { goblinTerrainProjection } from "./terrain-projection.ts";
import {
  exchangeWaterEnvironment,
  initialWaterEnvironment,
  parseWaterEnvironment,
  waterEnvironmentFacts,
  waterEnvironmentGeometry,
} from "./water-state.ts";
import { goblinGasGeometry, updateGoblinGasGeometry } from "./gas-geometry.ts";
import {
  goblinAtmosphereFromGeometry,
  updateGoblinAtmosphereGeometry,
} from "../goblin-atmosphere.ts";

function fixture() {
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY);
  const source = {
      terrain: goblinTerrainProjection(world.save()),
      sites: [],
    },
    water = initialWaterEnvironment(source),
    geometry = waterEnvironmentGeometry(water, source),
    gas = goblinGasGeometry(
      source.terrain,
      geometry.physical,
      geometry.definition,
      geometry.facts,
      0,
      geometry.ceilingY,
    );
  return { source, water, geometry, gas };
}

test("soil stock changes retain the gas snapshot and topology owner", () => {
  const { source, water, geometry, gas } = fixture(),
    facts = waterEnvironmentFacts(water, source),
    donor = facts.cells.findIndex(
      (cell) => cell.kind === "soil" && cell.massKg > 0.001,
    ),
    receiver = facts.cells.findIndex(
      (cell, index) =>
        index !== donor &&
        cell.kind === "soil" &&
        cell.capacityKg - cell.massKg > 0.001,
    );
  assert.notEqual(donor, -1);
  assert.notEqual(receiver, -1);
  const encoded = structuredClone(water);
  encoded.water.massKg[donor] -= 0.001;
  encoded.water.massKg[receiver] += 0.001;
  const changedWater = parseWaterEnvironment(encoded, source),
    changed = waterEnvironmentGeometry(changedWater, source),
    updated = updateGoblinGasGeometry(
      gas,
      changed.physical,
      changed.definition,
      changed.facts,
      0,
      changed.ceilingY,
    );
  assert.equal(updated.status, "reused");
  assert.equal(updated.changed, false);
  assert.strictEqual(updated.snapshot, gas);
});

test("a void volume boundary change takes the conservative gas rebuild route", () => {
  const { source, water, geometry, gas } = fixture(),
    target = waterEnvironmentFacts(water, source).cells.find(
      (cell) => cell.kind === "void" && cell.at[1] < 0 && cell.massKg === 0,
    );
  assert(target);
  const changedWater = exchangeWaterEnvironment(water, source, {
      id: target.id,
      direction: "deposit",
      massKg: 1,
    }).state,
    changed = waterEnvironmentGeometry(changedWater, source),
    updated = updateGoblinGasGeometry(
      gas,
      changed.physical,
      changed.definition,
      changed.facts,
      0,
      changed.ceilingY,
    );
  assert.equal(updated.status, "rebuild");
  const owner = goblinAtmosphereFromGeometry(gas, {
      regionId: GOBLIN_WORLD_IDENTITY.worldId,
    }),
    successor = updateGoblinAtmosphereGeometry(
      Object.freeze({ ...gas, revision: 1 }),
      owner,
    );
  assert(successor);
  assert.strictEqual(successor.topologyCells, owner.topologyCells);
  assert.strictEqual(successor.topologyFaces, owner.topologyFaces);
  assert.notStrictEqual(successor, owner);
});

test("changed face distance cannot masquerade as a stock metric update", () => {
  const gas = {
    identity: "metric-distance:0",
    revision: 0,
    cells: [{ id: "room", x: 0, y: 0, z: 0, freeVolumeM3: 1 }],
    openFaces: [{ id: "vent", a: "room", b: null, areaM2: 1, distanceM: 1 }],
  };
  const owner = goblinAtmosphereFromGeometry(gas, { regionId: "distance-law" });
  const changed = {
    ...gas,
    revision: 1,
    identity: "metric-distance:1",
    openFaces: [{ ...gas.openFaces[0], distanceM: 2 }],
  };
  assert.equal(updateGoblinAtmosphereGeometry(changed, owner), null);
  assert.equal(
    goblinAtmosphereFromGeometry(changed, { regionId: "distance-law" })
      .definition.openings[0].distanceM,
    2,
  );
});
