import test from "node:test";
import assert from "node:assert/strict";
import { constructionBuffer, shelfContainer } from "./construction.js";
import {
  availableQuantity,
  containerContents,
  createGroundLot,
  deliverTransfer,
  embedConstruction,
  interruptTransfer,
  materialQuantity,
  pickupTransfer,
  releaseContainer,
  reserveTransfer,
  salvageConstruction,
  transferForActor,
} from "./materials.ts";

const cell = (x = 0, z = 0, level = 0) => ({ x, z, level });
const access = {
  sourceReachable: true,
  destinationReachableWithPayload: true,
};
const fresh = (lots = []) => ({
  lots,
  transfers: [],
  embedded: [],
  nextLotId: 1,
  consumedWood: 0,
});
const site = (id, type = "wall") => ({
  id,
  type,
  ...cell(5, 5),
  direction: 0,
  work: 0,
  finishedAt: null,
});
const woodRequest = (destination, quantity) => ({
  source: { kind: "eligible-ground", material: "wood" },
  quantityPolicy: "portion",
  quantity,
  destination,
});
const exactMugwort = (lot, destination) => ({
  source: { kind: "exact-lot", lot },
  quantityPolicy: "whole-lot",
  quantity: 1,
  destination,
});
function reserve(state, input) {
  return reserveTransfer(state, { access, ...input });
}
function conserved(materials, felled, harvested = 0) {
  const wood = materialQuantity(materials, "wood");
  const mugwort = materialQuantity(materials, "mugwort");
  assert.equal(wood.live + wood.embedded + wood.consumed, felled * 6);
  assert.equal(mugwort.live + mugwort.embedded, harvested);
}

