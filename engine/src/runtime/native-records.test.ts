import { environmentFixture } from "./fixtures/environment.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel, WasmKernelRecords } from "../../generated/hive_kernel.js";
import { KernelRecordCapture, captureKernelRecords, restoreKernelRecords } from "./kernel-records";
import { checkedChange } from "../../../src/engine/region/records.ts";
import { createColonyFrameworkProofPack } from "../games/colony-performance.ts";
import { GameSession } from "./session.ts";
import { wasmKernelPort } from "./wasm-kernel.ts";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

type RecordPart = { key: string; bytes: Uint8Array };
function capture(kernel: WasmKernel): RecordPart[] {
  const handle = kernel.capture_records();
  try {
    return (JSON.parse(handle.keys()) as string[]).map((key) => ({ key, bytes: handle.read(key) }));
  } finally { handle.free(); }
}
function restore(kernel: WasmKernel, parts: readonly RecordPart[]) {
  const handle = new WasmKernelRecords();
  try {
    for (const { key, bytes } of parts) handle.insert(key, bytes);
  } catch (error) {
    handle.free();
    throw error;
  }
  // wasm-bindgen consumes this detached handle on both success and rejection.
  kernel.restore_records(handle);
}
function applyChanges(base: readonly RecordPart[], changes: { readonly puts: readonly RecordPart[]; readonly removes: readonly string[] }): RecordPart[] {
  const records = new Map(base.map(({ key, bytes }) => [key, Uint8Array.from(bytes)]));
  for (const key of changes.removes) records.delete(key);
  for (const { key, bytes } of changes.puts) records.set(key, Uint8Array.from(bytes));
  return [...records].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, bytes]) => ({ key, bytes }));
}


test("actual WASM captures opaque water records and restores atomically", () => {
  const first = new WasmKernel();
  const recovered = new WasmKernel();
  try {
    first.load(JSON.stringify({ format: "hive-game", version: 3, game: "colony", components: [], materialCatalog: [], initial: [] }));
    first.load_environment(JSON.stringify(environmentFixture));
    const beforeWater = capture(first).find(record => record.key === "kernel/environment/water")!.bytes;
    const step = JSON.stringify({ delta: 0.2, writes: [], actions: [] });
    const advanced = JSON.parse(first.advance(step));
    assert.equal(advanced.revision, 1);
    const saved = capture(first);
    assert.notDeepEqual(saved.find(record => record.key === "kernel/environment/water")!.bytes, beforeWater);
    assert.ok(saved.every(({ bytes }) => bytes instanceof Uint8Array && bytes.length <= 256 * 1024));
    assert.ok(saved.some(({ key }) => key === "kernel/environment/water"));
    restore(recovered, structuredClone(saved));
    assert.equal(recovered.environment_facts(), first.environment_facts());
    first.advance(step);
    recovered.advance(step);
    assert.deepEqual(capture(recovered), capture(first));

    const before = capture(recovered);
    const corrupt = before.map(({ key, bytes }) => ({ key, bytes: key === "kernel/environment/water"
      ? Uint8Array.from([...bytes, 0]) : bytes }));
    assert.throws(() => restore(recovered, corrupt));
    assert.deepEqual(capture(recovered), before);
    assert.throws(() => restore(recovered, before.filter(({ key }) => key !== "kernel/environment/terrain")));
    assert.deepEqual(capture(recovered), before);
  } finally { first.free(); recovered.free(); }
});

test("actual WASM entity membership is positional and bounded", () => {
  const kernel = new WasmKernel();
  try {
    kernel.load(JSON.stringify({
      format: "hive-game", version: 3, game: "membership", components: [], materialCatalog: [],
      initial: [{ id: "actor", components: {} }],
    }));
    assert.deepEqual(JSON.parse(kernel.entity_membership(JSON.stringify(["actor", "missing"]))), [true, false]);
    assert.throws(() => kernel.entity_membership(JSON.stringify(["bad id"])));
    assert.throws(() => kernel.entity_membership(JSON.stringify(Array.from({ length: 129 }, (_, i) => `id-${i}`))));
  } finally { kernel.free(); }
});

