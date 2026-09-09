import test from "node:test";
import assert from "node:assert/strict";
import { createMaterialOwner } from "./index.ts";

const access = { sourceReachable: true, destinationReachableWithPayload: true };
const cell = { x: 0, z: 0, level: 0 };
const operation = "carry-outside-material";

function fixture({ held = true, capacity = 4 } = {}) {
  const owner = createMaterialOwner({
    water: { carry: "contained" },
    resin: { carry: "contained" },
    bead: { carry: "whole" },
    vessel: {
      carry: "whole",
      interior: {
        capacity,
        accepts: ["water", "resin", "bead"],
        bulk: { water: 1, resin: 2, bead: 1 },
      },
    },
  });
  const state = owner.createState();
  assert(owner.createGroundLot(state, "vessel", 1, cell, "vessel-A").ok);
  assert(
    owner.uses.acquireVesselForOperation(state, {
      id: "carry",
      operation,
      actor: "carrier",
      vessel: "vessel-A",
      access,
    }).ok,
  );
  if (held) assert(owner.pickupTransfer(state, "carry", access).ok);
  return { owner, state };
}

function inward(owner, state, material, quantity) {
  const result = owner.uses.importVesselContents(state, {
    operation,
    material,
    quantity,
  });
  assert(result.ok, result.reason);
  return result.value;
}

function rejectedUnchanged(state, action, reason) {
  const before = JSON.stringify(state);
  const result = action();
  assert.equal(result.ok, false);
  if (reason) assert.equal(result.reason, reason);
  assert.equal(JSON.stringify(state), before);
}

test("finite source admission owns authored and allocated identities plus material validity before commitment", () => {
  const { owner, state } = fixture();
  const source = {
    id: "authored-source",
    capacity: 8,
    accepts: ["resin", "bead", "unknown"],
    bulk: { resin: 1, bead: 1, unknown: 1 },
  };
  const authored = owner.introduceFiniteSourceLot(state, {
    source,
    material: "resin",
    quantity: 1,
    preferredId: "lot-1",
  });
  assert(authored.ok);
  assert.equal(state.nextLotId, 1);
  const allocated = owner.introduceFiniteSourceLot(state, {
    source,
    material: "resin",
    quantity: 1,
  });
  assert(allocated.ok);
  assert.equal(allocated.value.id, "lot-2");
  assert.equal(state.nextLotId, 3);
  for (const input of [
    { material: "resin", quantity: 1, preferredId: "lot-1" },
    { material: "bead", quantity: 2 },
    { material: "unknown", quantity: 1 },
    { material: "unknown", quantity: 1, preferredId: "authored-invalid" },
  ])
    rejectedUnchanged(state, () =>
      owner.introduceFiniteSourceLot(state, {
        source,
        ...input,
      }),
    );
  assert.deepEqual(
    owner.restore(owner.snapshot(state, [source]), [source]),
    state,
  );
});

test("boundary import creates real held contents for two material definitions and preserves current-format reopen", () => {
  const { owner, state } = fixture();
  const water = inward(owner, state, "water", 2);
  const resin = inward(owner, state, "resin", 1);
  assert.deepEqual(water, { lot: "lot-1", quantity: 2 });
  assert.deepEqual(resin, { lot: "lot-2", quantity: 1 });
  assert.deepEqual(
    state.lots.slice(1).map(({ id, material, quantity, location }) => ({
      id,
      material,
      quantity,
      location,
    })),
    [
      {
        id: water.lot,
        material: "water",
        quantity: 2,
        location: { kind: "container", container: "vessel:vessel-A" },
      },
      {
        id: resin.lot,
        material: "resin",
        quantity: 1,
        location: { kind: "container", container: "vessel:vessel-A" },
      },
    ],
  );
  assert.equal(state.nextLotId, 3);
  assert.deepEqual(state.sinks, []);
  assert.deepEqual(owner.restore(owner.snapshot(state, []), []), state);
  water.quantity = 99;
  assert.equal(state.lots.find((lot) => lot.id === water.lot).quantity, 2);
});

