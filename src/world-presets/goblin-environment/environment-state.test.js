import assert from "node:assert/strict";
import test from "node:test";
import { createMaterialsState } from "../../materials.ts";
import { initialTerrain, terrainEnvironment } from "../../terrain.ts";
import { GOBLIN_FRAME } from "./content.ts";
import {
  initialWaterEnvironment,
  waterEnvironmentFacts,
  parseWaterEnvironment,
} from "./water-state.ts";
import {
  initialAirEnvironment,
  airEnvironmentFacts,
  parseAirEnvironment,
} from "./air-state.ts";
import { initialPaidAtmosphereReleases } from "./paid-releases.ts";
import {
  prepareEnvironmentWaterTransfer,
  advanceEnvironment,
} from "./environment-state.ts";

function original() {
  const source = { terrain: terrainEnvironment(initialTerrain()), sites: [] };
  const water = initialWaterEnvironment(source);
  const air = initialAirEnvironment(water, source);
  return {
    source,
    state: {
      water,
      air,
      atmosphereReleases: initialPaidAtmosphereReleases(
        createMaterialsState(),
        airEnvironmentFacts(air, water, source),
      ),
    },
  };
}

test("one physical field transfer publishes matching water and gas geometry through cold admission", () => {
  const { source, state } = original();
  const before = structuredClone(state);
  const cell = waterEnvironmentFacts(state.water, source).cells.find(
    (cell) =>
      cell.kind === "void" &&
      cell.massKg === 0 &&
      cell.at[1] < GOBLIN_FRAME.y - 8,
  );
  assert(cell);
  const previousAir = airEnvironmentFacts(
    state.air,
    state.water,
    source,
  ).cells.find((entry) => entry.id === cell.id);
  // Explicit finite external boundary stock, not an earned pail/game save.
  const next = prepareEnvironmentWaterTransfer(state, source, {
    id: cell.id,
    direction: "deposit",
    massKg: 1,
  });
  assert.equal(next.status, "applied");
  assert.deepEqual(state, before);
  assert.equal(
    waterEnvironmentFacts(next.state.water, source).cells.find(
      (entry) => entry.id === cell.id,
    ).massKg,
    1,
  );
  const currentAir = airEnvironmentFacts(
    next.state.air,
    next.state.water,
    source,
  ).cells.find((entry) => entry.id === cell.id);
  assert.ok(
    Math.abs(previousAir.freeVolumeM3 - currentAir.freeVolumeM3 - 0.001) <
      1e-12,
  );
  const water = parseWaterEnvironment(
    structuredClone(next.state.water),
    source,
  );
  assert.deepEqual(
    parseAirEnvironment(structuredClone(next.state.air), water, source),
    next.state.air,
  );
  assert.equal(
    next.state.air.air.initialCarrierKg,
    state.air.air.initialCarrierKg,
  );
});

test("late rejected air input cannot publish a previously computed water step", () => {
  const { source, state } = original();
  const before = structuredClone(state);
  assert.throws(
    () =>
      advanceEnvironment(state, source, 0.1, [
        { cellId: "missing-physical-cell", smokeKgS: 0.001, heatJS: 1 },
      ]),
    /gas geometry has no volume at missing-physical-cell/,
  );
  assert.deepEqual(state, before);
});