test("native resident captures transfer zero unchanged bytes and preserve independent saves and restore", (t: { diagnostic(message: string): void }) => {
  const kernel = new WasmKernel();
  const recovered = new WasmKernel();
  try {
    kernel.load(JSON.stringify({ format: "hive-game", version: 3, game: "capture", components: [], materialCatalog: [], initial: [] }));
    kernel.load_environment(JSON.stringify(environmentFixture));
    const owner = new KernelRecordCapture(kernel);
    const captureWithoutEntityDecode = () => {
      const parse = JSON.parse;
      JSON.parse = (text, reviver) => {
        assert(!text.includes('"format":"hive-kernel"'), "resident must not parse the entity snapshot");
        return parse(text, reviver);
      };
      try { return owner.capture(); } finally { JSON.parse = parse; }
    };
    const initial = captureWithoutEntityDecode();
    const exported = captureKernelRecords(kernel);
    const exportForRestore = structuredClone(exported);
    const baseRows = exportForRestore.records;
    exported.records[0].bytes.fill(0);
    const unchanged = captureWithoutEntityDecode();
    assert.deepEqual(unchanged.changes, { puts: [], removes: [] });
    assert.deepEqual(unchanged.snapshot, initial.snapshot);
    kernel.advance(JSON.stringify({ delta: 0.2, writes: [], actions: [] }));
    const advanced = captureWithoutEntityDecode();
    assert(advanced.changes.puts.length > 0);
    assert(!advanced.changes.puts.some(record => ["kernel/environment/terrain", "kernel/environment/structures", "kernel/environment/definition"].includes(record.key)));
    const materialized = applyChanges(baseRows, advanced.changes);
    assert.deepEqual(materialized, capture(kernel));
    restore(recovered, materialized);
    assert.deepEqual(capture(recovered), materialized);
    // A restore to an older committed state invalidates the resident's local
    // frontier. A full recapture removes anything absent from that state.
    const sequence = restoreKernelRecords(kernel, () => new WasmKernelRecords(), exportForRestore);
    owner.restored(exportForRestore, sequence);
    const rolledBack = owner.capture();
    assert.deepEqual(rolledBack.snapshot, initial.snapshot);
    assert.deepEqual(owner.capture().changes, { puts: [], removes: [] });
    t.diagnostic(JSON.stringify({
      initialBytes: initial.changes.puts.reduce((sum, record) => sum + record.bytes.byteLength, 0),
      unchangedBytes: unchanged.changes.puts.reduce((sum, record) => sum + record.bytes.byteLength, 0),
      stepBytes: advanced.changes.puts.reduce((sum, record) => sum + record.bytes.byteLength, 0),
      stepRecords: advanced.changes.puts.map(record => record.key),
    }));
  } finally { kernel.free(); recovered.free(); }
});

