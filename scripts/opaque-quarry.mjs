// Independent headless consumer: no Goblin presets, characters, art or UI imports.
import assert from "node:assert/strict";
import { createVoxelStore } from "../src/engine/world/index.js";

const content = {
  open: 9,
  chalk: 275,
  tungsten: 45000,
};
const queryMetrics = { columns: 0, cells: 0 };
const definition = {
  identity: { world: "standalone-quarry", seed: "vertical-bands-v1" },
  bounds: { minX: -8, maxX: 8, minY: -32, maxY: 24, minZ: -8, maxZ: 8 },
  brickSide: 4,
  materialIds: Object.values(content),
  generator: {
    id: "vertical-bands-v1",
    column: (x, z) => {
      queryMetrics.columns++;
      return (y) => {
        queryMetrics.cells++;
        return y >= 0
          ? content.open
          : y < -20 && (x + z) % 2 === 0
            ? content.tungsten
            : content.chalk;
      };
    },
  },
};
const world = createVoxelStore(definition, { maxResidentBricks: 1 });
const beforeBrick = { ...queryMetrics };
world.readBrick({ x: 0, y: 0, z: 0 });
const coldBrickQueries = {
  columns: queryMetrics.columns - beforeBrick.columns,
  cells: queryMetrics.cells - beforeBrick.cells,
};
const declaredBudget = world.describe().coldBrickBudget;
assert(coldBrickQueries.columns <= declaredBudget.columns);
assert(coldBrickQueries.cells <= declaredBudget.cells);
const target = { x: -1, y: -25, z: 1 };
assert.equal(world.readPoint(target), content.tungsten);
// Permission belongs to this consumer; the store knows only checked material IDs.
const canExcavate = (material, tool) =>
  material !== content.tungsten || tool === "diamond-pick";
const before = world.save();
assert.equal(canExcavate(world.readPoint(target), "wooden-spade"), false);
assert.deepEqual(world.save(), before);
assert(canExcavate(world.readPoint(target), "diamond-pick"));
const admitted = world.edit({
  expectedRevision: 0,
  cells: [
    { ...target, expectedMaterial: content.tungsten, material: content.open },
  ],
});
assert(admitted.ok);
world.readBrick({ x: -1, y: -7, z: 0 });
world.readBrick({ x: 1, y: 1, z: 1 });
const checkpoint = JSON.parse(JSON.stringify(world.save()));
world.evictAll();
const reopened = createVoxelStore(definition, { checkpoint });
assert.equal(reopened.readPoint(target), content.open);
assert.deepEqual(reopened.save(), checkpoint);
const inspected = reopened.inspect(target);
assert.equal(inspected.generatedMaterial, content.tungsten);
assert.equal(inspected.source, "edit");
assert.equal(
  reopened.edit({ expectedRevision: 0, cells: [] }).reason,
  "stale-revision",
);
assert.deepEqual(reopened.save(), checkpoint);
console.log(
  JSON.stringify(
    {
      status: "passed",
      coldBrickQueries,
      inspected,
      stats: reopened.stats(),
      nonClaims: [
        "Excavation is a direct consumer command, not a completed worker job.",
        "This store owns solid slots, not liquid displacement or world knowledge grants.",
      ],
    },
    null,
    2,
  ),
);
