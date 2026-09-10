import assert from "node:assert/strict";
import test from "node:test";
import { packFromPath, readCommand, tokenFromRequest } from "./protocol.ts";

const token = "a".repeat(64);

test("public routing accepts only the four known packs and two bounded routes", () => {
  assert.equal(packFromPath("/v1/survival/observe"), "survival");
  assert.equal(packFromPath("/v1/formations/command"), "formations");
  assert.equal(packFromPath("/v1/unknown/observe"), null);
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
