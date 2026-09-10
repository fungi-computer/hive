import assert from "node:assert/strict";
import test from "node:test";
import { createClearing, step } from "./clearing.ts";
import { currentVisibility } from "./exploration.ts";
import { groundFooting } from "./game-space.ts";
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

test("same-tick detached body and site publication rechecks current sight", () => {
  const state = createClearing(),
    initial = clearingAirPresentation(state),
    previousActors = state.actors,
    previousSites = state.sites;
  state.paused = true;
  assert.deepEqual(
    step(state, null, [{ kind: "recruit", party: "home", actor: "sedge" }]),
    [{ status: "applied" }],
  );
  assert.notStrictEqual(state.actors, previousActors);
  assert.notStrictEqual(state.sites, previousSites);
  assert.strictEqual(clearingAirPresentation(state), initial);
  state.actors = {
    ...state.actors,
    rowan: {
      ...state.actors.rowan,
      ...groundFooting(state.terrain, { x: 2, z: 2 }),
    },
  };
  state.sites = [...state.sites];
  const current = clearingAirPresentation(state),
    visible = currentVisibility(state),
    cells = current.layers.flatMap((layer) => layer.cells);
  assert.notStrictEqual(current, initial);
  assert(cells.length > 0);
  assert(cells.every((cell) => visible(cell.at)));
  assert(
    initial.layers
      .flatMap((layer) => layer.cells)
      .some((cell) => !visible(cell.at)),
  );
});

function cellId(id) {
  const [x, y, z] = id.slice("cell:".length).split(",").map(Number);
  return { x, y, z };
}
