import assert from "node:assert/strict";
import test from "node:test";
import { createConnectionChoice } from "./connection-choice.js";
import { createLocalSaveOwner } from "./local-save.js";

test("local save owner reports unavailable IndexedDB without claiming a save", async () => {
  const owner = createLocalSaveOwner({ mode: "survival", indexedDBSource: undefined });
  await assert.rejects(owner.write({}), /IndexedDB is unavailable/);
  await owner.close();
});

test("local save owner retains binary snapshot values through its store", async () => {
  const values = new Map();
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    get(_store, key) { return Promise.resolve(values.get(key)); },
    transaction() {
      const store = {
        put(value, key) {
          values.set(key, structuredClone(value));
          return Promise.resolve();
        },
        get(key) { return Promise.resolve(values.get(key)); },
      };
      return { store, done: Promise.resolve() };
    },
    close() {},
  };
  const owner = createLocalSaveOwner({
    mode: "formations",
    indexedDBSource: {},
    openDBImpl: async () => db,
  });
  const snapshot = { kernel: { records: [{ key: "water", bytes: new Uint8Array([1, 2, 3]) }] } };
  await owner.write(snapshot);
  const restored = await owner.read();
  assert.deepEqual([...restored.kernel.records[0].bytes], [1, 2, 3]);
  assert.ok(restored.kernel.records[0].bytes instanceof Uint8Array);
  await owner.close();
});

test("local save owner observes both request and transaction failures", async () => {
  let closed = false;
  const db = {
    objectStoreNames: { contains: () => true },
    close() { closed = true; },
    transaction() {
      return {
        store: { put: () => Promise.reject(new Error("put failed")) },
        done: Promise.reject(new Error("transaction failed")),
      };
    },
  };
  const owner = createLocalSaveOwner({ mode: "pirates", indexedDBSource: {}, openDBImpl: async () => db });
  await assert.rejects(owner.write({}), /put failed|transaction failed/);
  await owner.close();
  assert.equal(closed, true);
});

test("local save owner waits for transaction commit after put resolves", async () => {
  let commit;
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      return {
        store: { put: async () => {} },
        done: new Promise((resolve) => { commit = resolve; }),
      };
    },
  };
  const owner = createLocalSaveOwner({ mode: "pirates", indexedDBSource: {}, openDBImpl: async () => db });
  let finished = false;
  const writing = owner.write({ value: 1 }).then(() => { finished = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(finished, false);
  commit();
  await writing;
  assert.equal(finished, true);
  await owner.close();
});

test("closed local save owner rejects later reads", async () => {
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    get() { return undefined; },
  };
  const owner = createLocalSaveOwner({ mode: "colony", indexedDBSource: {}, openDBImpl: async () => db });
  await owner.close();
  await assert.rejects(owner.read(), /local save is closed/);
});

test("continue does not restore after local runtime disposal", async () => {
  let resolveRead;
  const sent = [];
  const choice = createConnectionChoice({
    mode: "survival",
    runtime: "local",
    saveOwner: {
      read: () => new Promise((resolve) => { resolveRead = resolve; }),
      write: async () => {},
      close: async () => {},
    },
    connectLocal: () => ({
      send(command) { sent.push(command); },
      subscribe: () => () => {},
      dispose() {},
    }),
    connectRemote: () => { throw new Error("remote factory should not run"); },
  });
  const pending = choice.persistence.continue();
  choice.runtime.dispose();
  resolveRead({ binary: new Uint8Array([4]) });
  await assert.rejects(pending, /connection choice disposed/);
  assert.deepEqual(sent, []);
});

test("connection choice awaits injected durable save and restore", async () => {
  const sent = [];
  const listeners = new Set();
  const saved = [];
  const choice = createConnectionChoice({
    mode: "colony",
    runtime: "local",
    saveOwner: {
      async read() { return saved[0]; },
      async write(value) { await Promise.resolve(); saved[0] = structuredClone(value); },
      async close() {},
    },
    connectLocal: () => ({
      send(command) { sent.push(command); },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      dispose() {},
    }),
    connectRemote: () => { throw new Error("remote factory should not run"); },
  });
  const snapshot = { kernel: { records: [{ bytes: new Uint8Array([9]) }] } };
  await choice.persistence.onSaved(snapshot);
  await choice.persistence.continue();
  assert.deepEqual([...sent[0].snapshot.kernel.records[0].bytes], [9]);
  choice.runtime.dispose();
});

test("disposed local persistence rejects save, reset, and late snapshot writes", async () => {
  const choice = createConnectionChoice({
    mode: "colony",
    runtime: "local",
    saveOwner: { read: async () => undefined, write: async () => {}, close: async () => {} },
    connectLocal: () => ({ send() {}, subscribe: () => () => {}, dispose() {} }),
    connectRemote: () => { throw new Error("remote factory should not run"); },
  });
  choice.runtime.dispose();
  assert.throws(() => choice.persistence.save(), /connection choice disposed/);
  assert.throws(() => choice.persistence.newWorld(), /connection choice disposed/);
  await assert.rejects(choice.persistence.onSaved({}), /connection choice disposed/);
});
