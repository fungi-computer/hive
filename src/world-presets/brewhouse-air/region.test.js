import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openRegion } from "../../engine/region/index.ts";
import { sqliteTestOwner } from "../../engine/region/sqlite-test-owner.mjs";
import { createBrewhouseAirProgram, roomResult } from "./region.ts";
import { ROOM_FUEL } from "./fuel.ts";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let failure = false;
  const owner = sqliteTestOwner(db, (statement) => {
    if (failure && statement.startsWith("INSERT INTO hive_region_receipts"))
      throw new Error("injected-room-receipt-write");
  });
  return {
    db,
    fail: (value) => {
      failure = value;
    },
    open: () =>
      openRegion({
        owner,
        region: "brewhouse",
        program: createBrewhouseAirProgram(),
      }),
  };
}
const command = (id, revision, action) => ({
  id,
  expectedRevision: revision,
  command: action,
});

test("actual station wood becomes one paid air dose; partial source survives exact region reopening", (t) => {
  const f = fixture(t),
    region = f.open();
  assert.equal(
    roomResult(region.readCommitted().state).remainingDoseFraction,
    1,
  );
  const ignition = command("ignite", 0, { kind: "ignite" });
  const receipt = region.dispatch("room-player", ignition);
  const paid = region.readCommitted();
  assert.equal(paid.state.materials.lots.length, 0);
  assert.equal(paid.state.materials.transformations.length, 1);
  assert.equal(paid.state.materials.transformations[0].inputs[0].quantity, 1);
  assert.equal(paid.state.air.heatSourceJ, 0);
  region.dispatch(
    "room-host",
    command("warm", 1, { kind: "advance", seconds: 2 }),
  );
  const partial = region.readCommitted();
  assert.ok(Math.abs(partial.state.air.heatSourceJ - 600) < 1e-5);
  assert.ok(
    Math.abs(partial.state.air.smokeSourceKg - ROOM_FUEL.smokeKg / 3) < 1e-10,
  );
  const reopened = f.open();
  assert.deepEqual(reopened.readCommitted(), partial);
  assert.deepEqual(reopened.dispatch("room-player", ignition), receipt);
  assert.deepEqual(reopened.readCommitted(), partial);
  reopened.dispatch(
    "room-host",
    command("finish-and-coast", 2, { kind: "advance", seconds: 6 }),
  );
  const finished = reopened.readCommitted();
  assert.equal(finished.state.air.timeS, 8);
  assert.ok(Math.abs(finished.state.air.heatSourceJ - ROOM_FUEL.heatJ) < 1e-5);
  assert.ok(
    Math.abs(finished.state.air.smokeSourceKg - ROOM_FUEL.smokeKg) < 1e-10,
  );
  const second = reopened.dispatch(
    "room-player",
    command("second-fire", 3, { kind: "ignite" }),
  );
  assert.equal(second.status, "rejected");
  assert.deepEqual(reopened.readCommitted(), finished);
  assert.equal(reopened.readEvents(0).length, 3);
});

test("receipt failure rolls fuel/plan and field/clock back together without publishing RAM", (t) => {
  const f = fixture(t),
    region = f.open(),
    initial = region.readCommitted();
  const ignition = command("ignite", 0, { kind: "ignite" });
  f.fail(true);
  assert.throws(
    () => region.dispatch("room-player", ignition),
    /injected-room/,
  );
  assert.deepEqual(region.readCommitted(), initial);
  assert.deepEqual(f.open().readCommitted(), initial);
  f.fail(false);
  region.dispatch("room-player", ignition);
  const paid = region.readCommitted();
  f.fail(true);
  assert.throws(
    () =>
      region.dispatch(
        "room-host",
        command("warm", 1, { kind: "advance", seconds: 0.2 }),
      ),
    /injected-room/,
  );
  assert.deepEqual(region.readCommitted(), paid);
  assert.deepEqual(f.open().readCommitted(), paid);
  assert.equal(region.readEvents(0).length, 1);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM hive_region_receipts").get().n,
    1,
  );
});

test("vent edit keeps physical stocks and reports dissipation; grants and unpaid source saves reject", (t) => {
  const f = fixture(t),
    region = f.open();
  assert.throws(
    () =>
      region.dispatch(
        "room-player",
        command("clock", 0, { kind: "advance", seconds: 1 }),
      ),
    /forbidden/,
  );
  assert.throws(
    () => region.dispatch("room-host", command("fire", 0, { kind: "ignite" })),
    /forbidden/,
  );
  region.dispatch("room-player", command("fire", 0, { kind: "ignite" }));
  region.dispatch(
    "room-host",
    command("warm", 1, { kind: "advance", seconds: 0.2 }),
  );
  const before = region.readCommitted();
  region.dispatch(
    "room-player",
    command("open", 2, { kind: "vent", open: true }),
  );
  const after = region.readCommitted();
  assert.deepEqual(after.state.air.smokeKg, before.state.air.smokeKg);
  assert.deepEqual(after.state.air.heatJ, before.state.air.heatJ);
  assert.equal(after.state.air.timeS, before.state.air.timeS);
  assert.deepEqual(after.state.materials, before.state.materials);
  assert.deepEqual(f.open().readCommitted(), after);
  const editEvent = region.readEvents(0).at(-1).event.payload;
  assert.equal(editEvent.thermalTransferJ, 0);
  assert.equal(editEvent.smokeTransferKg, 0);
  assert.ok(editEvent.boundaryDissipationJ >= 0);
  const program = createBrewhouseAirProgram();
  const unpaid = structuredClone(after.state);
  unpaid.burn = null;
  assert.throws(() => program.parseState(unpaid), /fuel mismatch/);
  const retimed = structuredClone(after.state);
  retimed.burn.startS = 0.1;
  assert.throws(() => program.parseState(retimed), /sources disagree/);
});
