import assert from "node:assert/strict";
import test from "node:test";
import { MATERIAL, createVoxelWorld } from "../height-caves.mjs";
import {
  GOBLIN_FRAME,
  GOBLIN_SPACING_M,
  GOBLIN_WORLD_IDENTITY,
} from "./content.ts";
import { goblinTerrainProjection } from "./terrain-projection.ts";
import {
  exchangeWaterEnvironment,
  initialWaterEnvironment,
  parseWaterEnvironment,
  prepareWaterEnvironmentGeometry,
  waterEnvironmentFacts,
} from "./water-state.ts";
import {
  advanceAirEnvironment,
  airEnvironmentFacts,
  initialAirEnvironment,
  parseAirEnvironment,
  prepareAirEnvironmentGeometry,
} from "./air-state.ts";

function original() {
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY),
    source = {
      terrain: goblinTerrainProjection(world.save()),
      sites: [],
    };
  const water = initialWaterEnvironment(source),
    air = initialAirEnvironment(water, source);
  return { world, source, water, air };
}

test("cold air admission rebuilds exact geometry and binds the original ambient reference", () => {
  const fixture = original(),
    initialFacts = airEnvironmentFacts(
      fixture.air,
      fixture.water,
      fixture.source,
    );
  assert.deepEqual(Object.keys(fixture.air).sort(), [
    "air",
    "geometryRevision",
    "version",
  ]);
  assert.equal("timeS" in fixture.air, false);
  assert.equal(initialFacts.initial.smokeKg, 0);
  assert.equal(initialFacts.initial.heatJ, 0);
  assert(
    initialFacts.cells.some(
      (cell) => cell.y < (GOBLIN_FRAME.y - 8) * GOBLIN_SPACING_M[1],
    ),
  );

  const coldSource = {
      terrain: goblinTerrainProjection(fixture.world.save()),
      sites: [],
    },
    restored = parseAirEnvironment(
      structuredClone(fixture.air),
      fixture.water,
      coldSource,
    );
  assert.deepEqual(restored, fixture.air);
  assert.deepEqual(
    airEnvironmentFacts(restored, fixture.water, coldSource),
    initialFacts,
  );

  const forged = structuredClone(fixture.air);
  forged.air.initialCarrierKg += 1;
  forged.air.carrierBoundaryKg += 1;
  assert.throws(
    () => parseAirEnvironment(forged, fixture.water, fixture.source),
    /original ambient field/,
  );
  let reads = 0;
  const accessor = { ...structuredClone(fixture.air) };
  Object.defineProperty(accessor, "air", {
    enumerable: true,
    get() {
      reads++;
      return fixture.air.air;
    },
  });
  assert.throws(
    () => parseAirEnvironment(accessor, fixture.water, fixture.source),
    /record|data/i,
  );
  assert.equal(reads, 0);
});

test("one host interval combines explicit paid cell sources without saving a clock", () => {
  const fixture = original(),
    before = structuredClone(fixture.air),
    facts = airEnvironmentFacts(fixture.air, fixture.water, fixture.source),
    pair = facts.cells.find((left) =>
      facts.cells.some(
        (right) => right.id !== left.id && right.volumeId === left.volumeId,
      ),
    );
  assert(pair);
  const partner = facts.cells.find(
    (cell) => cell.id !== pair.id && cell.volumeId === pair.volumeId,
  );
  assert(partner);
  const result = advanceAirEnvironment(
    fixture.air,
    fixture.water,
    fixture.source,
    0.25,
    [
      { cellId: pair.id, smokeKgS: 1e-7, heatJS: 5 },
      { cellId: partner.id, smokeKgS: 2e-7, heatJS: 7 },
    ],
  );
  assert.deepEqual(fixture.air, before);
  assert.equal(result.receipt.seconds, 0.25);
  assert.ok(Math.abs(result.receipt.sourceSmokeKg - 0.25 * 3e-7) < 1e-20);
  assert.equal(result.receipt.sourceHeatJ, 3);
  assert.equal("timeS" in result.state, false);
  const next = airEnvironmentFacts(result.state, fixture.water, fixture.source);
  assert.equal(next.source.smokeKg, result.receipt.sourceSmokeKg);
  assert.equal(next.source.heatJ, result.receipt.sourceHeatJ);
  assert.deepEqual(
    parseAirEnvironment(
      structuredClone(result.state),
      fixture.water,
      fixture.source,
    ),
    result.state,
  );
});

