import assert from "node:assert/strict";
import test from "node:test";
import { colonyWorldPath, colonyWorldRoute, packFromPath, readColonyJoin, readColonySocketMessage, readCommand, readSocketMessage, socketHandleFromPath, tokenFromRequest } from "./protocol.ts";

const token = "a".repeat(64);

test("public routing accepts only the four known packs and two bounded routes", () => {
  assert.equal(packFromPath("/v1/survival/observe"), "survival");
  assert.equal(packFromPath("/v1/formations/command"), "formations");
  assert.equal(packFromPath("/v1/unknown/observe"), null);
  assert.equal(packFromPath("/v1/colony/observe"), null);
  assert.equal(packFromPath("/v1/survival/debug"), null);
  assert.equal(packFromPath("/v1/survival/observe/extra"), null);
});

test("public capability requires exactly a lowercase 256-bit bearer token", () => {
  const request = (value: string) =>
    new Request("https://demo.invalid/v1/survival/observe", {
      headers: { Authorization: value },
    });
  assert.equal(tokenFromRequest(request(`Bearer ${token}`)), token);
  assert.throws(
    () => tokenFromRequest(request("Bearer " + token.toUpperCase())),
    /public-unauthorized/,
  );
  assert.throws(
    () => tokenFromRequest(request("Bearer short")),
    /public-unauthorized/,
  );
  assert.throws(() => tokenFromRequest(request("")), /public-unauthorized/);
});

test("shared Colony routes separate world routing from participant authority", () => {
  const world = "b".repeat(64);
  assert.deepEqual(colonyWorldRoute(`/v2/colony/worlds/${world}/join`), { world, operation: "join" });
  assert.deepEqual(colonyWorldRoute(`/v2/colony/worlds/${world}/observe`), { world, operation: "observe" });
  assert.deepEqual(colonyWorldRoute(`/v2/colony/worlds/${world}/socket/client.1`), { world, operation: "socket", socketHandle: "client.1" });
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${"B".repeat(64)}/join`), null);
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${world}/socket`), null);
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${world}/join/extra`), null);
  assert.equal(colonyWorldPath(world, "command"), `/v2/colony/worlds/${world}/command`);
  assert.equal(colonyWorldPath(world, "socket", "client.1"), `/v2/colony/worlds/${world}/socket/client.1`);
  assert.throws(() => colonyWorldPath(world, "socket"), /invalid/);
  assert.throws(() => colonyWorldPath("bad", "observe"), /invalid/);
});

test("Colony join body carries only the bounded invitation", async () => {
  const invite = "c".repeat(64);
  const request = new Request("https://demo.invalid", { method: "POST", body: JSON.stringify({ invite }) });
  assert.deepEqual(await readColonyJoin(request), { invite });
  await assert.rejects(readColonyJoin(new Request("https://demo.invalid", { method: "POST", body: JSON.stringify({ invite, player: "forged" }) })));
  await assert.rejects(readColonyJoin(new Request("https://demo.invalid", { method: "POST", body: JSON.stringify({ invite: "short" }) })));
});

test("socket admission accepts an opaque routing handle but authenticates separately", () => {
  assert.equal(packFromPath("/v1/survival/connect"), "survival");
  assert.equal(packFromPath("/v1/survival/socket/abc-123"), "survival");
  assert.equal(socketHandleFromPath("/v1/survival/socket/abc-123"), "abc-123");
  assert.deepEqual(readSocketMessage(JSON.stringify({ type: "authenticate", token })), { type: "authenticate", token });
  assert.throws(() => readSocketMessage(JSON.stringify({ type: "authenticate", token, extra: true })), /invalid/);
  assert.deepEqual(readColonySocketMessage(JSON.stringify({ type: "authenticate", credential: token })), { type: "authenticate", credential: token });
  assert.throws(() => readColonySocketMessage(JSON.stringify({ type: "authenticate", token })), /invalid/);
});

test("public command body is strict and bounded before Region admission", async () => {
  const valid = new Request("https://demo.invalid/v1/survival/command", {
    method: "POST",
    body: JSON.stringify({
      id: "command-1",
      expectedRevision: 0,
      command: { kind: "command", name: "takeFood" },
    }),
  });
  assert.equal((await readCommand(valid)).id, "command-1");
  const extra = new Request("https://demo.invalid/v1/survival/command", {
    method: "POST",
    body: JSON.stringify({
      id: "x",
      expectedRevision: 0,
      command: {},
      extra: true,
    }),
  });
  await assert.rejects(readCommand(extra));
  const large = new Request("https://demo.invalid/v1/survival/command", {
    method: "POST",
    body: JSON.stringify({
      id: "x",
      expectedRevision: 0,
      command: "x".repeat(9000),
    }),
  });
  await assert.rejects(readCommand(large), /public-body-too-large/);
});
