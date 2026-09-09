import test from "node:test";
import assert from "node:assert/strict";
import { createMaterialOwner } from "./index.ts";
const access = { sourceReachable: true, destinationReachableWithPayload: true };
const cell = { x: 0, z: 0, level: 0 };
const bin = { id: "bin", capacity: 2, accepts: ["ingot"], bulk: { ingot: 1 } };
const station = {
  id: "station",
  capacity: 2,
  accepts: ["ore"],
  bulk: { ore: 1 },
};
const definitions = {
  ore: { carry: "portion" },
  ingot: { carry: "portion" },
  tool: { carry: "whole" },
};

test("a supplied vessel definition works and later author mutation cannot change it", () => {
  const supplied = {
    sap: { carry: "contained" },
    drum: {
      carry: "whole",
      interior: { capacity: 2, accepts: ["sap"], bulk: { sap: 1 } },
    },
  };
  const owner = createMaterialOwner(supplied);
  supplied.drum.interior.capacity = 100;
  supplied.drum.interior.accepts.length = 0;
  supplied.sap.carry = "portion";
  const state = owner.createState();
  assert.equal(owner.createGroundLot(state, "sap", 1, cell).ok, false);
  assert.equal(
    owner.createGroundLot(state, "drum", 1, cell, "drum-a").ok,
    true,
  );
  const spring = { id: "tap", capacity: 3, accepts: ["sap"], bulk: { sap: 1 } };
  assert.equal(
    owner.introduceFiniteSourceLot(state, {
      source: spring,
      material: "sap",
      quantity: 3,
      preferredId: "sap-a",
    }).ok,
    true,
  );
  assert.equal(
    owner.uses.acquireVesselForOperation(state, {
      id: "carry",
      operation: "drink",
      actor: "a",
      vessel: "drum-a",
      access,
    }).ok,
    true,
  );
  assert.equal(owner.pickupTransfer(state, "carry", access).ok, true);
  assert.equal(
    owner.uses.drawVesselContents(state, {
      operation: "drink",
      material: "sap",
      source: spring,
      portions: [{ lot: "sap-a", quantity: 2 }],
      quantity: 2,
      access,
    }).ok,
    true,
  );
  const before = structuredClone(state);
  assert.equal(
    owner.uses.drawVesselContents(state, {
      operation: "drink",
      material: "sap",
      source: spring,
      portions: [{ lot: "sap-a", quantity: 1 }],
      quantity: 1,
      access,
    }).ok,
    false,
  );
  assert.deepEqual(state, before);
  assert.deepEqual(
    owner.restore(owner.snapshot(state, [spring]), [spring]),
    state,
  );
});

test("durable held-use custody restores after transfer retirement and settles once", () => {
  const owner = createMaterialOwner(definitions);
  const state = owner.createState();
  owner.createGroundLot(state, "ore", 1, cell, "meal");
  assert.equal(
    owner.uses.acquireLotForOperation(state, {
      id: "acquire",
      operation: "use",
      actor: "a",
      lot: "meal",
      material: "ore",
      quantity: 1,
      access,
    }).ok,
    true,
  );
  assert.equal(owner.pickupTransfer(state, "acquire", access).ok, true);
  const carrying = structuredClone(state);
  assert.equal(owner.uses.retireOperationUse(state, "use").ok, false);
  assert.deepEqual(state, carrying);
  // Positive wire fixture: the durable operation binding now owns acquired hand custody.
  const settledAcquisition = structuredClone(owner.snapshot(state, []));
  settledAcquisition.state.transfers = [];
  const restored = owner.restore(settledAcquisition, []);
  const heldOnly = structuredClone(restored);
  assert.equal(owner.uses.retireOperationUse(restored, "use").ok, false);
  assert.deepEqual(restored, heldOnly);
  const canceled = structuredClone(restored);
  assert.equal(owner.uses.interruptOperation(canceled, "use").ok, false);
  assert.deepEqual(canceled, restored);
  assert.equal(
    owner.uses.interruptOperation(canceled, "use", { cell, legal: true }).ok,
    true,
  );
  assert.equal(canceled.bindings.length, 0);
  assert.equal(canceled.lots[0].location.kind, "ground");
  assert.deepEqual(owner.restore(owner.snapshot(canceled, []), []), canceled);
  const orphan = structuredClone(settledAcquisition);
  orphan.state.bindings = [];
  assert.throws(() => owner.restore(orphan, []), /orphan hand/);
  const input = {
    id: "receipt",
    operation: "use",
    lot: "meal",
    material: "ore",
    quantity: 1,
  };
  assert.equal(owner.uses.sinkHeldOperationPortion(restored, input).ok, true);
  const completed = structuredClone(restored);
  assert.equal(owner.uses.sinkHeldOperationPortion(restored, input).ok, false);
  assert.deepEqual(restored, completed);
  assert.deepEqual(owner.restore(owner.snapshot(restored, []), []), restored);
});

