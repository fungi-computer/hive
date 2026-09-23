import assert from "node:assert/strict";
import test from "node:test";
import { createColonyFrameworkProofV3Pack, colonyFrameworkProofV3Relocations, colonyFrameworkProofV3WaterCells } from "./colony-framework-proof-v3";
import { colonyFrameworkProofV3GameId } from "./colony-performance-config";

test("v3 keeps a pinned finite 100-worker workload and its explicit water amendments", () => {
  const pack = createColonyFrameworkProofV3Pack();
  const definition = JSON.parse(new TextDecoder().decode(pack.definition));
  const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition!));
  const workers = definition.initial.filter((row: any) => row.components["colony.worker"]);
  const trees = definition.initial.filter((row: any) => row.components["colony.tree"]);

  assert.equal(pack.id, colonyFrameworkProofV3GameId);
  assert.equal(definition.game, colonyFrameworkProofV3GameId);
  assert.equal(workers.length, 100);
  assert.equal(trees.length, 384);
  assert.equal(trees.reduce((sum: number, row: any) => sum + row.components["hive.finite-resource"].quantity, 0), 2304);
  assert.equal(environment.world.seaLevel, 15);
  assert.deepEqual(environment.water.cells.slice(-2), colonyFrameworkProofV3WaterCells);
  assert.equal(colonyFrameworkProofV3Relocations.length, 11);
  assert.deepEqual(
    colonyFrameworkProofV3Relocations.map((row) => row.entity),
    [...new Set(colonyFrameworkProofV3Relocations.map((row) => row.entity))],
    "relocations name unique workers",
  );
  assert.ok(environment.initialPlacements.length >= workers.length);
});
