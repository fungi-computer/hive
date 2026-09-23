import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initSync, WasmKernel } from "../../generated/hive_kernel.js";
import { openRegion } from "../../../src/engine/region/index.ts";
import { sqliteTestOwner } from "../../../src/engine/region/sqlite-test-owner.mjs";
import { createSessionRegionRuntime, type SessionResident } from "./region-program";
import { checkedStoredSession, hydrateSession } from "./session-record-store";
import { GameSession } from "./session";
import { wasmKernelPort } from "./wasm-kernel";
import { colonyPack, colonyServerPack } from "../games/colony";
import { entity, query } from "../sdk/authoring";
import { PartyMember } from "../sdk/party";
import { WorkParticipation } from "../sdk/work-control";
import { Worker } from "../games/colony-components";
import { ColonyTreePolicy } from "../games/colony-work";
import { JobTaskWork } from "../sdk/common";

function allRecords(region: ReturnType<typeof openRegion>, revision: number) {
  const records: { key: string; bytes: Uint8Array }[] = [];
  let afterKey = "";
  while (true) {
    const page = region.readRecords(revision, afterKey, 128);
    records.push(...page.records);
    if (!page.nextKey) return records;
    afterKey = page.nextKey;
  }
}
function recordReader(records: readonly { key: string; bytes: Uint8Array }[]) {
  const byKey = new Map(records.map(record => [record.key, record.bytes]));
  const ordered = [...records].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  return { read: (key: string) => byKey.get(key), records: () => ordered };
}

initSync({ module: readFileSync("engine/generated/hive_kernel_bg.wasm") });

test("server Region creates its initial session with explicit host authority", () => {
  const runtime = createSessionRegionRuntime({
    pack: colonyServerPack,
    createKernel: () => wasmKernelPort(new WasmKernel()),
    implementationHash: "0".repeat(64),
    ownerPrincipal: "player",
    hostPrincipal: "clock",
    seed: 17,
    scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : null,
  });
  const initial = runtime.program.initial();
  assert.equal(initial.state.session.game, colonyServerPack.id);
  assert.equal(initial.state.session.gameVersion, colonyServerPack.version);
  runtime.resident.dispose();
});

test("server Colony admits two starter parties into one generated world", () => {
  const port = wasmKernelPort(new WasmKernel());
  const session = new GameSession({
    port,
    pack: colonyServerPack,
    seed: 17,
    scope: { kind: "host" },
  });
  try {
    session.start();
    for (const bindingId of ["first-binding", "second-binding"]) {
      const identity = session.partyJoinIdentity(bindingId);
      assert.equal(identity.status, "available");
      const spawn = session.findSafeSpawn(colonyServerPack.partyJoin!.footprint);
      assert.ok(spawn, `${bindingId} has no safe spawn`);
      const plan = colonyServerPack.partyJoin!.prepare(spawn);
      session.request({
        kind: "instantiate-actors",
        bindingId,
        expectedSequence: identity.sequence,
        plan,
      });
      const outcome = session.step(0)[0];
      assert.equal(outcome?.accepted, true, `${bindingId}: ${outcome?.reason}`);
    }
  } finally {
    port.dispose();
  }
});

