import assert from "node:assert/strict";
import test from "node:test";
import { createWhistle } from "@fungi.computer/whistle";
import { colonyDigWhistleContribution } from "./colony-dig.js";

test("Colony Dig shares the command schema and identity across human and agent projections", async () => {
  const submitted = [];
  const whistle = createWhistle();
  whistle.contribute(colonyDigWhistleContribution(value => {
    submitted.push(value);
    return { commandId: "local-1", status: "applied", result: { accepted: true } };
  }));
  const snapshot = whistle.snapshot();
  const menu = snapshot.menu.find(item => item.commandId === "colony:dig");
  const agent = snapshot.agent.find(item => item.commandId === "colony:dig");
  assert.ok(menu);
  assert.ok(agent);
  assert.deepEqual(menu.action.inputSchema, agent.action.inputSchema);
  assert.deepEqual(menu.action.presentation, { type: "custom", data: { gesture: "terrain-rectangle", argument: "area" } });
  assert.equal(agent.action.presentation, undefined);
  assert.equal(menu.availability.status, "available");
  assert.equal(menu.action.inputSchema.properties.area.type, "object");

  const outcome = await whistle.execute("colony:dig", { origin: "browser", arguments: {
    area: { start: [2, 13, 2], end: [3, 13, 2] },
  } });
  assert.deepEqual(outcome, { status: "handled", result: { commandId: "local-1", status: "applied", result: { accepted: true } } });
  assert.deepEqual(submitted, [{ type: "command", name: "dig", input: {
    area: { start: [2, 13, 2], end: [3, 13, 2] },
  } }]);
});

test("Dig rechecks fresh availability and preserves typed admission failure", async () => {
  let available = true;
  let calls = 0;
  const whistle = createWhistle();
  whistle.contribute(colonyDigWhistleContribution(() => { throw new Error("native admission refused"); }, () => {
    calls += 1;
    return available ? { status: "available" } : { status: "unavailable", reason: "world is read-only" };
  }));
  available = false;
  const unavailable = await whistle.execute("colony:dig", { origin: "agent", arguments: { area: { start: [0, 1, 0], end: [0, 1, 0] } } });
  assert.deepEqual(unavailable, { status: "unavailable", reason: "world is read-only" });
  assert.equal(calls, 2, "discovery and dispatch both read availability");

  available = true;
  const failed = await whistle.execute("colony:dig", { origin: "browser", arguments: { area: { start: [0, 1, 0], end: [0, 1, 0] } } });
  assert.deepEqual(failed, { status: "failed", error: { code: "command_rejected", message: "native admission refused" } });
});
