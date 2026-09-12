import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionChoice } from "./connection-choice.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
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
      recovery: { retry: () => sent.push({ type: "recovery.retry" }) },
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
  assert.equal(choice.runtime.recovery, undefined);
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
  let replaced = false;
  assert.throws(() => choice.persistence.newWorld(() => { replaced = true; }), /constructor failed/);
  assert.equal(replaced, false);
  assert.equal(calls.length, 1);
  choice.runtime.send({ type: "start", game: "formations" });
  assert.deepEqual(calls[0].runtime.sent, [{ type: "start", game: "formations" }]);
  choice.runtime.dispose();
});

test("recovery forwards to the current remote owner and refuses after disposal", () => {
  const calls = [];
  const choice = createConnectionChoice({
    mode: "survival", publicHost: "https://demo.example.test", storage: storage(), cryptoSource: cryptoSource(),
    connectLocal: () => ({}), connectRemote: runtimeFactory(calls),
  });
  choice.runtime.recovery.retry();
  assert.deepEqual(calls[0].runtime.sent, [{ type: "recovery.retry" }]);
  choice.persistence.newWorld();
  choice.runtime.recovery.retry();
  assert.deepEqual(calls[1].runtime.sent, [{ type: "recovery.retry" }]);
  choice.runtime.dispose();
  assert.throws(() => choice.runtime.recovery.retry(), /connection choice disposed/);
});

test("an invitation joins the supplied world without replacing the recipient private token", () => {
  const calls = [];
  const saved = storage();
  const privateToken = "1".repeat(64);
  const invitedToken = "a".repeat(64);
  saved.setItem("hive-private-demo/survival", privateToken);
  const choice = createConnectionChoice({
    mode: "survival", publicHost: "https://demo.example.test", storage: saved, cryptoSource: cryptoSource(),
    locationSource: { href: `https://demo.example.test/play?game=survival#world=${invitedToken}`, hash: `#world=${invitedToken}` },
    historySource: { replaceState() {} }, connectLocal: () => ({}), connectRemote: runtimeFactory(calls),
  });
  assert.equal(calls[0].options.token, invitedToken);
  assert.equal(saved.getItem("hive-private-demo/survival"), privateToken);
  assert.match(choice.persistence.invitation.url(), new RegExp(`#world=${invitedToken}$`));
  choice.runtime.dispose();
});

test("invalid invitation tokens are refused visibly and new worlds clear the invite fragment", () => {
  const base = {
    mode: "survival", publicHost: "https://demo.example.test", storage: storage(), cryptoSource: cryptoSource(),
    connectLocal: () => ({}), connectRemote: runtimeFactory([]),
  };
  assert.throws(() => createConnectionChoice({ ...base, locationSource: { href: "https://demo.example.test/#world=bad", hash: "#world=bad" } }), /invalid world token/);
  const calls = [];
  let cleared = "";
  const token = "b".repeat(64);
  const choice = createConnectionChoice({ ...base, connectRemote: runtimeFactory(calls), locationSource: { href: `https://demo.example.test/?game=survival#world=${token}`, hash: `#world=${token}` }, historySource: { replaceState(_state, _title, value) { cleared = value; } } });
  choice.persistence.newWorld();
  assert.equal(cleared, "/?game=survival");
  assert.notEqual(calls[1].options.token, token);
  choice.runtime.dispose();
});

test("failed invited new-world replacement restores the recipient private token and invite URL", () => {
  const saved = storage();
  const privateToken = "1".repeat(64);
  const invitedToken = "a".repeat(64);
  saved.setItem("hive-private-demo/survival", privateToken);
  const page = new URL(`https://demo.example.test/?game=survival#world=${invitedToken}`);
  let calls = 0;
  let historyState = { marker: 1 };
  const locationSource = { get href() { return page.toString(); }, get hash() { return page.hash; } };
  const choice = createConnectionChoice({
    mode: "survival", publicHost: "https://demo.example.test", storage: saved, cryptoSource: cryptoSource(), locationSource,
    historySource: { get state() { return historyState; }, replaceState(state, _title, value) { historyState = state; page.href = new URL(value, page).toString(); } },
    connectLocal: () => ({}), connectRemote: options => {
      if (++calls === 2) throw new Error("replacement failed");
      return runtimeFactory([])(options);
    },
  });
  assert.throws(() => choice.persistence.newWorld(), /replacement failed/);
  assert.equal(saved.getItem("hive-private-demo/survival"), privateToken);
  assert.equal(page.hash, `#world=${invitedToken}`);
  assert.deepEqual(historyState, { marker: 1 });
  choice.runtime.dispose();
});

test("invited new-world refuses without history and preserves an absent private token", () => {
  const values = storage();
  const invitedToken = "c".repeat(64);
  let created = 0;
  const choice = createConnectionChoice({
    mode: "survival", publicHost: "https://demo.example.test", storage: values, cryptoSource: cryptoSource(),
    locationSource: { href: `https://demo.example.test/?game=survival#world=${invitedToken}`, hash: `#world=${invitedToken}` },
    connectLocal: () => ({}), connectRemote: options => { created++; return runtimeFactory([])(options); },
  });
  assert.throws(() => choice.persistence.newWorld(), /history|invitation link/);
  assert.equal(created, 1);
  assert.equal(values.getItem("hive-private-demo/survival"), null);
  choice.runtime.dispose();
});