function recipeFixture() {
  const owner = createMaterialOwner(definitions);
  const state = owner.createState();
  owner.createGroundLot(state, "ore", 5, cell, "ore-a");
  owner.createGroundLot(state, "tool", 1, cell, "tool-a");
  const plan = {
    id: "smelt",
    definition: "ore-smelt-v1",
    station: station.id,
    consumed: [{ role: "input", lot: "ore-a", material: "ore", quantity: 1 }],
    retained: [{ role: "tool", lot: "tool-a", material: "tool", quantity: 1 }],
    promises: [
      { role: "product", material: "ingot", quantity: 2, destination: bin },
    ],
  };
  assert.equal(owner.recipes.admitRecipePlan(state, plan).ok, true);
  return { owner, state, plan };
}

test("recipe promises share capacity and full recipe lifecycle snapshots preserve receipts", () => {
  const { owner, state, plan } = recipeFixture();
  const endpoints = [station, bin];
  const saved = owner.snapshot(state, endpoints);
  assert.deepEqual(owner.restore(saved, endpoints), state);
  for (const mutate of [
    (s) => {
      s.bindings[0].promises[0].quantity = 3;
    },
    (s) => {
      s.bindings[0].consumed[0].quantity = 6;
    },
    (s) => {
      s.bindings.push(structuredClone(s.bindings[0]));
    },
    (s) => {
      s.lots = s.lots.filter((lot) => lot.id !== "tool-a");
    },
  ]) {
    const bad = structuredClone(saved);
    mutate(bad.state);
    assert.throws(() => owner.restore(bad, endpoints));
  }
  owner.createGroundLot(state, "ingot", 1, cell, "other-ingot");
  const before = structuredClone(state);
  assert.equal(
    owner.reserveTransfer(state, {
      id: "conflict",
      actor: "a",
      owner: { kind: "job", job: "other", step: "supply" },
      request: {
        source: { kind: "exact-lot", lot: "other-ingot" },
        quantityPolicy: "whole-lot",
        quantity: 1,
      },
      sourceLot: "other-ingot",
      destination: bin,
      intent: { kind: "deliver", destination: bin.id },
      access,
    }).ok,
    false,
  );
  assert.deepEqual(state, before);
  assert.equal(owner.recipes.completeRecipePrepare(state, plan.id).ok, true);
  assert.deepEqual(
    owner.restore(owner.snapshot(state, endpoints), endpoints),
    state,
  );
  const settlement = {
    id: plan.id,
    definition: plan.definition,
    station: plan.station,
    retained: plan.retained,
    outputs: plan.promises,
  };
  assert.equal(owner.recipes.settleRecipePlan(state, settlement).ok, true);
  const settled = owner.snapshot(state, endpoints);
  assert.deepEqual(owner.restore(settled, endpoints), state);
  const product = state.lots.find(
    (lot) =>
      lot.location.kind === "container" && lot.location.container === bin.id,
  );
  for (const quantity of [
    0,
    -1,
    0.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const beforeInvalid = structuredClone(state);
    assert.deepEqual(
      owner.recipes.consumeRecipeOutput(state, {
        id: "invalid-serving",
        transformation: plan.id,
        role: "product",
        material: "ingot",
        quantity,
        sourceLot: product.id,
        destination: bin,
      }),
      { ok: false, reason: "invalid-positive-integer" },
    );
    assert.deepEqual(state, beforeInvalid);
  }
  assert.equal(
    owner.recipes.consumeRecipeOutput(state, {
      id: "serving",
      transformation: plan.id,
      role: "product",
      material: "ingot",
      quantity: 1,
      sourceLot: product.id,
      destination: bin,
    }).ok,
    true,
  );
  const consumed = owner.snapshot(state, endpoints);
  const invalidReceipt = structuredClone(consumed);
  invalidReceipt.state.consumptions[0].quantity = 3;
  assert.throws(
    () => owner.restore(invalidReceipt, endpoints),
    /output consumption/,
  );
  assert.deepEqual(owner.restore(consumed, endpoints), state);
  assert.equal(
    state.lots
      .filter((lot) => lot.material === "ore")
      .reduce((sum, lot) => sum + lot.quantity, 0) +
      state.transformations[0].inputs[0].quantity,
    5,
  );
});

test("operation admission cannot erase another binding on identity conflict", () => {
  const { owner, state } = recipeFixture();
  const before = structuredClone(state);
  assert.equal(owner.uses.retireOperationUse(state, "smelt").ok, false);
  assert.equal(
    owner.uses.interruptOperation(state, "smelt", { cell, legal: true }).ok,
    false,
  );
  assert.deepEqual(state, before);
  assert.equal(
    owner.uses.acquireVesselForOperation(state, {
      id: "other",
      operation: "smelt",
      actor: "a",
      vessel: "tool-a",
      access,
    }).ok,
    false,
  );
  assert.deepEqual(state, before);
});

test("recipe admission cannot overclaim retained lots or reuse a settled transformation", () => {
  const owner = createMaterialOwner(definitions);
  const state = owner.createState();
  owner.createGroundLot(state, "ore", 2, cell, "ore");
  owner.createGroundLot(state, "tool", 1, cell, "tool");
  const rack = {
    id: "rack",
    capacity: 1,
    accepts: ["tool"],
    bulk: { tool: 1 },
  };
  assert.equal(
    owner.reserveTransfer(state, {
      id: "tool-delivery",
      actor: "a",
      owner: { kind: "job", job: "store-tool", step: "supply" },
      request: {
        source: { kind: "exact-lot", lot: "tool" },
        quantityPolicy: "whole-lot",
        quantity: 1,
      },
      sourceLot: "tool",
      destination: rack,
      intent: { kind: "deliver", destination: rack.id },
      access,
    }).ok,
    true,
  );
  const plan = {
    id: "smelt",
    definition: "v1",
    station: station.id,
    consumed: [{ role: "ore", lot: "ore", material: "ore", quantity: 1 }],
    retained: [{ role: "tool", lot: "tool", material: "tool", quantity: 1 }],
    promises: [
      { role: "product", material: "ingot", quantity: 1, destination: bin },
    ],
  };
  const reserved = structuredClone(state);
  assert.equal(owner.recipes.admitRecipePlan(state, plan).ok, false);
  assert.deepEqual(state, reserved);
  owner.interruptTransfer(state, "a");
  const overlapping = {
    ...plan,
    consumed: [{ role: "fuel", lot: "tool", material: "tool", quantity: 1 }],
  };
  const beforeOverlap = structuredClone(state);
  assert.equal(owner.recipes.admitRecipePlan(state, overlapping).ok, false);
  assert.deepEqual(state, beforeOverlap);
  const duplicateTool = {
    ...plan,
    retained: [...plan.retained, { ...plan.retained[0], role: "second-tool" }],
  };
  assert.equal(owner.recipes.checkRecipePlan(state, duplicateTool).ok, false);
  assert.equal(owner.recipes.admitRecipePlan(state, duplicateTool).ok, false);
  assert.deepEqual(state, beforeOverlap);
  assert.equal(owner.recipes.admitRecipePlan(state, plan).ok, true);
  assert.equal(owner.recipes.completeRecipePrepare(state, plan.id).ok, true);
  assert.equal(
    owner.recipes.settleRecipePlan(state, {
      id: plan.id,
      definition: plan.definition,
      station: plan.station,
      retained: plan.retained,
      outputs: plan.promises,
    }).ok,
    true,
  );
  const completed = structuredClone(state);
  assert.equal(owner.recipes.admitRecipePlan(state, plan).ok, false);
  assert.deepEqual(state, completed);
  assert.deepEqual(
    owner.restore(owner.snapshot(state, [station, bin, rack]), [
      station,
      bin,
      rack,
    ]),
    state,
  );
});

test("recipe output promises survive refused embedding or endpoint release until canceled", () => {
  const owner = createMaterialOwner(definitions);
  const state = owner.createState();
  const output = { ...bin, capacity: 3 };
  owner.createGroundLot(state, "ore", 2, cell, "ore");
  owner.introduceFiniteSourceLot(state, {
    source: output,
    material: "ingot",
    quantity: 1,
    preferredId: "stored",
  });
  const plan = {
    id: "recipe",
    definition: "v1",
    station: station.id,
    consumed: [{ role: "ore", lot: "ore", material: "ore", quantity: 1 }],
    retained: [],
    promises: [
      { role: "product", material: "ingot", quantity: 2, destination: output },
    ],
  };
  assert.equal(owner.recipes.admitRecipePlan(state, plan).ok, true);
  const before = structuredClone(state);
  assert.equal(owner.embedContainer(state, output, "ingot", 1).ok, false);
  assert.equal(
    owner.releaseContainer(state, output, {
      contentsDrop: { cell, legal: true },
      carriedDrops: {},
    }).ok,
    false,
  );
  assert.deepEqual(state, before);
  assert.deepEqual(
    owner.restore(owner.snapshot(state, [station, output]), [station, output]),
    state,
  );
  assert.equal(
    owner.recipes.releaseUnpreparedRecipeBinding(state, plan.id).ok,
    true,
  );
  assert.equal(
    owner.releaseContainer(state, output, {
      contentsDrop: { cell, legal: true },
      carriedDrops: {},
    }).ok,
    true,
  );
  assert.deepEqual(
    owner.restore(owner.snapshot(state, [station]), [station]),
    state,
  );
});

test("ordinary claim retirement follows released custody and retries harmlessly", () => {
  const owner = createMaterialOwner(definitions);
  const state = owner.createState();
  owner.createGroundLot(state, "ore", 1, cell, "meal");
  assert.equal(
    owner.uses.acquireLotForOperation(state, {
      id: "acquire",
      operation: "use",
      actor: "a",
      lot: "meal",
      material: "ore",
      quantity: 1,
      access,
    }).ok,
    true,
  );
  const reserved = structuredClone(state);
  assert.equal(owner.uses.retireOperationUse(state, "use").ok, false);
  assert.deepEqual(state, reserved);
  assert.equal(owner.pickupTransfer(state, "acquire", access).ok, true);
  assert.equal(
    owner.uses.interruptOperation(state, "use", { cell, legal: true }).ok,
    true,
  );
  assert.equal(owner.uses.retireOperationUse(state, "use").ok, true);
  assert.equal(owner.uses.retireOperationUse(state, "use").ok, true);
  assert.equal(state.lots[0].quantity, 1);
  assert.equal(state.lots[0].location.kind, "ground");
  assert.deepEqual(owner.restore(owner.snapshot(state, []), []), state);
});
