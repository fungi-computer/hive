import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionChoice } from "./connection-choice.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function cryptoSource() {
  let next = 1;
  return {
    getRandomValues(bytes) {
      bytes.fill(next++);
      return bytes;
    },
  };
}

function runtimeFactory(calls) {
  return (options) => {
    const sent = [];
    const listeners = new Set();
    const runtime = {
      sent,
      send: (command) => sent.push(command),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose: () => {},
    };
    calls.push({ options, runtime });
    return runtime;
  };
}

test("public connection uses a persisted bearer token and starts only after the caller", async () => {
  const calls = [];
  const fetchCalls = [];
  const choice = createConnectionChoice({
    mode: "pirates",
    publicHost: "https://demo.example.test/arena/",
    storage: storage(),
    cryptoSource: cryptoSource(),
    fetchImpl: async (input, init) => {
      fetchCalls.push({ input, init });
      return new Response("{}");
    },
    connectLocal: () => {
      throw new Error("local factory should not run");
    },
    connectRemote: runtimeFactory(calls),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.endpoint.toString(), "https://demo.example.test/arena/v1/pirates");
  assert.deepEqual(calls[0].runtime.sent, []);
  choice.runtime.send({ type: "start", game: "pirates" });
  assert.deepEqual(calls[0].runtime.sent, [{ type: "start", game: "pirates" }]);
  const response = await calls[0].options.fetch("https://demo.example.test/arena/v1/pirates/observe");
  assert.equal(response.ok, true);
  assert.match(fetchCalls[0].init.headers.get("Authorization"), /^Bearer [0-9a-f]{64}$/);
  choice.persistence.newWorld((needsStart) => {
    assert.equal(needsStart, true);
  });
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].options.fetch, calls[1].options.fetch);
  choice.runtime.dispose();
});

test("local mode is explicit and keeps save ownership in its capability", () => {
  const sent = [];
  const choice = createConnectionChoice({
    mode: "colony",
    runtime: "local",
    storage: storage(),
    cryptoSource: cryptoSource(),
    connectLocal: () => ({
      send: (command) => sent.push(command),
      subscribe: () => () => {},
      dispose: () => {},
    }),
    connectRemote: () => {
      throw new Error("remote factory should not run");
    },
  });
  choice.persistence.save();
  assert.deepEqual(sent, [{ type: "save" }]);
});

test("public endpoints reject insecure non-local hosts and credentials", () => {
  const base = {
    mode: "survival",
    storage: storage(),
    cryptoSource: cryptoSource(),
    connectLocal: () => ({}),
    connectRemote: runtimeFactory([]),
  };
  assert.throws(() => createConnectionChoice({ ...base, publicHost: "http://world.example" }), /HTTPS/);
  assert.throws(() => createConnectionChoice({ ...base, publicHost: "https://user:pass@world.example" }), /credentials/);
});

test("failed new-world construction retains the current remote connection", () => {
  const calls = [];
  let fail = false;
  const choice = createConnectionChoice({
    mode: "formations",
    publicHost: "https://demo.example.test",
    storage: storage(),
    cryptoSource: cryptoSource(),
    connectLocal: () => ({}),
    connectRemote: (options) => {
      if (fail) throw new Error("constructor failed");
      return runtimeFactory(calls)(options);
    },
  });
  fail = true;
  assert.throws(() => choice.persistence.newWorld(), /constructor failed/);
  assert.equal(calls.length, 1);
  choice.runtime.send({ type: "start", game: "formations" });
  assert.deepEqual(calls[0].runtime.sent, [{ type: "start", game: "formations" }]);
  choice.runtime.dispose();
});
