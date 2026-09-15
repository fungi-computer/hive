import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLocalGameWhistle, localBindings } from "./whistle-runtime.js";

test("performance page exposes all fixed size share URLs and worker choices", () => {
  const source = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  for (const size of [64, 128, 256, 512]) assert.match(source, new RegExp(`size=\\$\\{value\\}`));
  for (const count of [4, 8, 16, 32, 50, 100, 200]) assert.match(source, new RegExp(`\\[4, 8, 16, 32, 50, 100, 200\\]`));
  assert.match(source, /performance-worker-entry/);
  assert.match(source, /name: `colony-performance:\$\{size\}:\$\{workers\}`/);
  assert.match(source, /root\.className = "hive-shell"/);
  assert.match(source, /hud\.replaceWith\(rail\)/);
});

test("performance namespace binds a local Whistle command contract", async () => {
  const commands = {
    fell: { title: "Fell trees", category: "Colony", localPresentation: { bindings: [{ id: "fell", label: "Fell trees" }] } },
  };
  const mode = "colony-performance-512-200";
  const bindings = localBindings(mode, commands);
  const submitted = [];
  const local = createLocalGameWhistle({
    agent: [{ commandId: `${mode}:fell`, sourceId: `hive.${mode}`, title: "Fell trees", category: "Colony", order: 0, availability: { status: "available" }, action: { inputSchema: { type: "object" } } }],
    bindings,
    submit: command => submitted.push(command),
  });
  assert.deepEqual(local.whistle.snapshot().menu.map(row => row.commandId), [`${mode}:fell`]);
  assert.deepEqual((await local.whistle.execute(`${mode}:fell`, { origin: "browser" })).status, "handled");
  assert.deepEqual(submitted, [{ type: "command", name: "fell" }]);
});

test("performance page wires Colony commands to the shared client", () => {
  const page = readFileSync(new URL("./performance-page.js", import.meta.url), "utf8");
  const client = readFileSync(new URL("./client.js", import.meta.url), "utf8");
  assert.match(page, /import \{ colonyPack \} from "\.\.\/games\/colony\.ts"/);
  assert.match(page, /commandDefinitions: colonyPack\.commands/);
  assert.doesNotMatch(client, /const packs =/);
  assert.doesNotMatch(client, /packs\[mode\]/);
});
