import test from "node:test";
import { roomInterior } from "./room-space.ts";
import assert from "node:assert/strict";
import { createClearing } from "./clearing.ts";
import {
  placementFooting,
  placementLevels,
  insidePlacement,
} from "./game-space.ts";
import {
  BUILDINGS,
  placementProblem,
  buildingEnvelopeProblem,
  buildingVisualPlacement,
  floorSupported,
  indoors,
} from "./construction.js";
import { terrainGeometry, TERRAIN_FRAME } from "./terrain.ts";
import { createStructureGeometry } from "./structure-environment.ts";
import {
  createNavigationSpaces,
  HUMAN_NAVIGATION,
} from "./navigation-space.ts";
import { route } from "./engine/navigation/index.ts";
import {
  observeClearing,
  currentlyVisible,
  knownFootings,
} from "./exploration.ts";
import { observedTerrainSurfaces } from "./terrain-surface-geometry.js";
import {
  parseLiveClearing,
  serializeClearing,
  snapshotFor,
} from "./clearing-state.ts";

const site = (id, type, x, z, level) => ({
  id,
  type,
  x,
  z,
  level,
  direction: 0,
  work: 0,
  finishedAt: 0,
});

test("placement heights derive from the registered world, not Ground/Upper", () => {
  const state = createClearing(),
    range = placementLevels(state.terrain);
  assert(insidePlacement({ x: 5, z: 5, level: -2 }));
  assert(insidePlacement({ x: 5, z: 5, level: 3 }));
  for (const level of [-2, -1, 0, 1, 2, 3])
    assert.equal(
      buildingEnvelopeProblem(
        state,
        site(`wall:${level}`, "wall", 5, 5, level),
      ),
      null,
    );
  assert.notEqual(
    buildingEnvelopeProblem(
      state,
      site("too-high", "wall", 5, 5, range.max + 1),
    ),
    null,
  );
  assert.notEqual(
    buildingEnvelopeProblem(
      state,
      site("too-low", "wall", 5, 5, range.min - 1),
    ),
    null,
  );
});

test("three successive actual stair definitions admit the same paid traversal owner", () => {
  const state = createClearing();
  // Authored completed facts test placement/link composition, not earned wood.
  for (let level = 0; level < 3; level++) {
    const next = site(`stair:${level}`, "stair", 8, 2 + level * 2, level);
    assert.equal(placementProblem(state, next), "");
    state.sites.push(next);
  }
  const result = route(
    createNavigationSpaces(state)(),
    placementFooting(state.sites[0]),
    placementFooting({ x: 8, z: 8, level: 3 }),
    HUMAN_NAVIGATION,
  );
  assert.equal(result.kind, "route");
  assert.equal(result.ticks, 54);
});

test("one room/support rule applies to three authored storeys", () => {
  const state = createClearing();
  for (let level = 0; level < 3; level++) {
    for (let x = 4; x <= 6; x++)
      for (let z = 4; z <= 6; z++) {
        if (level > 0)
          state.sites.push(
            site(`floor:${x}:${z}:${level}`, "floor", x, z, level),
          );
        if (x !== 5 || z !== 5)
          state.sites.push(
            site(`wall:${x}:${z}:${level}`, "wall", x, z, level),
          );
      }
    assert(indoors(state, level).has(`5,5,${level}`));
    assert(floorSupported(state, { x: 5, z: 5, level: level + 1 }));
  }
});

test("roof and floor target the same physical surface while original roof bake keeps its anchor", () => {
  const state = createClearing(),
    terrain = terrainGeometry(state.terrain);
  const roof = site("roof", "roof", 5, 5, 2),
    floor = site("floor", "floor", 6, 5, 2);
  const query = createStructureGeometry(
    { terrain, sites: [roof, floor] },
    terrain.bounds,
  );
  const a = placementFooting(roof),
    b = placementFooting(floor);
  assert.equal(query.face("y", [a.x, a.y, a.z]), "closed");
  assert.equal(query.face("y", [b.x, b.y, b.z]), "closed");
  assert.equal(buildingVisualPlacement(roof).level, 1);
  assert.equal(buildingVisualPlacement(floor).level, 2);
  assert.equal(BUILDINGS.roof.environment.offsetVoxels, 0);
});

