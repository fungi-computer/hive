import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { openRegion } from "../../../src/engine/region/index.ts";
import { sqliteTestOwner } from "../../../src/engine/region/sqlite-test-owner.mjs";
import { createSessionRegionRuntime, type SessionResident } from "./region-program";
import { hydrateSession } from "./session-record-store";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { colonyPack } from "../games/colony";
import { environmentFixture } from "./fixtures/environment";

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("actual Colony water records commit with session and recover after failed SQL", () => {
  const db = new DatabaseSync(":memory:");
  let failRecord = false;
  const owner = sqliteTestOwner(db, (statement: string) => {
    if (failRecord && statement.startsWith("INSERT OR REPLACE INTO hive_region_records")) throw new Error("injected record failure");
  });
  const pack = { ...colonyPack, environmentDefinition: new TextEncoder().encode(JSON.stringify(environmentFixture)) };
  let resident!: SessionResident;
  const open = () => {
    if (resident) resident.dispose();
    const runtime = createSessionRegionRuntime({
      pack, createKernel: () => wasmKernelPort(new WasmKernel()), implementationHash: "a".repeat(64),
      ownerPrincipal: "player", hostPrincipal: "clock", seed: 17,
    });
    resident = runtime.resident;
    return openRegion({ owner, region: "wet-colony", program: runtime.program });
  };
  const records = (region: ReturnType<typeof open>) => {
    const { revision } = region.readCommitted();
    return region.readRecords(revision).records;
  };
  const dispatch = (region: ReturnType<typeof open>, command: unknown) => {
    const committed = region.readCommitted();
    const page = region.readRecords(committed.revision, "", 40);
    resident.begin(committed.revision, committed.state, { read: key => page.records.find(record => record.key === key)?.bytes });
    try {
      const receipt = region.dispatch("clock", command);
      resident.accept(region.readCommitted().revision);
      return receipt;
    } catch (error) { resident.discard(); throw error; }
  };
  try {
    let region = open();
    const command = { id: "step-1", command: { kind: "step", delta: 0.1 } };
    const receipt = dispatch(region, command);
    assert.equal(receipt.status, "applied");
    assert.equal(region.readCommitted().state.session.tick, 1);
    const saved = records(region);
    assert.ok(saved.some(record => record.key === "kernel/environment/water"));
    assert.equal(Object.hasOwn(region.readCommitted().state.session.kernel, "records"), false);
    region = open();
    assert.deepEqual(dispatch(region, command), receipt);
    assert.deepEqual(records(region), saved);
    const header = region.readCommitted();
    failRecord = true;
    const next = { id: "step-2", command: { kind: "step", delta: 0.1 } };
    assert.throws(() => dispatch(region, next), /injected record failure/);
    assert.deepEqual(region.readCommitted(), header);
    assert.deepEqual(records(region), saved);
    failRecord = false;
    region = open();
    assert.equal(dispatch(region, next).status, "applied");
    const current = region.readCommitted();
    const bytes = new Map(records(region).map(record => [record.key, record.bytes]));
    const port = wasmKernelPort(new WasmKernel());
    try {
      const session = new GameSession({ port, pack, seed: 17 });
      session.restore(hydrateSession(current.state.session, { read: key => bytes.get(key) }));
      assert.equal(session.simulationTime, 0.2);
      const saved = session.save();
      const otherPort = wasmKernelPort(new WasmKernel());
      try {
        const incompatible = new GameSession({ port: otherPort, pack: { ...pack,
          environmentDefinition: new TextEncoder().encode(JSON.stringify({ ...environmentFixture, world: { ...environmentFixture.world, seed: "other-seed" } })) }, seed: 17 });
        incompatible.start();
        const previous = incompatible.save();
        assert.throws(() => incompatible.restore(saved), /environment definitions do not match/);
        assert.deepEqual(incompatible.save(), previous);
      } finally { otherPort.dispose(); }
      assert.ok((port.environmentFacts() as { totalKg: number }).totalKg > 0);
    } finally { port.dispose(); }
  } finally { resident?.dispose(); db.close(); }
});

