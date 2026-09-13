import { test } from "node:test";
import { strict as assert } from "node:assert";
import { colonyBuildCommand } from "../games/colony-building.ts";

test("wall stroke preview and one submitted build agree on the dominant-axis line", async () => {
  const { colonyPack } = await import("../games/colony.ts");
  const { terrainAreaPresentationCommand } = await import("../presentation.ts");
  const { designationEndpoints, visibleTerrainDesignationPreview } = await import("./terrain-area-selection.js");
  const control = colonyPack.presentation?.controls.find(c => c.id === "timber-wall");
  assert.ok(control);
  const start = [0, 13, 0], end = [20, 13, 20];
  const stroke = designationEndpoints(start, end, "line");
  assert.equal(stroke.cells.length, 21);
  const preview = visibleTerrainDesignationPreview({ surfaces: stroke.cells.map(cell => ({ cell })) }, start, end, "line");
  const command = terrainAreaPresentationCommand(control, [], stroke);
  const result = colonyBuildCommand.invoke({
    query: () => [],
    physicalContacts: cells => cells.map((_, index) => ({ solid: index % 2 === 0, sealedTop: false, outside: false })),
  }, command.input);
  assert.deepEqual(result.actions.map(action => action.kind === "plan-construction" ? [action.x, action.y - 1, action.z] : null), preview.map(surface => surface.cell));
  assert.ok(result.actions.every(action => action.kind === "plan-construction" && action.orientation === "east"));
  assert.throws(() => designationEndpoints(start, [1_000_000, 13, 1_000_000], "line"), /at most/);
  assert.throws(() => designationEndpoints(start, end, "rectangle"), /at most/);
});
