import test from "node:test";
import assert from "node:assert/strict";
import { createClearing } from "./clearing.ts";
import { snapshotFor, restoreSnapshot } from "./clearing-state.ts";
import {
  excavateTerrain,
  terrainFacts,
  exchangeTerrainWater,
  parseClosedTerrain,
} from "./terrain.ts";
import {
  createGroundLot,
  moveContainerPortions,
  pickupTransfer,
  selectContainerPortions,
  containerQuantity,
} from "./materials.ts";
import { portableContainerInterior } from "./item-containers.ts";
import { sourceContainerSpec } from "./finite-sources.ts";
import { finiteWorkOwner } from "./water-delivery.ts";
import { advanceFiniteWork } from "./engine/work/progress.ts";
import { BUILDINGS, constructionBuffer, brewKettle } from "./construction.js";
import {
  FIELD_WATER,
  fieldWaterBalance,
  fieldWaterSources,
  drawFieldWater,
  returnFieldWater,
} from "./field-water.ts";
const access = { sourceReachable: true, destinationReachableWithPayload: true };
const reference = {
  binding: FIELD_WATER.id,
  nodeId: "reservoir:column-p0-p128",
};
function pit(state) {
  return terrainFacts(state.terrain).soil.nodes.find(
    (n) => n.nodeId === reference.nodeId,
  );
}
function fixture() {
  const state = createClearing();
  state.terrain = excavateTerrain(state.terrain, [0, 14, 128]);
  assert(
    createGroundLot(state.materials, "soil", 1, { x: 6, z: 9, level: 0 }).ok,
  );
  const station = {
    id: "station",
    type: "brew-station",
    x: 7,
    z: 5,
    level: 0,
    direction: 0,
    work: BUILDINGS["brew-station"].ticks,
    finishedAt: 0,
  };
  state.sites.push(station);
  state.materials.embedded.push({
    container: constructionBuffer(station).id,
    material: "wood",
    quantity: 6,
  });
  state.felled = 1;
  const pail = state.materials.lots.find((l) => l.material === "pail");
  pail.location = { kind: "ground", x: 7, z: 10, level: 0 };
  const interior = portableContainerInterior(pail);
  const source = sourceContainerSpec(
    state.sources.find((s) => s.kind === "spring"),
  );
  const portion = selectContainerPortions(
    state.materials,
    source.id,
    "water",
    2,
  );
  assert(
    moveContainerPortions(state.materials, {
      source,
      destination: interior,
      material: "water",
      quantity: 2,
      portions: portion.portions,
      access,
    }).ok,
  );
  const operation = {
    kind: "water-delivery",
    id: "water-operation",
    job: "water-job",
    target: { kind: "kettle", station: station.id },
    quantity: 2,
    pail: pail.id,
    supply: { kind: "container", container: source.id },
    execution: { phase: "acquire" },
  };
  state.jobs.push({
    id: operation.job,
    kind: "fill-kettle",
    target: station.id,
    scope: { party: "home", actors: null },
    reason: "Ordered",
    routine: false,
  });
  assert(
    finiteWorkOwner.admit(state.operations, state.materials, operation, {
      kind: "vessel",
      request: {
        id: "use",
        operation: operation.id,
        actor: "rowan",
        vessel: pail.id,
        access,
      },
    }).ok,
  );
  assert(pickupTransfer(state.materials, "use", access).ok);
  // A lawful intermediate work phase, constructed without advancing a different
  // clock. Actual optimizer routing is the separate all-consumer integration law.
  advanceFiniteWork(
    operation,
    { kind: "vessel", interruption: "park" },
    {
      acquire: () => "ready",
      draw: () => ({ status: "pending" }),
      deliver() {
        throw Error("not delivered");
      },
      consume() {
        throw Error("not consumed");
      },
    },
  );
  state.actors.rowan.mode = "water-delivery";
  state.actors.rowan.task = {
    kind: "water-delivery",
    job: operation.job,
    target: operation.id,
    duration: 1,
  };
  state.actors.rowan.assignment = {
    character: "rowan",
    task: operation.job,
    cost: 0,
  };
  assert.doesNotThrow(() => snapshotFor(state));
  return { state, operation, interior, station };
}
function deposit(f, quantity = 2) {
  return returnFieldWater(f.state, {
    ...reference,
    operation: f.operation.id,
    quantity,
    portions: selectContainerPortions(
      f.state.materials,
      f.interior.id,
      "water",
      quantity,
    ).portions,
  });
}
function draw(f, quantity = 2) {
  return drawFieldWater(f.state, {
    ...reference,
    operation: f.operation.id,
    quantity,
  });
}
function unchanged(f, action) {
  const before = JSON.stringify(f.state),
    materials = f.state.materials,
    terrain = f.state.terrain;
  assert.equal(action().ok, false);
  assert.equal(JSON.stringify(f.state), before);
  assert.equal(f.state.materials, materials);
  assert.equal(f.state.terrain, terrain);
}

