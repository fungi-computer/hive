import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { sqliteTestOwner } from "../../src/engine/region/sqlite-test-owner.mjs";
import { QuarryRegion } from "./worker.ts";

// Exercise the real HTTP consumer and SQLite Region, with only DO storage adapted.
// Recovery recreates the consumer over committed rows, never the prior resident.
test("HTTP command identity keeps its observed epoch through lost acknowledgement and restart", async (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const owner = sqliteTestOwner(db);
  const state = { storage: { ...owner, sync: async () => {} } } as unknown as DurableObjectState;
  const env = { REGIONS: {} as DurableObjectNamespace, WRITER_SECRET: "writer", SPECTATOR_SECRET: "spectator", DEBUG_SECRET: "debug" };
  let host = new QuarryRegion(state, env);
  const get = (path: string, secret?: string) => host.fetch(new Request(`https://proof.test${path}`, {
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  }));
  const send = (input: unknown, fault?: string) => host.fetch(new Request("https://proof.test/command", {
    method: "POST",
    headers: { Authorization: "Bearer writer", "Content-Type": "application/json", ...(fault ? { "X-Harness-Fault": fault, "X-Harness-Debug": "debug" } : {}) },
    body: JSON.stringify(input),
  }));
  assert.equal((await get("/replay-window")).status, 403);
  const window = await (await get("/replay-window", "writer")).json() as { epoch: number };
  const initial = await (await get("/debug", "debug")).json();
  const input = { id: "dig", replayEpoch: window.epoch, expectedRevision: 0, command: { kind: "excavate", at: { x: 0, y: -1, z: 0 } } };
  const { replayEpoch: omitted, ...missing } = input;
  assert.equal((await send(missing)).status, 400, "the host must not stamp omitted epochs");
  assert.equal((await send({ ...input, replayEpoch: window.epoch + 1 })).status, 409, "the host must not replace caller epochs");
  assert.deepEqual(await (await get("/debug", "debug")).json(), initial);
  assert.equal((await send(input, "before-commit")).status, 503);
  assert.deepEqual(await (await get("/debug", "debug")).json(), initial);
  assert.equal((await send(input, "after-commit")).status, 503);
  const committed = await (await get("/debug", "debug")).json();
  host = new QuarryRegion(state, env);
  const receipt = await (await send(input)).json() as { replayEpoch: number; status: string };
  assert.equal(receipt.status, "applied");
  assert.equal(receipt.replayEpoch, omitted);
  assert.deepEqual(await (await send(input)).json(), receipt);
  assert.deepEqual(await (await get("/debug", "debug")).json(), committed);
  assert.equal((await send({ ...input, command: { kind: "excavate", at: { x: 1, y: -1, z: 0 } } })).status, 409);
});
