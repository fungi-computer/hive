import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { openRegion } from "../../engine/region/index.ts";
import { createAir } from "../../engine/environment/air/index.js";
import { sqliteTestOwner } from "../../engine/region/sqlite-test-owner.mjs";
import { createBrewhouseAirProgram, roomResult } from "./region.ts";
import { ROOM_FUEL } from "./fuel-definition.ts";
import { BREWHOUSE_ROOM, ROOM_MIN_FIELD_INTERVAL_S } from "./room.ts";
import { generatedBrewhouseRoom } from "./generated-room.ts";
import {
  excavateTerrain,
  initialTerrain,
  terrainEnvironment,
} from "../goblin-terrain.ts";
import {
  advanceWaterEnvironment,
  exchangeWaterEnvironment,
  waterEnvironmentFacts,
} from "../goblin-environment/water-state.ts";
import { createVoxelWorld, MATERIAL } from "../height-caves.mjs";

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
    open: (limits) =>
      openRegion({
        owner,
        region: "brewhouse",
        program: createBrewhouseAirProgram(),
        limits: { stateBytes: 4 * 1024 * 1024, ...limits },
      }),
  };
}
const command = (id, revision, action) => ({
  id,
  expectedRevision: revision,
  command: action,
});

test("finite-source boundary refuses subminimum remainder and coast before either field advances", (t) => {
  const f = fixture(t),
    region = f.open();
  region.dispatch("room-player", command("ignite-edge", 0, { kind: "ignite" }));
  const ignited = region.readCommitted(),
    unresolved = command("leave-half-microsecond", 1, {
      kind: "advance",
      seconds: ROOM_FUEL.durationS - ROOM_MIN_FIELD_INTERVAL_S / 2,
    }),
    rejected = region.dispatch("room-host", unresolved);
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(rejected.result, {
    reason: "fuel-boundary-below-field-interval",
  });
  assert.deepEqual(region.readCommitted(), ignited);
  assert.deepEqual(f.open().dispatch("room-host", unresolved), rejected);

  region.dispatch(
    "room-host",
    command("two-seconds", 1, { kind: "advance", seconds: 2 }),
  );
  const partial = region.readCommitted(),
    tinyCoast = region.dispatch(
      "room-host",
      command("tiny-coast", 2, { kind: "advance", seconds: 4.0000005 }),
    );
  assert.equal(tinyCoast.status, "rejected");
  assert.deepEqual(region.readCommitted(), partial);
  const exactRemainder =
    partial.state.burn.startS + ROOM_FUEL.durationS - partial.state.air.timeS;
  region.dispatch(
    "room-host",
    command("exact-fuel-end", 2, {
      kind: "advance",
      seconds: exactRemainder,
    }),
  );
  const complete = region.readCommitted();
  assert.equal(complete.state.air.timeS, ROOM_FUEL.durationS);
  assert.equal(complete.state.terrain.world.revision, 0);
});

test("restore refuses a physically advanced state stranded below the shared field interval", () => {
  const program = createBrewhouseAirProgram(),
    state = program.initial();
  assert.equal(
    program.execute(state, program.parseCommand({ kind: "ignite" })).status,
    "applied",
  );
  const room = generatedBrewhouseRoom(state.terrain, state.opening),
    intervalS = ROOM_FUEL.durationS - ROOM_MIN_FIELD_INTERVAL_S / 2;
  state.air = createAir(room.definition).advance(state.air, intervalS, {
    sources: [
      {
        cellId: room.sourceCell,
        smokeKgS: ROOM_FUEL.smokeKg / ROOM_FUEL.durationS,
        heatJS: ROOM_FUEL.heatJ / ROOM_FUEL.durationS,
      },
    ],
  }).state;
  state.water = advanceWaterEnvironment(
    state.water,
    { terrain: terrainEnvironment(state.terrain), sites: BREWHOUSE_ROOM.sites },
    intervalS,
  ).state;
  assert.throws(
    () => program.parseState(state),
    /fuel remainder is below the shared field interval/,
  );
});

test("actual station wood becomes one paid air dose; partial source survives exact region reopening", (t) => {
  const f = fixture(t),
    region = f.open();
  assert.equal(
    roomResult(region.readCommitted().state).remainingDoseFraction,
    1,
  );
  const registered = generatedBrewhouseRoom(
    region.readCommitted().state.terrain,
    region.readCommitted().state.opening,
  );
  assert.deepEqual(registered.definition.origin, [-4, 15, 122]);
  assert.deepEqual(registered.definition.size, [8, 9, 7]);
  assert.equal(registered.definition.solidCells.length, 136);
  assert.equal(registered.initialAir.cells.length, 368);
  assert.equal(registered.sourceCell, "cell:-2,15,124");
  assert.equal(registered.downstairsBreathingCell, "cell:0,17,125");
  assert.equal(registered.upstairsBreathingCell, "cell:-1,21,125");
  assert.equal(registered.trees.length, 3);
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
  assert.equal(partial.state.terrain.world.revision, 0);
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
  assert.equal(finished.state.terrain.world.revision, 0);
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
  assert.deepEqual(after.state.terrain, before.state.terrain);
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
  const retiredClock = structuredClone(after.state);
  retiredClock.terrain.soilState = { timeS: 0.1 };
  assert.throws(() => program.parseState(retiredClock));
});

