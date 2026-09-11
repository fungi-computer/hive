import test from "node:test";
import assert from "node:assert/strict";
import { colonyEnvironment, colonyEnvironmentDefinition } from "./colony-environment";
import { colonyPack } from "./colony";

test("Colony pack enables native terrain placement and traversal", () => {
  assert.ok(colonyPack.environmentDefinition instanceof Uint8Array);
  assert.deepEqual(colonyPack.environmentDefinition, colonyEnvironmentDefinition);
  assert.deepEqual(colonyPack.initialPlacements.map(({ entity, column }) => [entity, [...column]]), [
    ["colony.worker.1", [0, 0]],
    ["colony.worker.2", [0, 2]],
    ["colony.guest.1", [3, 1]],
    ["colony.pantry", [-2, 0]],
  ]);
  const definition = JSON.parse(new TextDecoder().decode(colonyPack.definition));
  const worker = definition.initial.find(({ id }: { id: string }) => id === "colony.worker.1");
  assert.equal(worker.components["hive.container"].capacity, 3);
  assert.deepEqual(worker.components["hive.traversal"], { clearanceCells: 1, maxStepCells: 1 });
});

test("Colony excavation output remains finite and carryable", () => {
  const soil = colonyEnvironment.materials.find(({ slot }) => slot === colonyEnvironment.world.slots.soil);
  assert.deepEqual(soil?.excavation, { workSeconds: 2, outputKind: "soil-spoil", unitsPerCell: 3 });
  assert.equal(colonyEnvironment.materials.find(({ slot }) => slot === colonyEnvironment.world.slots.stone)?.excavation?.unitsPerCell, 3);
});
