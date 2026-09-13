import { strict as assert } from "node:assert";
import test from "node:test";
import { createLocalGameWhistle } from "./whistle-runtime.js";

const row = (availability = { status: "available" }) => ({
  commandId: "colony:test", sourceId: "hive.colony", title: "Test order", category: "Test", order: 0,
  availability, action: { inputSchema: { type: "object", properties: {} } },
});

test("local Whistle binds only locally acquired rows and submits once", async () => {
  const submitted = [];
  const local = createLocalGameWhistle({
    agent: [row()],
    bindings: [{ commandId: "colony:test", id: "test", label: "Test order", detail: "3 wood · 2×2 · click point · north", preset: { value: 1 } }],
    submit: command => { submitted.push(command); },
  });
  const menu = local.whistle.snapshot().menu;
  assert.equal(menu.length, 1);
  assert.equal(menu[0].commandId, "colony:test");
  assert.equal(menu[0].action.presentation.type, "custom");
  assert.equal(menu[0].action.presentation.data.bindings[0].detail, "3 wood · 2×2 · click point · north");
  assert.deepEqual((await local.whistle.execute("colony:test", { origin: "browser", arguments: { value: 1 } })).status, "handled");
  assert.deepEqual(submitted, [{ type: "command", name: "test", input: { value: 1 } }]);
});

test("availability changes reuse local contribution and gate execution", async () => {
  const submitted = [];
  const local = createLocalGameWhistle({
    agent: [row()], bindings: [{ commandId: "colony:test", id: "test", label: "Test" }], submit: command => submitted.push(command),
  });
  local.update([row({ status: "unavailable", reason: "Needs a target" })]);
  const outcome = await local.whistle.execute("colony:test", { origin: "browser" });
  assert.deepEqual(outcome, { status: "unavailable", reason: "Needs a target" });
  assert.deepEqual(submitted, []);
});

test("reset clears the old world contribution before the next capability baseline", async () => {
  const submitted = [];
  const local = createLocalGameWhistle({
    agent: [row()], bindings: [{ commandId: "colony:test", id: "test", label: "Test" }], submit: command => submitted.push(command),
  });
  local.update([]);
  assert.deepEqual(local.whistle.snapshot().menu, []);
  assert.equal((await local.whistle.execute("colony:test", { origin: "browser" })).status, "missing");
  local.update([row()]);
  assert.equal(local.whistle.snapshot().menu.length, 1);
  await local.whistle.execute("colony:test", { origin: "browser" });
  assert.deepEqual(submitted, [{ type: "command", name: "test" }]);
});
