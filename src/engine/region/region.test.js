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
  const owner = sqliteTestOwner(db, statement => {
    if (failReceipt && statement.startsWith("INSERT INTO hive_region_receipts"))
      throw new Error("injected-storage-failure");
  });
  const open = (policy = limits) =>
    openRegion({
      owner,
      region: "quarry-1",
      program: program(),
      limits: policy,
    });
  return {
    open,
    db,
    failReceipt(value) {
      failReceipt = value;
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
