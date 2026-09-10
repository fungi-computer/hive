import assert from "node:assert/strict";
import test from "node:test";
import { createClearing } from "./clearing.ts";
import { currentVisibility } from "./exploration.ts";
import { terrainEnvironment } from "./terrain.ts";
import {
  clearingAirLayer,
  clearingAirPresentation,
} from "./air-presentation.ts";
import {
  advanceAirEnvironment,
  airEnvironmentFacts,
} from "./world-presets/goblin-environment/air-state.ts";

const source = (state) => ({
  terrain: terrainEnvironment(state.terrain),
  sites: state.sites,
});

test("Clearing air projects only currently visible physical cells", () => {
  const state = createClearing(),
    facts = airEnvironmentFacts(state.air, state.water, source(state)),
    visible = currentVisibility(state),
    presentation = clearingAirPresentation(state),
    presented = presentation.layers.flatMap((layer) => layer.cells);
  assert(presented.length > 0);
  assert(facts.cells.some((cell) => !visible(cellId(cell.id))));
  assert(presented.every((cell) => visible(cell.at)));
  assert(
    presented.every((cell) => cell.layer === Math.floor(cell.local.level)),
  );
  assert.strictEqual(clearingAirPresentation(state), presentation);
});

test("Clearing air exposes canonical heat and smoke without advancing it", () => {
  const state = createClearing(),
    initial = clearingAirPresentation(state),
    target = initial.layers.flatMap((layer) => layer.cells)[0];
  assert(target);
  const before = structuredClone(state.air),
    advanced = advanceAirEnvironment(
      state.air,
      state.water,
      source(state),
      0.05,
      [{ cellId: target.id, smokeKgS: 0.000002, heatJS: 20 }],
    );
  assert.deepEqual(state.air, before);
  state.air = advanced.state;
  const current = clearingAirPresentation(state),
    layer = clearingAirLayer(current, target.layer);
  assert(layer);
  assert(layer.maxTemperatureC > 20);
  assert(layer.maxSmokeMgM3 > 0);
  assert.notStrictEqual(current, initial);
});

function cellId(id) {
  const [x, y, z] = id.slice("cell:".length).split(",").map(Number);
  return { x, y, z };
}
