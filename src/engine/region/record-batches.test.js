import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openRegion } from "./index.ts";
import { sqliteTestOwner } from "./sqlite-test-owner.mjs";

const records = (first, count, size = 3) => Array.from({ length: count }, (_, i) => ({ key: `物/${String(first + i).padStart(4, "0")}`, bytes: new Uint8Array(size).fill((first + i) % 256) }));
function fixture(t, limits = {}) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const statements = [];
  let failAfter = 0, writes = 0;
  const base = sqliteTestOwner(db, sql => {
    if (/^(INSERT INTO|DELETE FROM) hive_region_records/.test(sql) && ++writes === failAfter) throw Error("batch-failure");
  });
  const owner = { ...base, sql: { exec(sql, ...bindings) {
    assert.ok(bindings.length <= 100, `binding budget: ${bindings.length}`);
    statements.push(sql);
    return base.sql.exec(sql, ...bindings);
  } } };
  const program = {
    id: "record-batches-v1", initial: () => ({ state: { n: 0 }, records: records(0, 230) }),
    parseState: structuredClone, parseCommand: structuredClone, authorize: () => true,
    execute(state, command) { state.n++; return { status: "applied", result: { n: state.n }, events: [{ n: state.n }], records: { puts: records(...command.puts), removes: [...records(0, command.removeCount ?? 0).map(r => r.key), "absent"] } }; },
  };
  const open = () => openRegion({ owner, region: "batches", program, clock: { principal: "clock" }, limits });
  const snapshot = () => ["hive_region", "hive_region_records", "hive_region_receipts", "hive_region_clock", "hive_region_events", "hive_region_replay"].map(table => db.prepare(`SELECT * FROM ${table}`).all());
  return { db, open, snapshot, statements, fail(value) { writes = 0; failAfter = value; } };
}
const change = { puts: [150, 180, 7], removeCount: 120 };
const occurrence = { sequence: 0, request: { id: "step-0", command: change } };

test("batched mixed changes preserve exact byte/count metadata, paging, restart and receipt replay", t => {
  const f = fixture(t); let region = f.open();
  f.statements.length = 0;
  const receipt = region.dispatchOccurrence("clock", occurrence);
  const commitSql = [...f.statements];
  assert.equal(commitSql.filter(s => s.startsWith("SELECT record_key,length(CAST")).length, 4);
  assert.equal(commitSql.filter(s => s.startsWith("INSERT INTO hive_region_records")).length, 6);
  assert.equal(commitSql.filter(s => s.startsWith("DELETE FROM hive_region_records")).length, 2);
  const actual = f.db.prepare("SELECT count(*) AS n,sum(length(CAST(record_key AS BLOB))+length(record_bytes)+16) AS bytes FROM hive_region_records").get();
  const meta = f.db.prepare("SELECT record_count,record_bytes FROM hive_region").get();
  assert.equal(meta.record_count, 210); assert.equal(meta.record_count, actual.n); assert.equal(meta.record_bytes, actual.bytes);
  f.statements.length = 0;
  const page = region.readRecords(1, "", 128);
  assert.equal(page.records.length, 128);
  assert.equal(f.statements.filter(s => s.startsWith("SELECT record_key,record_bytes")).length, 2);
  assert.deepEqual(page.records.map(r => r.key), [...records(120, 128)].map(r => r.key));
  region = f.open();
  const before = f.snapshot();
  assert.deepEqual(region.dispatchOccurrence("clock", occurrence), receipt);
  assert.deepEqual(f.snapshot(), before);
});

test("failure after each delete or upsert chunk rolls back all bytes, counters, events and clock", t => {
  const f = fixture(t); const region = f.open(); const before = f.snapshot();
  for (let chunk = 1; chunk <= 8; chunk++) {
    f.fail(chunk);
    assert.throws(() => region.dispatchOccurrence("clock", occurrence), /batch-failure/);
    assert.deepEqual(f.snapshot(), before, `failed chunk ${chunk}`);
    f.fail(0);
    assert.equal(f.open().readCommitted().revision, 0);
  }
  f.fail(0);
  assert.equal(region.dispatchOccurrence("clock", occurrence).status, "applied");
});

test("aggregate count and storage limits reject before batched mutations; absent deletes cost no capacity", t => {
  const capped = fixture(t, { records: 230 }); const region = capped.open(); const before = capped.snapshot();
  assert.throws(() => region.dispatch("player", { id: "too-many", replayEpoch: 0, command: { puts: [230, 1] } }), /region-record-capacity/);
  assert.deepEqual(capped.snapshot(), before);
  const limited = fixture(t, { storageBytes: 12_000 }); const smaller = limited.open(); const saved = limited.snapshot();
  assert.throws(() => smaller.dispatch("player", { id: "too-large", replayEpoch: 0, command: { puts: [0, 100, 80] } }), /region-storage-budget/);
  assert.deepEqual(limited.snapshot(), saved);
});

test("transaction readers enumerate the exact sorted bounded SQL inventory only while open", t => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  const owner = sqliteTestOwner(db);
  let heldReader;
  let seen;
  const program = {
    id: "record-inventory-v1",
    initial: () => ({ state: { n: 0 }, records: [{ key: "kernel/z", bytes: new Uint8Array([3]) }, { key: "kernel/a", bytes: new Uint8Array([1]) }, { key: "kernel/m", bytes: new Uint8Array([2]) }] }),
    parseState: structuredClone,
    parseCommand: structuredClone,
    authorize: () => true,
    execute(state, _command, reader) {
      heldReader = reader;
      seen = reader.records();
      return { status: "applied", result: {}, events: [], records: { puts: [], removes: [] } };
    },
  };
  const region = openRegion({ owner, region: "record-inventory", program, limits: { records: 3 } });
  assert.equal(region.dispatch("player", { id: "inventory", replayEpoch: 0, command: {} }).status, "applied");
  assert.deepEqual(seen.map(record => record.key), ["kernel/a", "kernel/m", "kernel/z"]);
  assert.deepEqual(seen.map(record => [...record.bytes]), [[1], [2], [3]]);
  assert.throws(() => heldReader.records(), /region-record-reader-closed/);
});
