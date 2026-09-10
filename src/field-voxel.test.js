import test from "node:test";
import assert from "node:assert/strict";
import { createClearing } from "./clearing.ts";
import {
  excavateTerrain,
  terrainEnvironment,
  TERRAIN_FRAME,
} from "./terrain.ts";
import {
  prepareWaterEnvironmentGeometry,
  exchangeWaterEnvironment,
} from "./world-presets/goblin-environment/water-state.ts";
import {
  fieldWaterProblem,
  fieldWaterSources,
  fieldWaterAccess,
  FIELD_WATER,
} from "./field-water-source.ts";
import {
  createNavigationSpaces,
  physicalOccupancyProblem,
  navigationStateProblem,
} from "./navigation-space.ts";
const environment = (state) => ({
  terrain: terrainEnvironment(state.terrain),
  sites: state.sites,
});
function cut(state, at) {
  const before = environment(state),
    terrain = excavateTerrain(state.terrain, at);
  const next = prepareWaterEnvironmentGeometry(state.water, before, {
    terrain: terrainEnvironment(terrain),
    sites: state.sites,
  });
  assert.equal(next.status, "applied");
  state.terrain = terrain;
  state.water = next.state;
}
const ref = (y) => ({ binding: FIELD_WATER.id, nodeId: `cell:0,${y},128` });
function transfer(state, y, direction, massKg) {
  state.water = exchangeWaterEnvironment(state.water, environment(state), {
    id: ref(y).nodeId,
    direction,
    massKg,
  }).state;
}

test("exact lower voxel stock uses supported dry physical drawing positions", () => {
  const state = createClearing();
  // Authored excavation/rebind and finite boundary stock: not an earned pawn save.
  cut(state, [0, 14, 128]);
  cut(state, [0, 13, 128]);
  cut(state, [1, 14, 128]);
  transfer(state, 13, "deposit", 2.25);
  const lower = fieldWaterSources(state).find(
    (source) => source.nodeId === ref(13).nodeId,
  );
  assert(lower);
  assert.equal(lower.availableUnits, 2);
  assert(
    lower.accessCells.some((at) => at.x === 1 && at.y === 14 && at.z === 128),
  );
  assert(
    !fieldWaterSources(state).some(
      (source) => source.nodeId === ref(14).nodeId,
    ),
  );
  assert.equal(fieldWaterProblem(state, ref(13)), null);
  transfer(state, 13, "withdraw", 2.25);
  assert.equal(fieldWaterProblem(state, ref(13)), null);
  assert(
    !fieldWaterSources(state).some(
      (source) => source.nodeId === ref(13).nodeId,
    ),
  );
  assert(fieldWaterAccess(state, ref(13), "deposit").length > 0);
  assert.deepEqual(fieldWaterAccess(state, ref(13), "withdraw"), []);
});

test("a physical separating floor blocks drawing without invalidating cell identity", () => {
  const state = createClearing();
  cut(state, [0, 14, 128]);
  transfer(state, 14, "deposit", 2);
  assert(fieldWaterAccess(state, ref(14), "withdraw").length > 0);
  const before = environment(state),
    sites = [
      ...state.sites,
      {
        id: "cover",
        type: "floor",
        x: 7,
        z: 9,
        level: 0,
        direction: 0,
        work: 24,
        finishedAt: 0,
      },
    ];
  const next = prepareWaterEnvironmentGeometry(state.water, before, {
    terrain: before.terrain,
    sites,
  });
  assert.equal(next.status, "applied");
  state.sites = sites;
  state.water = next.state;
  assert.equal(fieldWaterProblem(state, ref(14)), null);
  assert.deepEqual(fieldWaterAccess(state, ref(14), "withdraw"), []);
});

test("wet route eligibility preserves occupied bodies and rejects collar before knowledge", () => {
  const state = createClearing();
  cut(state, [0, 14, 128]);
  transfer(state, 14, "deposit", 0.25);
  const spaces = createNavigationSpaces(state),
    at = { x: 0, y: 14, z: 128 };
  assert.equal(spaces().access(at), "blocked");
  assert.equal(spaces(null, "occupied-body").access(at), "allowed");
  assert.equal(
    spaces().access({ x: TERRAIN_FRAME.x - 1, y: 15, z: 128 }),
    "blocked",
  );
});

test("shallow surface water can be drawn from an adjacent dry same-height footing", () => {
  const state = createClearing();
  transfer(state, 15, "deposit", 2.25);
  const source = fieldWaterSources(state).find(
    (value) => value.nodeId === ref(15).nodeId,
  );
  assert(source);
  assert.equal(source.availableUnits, 2);
  assert(source.accessCells.some((at) => at.y === 15));
  const space = createNavigationSpaces(state)();
  assert.equal(space.access({ x: 0, y: 15, z: 128 }), "blocked");
  assert(source.accessCells.every((at) => space.access(at) === "allowed"));
});

test("prospective edits and restore share support protection for every fixed-ground kind", () => {
  for (const kind of ["trees", "herbs", "rocks", "watcher", "sources"]) {
    const state = createClearing();
    if (kind === "herbs")
      state.herbs.push({
        id: "authored-support-mugwort",
        kind: "mugwort",
        x: 0,
        y: 15,
        z: 128,
        stage: "ordered",
        work: 0,
        establishment: null,
        plantedAt: null,
      });
    // Authored relocation isolates this existing kind's support law, not earned play.
    const occupant = kind === "watcher" ? state.watcher : state[kind][0];
    assert(occupant, `${kind} fixture must provide an occupant`);
    Object.assign(occupant, { x: 0, y: 15, z: 128 });
    assert.equal(physicalOccupancyProblem(state), null, kind);
    assert.equal(navigationStateProblem(state), null, kind);
    cut(state, [0, 14, 128]);
    assert.equal(
      physicalOccupancyProblem(state),
      "ground occupant lacks physical support",
      kind,
    );
    assert.equal(
      navigationStateProblem(state),
      "ground occupant lacks physical support",
      kind,
    );
  }
});
