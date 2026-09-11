import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openRegion } from "./index.ts";
import { sqliteTestOwner } from "./sqlite-test-owner.mjs";
import { createQuarryRegionProgram } from "../../world-presets/excavation-region.ts";

function fixture(t, limits, program = createQuarryRegionProgram) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let failReceipt = false;
  let failRecord = false;
  const owner = sqliteTestOwner(db, (statement) => {
    if (failReceipt && statement.startsWith("INSERT INTO hive_region_receipts"))
      throw new Error("injected-storage-failure");
    if (failRecord && statement.startsWith("INSERT OR REPLACE INTO hive_region_records"))
      throw new Error("injected-record-failure");
  });
  const open = (policy = limits, clockPrincipal) =>
    openRegion({
      owner,
      region: "quarry-1",
      program: program(),
      limits: policy,
      ...(clockPrincipal ? { clock: { principal: clockPrincipal } } : {}),
    });
  return {
    open,
    db,
    failReceipt(value) {
      failReceipt = value;
    },
    failRecord(value) {
      failRecord = value;
    },
  };
}
const dig = (id = "dig-a", expectedRevision = 0, x = 0) => ({
  id,
  expectedRevision,
  command: { kind: "excavate", at: { x, y: -1, z: 0 } },
});
const principal = "quarry-builder";

test("one SQL commit preserves excavation, material ID, scoped receipt and ordered event through reconstruction", (t) => {
  const f = fixture(t),
    region = f.open();
  const receipt = region.dispatch(principal, dig());
  assert.equal(receipt.status, "applied");
  const committed = region.readCommitted();
  assert.equal(committed.state.excavated, 1);
  assert.equal(committed.state.materials.state.lots[0].id, receipt.result.lot);
  assert.equal(committed.state.materials.state.lots[0].quantity, 1);
  const events = region.readEvents(0);
  assert.equal(events.length, 1);
  const reopened = f.open();
  assert.deepEqual(reopened.readCommitted(), committed);
  assert.deepEqual(reopened.dispatch(principal, dig()), receipt);
  assert.deepEqual(reopened.readEvents(0), events);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM hive_region_receipts").get().n,
    1,
  );
  assert.equal(reopened.readEvents(events[0].sequence).length, 0);
});

test("native rollback after state, event and receipt writes leaves no physical effect or allocator advance", (t) => {
  const f = fixture(t),
    region = f.open(),
    before = region.readCommitted();
  f.failReceipt(true);
  assert.throws(
    () => region.dispatch(principal, dig()),
    /injected-storage-failure/,
  );
  assert.deepEqual(region.readCommitted(), before);
  assert.deepEqual(region.readEvents(0), []);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM hive_region_receipts").get().n,
    0,
  );
  f.failReceipt(false);
  const accepted = region.dispatch(principal, dig());
  assert.equal(accepted.result.lot, "lot-1");
  assert.equal(accepted.revision, 1);
});

test("conflicting retries, stale commands, forbidden principals and content-specific refusal cannot create extra goods", (t) => {
  const f = fixture(t),
    region = f.open();
  region.dispatch(principal, dig());
  assert.throws(
    () => region.dispatch(principal, dig("dig-a", 0, 1)),
    /region-command-conflict/,
  );
  const stale = region.dispatch(principal, dig("stale", 0, 1));
  assert.equal(stale.status, "rejected");
  assert.deepEqual(stale.result, { reason: "stale-revision" });
  assert.deepEqual(f.open().dispatch(principal, dig("stale", 0, 1)), stale);
  assert.throws(
    () => region.dispatch("spectator", dig("forbidden", 1, 1)),
    /region-forbidden/,
  );
  const hard = dig("tungsten", 1, 1);
  hard.command.at.y = -7;
  assert.deepEqual(region.dispatch(principal, hard).result, {
    reason: "tool-insufficient",
  });
  assert.equal(region.readCommitted().state.excavated, 1);
  assert.equal(region.readEvents(0).length, 1);
});

