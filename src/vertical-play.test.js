import test from "node:test";
import { structuralSupport } from "./structure-support.js";
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
  roofSupported,
  structureSupportProblem,
  workPositions,
  indoors,
} from "./construction.js";
import { terrainGeometry, TERRAIN_FRAME } from "./terrain.ts";
import { createStructureGeometry } from "./structure-environment.ts";
import {
  createNavigationSpaces,
  HUMAN_NAVIGATION,
} from "./navigation-space.ts";
import { route, standing } from "./engine/navigation/index.ts";
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

test("six-step spans stay rooted across segments and door frames without self-support", () => {
  const state = createClearing();
  const anchor = site("frame", "door", 5, 5, 0);
  state.sites.push(anchor);
  for (let x = 5; x <= 11; x++) {
    const floor = site(`span:${x}`, "floor", x, 5, 1);
    assert(floorSupported(state, floor));
    state.sites.push(floor);
  }
  assert(!floorSupported(state, { x: 12, z: 5, level: 1 }));
  assert(roofSupported(state, { x: 10, z: 6, level: 1 }));
  assert(!roofSupported(state, { x: 11, z: 6, level: 1 }));
  assert.equal(structureSupportProblem(state), null);
  state.sites = state.sites.filter((entry) => entry.id !== anchor.id);
  assert.notEqual(structureSupportProblem(state), null);
  assert(!floorSupported(state, { x: 6, z: 5, level: 1 }));
  state.sites.push(site("bed-is-not-an-anchor", "bed", 5, 5, 0));
  assert(!floorSupported(state, { x: 5, z: 5, level: 1 }));
});

test("stair delivery and construction share its real lower endpoint and corner work positions", () => {
  const state = createClearing();
  const stair = site("stair", "stair", 8, 2, 0);
  assert(
    workPositions(state, stair).some(
      (at) =>
        at.x === placementFooting(stair).x &&
        at.y === placementFooting(stair).y &&
        at.z === placementFooting(stair).z,
    ),
  );
  const floor = site("corner", "floor", 5, 5, 1);
  assert(
    workPositions(state, floor).some((at) => {
      const corner = placementFooting({ x: 4, z: 4, level: 0 });
      return at.x === corner.x && at.y === corner.y && at.z === corner.z;
    }),
  );
});

test("tied sight crossings check the alternate corner cell and horizontal face", () => {
  const state = createClearing(),
    from = placementFooting({ x: 5, z: 5, level: 0 });
  // Authored observers isolate one line of sight, not a saved/earned fixture.
  for (const actor of Object.values(state.actors)) Object.assign(actor, from);
  const diagonal = { x: from.x + 1, y: from.y + 3, z: from.z + 1 };
  assert(currentlyVisible(state, diagonal));
  state.sites.push(site("alternate-corner", "wall", 5, 6, 0));
  assert(!currentlyVisible(state, diagonal));
  state.sites = [site("alternate-face", "floor", 5, 5, 1)];
  assert(!currentlyVisible(state, { x: from.x + 1, y: from.y + 4, z: from.z }));
});

test("a finite room-and-platform plan has real work access at every authored completion", () => {
  const state = createClearing(),
    plan = [];
  const add = (type, x, z, level) =>
    plan.push(site(`plan:${plan.length}`, type, x, z, level));
  // This is a query/admission sequence over authored completed facts. It does
  // not grant timber, run construction ticks, or claim an earned main save.
  add("brew-station", 5, 5, 0);
  for (let x = 4; x <= 7; x++)
    for (let z = 4; z <= 7; z++)
      if (x === 4 || x === 7 || z === 4 || z === 7)
        add(x === 5 && z === 7 ? "door" : "wall", x, z, 0);
  add("stair", 8, 3, 0);
  for (let x = 5; x <= 6; x++)
    for (let z = 5; z <= 6; z++) add("floor", x, z, 1);
  add("wall", 7, 4, 1);
  add("stair", 8, 5, 1);
  for (const x of [7, 6]) for (let z = 5; z <= 7; z++) add("floor", x, z, 2);
  add("wall", 7, 4, 2);
  for (const x of [7, 6]) for (let z = 5; z <= 7; z++) add("roof", x, z, 3);
  assert.equal(
    plan.reduce((sum, next) => sum + BUILDINGS[next.type].wood, 0),
    43,
  );
  assert(43 <= 8 * 6 + 10 - 1);
  for (const next of plan) {
    assert.equal(placementProblem(state, next), "", next.id);
    const candidate = { ...state, sites: [...state.sites, next] };
    assert.equal(structureSupportProblem(candidate), null, next.id);
    const before = createNavigationSpaces(state)(),
      after = createNavigationSpaces(candidate)();
    assert(
      workPositions(state, next).some(
        (at) =>
          route(before, state.actors.rowan, at, HUMAN_NAVIGATION).kind ===
            "route" && standing(after, at, HUMAN_NAVIGATION) === "supported",
      ),
      `actual work access for ${next.id}`,
    );
    state.sites.push(next);
  }
  assert(indoors(state, 0).has("5,5,0"));
  for (const level of [1, 2])
    assert.equal(
      route(
        createNavigationSpaces(state)(),
        state.actors.rowan,
        placementFooting({ x: 6, z: 5, level }),
        HUMAN_NAVIGATION,
      ).kind,
      "route",
    );
});

test("finished support queries reuse current facts while genuine proposals stay isolated", () => {
  const state = createClearing();
  const frame = site("anchor", "door", 5, 5, 0),
    floor = site("deck", "floor", 6, 5, 1);
  state.sites.push(frame, floor);
  const current = structuralSupport(state);
  assert(current.span(floor));
  assert.equal(structuralSupport(state, { ...floor }), current);
  assert(floorSupported(state, floor));
  const changed = { ...floor, x: 12 };
  const proposed = structuralSupport(state, changed);
  assert.notEqual(proposed, current);
  assert(!proposed.span(changed));
  assert.equal(structuralSupport(state), current);
  assert.equal(structuralSupport(state, { ...floor }), current);
  assert(current.span(floor));
});