test("disconnected party residents remain eligible for automatic work while another principal advances the region", () => {
  const db = new DatabaseSync(":memory:");
  const owner = sqliteTestOwner(db);
  const runtime = createSessionRegionRuntime({
    pack: colonyServerPack,
    createKernel: () => wasmKernelPort(new WasmKernel()),
    implementationHash: "9".repeat(64),
    ownerPrincipal: "player:1",
    hostPrincipal: "clock",
    seed: 17,
    scopeForPrincipal: principal => principal === "clock"
      ? { kind: "host" }
      : principal === "player:1"
        ? { kind: "player", player: principal }
        : principal === "player:2"
          ? { kind: "player", player: principal }
          : null,
  });
  const resident = runtime.resident;
  const region = openRegion({ owner, region: "disconnected-resident-work", program: runtime.program });
  const dispatch = (principal: string, id: string, command: unknown) => {
    const committed = region.readCommitted();
    const records = allRecords(region, committed.revision);
    resident.begin(committed.revision, committed.state, recordReader(records));
    try {
      const receipt = region.dispatch(principal, { id, replayEpoch: region.readReplayWindow().epoch, command });
      resident.accept(receipt.revision);
      return receipt;
    } catch (error) {
      resident.discard();
      throw error;
    }
  };
  try {
    dispatch("clock", "join-1", { kind: "join-party", credentialBindingId: "binding-1" });
    dispatch("clock", "join-2", { kind: "join-party", credentialBindingId: "binding-2" });

    // The first player's connection ends after creating the order. Only the
    // independent clock principal advances the shared resident below.
    dispatch("player:1", "designate-1", { kind: "command", name: "designateTrees", input: { entities: ["colony.tree.oak"] } });
    for (let tick = 0; tick < 20; tick++) dispatch("clock", `clock-${tick}`, { kind: "step", delta: 0.1 });

    const committed = region.readCommitted();
    const records = allRecords(region, committed.revision);
    assert.deepEqual(
      resident.observe(committed.revision, committed.state, recordReader(records), session =>
        session.query(query(Worker, PartyMember, WorkParticipation)).filter(row => row.get(PartyMember).party === "party:1").map(row => row.id).sort()),
      ["party:1.person.0", "party:1.person.1"],
      "party residents survive without a player connection",
    );
    resident.observe(committed.revision, committed.state, recordReader(records), session => {
      const workers = session.query(query(Worker, PartyMember, WorkParticipation)).filter(row => row.get(PartyMember).party === "party:1");
      assert.equal(workers.length, 2);
      assert.ok(workers.every(row => row.get(WorkParticipation).automatic), "disconnected residents remain automatic workers");
      const tree = session.query(query(ColonyTreePolicy)).find(row => row.id === "colony.tree.oak")?.get(ColonyTreePolicy);
      assert.equal(tree?.designated, true, "the surviving party's designation remains committed");
      assert.equal(tree?.party, "party:1");
      assert.ok(tree?.job, "the designation retains its durable native job identity");
      assert.ok(session.query(query(JobTaskWork)).some(row => row.id.startsWith(`${tree?.job}:task:`)), "native job tasks survive without a player connection");
    });
  } finally {
    resident.dispose();
    db.close();
  }
});