test("retention exhaustion rejects new intake without forgetting replay or partially committing resources", (t) => {
  const f = fixture(t, { receipts: 2, events: 1 }),
    region = f.open();
  const receipt = region.dispatch(principal, dig());
  assert.throws(
    () => region.dispatch(principal, dig("capacity", 1, 1)),
    /region-event-capacity/,
  );
  assert.equal(region.readCommitted().state.excavated, 1);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM hive_region_receipts").get().n,
    1,
  );
  region.dispatch(principal, dig("stale", 0, 1));
  assert.throws(
    () => region.dispatch(principal, dig("full", 1, 1)),
    /region-receipt-capacity/,
  );
  assert.deepEqual(region.dispatch(principal, dig()), receipt);
});

test("checked input canonicalization and returned snapshots do not change stored state or replay identity", (t) => {
  const f = fixture(t),
    region = f.open();
  const receipt = region.dispatch(principal, dig());
  const rearranged = {
    command: { at: { z: 0, y: -1, x: 0 }, kind: "excavate" },
    expectedRevision: 0,
    id: "dig-a",
  };
  assert.deepEqual(region.dispatch(principal, rearranged), receipt);
  const projection = region.readCommitted();
  projection.state.materials.state.lots[0].quantity = 99;
  const events = region.readEvents(0);
  events[0].event.payload.quantity = 99;
  assert.equal(
    region.readCommitted().state.materials.state.lots[0].quantity,
    1,
  );
  assert.equal(region.readEvents(0)[0].event.payload.quantity, 1);
  assert.throws(() =>
    region.dispatch(principal, { ...dig("bad", 1, 1), extra: true }),
  );
});

test("a lost acknowledgement replays after the completed action changes current eligibility", (t) => {
  const f = fixture(t, undefined, () => ({
    ...createQuarryRegionProgram(),
    id: "one-excavation-permit-v1",
    authorize: (who, _command, state) =>
      who === principal && state.excavated === 0,
  }));
  const receipt = f.open().dispatch(principal, dig());
  assert.deepEqual(f.open().dispatch(principal, dig()), receipt);
  assert.throws(
    () => f.open().dispatch(principal, dig("new", 1, 1)),
    /region-forbidden/,
  );
});

test("authorization cannot change the candidate or command that gets committed", (t) => {
  const f = fixture(t, undefined, () => ({
    ...createQuarryRegionProgram(),
    id: "authorization-isolation-v1",
    authorize: (_who, command, state) => {
      command.at.x = 3;
      state.excavated = 31;
      return true;
    },
  }));
  const receipt = f.open().dispatch(principal, dig());
  assert.equal(receipt.result.at.x, 0);
  assert.equal(f.open().readCommitted().state.excavated, 1);
  assert.deepEqual(f.open().dispatch(principal, dig()), receipt);
});

test("aggregate encoded payload budget rolls back a transition even when individual rows fit", (t) => {
  const f = fixture(t, { storageBytes: 2048 }, () => {
    const program = createQuarryRegionProgram();
    return {
      ...program,
      id: "large-receipt-v1",
      execute: (state, command) => {
        const transition = program.execute(state, command);
        return {
          ...transition,
          result: { ...transition.result, explanation: "x".repeat(1900) },
        };
      },
    };
  });
  const before = f.open().readCommitted();
  assert.throws(
    () => f.open().dispatch(principal, dig()),
    /region-storage-budget/,
  );
  assert.deepEqual(f.open().readCommitted(), before);
  assert.equal(f.open().readEvents(0).length, 0);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) AS n FROM hive_region_receipts").get().n,
    0,
  );
});

test("cold reopen cannot silently change the persisted admission and replay budgets", (t) => {
  const f = fixture(t, { receipts: 2 });
  const receipt = f.open().dispatch(principal, dig());
  assert.throws(() => f.open({ receipts: 4096 }), /region-policy-conflict/);
  assert.throws(
    () => f.open({ receipts: 2, commandBytes: 256 }),
    /region-policy-conflict/,
  );
  assert.throws(
    () => f.open({ receipts: 2, resultBytes: 256 }),
    /region-policy-conflict/,
  );
  assert.deepEqual(f.open().dispatch(principal, dig()), receipt);
});

