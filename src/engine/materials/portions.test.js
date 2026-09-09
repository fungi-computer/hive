import test from "node:test";
import assert from "node:assert/strict";
import { createMaterialOwner } from "./index.ts";
const access = { sourceReachable: true, destinationReachableWithPayload: true };
const cell = { x: 0, z: 0, level: 0 };
const source = {
  id: "source",
  capacity: 8,
  accepts: ["water"],
  bulk: { water: 1 },
};
const destination = {
  id: "kettle",
  capacity: 2,
  accepts: ["water"],
  bulk: { water: 1 },
};
function fixture() {
  const owner = createMaterialOwner({
    water: { carry: "contained" },
    pail: {
      carry: "whole",
      interior: { capacity: 2, accepts: ["water"], bulk: { water: 1 } },
    },
  });
  const state = owner.createState();
  owner.createGroundLot(state, "pail", 1, cell, "pail");
  for (const id of ["A", "B"])
    assert(
      owner.introduceFiniteSourceLot(state, {
        source,
        material: "water",
        quantity: 2,
        preferredId: id,
      }).ok,
    );
  return { owner, state };
}
const portions = [
  { lot: "A", quantity: 1 },
  { lot: "B", quantity: 1 },
];
test("portion batch moves fragmented stock without coalescing and preserves split remainder IDs", () => {
  const { owner, state } = fixture();
  const moved = owner.moveContainerPortions(state, {
    source,
    destination,
    material: "water",
    quantity: 2,
    portions,
    access,
  });
  assert(moved.ok);
  assert.deepEqual(moved.value, [
    { lot: "lot-1", quantity: 1 },
    { lot: "lot-2", quantity: 1 },
  ]);
  assert.equal(state.lots.find((l) => l.id === "A").quantity, 1);
  assert.equal(state.lots.find((l) => l.id === "B").quantity, 1);
  assert.deepEqual(
    owner.restore(owner.snapshot(state, [source, destination]), [
      source,
      destination,
    ]),
    state,
  );
});
test("every failed portion preflight preserves original bytes and allocator including a late allocation failure", () => {
  const invalid = [
    {
      portions: [
        { lot: "A", quantity: 1 },
        { lot: "missing", quantity: 1 },
      ],
    },
    {
      portions: [
        { lot: "A", quantity: 1 },
        { lot: "A", quantity: 1 },
      ],
    },
    {
      portions: [
        { lot: "A", quantity: 1 },
        { lot: "B", quantity: 0 },
      ],
    },
    {
      portions: [
        { lot: "A", quantity: 1 },
        { lot: "B", quantity: -1 },
      ],
    },
    {
      portions: [
        { lot: "A", quantity: 1 },
        { lot: "B", quantity: 3 },
      ],
      quantity: 4,
    },
    { destination: { ...destination, capacity: 1 } },
    { access: { ...access, destinationReachableWithPayload: false } },
  ];
  for (const change of invalid) {
    const { owner, state } = fixture();
    const before = JSON.stringify(state);
    assert.equal(
      owner.moveContainerPortions(state, {
        source,
        destination,
        material: "water",
        quantity: 2,
        portions,
        access,
        ...change,
      }).ok,
      false,
    );
    assert.equal(JSON.stringify(state), before);
  }
  const { owner, state } = fixture();
  state.nextLotId = Number.MAX_SAFE_INTEGER - 1;
  const before = JSON.stringify(state);
  assert.deepEqual(
    owner.moveContainerPortions(state, {
      source,
      destination,
      material: "water",
      quantity: 2,
      portions,
      access,
    }),
    { ok: false, reason: "invalid-allocator" },
  );
  assert.equal(JSON.stringify(state), before);
});
test("partial sink leaves A1; deficit draw creates B1; atomic A1+B1 pour retains whole IDs and cancellation retains vessel", () => {
  const { owner, state } = fixture();
  const held = () => {
    assert(
      owner.uses.acquireVesselForOperation(state, {
        id: "carry",
        operation: "drink",
        actor: "a",
        vessel: "pail",
        access,
      }).ok,
    );
    assert(owner.pickupTransfer(state, "carry", access).ok);
  };
  held();
  assert(
    owner.uses.drawVesselContents(state, {
      operation: "drink",
      source,
      material: "water",
      quantity: 2,
      portions: [{ lot: "A", quantity: 2 }],
      access,
    }).ok,
  );
  const sink = {
    id: "sip",
    operation: "drink",
    material: "water",
    quantity: 1,
    portions: [{ lot: "A", quantity: 1 }],
  };
  assert(owner.uses.sinkHeldPortion(state, sink).ok);
  assert.equal(state.lots.find((l) => l.id === "A").quantity, 1);
  const afterSip = JSON.stringify(state);
  assert.deepEqual(owner.uses.sinkHeldPortion(state, sink), {
    ok: false,
    reason: "duplicate-sink",
  });
  assert.equal(JSON.stringify(state), afterSip);
  const draw = owner.uses.drawVesselContents(state, {
    operation: "drink",
    source,
    material: "water",
    quantity: 1,
    portions: [{ lot: "B", quantity: 1 }],
    access,
  });
  assert(draw.ok);
  assert.equal(state.lots.find((l) => l.id === "B").quantity, 1);
  const promised = [{ lot: "A", quantity: 1 }, ...draw.value];
  assert(
    owner.uses.parkOperationVessel(state, {
      actor: "a",
      operation: "drink",
      drop: { cell, legal: true },
    }).ok,
  );
  assert.equal(owner.containerQuantity(state, "vessel:pail", "water"), 2);
  const restored = owner.restore(owner.snapshot(state, [source, destination]), [
    source,
    destination,
  ]);
  assert(
    owner.uses.rebindOperationVessel(restored, {
      id: "again",
      actor: "a",
      operation: "drink",
      access,
    }).ok,
  );
  assert(owner.pickupTransfer(restored, "again", access).ok);
  const bad = JSON.stringify(restored);
  assert.equal(
    owner.uses.pourVesselContents(restored, {
      operation: "drink",
      destination,
      material: "water",
      quantity: 2,
      portions: [promised[0], { lot: "B", quantity: 1 }],
      access,
    }).ok,
    false,
  );
  assert.equal(JSON.stringify(restored), bad);
  assert.deepEqual(
    owner.uses.pourVesselContents(restored, {
      operation: "drink",
      destination,
      material: "water",
      quantity: 2,
      portions: promised,
      access,
    }),
    { ok: true, value: promised },
  );
  assert(
    owner.uses.interruptOperation(restored, "drink", { cell, legal: true }).ok,
  );
  assert.equal(owner.containerQuantity(restored, destination.id, "water"), 2);
  assert.equal(
    restored.lots
      .filter((l) => l.material === "water")
      .reduce((n, l) => n + l.quantity, 0) + restored.sinks[0].quantity,
    4,
  );
  assert.deepEqual(
    owner.restore(owner.snapshot(restored, [source, destination]), [
      source,
      destination,
    ]),
    restored,
  );
});

test("aggregate eligibility draws two one-unit fragments where no single lot satisfies the request", () => {
  const { owner, state } = fixture();
  state.lots.find((l) => l.id === "A").quantity = 1;
  state.lots.find((l) => l.id === "B").quantity = 1;
  const selected = owner.queries.selectContainerPortions(
    state,
    source.id,
    "water",
    2,
  );
  assert.deepEqual(selected, { portions, quantity: 2 });
  assert.deepEqual(
    owner.moveContainerPortions(state, {
      source,
      destination,
      material: "water",
      quantity: 2,
      portions: selected.portions,
      access,
    }),
    { ok: true, value: portions },
  );
  assert.equal(state.nextLotId, 1, "whole moves allocate no identity");
});
