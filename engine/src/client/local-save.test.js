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
