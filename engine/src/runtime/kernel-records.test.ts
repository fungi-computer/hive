import assert from "node:assert/strict";
import test from "node:test";
import { captureKernelRecords, restoreKernelRecords, KernelRecordCapture, type NativeRecordHandle } from "./kernel-records";

const entity = JSON.stringify({ format: "hive-kernel", version: 21, revision: 7, time: 1.5, scene: { format: "hive-game", version: 3, game: "colony", components: [], materialCatalog: [], initial: [] }, next_work_generation: 1, next_party_sequence: 1, party_bindings: [], work_attempts: [], routes: [], direct: [], projectile_contacts: [], jobs: [], tasks: [], planner: { routeSearches: { entries: {}, occurrence: null, spent: 0 } } });
function handle(seed: readonly { key: string; bytes: Uint8Array }[], fail = false): NativeRecordHandle & { freed: boolean; reads: number; inserts: number } {
  const records = new Map<string, Uint8Array>(seed.map(record => [record.key, Uint8Array.from(record.bytes)]));
  const result = { freed: false, reads: 0, inserts: 0, free() { this.freed = true; }, manifest() { throw new Error("unexpected incremental capture"); }, keys() { return JSON.stringify([...records.keys()].sort()); }, read(key: string) { this.reads += 1; return records.get(key)!; }, insert(key: string, bytes: Uint8Array) { this.inserts += 1; if (fail) throw new Error("insert failed"); records.set(key, bytes); } };
  return result;
}
function entityRecords(): { key: string; bytes: Uint8Array }[] {
  const root = JSON.parse(entity); const scene = root.scene; root.scene = null;
  return [{ key: "kernel/state/root", bytes: new TextEncoder().encode(JSON.stringify(root)) },
    { key: "kernel/state/definition", bytes: new TextEncoder().encode(JSON.stringify(scene)) },
    { key: "kernel/header", bytes: new Uint8Array([1]) }];
}

test("capture retains owned bytes and always frees the native handle", () => {
  const native = handle(entityRecords());
  const snapshot = captureKernelRecords({ capture_records: () => native, accept_records() {}, restore_records() { return 1; } });
  assert.equal(snapshot.revision, 7); assert.equal(snapshot.time, 1.5); assert.equal(native.freed, true);
});
test("restore frees a detached handle when insertion fails", () => {
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } });
  let detached: ReturnType<typeof handle> | undefined;
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } }, () => (detached = handle(entityRecords(), true)), snapshot));
  assert.equal(detached?.freed, true);
});
test("restore rejects duplicate, missing and oversized records", () => {
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } });
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } }, () => handle([]), { ...snapshot, records: [...snapshot.records, snapshot.records[0]] }));
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } }, () => handle([]), { ...snapshot, records: snapshot.records.filter(record => record.key !== "kernel/header") }));
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } }, () => handle([]), { ...snapshot, records: snapshot.records.map(record => record.key.startsWith("kernel/state/") ? { ...record, bytes: new Uint8Array(256 * 1024 + 1) } : record) }));
});
test("invalid native keys are rejected before any read and metadata before insertion", () => {
  const native = handle([{ key: "kernel/unknown", bytes: new Uint8Array() }]);
  assert.throws(() => captureKernelRecords({ capture_records: () => native, accept_records() {}, restore_records() { return 1; } }));
  assert.equal(native.reads, 0);
  const snapshot = captureKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } });
  const target = handle([]);
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } }, () => target, { ...snapshot, revision: 8 }));
  assert.equal(target.inserts, 0);
  assert.equal(target.freed, false);
});

test("current native entity version round trips and version 20 is rejected", () => {
  const current = captureKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } });
  assert.equal(readEntityVersion(current), 21);
  const old = { ...current, records: current.records.map((record) => record.key === "kernel/state/root"
    ? { ...record, bytes: new TextEncoder().encode(new TextDecoder().decode(record.bytes).replace('"version":21', '"version":20')) }
    : record) };
  assert.throws(() => restoreKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } }, () => handle([]), old), /unsupported kernel entity snapshot/);
});

