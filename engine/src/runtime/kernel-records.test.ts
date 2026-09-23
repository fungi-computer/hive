import assert from "node:assert/strict";
import test from "node:test";
import { captureKernelRecords, restoreKernelRecords, KernelRecordCapture, type NativeRecordHandle } from "./kernel-records";

const entity = JSON.stringify({ format: "hive-kernel", version: 18, revision: 7, time: 1.5, scene: { format: "hive-game", version: 3, game: "colony", components: [], materialCatalog: [], initial: [] }, next_work_generation: 1, next_party_sequence: 1, party_bindings: [], work_attempts: [] });
function handle(seed: readonly { key: string; bytes: Uint8Array }[], fail = false): NativeRecordHandle & { freed: boolean; reads: number; inserts: number } {
  const records = new Map<string, Uint8Array>(seed.map(record => [record.key, Uint8Array.from(record.bytes)]));
  const result = { freed: false, reads: 0, inserts: 0, free() { this.freed = true; }, manifest() { throw new Error("unexpected incremental capture"); }, keys() { return JSON.stringify([...records.keys()]); }, read(key: string) { this.reads += 1; return records.get(key)!; }, insert(key: string, bytes: Uint8Array) { this.inserts += 1; if (fail) throw new Error("insert failed"); records.set(key, bytes); } };
  return result;
}
function entityRecords(): { key: string; bytes: Uint8Array }[] { return [{ key: "kernel/entities/0000", bytes: new TextEncoder().encode(entity) }, { key: "kernel/header", bytes: new Uint8Array([1]) }]; }

test("capture retains owned bytes and always frees the native handle", () => {
  const native = handle(entityRecords());
  const snapshot = captureKernelRecords({ capture_records: () => native, restore_records() { return 1; } });
  assert.equal(snapshot.revision, 7); assert.equal(snapshot.time, 1.5); assert.equal(native.freed, true);
});
test("restore frees a detached handle when insertion fails", () => {
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } });
  let detached: ReturnType<typeof handle> | undefined;
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } }, () => (detached = handle(entityRecords(), true)), snapshot));
  assert.equal(detached?.freed, true);
});
test("restore rejects duplicate, missing and oversized records", () => {
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } });
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } }, () => handle([]), { ...snapshot, records: [...snapshot.records, snapshot.records[0]] }));
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } }, () => handle([]), { ...snapshot, records: snapshot.records.filter(record => record.key !== "kernel/header") }));
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } }, () => handle([]), { ...snapshot, records: snapshot.records.map(record => record.key.startsWith("kernel/entities/") ? { ...record, bytes: new Uint8Array(256 * 1024 + 1) } : record) }));
});
test("invalid native keys are rejected before any read and metadata before insertion", () => {
  const native = handle([{ key: "kernel/unknown", bytes: new Uint8Array() }]);
  assert.throws(() => captureKernelRecords({ capture_records: () => native, restore_records() { return 1; } }));
  assert.equal(native.reads, 0);
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } });
  const target = handle([]);
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } }, () => target, { ...snapshot, revision: 8 }));
  assert.equal(target.inserts, 0);
  assert.equal(target.freed, false);
});

test("current native entity version round trips and version 16 is rejected", () => {
  const current = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } });
  assert.equal(readEntityVersion(current), 18);
  const old = { ...current, records: current.records.map((record) => record.key.startsWith("kernel/entities/")
    ? { ...record, bytes: new TextEncoder().encode(entity.replace('"version":18', '"version":16')) }
    : record) };
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } }, () => handle([]), old), /unsupported kernel entity snapshot/);
});

function readEntityVersion(snapshot: ReturnType<typeof captureKernelRecords>): number {
  const entityRecord = snapshot.records.find((record) => record.key === "kernel/entities/0000");
  assert(entityRecord);
  return JSON.parse(new TextDecoder().decode(entityRecord.bytes)).version;
}

test("resident capture reuses unchanged bytes and removes deleted records without full JSON decoding", () => {
  const records = entityRecords();
  const fullKeys = records.map(record => record.key);
  const first = handle(records);
  first.manifest = () => JSON.stringify({ sequence: 1, base: null, revision: 7, time: 1.5, keys: fullKeys });
  const unchanged = handle([]);
  unchanged.manifest = () => JSON.stringify({ sequence: 2, base: 1, revision: 7, time: 1.5, keys: fullKeys });
  const changed = handle([{ key: "kernel/entities/0000", bytes: new TextEncoder().encode(entity.replace('"revision":7', '"revision":8')) }]);
  changed.manifest = () => JSON.stringify({ sequence: 3, base: 2, revision: 8, time: 1.5, keys: fullKeys });
  const queue = [first, unchanged, changed];
  const sequences: (number | undefined)[] = [];
  const owner = new KernelRecordCapture({ capture_records(since) { sequences.push(since); return queue.shift()!; }, restore_records() { return 1; } });
  const a = owner.capture();
  const b = owner.capture();
  assert.deepEqual(b.changes, { puts: [], removes: [] });
  assert.equal(unchanged.reads, 0);
  assert.equal(b.snapshot.records[0].bytes, a.snapshot.records[0].bytes);
  const c = owner.capture();
  assert.equal(changed.reads, 1);
  assert.equal(c.changes.puts.length, 1);
  assert.equal(c.snapshot.revision, 8);
  assert.deepEqual(sequences, [0, 1, 2]);
  assert(first.freed && unchanged.freed && changed.freed);
});

test("capture after restore retains removal frontier and rejects missing delta bytes", () => {
  const saved = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() { return 1; } });
  const extra = { key: "kernel/entities/0001", bytes: new Uint8Array([1]) };
  const next = handle(entityRecords());
  next.manifest = () => JSON.stringify({ sequence: 8, base: null, revision: 7, time: 1.5, keys: entityRecords().map(record => record.key) });
  const invalid = handle([]);
  invalid.manifest = () => JSON.stringify({ sequence: 9, base: null, revision: 7, time: 1.5, keys: entityRecords().map(record => record.key) });
  const queue = [next, invalid];
  const owner = new KernelRecordCapture({ capture_records: () => queue.shift()!, restore_records() { return 1; } });
  owner.restored({ ...saved, records: [...saved.records, extra] }, 7);
  assert.deepEqual(owner.capture().changes.removes, [extra.key]);
  assert.throws(() => owner.capture(), /omitted a required record/);
  assert(invalid.freed);
});
