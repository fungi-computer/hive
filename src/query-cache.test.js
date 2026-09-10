import assert from "node:assert/strict";
import test from "node:test";
import { createClearing } from "./clearing.ts";
import { createNavigationSpaces } from "./navigation-space.ts";
import { fieldWaterSources } from "./field-water-source.ts";
import { clearingAirPresentation } from "./air-presentation.ts";
import { FIELD_WATER } from "./field-water-source.ts";
import { excavateTerrain, terrainEnvironment } from "./terrain.ts";
import {
  prepareEnvironmentGeometry,
  prepareEnvironmentWaterTransfer,
} from "./world-presets/goblin-environment/environment-state.ts";

function cut(state, at) {
  const terrain = excavateTerrain(state.terrain, at);
  const result = prepareEnvironmentGeometry(
    {
      water: state.water,
      air: state.air,
      atmosphereReleases: state.atmosphereReleases,
    },
    { terrain: terrainEnvironment(state.terrain), sites: state.sites },
    { terrain: terrainEnvironment(terrain), sites: state.sites },
  );
  assert.equal(result.status, "applied");
  state.terrain = terrain;
  state.water = result.state.water;
  state.air = result.state.air;
  state.atmosphereReleases = result.state.atmosphereReleases;
}

test("clearing query projections reuse unchanged owner inputs", () => {
  const state = createClearing();
  assert.strictEqual(createNavigationSpaces(state), createNavigationSpaces(state));
  assert.strictEqual(fieldWaterSources(state), fieldWaterSources(state));
  assert.strictEqual(clearingAirPresentation(state), clearingAirPresentation(state));
});

test("mutable site and actor arrays invalidate dependent projections", () => {
  const state = createClearing();
  const beforeNavigation = createNavigationSpaces(state);
  const beforeWater = fieldWaterSources(state);
  const beforeAir = clearingAirPresentation(state);
  state.sites.push({
    id: "query-cache-wall",
    type: "wall",
    x: 4,
    z: 4,
    level: 0,
    direction: 0,
    work: 1,
    finishedAt: null,
  });
  state.actors.rowan.x += 1;
  assert.notStrictEqual(createNavigationSpaces(state), beforeNavigation);
  assert.notStrictEqual(fieldWaterSources(state), beforeWater);
  assert.notStrictEqual(clearingAirPresentation(state), beforeAir);

  const afterSiteNavigation = createNavigationSpaces(state);
  const afterSiteWater = fieldWaterSources(state);
  state.trees[0].felledAt = 1;
  assert.notStrictEqual(createNavigationSpaces(state), afterSiteNavigation);
  assert.notStrictEqual(fieldWaterSources(state), afterSiteWater);
});

test("field source access follows a real fixed rim obstacle", () => {
  const state = createClearing();
  cut(state, [0, 14, 128]);
  cut(state, [0, 13, 128]);
  cut(state, [1, 14, 128]);
  const paired = prepareEnvironmentWaterTransfer(
    {
      water: state.water,
      air: state.air,
      atmosphereReleases: state.atmosphereReleases,
    },
    { terrain: terrainEnvironment(state.terrain), sites: state.sites },
    { id: "cell:0,15,128", direction: "deposit", massKg: 2.25 },
  );
  assert.equal(paired.status, "applied");
  state.water = paired.state.water;
  state.air = paired.state.air;
  state.atmosphereReleases = paired.state.atmosphereReleases;
  const source = fieldWaterSources(state).find(
    (candidate) => candidate.nodeId === "cell:0,15,128",
  );
  assert(source, "clearing fixture must expose a finite water rim");
  const blockers = source.accessCells.map((rim, index) => ({
    ...state.trees[0],
    id: `query-rim-blocker-${index}`,
    x: rim.x,
    y: rim.y,
    z: rim.z,
    felledAt: null,
  }));
  state.trees.push(...blockers);
  assert.equal(
    fieldWaterSources(state).some((candidate) => candidate.nodeId === source.nodeId),
    false,
  );
  for (const blocker of blockers) blocker.felledAt = 1;
  assert(
    fieldWaterSources(state).some((candidate) => candidate.nodeId === source.nodeId),
  );
});

test("field source facts invalidate on an admitted water stock change", () => {
  const state = createClearing();
  cut(state, [0, 14, 128]);
  cut(state, [0, 13, 128]);
  cut(state, [1, 14, 128]);
  const source = { terrain: terrainEnvironment(state.terrain), sites: state.sites };
  const reference = {
    binding: FIELD_WATER.id,
    nodeId: "cell:0,15,128",
  };
  const base = { water: state.water, air: state.air, atmosphereReleases: state.atmosphereReleases };
  const deposited = prepareEnvironmentWaterTransfer(base, source, {
    id: reference.nodeId,
    direction: "deposit",
    massKg: 2.25,
  });
  assert.equal(deposited.status, "applied");
  state.water = deposited.state.water;
  state.air = deposited.state.air;
  state.atmosphereReleases = deposited.state.atmosphereReleases;
  const before = fieldWaterSources(state);
  const withdrawn = prepareEnvironmentWaterTransfer(
    { water: state.water, air: state.air, atmosphereReleases: state.atmosphereReleases },
    source,
    { id: reference.nodeId, direction: "withdraw", massKg: 2.25 },
  );
  assert.equal(withdrawn.status, "applied");
  state.water = withdrawn.state.water;
  state.air = withdrawn.state.air;
  state.atmosphereReleases = withdrawn.state.atmosphereReleases;
  const after = fieldWaterSources(state);
  assert.notStrictEqual(after, before);
  assert.equal(
    after.some((source) => source.nodeId === reference.nodeId),
    false,
  );
});