test("lots allocate collision-safe positive IDs without changing state on failure", () => {
  const materials = fresh([
    {
      id: "lot-1",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const before = structuredClone(materials);
  assert.deepEqual(createGroundLot(materials, "wood", 0, cell()), {
    ok: false,
    reason: "invalid-positive-integer",
  });
  assert.deepEqual(materials, before);
  assert.equal(
    createGroundLot(materials, "wood", 2, cell(1)).value.id,
    "lot-2",
  );
  materials.nextLotId = Number.MAX_SAFE_INTEGER;
  assert.deepEqual(createGroundLot(materials, "wood", 1, cell(2)), {
    ok: false,
    reason: "invalid-allocator",
  });
});

test("a one-unit wood source binds an exact one-unit portion for a two-unit demand", () => {
  const materials = fresh([
    {
      id: "wood-one",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const destination = constructionBuffer(site("wall-a", "door"));
  const owner = { job: "job-build", step: "construction-materials" };
  const request = woodRequest(destination.id, 1);
  const reserved = reserve(materials, {
    id: "transfer-a",
    actor: "rowan",
    owner,
    request,
    sourceLot: "wood-one",
    destination,
  });
  assert.equal(reserved.ok, true);
  assert.deepEqual(reserved.value.owner, owner);
  assert.deepEqual(reserved.value.request, request);
  assert.deepEqual(reserved.value.phase, {
    kind: "reserved",
    sourceLot: "wood-one",
    quantity: 1,
  });
  assert.equal(availableQuantity(materials, "wood-one"), 0);
  assert.equal(pickupTransfer(materials, "transfer-a", access).ok, true);
  assert.equal(
    deliverTransfer(materials, "transfer-a", destination, true).ok,
    true,
  );
  assert.equal(containerContents(materials, destination.id)[0].quantity, 1);
});

test("portion pickup splits deterministically while preserving the resolved owner", () => {
  const materials = fresh([
    {
      id: "wood-three",
      material: "wood",
      quantity: 3,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const destination = constructionBuffer(site("wall-a", "door"));
  const owner = { job: "job-build", step: "construction-materials" };
  assert.equal(
    reserve(materials, {
      id: "transfer-a",
      actor: "rowan",
      owner,
      request: woodRequest(destination.id, 2),
      sourceLot: "wood-three",
      destination,
    }).ok,
    true,
  );
  const picked = pickupTransfer(materials, "transfer-a", access);
  assert.equal(picked.ok, true);
  assert.equal(
    materials.lots.find((lot) => lot.id === "wood-three").quantity,
    1,
  );
  assert.equal(picked.value.quantity, 2);
  assert.deepEqual(transferForActor(materials, "rowan").owner, owner);
  assert.equal(
    deliverTransfer(materials, "transfer-a", destination, true).ok,
    true,
  );
});

test("whole-lot shelf storage preserves mugwort identity and admits no portion", () => {
  const materials = fresh([
    {
      id: "mugwort-a",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const destination = shelfContainer("shelf-a");
  assert.equal(
    reserve(materials, {
      id: "store-a",
      actor: "rowan",
      owner: { job: "store-job", step: "shelf-store" },
      request: exactMugwort("mugwort-a", destination.id),
      sourceLot: "mugwort-a",
      destination,
    }).ok,
    true,
  );
  assert.equal(
    pickupTransfer(materials, "store-a", access).value.id,
    "mugwort-a",
  );
  assert.equal(
    deliverTransfer(materials, "store-a", destination, true).value.id,
    "mugwort-a",
  );
  assert.equal(containerContents(materials, destination.id)[0].id, "mugwort-a");
});

test("interruption releases reserved promises and drops carrying material atomically", () => {
  const materials = fresh([
    {
      id: "wood-a",
      material: "wood",
      quantity: 2,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const destination = constructionBuffer(site("wall-a", "door"));
  const input = {
    id: "transfer-a",
    actor: "rowan",
    owner: { job: "job-build", step: "construction-materials" },
    request: woodRequest(destination.id, 2),
    sourceLot: "wood-a",
    destination,
  };
  assert.equal(reserve(materials, input).ok, true);
  assert.equal(interruptTransfer(materials, "rowan").value.kind, "released");
  assert.equal(materials.transfers.length, 0);
  assert.equal(reserve(materials, input).ok, true);
  assert.equal(pickupTransfer(materials, "transfer-a", access).ok, true);
  const dropped = interruptTransfer(materials, "rowan", {
    cell: cell(3, 4),
    legal: true,
  });
  assert.equal(dropped.ok, true);
  assert.deepEqual(dropped.value, {
    kind: "dropped",
    transfer: "transfer-a",
    lot: "wood-a",
    owner: input.owner,
  });
  assert.deepEqual(materials.lots[0].location, {
    kind: "ground",
    ...cell(3, 4),
  });
});

test("shelf release ejects its exact lot and construction salvage records the consumed wood", () => {
  const materials = fresh([
    {
      id: "mugwort-a",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: "shelf:shelf-a" },
    },
    {
      id: "wood-five",
      material: "wood",
      quantity: 5,
      location: { kind: "ground", ...cell(1) },
    },
  ]);
  const shelf = shelfContainer("shelf-a");
  const released = releaseContainer(materials, shelf, {
    contentsDrop: { cell: cell(4, 4), legal: true },
    carriedDrops: {},
  });
  assert.equal(released.ok, true);
  assert.deepEqual(released.value.contents, ["mugwort-a"]);
  assert.deepEqual(materials.lots[0].location, {
    kind: "ground",
    ...cell(4, 4),
  });

  const wall = constructionBuffer({ ...site("wall-a"), finishedAt: 1 });
  materials.embedded.push({
    container: wall.id,
    material: "wood",
    quantity: 1,
  });
  const salvaged = salvageConstruction(materials, wall, 1, {
    cell: cell(5, 5),
    legal: true,
  });
  assert.equal(salvaged.ok, true);
  assert.equal(salvaged.value.salvage.quantity, 1);
  assert.equal(salvaged.value.consumed, 0);
  conserved(materials, 1, 1);
});

test("embedding and partial salvage conserve a door's two wood through its sink", () => {
  const materials = fresh([
    {
      id: "wood-door",
      material: "wood",
      quantity: 2,
      location: { kind: "container", container: "construction-buffer:door-a" },
    },
    {
      id: "wood-rest",
      material: "wood",
      quantity: 4,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const door = constructionBuffer({
    ...site("door-a", "door"),
    finishedAt: null,
  });
  assert.equal(embedConstruction(materials, door, "wood").ok, true);
  const salvage = salvageConstruction(materials, door, 1, {
    cell: cell(5),
    legal: true,
  });
  assert.equal(salvage.ok, true);
  assert.equal(salvage.value.consumed, 1);
  assert.equal(materials.consumedWood, 1);
  conserved(materials, 1);
});

test("material ground locations discard Site and Herb-shaped extras on every settlement", () => {
  const at = {
    ...cell(3, 4),
    id: "site-or-herb",
    type: "shelf",
    work: 12,
    stage: "ready",
  };
  const assertGround = (location) => {
    assert.deepEqual(location, { kind: "ground", ...cell(3, 4) });
    assert.deepEqual(Object.keys(location).sort(), ["kind", "level", "x", "z"]);
  };

  const created = fresh();
  assert.equal(createGroundLot(created, "wood", 1, at, "created").ok, true);
  assertGround(created.lots[0].location);

  const interrupted = fresh([
    {
      id: "held",
      material: "wood",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    },
  ]);
  interrupted.transfers.push({
    id: "transfer-held",
    actor: "rowan",
    owner: { job: "job-held", step: "step" },
    request: woodRequest("container-a", 1),
    phase: { kind: "carrying", lot: "held" },
  });
  assert.equal(
    interruptTransfer(interrupted, "rowan", { cell: at, legal: true }).ok,
    true,
  );
  assertGround(interrupted.lots[0].location);

  const container = { id: "container-a", capacity: 2, accepts: ["wood"] };
  const released = fresh([
    {
      id: "stored",
      material: "wood",
      quantity: 1,
      location: { kind: "container", container: container.id },
    },
    {
      id: "carried",
      material: "wood",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    },
  ]);
  released.transfers.push({
    id: "transfer-carried",
    actor: "rowan",
    owner: { job: "job-carried", step: "step" },
    request: woodRequest(container.id, 1),
    phase: { kind: "carrying", lot: "carried" },
  });
  assert.equal(
    releaseContainer(released, container, {
      contentsDrop: { cell: at, legal: true },
      carriedDrops: { rowan: { cell: at, legal: true } },
    }).ok,
    true,
  );
  released.lots.forEach((lot) => assertGround(lot.location));

  const salvaged = fresh();
  const wall = constructionBuffer({ ...site("wall-a"), finishedAt: 1 });
  salvaged.embedded.push({ container: wall.id, material: "wood", quantity: 1 });
  assert.equal(
    salvageConstruction(salvaged, wall, 1, { cell: at, legal: true }).ok,
    true,
  );
  assertGround(salvaged.lots[0].location);
});
