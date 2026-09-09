import { createHeldFieldFixture as fixture } from "../tools/engine-do/goblin-field-fixture.ts";
import test from "node:test";
import assert from "node:assert/strict";
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
  selectContainerPortions,
  containerQuantity,
} from "./materials.ts";
import { brewKettle } from "./construction.js";
import {
  fieldWaterBalance,
  drawFieldWater,
  returnFieldWater,
} from "./field-water.ts";
import { FIELD_WATER, fieldWaterSources } from "./field-water-source.ts";
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
  // The host-return fixture starts bound to the finite spring. Drawing back is
  // a distinct admitted field intent; the primitive may not invent this change.
  f.operation.supply = { kind: "field", ...reference };
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
  f.operation.supply = { kind: "field", ...reference };
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

test("Goblin Region returns one held portion pair across rollback, lost acknowledgement and reopening", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const { readFile } = await import("node:fs/promises");
  const { loadOptimizer } = await import("./engine/colony/loader.ts");
  const { createGoblinRegionProgram } =
    await import("./world-presets/goblin-region.ts");
  const { openRegion } = await import("./engine/region/index.ts");
  const { sqliteTestOwner } =
    await import("./engine/region/sqlite-test-owner.mjs");
  const { serializeClearing } = await import("./clearing-state.ts");
  const colony = await loadOptimizer(
    await WebAssembly.compile(
      await readFile(new URL("./engine/colony/colony.wasm", import.meta.url)),
    ),
  );
  const f = fixture(),
    db = new DatabaseSync(":memory:");
  f.operation.supply = { kind: "field", ...reference };
  t.after(() => db.close());
  let fail = false;
  const owner = sqliteTestOwner(db, (sql) => {
    if (fail && sql.startsWith("INSERT INTO hive_region_receipts"))
      throw new Error("injected-paired-receipt-write");
  });
  // Lawful authored intermediate work from the same fixture as the primitive
  // laws. Only initial content differs; commands, parsing and execution are the
  // actual Goblin program. This is not an earned-work or native-DO witness.
  const program = {
    ...createGoblinRegionProgram(colony),
    initial: () => ({ clearing: serializeClearing(f.state) }),
  };
  const open = () => openRegion({ owner, region: "field-vessel", program });
  const region = open(),
    before = region.readCommitted();
  const request = {
    id: "return-held-water",
    expectedRevision: 0,
    command: {
      kind: "return-field-water",
      ...reference,
      operation: f.operation.id,
      quantity: 2,
      portions: selectContainerPortions(
        f.state.materials,
        f.interior.id,
        "water",
        2,
      ).portions,
    },
  };
  assert.throws(
    () => region.dispatch("goblin-player", request),
    /region-forbidden/,
  );
  assert.deepEqual(region.readCommitted(), before);
  fail = true;
  assert.throws(
    () => region.dispatch("goblin-host", request),
    /injected-paired-receipt-write/,
  );
  assert.deepEqual(region.readCommitted(), before);
  assert.deepEqual(open().readCommitted(), before);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM hive_region_receipts").get().n,
    0,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM hive_region_events").get().n,
    0,
  );
  fail = false;
  const receipt = region.dispatch("goblin-host", request),
    paid = region.readCommitted();
  assert.equal(receipt.status, "applied");
  assert.equal(paid.revision, 1);
  assert.equal(pit(paid.state.clearing).massKg, 2);
  assert.equal(
    containerQuantity(paid.state.clearing.materials, f.interior.id, "water"),
    0,
  );
  assert.deepEqual(paid.state.clearing.materials.sinks, []);
  assert.equal(fieldWaterBalance(paid.state.clearing).residualKg, 0);
  const reopened = open();
  assert.deepEqual(reopened.readCommitted(), paid);
  assert.deepEqual(reopened.dispatch("goblin-host", request), receipt);
  assert.deepEqual(reopened.readCommitted(), paid);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM hive_region_events").get().n,
    1,
  );
  assert.equal(
    reopened.dispatch("goblin-host", {
      ...request,
      id: "return-empty-again",
      expectedRevision: 1,
    }).status,
    "rejected",
  );
  assert.deepEqual(reopened.readCommitted(), paid);
  // The next ordinary host tick executes the actual work callback: acquire the
  // already-held pail, draw its recorded field supply and begin delivery. A
  // later receipt failure must roll back that draw, progress and field step.
  const work = {
    id: "draw-and-walk",
    expectedRevision: 1,
    command: { kind: "advance", ticks: 1 },
  };
  fail = true;
  assert.throws(
    () => reopened.dispatch("goblin-host", work),
    /injected-paired-receipt-write/,
  );
  assert.deepEqual(open().readCommitted(), paid);
  fail = false;
  const worked = reopened.dispatch("goblin-host", work),
    carrying = reopened.readCommitted();
  assert.equal(worked.status, "applied");
  assert.equal(carrying.state.clearing.tick, paid.state.clearing.tick + 1);
  assert.equal(
    carrying.state.clearing.operations[0].execution.phase,
    "deliver",
  );
  assert.equal(
    terrainFacts(carrying.state.clearing.terrain).balance.exchangeWaterKg,
    0,
  );
  assert.equal(
    containerQuantity(
      carrying.state.clearing.materials,
      f.interior.id,
      "water",
    ),
    2,
  );
  assert.equal(fieldWaterBalance(carrying.state.clearing).residualKg, 0);
  const resumed = open();
  assert.deepEqual(resumed.readCommitted(), carrying);
  assert.deepEqual(resumed.dispatch("goblin-host", work), worked);
  assert.deepEqual(resumed.readCommitted(), carrying);
  resumed.dispatch("goblin-host", {
    id: "continue-walk",
    expectedRevision: 2,
    command: { kind: "advance", ticks: 1 },
  });
  assert.equal(
    terrainFacts(resumed.readCommitted().state.clearing.terrain).balance
      .exchangeWaterKg,
    0,
  );
});

test("return cannot invalidate a contents-only or masked missing supply reference", () => {
  for (const supply of [
    { kind: "contents" },
    { kind: "container", container: "missing-external-source" },
  ]) {
    const f = fixture();
    f.operation.supply = supply;
    assert.doesNotThrow(() => snapshotFor(f.state));
    unchanged(f, () => deposit(f, 1));
    assert.doesNotThrow(() => snapshotFor(f.state));
    assert.equal(pit(f.state).massKg, 0);
    assert.equal(
      containerQuantity(f.state.materials, f.interior.id, "water"),
      2,
    );
  }
});

test("field withdrawal cannot bypass the operation's recorded source", () => {
  const f = fixture();
  assert(deposit(f).ok);
  const request = { ...reference, operation: f.operation.id, quantity: 1 };
  unchanged(f, () => drawFieldWater(f.state, request));
  f.state.terrain = excavateTerrain(f.state.terrain, [1, 14, 128]);
  assert(
    createGroundLot(f.state.materials, "soil", 1, { x: 6, z: 9, level: 0 }).ok,
  );
  f.operation.supply = {
    kind: "field",
    ...reference,
    nodeId: "reservoir:column-p1-p128",
  };
  unchanged(f, () => {
    const rejected = drawFieldWater(f.state, request);
    assert.equal(rejected.reason, "field-supply-mismatch");
    return rejected;
  });
  assert.equal(pit(f.state).massKg, 2);
  assert.equal(containerQuantity(f.state.materials, f.interior.id, "water"), 0);
  assert.doesNotThrow(() => snapshotFor(f.state));
});
