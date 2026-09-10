import test from "node:test";
import assert from "node:assert/strict";
import { createVoxelWorld } from "../height-caves.mjs";
import { compilePhysicalGeometry } from "../../engine/world/physical-geometry.ts";
import { createWater } from "../../engine/environment/water/index.js";
import {
  GOBLIN_ENVIRONMENT_BOUNDS,
  GOBLIN_FRAME,
  GOBLIN_MAP_SIDE,
  GOBLIN_WATER_LIMITS,
  GOBLIN_WORLD_IDENTITY,
} from "./content.ts";
import { goblinTerrainProjection } from "./terrain-projection.ts";
import {
  goblinWaterGeometry,
  initialGoblinWaterStocks,
  waterCoverageCeiling,
} from "./water-geometry.ts";

const cellId = (at) => `cell:${at.join()}`;
function original() {
  const world = createVoxelWorld(GOBLIN_WORLD_IDENTITY);
  const terrain = goblinTerrainProjection(world.save());
  const physical = compilePhysicalGeometry(
    terrain.terrain,
    GOBLIN_ENVIRONMENT_BOUNDS,
    [],
  );
  const definition = goblinWaterGeometry(
    terrain,
    physical,
    0,
    terrain.surfaceCeilingY,
  );
  const owner = createWater(definition, GOBLIN_WATER_LIMITS);
  const state = owner.initial(initialGoblinWaterStocks(terrain, definition));
  return { world, terrain, physical, definition, owner, state };
}

test("the real generated clearing and collar own every original porous cell once", () => {
  const { terrain, definition, owner, state } = original();
  const facts = owner.read(state),
    owned = new Map(facts.cells.map((cell) => [cell.id, cell]));
  assert.ok(terrain.originalSoil.length > 32);
  for (const at of terrain.originalSoil) {
    assert.equal(owned.get(cellId(at))?.kind, "soil");
    assert.ok(owned.get(cellId(at)).massKg > 0);
  }
  for (const x of [GOBLIN_FRAME.x, GOBLIN_FRAME.x + GOBLIN_MAP_SIDE - 1])
    assert.ok(
      facts.cells.some((cell) => cell.kind === "soil" && cell.at[0] === x),
    );
  assert.equal(
    definition.cells.filter((cell) => cell.kind === "soil").length,
    terrain.originalSoil.length,
  );
  assert.ok(
    facts.cells.some(
      (cell) => cell.kind === "void" && cell.at[1] < GOBLIN_FRAME.y - 8,
    ),
  );
  assert.ok(
    facts.cells
      .filter((cell) => cell.kind === "void")
      .every((cell) => cell.massKg === 0),
  );
  const next = owner.advance(state, 0.05).state;
  assert.ok(Math.abs(owner.read(next).totalKg - facts.totalKg) < 1e-8);
  assert.deepEqual(owner.decode(owner.encode(next)), next);
});

test("a real generated wet voxel opens in place with its pore export and fixed baseline", () => {
  const { world, terrain, owner, state } = original();
  const target = owner
    .read(state)
    .cells.find(
      (cell) =>
        cell.kind === "soil" &&
        cell.mobileKg > 0 &&
        cell.at[0] === GOBLIN_FRAME.x + 7 &&
        cell.at[2] === GOBLIN_FRAME.z + 9,
    );
  assert.ok(target);
  const [x, y, z] = target.at;
  const edit = world.edit({
    expectedRevision: 0,
    cells: [{ x, y, z, expectedMaterial: 1, material: 0 }],
  });
  assert.equal(edit.ok, true);
  const nextTerrain = goblinTerrainProjection(world.save());
  const physical = compilePhysicalGeometry(
    nextTerrain.terrain,
    GOBLIN_ENVIRONMENT_BOUNDS,
    [],
  );
  const definition = goblinWaterGeometry(
    nextTerrain,
    physical,
    1,
    terrain.surfaceCeilingY,
  );
  const rebound = owner.rebind(state, definition);
  assert.equal(rebound.status, "applied");
  assert.deepEqual(rebound.receipt.removedPoreWater, [
    {
      id: target.id,
      at: target.at,
      soilId: "goblin-loam-v1",
      massKg: target.massKg,
    },
  ]);
  const nextOwner = createWater(definition, GOBLIN_WATER_LIMITS);
  const facts = nextOwner.read(rebound.state);
  assert.equal(facts.cells.find((cell) => cell.id === target.id).massKg, 0);
  assert.equal(facts.initialTotalKg, state.initialTotalKg);
  assert.equal(facts.boundaryKg, -target.massKg);
  assert.ok(
    Math.abs(facts.totalKg + target.massKg - state.initialTotalKg) < 1e-8,
  );
  assert.throws(
    () => initialGoblinWaterStocks(nextTerrain, definition),
    /only defined/,
  );
});

test("actual upper physical floor faces separate water cells without truncating deeper caves", () => {
  const { terrain } = original(),
    x = GOBLIN_FRAME.x + 7,
    z = GOBLIN_FRAME.z + 9,
    upper = GOBLIN_FRAME.y + 8;
  const physical = compilePhysicalGeometry(
    terrain.terrain,
    GOBLIN_ENVIRONMENT_BOUNDS,
    [
      {
        kind: "face",
        axis: "y",
        at: upper,
        min: [x, z],
        max: [x + 1, z + 1],
      },
    ],
  );
  const ceiling = waterCoverageCeiling(terrain, terrain.surfaceCeilingY, upper);
  const definition = goblinWaterGeometry(terrain, physical, 1, ceiling);
  assert.ok(
    definition.cells.some((cell) => cellId(cell.at) === cellId([x, upper, z])),
  );
  assert.ok(
    definition.cells.some(
      (cell) => cellId(cell.at) === cellId([x, upper + 1, z]),
    ),
  );
  assert.ok(
    !definition.faces.some(
      (face) =>
        cellId(face.a) === cellId([x, upper - 1, z]) &&
        cellId(face.b) === cellId([x, upper, z]),
    ),
  );
  assert.equal(waterCoverageCeiling(terrain, ceiling, GOBLIN_FRAME.y), ceiling);
  assert.ok(
    definition.cells.some(
      (cell) => cell.kind === "void" && cell.at[1] < GOBLIN_FRAME.y - 8,
    ),
  );
});