test("soil-only water amounts preserve the current gas generation", () => {
  const fixture = original(),
    facts = waterEnvironmentFacts(fixture.water, fixture.source),
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
  const changed = structuredClone(fixture.water);
  changed.water.massKg[donor] -= 0.001;
  changed.water.massKg[receiver] += 0.001;
  const water = parseWaterEnvironment(changed, fixture.source),
    result = prepareAirEnvironmentGeometry(
      fixture.air,
      fixture.water,
      fixture.source,
      water,
      fixture.source,
    );
  assert.equal(result.status, "applied");
  assert.equal(result.receipt, null);
  assert.equal(result.state.geometryRevision, fixture.air.geometryRevision);
  assert.deepEqual(result.state.air, fixture.air.air);
});

test("void water changes rebind gas volume monotonically without ambient refill", () => {
  const fixture = original(),
    target = waterEnvironmentFacts(fixture.water, fixture.source).cells.find(
      (cell) =>
        cell.kind === "void" &&
        cell.at[1] < GOBLIN_FRAME.y - 8 &&
        cell.massKg === 0,
    );
  assert(target);
  const water = exchangeWaterEnvironment(fixture.water, fixture.source, {
    id: target.id,
    direction: "deposit",
    massKg: 1,
  }).state;
  assert.throws(
    () => parseAirEnvironment(fixture.air, water, fixture.source),
    /identity|definition/,
  );
  const result = prepareAirEnvironmentGeometry(
    fixture.air,
    fixture.water,
    fixture.source,
    water,
    fixture.source,
  );
  assert.equal(result.status, "applied");
  assert(result.receipt);
  assert.equal(result.state.geometryRevision, 1);
  assert.equal(
    result.state.air.initialCarrierKg,
    fixture.air.air.initialCarrierKg,
  );
  assert.equal(
    result.state.air.carrierBoundaryKg,
    fixture.air.air.carrierBoundaryKg,
  );
  const cell = airEnvironmentFacts(
    result.state,
    water,
    fixture.source,
  ).cells.find((entry) => entry.id === target.id);
  assert(cell);
  assert.equal(cell.freeVolumeM3, target.capacityKg / 1_000 - 0.001);
});

test("a newly excavated actual void starts with no invented carrier", () => {
  const fixture = original(),
    target = waterEnvironmentFacts(fixture.water, fixture.source).cells.find(
      (cell) =>
        cell.kind === "soil" &&
        cell.at[0] === GOBLIN_FRAME.x + 7 &&
        cell.at[2] === GOBLIN_FRAME.z + 9,
    );
  assert(target);
  const [x, y, z] = target.at;
  assert.equal(
    fixture.world.edit({
      expectedRevision: 0,
      cells: [
        { x, y, z, expectedMaterial: MATERIAL.soil, material: MATERIAL.air },
      ],
    }).ok,
    true,
  );
  const after = {
      terrain: goblinTerrainProjection(fixture.world.save()),
      sites: [],
    },
    waterResult = prepareWaterEnvironmentGeometry(
      fixture.water,
      fixture.source,
      after,
    );
  assert.equal(waterResult.status, "applied");
  const airResult = prepareAirEnvironmentGeometry(
    fixture.air,
    fixture.water,
    fixture.source,
    waterResult.state,
    after,
  );
  assert.equal(airResult.status, "applied");
  assert.equal(
    airResult.state.air.initialCarrierKg,
    fixture.air.air.initialCarrierKg,
  );
  assert.equal(airResult.receipt.carrierBoundaryKg, 0);
  assert(
    airEnvironmentFacts(airResult.state, waterResult.state, after).cells.some(
      (cell) => cell.id === target.id,
    ),
  );
});
