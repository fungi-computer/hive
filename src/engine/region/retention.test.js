import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRegion } from "./index.ts";
import { sqliteTestOwner } from "./sqlite-test-owner.mjs";

const program = {
  id: "receipt-physical-counter-v1",
  initial: () => ({ state: { goods: 0 }, records: [] }),
  parseState: value => structuredClone(value),
  parseCommand: value => {
    if (value?.kind !== "produce") throw Error("command");
    return { kind: "produce" };
  },
  authorize: principal => ["alice", "bob"].includes(principal),
  execute(state) {
    state.goods++;
    return { status: "applied", result: { goods: state.goods }, events: [],
      records: { puts: [{ key: "physical/goods", bytes: new Uint8Array(new Uint32Array([state.goods]).buffer) }], removes: [] } };
  },
};
const input = (id, replayEpoch) => ({ id, replayEpoch, command: { kind: "produce" } });
function setup(t, limits) {
  const root = mkdtempSync(join(tmpdir(), "hive-receipts-"));
  let db = new DatabaseSync(join(root, "region.sqlite"));
  let fail = "";
  const open = () => openRegion({ region: "retention", program, limits,
    owner: sqliteTestOwner(db, sql => { if (fail && sql.startsWith(fail)) throw Error("injected-sql-failure"); }) });
  t.after(() => { db.close(); rmSync(root, { recursive: true }); });
  return { open, get db() { return db; }, set fail(value) { fail = value; },
    restart() { db.close(); db = new DatabaseSync(join(root, "region.sqlite")); return open(); } };
}

test("8,200 accepted physical commands cross two default windows with scoped replay, bounded rows, and disk restart", t => {
  const f = setup(t);
  let region = f.open();
  const commands = [];
  for (let n = 0; n < 8200; n++) {
    if (n === 4097) region = f.restart();
    const principal = n % 2 ? "bob" : "alice";
    // Two principals deliberately share the same opaque ID.
    const request = input(`produce-${Math.floor(n / 2)}`, region.readReplayWindow().epoch);
    const receipt = region.dispatch(principal, request);
    assert.equal(receipt.status, "applied");
    assert.equal(receipt.result.goods, n + 1);
    commands.push({ principal, request, receipt });
  }
  assert.deepEqual(region.readReplayWindow(), { epoch: 2, retainedReceipts: 4096, capacity: 4096 });
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM hive_region_receipts").get().n, 4096);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM hive_region_replay").get().n, 1);
  region = f.restart();
  for (const n of [4104, 6000, 8191, 8199]) {
    const { principal, request, receipt } = commands[n];
    assert.deepEqual(region.dispatch(principal, request), receipt);
  }
  for (const n of [0, 4096, 4103]) {
    const { principal, request } = commands[n];
    assert.throws(() => region.dispatch(principal, request), /region-command-retired/);
  }
  assert.throws(() => region.dispatch("alice", input("future", 3)), /region-command-epoch-gap/);
  assert.throws(() => region.dispatch("alice", { id: "missing", command: { kind: "produce" } }));
  assert.equal(region.readCommitted().state.goods, 8200);
  assert.equal(region.readCommitted().revision, 8200);
  const record = region.readRecords(8200).records[0].bytes;
  assert.equal(new DataView(record.buffer, record.byteOffset, record.byteLength).getUint32(0, true), 8200);
});

test("retirement, physical writes, receipts and epoch advance roll back together at every SQL boundary", t => {
  const f = setup(t, { receipts: 2 });
  let region = f.open();
  const first = input("same", 0);
  const alice = region.dispatch("alice", first);
  const bob = region.dispatch("bob", first);
  assert.notDeepEqual(alice, bob);
  const before = region.readCommitted();
  const metadata = () => ({
    receipts: f.db.prepare("SELECT * FROM hive_region_receipts ORDER BY sequence").all(),
    region: f.db.prepare("SELECT * FROM hive_region").get(),
    replay: f.db.prepare("SELECT * FROM hive_region_replay").get(),
    records: f.db.prepare("SELECT * FROM hive_region_records").all(),
  });
  const saved = metadata();
  for (const sql of ["DELETE FROM hive_region_receipts", "UPDATE hive_region SET revision=", "INSERT OR REPLACE INTO hive_region_records", "INSERT INTO hive_region_receipts", "UPDATE hive_region_replay"]) {
    f.fail = sql;
    assert.throws(() => region.dispatch("alice", input("next", 1)), /injected-sql-failure/);
    f.fail = "";
    assert.deepEqual(metadata(), saved);
    region = f.restart();
    assert.deepEqual(region.readCommitted(), before);
    assert.deepEqual(region.dispatch("alice", first), alice);
  }
  assert.equal(region.dispatch("alice", input("next", 1)).result.goods, 3);
  assert.throws(() => region.dispatch("alice", first), /region-command-retired/);
  assert.deepEqual(region.dispatch("bob", first), bob);
  assert.throws(() => region.dispatch("bob", { ...first, expectedRevision: 0 }), /region-command-conflict/);
  assert.throws(() => region.dispatch("bob", input("never-admitted-old", 0)), /region-command-retired/);
  assert.equal(region.readCommitted().state.goods, 3);
});

test("rejected commands retain exact identity across rotation and unsupported or corrupt replay storage fails closed", t => {
  const f = setup(t, { receipts: 1 });
  let region = f.open();
  const request = { ...input("stale", 0), expectedRevision: 1 };
  const receipt = region.dispatch("alice", request);
  assert.equal(receipt.status, "rejected");
  region = f.restart();
  assert.deepEqual(region.dispatch("alice", request), receipt);
  assert.equal(region.readCommitted().state.goods, 0);
  region.dispatch("bob", input("same-next", 1));
  assert.throws(() => region.dispatch("alice", request), /region-command-retired/);
  f.db.exec("UPDATE hive_region_replay SET format_version=99");
  assert.throws(() => f.open(), /region-replay-frontier/);
  f.db.exec("UPDATE hive_region_replay SET format_version=1; UPDATE hive_region_receipts SET payload_bytes=0");
  assert.throws(() => f.open(), /region-replay-metadata/);
  f.db.exec("DROP TABLE hive_region_replay");
  assert.throws(() => f.open(), /region-replay-format/);
});