test("registered host occurrences advance one durable frontier with exact replay and no gaps", (t) => {
  const clockPrincipal = "quarry-clock";
  const f = fixture(t, undefined, () => {
    const program = createQuarryRegionProgram();
    return {
      ...program,
      id: "quarry-clock-v1",
      authorize: (who, command, state) =>
        who === clockPrincipal
          ? program.authorize(principal, command, state)
          : program.authorize(who, command, state),
    };
  });
  const region = f.open(undefined, clockPrincipal);
  const occurrence = (sequence, id, expectedRevision = sequence, x = 0) => ({
    sequence,
    request: dig(id, expectedRevision, x),
  });
  const first = region.dispatchOccurrence(
    clockPrincipal,
    occurrence(0, "clock-0", 0),
  );
  assert.equal(first.status, "applied");
  const afterFirst = region.readCommitted();
  assert.equal(afterFirst.revision, 1);
  assert.deepEqual(
    region.dispatchOccurrence(clockPrincipal, occurrence(0, "clock-0", 0)),
    first,
  );
  assert.deepEqual(region.readCommitted(), afterFirst);
  assert.throws(
    () =>
      region.dispatchOccurrence(
        clockPrincipal,
        occurrence(0, "clock-conflict", 0, 1),
      ),
    /region-clock-conflict/,
  );
  assert.deepEqual(region.readCommitted(), afterFirst);
  assert.throws(
    () =>
      region.dispatchOccurrence(clockPrincipal, occurrence(2, "clock-gap", 1)),
    /region-clock-gap/,
  );
  const second = region.dispatchOccurrence(
    clockPrincipal,
    occurrence(1, "clock-1", 1, 1),
  );
  assert.equal(second.status, "applied");
  assert.equal(region.readCommitted().revision, 2);
  assert.throws(
    () =>
      region.dispatchOccurrence(clockPrincipal, occurrence(0, "clock-0", 0)),
    /region-clock-retired/,
  );
  const reopened = f.open(undefined, clockPrincipal);
  assert.deepEqual(
    reopened.dispatchOccurrence(clockPrincipal, occurrence(1, "clock-1", 1, 1)),
    second,
  );
  assert.throws(
    () => f.open(undefined, "another-clock"),
    /region-clock-settings-conflict/,
  );
  assert.throws(
    () =>
      reopened.dispatchOccurrence("quarry-builder", occurrence(2, "wrong", 2)),
    /region-clock-forbidden/,
  );
  const player = reopened.dispatch(principal, dig("ordinary", 2, 2));
  assert.equal(player.status, "applied");
});

test("reopen rejects a corrupted current clock frontier instead of guessing replay authority", (t) => {
  const clockPrincipal = "quarry-clock";
  const f = fixture(t, undefined, () => {
    const program = createQuarryRegionProgram();
    return {
      ...program,
      id: "quarry-clock-corrupt-v1",
      authorize: (who, command, state) =>
        who === clockPrincipal
          ? program.authorize(principal, command, state)
          : program.authorize(who, command, state),
    };
  });
  const region = f.open(undefined, clockPrincipal);
  region.dispatchOccurrence(clockPrincipal, {
    sequence: 0,
    request: dig("clock-0", 0),
  });
  f.db
    .prepare(
      "UPDATE hive_region_clock SET last_request_json=NULL WHERE singleton=1",
    )
    .run();
  assert.throws(
    () => f.open(undefined, clockPrincipal),
    /region-clock-frontier/,
  );
});

