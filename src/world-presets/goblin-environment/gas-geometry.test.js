import assert from "node:assert/strict";
import test from "node:test";
import { compilePhysicalGeometry } from "../../engine/world/physical-geometry.ts";
import { createWater } from "../../engine/environment/water/index.js";
import { goblinAtmosphereFromGeometry } from "../goblin-atmosphere.ts";
import { createVoxelWorld } from "../height-caves.mjs";
import {
  GOBLIN_ENVIRONMENT_BOUNDS,
  GOBLIN_FRAME,
  GOBLIN_SPACING_M,
  GOBLIN_WATER_LIMITS,
  GOBLIN_WORLD_IDENTITY,
} from "./content.ts";
import { goblinGasGeometry } from "./gas-geometry.ts";
import { goblinTerrainProjection } from "./terrain-projection.ts";
import {
  goblinWaterGeometry,
  initialGoblinWaterStocks,
  waterCoverageCeiling,
} from "./water-geometry.ts";

const id = (at) => `cell:${at.join()}`;
const faceId = (axis, at) => `${axis}:${at.join()}`;

function original(primitives = []) {
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY),
    terrain = goblinTerrainProjection(world.save()),
    physical = compilePhysicalGeometry(
      terrain.terrain,
      GOBLIN_ENVIRONMENT_BOUNDS,
      primitives,
    ),
    ceilingY = waterCoverageCeiling(
      terrain,
      physical,
      GOBLIN_ENVIRONMENT_BOUNDS.min[1],
      GOBLIN_ENVIRONMENT_BOUNDS.min[1],
    ),
    waterDefinition = goblinWaterGeometry(terrain, physical, 0, ceilingY),
    water = createWater(waterDefinition, GOBLIN_WATER_LIMITS),
    waterState = water.initial(
      initialGoblinWaterStocks(terrain, waterDefinition),
    );
  return {
    terrain,
    physical,
    ceilingY,
    waterDefinition,
    water,
    waterState,
  };
}

function gasFrom(fixture, state = fixture.waterState, revision = 0) {
  return goblinGasGeometry(
    fixture.terrain,
    fixture.physical,
    fixture.waterDefinition,
    fixture.water.read(state),
    revision,
    fixture.ceilingY,
  );
}

function verticalPair(definition, physical) {
  const voids = new Set(
    definition.cells
      .filter((cell) => cell.kind === "void")
      .map((cell) => id(cell.at)),
  );
  for (const cell of definition.cells) {
    if (cell.kind !== "void") continue;
    const upper = [cell.at[0], cell.at[1] + 1, cell.at[2]],
      boundary = upper;
    if (voids.has(id(upper)) && physical.face("y", boundary) === "open")
      return { lower: cell.at, upper };
  }
  throw new Error("fixture has no vertical void pair");
}

function horizontalTriple(definition, physical) {
  const voids = new Set(
    definition.cells
      .filter((cell) => cell.kind === "void")
      .map((cell) => id(cell.at)),
  );
  for (const cell of definition.cells) {
    if (cell.kind !== "void") continue;
    for (const axis of [0, 2]) {
      const middle = [...cell.at],
        end = [...cell.at];
      middle[axis]++;
      end[axis] += 2;
      const firstBoundary = [...middle],
        secondBoundary = [...end],
        name = axis === 0 ? "x" : "z";
      if (
        voids.has(id(middle)) &&
        voids.has(id(end)) &&
        physical.face(name, firstBoundary) === "open" &&
        physical.face(name, secondBoundary) === "open"
      )
        return { axis, name, cells: [cell.at, middle, end] };
    }
  }
  throw new Error("fixture has no horizontal void triple");
}

test("actual generated deep voids stay finite while only the open coverage top reaches ambient", () => {
  const fixture = original(),
    snapshot = gasFrom(fixture),
    gasIds = new Set(snapshot.cells.map((cell) => cell.id));
  assert(
    snapshot.cells.some(
      (cell) => cell.y < (GOBLIN_FRAME.y - 8) * GOBLIN_SPACING_M[1],
    ),
  );
  const ambient = snapshot.openFaces.filter((face) => face.b === null);
  assert(ambient.length > 0);
  for (const face of ambient) {
    const cell = fixture.waterDefinition.cells.find(
      (entry) => id(entry.at) === face.a,
    );
    assert(cell);
    assert.equal(cell.at[1], fixture.ceilingY - 1);
    assert.equal(
      fixture.physical.exterior(cell.at, "y", 1, fixture.ceilingY),
      "outdoor",
    );
  }
  const deep = fixture.waterDefinition.cells.find(
    (cell) =>
      cell.kind === "void" &&
      cell.at[1] < GOBLIN_FRAME.y - 8 &&
      gasIds.has(id(cell.at)),
  );
  assert(deep);
  assert(!ambient.some((face) => face.a === id(deep.at)));
  const compiled = goblinAtmosphereFromGeometry(snapshot, {
    regionId: "goblin-clearing",
  });
  assert(compiled.volumeAt(id(deep.at)));
});