test("resident discards rolled-back multi-command work and accepts historical replay at current revision", () => {
  const db = new DatabaseSync(":memory:");
  const owner = sqliteTestOwner(db);
  // Native SQLite savepoints exercise the resident lifecycle, not DO alarms.
  let savepoint = 0;
  owner.transactionSync = operation => {
    const name = `resident_${savepoint++}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
      const value = operation();
      db.exec(`RELEASE ${name}`);
      return value;
    } catch (error) {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
      throw error;
    }
  };
  let disposed = 0;
  const runtime = createSessionRegionRuntime({ pack: colonyPack,
    createKernel: () => {
      const port = wasmKernelPort(new WasmKernel());
      const release = port.dispose;
      port.dispose = () => { disposed++; release(); };
      return port;
    },
    implementationHash: "c".repeat(64), ownerPrincipal: "player", hostPrincipal: "clock", seed: 17,
  });
  const region = openRegion({ owner, region: "outer-resident", program: runtime.program });
  const reader = (revision: number) => {
    const records = new Map(region.readRecords(revision, "", 40).records.map(record => [record.key, record.bytes]));
    return { read: (key: string) => records.get(key) };
  };
  const first = { id: "first", command: { kind: "step", delta: 0.1 } };
  const second = { id: "second", command: { kind: "step", delta: 0.1 } };
  try {
    const before = region.readCommitted();
    const bytes = region.readRecords(before.revision).records;
    assert.throws(() => owner.transactionSync(() => {
      runtime.resident.begin(before.revision, before.state, reader(before.revision));
      region.dispatch("clock", first);
      region.dispatch("clock", second);
      throw new Error("outer commit failed");
    }), /outer commit failed/);
    assert.deepEqual(region.readCommitted(), before);
    assert.deepEqual(region.readRecords(before.revision).records, bytes);
    const disposedBeforeRetry = disposed;
    // A retried storage callback begins afresh even without a host catch between callbacks.
    runtime.resident.begin(before.revision, before.state, reader(before.revision));
    assert.equal(disposed, disposedBeforeRetry + 1);
    const receipt = owner.transactionSync(() => {
      const result = region.dispatch("clock", first);
      region.dispatch("clock", second);
      return result;
    });
    runtime.resident.accept(region.readCommitted().revision);
    const current = region.readCommitted();
    assert.equal(current.revision, 2);
    assert.equal(runtime.resident.observe(2, current.state, reader(2), session => session.simulationTime), 0.2);
    runtime.resident.begin(2, current.state, reader(2));
    assert.deepEqual(region.dispatch("clock", first), receipt);
    runtime.resident.accept(region.readCommitted().revision);
    assert.equal(runtime.resident.observe(2, current.state, reader(2), session => session.simulationTime), 0.2);
  } finally { runtime.resident.dispose(); db.close(); }
});

test("resident session reuses accepted candidate and fails closed across retry and observation", () => {
  const db = new DatabaseSync(":memory:");
  let created = 0;
  const owner = sqliteTestOwner(db);
  const pack = colonyPack;
  const createKernel = () => {
    created++;
    return wasmKernelPort(new WasmKernel());
  };
  const runtime = createSessionRegionRuntime({
    pack,
    createKernel,
    implementationHash: "b".repeat(64),
    ownerPrincipal: "player",
    hostPrincipal: "clock",
    seed: 17,
  });
  const resident = runtime.resident;
  const region = openRegion({ owner, region: "resident-colony", program: runtime.program });
  let recordReads = 0;
  const reader = (revision: number) => {
    let records: Map<string, Uint8Array> | undefined;
    return { read: (key: string) => {
      recordReads++;
      if (!records) records = new Map(region.readRecords(revision, "", 40).records.map(record => [record.key, record.bytes]));
      return records.get(key);
    } };
  };
  try {
    const first = region.readCommitted();
    resident.begin(first.revision, first.state, reader(first.revision));
    const firstReceipt = region.dispatch("clock", { id: "resident-1", command: { kind: "step", delta: 0.1 } });
    resident.accept(firstReceipt.revision);
    const afterFirst = region.readCommitted();
    const beforeReuse = created;
    const readsBeforeReuse = recordReads;
    resident.begin(afterFirst.revision, afterFirst.state, reader(afterFirst.revision));
    const second = region.dispatch("clock", { id: "resident-2", command: { kind: "step", delta: 0.1 } });
    resident.accept(second.revision);
    assert.equal(created, beforeReuse);
    assert.equal(recordReads, readsBeforeReuse);
    assert.equal(resident.observe(second.revision, region.readCommitted().state, reader(second.revision), session => session.simulationTime), 0.2);
    const batch = region.readCommitted();
    resident.begin(batch.revision, batch.state, reader(batch.revision));
    for (const id of ["resident-3", "resident-4", "resident-5"])
      region.dispatch("clock", { id, command: { kind: "step", delta: 0.1 } });
    resident.accept(region.readCommitted().revision);
    assert.equal(resident.observe(5, region.readCommitted().state, reader(5), session => session.simulationTime), 0.5);
    const current = region.readCommitted();
    resident.begin(current.revision, current.state, reader(current.revision));
    assert.throws(() => resident.accept(current.revision + 1), /resident-revision-mismatch/);
    const failed = region.readCommitted();
    resident.begin(failed.revision, failed.state, reader(failed.revision));
    assert.throws(() => region.dispatch("clock", { id: "resident-failure", command: { kind: "command", name: "missing" } }), /unknown game command/);
    assert.ok(created > beforeReuse);
  } finally {
    resident.dispose();
    db.close();
  }
});
