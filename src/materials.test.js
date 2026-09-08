import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILDINGS,
  constructionBuffer,
  shelfContainer,
} from "./construction.js";
import {
  availableQuantity,
  acquirePailForOperation,
  containerBulk,
  containerContents,
  containerQuantity,
  createGroundLot,
  deliverTransfer,
  drawPailWater,
  embedConstruction,
  interruptTransfer,
  materialQuantity,
  moveContainerPortion,
  pickupTransfer,
  pourPailWater,
  releaseContainer,
  reserveTransfer,
  salvageConstruction,
  sourceContainer,
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
  vesselUses: [],
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
  const { request, owner, ...rest } = input;
  const { destination, ...requestWithoutDestination } = request;
  return reserveTransfer(state, {
    access,
    ...rest,
    owner: { kind: "job", ...owner },
    request: requestWithoutDestination,
    intent: { kind: "deliver", destination },
  });
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

test("construction embedding validates the recipe amount independently of staging capacity", () => {
  const wall = { ...constructionBuffer(site("wall-a")), capacity: 2 };
  const materials = fresh([
    {
      id: "buffered-wood",
      material: "wood",
      quantity: BUILDINGS.wall.wood,
      location: { kind: "container", container: wall.id },
    },
  ]);

  const embedded = embedConstruction(
    materials,
    wall,
    "wood",
    BUILDINGS.wall.wood,
  );
  assert.equal(embedded.ok, true);
  assert.deepEqual(embedded.value, {
    container: wall.id,
    material: "wood",
    quantity: BUILDINGS.wall.wood,
  });

  const mismatched = fresh([
    {
      id: "buffered-wood",
      material: "wood",
      quantity: BUILDINGS.wall.wood,
      location: { kind: "container", container: wall.id },
    },
  ]);
  assert.deepEqual(embedConstruction(mismatched, wall, "wood", 2), {
    ok: false,
    reason: "container-incomplete",
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
  assert.deepEqual(reserved.value.owner, { kind: "job", ...owner });
  assert.deepEqual(reserved.value.request, {
    source: request.source,
    quantityPolicy: request.quantityPolicy,
    quantity: request.quantity,
  });
  assert.deepEqual(reserved.value.intent, {
    kind: "deliver",
    destination: request.destination,
  });
  assert.deepEqual(reserved.value.phase, {
    kind: "reserved",
    sourceLot: "wood-one",
    quantity: 1,
    origin: { kind: "ground", cell: cell() },
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
  assert.deepEqual(transferForActor(materials, "rowan").owner, {
    kind: "job",
    ...owner,
  });
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

test("mixed shelf capacity is exact and stored wood withdraws into a normal wall", () => {
  const shelf = shelfContainer("shelf-a");
  const wall = constructionBuffer(site("wall-a", "wall"));
  const materials = fresh([
    {
      id: "stored-wood",
      material: "wood",
      quantity: 2,
      location: { kind: "container", container: shelf.id },
    },
    {
      id: "stored-herb-a",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: shelf.id },
    },
    {
      id: "stored-herb-b",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: shelf.id },
    },
    {
      id: "loose-overflow",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell(2, 2) },
    },
  ]);
  assert.equal(containerBulk(materials, shelf), 6);
  const full = reserve(materials, {
    id: "overflow",
    actor: "sedge",
    owner: { job: "job-overflow", step: "shelf-store" },
    request: {
      source: { kind: "exact-lot", lot: "loose-overflow" },
      quantityPolicy: "whole-lot",
      quantity: 1,
      destination: shelf.id,
    },
    sourceLot: "loose-overflow",
    destination: shelf,
  });
  assert.equal(full.ok, false);
  assert.equal(full.reason, "destination-full");
  assert.equal(
    reserve(materials, {
      id: "withdraw-wall",
      actor: "rowan",
      owner: { job: "job-wall", step: "construction-materials" },
      request: {
        source: {
          kind: "eligible-container",
          material: "wood",
          container: shelf.id,
        },
        quantityPolicy: "portion",
        quantity: 1,
        destination: wall.id,
      },
      sourceLot: "stored-wood",
      destination: wall,
    }).ok,
    true,
  );
  assert.equal(pickupTransfer(materials, "withdraw-wall", access).ok, true);
  assert.equal(
    deliverTransfer(materials, "withdraw-wall", wall, true).ok,
    true,
  );
  assert.equal(containerBulk(materials, shelf), 4);
  assert.equal(
    embedConstruction(materials, wall, "wood", BUILDINGS.wall.wood).ok,
    true,
  );
  assert.equal(materialQuantity(materials, "wood").embedded, 1);
});

test("an incompatible stored lot consumes nonzero physical bulk", () => {
  const shelf = shelfContainer("shelf-a");
  const materials = fresh([
    {
      id: "invalid-pail",
      material: "pail",
      quantity: 1,
      location: { kind: "container", container: shelf.id },
    },
    {
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
  ]);
  assert.equal(containerBulk(materials, shelf), Number.POSITIVE_INFINITY);
  const result = reserve(materials, {
    id: "store-wood",
    actor: "rowan",
    owner: { job: "job-store", step: "shelf-store" },
    request: {
      source: { kind: "exact-lot", lot: "wood-a" },
      quantityPolicy: "portion",
      quantity: 1,
      destination: shelf.id,
    },
    sourceLot: "wood-a",
    destination: shelf,
  });
  assert.deepEqual(result, { ok: false, reason: "destination-full" });
});

test("source eligibility is resolved before an unrelated use owner", () => {
  const materials = fresh([
    {
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
  ]);
  const result = reserveTransfer(materials, {
    id: "bad-use",
    actor: "rowan",
    owner: { kind: "operation", operation: "unrelated" },
    request: {
      source: { kind: "exact-lot", lot: "missing-pail" },
      quantityPolicy: "whole-lot",
      quantity: 1,
    },
    intent: { kind: "use", operation: "unrelated" },
    sourceLot: "wood-a",
    access,
  });
  assert.deepEqual(result, { ok: false, reason: "source-ineligible" });
});

test("incoming exact-lot capacity uses its carried payload after a partial pickup", () => {
  const herbCache = {
    id: "herb-cache-a",
    capacity: 3,
    accepts: ["mugwort"],
    bulk: { mugwort: 1 },
  };
  const shelf = {
    id: "shelf-a",
    capacity: 2,
    accepts: ["mugwort"],
    bulk: { mugwort: 1 },
  };
  const materials = fresh([
    {
      id: "mugwort-source",
      material: "mugwort",
      quantity: 2,
      location: { kind: "container", container: herbCache.id },
    },
    {
      id: "mugwort-other",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: herbCache.id },
    },
  ]);
  assert.equal(
    reserveTransfer(materials, {
      id: "incoming-mugwort",
      actor: "rowan",
      owner: { kind: "job", job: "job-mugwort", step: "supply" },
      request: {
        source: { kind: "exact-lot", lot: "mugwort-source" },
        quantityPolicy: "portion",
        quantity: 1,
      },
      intent: { kind: "deliver", destination: shelf.id },
      sourceLot: "mugwort-source",
      destination: shelf,
      access,
    }).ok,
    true,
  );
  assert.equal(pickupTransfer(materials, "incoming-mugwort", access).ok, true);
  materials.lots = materials.lots.filter((lot) => lot.id !== "mugwort-source");
  assert.equal(
    moveContainerPortion(materials, {
      source: herbCache,
      destination: shelf,
      sourceLot: "mugwort-other",
      material: "mugwort",
      quantity: 1,
      access,
    }).ok,
    true,
  );
});

test("ordinary transfers reject water hand cargo while vessel moves stay container-only", () => {
  const spring = {
    id: "source:spring-a",
    capacity: 2,
    accepts: ["water"],
    bulk: { water: 1 },
  };
  const kettle = {
    id: "kettle-a",
    capacity: 2,
    accepts: ["water"],
    bulk: { water: 1 },
  };
  const materials = fresh([
    {
      id: "water-source",
      material: "water",
      quantity: 1,
      location: { kind: "container", container: spring.id },
    },
    {
      id: "water-other",
      material: "water",
      quantity: 1,
      location: { kind: "container", container: spring.id },
    },
  ]);
  const input = {
    id: "water-transfer",
    actor: "rowan",
    owner: { kind: "job", job: "job-water", step: "supply" },
    request: {
      source: { kind: "exact-lot", lot: "water-source" },
      quantityPolicy: "whole-lot",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: kettle.id },
    sourceLot: "water-source",
    destination: kettle,
    access,
  };
  assert.deepEqual(reserveTransfer(materials, input), {
    ok: false,
    reason: "source-ineligible",
  });

  materials.transfers.push({
    ...input,
    phase: {
      kind: "reserved",
      sourceLot: "water-source",
      quantity: 1,
      origin: { kind: "container", container: spring.id },
    },
  });
  assert.deepEqual(pickupTransfer(materials, input.id, access), {
    ok: false,
    reason: "source-ineligible",
  });

  materials.lots[0].location = { kind: "hand", actor: "rowan" };
  materials.transfers[0].phase = { kind: "carrying", lot: "water-source" };
  assert.deepEqual(
    moveContainerPortion(materials, {
      source: spring,
      destination: kettle,
      sourceLot: "water-other",
      material: "water",
      quantity: 1,
      access,
    }),
    { ok: false, reason: "held-lot-invalid" },
  );
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
    owner: { kind: "job", ...input.owner },
  });
  assert.deepEqual(materials.lots[0].location, {
    kind: "ground",
    ...cell(3, 4),
  });
});

test("one held pail draws and pours exactly two finite water units", () => {
  const spring = {
    id: sourceContainer("feature:spring"),
    capacity: 8,
    accepts: ["water"],
    bulk: { water: 1 },
  };
  const kettle = {
    id: "kettle:future",
    capacity: 2,
    accepts: ["water"],
    bulk: { water: 1 },
  };
  const materials = fresh([
    {
      id: "pail-a",
      material: "pail",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
    {
      id: "source-lot:feature:spring",
      material: "water",
      quantity: 8,
      location: { kind: "container", container: spring.id },
    },
  ]);
  assert.equal(
    acquirePailForOperation(materials, {
      id: "pail-use-a",
      actor: "rowan",
      operation: "fill-kettle-a",
      vessel: "pail-a",
      access,
    }).ok,
    true,
  );
  assert.equal(pickupTransfer(materials, "pail-use-a", access).ok, true);
  assert.equal(
    drawPailWater(materials, {
      operation: "fill-kettle-a",
      source: spring,
      sourceLot: "source-lot:feature:spring",
      quantity: 2,
      access,
    }).ok,
    true,
  );
  assert.equal(containerQuantity(materials, spring.id, "water"), 6);
  assert.equal(containerQuantity(materials, "vessel:pail-a", "water"), 2);
  assert.equal(
    pourPailWater(materials, {
      operation: "fill-kettle-a",
      destination: kettle,
      sourceLot: "lot-1",
      quantity: 2,
      access,
    }).ok,
    true,
  );
  assert.equal(containerQuantity(materials, "vessel:pail-a", "water"), 0);
  assert.equal(containerQuantity(materials, kettle.id, "water"), 2);
  assert.equal(transferForActor(materials, "rowan").phase.kind, "carrying");
});

test("interrupting a filled held pail drops one vessel and closes its operation", () => {
  const spring = {
    id: sourceContainer("feature:spring"),
    capacity: 8,
    accepts: ["water"],
    bulk: { water: 1 },
  };
  const materials = fresh([
    {
      id: "pail-a",
      material: "pail",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    },
    {
      id: "source-lot:feature:spring",
      material: "water",
      quantity: 8,
      location: { kind: "container", container: spring.id },
    },
  ]);
  assert.equal(
    acquirePailForOperation(materials, {
      id: "pail-use-a",
      actor: "rowan",
      operation: "fill-kettle-a",
      vessel: "pail-a",
      access,
    }).ok,
    true,
  );
  assert.equal(pickupTransfer(materials, "pail-use-a", access).ok, true);
  assert.equal(
    drawPailWater(materials, {
      operation: "fill-kettle-a",
      source: spring,
      sourceLot: "source-lot:feature:spring",
      quantity: 2,
      access,
    }).ok,
    true,
  );
  assert.equal(
    interruptTransfer(materials, "rowan", { cell: cell(3, 3), legal: true }).ok,
    true,
  );
  assert.equal(materials.transfers.length, 0);
  assert.deepEqual(materials.vesselUses, []);
  assert.equal(containerQuantity(materials, "vessel:pail-a", "water"), 2);
  assert.deepEqual(materials.lots.find((lot) => lot.id === "pail-a").location, {
    kind: "ground",
    ...cell(3, 3),
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
  assert.equal(
    embedConstruction(materials, door, "wood", BUILDINGS.door.wood).ok,
    true,
  );
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
    owner: { kind: "job", job: "job-held", step: "step" },
    request: {
      source: { kind: "eligible-ground", material: "wood" },
      quantityPolicy: "portion",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: "container-a" },
    phase: { kind: "carrying", lot: "held" },
  });
  assert.equal(
    interruptTransfer(interrupted, "rowan", { cell: at, legal: true }).ok,
    true,
  );
  assertGround(interrupted.lots[0].location);

  const container = {
    id: "container-a",
    capacity: 2,
    accepts: ["wood"],
    bulk: { wood: 1, mugwort: 1 },
  };
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
    owner: { kind: "job", job: "job-carried", step: "step" },
    request: {
      source: { kind: "eligible-ground", material: "wood" },
      quantityPolicy: "portion",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: container.id },
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