test("vent events are bounded committed physical summaries with exact replay", (t) => {
  const f = fixture(t),
    limits = { eventBytes: 512 },
    region = f.open(limits),
    opening = command("open-compact", 0, { kind: "vent", open: true }),
    receipt = region.dispatch("room-player", opening),
    committed = region.readCommitted(),
    events = region.readEvents(0),
    event = events[0],
    payload = event.event.payload;
  assert.equal(receipt.status, "applied");
  assert.equal(events.length, 1);
  assert.equal(event.event.revision, committed.revision);
  assert.equal(payload.kind, "vent");
  assert.equal(payload.open, committed.state.opening.open);
  assert.equal(payload.oldGeometryRevision, 0);
  assert.equal(payload.newGeometryRevision, committed.state.opening.revision);
  assert.equal(payload.timeS, committed.state.air.timeS);
  assert.equal(
    payload.openedFaceCount,
    generatedBrewhouseRoom(committed.state.terrain, committed.state.opening)
      .shutterFaces.length,
  );
  assert.equal(payload.closedFaceCount, 0);
  assert.equal(
    payload.kineticChangeJ,
    payload.newKineticJ - payload.oldKineticJ,
  );
  assert.equal(
    payload.boundaryDissipationJ,
    Math.max(0, -payload.kineticChangeJ),
  );
  assert.equal(payload.thermalTransferJ, 0);
  assert.equal(payload.smokeTransferKg, 0);
  assert(Number.isFinite(payload.divergenceM3S));
  assert.deepEqual(Object.keys(payload).sort(), [
    "boundaryDissipationJ",
    "closedFaceCount",
    "divergenceM3S",
    "kind",
    "kineticChangeJ",
    "mappedKineticJ",
    "newGeometryRevision",
    "newKineticJ",
    "oldGeometryRevision",
    "oldKineticJ",
    "open",
    "openedFaceCount",
    "smokeTransferKg",
    "thermalTransferJ",
    "timeS",
  ]);
  assert(
    new TextEncoder().encode(JSON.stringify(event.event)).byteLength <=
      limits.eventBytes,
  );

  const reopened = f.open(limits);
  assert.deepEqual(reopened.dispatch("room-player", opening), receipt);
  assert.deepEqual(reopened.readCommitted(), committed);
  assert.deepEqual(reopened.readEvents(0), events);

  reopened.dispatch(
    "room-player",
    command("close-compact", 1, { kind: "vent", open: false }),
  );
  const closed = reopened.readCommitted(),
    closeEvent = reopened.readEvents(1)[0].event,
    closePayload = closeEvent.payload;
  assert.equal(closeEvent.revision, closed.revision);
  assert.equal(closePayload.open, closed.state.opening.open);
  assert.equal(closePayload.oldGeometryRevision, 1);
  assert.equal(closePayload.newGeometryRevision, 2);
  assert.equal(closePayload.openedFaceCount, 0);
  assert.equal(
    closePayload.closedFaceCount,
    generatedBrewhouseRoom(closed.state.terrain, closed.state.opening)
      .shutterFaces.length,
  );
  assert(
    new TextEncoder().encode(JSON.stringify(closeEvent)).byteLength <=
      limits.eventBytes,
  );
});

