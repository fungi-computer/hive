import assert from "node:assert/strict";
import test from "node:test";
import { captureKernelRecords, restoreKernelRecords, type NativeRecordHandle } from "./kernel-records";

const entity = JSON.stringify({ format: "hive-kernel", version: 5, revision: 7, time: 1.5, scene: { format: "hive-game", version: 1, game: "colony", components: [], initial: [] } });
function handle(seed: readonly { key: string; bytes: Uint8Array }[], fail = false): NativeRecordHandle & { freed: boolean; reads: number; inserts: number } {
  const records = new Map<string, Uint8Array>(seed.map(record => [record.key, Uint8Array.from(record.bytes)]));
  const result = { freed: false, reads: 0, inserts: 0, free() { this.freed = true; }, keys() { return JSON.stringify([...records.keys()]); }, read(key: string) { this.reads += 1; return records.get(key)!; }, insert(key: string, bytes: Uint8Array) { this.inserts += 1; if (fail) throw new Error("insert failed"); records.set(key, bytes); } };
  return result;
}
function entityRecords(): { key: string; bytes: Uint8Array }[] { return [{ key: "kernel/entities/0000", bytes: new TextEncoder().encode(entity) }, { key: "kernel/header", bytes: new Uint8Array([1]) }]; }

test("capture retains owned bytes and always frees the native handle", () => {
  const native = handle(entityRecords());
  const snapshot = captureKernelRecords({ capture_records: () => native, restore_records() {} });
  assert.equal(snapshot.revision, 7); assert.equal(snapshot.time, 1.5); assert.equal(native.freed, true);
});
test("restore frees a detached handle when insertion fails", () => {
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} });
  let detached: ReturnType<typeof handle> | undefined;
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} }, () => (detached = handle(entityRecords(), true)), snapshot));
  assert.equal(detached?.freed, true);
});
test("restore rejects duplicate, missing and oversized records", () => {
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} });
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} }, () => handle([]), { ...snapshot, records: [...snapshot.records, snapshot.records[0]] }));
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} }, () => handle([]), { ...snapshot, records: snapshot.records.filter(record => record.key !== "kernel/header") }));
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} }, () => handle([]), { ...snapshot, records: snapshot.records.map(record => record.key.startsWith("kernel/entities/") ? { ...record, bytes: new Uint8Array(256 * 1024 + 1) } : record) }));
});
test("invalid native keys are rejected before any read and metadata before insertion", () => {
  const native = handle([{ key: "kernel/unknown", bytes: new Uint8Array() }]);
  assert.throws(() => captureKernelRecords({ capture_records: () => native, restore_records() {} }));
  assert.equal(native.reads, 0);
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} });
  const target = handle([]);
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), restore_records() {} }, () => target, { ...snapshot, revision: 8 }));
  assert.equal(target.inserts, 0);
  assert.equal(target.freed, false);
});