test("clock frontier storage overflow rolls back state, events, and occurrence identity", (t) => {
  const clockPrincipal = "quarry-clock";
  const f = fixture(t, { storageBytes: 4096 }, () => {
    const program = createQuarryRegionProgram();
    return {
      ...program,
      id: "quarry-clock-overflow-v1",
      authorize: (who, command, state) =>
        who === clockPrincipal
          ? program.authorize(principal, command, state)
          : program.authorize(who, command, state),
      execute: (state, command) => ({
        ...program.execute(state, command),
        events: [{ kind: "oversized", blob: "x".repeat(3500) }],
      }),
    };
  });
  const region = f.open(undefined, clockPrincipal);
  const before = region.readCommitted();
  assert.throws(
    () =>
      region.dispatchOccurrence(clockPrincipal, {
        sequence: 0,
        request: dig("overflow", 0),
      }),
    /region-storage-budget/,
  );
  assert.deepEqual(region.readCommitted(), before);
  assert.deepEqual(region.readEvents(0), []);
  assert.throws(
    () =>
      region.dispatchOccurrence(clockPrincipal, {
        sequence: 1,
        request: dig("gap-after-overflow", 0),
      }),
    /region-clock-gap/,
  );
  assert.equal(
    f.db
      .prepare(
        "SELECT next_sequence,last_request_json,last_receipt_json FROM hive_region_clock WHERE singleton=1",
      )
      .get().next_sequence,
    0,
  );
});

test("opaque records initialize, replace, remove, and account bytes without rewriting replay", (t) => {
  let retainedReader;
  const f = fixture(t, { records: 4, changedRecords: 3 }, () => {
    const base = createQuarryRegionProgram();
    return {
      ...base,
      id: "quarry-records-v1",
      initial: () => ({ state: base.initial().state, records: [{ key: "water/page/0", bytes: new Uint8Array([1, 2]) }] }),
      execute(state, command, reader) {
        retainedReader = reader;
        const transition = base.execute(state, command, reader);
        if (transition.status !== "applied") return transition;
        return state.excavated === 1
          ? { ...transition, records: { puts: [{ key: "water/page/0", bytes: new Uint8Array([3, 4, 5]).buffer }], removes: [] } }
          : { ...transition, records: { puts: [{ key: "water/page/1", bytes: new Uint8Array([9]) }], removes: ["water/page/0"] } };
      },
    };
  });
  const region = f.open();
  const initial = region.readRecords(0);
  assert.deepEqual([...initial.records[0].bytes], [1, 2]);
  const first = region.dispatch(principal, dig("record-1"));
  assert.throws(() => retainedReader.read("water/page/0"), /region-record-reader-closed/);
  const afterFirst = region.readRecords(first.revision);
  assert.deepEqual([...afterFirst.records[0].bytes], [3, 4, 5]);
  const replay = region.dispatch(principal, dig("record-1"));
  assert.deepEqual(replay, first);
  const second = region.dispatch(principal, dig("record-2", first.revision, 1));
  const afterSecond = region.readRecords(second.revision);
  assert.deepEqual(afterSecond.records.map(({ key }) => key), ["water/page/1"]);
  assert.equal(f.db.prepare("SELECT record_count FROM hive_region WHERE singleton=1").get().record_count, 1);
});

test("record writes roll back with a failed receipt and leave the frontier reusable", (t) => {
  const f = fixture(t, { records: 2 }, () => {
    const base = createQuarryRegionProgram();
    return {
      ...base,
      id: "quarry-record-failure-v1",
      execute(state, command, reader) {
        const transition = base.execute(state, command, reader);
        return transition.status === "applied"
          ? { ...transition, records: { puts: [{ key: "water/page/0", bytes: new Uint8Array([7]) }], removes: [] } }
          : transition;
      },
    };
  });
  const region = f.open();
  const before = region.readCommitted();
  f.failReceipt(true);
  assert.throws(() => region.dispatch(principal, dig("record-fail")), /injected-storage-failure/);
  assert.deepEqual(region.readCommitted(), before);
  assert.deepEqual(region.readRecords(0).records, []);
  f.failReceipt(false);
  assert.equal(region.dispatch(principal, dig("record-fail")).status, "applied");
  assert.deepEqual(region.readRecords(1).records.map(({ key }) => key), ["water/page/0"]);
});

