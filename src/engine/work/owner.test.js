import test from "node:test";
import assert from "node:assert/strict";
import { createMaterialOwner } from "../materials/index.ts";
import { createFiniteWorkOwner } from "./index.ts";
const cell = { x: 0, z: 0, level: 0 };
const access = { sourceReachable: true, destinationReachableWithPayload: true };
test("independent finite ore work admission/release is atomic across metadata and physical custody", () => {
  const materials = createMaterialOwner({ ore: { carry: "portion" } });
  const work = createFiniteWorkOwner(materials.uses);
  const state = materials.createState(),
    records = [];
  materials.createGroundLot(state, "ore", 5, cell, "ore-a");
  const record = {
    id: "wash",
    job: "wash-job",
    definition: "ore-wash",
    execution: { phase: "acquire" },
  };
  const input = {
    kind: "portion",
    request: {
      id: "use",
      operation: "wash",
      actor: "miner",
      lot: "ore-a",
      material: "ore",
      quantity: 2,
      access,
    },
  };
  assert(work.admit(records, state, record, input).ok);
  const before = structuredClone({ state, records });
  assert.equal(work.admit(records, state, record, input).ok, false);
  assert.deepEqual({ state, records }, before);
  assert(materials.pickupTransfer(state, "use", access).ok);
  const held = structuredClone({ state, records });
  assert.equal(
    work.interrupt(records, state, { kind: "release", operation: "wash" }).ok,
    false,
  );
  assert.deepEqual({ state, records }, held);
  assert(
    work.interrupt(records, state, {
      kind: "release",
      operation: "wash",
      drop: { cell, legal: true },
    }).ok,
  );
  assert.deepEqual(records, []);
  assert.deepEqual(state.bindings, []);
  assert.deepEqual(state.transfers, []);
  assert.equal(
    state.lots.reduce((sum, lot) => sum + lot.quantity, 0),
    5,
  );
  assert(state.lots.every((lot) => lot.location.kind === "ground"));
});
test("failed material admission creates no orphan work record", () => {
  const materials = createMaterialOwner({ ore: { carry: "portion" } });
  const state = materials.createState(),
    records = [];
  const work = createFiniteWorkOwner(materials.uses);
  const before = structuredClone(state);
  assert.equal(
    work.admit(
      records,
      state,
      { id: "wash", job: "job", execution: { phase: "acquire" } },
      {
        kind: "portion",
        request: {
          id: "use",
          operation: "wash",
          actor: "miner",
          lot: "missing",
          material: "ore",
          quantity: 1,
          access,
        },
      },
    ).ok,
    false,
  );
  assert.deepEqual(records, []);
  assert.deepEqual(state, before);
});

test("independent ore attendance uses shared phases, survives current snapshot, settles once and yields after pickup", () => {
  const materials = createMaterialOwner({ ore: { carry: "portion" } }),
    work = createFiniteWorkOwner(materials.uses);
  let state = materials.createState(),
    records = [];
  materials.createGroundLot(state, "ore", 5, cell, "ore-a");
  work.admit(
    records,
    state,
    { id: "ore-work", job: "job", execution: { phase: "acquire" } },
    {
      kind: "portion",
      request: {
        id: "use",
        operation: "ore-work",
        actor: "miner",
        lot: "ore-a",
        material: "ore",
        quantity: 2,
        access,
      },
    },
  );
  let effects = 0;
  const host = {
    acquire() {
      const held = materials.queries.transferForActor(state, "miner");
      return held?.phase.kind === "carrying" ||
        (held && materials.pickupTransfer(state, held.id, access).ok)
        ? "ready"
        : "invalid";
    },
    draw() {
      throw Error("portion cannot draw");
    },
    deliver() {
      throw Error("portion cannot deliver");
    },
    consume() {
      const held = materials.queries.transferForActor(state, "miner");
      const settled = materials.uses.sinkHeldOperationPortion(state, {
        id: "washed",
        operation: "ore-work",
        lot: held.phase.lot,
        material: "ore",
        quantity: 2,
      });
      if (settled.ok) effects++;
      return settled.ok;
    },
  };
  const advance = () =>
    work.advance(
      records,
      state,
      "ore-work",
      { kind: "portion", interruption: "release", attendTicks: 2 },
      host,
      "miner",
      { cell, legal: true },
    );
  assert.equal(advance(), "pending");
  assert.deepEqual(records[0].execution, { phase: "attend", elapsed: 0 });
  assert.equal(advance(), "pending");
  assert.equal(records[0].execution.elapsed, 1);
  const saved = JSON.parse(
    JSON.stringify({ materials: materials.snapshot(state, []), records }),
  );
  state = materials.restore(saved.materials, []);
  records = saved.records;
  assert.equal(advance(), "completed");
  assert.equal(effects, 1);
  assert.deepEqual(records, []);
  assert.equal(advance(), "interrupted");
  assert.equal(effects, 1);
  assert.equal(
    state.lots.reduce((n, l) => n + l.quantity, 0) +
      state.sinks.reduce((n, l) => n + l.quantity, 0),
    5,
  );
});
