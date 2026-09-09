import test from "node:test";
import assert from "node:assert/strict";
import { createClearing } from "./clearing.ts";
import { admitCommand } from "./orders.ts";
import { BUILDINGS, footprint } from "./construction.js";
import { stairLanding } from "./world.js";
import { excavateTerrain, terrainGeometry, TERRAIN_FRAME } from "./terrain.ts";
import { structureEnvironment as queryEnvironment } from "./structure-environment.ts";
const worldAt = ([x, y, z]) => [
  x + TERRAIN_FRAME.x,
  y + TERRAIN_FRAME.y,
  z + TERRAIN_FRAME.z,
];
const region = (min = [4, -2, 4], max = [9, 9, 9]) => ({
  min: worldAt(min),
  max: worldAt(max),
});
const structureEnvironment = (state, bounds) =>
  queryEnvironment(
    { terrain: terrainGeometry(state.terrain), sites: state.sites },
    bounds,
  );
const site = (id, type, x, z, level = 0, direction = 0) => ({
  id,
  type,
  x,
  z,
  level,
  direction,
  work: 0,
  finishedAt: 0,
});
const cell = (x, y, z) => `cell:${worldAt([x, y, z]).join()}`;
const face = (x, y, z) => `y:${worldAt([x, y, z]).join()}`;

test("structure environment: admitted unfinished wall never seals; completed fact seals four voxels", () => {
  const state = createClearing();
  assert.equal(
    admitCommand(state, {
      kind: "build",
      type: "wall",
      x: 5,
      z: 5,
      level: 0,
      direction: 0,
      party: "home",
      actors: null,
    }).status,
    "applied",
  );
  const before = structureEnvironment(state, region());
  for (let y = 0; y < 4; y++)
    assert(!before.solidCellIds.includes(cell(5, y, 5)));
  state.sites[0].finishedAt = state.tick;
  const after = structureEnvironment(state, region());
  for (let y = 0; y < 4; y++)
    assert(after.solidCellIds.includes(cell(5, y, 5)));
  assert(!after.solidCellIds.includes(cell(5, 4, 5)));
  assert.deepEqual(after.spacingM, [1, 0.54, 1]);
  assert.equal(after.exterior, "unspecified");
});

test("structure environment: zero-volume floor and roof use one storey datum; doorway is an opening", () => {
  const state = createClearing();
  state.sites = [
    site("wall", "wall", 5, 5),
    site("door", "door", 6, 5),
    site("floor", "floor", 7, 5, 1),
    site("roof", "roof", 8, 5),
  ];
  const geometry = structureEnvironment(state, region());
  for (let y = 0; y < 4; y++) {
    assert(geometry.solidCellIds.includes(cell(5, y, 5)));
    assert(!geometry.solidCellIds.includes(cell(6, y, 5)));
  }
  assert(geometry.closedFaceIds.includes(face(7, 4, 5)));
  assert(geometry.closedFaceIds.includes(face(8, 4, 5)));
  assert(!geometry.solidCellIds.includes(cell(7, 3, 5)));
  assert(!geometry.solidCellIds.includes(cell(7, 4, 5)));
});

test("structure environment: actual stair footprint and landing stay open without a fictional floor", () => {
  for (const direction of [0, 1]) {
    const state = createClearing();
    assert.equal(
      admitCommand(state, {
        kind: "build",
        type: "stair",
        x: 5,
        z: 5,
        level: 0,
        direction,
        party: "home",
        actors: null,
      }).status,
      "applied",
    );
    const stair = state.sites[0];
    stair.finishedAt = 0;
    const landing = stairLanding(stair);
    const floor = admitCommand(state, {
      kind: "build",
      ...landing,
      type: "floor",
      direction: 0,
      party: "home",
      actors: null,
    });
    assert.equal(floor.status, "rejected");
    assert.match(floor.reason, /upper floor needs lower support/i);
    assert.deepEqual(state.sites, [stair]);
    const geometry = structureEnvironment(state, region());
    for (const at of footprint(stair)) {
      assert(!geometry.closedFaceIds.includes(face(at.x, 4, at.z)));
      for (let y = 0; y < 8; y++)
        assert(!geometry.solidCellIds.includes(cell(at.x, y, at.z)));
    }
    assert(!geometry.closedFaceIds.includes(face(landing.x, 4, landing.z)));
  }
});