test("actual Colony water records commit with session and recover after failed SQL", () => {
  const db = new DatabaseSync(":memory:");
  let failRecord = false;
  const owner = sqliteTestOwner(db, (statement: string) => {
    if (failRecord && statement.startsWith("INSERT INTO hive_region_records")) throw new Error("injected record failure");
  });
  const pack = colonyPack;
  const environment = JSON.parse(new TextDecoder().decode(pack.environmentDefinition));
  let resident!: SessionResident;
  const open = () => {
    if (resident) resident.dispose();
    const runtime = createSessionRegionRuntime({
      pack, createKernel: () => wasmKernelPort(new WasmKernel()), implementationHash: "a".repeat(64),
      ownerPrincipal: "player", hostPrincipal: "clock", seed: 17,
      scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : principal === "player" ? { kind: "player", player: principal } : null,
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
    resident.begin(committed.revision, committed.state, recordReader(allRecords(region, committed.revision)));
    try {
      const receipt = region.dispatch("clock", command);
      resident.accept(region.readCommitted().revision);
      return receipt;
    } catch (error) { resident.discard(); throw error; }
  };
  try {
    let region = open();
    const command = { id: "step-1", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } };
    const receipt = dispatch(region, command);
    assert.equal(receipt.status, "applied");
    assert.deepEqual(receipt.result, { tick: 2, paused: false, results: null }, "clock receipt does not duplicate internal action results");
    assert.equal(region.readCommitted().state.session.tick, 2, "fresh-world bootstrap and first simulation step are distinct commits");
    const saved = records(region);
    assert.ok(saved.some(record => record.key === "kernel/environment/water"));
    assert.equal(Object.hasOwn(region.readCommitted().state.session.kernel, "records"), false);
    assert.equal(region.readCommitted().state.session.version, 12);
    assert.equal(Object.hasOwn(region.readCommitted().state.session.kernel, "recordKeys"), false,
      "the SQL record table, not session JSON, owns the recovery inventory");
    region = open();
    assert.deepEqual(dispatch(region, command), receipt);
    assert.deepEqual(records(region), saved);
    const header = region.readCommitted();
    failRecord = true;
    const next = { id: "step-2", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } };
    assert.throws(() => dispatch(region, next), /injected record failure/);
    assert.deepEqual(region.readCommitted(), header);
    assert.deepEqual(records(region), saved);
    failRecord = false;
    region = open();
    assert.equal(dispatch(region, next).status, "applied");
    const current = region.readCommitted();
    const bytes = new Map(records(region).map(record => [record.key, record.bytes]));
    assert.equal(current.state.session.version, 12);
    assert.equal(Object.hasOwn(current.state.session.kernel, "recordKeys"), false);
    assert.throws(() => checkedStoredSession({ ...current.state.session, version: 11 }), /invalid stored session header/);
    assert.throws(() => checkedStoredSession({ ...current.state.session,
      kernel: { ...current.state.session.kernel, recordKeys: [...bytes.keys()] },
    }), /invalid stored session header/);
    const port = wasmKernelPort(new WasmKernel());
    try {
      const session = new GameSession({ port, pack, seed: 17 });
      const inventory = [...bytes].map(([key, value]) => ({ key, bytes: value }));
      session.restore(hydrateSession(current.state.session, recordReader(inventory)));
      assert.equal(session.simulationTime, 0.2);
      const saved = session.save();
      const otherPort = wasmKernelPort(new WasmKernel());
      try {
        const incompatible = new GameSession({ port: otherPort, pack: { ...pack,
          environmentDefinition: new TextEncoder().encode(JSON.stringify({ ...environment, world: { ...environment.world, seed: "other-seed" } })) }, seed: 17 });
        incompatible.start();
        const previous = incompatible.save();
        assert.throws(() => incompatible.restore(saved), /environment definitions do not match/);
        assert.deepEqual(incompatible.save(), previous);
      } finally { otherPort.dispose(); }
      assert.ok((port.environmentFacts() as { totalKg: number }).totalKg > 0);
    } finally { port.dispose(); }
    const valid = allRecords(region, current.revision);
    const omittedEntity = valid.filter(record => record.key !== valid.find(row => row.key.startsWith("kernel/state/entities/"))?.key);
    const orphanGeometry = [...valid, { key: "kernel/state/paths/orphan/p/0000", bytes: new TextEncoder().encode("[]") }];
    const corruptWater = valid.map(record => record.key === "kernel/environment/water"
      ? { ...record, bytes: new Uint8Array([255, 0, 1]) }
      : record);
    for (const damaged of [omittedEntity, orphanGeometry, corruptWater]) {
      const damagedPort = wasmKernelPort(new WasmKernel());
      try {
        const damagedSession = new GameSession({ port: damagedPort, pack, seed: 17 });
        assert.throws(() => damagedSession.restore(hydrateSession(current.state.session, recordReader(damaged))));
      } finally { damagedPort.dispose(); }
    }
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
      return { ...port, dispose: () => { disposed++; release(); } };
    },
    implementationHash: "c".repeat(64), ownerPrincipal: "player", hostPrincipal: "clock", seed: 17,
    scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : principal === "player" ? { kind: "player", player: principal } : null,
  });
  const region = openRegion({ owner, region: "outer-resident", program: runtime.program });
  const reader = (revision: number) => {
    return recordReader(allRecords(region, revision));
  };
  const first = { id: "first", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } };
  const second = { id: "second", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } };
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
    scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : principal === "player" ? { kind: "player", player: principal } : null,
  });
  const resident = runtime.resident;
  const region = openRegion({ owner, region: "resident-colony", program: runtime.program });
  let recordReads = 0;
  const reader = (revision: number) => {
    let records: Map<string, Uint8Array> | undefined;
    const load = () => {
      if (!records) records = new Map(allRecords(region, revision).map(record => [record.key, record.bytes]));
      return records;
    };
    return {
      read: (key: string) => { recordReads++; return load().get(key); },
      records: () => { recordReads++; return [...load()].map(([key, bytes]) => ({ key, bytes })).sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0); },
    };
  };
  try {
    const first = region.readCommitted();
    resident.begin(first.revision, first.state, reader(first.revision));
    const firstReceipt = region.dispatch("clock", { id: "resident-1", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } });
    resident.accept(firstReceipt.revision);
    const afterFirst = region.readCommitted();
    const beforeReuse = created;
    const readsBeforeReuse = recordReads;
    resident.begin(afterFirst.revision, afterFirst.state, reader(afterFirst.revision));
    const second = region.dispatch("clock", { id: "resident-2", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } });
    resident.accept(second.revision);
    assert.equal(created, beforeReuse);
    assert.equal(recordReads, readsBeforeReuse);
    const replayed = region.readCommitted();
    resident.begin(replayed.revision, replayed.state, reader(replayed.revision));
    assert.deepEqual(region.dispatch("clock", { id: "resident-2", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } }), second);
    resident.accept(replayed.revision);
    assert.equal(region.readCommitted().revision, replayed.revision);
    assert.equal(resident.observe(replayed.revision, replayed.state, reader(replayed.revision), session => session.simulationTime), 0.2);
    assert.equal(resident.observe(second.revision, region.readCommitted().state, reader(second.revision), session => session.simulationTime), 0.2);
    const batch = region.readCommitted();
    resident.begin(batch.revision, batch.state, reader(batch.revision));
    for (const id of ["resident-3", "resident-4", "resident-5"])
      region.dispatch("clock", { id, replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } });
    resident.accept(region.readCommitted().revision);
    assert.equal(resident.observe(5, region.readCommitted().state, reader(5), session => session.simulationTime), 0.5);
    const current = region.readCommitted();
    resident.begin(current.revision, current.state, reader(current.revision));
    assert.throws(() => resident.accept(current.revision + 1), /resident-revision-mismatch/);
    const failed = region.readCommitted();
    resident.begin(failed.revision, failed.state, reader(failed.revision));
    assert.throws(() => region.dispatch("player", { id: "resident-failure", replayEpoch: region.readReplayWindow().epoch, command: { kind: "command", name: "missing" } }), /unknown game command/);
    assert.ok(created > beforeReuse);
  } finally {
    resident.dispose();
    db.close();
  }
});