test("boundary import rejects custody, invalid material/quantity, capacity and allocator failures without writes", () => {
  for (const held of [false, true]) {
    const { owner, state } = fixture({ held });
    rejectedUnchanged(
      state,
      () =>
        owner.uses.importVesselContents(state, {
          operation: held ? "not-the-operation" : operation,
          material: "water",
          quantity: 1,
        }),
      "use-intent-required",
    );
  }
  for (const input of [
    { material: "water", quantity: 0 },
    { material: "water", quantity: -1 },
    { material: "water", quantity: 0.5 },
    { material: "water", quantity: Infinity },
    { material: "missing", quantity: 1 },
    { material: "bead", quantity: 2 },
    { material: "resin", quantity: 3 },
  ]) {
    const { owner, state } = fixture();
    rejectedUnchanged(state, () =>
      owner.uses.importVesselContents(state, {
        operation,
        ...input,
      }),
    );
  }
  const { owner, state } = fixture();
  inward(owner, state, "water", 2);
  rejectedUnchanged(
    state,
    () =>
      owner.uses.importVesselContents(state, {
        operation,
        material: "resin",
        quantity: 2,
      }),
    "destination-full",
  );
  state.nextLotId = Number.MAX_SAFE_INTEGER;
  rejectedUnchanged(
    state,
    () =>
      owner.uses.importVesselContents(state, {
        operation,
        material: "water",
        quantity: 1,
      }),
    "invalid-allocator",
  );
});

test("boundary export preserves partial identities, removes whole portions and returns an owned fact without sinks", () => {
  const { owner, state } = fixture({ capacity: 8 });
  const first = inward(owner, state, "water", 3);
  const second = inward(owner, state, "water", 1);
  const resin = inward(owner, state, "resin", 1);
  const portions = [{ lot: first.lot, quantity: 2 }, second];
  const allocator = state.nextLotId;
  const result = owner.uses.exportVesselContents(state, {
    operation,
    material: "water",
    quantity: 3,
    portions,
  });
  assert(result.ok);
  assert.deepEqual(result.value, {
    operation,
    vessel: "vessel-A",
    container: "vessel:vessel-A",
    material: "water",
    quantity: 3,
    portions,
  });
  assert.equal(state.lots.find((lot) => lot.id === first.lot).quantity, 1);
  assert.equal(
    state.lots.some((lot) => lot.id === second.lot),
    false,
  );
  assert.equal(state.nextLotId, allocator);
  portions[0].quantity = 88;
  assert.equal(result.value.portions[0].quantity, 2);
  assert(Object.isFrozen(result.value));
  assert(Object.isFrozen(result.value.portions));
  assert(result.value.portions.every(Object.isFrozen));
  const resinOut = owner.uses.exportVesselContents(state, {
    operation,
    material: "resin",
    quantity: 1,
    portions: [resin],
  });
  assert(resinOut.ok);
  assert.equal(resinOut.value.material, "resin");
  assert.equal(
    state.lots.some((lot) => lot.id === resin.lot),
    false,
  );
  assert.deepEqual(state.sinks, []);
  assert.deepEqual(owner.restore(owner.snapshot(state, []), []), state);
});

test("boundary export preflights the entire batch and live held custody before any debit", () => {
  const { owner, state } = fixture({ capacity: 8 });
  const first = inward(owner, state, "water", 2);
  const second = inward(owner, state, "water", 1);
  const resin = inward(owner, state, "resin", 1);
  for (const input of [
    {
      portions: [
        { lot: first.lot, quantity: 1 },
        { lot: "missing", quantity: 1 },
      ],
    },
    { portions: [{ lot: first.lot, quantity: 1 }, resin] },
    {
      portions: [
        { lot: first.lot, quantity: 1 },
        { lot: first.lot, quantity: 1 },
      ],
    },
    {
      portions: [
        { lot: first.lot, quantity: 1 },
        { lot: second.lot, quantity: 2 },
      ],
      quantity: 3,
    },
    { portions: [first], quantity: 1 },
    { portions: [first], operation: "not-the-operation" },
  ])
    rejectedUnchanged(state, () =>
      owner.uses.exportVesselContents(state, {
        operation,
        material: "water",
        quantity: 2,
        ...input,
      }),
    );
  assert(
    owner.uses.parkOperationVessel(state, {
      actor: "carrier",
      operation,
      drop: { cell, legal: true },
    }).ok,
  );
  rejectedUnchanged(
    state,
    () =>
      owner.uses.exportVesselContents(state, {
        operation,
        material: "water",
        quantity: 2,
        portions: [first],
      }),
    "vessel-invalid",
  );
  rejectedUnchanged(
    state,
    () =>
      owner.uses.importVesselContents(state, {
        operation,
        material: "water",
        quantity: 1,
      }),
    "vessel-invalid",
  );
  assert.deepEqual(state.sinks, []);
  assert.deepEqual(owner.restore(owner.snapshot(state, []), []), state);
});