test("structure environment: signed storey levels are geometry data, not a schema migration", () => {
  const state = createClearing();
  for (const level of [-2, -1, 0, 1, 2]) {
    state.sites = [
      site("floor", "floor", 5, 5, level),
      site("roof", "roof", 6, 5, level),
    ];
    const geometry = structureEnvironment(
      state,
      region([5, level * 4, 5], [7, (level + 1) * 4, 6]),
    );
    assert(geometry.closedFaceIds.includes(face(5, level * 4, 5)));
    assert(geometry.closedFaceIds.includes(face(6, (level + 1) * 4, 5)));
  }
});

test("structure environment: generated point solidity reflects exact excavation", () => {
  const state = createClearing(),
    bounds = region([7, -2, 9], [8, 1, 10]);
  assert.deepEqual(structureEnvironment(state, bounds).solidCellIds, [
    cell(7, -2, 9),
    cell(7, -1, 9),
  ]);
  state.terrain = excavateTerrain(state.terrain, [0, 14, 128]);
  const geometry = structureEnvironment(state, bounds);
  assert.deepEqual(geometry.solidCellIds, [cell(7, -2, 9)]);
  assert.equal(geometry.provenance.terrainRevision, 1);
});

test("structure environment: supported definitions use the existing directional footprint", (t) => {
  const original = BUILDINGS.bed.environment;
  t.after(() => {
    BUILDINGS.bed.environment = original;
  });
  BUILDINGS.bed.environment = { kind: "solid-column", heightVoxels: 4 };
  const state = createClearing();
  for (const direction of [0, 1]) {
    const bed = site("bed", "bed", 5, 5, 0, direction);
    state.sites = [bed];
    const geometry = structureEnvironment(state, region());
    for (const at of footprint(bed))
      for (let y = 0; y < 4; y++)
        assert(geometry.solidCellIds.includes(cell(at.x, y, at.z)));
    assert.equal(
      geometry.solidCellIds.filter(
        (id) => Number(id.split(",")[1]) >= TERRAIN_FRAME.y,
      ).length,
      8,
    );
  }
});

test("structure environment: malformed definitions, unknown structures and out-of-domain regions reject", (t) => {
  const state = createClearing();
  for (const bounds of [
    region([0, 0, 0], [15, 5, 15]),
    region([-1, 0, 0], [1, 1, 1]),
    region([14, 0, 0], [16, 1, 1]),
    region([0, 0, 0], [0, 1, 1]),
    region([0, 0.5, 0], [1, 1, 1]),
  ])
    assert.throws(() => structureEnvironment(state, bounds));
  state.sites = [site("unknown", "unknown-building", 5, 5)];
  assert.throws(
    () => structureEnvironment(state, region()),
    /unknown structure/,
  );
  state.sites = [];
  const original = BUILDINGS.wall.environment;
  t.after(() => {
    BUILDINGS.wall.environment = original;
  });
  BUILDINGS.wall.environment = { kind: "solid-column", heightVoxels: 3 };
  assert.throws(() => structureEnvironment(state, region()));
});

test("structure environment: plain immutable descriptor cannot mutate canonical input or retained facts", () => {
  const state = createClearing();
  state.sites = [site("wall", "wall", 5, 5)];
  const geometry = structureEnvironment(state, region());
  const retained = JSON.stringify(geometry);
  assert.deepEqual(JSON.parse(retained), geometry);
  assert.throws(() => geometry.solidCellIds.push("cell:9,9,9"));
  assert.throws(() => {
    geometry.bounds.min[0] = 0;
  });
  assert.throws(() => {
    geometry.provenance.completedSites[0].x = 0;
  });
  assert.throws(() => {
    geometry.provenance.buildingShapes.wall.heightVoxels = 5;
  });
  state.sites[0].finishedAt = null;
  assert.equal(JSON.stringify(geometry), retained);
  assert(
    !structureEnvironment(state, region()).solidCellIds.includes(cell(5, 0, 5)),
  );
});