test("real exterior excavation co-saves wet spoil while the generated room rejects loss of collar support", (t) => {
  const f = fixture(t),
    region = f.open(),
    initial = region.readCommitted();
  const outside = command("outside-cut", 0, {
    kind: "excavate",
    at: [0, 14, 129],
  });
  f.fail(true);
  assert.throws(
    () => region.dispatch("room-player", outside),
    /injected-room-receipt-write/,
  );
  assert.deepEqual(region.readCommitted(), initial);
  assert.deepEqual(f.open().readCommitted(), initial);
  f.fail(false);
  const receipt = region.dispatch("room-player", outside);
  assert.equal(receipt.status, "applied");
  const cut = region.readCommitted();
  assert.equal(cut.revision, 1);
  assert.equal(cut.state.removals.length, 1);
  assert.deepEqual(cut.state.air, initial.state.air);
  assert.equal(roomResult(cut.state).excavatedVoxels, 1);
  assert.ok(roomResult(cut.state).exportedWaterKg > 0);
  const beforeWater = waterEnvironmentFacts(initial.state.water, {
    terrain: terrainEnvironment(initial.state.terrain),
    sites: BREWHOUSE_ROOM.sites,
  });
  const afterWater = waterEnvironmentFacts(cut.state.water, {
    terrain: terrainEnvironment(cut.state.terrain),
    sites: BREWHOUSE_ROOM.sites,
  });
  const exported = roomResult(cut.state).exportedWaterKg;
  const tolerance = 1e-9 + 64 * Number.EPSILON * beforeWater.initialTotalKg;
  assert(
    Math.abs(afterWater.totalKg + exported - beforeWater.totalKg) <= tolerance,
  );
  assert(Math.abs(afterWater.boundaryKg + exported) <= tolerance);
  assert.equal("fieldTimeS" in roomResult(cut.state), false);

  assert.deepEqual(region.dispatch("room-player", outside), receipt);
  assert.deepEqual(region.readCommitted(), cut);

  const unsupported = region.dispatch(
    "room-player",
    command("inside-cut", 1, { kind: "excavate", at: [0, 14, 128] }),
  );
  assert.equal(unsupported.status, "rejected");
  assert.deepEqual(unsupported.result, {
    reason: "brewhouse-support-required",
  });
  assert.deepEqual(region.readCommitted(), cut);
  assert.deepEqual(f.open().readCommitted(), cut);
  assert.equal(region.readEvents(0).length, 1);

  const program = createBrewhouseAirProgram(),
    changed = structuredClone(program.initial());
  changed.terrain = excavateTerrain(initialTerrain(), [0, 14, 128]);
  assert.throws(() => program.parseState(changed), /support changed at 7,9/);

  const changedFluid = structuredClone(program.initial()),
    world = createVoxelWorld(changedFluid.terrain.world.identity, {
      checkpoint: changedFluid.terrain.world,
      maxChangedCells: 4096,
    });
  assert.equal(
    world.edit({
      expectedRevision: world.describe().revision,
      cells: [
        {
          x: -2,
          y: 15,
          z: 124,
          expectedMaterial: MATERIAL.air,
          material: MATERIAL.soil,
        },
      ],
    }).ok,
    true,
  );
  changedFluid.terrain.world = world.save();
  // The same program restore boundary delegates this unsupported fill to the
  // terrain owner first; it cannot reach air reconstruction as a second truth.
  assert.throws(
    () => program.parseState(changedFluid),
    /world edits exactly match single-voxel solid removals/,
  );
});

test("generated room admission rejects an outside water exchange without a material counterpart", async () => {
  const p = createBrewhouseAirProgram(),
    s = p.initial();
  assert.equal(
    p.execute(s, { kind: "excavate", at: [0, 14, 129] }).status,
    "applied",
  );
  assert.doesNotThrow(() => p.parseState(s));
  const unpaired = {
    ...s,
    water: exchangeWaterEnvironment(
      s.water,
      { terrain: terrainEnvironment(s.terrain), sites: BREWHOUSE_ROOM.sites },
      {
        id: "cell:0,14,129",
        direction: "deposit",
        massKg: 2,
      },
    ).state,
  };
  assert.throws(() => p.parseState(unpaired), /unpaired external exchange/);
  assert.doesNotThrow(() => p.parseState(s));
});

test("fixed-volume study rejects real liquid in a gas receiver without publishing any paid state", () => {
  const program = createBrewhouseAirProgram(),
    state = program.initial();
  assert.equal(program.execute(state, { kind: "ignite" }).status, "applied");
  const source = {
    terrain: terrainEnvironment(state.terrain),
    sites: BREWHOUSE_ROOM.sites,
  };
  const facts = waterEnvironmentFacts(state.water, source),
    room = generatedBrewhouseRoom(state.terrain, state.opening);
  const receiver = facts.cells.findIndex(
    (cell) => cell.id === room.downstairsBreathingCell,
  );
  const donor = facts.cells.findIndex(
    (cell) => cell.kind === "soil" && cell.massKg >= 1,
  );
  assert(receiver >= 0 && donor >= 0);
  // Authored closed-stock invalid study input; not a public material transfer.
  const wet = structuredClone(state);
  wet.water.water.massKg[donor] -= 1;
  wet.water.water.massKg[receiver] += 1;
  const before = structuredClone(wet);
  assert.throws(
    () => program.parseState(wet),
    /fixed-room-air-volume-must-stay-dry/,
  );
  assert.deepEqual(program.execute(wet, { kind: "ignite" }), {
    status: "rejected",
    result: { reason: "fixed-room-air-volume-must-stay-dry" },
  });
  assert.deepEqual(program.execute(wet, { kind: "advance", seconds: 1 }), {
    status: "rejected",
    result: { reason: "fixed-room-air-volume-must-stay-dry" },
  });
  assert.deepEqual(wet, before);
});