function readEntityVersion(snapshot: ReturnType<typeof captureKernelRecords>): number {
  const entityRecord = snapshot.records.find((record) => record.key === "kernel/state/root");
  assert(entityRecord);
  return JSON.parse(new TextDecoder().decode(entityRecord.bytes)).version;
}

test("resident capture transports only explicit bounded puts and removals", () => {
  const records = entityRecords();
  const first = handle(records);
  first.manifest = () => JSON.stringify({ sequence: 1, base: null, revision: 7, time: 1.5, removes: [] });
  const unchanged = handle([]);
  unchanged.manifest = () => JSON.stringify({ sequence: 2, base: 1, revision: 7, time: 1.5, removes: [] });
  const changed = handle([{ key: "kernel/state/root", bytes: new TextEncoder().encode(new TextDecoder().decode(records[0].bytes).replace('"revision":7', '"revision":8')) }]);
  changed.manifest = () => JSON.stringify({ sequence: 3, base: 2, revision: 8, time: 1.5, removes: ["kernel/state/entities/retired"] });
  const queue = [first, unchanged, changed];
  const sequences: (number | undefined)[] = [];
  const owner = new KernelRecordCapture({ capture_records(since) { sequences.push(since); return queue.shift()!; }, accept_records() {}, restore_records() { return 1; } });
  const a = owner.capture();
  const b = owner.capture();
  assert.deepEqual(b.changes, { puts: [], removes: [] });
  assert.equal(unchanged.reads, 0);
  assert.deepEqual(b.snapshot, a.snapshot);
  const c = owner.capture();
  assert.equal(changed.reads, 1);
  assert.equal(c.changes.puts.length, 1);
  assert.deepEqual(c.changes.removes, ["kernel/state/entities/retired"]);
  assert.equal(c.snapshot.revision, 8);
  assert.deepEqual(sequences, [0, 1, 2]);
  assert(first.freed && unchanged.freed && changed.freed);
});

test("full recapture emits explicit old inventory removals and still validates required records", () => {
  const saved = captureKernelRecords({ capture_records: () => handle(entityRecords()), accept_records() {}, restore_records() { return 1; } });
  const extra = { key: "kernel/state/entities/extra", bytes: new Uint8Array([1]) };
  const next = handle(entityRecords());
  next.manifest = () => JSON.stringify({ sequence: 8, base: null, revision: 7, time: 1.5, removes: [extra.key] });
  const invalid = handle([]);
  invalid.manifest = () => JSON.stringify({ sequence: 9, base: null, revision: 7, time: 1.5, removes: [] });
  const queue = [next, invalid];
  const owner = new KernelRecordCapture({ capture_records: () => queue.shift()!, accept_records() {}, restore_records() { return 1; } });
  owner.restored({ ...saved, records: [...saved.records, extra] }, 7);
  const restored = owner.capture();
  assert.deepEqual(restored.changes.removes, [extra.key]);
  assert.deepEqual(restored.changes.puts.map(record => record.key), entityRecords().map(record => record.key).sort());
  assert.throws(() => owner.capture(), /missing native record header/);
  assert(invalid.freed);
});

test("incremental manifest rejects duplicate put keys and overlapping tombstones", () => {
  const records = entityRecords();
  const duplicate = handle(records);
  duplicate.keys = () => JSON.stringify(["kernel/header", "kernel/header"]);
  duplicate.manifest = () => JSON.stringify({ sequence: 1, base: null, revision: 7, time: 1.5, removes: [] });
  const overlap = handle(records);
  overlap.manifest = () => JSON.stringify({ sequence: 1, base: null, revision: 7, time: 1.5, removes: ["kernel/header"] });
  const queue = [duplicate, overlap];
  const owner = new KernelRecordCapture({ capture_records() { return queue.shift()!; }, accept_records() {}, restore_records() { return 1; } });
  assert.throws(() => owner.capture(), /not canonical/);
  assert.throws(() => owner.capture(), /invalid native removed records/);
  assert(duplicate.freed && overlap.freed);
});
