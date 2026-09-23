import assert from "node:assert/strict";
import test from "node:test";
import { colonyWorldPath, colonyWorldRoute, packFromPath, readColonyJoin, readColonySocketMessage, readCommand, readPlacementDecision, readSocketMessage, socketHandleFromPath, tokenFromRequest } from "./protocol.ts";

const token = "a".repeat(64);

test("public routing preserves private packs and rejects shared Colony v1", () => {
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
  assert.deepEqual(colonyWorldRoute(`/v2/colony/worlds/${world}/placement`), { world, operation: "placement" });
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${world}/terrain`), null);
  assert.deepEqual(colonyWorldRoute(`/v2/colony/worlds/${world}/socket/client.1`), { world, operation: "socket", socketHandle: "client.1" });
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${"B".repeat(64)}/join`), null);
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${world}/socket`), null);
  assert.equal(colonyWorldRoute(`/v2/colony/worlds/${world}/join/extra`), null);
  assert.equal(colonyWorldPath(world, "command"), `/v2/colony/worlds/${world}/command`);
  assert.equal(colonyWorldPath(world, "socket", "client.1"), `/v2/colony/worlds/${world}/socket/client.1`);
  assert.throws(() => colonyWorldPath(world, "socket"), /invalid/);
  assert.throws(() => colonyWorldPath("bad", "observe"), /invalid/);
});

test("placement decision bodies are strict bounded batches", async () => {
  const body = { party: "party:1", candidates: [{ site: "site:1", catalog: "floor", target: { kind: "cell", cell: { x: 0, y: 0, z: 0 }, orientation: "north" } }] };
  assert.deepEqual(await readPlacementDecision(new Request("https://demo.invalid", { method: "POST", body: JSON.stringify(body) })), body);
  await assert.rejects(readPlacementDecision(new Request("https://demo.invalid", { method: "POST", body: JSON.stringify({ ...body, expectedRevision: 1 }) })));
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
      replayEpoch: 0,
      expectedRevision: 0,
      command: { kind: "command", name: "takeFood" },
    }),
  });
  assert.equal((await readCommand(valid)).id, "command-1");
  const extra = new Request("https://demo.invalid/v1/survival/command", {
    method: "POST",
    body: JSON.stringify({
      id: "x",
      replayEpoch: 0,
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
      replayEpoch: 0,
      expectedRevision: 0,
      command: "x".repeat(9000),
    }),
  });
  await assert.rejects(readCommand(large), /public-body-too-large/);
});


test("performance routes admit only finite presets and existing authenticated operations", () => {
  const identities = new Set();
  for (const size of [64, 128, 256, 512]) for (const workers of [4, 8, 16, 32, 50, 100, 200]) {
    const pack = `colony-performance-${size}-${workers}`;
    identities.add(packFromPath(`/v1/${pack}/observe`));
    for (const operation of ["observe", "command", "connect", "socket/abc-123", "placement"])
      assert.equal(packFromPath(`/v1/${pack}/${operation}`), pack);
  }
  assert.equal(identities.size, 28, "presets retain distinct durable pack identities");
  for (const operation of ["observe", "command", "connect", "socket/abc-123", "placement"])
    assert.equal(packFromPath(`/v1/colony-framework-proof-256-100-v1/${operation}`), "colony-framework-proof-256-100-v1");
  for (const operation of ["observe", "command", "connect", "socket/abc-123", "placement"])
    assert.equal(packFromPath(`/v1/colony-framework-proof-256-100-v2/${operation}`), "colony-framework-proof-256-100-v2");
  for (const pack of ["colony-performance-63-4", "colony-performance-64-3", "colony-performance-064-4", "colony-performance-64-04", "colony-performance-512-201", "colony-performance-64-4-extra", "colony-framework-proof-256-100-v3"])
    assert.equal(packFromPath(`/v1/${pack}/observe`), null);
  for (const operation of ["step", "join", "debug", "terrain", "terrain/extra", "socket/", "socket/a/b"])
    assert.equal(packFromPath(`/v1/colony-performance-64-4/${operation}`), null);
  for (const pack of ["survival", "pirates", "formations", "colony"])
    for (const operation of ["terrain", "placement"])
      assert.equal(packFromPath(`/v1/${pack}/${operation}`), null);
  const request = (authorization: string) => new Request("https://demo.invalid/v1/colony-performance-64-4/placement", { headers: { Authorization: authorization } });
  assert.throws(() => tokenFromRequest(request("")), /public-unauthorized/);
  assert.equal(tokenFromRequest(request(`Bearer ${token}`)), token);
});
