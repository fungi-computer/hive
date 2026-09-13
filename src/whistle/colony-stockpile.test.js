import assert from "node:assert/strict";
import test from "node:test";
import { createWhistle } from "@fungi.computer/whistle";
import { colonyStockpileWhistleContribution } from "./colony-stockpile.js";

test("Whistle exposes Colony stockpile schema and submits the durable command", async () => {
  const submitted = [];
  const whistle = createWhistle();
  whistle.contribute(colonyStockpileWhistleContribution(value => submitted.push(value)));
  const row = whistle.snapshot().menu.find(item => item.commandId === "colony:designate-stockpile");
  assert.ok(row);
  assert.deepEqual(row.action.presentation, { type: "custom", data: { gesture: "terrain-rectangle", argument: "area" } });
  assert.equal(row.action.inputSchema.type, "object");
  assert.ok(row.action.inputSchema.properties.filterProfile);
  assert.ok(row.action.inputSchema.properties.priority);
  const outcome = await whistle.execute("colony:designate-stockpile", { origin: "browser", arguments: {
    area: { start: [2, 13, 2], end: [3, 13, 2] }, filterProfile: "food", priority: 3,
  } });
  assert.equal(outcome.status, "handled");
  assert.deepEqual(submitted, [{ type: "command", name: "designateStockpile", input: {
    area: { start: [2, 13, 2], end: [3, 13, 2] }, filterProfile: "food", priority: 3,
  } }]);
  assert.equal(whistle.snapshot().agent[0].action.presentation, undefined);
});

