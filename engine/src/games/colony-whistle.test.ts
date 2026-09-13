import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createWhistle } from "@fungi.computer/whistle";
import { colonyDigWhistleContribution, colonyDigWhistleDescriptor } from "./colony-whistle";

const digInput = { area: { start: [0, 13, 0], end: [1, 13, 1] } };

test("Colony Dig publishes one neutral schema while retaining its local rectangle binding", () => {
  const descriptor = colonyDigWhistleDescriptor();
  assert.equal(descriptor.commandId, "colony:dig");
  assert.equal(descriptor.availability.status, "available");
  assert.equal(descriptor.action?.inputSchema?.type, "object");
  assert.equal("presentation" in (descriptor.action ?? {}), false);

  const runtime = createWhistle();
  runtime.contribute(colonyDigWhistleContribution(async () => ({ status: "applied", result: { results: [] } })));
  const local = runtime.snapshot().menu.find((row) => row.commandId === "colony:dig");
  assert.deepEqual(local?.action?.presentation, {
    type: "custom",
    data: { gesture: "terrain-rectangle", argument: "area" },
  });
});

test("Whistle keeps unavailable Dig discoverable and refuses it before submission", async () => {
  let submissions = 0;
  const runtime = createWhistle();
  runtime.contribute(colonyDigWhistleContribution(
    async () => {
      submissions++;
      return { status: "applied", result: { results: [] } };
    },
    () => ({ status: "unavailable", reason: "World is paused" }),
  ));
  const descriptor = runtime.snapshot().agent.find((row) => row.commandId === "colony:dig");
  assert.deepEqual(descriptor?.availability, { status: "unavailable", reason: "World is paused" });
  assert.deepEqual(await runtime.execute("colony:dig", { origin: "agent", arguments: digInput }), {
    status: "unavailable",
    reason: "World is paused",
  });
  assert.equal(submissions, 0);
});

test("Whistle distinguishes a Hive domain rejection from transport failure", async () => {
  const rejected = createWhistle();
  rejected.contribute(colonyDigWhistleContribution(async () => ({
    status: "rejected",
    reason: "Area is outside the authored world",
    result: { reason: "Area is outside the authored world" },
  })));
  assert.deepEqual(await rejected.execute("colony:dig", { origin: "browser", arguments: digInput }), {
    status: "failed",
    error: { code: "command_rejected", message: "Area is outside the authored world" },
  });

  const disconnected = createWhistle();
  disconnected.contribute(colonyDigWhistleContribution(async () => {
    throw new Error("connection closed");
  }));
  assert.deepEqual(await disconnected.execute("colony:dig", { origin: "browser", arguments: digInput }), {
    status: "failed",
    error: { code: "transport_failure", message: "connection closed" },
  });
});