test("cold recovery above one MiB starts from its committed capture frontier", (t: { diagnostic(message: string): void }) => {
  const source = new WasmKernel();
  const recovered = new WasmKernel();
  try {
    source.load(JSON.stringify({
      format: "hive-game", version: 3, game: "large-capture", materialCatalog: [],
      components: [{ id: "fixture.text", version: 1, fields: { value: "string" } }],
      initial: Array.from({ length: 300 }, (_, i) => ({ id: `entity-${String(i).padStart(4, "0")}`, components: { "fixture.text": { value: "x".repeat(4096) } } })),
    }));
    const saved = captureKernelRecords(source);
    const baselineBytes = saved.records.reduce((sum, record) => sum + record.bytes.byteLength, 0);
    assert(baselineBytes > 1024 * 1024);
    const sequence = restoreKernelRecords(recovered, () => new WasmKernelRecords(), saved);
    const owner = new KernelRecordCapture(recovered);
    owner.restored(saved, sequence);
    assert.deepEqual(owner.capture().changes, { puts: [], removes: [] });
    let durableRows = saved.records;
    recovered.advance(JSON.stringify({ delta: 0, writes: [], actions: [] }));
    const changed = owner.capture();
    const stepBytes = changed.changes.puts.reduce((sum, record) => sum + record.bytes.byteLength, 0);
    assert(stepBytes > 0 && stepBytes <= 1024 * 1024);
    checkedChange(changed.changes, { recordBytes: 256 * 1024, records: 4096, changedRecords: 128, storageBytes: 16 * 1024 * 1024 });
    durableRows = applyChanges(durableRows, changed.changes);
    assert.deepEqual(durableRows, capture(recovered));
    // A rejected restore must not advance the native baseline or invalidate
    // the still-live JS cursor; retries keep the exact committed bytes.
    const malformed = { ...saved, records: saved.records.map(record => record.key === "kernel/header"
      ? { ...record, bytes: Uint8Array.from([...record.bytes, 0]) } : record) };
    assert.throws(() => restoreKernelRecords(recovered, () => new WasmKernelRecords(), malformed));
    assert.deepEqual(owner.capture().changes, { puts: [], removes: [] });
    recovered.load(JSON.stringify({ format: "hive-game", version: 3, game: "replacement", components: [], materialCatalog: [], initial: [] }));
    const replacement = owner.capture();
    assert(replacement.changes.removes.length >= 4, "reset removes the old world's trailing chunks");
    durableRows = applyChanges(durableRows, replacement.changes);
    assert.deepEqual(durableRows, capture(recovered));
    t.diagnostic(JSON.stringify({ baselineBytes, stepBytes, changedRecords: changed.changes.puts.length }));
  } finally { source.free(); recovered.free(); }
});

test("a short/long change to the first entity leaves every other persistence identity unchanged", () => {
  const kernel = new WasmKernel();
  const recovered = new WasmKernel();
  try {
    kernel.load(JSON.stringify({
      format: "hive-game", version: 3, game: "stable-identities", materialCatalog: [],
      components: [{ id: "fixture.text", version: 1, fields: { value: "string" } }],
      initial: Array.from({ length: 300 }, (_, i) => ({ id: `entity-${String(i).padStart(4, "0")}`, components: { "fixture.text": { value: "x".repeat(4096) } } })),
    }));
    const owner = new KernelRecordCapture(kernel);
    owner.capture();
    owner.acceptCapture();
    for (const value of ["short", "y".repeat(4096)]) {
      kernel.advance(JSON.stringify({ delta: 0, writes: [{ entity: "entity-0000", component: "fixture.text", value: { value } }], actions: [] }));
      const changed = owner.capture();
      assert.deepEqual(changed.changes.puts.map(row => row.key).sort(), ["kernel/state/entities/entity-0000", "kernel/state/root"]);
      assert.deepEqual(changed.changes.removes, []);
      checkedChange(changed.changes, { recordBytes: 256 * 1024, records: 4096, changedRecords: 1024, storageBytes: 8 * 1024 * 1024 });
      restoreKernelRecords(recovered, () => new WasmKernelRecords(), captureKernelRecords(kernel));
      assert.deepEqual(capture(recovered), capture(kernel));
      owner.acceptCapture();
    }
    const saved = captureKernelRecords(kernel);
    assert.throws(() => restoreKernelRecords(recovered, () => new WasmKernelRecords(), { ...saved, version: 2 as never }), /unsupported kernel record snapshot/);
    assert.throws(() => restoreKernelRecords(recovered, () => new WasmKernelRecords(), {
      ...saved, records: saved.records.filter(row => row.key !== "kernel/state/entities/entity-0000"),
    }));
    assert.deepEqual(capture(recovered), capture(kernel), "missing identity cannot partially replace the recovered world");
    const oldHeader = saved.records.map(row => row.key === "kernel/header"
      ? { ...row, bytes: Uint8Array.from([4, ...row.bytes.slice(1)]) } : row);
    assert.throws(() => restore(recovered, oldHeader));
    assert.deepEqual(capture(recovered), capture(kernel));
  } finally { kernel.free(); recovered.free(); }
});