test("coverage cannot declare ambient below a higher registered roof", () => {
  const terrain = goblinTerrainProjection(
      createVoxelWorld(GOBLIN_WORLD_IDENTITY).save(),
    ),
    roofY = terrain.surfaceCeilingY + 2,
    fixture = original([
      {
        kind: "face",
        axis: "y",
        at: roofY,
        min: [
          GOBLIN_ENVIRONMENT_BOUNDS.min[0],
          GOBLIN_ENVIRONMENT_BOUNDS.min[2],
        ],
        max: [
          GOBLIN_ENVIRONMENT_BOUNDS.max[0],
          GOBLIN_ENVIRONMENT_BOUNDS.max[2],
        ],
      },
    ]),
    shortCeilingY = roofY - 1,
    shortDefinition = {
      ...fixture.waterDefinition,
      cells: fixture.waterDefinition.cells.filter(
        (cell) => cell.at[1] < shortCeilingY,
      ),
      faces: fixture.waterDefinition.faces.filter(
        (face) => face.a[1] < shortCeilingY && face.b[1] < shortCeilingY,
      ),
    },
    shortFacts = {
      cells: fixture.water
        .read(fixture.waterState)
        .cells.filter((cell) => cell.at[1] < shortCeilingY),
    };
  assert.throws(
    () =>
      goblinGasGeometry(
        fixture.terrain,
        fixture.physical,
        shortDefinition,
        shortFacts,
        0,
        shortCeilingY,
      ),
    /actual monotone environmental coverage/,
  );
});

test("an actual registered floor face separates lower and upper gas", () => {
  const open = original(),
    pair = verticalPair(open.waterDefinition, open.physical),
    floor = {
      kind: "face",
      axis: "y",
      at: pair.upper[1],
      min: [pair.upper[0], pair.upper[2]],
      max: [pair.upper[0] + 1, pair.upper[2] + 1],
    },
    fixture = original([floor]),
    snapshot = gasFrom(fixture),
    boundary = faceId("y", pair.upper);
  assert(snapshot.cells.some((cell) => cell.id === id(pair.lower)));
  assert(snapshot.cells.some((cell) => cell.id === id(pair.upper)));
  assert(!snapshot.openFaces.some((face) => face.id === boundary));
});

test("horizontal gas area follows overlapping dry height and full water removes its cell", () => {
  const fixture = original(),
    triple = horizontalTriple(fixture.waterDefinition, fixture.physical),
    facts = fixture.water.read(fixture.waterState),
    selected = triple.cells.map((at) =>
      facts.cells.find((cell) => cell.id === id(at)),
    );
  assert(selected.every(Boolean));
  const capacities = selected.map((cell) => cell.capacityKg);
  let state = fixture.waterState;
  state = fixture.water.exchange(state, {
    id: id(triple.cells[0]),
    direction: "deposit",
    massKg: capacities[0] / 2,
  }).state;
  state = fixture.water.exchange(state, {
    id: id(triple.cells[1]),
    direction: "deposit",
    massKg: capacities[1] / 4,
  }).state;
  state = fixture.water.exchange(state, {
    id: id(triple.cells[2]),
    direction: "deposit",
    massKg: capacities[2],
  }).state;
  const snapshot = gasFrom(fixture, state, 1),
    boundary = [...triple.cells[1]];
  const opening = snapshot.openFaces.find(
    (face) => face.id === faceId(triple.name, boundary),
  );
  assert(opening);
  assert.ok(Math.abs(opening.areaM2 - GOBLIN_SPACING_M[1] / 2) <= 2e-15);
  assert(!snapshot.cells.some((cell) => cell.id === id(triple.cells[2])));
});

test("a positive upper liquid layer blocks vertical gas passage", () => {
  const fixture = original(),
    pair = verticalPair(fixture.waterDefinition, fixture.physical),
    upper = fixture.water
      .read(fixture.waterState)
      .cells.find((cell) => cell.id === id(pair.upper));
  assert(upper);
  const state = fixture.water.exchange(fixture.waterState, {
    id: upper.id,
    direction: "deposit",
    massKg: upper.capacityKg / 4,
  }).state;
  const dry = gasFrom(fixture),
    wet = gasFrom(fixture, state, 1),
    boundary = faceId("y", pair.upper);
  assert(dry.openFaces.some((face) => face.id === boundary));
  assert(wet.cells.some((cell) => cell.id === upper.id));
  assert(!wet.openFaces.some((face) => face.id === boundary));
});
