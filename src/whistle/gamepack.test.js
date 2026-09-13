import assert from "node:assert/strict";
import test from "node:test";
import { createWhistle } from "@fungi.computer/whistle";
import { parse as parseAgentProjection } from "@fungi.computer/whistle/wire";
import { gamePackWhistleContribution } from "./gamepack.js";
import { z } from "zod";

test("GamePack command schema and durable handler are one Whistle contribution", async () => {
  const submitted = [];
  const whistle = createWhistle();
  const pack = { id: "colony", commands: { deconstruct: {
    title: "Deconstruct", category: "Construction", description: "Queue teardown.",
    input: z.object({ site: z.string() }).strict(),
  } }, presentation: { controls: [{ command: "deconstruct", selection: "entities", designation: ["entities"] }] } };
  whistle.contribute(gamePackWhistleContribution(pack, command => { submitted.push(command); return { accepted: true }; }));
  const row = whistle.snapshot().menu.find(item => item.commandId === "colony:deconstruct");
  assert.ok(row);
  assert.equal(row.action.inputSchema.properties.site.type, "string");
  const result = await whistle.execute("colony:deconstruct", { origin: "browser", arguments: { site: "colony.site.finished" } });
  assert.equal(result.status, "handled");
  assert.deepEqual(submitted, [{ type: "command", name: "deconstruct", input: { site: "colony.site.finished" } }]);
  assert.equal(whistle.snapshot().agent.find(item => item.commandId === "colony:deconstruct").action.presentation, undefined);
});

test("accepted Whistle wire parser accepts neutral agent capability rows", () => {
  const rows = parseAgentProjection([{ commandId: "colony:deconstruct", sourceId: "hive.colony", title: "Deconstruct", category: "Construction", description: "Queue teardown.", order: 40, availability: { status: "available" }, action: { inputSchema: { type: "object" } } }]);
  assert.equal(rows[0].action.presentation, undefined);
});