test("observation remembers geometry but a later wall removes current sight", () => {
  const state = createClearing(),
    actor = state.actors.rowan;
  const target = { x: actor.x, y: actor.y + 3, z: actor.z - 2 };
  assert(currentlyVisible(state, target));
  observeClearing(state);
  const remembered = state.exploration.observed.find(
    (fact) =>
      fact.at.x === target.x &&
      fact.at.y === target.y &&
      fact.at.z === target.z,
  );
  assert(remembered);
  const previousMemory = state.exploration;
  const previousBytes = JSON.stringify(previousMemory);
  state.sites.push(site("screen", "wall", 7, 9, 0));
  observeClearing(state);
  assert(!currentlyVisible(state, target));
  assert.equal(JSON.stringify(previousMemory), previousBytes);
  assert(knownFootings(state)(target));
  assert.deepEqual(
    state.exploration.observed.find(
      (fact) =>
        fact.at.x === target.x &&
        fact.at.y === target.y &&
        fact.at.z === target.z,
    ),
    remembered,
  );
});

test("two remembered underground chambers project independently without consulting live terrain", () => {
  // Explicit remembered fixture: these observations are not an earned excavation.
  const observed = [];
  for (const level of [-1, -2]) {
    const at = placementFooting({ x: 5, z: 5, level });
    observed.push({
      at,
      solid: false,
      terrainSolid: false,
      faces: [false, false, false, false, false, false],
    });
    observed.push({
      at: { ...at, y: at.y - 1 },
      solid: true,
      terrainSolid: true,
      faces: [false, false, false, false, false, false],
    });
  }
  const memory = { version: 1, observed };
  for (const level of [-1, -2]) {
    const faces = observedTerrainSurfaces(memory, level);
    assert.equal(faces.length, 1);
    assert.equal(faces[0].ownerVoxel[1], TERRAIN_FRAME.y + level * 4 - 1);
    assert.equal(faces[0].cell.level, level);
  }
  assert.deepEqual(
    observedTerrainSurfaces({ version: 1, observed: [] }, -1),
    [],
  );
});

test("current observed facts survive paused reconstruction and reject duplicate identities", () => {
  const state = createClearing();
  state.paused = true;
  const saved = serializeClearing(state),
    restored = parseLiveClearing(saved);
  assert.deepEqual(restored.exploration, state.exploration);
  assert.equal(restored.tick, state.tick);
  assert.equal(restored.paused, true);
  assert.equal(snapshotFor(state).schema, 23);
  saved.exploration.observed.push(
    structuredClone(saved.exploration.observed[0]),
  );
  assert.throws(() => parseLiveClearing(saved), /duplicate observed cell/);
});

test("the same room query separates two authored underground chambers with one physical floor", () => {
  const state = createClearing(),
    registered = terrainGeometry(state.terrain);
  // Registered query fixture, not a forged playable save or an earned dig.
  const terrain = {
    ...registered,
    identity: "authored-stacked-chambers",
    solidAt(x, y, z) {
      const localX = x - TERRAIN_FRAME.x,
        localZ = z - TERRAIN_FRAME.z;
      return !(
        localX >= 5 &&
        localX <= 6 &&
        localZ >= 5 &&
        localZ <= 6 &&
        y >= TERRAIN_FRAME.y - 8 &&
        y < TERRAIN_FRAME.y
      );
    },
  };
  const floors = [];
  for (let x = 5; x <= 6; x++)
    for (let z = 5; z <= 6; z++)
      floors.push(site(`separator:${x}:${z}`, "floor", x, z, -1));
  const geometry = createStructureGeometry(
    { terrain, sites: floors },
    terrain.bounds,
  );
  for (const level of [-2, -1]) {
    const room = roomInterior(geometry, level, new Set(), new Set());
    assert.equal(room.size, 4);
    assert(room.has(`5,5,${level}`));
  }
  const upperFloor = placementFooting({ x: 5, z: 5, level: -1 });
  assert.equal(
    geometry.face("y", [upperFloor.x, upperFloor.y, upperFloor.z]),
    "closed",
  );
  assert.equal(
    geometry.point([upperFloor.x, upperFloor.y, upperFloor.z]),
    "empty",
  );
  assert.equal(
    geometry.point([upperFloor.x, upperFloor.y - 1, upperFloor.z]),
    "empty",
  );
});