test("resident detaches failed native candidates and preserves primary errors", () => {
  const db = new DatabaseSync(":memory:");
  const owner = sqliteTestOwner(db);
  let failDispose = false;
  let created = 0;
  let disposals = 0;
  const runtime = createSessionRegionRuntime({
    pack: colonyPack,
    createKernel: () => {
      created++;
      const port = wasmKernelPort(new WasmKernel());
      const release = port.dispose;
      return {
        ...port,
        dispose: () => {
          disposals++;
          if (failDispose) throw new Error("native dispose failed");
          release();
        },
      };
    },
    implementationHash: "d".repeat(64),
    ownerPrincipal: "player",
    hostPrincipal: "clock",
    seed: 17,
    scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : principal === "player" ? { kind: "player", player: principal } : null,
  });
  const resident = runtime.resident;
  const region = openRegion({ owner, region: "resident-failure-cleanup", program: runtime.program });
  const disposalsBeforeResident = disposals;
  const reader = (revision: number) => {
    return recordReader(allRecords(region, revision));
  };
  try {
    const committed = region.readCommitted();
    resident.begin(committed.revision, committed.state, reader(committed.revision));
    failDispose = true;
    assert.throws(
      () => region.dispatch("player", { id: "poisoned", replayEpoch: region.readReplayWindow().epoch, command: { kind: "command", name: "missing" } }),
      /unknown game command/,
      "native cleanup must not replace the command error",
    );
    assert.equal(disposals, disposalsBeforeResident + 1);

    // The failed candidate was detached even though its destructor threw;
    // retrying starts from the committed revision in a fresh native port.
    resident.begin(committed.revision, committed.state, reader(committed.revision));
    assert.equal(created, 3);
    const receipt = region.dispatch("clock", { id: "retry", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } });
    resident.accept(receipt.revision);
    assert.equal(region.readCommitted().revision, 1);

    // Explicit lifecycle cleanup still reports its own disposal failure.
    resident.begin(1, region.readCommitted().state, reader(1));
    resident.accept(1);
    assert.throws(() => resident.dispose(), /native dispose failed/);
    failDispose = false;
  } finally {
    failDispose = false;
    resident.dispose();
    db.close();
  }
});

