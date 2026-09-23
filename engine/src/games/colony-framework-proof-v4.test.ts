import assert from "node:assert/strict";
import test from "node:test";
import { createColonyFrameworkProofV4Pack } from "./colony-framework-proof-v4";
import { colonyFrameworkProofV3WaterCells } from "./colony-framework-proof-v3";
import {
  colonyFrameworkProofV4GameId,
  colonyFrameworkProofV4Schedule as schedule,
} from "./colony-performance-config";

test("v4 authors a distributed finite ten-minute workload without changing v3", () => {
  const pack = createColonyFrameworkProofV4Pack();
  const definition = JSON.parse(new TextDecoder().decode(pack.definition));
  const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition!));
  const workers = definition.initial.filter((row: any) => row.components["colony.worker"]);
  const trees = definition.initial.filter((row: any) => row.components["colony.tree"]);
  const workersByQuadrant = new Map<string, number>();
  for (const row of workers) {
    const { x, z } = row.components["hive.position"];
    const quadrant = `${Math.sign(x)},${Math.sign(z)}`;
    workersByQuadrant.set(quadrant, (workersByQuadrant.get(quadrant) ?? 0) + 1);
  }
  const treesByDistantBand = new Map<string, number>();
  for (const row of trees) {
    const { x, z } = row.components["hive.position"];
    const band = z < -60 ? "north" : z > 60 ? "south" : x < -60 ? "west" : "east";
    treesByDistantBand.set(band, (treesByDistantBand.get(band) ?? 0) + 1);
  }
  const initiallyDesignated = trees.filter((row: any) => row.components["colony.tree-policy"].designated);

  assert.equal(pack.id, colonyFrameworkProofV4GameId);
  assert.equal(definition.game, colonyFrameworkProofV4GameId);
  assert.equal(workers.length, 100);
  assert.deepEqual([...workersByQuadrant.values()].sort(), [25, 25, 25, 25]);
  assert.equal(trees.length, schedule.treesPerCohort * schedule.cohortCount);
  assert.deepEqual([...treesByDistantBand.values()].sort(), [96, 96, 96, 96]);
  assert.equal(initiallyDesignated.length, schedule.treesPerCohort * 2);
  assert.equal(pack.initialActions?.length, schedule.treesPerCohort * 2);
  assert.equal(
    trees.reduce((sum: number, row: any) => sum + row.components["hive.finite-resource"].quantity, 0),
    schedule.treesPerCohort * schedule.cohortCount * 6,
  );
  assert.deepEqual(schedule.cohortReleaseSteps, [1, 1, 1201, 2401, 3601, 4801]);
  assert.equal(schedule.steps * schedule.stepSeconds, 600);
  assert.equal(environment.world.bounds.maxX - environment.world.bounds.minX, 256);
  assert.equal(environment.world.bounds.maxZ - environment.world.bounds.minZ, 256);
  assert.deepEqual(environment.water.cells.slice(-2), colonyFrameworkProofV3WaterCells);
  assert.equal(definition.initial.filter((row: any) => row.components["hive.emitter"]).length, 4);
  assert.equal(environment.atmosphere.min.x, -128);
  assert.equal(environment.atmosphere.max.x, 128);
  assert.ok(environment.initialPlacements.length >= workers.length + trees.length);
});
