import assert from "node:assert/strict";
import test from "node:test";
import { createClearing, step } from "./clearing.ts";
import { BUILDINGS, siteMaterialEndpoint } from "./construction.js";
import {
  admitBrew,
  attendBrew,
  brewStationReadiness,
  brewAtmosphereProblem,
} from "./brewing.ts";
import { HERBAL_ALE_V1 } from "./recipes.ts";
import { placementFooting } from "./game-space.ts";
import { terrainEnvironment } from "./terrain.ts";
import { GOBLIN_BREW_ATMOSPHERE_RELEASE } from "./world-presets/goblin-atmosphere.ts";
import {
  airEnvironmentFacts,
  parseAirEnvironment,
} from "./world-presets/goblin-environment/air-state.ts";
import {
  prepareEnvironmentGeometry,
  prepareEnvironmentWaterTransfer,
  advancePaidEnvironment,
} from "./world-presets/goblin-environment/environment-state.ts";
import { parsePaidAtmosphereReleases } from "./world-presets/goblin-environment/paid-releases.ts";
import { parseWaterEnvironment } from "./world-presets/goblin-environment/water-state.ts";

const geometry = (state) => ({
  terrain: terrainEnvironment(state.terrain),
  sites: state.sites,
});
const facts = (state) =>
  airEnvironmentFacts(state.air, state.water, geometry(state));

function elapsedTicks(state, ticks) {
  for (let tick = 0; tick < ticks; tick++)
    Object.assign(
      state,
      advancePaidEnvironment(state, state.materials, geometry(state), 1),
    );
}

// Explicit staged-input fixture: this proves real payment/environment callers,
// not gathering, construction cost or an earned whole-game save.
function readyBatch() {
  const state = createClearing(117);
  const station = {
    id: "paid-brew",
    type: "brew-station",
    x: 7,
    z: 5,
    level: 0,
    direction: 0,
    finishedAt: 0,
    work: BUILDINGS["brew-station"].ticks,
  };
  const sites = [...state.sites, station];
  const prepared = prepareEnvironmentGeometry(state, geometry(state), {
    terrain: terrainEnvironment(state.terrain),
    sites,
  });
  assert.equal(prepared.status, "applied");
  Object.assign(state, prepared.state, { sites });
  for (const requirement of [
    ...HERBAL_ALE_V1.consumed,
    ...HERBAL_ALE_V1.retained,
  ]) {
    const endpoint = siteMaterialEndpoint(station, requirement.slot);
    assert(endpoint);
    state.materials.lots.push({
      id: `staged:${requirement.role}`,
      material: requirement.material,
      quantity: requirement.quantity,
      location: { kind: "container", container: endpoint.destination.id },
    });
  }
  const ready = brewStationReadiness(state, station, "paid-batch");
  assert.equal(ready.kind, "ready");
  const admitted = admitBrew(state, {
    id: "paid-batch",
    job: "paid-job",
    station: station.id,
    binding: ready.binding,
  });
  assert.equal(admitted.ok, true);
  for (let index = 1; index < HERBAL_ALE_V1.timings.prepare; index++)
    assert.deepEqual(attendBrew(state, "paid-batch"), {
      ok: true,
      value: "working",
    });
  const origin = placementFooting(station);
  const offset = GOBLIN_BREW_ATMOSPHERE_RELEASE.sourceOffsetVoxels;
  const receiver = `cell:${origin.x + offset[0]},${origin.y + offset[1]},${origin.z + offset[2]}`;
  assert(facts(state).cells.some((entry) => entry.id === receiver));
  return { state, receiver };
}

