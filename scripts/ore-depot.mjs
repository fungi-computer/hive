import assert from "node:assert/strict";
import { createMaterialOwner } from "../src/engine/materials/index.ts";

const owner = createMaterialOwner({
  ore: { carry: "portion" },
  slag: { carry: "portion" },
});
const mine = { id: "mine", capacity: 5, accepts: ["ore"], bulk: { ore: 1 } };
const bin = { id: "bin", capacity: 2, accepts: ["ore"], bulk: { ore: 1 } };
const access = { sourceReachable: true, destinationReachableWithPayload: true };
const drop = { cell: { x: 0, y: 0, z: 0 }, legal: true };
const fresh = () => owner.createState();
const total = (state) => state.lots.reduce((sum, lot) => sum + lot.quantity, 0);
const reserve = (state, id, actor, source = "ore-grant", quantity = 2) =>
  owner.reserveTransfer(state, {
    id,
    actor,
    owner: { kind: "job", job: id, step: "deliver" },
    request: {
      source: { kind: "exact-lot", lot: source },
      quantityPolicy: "portion",
      quantity,
    },
    sourceLot: source,
    destination: bin,
    intent: { kind: "deliver", destination: bin.id },
    access,
  });
let state = fresh();
assert.equal(
  owner.introduceFiniteSourceLot(state, {
    source: mine,
    material: "ore",
    quantity: 5,
    preferredId: "ore-grant",
  }).ok,
  true,
);
assert.equal(reserve(state, "first", "a").ok, true);
const beforeRejected = structuredClone(state);
assert.equal(reserve(state, "overbook", "b").ok, false);
assert.deepEqual(state, beforeRejected);
assert.equal(owner.interruptTransfer(state, "a").ok, true);
assert.equal(total(state), 5);
assert.equal(reserve(state, "second", "a").ok, true);
assert.equal(owner.pickupTransfer(state, "second", access).ok, true);
assert.equal(state.lots.find((lot) => lot.id === "ore-grant").quantity, 3);
assert.equal(
  state.lots.find((lot) => lot.location.kind === "hand").quantity,
  2,
);
const saved = owner.snapshot(state, [mine, bin]);
state = owner.restore(JSON.parse(JSON.stringify(saved)), [mine, bin]);
// A second consumer can exhaust the original remainder while the first portion is held.
const exhausted = owner.restore(saved, [mine, bin]);
const forge = { id: "forge", capacity: 3, accepts: ["ore"], bulk: { ore: 1 } };
assert.equal(
  owner.reserveTransfer(exhausted, {
    id: "forge-supply",
    actor: "b",
    owner: { kind: "job", job: "forge", step: "supply" },
    request: {
      source: { kind: "exact-lot", lot: "ore-grant" },
      quantityPolicy: "whole-lot",
      quantity: 3,
    },
    sourceLot: "ore-grant",
    destination: forge,
    intent: { kind: "deliver", destination: forge.id },
    access,
  }).ok,
  true,
);
assert.equal(owner.pickupTransfer(exhausted, "forge-supply", access).ok, true);
assert.equal(
  owner.deliverTransfer(exhausted, "forge-supply", forge, true).ok,
  true,
);
assert.equal(owner.embedContainer(exhausted, forge, "ore", 3).ok, true);
assert.equal(
  exhausted.lots.some((lot) => lot.id === "ore-grant"),
  false,
);
assert.equal(
  total(exhausted) +
    exhausted.embedded.reduce((sum, item) => sum + item.quantity, 0),
  5,
);
const noSource = owner.snapshot(exhausted, [mine, bin, forge]);
assert.doesNotThrow(() => owner.restore(noSource, [mine, bin, forge]));
const forgedMaterial = structuredClone(noSource);
forgedMaterial.state.lots.find((lot) => lot.location.kind === "hand").material =
  "slag";
assert.throws(
  () => owner.restore(forgedMaterial, [mine, bin, forge]),
  /phase: source-ineligible/,
);
const forgedRuntime = structuredClone(forgedMaterial.state);
assert.equal(
  owner.deliverTransfer(forgedRuntime, "second", bin, true).ok,
  false,
);
assert.deepEqual(forgedRuntime, forgedMaterial.state);

const corrupt = structuredClone(saved);
corrupt.state.transfers[0].request.quantity = 1;
assert.throws(() => owner.restore(corrupt, [mine, bin]), /phase/);
assert.throws(() => owner.restore(saved, [mine]), /destination/);
const removed = owner.restore(saved, [mine, bin]);
const beforeRemoval = structuredClone(removed);
assert.equal(
  owner.releaseContainer(removed, bin, { contentsDrop: drop, carriedDrops: {} })
    .ok,
  false,
);
assert.deepEqual(removed, beforeRemoval);
assert.equal(
  owner.releaseContainer(removed, bin, {
    contentsDrop: drop,
    carriedDrops: { a: drop },
  }).ok,
  true,
);
assert.equal(total(removed), 5);
assert.equal(removed.transfers.length, 0);
assert.doesNotThrow(() => owner.snapshot(removed, [mine]));
const dropped = owner.interruptTransfer(state, "a", drop);
assert.equal(dropped.ok, true);
assert.equal(total(state), 5);
const carriedId = dropped.value.lot;
assert.equal(reserve(state, "retry", "a", carriedId).ok, true);
assert.equal(owner.pickupTransfer(state, "retry", access).ok, true);
assert.equal(owner.deliverTransfer(state, "retry", bin, true).ok, true);
const completed = structuredClone(state);
assert.equal(owner.deliverTransfer(state, "retry", bin, true).ok, false);
assert.deepEqual(state, completed);
assert.equal(owner.containerQuantity(state, bin.id, "ore"), 2);
assert.equal(total(state), 5);
assert.deepEqual(
  owner.restore(owner.snapshot(state, [mine, bin]), [mine, bin]),
  state,
);
console.log(
  JSON.stringify({
    consumer: "Node-only ore depot",
    grant: 5,
    stored: 2,
    remaining: owner.containerQuantity(state, mine.id, "ore"),
    total: total(state),
    laws: "overbooking, split, save, cancellation, retry, removed destination, no duplicate completion",
  }),
);