test("resident preserves an undefined application failure during cleanup", () => {
  const db = new DatabaseSync(":memory:");
  const owner = sqliteTestOwner(db);
  let failDispose = false;
  let disposals = 0;
  const runtime = createSessionRegionRuntime({
    pack: colonyPack,
    createKernel: () => {
      const port = wasmKernelPort(new WasmKernel());
      const release = port.dispose;
      return {
        ...port,
        dispose: () => {
          disposals++;
          if (failDispose) throw new Error("native dispose failed");
          release();
        },
      };
    },
    implementationHash: "e".repeat(64),
    ownerPrincipal: "player",
    hostPrincipal: "clock",
    seed: 17,
    scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : principal === "player" ? { kind: "player", player: principal } : null,
  });
  const resident = runtime.resident;
  const region = openRegion({ owner, region: "resident-undefined-failure", program: runtime.program });
  const disposalsBeforeResident = disposals;
  const committed = region.readCommitted();
  const records = allRecords(region, committed.revision);
  const reader = recordReader(records);
  try {
    resident.begin(committed.revision, committed.state, reader);
    resident.accept(committed.revision);
    failDispose = true;
    let threw = false;
    try {
      resident.observe(committed.revision, committed.state, reader, () => {
        throw undefined;
      });
    } catch (error) {
      threw = true;
      assert.equal(error, undefined);
    }
    assert.equal(threw, true);
    assert.equal(disposals, disposalsBeforeResident + 1);
  } finally {
    failDispose = false;
    resident.dispose();
    db.close();
  }
});

test("initial resident program preserves start failure when native disposal throws", () => {
  const db = new DatabaseSync(":memory:");
  const owner = sqliteTestOwner(db);
  let disposals = 0;
  const runtime = createSessionRegionRuntime({
    pack: colonyPack,
    createKernel: () => {
      const port = wasmKernelPort(new WasmKernel());
      return {
        ...port,
        load: () => { throw new Error("initial load failed"); },
        dispose: () => {
          disposals++;
          throw new Error("native dispose failed");
        },
      };
    },
    implementationHash: "f".repeat(64),
    ownerPrincipal: "player",
    hostPrincipal: "clock",
    seed: 17,
    scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : principal === "player" ? { kind: "player", player: principal } : null,
  });
  try {
    assert.throws(
      () => openRegion({ owner, region: "resident-initial-failure", program: runtime.program }),
      /initial load failed/,
    );
    assert.equal(disposals, 1);
  } finally {
    runtime.resident.dispose();
    db.close();
  }
});

test("explicit clock controllers can pause/resume without gaining physical host authority", () => {
  const controllers = ["player", "unbound"];
  const options = {
    pack: colonyPack,
    createKernel: () => wasmKernelPort(new WasmKernel()),
    implementationHash: "8".repeat(64), ownerPrincipal: "player", hostPrincipal: "clock", seed: 17,
    scopeForPrincipal: (principal: string) => principal === "clock" ? { kind: "host" as const }
      : ["player", "other"].includes(principal) ? { kind: "player" as const, player: principal } : null,
  };
  const configured = createSessionRegionRuntime({ ...options, clockControllerPrincipals: controllers });
  const ordinary = createSessionRegionRuntime(options);
  controllers.push("other");
  try {
    for (const kind of ["pause", "resume"] as const) {
      const command = configured.program.parseCommand({ kind });
      assert.equal(configured.program.authorize("player", command), true);
      assert.equal(configured.program.authorize("clock", command), true);
      assert.equal(configured.program.authorize("other", command), false, "permission list is copied at composition");
      assert.equal(configured.program.authorize("unbound", command), false, "permission cannot authenticate a principal");
      assert.equal(ordinary.program.authorize("player", command), false, "ordinary worlds retain existing policy");
    }
    for (const input of [
      { kind: "step", delta: 0.1 },
      { kind: "join-party", credentialBindingId: "new-party" },
      { kind: "action", action: { kind: "cancel-job", id: "job" } },
    ]) {
      const command = configured.program.parseCommand(input);
      assert.equal(configured.program.authorize("player", command), false);
      assert.equal(configured.program.authorize("clock", command), true);
    }
  } finally { configured.resident.dispose(); ordinary.resident.dispose(); }
});