test("record duplicate keys and changed-byte caps reject without changing state", (t) => {
  const f = fixture(t, { changedRecords: 3 }, () => {
    const base = createQuarryRegionProgram();
    return { ...base, id: "quarry-record-conflict-v1", execute(state, command, reader) {
      const transition = base.execute(state, command, reader);
      return transition.status === "applied"
        ? { ...transition, records: { puts: [{ key: "same", bytes: new Uint8Array([1]) }, { key: "same", bytes: new Uint8Array([2]) }], removes: [] } }
        : transition;
    } };
  });
  const region = f.open(), before = region.readCommitted();
  assert.throws(() => region.dispatch(principal, dig("duplicate")), /region-record-key-conflict/);
  assert.deepEqual(region.readCommitted(), before);
  const capped = fixture(t, { changedRecords: 5 }, () => {
    const base = createQuarryRegionProgram();
    return { ...base, id: "quarry-record-cap-v1", execute(state, command, reader) {
      const transition = base.execute(state, command, reader);
      return transition.status === "applied"
        ? { ...transition, records: { puts: Array.from({ length: 5 }, (_, index) => ({ key: `too-many/${index}`, bytes: new Uint8Array(250_000) })), removes: [] } }
        : transition;
    } };
  });
  assert.throws(() => capped.open().dispatch(principal, dig("cap")), /region-record-change-bytes/);
});

test("record pages cap returned bytes and continue by key", (t) => {
  const f = fixture(t, {}, () => {
    const base = createQuarryRegionProgram();
    return { ...base, id: "quarry-record-page-v1", initial: () => ({ state: base.initial().state, records: Array.from({ length: 5 }, (_, index) => ({ key: `page/${index}`, bytes: new Uint8Array(250_000) })) }) };
  });
  const region = f.open();
  const first = region.readRecords(0, "", 128);
  assert.ok(first.records.length < 5);
  assert.ok(first.records.reduce((sum, record) => sum + record.bytes.byteLength, 0) <= 1024 * 1024);
  assert.ok(first.nextKey);
  const second = region.readRecords(0, first.nextKey, 128);
  assert.equal(first.records.length + second.records.length, 5);
  assert.equal(second.nextKey, undefined);
});

test("failed occurrence record write preserves frontier and retries once", (t) => {
  const clockPrincipal = "quarry-clock";
  const f = fixture(t, undefined, () => {
    const base = createQuarryRegionProgram();
    return { ...base, id: "quarry-record-clock-v1", authorize: (who, command, state) => who === clockPrincipal ? base.authorize(principal, command, state) : base.authorize(who, command, state), execute(state, command, reader) {
      const transition = base.execute(state, command, reader);
      return transition.status === "applied" ? { ...transition, records: { puts: [{ key: "clock/page", bytes: new Uint8Array([4]) }], removes: [] } } : transition;
    } };
  });
  const region = f.open(undefined, clockPrincipal), occurrence = { sequence: 0, request: dig("clock-record", 0) };
  f.failRecord(true);
  assert.throws(() => region.dispatchOccurrence(clockPrincipal, occurrence), /injected-record-failure/);
  assert.equal(region.readCommitted().revision, 0);
  f.failRecord(false);
  const applied = region.dispatchOccurrence(clockPrincipal, occurrence);
  assert.equal(applied.status, "applied");
  assert.deepEqual(region.dispatchOccurrence(clockPrincipal, occurrence), applied);
});

test("reopen rejects orphan and unsupported record storage formats", (t) => {
  const orphan = fixture(t), region = orphan.open();
  region.readCommitted();
  orphan.db.exec("DROP TABLE hive_region_records");
  assert.throws(() => orphan.open(), /region-storage-format/);
  const unsupported = fixture(t, {}, () => {
    const base = createQuarryRegionProgram();
    return { ...base, id: "quarry-record-format-v1", initial: () => ({ state: base.initial().state, records: [{ key: "format", bytes: new Uint8Array([1]) }] }) };
  });
  unsupported.open();
  unsupported.db.exec("UPDATE hive_region_records SET format_version=2");
  assert.throws(() => unsupported.open(), /region-storage-format/);
});
