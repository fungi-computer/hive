import { environmentFixture } from "./fixtures/environment.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { initSync, WasmKernel, WasmKernelRecords } from "../../generated/hive_kernel.js";
import { KernelRecordCapture, captureKernelRecords, restoreKernelRecords } from "./kernel-records";
import { checkedChange } from "../../../src/engine/region/records.ts";

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


test("actual WASM captures opaque water records and restores atomically", () => {
  const first = new WasmKernel();
  const recovered = new WasmKernel();
  try {
    first.load(JSON.stringify({ format: "hive-game", version: 3, game: "colony", components: [], materialCatalog: [], initial: [] }));
    first.load_environment(JSON.stringify(environmentFixture));
    const step = JSON.stringify({ delta: 0.2, writes: [], actions: [] });
    const advanced = JSON.parse(first.advance(step));
    assert.ok(advanced.environmentWork.work.faces > 0);
    const saved = capture(first);
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
    exported.records[0].bytes.fill(0);
    const unchanged = captureWithoutEntityDecode();
    assert.deepEqual(unchanged.changes, { puts: [], removes: [] });
    assert.deepEqual(unchanged.snapshot, exportForRestore);
    kernel.advance(JSON.stringify({ delta: 0.2, writes: [], actions: [] }));
    const advanced = captureWithoutEntityDecode();
    assert(advanced.changes.puts.length > 0);
    assert(!advanced.changes.puts.some(record => ["kernel/environment/terrain", "kernel/environment/structures", "kernel/environment/definition"].includes(record.key)));
    assert.deepEqual(advanced.snapshot.records, capture(kernel));
    restoreKernelRecords(recovered, () => new WasmKernelRecords(), advanced.snapshot);
    assert.deepEqual(capture(recovered), advanced.snapshot.records);
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
    recovered.advance(JSON.stringify({ delta: 0, writes: [], actions: [] }));
    const changed = owner.capture();
    const stepBytes = changed.changes.puts.reduce((sum, record) => sum + record.bytes.byteLength, 0);
    assert(stepBytes > 0 && stepBytes <= 1024 * 1024);
    checkedChange(changed.changes, { recordBytes: 256 * 1024, records: 4096, changedRecords: 128, storageBytes: 16 * 1024 * 1024 });
    assert.deepEqual(changed.snapshot.records, capture(recovered));
    // A rejected restore must not advance the native baseline or invalidate
    // the still-live JS cursor; retries keep the exact committed bytes.
    const malformed = { ...saved, records: saved.records.map(record => record.key === "kernel/header"
      ? { ...record, bytes: Uint8Array.from([...record.bytes, 0]) } : record) };
    assert.throws(() => restoreKernelRecords(recovered, () => new WasmKernelRecords(), malformed));
    assert.deepEqual(owner.capture().changes, { puts: [], removes: [] });
    recovered.load(JSON.stringify({ format: "hive-game", version: 3, game: "replacement", components: [], materialCatalog: [], initial: [] }));
    const replacement = owner.capture();
    assert(replacement.changes.removes.length >= 4, "reset removes the old world's trailing chunks");
    const stored = new Map(changed.snapshot.records.map(record => [record.key, record.bytes]));
    for (const key of replacement.changes.removes) stored.delete(key);
    for (const record of replacement.changes.puts) stored.set(record.key, record.bytes);
    assert.deepEqual([...stored].sort(([a], [b]) => a.localeCompare(b)).map(([key, bytes]) => ({ key, bytes })), capture(recovered));
    t.diagnostic(JSON.stringify({ baselineBytes, stepBytes, changedRecords: changed.changes.puts.length }));
  } finally { source.free(); recovered.free(); }
});