test("paid held water returns to the actual pit and is drawn back with one material/field balance and current save", () => {
  const f = fixture(),
    original = f.state.materials,
    before = fieldWaterBalance(f.state);
  assert.equal(pit(f.state).massKg, 0);
  assert(deposit(f).ok);
  assert.equal(
    f.state.materials,
    original,
    "work callback retains material owner handle",
  );
  assert.equal(pit(f.state).massKg, 2);
  assert.equal(containerQuantity(f.state.materials, f.interior.id, "water"), 0);
  assert.equal(
    fieldWaterBalance(f.state).materialUnits,
    before.materialUnits - 2,
  );
  assert.deepEqual(f.state.materials.sinks, []);
  const saved = snapshotFor(f.state);
  assert.equal(saved.schema, 20);
  assert.deepEqual(restoreSnapshot(saved).state.terrain, f.state.terrain);
  assert.deepEqual(restoreSnapshot(saved).state.materials, f.state.materials);
  assert.throws(() => parseClosedTerrain(f.state.terrain), /no external/);
  assert(
    fieldWaterSources(f.state).some(
      (s) => s.nodeId === reference.nodeId && s.availableUnits === 2,
    ),
  );
  const drawn = draw(f);
  assert(drawn.ok, drawn.reason);
  assert.equal(pit(f.state).massKg, 0);
  assert.equal(fieldWaterBalance(f.state).materialUnits, before.materialUnits);
  assert.equal(containerQuantity(f.state.materials, f.interior.id, "water"), 2);
  assert.doesNotThrow(() => snapshotFor(f.state));
  assert.deepEqual(f.state.materials.sinks, []);
});

test("late field failure, full vessel, wrong custody, paused time and bad portions cannot publish half a transfer", () => {
  const f = fixture();
  unchanged(f, () => draw(f)); // full material destination, dry physical source
  assert(deposit(f).ok);
  const allocator = f.state.materials.nextLotId;
  f.state.materials.nextLotId = Number.MAX_SAFE_INTEGER;
  unchanged(f, () => draw(f));
  f.state.materials.nextLotId = allocator;
  f.state.actors.rowan.x = 6;
  unchanged(f, () => draw(f));
  f.state.actors.rowan.x = 7;
  f.state.paused = true;
  unchanged(f, () => draw(f));
  f.state.paused = false;
  assert(draw(f).ok);
  unchanged(f, () =>
    returnFieldWater(f.state, {
      ...reference,
      operation: f.operation.id,
      quantity: 2,
      portions: [{ lot: "missing", quantity: 2 }],
    }),
  );
  // Leave one kg in the field and an empty actual pail. The other authored
  // unit moves into the actual constructed kettle through the material owner.
  assert(deposit(f, 1).ok);
  const one = selectContainerPortions(
    f.state.materials,
    f.interior.id,
    "water",
    1,
  );
  assert(
    moveContainerPortions(f.state.materials, {
      source: f.interior,
      destination: brewKettle(f.station),
      material: "water",
      quantity: 1,
      portions: one.portions,
      access,
    }).ok,
  );
  assert.doesNotThrow(() => snapshotFor(f.state));
  assert.equal(pit(f.state).massKg, 1);
  unchanged(f, () => draw(f, 2)); // material preflight fits; real field debit rejects
});

test("world admission rejects plausible unpaired physical and material edits instead of moving the initial reference", () => {
  const f = fixture();
  for (const change of [
    (s) => {
      s.terrain = exchangeTerrainWater(s.terrain, {
        nodeId: reference.nodeId,
        direction: "deposit",
        massKg: 1,
      }).state;
    },
    (s) => {
      s.materials.lots.find((l) => l.material === "water").quantity--;
    },
    (s) => {
      const source = s.terrain.exports[0];
      source.waterKg--;
    },
  ]) {
    const bad = structuredClone(f.state);
    change(bad);
    assert.throws(() => snapshotFor(bad), /water|quantity/);
  }
});