for (const failure of ["advance", "capture"] as const) {
  test(`disposable Region ${failure} failure preserves world, command receipts and clock frontier`, () => {
    const db = new DatabaseSync(":memory:");
    const owner = sqliteTestOwner(db);
    let fail = false;
    let candidates = 0;
    let ordinary = 0;
    let disposed = 0;
    let runtime!: ReturnType<typeof createSessionRegionRuntime>;
    const open = () => {
      runtime?.resident.dispose();
      runtime = createSessionRegionRuntime({
        pack: colonyPack,
        createKernel: () => {
          const port = wasmKernelPort(new WasmKernel());
          return { ...port,
            advance: (...args) => { ordinary++; return port.advance(...args); },
            advanceCandidate: (...args) => {
              candidates++;
              const result = port.advanceCandidate(...args);
              if (fail && failure === "advance") throw new Error("injected candidate failure");
              return result;
            },
            capture: () => {
              const captured = port.capture();
              if (fail && failure === "capture") throw new Error("injected candidate failure");
              return captured;
            },
            dispose: () => { disposed++; port.dispose(); },
          };
        },
        implementationHash: "e".repeat(64), ownerPrincipal: "player", hostPrincipal: "clock", seed: 17,
        scopeForPrincipal: principal => principal === "clock" ? { kind: "host" } : { kind: "player", player: principal },
      });
      return openRegion({ owner, region: "disposable", program: runtime.program, clock: { principal: "clock" } });
    };
    let region = open();
    const records = () => allRecords(region, region.readCommitted().revision);
    const begin = () => {
      const committed = region.readCommitted();
      const bytes = new Map(records().map(record => [record.key, record.bytes]));
      runtime.resident.begin(committed.revision, committed.state, recordReader([...bytes].map(([key, value]) => ({ key, bytes: value }))));
    };
    const command = { id: "step-command", replayEpoch: region.readReplayWindow().epoch, command: { kind: "step", delta: 0.1 } };
    const occurrence = { sequence: 0, request: { id: "clock-1", command: { kind: "step", delta: 0.1 } } };
    try {
      const before = region.readCommitted();
      const beforeRecords = records();
      const beforeClock = db.prepare("SELECT * FROM hive_region_clock").all();
      const ordinaryBefore = ordinary;
      for (const dispatch of [() => region.dispatch("clock", command), () => region.dispatchOccurrence("clock", occurrence)]) {
        begin();
        assert.throws(() => runtime.resident.observe(before.revision, before.state, { read: () => undefined, records: () => [] }, () => {}), /resident-attempt-active/);
        const disposedBefore = disposed;
        fail = true;
        assert.throws(dispatch, /injected candidate failure/);
        assert.equal(disposed, disposedBefore + 1);
        assert.deepEqual(region.readCommitted(), before);
        assert.deepEqual(records(), beforeRecords);
        assert.deepEqual(db.prepare("SELECT * FROM hive_region_clock").all(), beforeClock);
      }
      assert.equal(ordinary, ordinaryBefore, "only initialization uses ordinary rollback");
      assert.equal(candidates, 2);
      fail = false;
      region = open(); // reconstruct from committed storage after both partial failures
      begin();
      const receipt = region.dispatch("clock", command);
      runtime.resident.accept(receipt.revision);
      begin();
      const clockReceipt = region.dispatchOccurrence("clock", occurrence);
      runtime.resident.accept(clockReceipt.revision);
      const saved = records();
      region = open();
      begin();
      assert.deepEqual(region.dispatch("clock", command), receipt);
      assert.deepEqual(region.dispatchOccurrence("clock", occurrence), clockReceipt);
      runtime.resident.accept(region.readCommitted().revision);
      assert.deepEqual(records(), saved);
      assert.equal(region.readCommitted().revision, 2);
    } finally { runtime!.resident.dispose(); db.close(); }
  });
}
