import test from "node:test";
import assert from "node:assert/strict";
import {
  availablePortions,
  availableQuantity,
  constructionBuffer,
  createGroundLot,
  deliverTransfer,
  embedConstruction,
  incomingQuantity,
  interruptTransfer,
  materialQuantity,
  pickupTransfer,
  releaseContainer,
  reserveTransfer,
  salvageConstruction,
  shelfContainer,
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
const woodRequest = (destination, quantity = 2) => ({
  source: { kind: "eligible-ground", material: "wood" },
  quantity,
  destination,
});
const exactRequest = (lot, destination) => ({
  source: { kind: "exact-lot", lot },
  quantity: 1,
  destination,
});
const reserve = (
  state,
  {
    id,
    actor,
    owner = { job: `job-${id}`, step: "construction-materials" },
    request,
    sourceLot,
    destination,
    proof = access,
  },
) =>
  reserveTransfer(state, {
    id,
    actor,
    owner,
    request,
    sourceLot,
    destination,
    access: proof,
  });

test("ground lots are positive and allocate collision-safe stable IDs", () => {
  const state = fresh([
    {
      id: "lot-1",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const before = structuredClone(state);
  assert.deepEqual(createGroundLot(state, "wood", 0, cell(1)), {
    ok: false,
    reason: "invalid-positive-integer",
  });
  assert.deepEqual(state, before);
  const created = createGroundLot(state, "wood", 2, cell(1));
  assert.equal(created.ok, true);
  assert.equal(created.value.id, "lot-2");
  assert.equal(state.nextLotId, 3);

  const exhausted = fresh();
  exhausted.nextLotId = Number.MAX_SAFE_INTEGER;
  const exhaustedBefore = structuredClone(exhausted);
  assert.deepEqual(createGroundLot(exhausted, "wood", 1, cell()), {
    ok: false,
    reason: "invalid-allocator",
  });
  assert.deepEqual(exhausted, exhaustedBefore);
});

test("reservation is atomic across scarce source and destination capacity", () => {
  const state = fresh([
    {
      id: "wood-a",
      material: "wood",
      quantity: 2,
      location: { kind: "ground", ...cell() },
    },
    {
      id: "herb-a",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell(1) },
    },
    {
      id: "herb-b",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell(2) },
    },
  ]);
  const buffer = constructionBuffer("wall-a", 4);
  assert.equal(
    reserve(state, {
      id: "transfer-a",
      actor: "rowan",
      request: woodRequest(buffer.id),
      sourceLot: "wood-a",
      destination: buffer,
    }).ok,
    true,
  );
  assert.deepEqual(availablePortions(state, woodRequest(buffer.id).source), []);
  const scarce = reserve(state, {
    id: "transfer-b",
    actor: "sage",
    request: woodRequest(buffer.id),
    sourceLot: "wood-a",
    destination: buffer,
  });
  assert.deepEqual(scarce, { ok: false, reason: "source-insufficient" });
  assert.equal(state.transfers.length, 1);

  const shelf = shelfContainer("shelf-a");
  assert.equal(
    reserve(state, {
      id: "store-a",
      actor: "sage",
      owner: { job: "store-job-a", step: "shelf-store" },
      request: exactRequest("herb-a", shelf.id),
      sourceLot: "herb-a",
      destination: shelf,
    }).ok,
    true,
  );
  const full = reserve(state, {
    id: "store-b",
    actor: "cedar",
    owner: { job: "store-job-b", step: "shelf-store" },
    request: exactRequest("herb-b", shelf.id),
    sourceLot: "herb-b",
    destination: shelf,
  });
  assert.deepEqual(full, { ok: false, reason: "destination-full" });
  assert.equal(incomingQuantity(state, shelf.id), 1);
  assert.equal(availableQuantity(state, "herb-b"), 1);
});

test("reserve checks both route legs before creating either promise", () => {
  const lot = {
    id: "wood-a",
    material: "wood",
    quantity: 2,
    location: { kind: "ground", ...cell() },
  };
  for (const proof of [
    { sourceReachable: false, destinationReachableWithPayload: true },
    { sourceReachable: true, destinationReachableWithPayload: false },
  ]) {
    const state = fresh([{ ...lot, location: { ...lot.location } }]);
    const buffer = constructionBuffer("wall-a", 2);
    const result = reserve(state, {
      id: "transfer-a",
      actor: "rowan",
      request: woodRequest(buffer.id),
      sourceLot: lot.id,
      destination: buffer,
      proof,
    });
    assert.equal(result.ok, false);
    assert.equal(state.transfers.length, 0);
    assert.equal(state.lots[0].quantity, 2);
  }
});

test("one job step cannot bind two actors even with independent stock", () => {
  const state = fresh([
    {
      id: "wood-a",
      material: "wood",
      quantity: 2,
      location: { kind: "ground", ...cell() },
    },
    {
      id: "wood-b",
      material: "wood",
      quantity: 2,
      location: { kind: "ground", ...cell(1) },
    },
  ]);
  const buffer = constructionBuffer("wall-a", 4);
  const owner = { job: "build-wall-a", step: "construction-materials" };
  assert.equal(
    reserve(state, {
      id: "transfer-a",
      actor: "rowan",
      owner,
      request: woodRequest(buffer.id),
      sourceLot: "wood-a",
      destination: buffer,
    }).ok,
    true,
  );
  const before = structuredClone(state);
  assert.deepEqual(
    reserve(state, {
      id: "transfer-b",
      actor: "sage",
      owner,
      request: woodRequest(buffer.id),
      sourceLot: "wood-b",
      destination: buffer,
    }),
    { ok: false, reason: "owner-busy" },
  );
  assert.deepEqual(state, before);
});

test("partial wood pickup splits once and preserves transfer ownership", () => {
  const state = fresh([
    {
      id: "wood-a",
      material: "wood",
      quantity: 6,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const buffer = constructionBuffer("wall-a", 4);
  const owner = { job: "build-wall-a", step: "construction-materials" };
  assert.equal(
    reserve(state, {
      id: "transfer-a",
      actor: "rowan",
      owner,
      request: woodRequest(buffer.id),
      sourceLot: "wood-a",
      destination: buffer,
    }).ok,
    true,
  );
  const picked = pickupTransfer(state, "transfer-a", access);
  assert.equal(picked.ok, true);
  assert.equal(picked.value.id, "lot-1");
  assert.equal(state.lots.find((lot) => lot.id === "wood-a").quantity, 4);
  assert.deepEqual(state.transfers[0].owner, owner);
  assert.deepEqual(state.transfers[0].phase, {
    kind: "carrying",
    lot: "lot-1",
  });
  assert.deepEqual(pickupTransfer(state, "transfer-a", access), {
    ok: false,
    reason: "wrong-phase",
  });
  assert.equal(
    state.lots.reduce((sum, lot) => sum + lot.quantity, 0),
    6,
  );
});

test("whole exact mugwort pickup and delivery retain the lot ID", () => {
  const state = fresh([
    {
      id: "herb-a",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const shelf = shelfContainer("shelf-a");
  assert.equal(
    reserve(state, {
      id: "store-a",
      actor: "rowan",
      owner: { job: "store-job", step: "shelf-store" },
      request: exactRequest("herb-a", shelf.id),
      sourceLot: "herb-a",
      destination: shelf,
    }).ok,
    true,
  );
  const picked = pickupTransfer(state, "store-a", access);
  assert.equal(picked.ok, true);
  assert.equal(picked.value.id, "herb-a");
  const delivered = deliverTransfer(state, "store-a", shelf, true);
  assert.equal(delivered.ok, true);
  assert.equal(delivered.value.id, "herb-a");
  assert.deepEqual(delivered.value.location, {
    kind: "container",
    container: shelf.id,
  });
  assert.equal(state.transfers.length, 0);
  assert.deepEqual(deliverTransfer(state, "store-a", shelf, true), {
    ok: false,
    reason: "transfer-not-found",
  });
});

test("interrupt releases a reservation or drops exactly the held lot", () => {
  const state = fresh([
    {
      id: "wood-a",
      material: "wood",
      quantity: 4,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const buffer = constructionBuffer("wall-a", 4);
  reserve(state, {
    id: "transfer-a",
    actor: "rowan",
    request: woodRequest(buffer.id),
    sourceLot: "wood-a",
    destination: buffer,
  });
  assert.equal(interruptTransfer(state, "rowan").value.kind, "released");
  assert.equal(state.lots[0].quantity, 4);

  reserve(state, {
    id: "transfer-b",
    actor: "rowan",
    request: woodRequest(buffer.id),
    sourceLot: "wood-a",
    destination: buffer,
  });
  pickupTransfer(state, "transfer-b", access);
  const before = structuredClone(state);
  assert.deepEqual(
    interruptTransfer(state, "rowan", { cell: cell(3), legal: false }),
    {
      ok: false,
      reason: "illegal-drop",
    },
  );
  assert.deepEqual(state, before);
  const dropped = interruptTransfer(state, "rowan", {
    cell: cell(3),
    legal: true,
  });
  assert.equal(dropped.value.kind, "dropped");
  assert.equal(state.transfers.length, 0);
  assert.deepEqual(state.lots.find((lot) => lot.id === "lot-1").location, {
    kind: "ground",
    ...cell(3),
  });
  assert.equal(
    state.lots.reduce((sum, lot) => sum + lot.quantity, 0),
    4,
  );
});

test("container release preflights every drop before ejecting or releasing", () => {
  const buffer = constructionBuffer("wall-a", 6);
  const state = fresh([
    {
      id: "stored",
      material: "wood",
      quantity: 2,
      location: { kind: "container", container: buffer.id },
    },
    {
      id: "incoming",
      material: "wood",
      quantity: 2,
      location: { kind: "ground", ...cell(1) },
    },
    {
      id: "reserved",
      material: "wood",
      quantity: 2,
      location: { kind: "ground", ...cell(2) },
    },
  ]);
  reserve(state, {
    id: "store-a",
    actor: "rowan",
    owner: { job: "build-job-a", step: "construction-materials" },
    request: woodRequest(buffer.id),
    sourceLot: "incoming",
    destination: buffer,
  });
  pickupTransfer(state, "store-a", access);
  reserve(state, {
    id: "store-b",
    actor: "sage",
    owner: { job: "build-job-b", step: "construction-materials" },
    request: woodRequest(buffer.id),
    sourceLot: "reserved",
    destination: buffer,
  });
  const before = structuredClone(state);
  assert.deepEqual(
    releaseContainer(state, buffer, {
      contentsDrop: { cell: cell(5), legal: true },
      carriedDrops: { rowan: { cell: cell(2), legal: false } },
    }),
    { ok: false, reason: "illegal-drop" },
  );
  assert.deepEqual(state, before);
  const released = releaseContainer(state, buffer, {
    contentsDrop: { cell: cell(5), legal: true },
    carriedDrops: { rowan: { cell: cell(2), legal: true } },
  });
  assert.equal(released.ok, true);
  assert.deepEqual(released.value.dropped, ["incoming"]);
  assert.deepEqual(released.value.contents, ["stored"]);
  assert.deepEqual(released.value.released, ["store-b"]);
  assert.deepEqual(released.value.owners, [
    { job: "build-job-a", step: "construction-materials" },
    { job: "build-job-b", step: "construction-materials" },
  ]);
  assert.equal(state.transfers.length, 0);
  assert.equal(
    state.lots.every((lot) => lot.location.kind === "ground"),
    true,
  );
});

test("construction embedding and authored salvage conserve wood exactly once", () => {
  const buffer = constructionBuffer("wall-a", 4);
  const state = fresh([
    {
      id: "wood-a",
      material: "wood",
      quantity: 2,
      location: { kind: "container", container: buffer.id },
    },
    {
      id: "wood-b",
      material: "wood",
      quantity: 2,
      location: { kind: "container", container: buffer.id },
    },
  ]);
  const embedded = embedConstruction(state, buffer);
  assert.equal(embedded.ok, true);
  assert.deepEqual(materialQuantity(state, "wood"), {
    live: 0,
    embedded: 4,
    consumed: 0,
  });
  assert.deepEqual(embedConstruction(state, buffer), {
    ok: false,
    reason: "embedding-exists",
  });
  const salvaged = salvageConstruction(state, buffer, 1, {
    cell: cell(4),
    legal: true,
  });
  assert.equal(salvaged.ok, true);
  assert.equal(salvaged.value.salvage.quantity, 1);
  assert.deepEqual(materialQuantity(state, "wood"), {
    live: 1,
    embedded: 0,
    consumed: 3,
  });
  assert.deepEqual(
    salvageConstruction(state, buffer, 1, { cell: cell(), legal: true }),
    {
      ok: false,
      reason: "embedding-not-found",
    },
  );
});