test("distributed 100-worker fixture stays within changed-record admission through the former step-13 cliff", (t: { diagnostic(message: string): void }) => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({ port, pack: createColonyFrameworkProofPack() });
  let maxBytes = 0, maxRecords = 0;
  try {
    session.start();
    session.captureForCommit();
    session.acceptCapture();
    let durableRows = session.save().kernel.records;
    for (let step = 1; step <= 40; step++) {
      session.runDisposableCandidate(() => {
        session.step(.1);
        const capture = session.captureForCommit();
        durableRows = applyChanges(durableRows, capture.changes);
        checkedChange(capture.changes, { recordBytes: 256 * 1024, records: 4096, changedRecords: 1024, storageBytes: 8 * 1024 * 1024 });
        const bytes = capture.changes.puts.reduce((sum, record) => sum + record.bytes.length + new TextEncoder().encode(record.key).length + 16, 0);
        maxBytes = Math.max(maxBytes, bytes);
        maxRecords = Math.max(maxRecords, capture.changes.puts.length + capture.changes.removes.length);
        if (step === 20) {
          const recovered = new WasmKernel();
          try {
            const checkpoint = session.save().kernel;
            restoreKernelRecords(recovered, () => new WasmKernelRecords(), checkpoint);
            assert.deepEqual(captureKernelRecords(recovered), checkpoint);
          } finally { recovered.free(); }
        }
        if (step % 10 === 0) assert.deepEqual(durableRows, session.save().kernel.records, "journal delta matches detached checkpoint");
        session.acceptCapture();
      });
    }
    t.diagnostic(JSON.stringify({ fixture: "colony-framework-proof-256-100-v1", steps: 40, maxBytes, maxRecords }));
  } finally { port.dispose(); }
});

test("capture acknowledgement preserves later mutations and discarded candidates recover the last committed journal", () => {
  const kernel = new WasmKernel(), recovered = new WasmKernel();
  try {
    kernel.load(JSON.stringify({ format: "hive-game", version: 3, game: "journal", materialCatalog: [],
      components: [{ id: "fixture.text", version: 1, fields: { value: "string" } }],
      initial: [{ id: "a", components: { "fixture.text": { value: "before" } } }, { id: "b", components: { "fixture.text": { value: "before" } } }],
    }));
    const owner = new KernelRecordCapture(kernel);
    owner.capture();
    const committed = captureKernelRecords(kernel);
    let durableRows = committed.records;
    owner.acceptCapture();
    owner.capture();
    const write = (target: WasmKernel, id: string, value: string) => target.advance(JSON.stringify({ delta: 0, writes: [{ entity: id, component: "fixture.text", value: { value } }], actions: [] }));
    write(kernel, "a", "after-first-capture");
    owner.acceptCapture(); // acknowledges only the generation captured before a changed
    const first = owner.capture();
    assert(first.changes.puts.some(row => row.key === "kernel/state/entities/a"));
    durableRows = applyChanges(durableRows, first.changes);
    write(kernel, "b", "second-provisional-occurrence");
    const second = owner.capture();
    assert(second.changes.puts.some(row => row.key === "kernel/state/entities/b"));
    durableRows = applyChanges(durableRows, second.changes);
    assert.deepEqual(durableRows, captureKernelRecords(kernel).records);
    const sequence = restoreKernelRecords(recovered, () => new WasmKernelRecords(), committed);
    const restored = new KernelRecordCapture(recovered);
    restored.restored(committed, sequence);
    assert.deepEqual(restored.capture().changes, { puts: [], removes: [] });
    write(recovered, "a", "after-first-capture");
    write(recovered, "b", "second-provisional-occurrence");
    const retry = restored.capture();
    assert.deepEqual(retry.snapshot, second.snapshot, "retry reproduces the same frontier");
    assert.deepEqual(applyChanges(committed.records, retry.changes), durableRows, "retry reproduces the same canonical rows");
    owner.acceptCapture();
    assert.throws(() => owner.acceptCapture(), /not awaiting acknowledgement/);
    assert.deepEqual(owner.capture().changes, { puts: [], removes: [] });
  } finally { kernel.free(); recovered.free(); }
});