test("actual brew payment and finite air release keep one receipt through pause and cold continuation", () => {
  const { state, receiver } = readyBatch();
  assert.equal(state.materials.transformations.length, 0);
  assert.deepEqual(attendBrew(state, "paid-batch"), {
    ok: true,
    value: "fermenting",
  });
  assert.equal(state.materials.transformations.length, 1);
  assert.equal(
    state.materials.lots.some((lot) => lot.id === "staged:fuel"),
    false,
  );
  assert.deepEqual(state.atmosphereReleases.obligations, [
    {
      transformationId: "paid-batch",
      cellId: receiver,
      elapsedTicks: 0,
    },
  ]);
  const paid = structuredClone(state.materials);
  assert.deepEqual(attendBrew(state, "paid-batch"), {
    ok: false,
    reason: "wrong-phase",
  });
  assert.deepEqual(state.materials, paid);
  state.paused = true;
  const paused = structuredClone(state);
  step(state, null);
  assert.deepEqual(state, paused);
  state.paused = false;
  elapsedTicks(state, 107);
  const source = geometry(state);
  const water = parseWaterEnvironment(structuredClone(state.water), source);
  const air = parseAirEnvironment(structuredClone(state.air), water, source);
  const atmosphereReleases = parsePaidAtmosphereReleases(
    structuredClone(state.atmosphereReleases),
    state.materials,
    airEnvironmentFacts(air, water, source),
  );
  Object.assign(state, { water, air, atmosphereReleases });
  elapsedTicks(state, 13);
  assert.equal(state.atmosphereReleases.obligations[0].elapsedTicks, 120);
  const emitted = facts(state).source;
  for (const [quantity, expected] of Object.entries(
    GOBLIN_BREW_ATMOSPHERE_RELEASE.totals,
  ))
    assert(
      Math.abs(emitted[quantity] - expected) <=
        128 * Number.EPSILON * Math.abs(expected),
    );
  Object.assign(
    state,
    advancePaidEnvironment(state, state.materials, source, 1),
  );
  assert.deepEqual(facts(state).source, emitted);
  assert.deepEqual(state.materials, paid);
});

test("saved active source cannot move to another existing gas cell", () => {
  const { state, receiver } = readyBatch();
  assert.equal(attendBrew(state, "paid-batch").value, "fermenting");
  assert.equal(brewAtmosphereProblem(state), null);
  const another = facts(state).cells.find((cell) => cell.id !== receiver);
  assert(another);
  const moved = {
    ...state.atmosphereReleases,
    obligations: state.atmosphereReleases.obligations.map((entry) => ({
      ...entry,
      cellId: another.id,
    })),
  };
  // Both cells exist and source totals still match, so generic air admission
  // succeeds. The actual game's material/process/station relation rejects it.
  parsePaidAtmosphereReleases(moved, state.materials, facts(state));
  assert.match(
    brewAtmosphereProblem({ ...state, atmosphereReleases: moved }),
    /detached from its hearth/,
  );
});

test("a flooded source waits before payment and cannot replace an already owed receiver", () => {
  const { state, receiver } = readyBatch();
  const emptyReceiver = facts(state).cells.find(
    (entry) => entry.id === receiver,
  );
  const filled = prepareEnvironmentWaterTransfer(state, geometry(state), {
    id: receiver,
    direction: "deposit",
    massKg: emptyReceiver.freeVolumeM3 * 1000,
  });
  assert.equal(filled.status, "applied");
  const dry = {
    water: state.water,
    air: state.air,
    atmosphereReleases: state.atmosphereReleases,
  };
  Object.assign(state, filled.state);
  const before = structuredClone(state);
  const waiting = attendBrew(state, "paid-batch");
  assert.equal(waiting.value, "waiting");
  assert.deepEqual(state, before);
  Object.assign(state, dry);
  assert.equal(attendBrew(state, "paid-batch").value, "fermenting");
  const paid = structuredClone(state);
  const blocked = prepareEnvironmentWaterTransfer(state, geometry(state), {
    id: receiver,
    direction: "deposit",
    massKg: emptyReceiver.freeVolumeM3 * 1000,
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.reason, "source-cell-unavailable");
  assert.deepEqual(state, paid);
});
