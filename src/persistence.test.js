import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClearing } from "./clearing.ts";
import {
  decideReplaceRevision,
  decideSaveRevision,
  restoreSnapshot,
  snapshotFor,
} from "./persistence.ts";

const cell = (x = 5, z = 5, level = 0) => ({ x, z, level });
const scope = { party: "home", actors: null };
function envelope(change) {
  const saved = snapshotFor(createClearing());
  change(saved.savedState);
  for (const transfer of saved.savedState.materials.transfers) {
    if (transfer.resolvedMaterial !== undefined) continue;
    const lotId = transfer.phase.kind === "carrying" ? transfer.phase.lot : transfer.phase.sourceLot;
    transfer.resolvedMaterial = saved.savedState.materials.lots.find((lot) => lot.id === lotId)?.material ?? "wood";
  }
  return saved;
}
function v14Envelope(change = () => {}) {
  const saved = JSON.parse(readFileSync(new URL("./fixtures/clearing-v14.json", import.meta.url), "utf8"));
  change(saved.savedState);
  return saved;
}
function v10Envelope(change = () => {}) {
  const saved = v14Envelope();
  const predecessor = structuredClone(saved);
  predecessor.schema = 10;
  delete predecessor.savedState.terrain;
  delete predecessor.savedState.materials.sinks;
  for (const herb of predecessor.savedState.herbs) delete herb.establishment;
  delete predecessor.savedState.processes;
  for (const actor of Object.values(predecessor.savedState.actors))
    delete actor.allowedWork.craft;
  predecessor.savedState.materials.vesselUses = [];
  delete predecessor.savedState.materials.bindings;
  delete predecessor.savedState.materials.transformations;
  predecessor.savedState.materials.lots =
    predecessor.savedState.materials.lots.filter(
      (lot) =>
        !["malt", "barm", "keg", "ale", "spent-grain"].includes(lot.material),
    );
  change(predecessor.savedState);
  for (const operation of predecessor.savedState.operations) delete operation.kind;
  return predecessor;
}
function v11Envelope(change = () => {}) {
  const predecessor = v14Envelope();
  predecessor.schema = 11;
  delete predecessor.savedState.terrain;
  delete predecessor.savedState.materials.sinks;
  for (const herb of predecessor.savedState.herbs) delete herb.establishment;
  delete predecessor.savedState.processes;
  for (const actor of Object.values(predecessor.savedState.actors))
    delete actor.allowedWork.craft;
  change(predecessor.savedState);
  for (const operation of predecessor.savedState.operations) delete operation.kind;
  return predecessor;
}
function rejects(name, change, pattern) {
  test(name, () => {
    assert.throws(() => restoreSnapshot(envelope(change)), pattern);
  });
}
function site(id, type = "wall", overrides = {}) {
  return {
    id,
    type,
    ...cell(),
    direction: 0,
    work: 0,
    finishedAt: null,
    ...overrides,
  };
}
function job(id, kind = "chop", target = "oak-1", overrides = {}) {
  return {
    id,
    kind,
    target,
    scope,
    reason: "Ordered",
    routine: false,
    ...overrides,
  };
}
function transfer(id, overrides = {}) {
  return {
    id,
    actor: "rowan",
    owner: { kind: "job", job: "job-build", step: "construction-materials" },
    request: {
      source: { kind: "eligible-ground", material: "wood" },
      quantityPolicy: "portion",
      quantity: 1,
    },
    intent: { kind: "deliver", destination: "construction-buffer:site-a" },
    phase: {
      kind: "reserved",
      sourceLot: "wood-a",
      quantity: 1,
      origin: { kind: "ground", cell: cell() },
    },
    ...overrides,
  };
}
function recipeBinding(id, station, { malt, water, mugwort, wood, barm, keg }) {
  return {
    kind: "recipe",
    id,
    definition: "herbal-ale-v1",
    station: `kettle:${station}`,
    consumed: [
      { role: "malt", lot: malt, material: "malt", quantity: 2 },
      { role: "water", lot: water, material: "water", quantity: 2 },
      { role: "mugwort", lot: mugwort, material: "mugwort", quantity: 1 },
      { role: "fuel", lot: wood, material: "wood", quantity: 1 },
    ],
    retained: [
      { role: "catalyst", lot: barm, material: "barm", quantity: 1 },
      { role: "package", lot: keg, material: "keg", quantity: 1 },
    ],
    promises: [
      {
        role: "ale",
        destination: `vessel:${keg}`,
        material: "ale",
        quantity: 4,
      },
      {
        role: "spent-grain",
        destination: `brew-tray:${station}`,
        material: "spent-grain",
        quantity: 1,
      },
    ],
  };
}
function heldPailUse(state, operation) {
  state.materials.lots.push({
    id: "pail-collision",
    material: "pail",
    quantity: 1,
    location: { kind: "hand", actor: "rowan" },
  });
  state.materials.bindings.push({
    kind: "vessel-use",
    id: operation,
    vessel: "pail-collision",
  });
  state.materials.transfers.push({
    id: "pail-collision-transfer",
    actor: "rowan",
    owner: { kind: "operation", operation },
    request: {
      source: { kind: "exact-lot", lot: "pail-collision" },
      quantityPolicy: "whole-lot",
      quantity: 1,
    },
    intent: { kind: "use", operation },
    phase: { kind: "carrying", lot: "pail-collision" },
  });
}
function buildSupplyEnvelope() {
  return envelope((state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push(
      {
        id: "hand-wood",
        material: "wood",
        quantity: 1,
        location: { kind: "hand", actor: "rowan" },
      },
      {
        id: "wood-rest",
        material: "wood",
        quantity: 5,
        location: { kind: "ground", ...cell(4, 4) },
      },
    );
    state.materials.transfers.push(
      transfer("transfer-build", {
        phase: { kind: "carrying", lot: "hand-wood" },
      }),
    );
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-build",
      target: "transfer-build",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
    state.felled = 1;
  });
}

test("v16 snapshots retain authored terrain, omit commands, and restore paused", () => {
  const state = createClearing();
  state.commands.push({
    kind: "recruit",
    party: "home",
    actor: "sedge",
    tick: 0,
  });
  const saved = snapshotFor(state);
  assert.equal(saved.schema, 16);
  assert.deepEqual(saved.savedState.terrain, {
    base: "authored-clearing-v1",
    edits: [],
    revision: 0,
  });
  assert.equal("commands" in saved.savedState, false);
  const restored = restoreSnapshot(saved);
  assert.deepEqual(restored.state.commands, []);
  assert.equal(restored.state.paused, true);
});

test("schema 13 stays frozen while schema 14 rejects malformed terrain edits and soil sinks", () => {
  const predecessor = v14Envelope();
  predecessor.schema = 13;
  delete predecessor.savedState.terrain;
  predecessor.savedState.materials.lots.push({
    id: "future-soil",
    material: "soil",
    quantity: 1,
    location: { kind: "ground", ...cell(5, 5) },
  });
  assert.throws(() => restoreSnapshot(predecessor));

  const occupiedEdit = envelope((state) => {
    state.terrain.edits.push({ x: 1, z: 1, level: 0 });
    state.materials.lots.push({
      id: "soil-rim",
      material: "soil",
      quantity: 1,
      location: { kind: "ground", ...cell(5, 5) },
    });
  });
  assert.throws(() => restoreSnapshot(occupiedEdit), /terrain edit/);

  const soilSink = envelope((state) => {
    state.materials.sinks.push({
      id: "buried-soil",
      material: "soil",
      quantity: 1,
    });
  });
  assert.throws(() => restoreSnapshot(soilSink));
});

test("strict schema 11 converts Craft defaults but rejects schema-12 Brew fields", () => {
  const restored = restoreSnapshot(v11Envelope());
  assert.equal(restored.state.actors.rowan.allowedWork.craft, true);
  const malformed = v11Envelope((state) => {
    state.jobs.push(job("future-brew", "brew", "station-a"));
  });
  assert.throws(() => restoreSnapshot(malformed));
});

test("station endpoint catalogue restores checked slots and rejects mismatches", () => {
  const saved = envelope((state) => {
    const cache = state.sources.find(
      (source) => source.kind === "reclaimed-timber-cache",
    );
    const spring = state.sources.find((source) => source.kind === "spring");
    state.sites.push(site("station-a", "brew-station", { finishedAt: 0 }));
    state.materials.embedded.push({
      container: "construction-buffer:station-a",
      material: "wood",
      quantity: 6,
    });
    state.felled = 1;
    state.harvestedHerbs = 1;
    state.materials.lots.find(
      (lot) => lot.id === `source-lot:${spring.id}`,
    ).quantity = 6;
    state.materials.lots.find(
      (lot) => lot.id === `source-lot:${cache.id}`,
    ).quantity = 9;
    state.materials.lots.find(
      (lot) => lot.id === `source-malt-lot:${cache.id}`,
    ).quantity = 2;
    state.materials.lots.find(
      (lot) => lot.id === `source-barm-lot:${cache.id}`,
    ).location = { kind: "container", container: "brew-barm:station-a" };
    state.materials.lots.find(
      (lot) => lot.id === `source-keg-lot:${cache.id}`,
    ).location = { kind: "container", container: "brew-keg:station-a" };
    state.materials.lots.push(
      {
        id: "water-stage",
        material: "water",
        quantity: 2,
        location: { kind: "container", container: "kettle:station-a" },
      },
      {
        id: "malt-stage",
        material: "malt",
        quantity: 2,
        location: { kind: "container", container: "kettle:station-a" },
      },
      {
        id: "mugwort-stage",
        material: "mugwort",
        quantity: 1,
        location: { kind: "container", container: "kettle:station-a" },
      },
      {
        id: "wood-stage",
        material: "wood",
        quantity: 1,
        location: { kind: "container", container: "brew-hearth:station-a" },
      },
    );
    state.jobs.push(job("brew-job", "brew", "station-a"));
    state.materials.bindings.push(
      recipeBinding("brew-process", "station-a", {
        malt: "malt-stage",
        water: "water-stage",
        mugwort: "mugwort-stage",
        wood: "wood-stage",
        barm: `source-barm-lot:${cache.id}`,
        keg: `source-keg-lot:${cache.id}`,
      }),
    );
    state.processes.push({
      id: "brew-process",
      job: "brew-job",
      station: "station-a",
      binding: "brew-process",
      phase: "prepare",
      progress: 0,
      enteredAt: 0,
    });
  });
  assert.doesNotThrow(() => restoreSnapshot(saved));
  const unknown = structuredClone(saved);
  unknown.savedState.materials.lots.find(
    (lot) => lot.id === "malt-stage",
  ).location = { kind: "container", container: "kettle:missing" };
  assert.throws(
    () => restoreSnapshot(unknown),
    /recipe binding brew-process has invalid consumed lot malt-stage/,
  );
  const wrongTarget = structuredClone(saved);
  wrongTarget.savedState.jobs.find((entry) => entry.id === "brew-job").target =
    "another-station";
  assert.throws(
    () => restoreSnapshot(wrongTarget),
    /brew process brew-process has invalid phase or binding/,
  );

  const settled = structuredClone(saved);
  const settledState = settled.savedState;
  const binding = settledState.materials.bindings.find(
    (entry) => entry.kind === "recipe" && entry.id === "brew-process",
  );
  settledState.materials.lots = settledState.materials.lots.filter(
    (lot) =>
      !["malt-stage", "water-stage", "mugwort-stage", "wood-stage"].includes(
        lot.id,
      ),
  );
  settledState.materials.lots.push(
    {
      id: "ale-output",
      material: "ale",
      quantity: 4,
      location: {
        kind: "container",
        container: `vessel:${binding.retained.find((entry) => entry.role === "package").lot}`,
      },
    },
    {
      id: "spent-output",
      material: "spent-grain",
      quantity: 1,
      location: { kind: "container", container: "brew-tray:station-a" },
    },
  );
  settledState.materials.bindings = [];
  settledState.materials.transformations = [
    {
      id: binding.id,
      definition: binding.definition,
      inputs: binding.consumed,
      settlement: {
        station: binding.station,
        retained: binding.retained,
        outputs: binding.promises,
      },
    },
  ];
  settledState.jobs = [];
  settledState.processes = [];
  assert.doesNotThrow(() => restoreSnapshot(settled));
  const tapping = structuredClone(settled);
  tapping.savedState.materials.consumptions = [
    {
      id: "tap-receipt",
      transformation: "brew-process",
      role: "ale",
      material: "ale",
      quantity: 1,
    },
  ];
  tapping.savedState.jobs.push({
    ...job("tap-job", "tap", "station-a"),
    transformation: "brew-process",
    progress: 0,
  });
  assert.doesNotThrow(() => restoreSnapshot(tapping));
  const duplicateServing = structuredClone(tapping);
  for (let index = 2; index <= 5; index++)
    duplicateServing.savedState.materials.consumptions.push({
      ...duplicateServing.savedState.materials.consumptions[0],
      id: `tap-receipt-${index}`,
    });
  assert.throws(
    () => restoreSnapshot(duplicateServing),
    /exceeds settled output/,
  );
  const mismatchedTap = structuredClone(tapping);
  mismatchedTap.savedState.jobs[0].transformation = "missing-receipt";
  assert.throws(
    () => restoreSnapshot(mismatchedTap),
    /tap job tap-job lacks settled station receipt/,
  );
  const liveClear = structuredClone(tapping);
  liveClear.savedState.materials.consumptions = [
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `tap-complete-${index + 1}`,
      transformation: "brew-process",
      role: "ale",
      material: "ale",
      quantity: 1,
    })),
  ];
  liveClear.savedState.materials.lots =
    liveClear.savedState.materials.lots.filter(
      (lot) => lot.id !== "ale-output",
    );
  liveClear.savedState.jobs = [
    {
      ...job("clear-job", "clear-spent-grain", "station-a"),
      transformation: "brew-process",
      progress: 0,
    },
  ];
  assert.doesNotThrow(() => restoreSnapshot(liveClear));
  const clearingSpent = structuredClone(liveClear);
  clearingSpent.savedState.materials.lots =
    clearingSpent.savedState.materials.lots.filter(
      (lot) => lot.id !== "spent-output",
    );
  clearingSpent.savedState.materials.consumptions.push({
    id: "discard-receipt",
    transformation: "brew-process",
    role: "spent-grain",
    material: "spent-grain",
    quantity: 1,
  });
  clearingSpent.savedState.jobs = [];
  assert.doesNotThrow(() => restoreSnapshot(clearingSpent));
  const corruptClear = structuredClone(clearingSpent);
  corruptClear.savedState.materials.consumptions.find(
    (entry) => entry.id === "discard-receipt",
  ).role = "not-an-output";
  assert.throws(
    () => restoreSnapshot(corruptClear),
    /recipe consumption discard-receipt has invalid output/,
  );
  const staleClear = structuredClone(clearingSpent);
  staleClear.savedState.jobs.push({
    ...job("stale-clear", "clear-spent-grain", "station-a"),
    transformation: "brew-process",
    progress: 0,
  });
  assert.throws(
    () => restoreSnapshot(staleClear),
    /clear job stale-clear has invalid station or progress/,
  );
  const doubleAle = structuredClone(tapping);
  doubleAle.savedState.materials.consumptions[0].quantity = 2;
  assert.throws(
    () => restoreSnapshot(doubleAle),
    /recipe consumption tap-receipt has invalid output/,
  );
  const mismatchedReceipt = structuredClone(settled);
  mismatchedReceipt.savedState.materials.transformations[0].settlement.outputs[0].destination =
    "brew-tray:station-a";
  assert.throws(
    () => restoreSnapshot(mismatchedReceipt),
    /transformation brew-process does not match recipe binding/,
  );
});

test("valid schema 10 converts bindings and introduces cache supplies once", () => {
  const restored = restoreSnapshot(v10Envelope());
  assert.equal(snapshotFor(restored.state).schema, 16);
  assert.deepEqual(restored.state.sources.map((source) => source.kind).sort(), [
    "reclaimed-timber-cache",
    "spring",
  ]);
  const spring = restored.state.sources.find(
    (source) => source.kind === "spring",
  );
  restored.state.materials.lots.find(
    (lot) =>
      lot.location.kind === "container" &&
      lot.location.container === `source:${spring.id}`,
  ).quantity = 6;
  restored.state.materials.lots.push(
    {
      id: "pail-a",
      material: "pail",
      quantity: 1,
      location: { kind: "ground", ...cell(4, 4) },
    },
    {
      id: "pail-water-a",
      material: "water",
      quantity: 2,
      location: { kind: "container", container: "vessel:pail-a" },
    },
  );
  const reloaded = restoreSnapshot(snapshotFor(restored.state));
  assert.equal(
    reloaded.state.materials.lots.find(
      (lot) =>
        lot.location.kind === "container" &&
        lot.location.container === `source:${spring.id}`,
    ).quantity,
    6,
  );
});

test("schema 10 load boundary rejects schema-11 materials and transfer policies", () => {
  const material = v10Envelope((state) => {
    state.materials.lots.push({
      id: "forbidden-malt",
      material: "malt",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
  });
  assert.throws(() => restoreSnapshot(material));
  const request = v10Envelope((state) => {
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push({
      id: "forbidden-request",
      actor: "rowan",
      owner: { kind: "job", job: "missing", step: "step" },
      request: {
        source: { kind: "eligible-ground", material: "malt" },
        quantityPolicy: "portion",
        quantity: 1,
      },
      intent: { kind: "deliver", destination: "construction-buffer:missing" },
      phase: {
        kind: "reserved",
        sourceLot: "wood-a",
        quantity: 1,
        origin: { kind: "ground", cell: cell() },
      },
    });
  });
  assert.throws(() => restoreSnapshot(request));
});

test("invalid schema 10 transfer relations reject before conversion", () => {
  const predecessor = v10Envelope((state) => {
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push({
      id: "invalid-v8-transfer",
      actor: "rowan",
      owner: {
        kind: "job",
        job: "missing-job",
        step: "construction-materials",
      },
      request: {
        source: { kind: "eligible-ground", material: "wood" },
        quantityPolicy: "portion",
        quantity: 1,
      },
      intent: {
        kind: "deliver",
        destination: "construction-buffer:missing-site",
      },
      phase: {
        kind: "reserved",
        sourceLot: "wood-a",
        quantity: 1,
        origin: { kind: "ground", cell: cell() },
      },
    });
  });
  assert.throws(() => restoreSnapshot(predecessor), /missing job/);
});

test("a held pail use reloads only with its matching operation custody", () => {
  const saved = envelope((state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    const sourceLot = state.materials.lots.find(
      (lot) => lot.id === `source-lot:${spring.id}`,
    );
    sourceLot.quantity = 6;
    state.sites.push(site("station-a", "brew-station", { finishedAt: 0 }));
    state.materials.embedded.push({
      container: "construction-buffer:station-a",
      material: "wood",
      quantity: 6,
    });
    state.felled = 1;
    state.jobs.push(job("job-fill", "fill-kettle", "station-a"));
    state.materials.lots.push(
      {
        id: "pail-a",
        material: "pail",
        quantity: 1,
        location: { kind: "hand", actor: "rowan" },
      },
      {
        id: "pail-water-a",
        material: "water",
        quantity: 2,
        location: { kind: "container", container: "vessel:pail-a" },
      },
    );
    state.materials.bindings.push({
      kind: "vessel-use",
      id: "fill-kettle-a",
      vessel: "pail-a",
    });
    state.materials.transfers.push({
      id: "pail-use-a",
      actor: "rowan",
      owner: { kind: "operation", operation: "fill-kettle-a" },
      request: {
        source: { kind: "exact-lot", lot: "pail-a" },
        quantityPolicy: "whole-lot",
        quantity: 1,
      },
      intent: { kind: "use", operation: "fill-kettle-a" },
      phase: { kind: "carrying", lot: "pail-a" },
    });
    state.operations.push({
      kind: "water-delivery",
      id: "fill-kettle-a",
      job: "job-fill",
      spring: spring.id,
      target: { kind: "kettle", station: "station-a" },
      quantity: 2,
      pail: "pail-a",
      water: "pail-water-a",
      phase: "pour",
    });
    state.actors.rowan.task = {
      kind: "water-delivery",
      job: "job-fill",
      target: "fill-kettle-a",
      duration: 1,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-fill",
      cost: 1,
    };
  });
  const restored = restoreSnapshot(saved);
  assert.equal(restored.state.paused, true);
  assert.deepEqual(restored.state.materials.bindings, [
    { kind: "vessel-use", id: "fill-kettle-a", vessel: "pail-a" },
  ]);
  assert.equal(
    restored.state.materials.lots.find((lot) => lot.id === "pail-water-a")
      .quantity,
    2,
  );

  saved.savedState.materials.transfers[0].owner.operation = "wrong-operation";
  assert.throws(() => restoreSnapshot(saved), /invalid use custody/);
});

test("schema 12 validates executor-bound Fill custody before converting it", () => {
  const saved = v14Envelope((state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.sites.push(site("station-a", "brew-station", { finishedAt: 0 }));
    state.materials.embedded.push({
      container: "construction-buffer:station-a",
      material: "wood",
      quantity: 6,
    });
    state.felled = 1;
    state.jobs.push(job("job-fill", "fill-kettle", "station-a"));
    state.materials.lots.push({
      id: "pail-a",
      material: "pail",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    });
    state.materials.bindings.push({
      kind: "vessel-use",
      id: "fill-kettle-a",
      vessel: "pail-a",
    });
    state.materials.transfers.push({
      id: "pail-use-a",
      actor: "rowan",
      owner: { kind: "operation", operation: "fill-kettle-a" },
      request: {
        source: { kind: "exact-lot", lot: "pail-a" },
        quantityPolicy: "whole-lot",
        quantity: 1,
      },
      intent: { kind: "use", operation: "fill-kettle-a" },
      phase: { kind: "carrying", lot: "pail-a" },
    });
    state.operations.push({
      kind: "water-delivery",
      id: "fill-kettle-a",
      job: "job-fill",
      spring: spring.id,
      target: { kind: "kettle", station: "station-a" },
      quantity: 2,
      pail: "pail-a",
      water: null,
      phase: "draw",
    });
    state.actors.rowan.task = {
      kind: "water-delivery",
      job: "job-fill",
      target: "fill-kettle-a",
      duration: 1,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-fill",
      cost: 1,
    };
  });
  const predecessor = structuredClone(saved);
  predecessor.schema = 12;
  delete predecessor.savedState.terrain;
  delete predecessor.savedState.materials.sinks;
  for (const herb of predecessor.savedState.herbs) delete herb.establishment;
  const operation = predecessor.savedState.operations[0];
  operation.actor = "rowan";
  operation.station = operation.target.station;
  delete operation.kind;
  delete operation.target;
  delete operation.quantity;
  predecessor.savedState.actors.rowan.task.kind = "brew-water";

  const restored = restoreSnapshot(predecessor);
  assert.deepEqual(restored.state.operations[0].target, {
    kind: "kettle",
    station: "station-a",
  });
  assert.equal(restored.state.operations[0].id, "fill-kettle-a");
  assert.equal(restored.state.operations[0].quantity, 2);

  const wrongExecutor = structuredClone(predecessor);
  wrongExecutor.savedState.operations[0].actor = "sedge";
  assert.throws(() => restoreSnapshot(wrongExecutor), /executor custody/);
});

test("current water operations pin target quantity and establishment receipts", () => {
  const active = envelope((state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.sites.push(site("station-a", "brew-station", { finishedAt: 0 }));
    state.materials.embedded.push({
      container: "construction-buffer:station-a",
      material: "wood",
      quantity: 6,
    });
    state.felled = 1;
    state.jobs.push(job("job-fill", "fill-kettle", "station-a"));
    state.materials.lots.push({
      id: "pail-a",
      material: "pail",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    });
    state.materials.bindings.push({
      kind: "vessel-use",
      id: "fill-a",
      vessel: "pail-a",
    });
    state.materials.transfers.push({
      id: "pail-use-a",
      actor: "rowan",
      owner: { kind: "operation", operation: "fill-a" },
      request: {
        source: { kind: "exact-lot", lot: "pail-a" },
        quantityPolicy: "whole-lot",
        quantity: 1,
      },
      intent: { kind: "use", operation: "fill-a" },
      phase: { kind: "carrying", lot: "pail-a" },
    });
    state.operations.push({
      kind: "water-delivery",
      id: "fill-a",
      job: "job-fill",
      spring: spring.id,
      target: { kind: "kettle", station: "station-a" },
      quantity: 2,
      pail: "pail-a",
      water: null,
      phase: "draw",
    });
    state.actors.rowan.task = {
      kind: "water-delivery",
      job: "job-fill",
      target: "fill-a",
      duration: 1,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-fill",
      cost: 1,
    };
  });
  assert.doesNotThrow(() => restoreSnapshot(active));
  const wrongQuantity = structuredClone(active);
  wrongQuantity.savedState.operations[0].quantity = 1;
  assert.throws(() => restoreSnapshot(wrongQuantity), /invalid endpoint/);

  const established = envelope((state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.materials.lots.find(
      (lot) => lot.id === `source-lot:${spring.id}`,
    ).quantity = 6;
    state.materials.sinks.push({
      id: "water-establishment-a",
      material: "water",
      quantity: 2,
    });
    state.herbs.push({
      id: "herb-a",
      kind: "mugwort",
      stage: "planted",
      work: 0,
      plantedAt: 0,
      establishment: {
        kind: "water",
        at: 0,
        receipt: "water-establishment-a",
      },
      ...cell(7, 7),
    });
  });
  assert.doesNotThrow(() => restoreSnapshot(established));
  const missingReceipt = structuredClone(established);
  missingReceipt.savedState.herbs[0].establishment.receipt = "missing";
  assert.throws(
    () => restoreSnapshot(missingReceipt),
    /water establishment receipt/,
  );
  const replay = structuredClone(established);
  replay.savedState.herbs.push({
    ...replay.savedState.herbs[0],
    id: "herb-replay",
    x: 8,
  });
  assert.throws(() => restoreSnapshot(replay), /water establishment receipt/);
});

test("schema 10 rejects actor-bound pail bindings as an unpublished wire shape", () => {
  const saved = snapshotFor(createClearing());
  saved.savedState.materials.bindings.push({
    kind: "vessel-use",
    id: "unpublished-use",
    vessel: "pail-a",
    actor: "rowan",
  });
  assert.throws(() => restoreSnapshot(saved));
});

test("schema 10 rejects two parked operations bound to one physical pail", () => {
  const saved = envelope((state) => {
    state.sites.push(
      site("station-a", "brew-station", { finishedAt: 0 }),
      site("station-b", "brew-station", { x: 9, finishedAt: 0 }),
    );
    state.materials.embedded.push(
      {
        container: "construction-buffer:station-a",
        material: "wood",
        quantity: 6,
      },
      {
        container: "construction-buffer:station-b",
        material: "wood",
        quantity: 6,
      },
    );
    state.felled = 2;
    state.materials.lots.push({
      id: "parked-pail",
      material: "pail",
      quantity: 1,
      location: { kind: "ground", ...cell(3, 3) },
    });
    const spring = state.sources.find((source) => source.kind === "spring");
    for (const [id, jobId, station] of [
      ["fill-a", "job-fill-a", "station-a", "rowan"],
      ["fill-b", "job-fill-b", "station-b", "sedge"],
    ]) {
      state.jobs.push(job(jobId, "fill-kettle", station));
      state.operations.push({
      kind: "water-delivery",
        id,
        job: jobId,
        spring: spring.id,
        target: { kind: "kettle", station },
        quantity: 2,
        pail: "parked-pail",
        water: null,
        phase: "acquire",
      });
      state.materials.bindings.push({
        kind: "vessel-use",
        id,
        vessel: "parked-pail",
      });
    }
  });
  assert.throws(() => restoreSnapshot(saved), /source overbooked/);
});

test("schema 10 converts cache recipe lots exactly once", () => {
  const restored = restoreSnapshot(v10Envelope());
  const cache = restored.state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  assert.deepEqual(
    restored.state.materials.lots
      .filter(
        (lot) =>
          lot.location.kind === "container" &&
          lot.location.container === `source-supplies:${cache.id}`,
      )
      .map((lot) => [lot.id, lot.material, lot.quantity])
      .sort(),
    [
      [`source-barm-lot:${cache.id}`, "barm", 1],
      [`source-keg-lot:${cache.id}`, "keg", 1],
      [`source-malt-lot:${cache.id}`, "malt", 4],
      [`source-ration-lot:${cache.id}`, "ration", 6],
    ],
  );
  const reloaded = restoreSnapshot(snapshotFor(restored.state));
  assert.equal(
    reloaded.state.materials.lots.filter((lot) => lot.material === "malt")
      .length,
    1,
  );
});

test("schema 10 rejects a cross-domain cache supply identity collision before mutation", () => {
  const predecessor = v10Envelope((state) => {
    state.jobs.push(job("source-malt-lot:feature:reclaimed-timber-cache"));
  });
  assert.throws(() => restoreSnapshot(predecessor), /identity collision/);
});

test("schema 11 validates one exact brew binding and its provenance without live consumed lots", () => {
  const saved = envelope((state) => {
    const cache = state.sources.find(
      (source) => source.kind === "reclaimed-timber-cache",
    );
    const spring = state.sources.find((source) => source.kind === "spring");
    state.sites.push(site("station-a", "brew-station", { finishedAt: 0 }));
    state.materials.embedded.push({
      container: "construction-buffer:station-a",
      material: "wood",
      quantity: 6,
    });
    state.felled = 1;
    state.herbs.push({
      id: "herb-a",
      kind: "mugwort",
      stage: "ready",
      work: 0,
      plantedAt: 0,
      establishment: { kind: "legacy", at: 0 },
      ...cell(2, 2),
    });
    state.harvestedHerbs = 1;
    state.materials.lots.push({
      id: "herb-lot",
      material: "mugwort",
      quantity: 1,
      location: { kind: "ground", ...cell(2, 2) },
    });
    state.materials.bindings.push(
      recipeBinding("brew-a", "station-a", {
        malt: `source-malt-lot:${cache.id}`,
        water: `source-lot:${spring.id}`,
        mugwort: "herb-lot",
        wood: `source-lot:${cache.id}`,
        barm: `source-barm-lot:${cache.id}`,
        keg: `source-keg-lot:${cache.id}`,
      }),
    );
  });
  assert.equal(restoreSnapshot(saved).state.materials.bindings.length, 1);
  const duplicate = structuredClone(saved);
  duplicate.savedState.materials.bindings.push({
    ...duplicate.savedState.materials.bindings[0],
    id: "brew-b",
  });
  assert.throws(
    () => restoreSnapshot(duplicate),
    /invalid recipe station/,
  );
  const corrupt = structuredClone(saved);
  corrupt.savedState.materials.bindings[0].consumed[0].quantity = 1;
  assert.throws(() => restoreSnapshot(corrupt), /invalid consumed role/);
  const transformed = structuredClone(saved);
  transformed.savedState.materials.transformations.push({
    id: "brew-a",
    definition: "herbal-ale-v1",
    inputs: structuredClone(
      transformed.savedState.materials.bindings[0].consumed,
    ),
  });
  const portion = (material) =>
    transformed.savedState.materials.bindings[0].consumed.find(
      (entry) => entry.material === material,
    ).lot;
  transformed.savedState.materials.lots.find(
    (lot) => lot.id === portion("malt"),
  ).quantity = 2;
  transformed.savedState.materials.lots.find(
    (lot) => lot.id === portion("water"),
  ).quantity = 6;
  transformed.savedState.materials.lots.find(
    (lot) => lot.id === portion("wood"),
  ).quantity = 9;
  transformed.savedState.materials.lots =
    transformed.savedState.materials.lots.filter(
      (lot) => lot.id !== "herb-lot",
    );
  assert.equal(
    restoreSnapshot(transformed).state.materials.transformations.length,
    1,
  );
  transformed.savedState.materials.transformations[0].inputs[1] =
    structuredClone(
      transformed.savedState.materials.transformations[0].inputs[0],
    );
  assert.throws(
    () => restoreSnapshot(transformed),
    /does not match recipe binding/,
  );
  const capacity = structuredClone(saved);
  capacity.savedState.materials.lots.push({
    id: "ale-a",
    material: "ale",
    quantity: 1,
    location: {
      kind: "container",
      container:
        capacity.savedState.materials.bindings[0].promises[0].destination,
    },
  });
  assert.throws(() => restoreSnapshot(capacity), /invalid capacity: destination-full/);
});

test("schema 11 aggregates recipe portion promises across distinct brew bindings", () => {
  const saved = envelope((state) => {
    const cache = state.sources.find(
      (source) => source.kind === "reclaimed-timber-cache",
    );
    const spring = state.sources.find((source) => source.kind === "spring");
    for (const id of ["a", "b"]) {
      state.sites.push(
        site(`station-${id}`, "brew-station", {
          x: id === "a" ? 4 : 8,
          finishedAt: 0,
        }),
      );
      state.materials.embedded.push({
        container: `construction-buffer:station-${id}`,
        material: "wood",
        quantity: 6,
      });
    }
    state.felled = 2;
    state.herbs.push({
      id: "herb-a",
      kind: "mugwort",
      stage: "ready",
      work: 0,
      plantedAt: 0,
      establishment: { kind: "legacy", at: 0 },
      ...cell(2, 2),
    });
    state.harvestedHerbs = 1;
    state.materials.lots.push(
      {
        id: "herb-lot",
        material: "mugwort",
        quantity: 1,
        location: { kind: "ground", ...cell(2, 2) },
      },
      {
        id: "barm-b",
        material: "barm",
        quantity: 1,
        location: { kind: "ground", ...cell(3, 3) },
      },
      {
        id: "keg-b",
        material: "keg",
        quantity: 1,
        location: { kind: "ground", ...cell(3, 4) },
      },
    );
    const binding = (id, barm, keg) =>
      recipeBinding(id, `station-${id}`, {
        malt: `source-malt-lot:${cache.id}`,
        water: `source-lot:${spring.id}`,
        mugwort: "herb-lot",
        wood: `source-lot:${cache.id}`,
        barm,
        keg,
      });
    state.materials.bindings.push(
      binding("a", `source-barm-lot:${cache.id}`, `source-keg-lot:${cache.id}`),
      binding("b", "barm-b", "keg-b"),
    );
  });
  assert.throws(
    () => restoreSnapshot(saved),
    /source overbooked/,
  );
});

rejects(
  "restore rejects a finite source occupying an actor's saved route",
  (state) => {
    const source = state.sources[0];
    state.actors.rowan.path = [cell(source.x, source.z, source.level)];
  },
  /source .* is invalid/,
);

rejects(
  "restore rejects an irrelevant repair flag on a spring",
  (state) => {
    state.sources.find((source) => source.kind === "spring").repaired = true;
  },
  /repaired/,
);

rejects(
  "restore rejects finite source stock over its provider capacity",
  (state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.materials.lots.find(
      (lot) => lot.id === `source-lot:${spring.id}`,
    ).quantity = 9;
  },
  /invalid finite contents/,
);

rejects(
  "restore rejects a raw schema 9 finite source with the wrong access policy",
  (state) => {
    state.sources.find(
      (source) => source.kind === "reclaimed-timber-cache",
    ).access = "open";
  },
  /sealed/,
);

rejects(
  "restore rejects a finite source lot with the wrong source material",
  (state) => {
    const cache = state.sources.find(
      (source) => source.kind === "reclaimed-timber-cache",
    );
    state.materials.lots.find(
      (lot) => lot.id === `source-lot:${cache.id}`,
    ).material = "mugwort";
  },
  /invalid finite contents/,
);

test("restore accepts a final source lot drawn into a dropped pail", () => {
  const saved = envelope((state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    const sourceLot = state.materials.lots.find(
      (lot) => lot.id === `source-lot:${spring.id}`,
    );
    sourceLot.quantity = 2;
    sourceLot.location = { kind: "container", container: "vessel:pail-last" };
    state.materials.lots.push(
      {
        id: "pail-last",
        material: "pail",
        quantity: 1,
        location: { kind: "ground", ...cell(4, 4) },
      },
      {
        id: "pail-earlier",
        material: "pail",
        quantity: 1,
        location: { kind: "ground", ...cell(5, 4) },
      },
      {
        id: "pail-before",
        material: "pail",
        quantity: 1,
        location: { kind: "ground", ...cell(6, 4) },
      },
      {
        id: "pail-first",
        material: "pail",
        quantity: 1,
        location: { kind: "ground", ...cell(7, 4) },
      },
      {
        id: "drawn-water-earlier",
        material: "water",
        quantity: 2,
        location: { kind: "container", container: "vessel:pail-earlier" },
      },
      {
        id: "drawn-water-before",
        material: "water",
        quantity: 2,
        location: { kind: "container", container: "vessel:pail-before" },
      },
      {
        id: "drawn-water-first",
        material: "water",
        quantity: 2,
        location: { kind: "container", container: "vessel:pail-first" },
      },
    );
  });
  assert.doesNotThrow(() => restoreSnapshot(saved));
});

rejects(
  "restore rejects ordinary IDs colliding with active source derivatives",
  (state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.jobs.push(job(`source:${spring.id}`));
  },
  /source .* is invalid/,
);

rejects(
  "restore rejects ordinary IDs colliding with an active source named lot",
  (state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.jobs.push(job(`source-lot:${spring.id}`));
  },
  /source .* is invalid/,
);

for (const operation of [
  "feature:spring",
  "source:feature:spring",
  "source-lot:feature:spring",
])
  rejects(
    `restore rejects a vessel operation colliding with ${operation}`,
    (state) => heldPailUse(state, operation),
    /source .* is invalid/,
  );

rejects(
  "restore rejects a pending source that collides with an active feature identity",
  (state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.pendingSources.push({
      id: spring.id,
      kind: "spring",
      preferred: cell(2, 2),
    });
  },
  /pending source .* is invalid/,
);

test("schema 14 reports unsupported predecessors truthfully", () => {
  const unsupported = snapshotFor(createClearing());
  unsupported.schema = 7;
  assert.throws(
    () => restoreSnapshot(unsupported),
    /Invalid Hive save: unsupported predecessor schema/,
  );
  const malformed = v10Envelope((state) => {
    state.extra = true;
  });
  assert.throws(() => restoreSnapshot(malformed));
});

rejects(
  "current recipe records parse a generic ID then reject an unsupported definition",
  (state) => {
    state.materials.bindings.push({
      kind: "recipe",
      id: "unsupported-recipe",
      definition: "future-recipe-v1",
      station: "kettle:missing",
      consumed: [],
      retained: [],
      promises: [],
    });
  },
  /unknown recipe future-recipe-v1/,
);

test("current-v8 revision admission distinguishes absent, malformed, and stale slots", () => {
  assert.deepEqual(decideSaveRevision(undefined, 0), {
    kind: "write",
    revision: 1,
  });
  assert.deepEqual(decideSaveRevision({ schema: 0 }, 0), { kind: "malformed" });
  const saved = snapshotFor(createClearing());
  saved.revision = 3;
  assert.deepEqual(decideSaveRevision(saved, 2), {
    kind: "stale",
    currentRevision: 3,
  });
  assert.deepEqual(decideReplaceRevision(undefined, 0, "discardMalformed"), {
    kind: "stale",
    currentRevision: 0,
  });
});

test("restore accepts an active build-supply transfer and rejects owner/request contrasts", () => {
  assert.doesNotThrow(() => restoreSnapshot(buildSupplyEnvelope()));

  const tasklessCarrying = buildSupplyEnvelope();
  tasklessCarrying.savedState.actors.rowan.task = null;
  tasklessCarrying.savedState.actors.rowan.assignment = null;
  assert.doesNotThrow(() => restoreSnapshot(tasklessCarrying));

  const ordinaryBuild = envelope((state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.actors.rowan.task = {
      kind: "build",
      job: "job-build",
      target: "site-a",
      duration: 24,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
  });
  assert.doesNotThrow(() => restoreSnapshot(ordinaryBuild));

  const wrongOwner = buildSupplyEnvelope();
  wrongOwner.savedState.jobs.push(job("job-other", "build", "site-a"));
  wrongOwner.savedState.materials.transfers[0].owner.job = "job-other";
  assert.throws(
    () => restoreSnapshot(wrongOwner),
    /inconsistent task activity/,
  );

  const wrongRequest = buildSupplyEnvelope();
  wrongRequest.savedState.sites.push(site("site-b", "wall", { x: 6 }));
  wrongRequest.savedState.materials.transfers[0].intent.destination =
    "construction-buffer:site-b";
  assert.throws(
    () => restoreSnapshot(wrongRequest),
    /does not match owner destination/,
  );
});

test("restore accepts one full embedding for every finished construction site", () => {
  const finished = envelope((state) => {
    const wall = site("wall-a", "wall", { finishedAt: 1 });
    state.sites.push(wall);
    state.materials.lots.push({
      id: "wood-rest",
      material: "wood",
      quantity: 5,
      location: { kind: "ground", ...cell(4, 4) },
    });
    state.materials.embedded.push({
      container: "construction-buffer:wall-a",
      material: "wood",
      quantity: 1,
    });
    state.felled = 1;
  });
  assert.doesNotThrow(() => restoreSnapshot(finished));
});

rejects(
  "restore rejects duplicate live material lot IDs",
  (state) => {
    state.materials.lots.push(
      {
        id: "lot-a",
        material: "wood",
        quantity: 1,
        location: { kind: "ground", ...cell() },
      },
      {
        id: "lot-a",
        material: "wood",
        quantity: 1,
        location: { kind: "ground", ...cell(6) },
      },
    );
  },
  /duplicate lot/,
);

rejects(
  "restore rejects a synthetic stacked ground pail",
  (state) => {
    state.materials.lots.push({
      id: "pail-stack",
      material: "pail",
      quantity: 2,
      location: { kind: "ground", ...cell(4, 4) },
    });
  },
  /invalid lot: vessel-invalid/,
);

rejects(
  "restore rejects drawn water made loose beside a depleted spring",
  (state) => {
    const spring = state.sources.find((source) => source.kind === "spring");
    state.materials.lots.find(
      (lot) => lot.id === `source-lot:${spring.id}`,
    ).quantity = 6;
    state.materials.lots.push({
      id: "loose-water",
      material: "water",
      quantity: 2,
      location: { kind: "ground", ...cell(4, 4) },
    });
  },
  /invalid lot: source-ineligible/,
);

rejects(
  "restore rejects duplicate current job IDs",
  (state) => {
    state.jobs.push(job("job-a"), job("job-a"));
  },
  /duplicate job ID/,
);

rejects(
  "restore rejects duplicate current site IDs",
  (state) => {
    state.sites.push(site("site-a"), site("site-a", "door"));
  },
  /duplicate site ID/,
);

rejects(
  "restore rejects duplicate transfer IDs before transfer joins",
  (state) => {
    state.materials.transfers.push(
      transfer("transfer-a"),
      transfer("transfer-a"),
    );
  },
  /duplicate transfer/,
);

rejects(
  "restore rejects hand lots without exactly one carrying transfer",
  (state) => {
    state.materials.lots.push({
      id: "hand-a",
      material: "wood",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    });
  },
  /orphan hand lot/,
);

rejects(
  "restore rejects container lots outside an accepted live destination",
  (state) => {
    state.materials.lots.push({
      id: "stored-a",
      material: "mugwort",
      quantity: 1,
      location: { kind: "container", container: "shelf:missing" },
    });
  },
  /unknown or incompatible container/,
);

rejects(
  "restore rejects embedded entries without a finished construction buffer",
  (state) => {
    state.materials.embedded.push({
      container: "construction-buffer:missing",
      material: "wood",
      quantity: 1,
    });
  },
  /embedded material has unknown container/,
);

rejects(
  "restore rejects a transfer whose owner job is absent",
  (state) => {
    state.sites.push(site("site-a"));
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(transfer("transfer-a"));
  },
  /transfer transfer-a has missing job/,
);

rejects(
  "restore rejects transfer owner and destination disagreement",
  (state) => {
    state.sites.push(site("site-a"), site("site-b", "door", { x: 6 }));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        intent: { kind: "deliver", destination: "construction-buffer:site-b" },
      }),
    );
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-build",
      target: "transfer-a",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
  },
  /does not match owner destination/,
);

rejects(
  "restore rejects transfer phase quantities and source joins",
  (state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        phase: {
          kind: "reserved",
          sourceLot: "wood-a",
          quantity: 2,
          origin: { kind: "ground", cell: cell() },
        },
      }),
    );
  },
  /invalid transfer phase: source-insufficient/,
);

rejects(
  "restore rejects aggregate reserved quantities over a source lot",
  (state) => {
    state.sites.push(site("site-a"), site("site-b", "wall", { x: 6 }));
    state.jobs.push(
      job("job-a", "build", "site-a"),
      job("job-b", "build", "site-b"),
    );
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        owner: { kind: "job", job: "job-a", step: "one" },
        intent: { kind: "deliver", destination: "construction-buffer:site-a" },
      }),
      transfer("transfer-b", {
        actor: "sedge",
        owner: { kind: "job", job: "job-b", step: "two" },
        intent: { kind: "deliver", destination: "construction-buffer:site-b" },
      }),
    );
    state.parties.home.members.push("sedge");
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-a",
      target: "transfer-a",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-a",
      cost: 1,
    };
    state.actors.sedge.task = {
      kind: "transfer",
      job: "job-b",
      target: "transfer-b",
      duration: 8,
    };
    state.actors.sedge.assignment = {
      character: "sedge",
      task: "job-b",
      cost: 1,
    };
  },
  /source overbooked/,
);

rejects(
  "restore rejects occupied plus incoming material beyond a resolved container capacity",
  (state) => {
    state.sites.push(site("site-a", "door"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push(
      {
        id: "wood-stored",
        material: "wood",
        quantity: 1,
        location: {
          kind: "container",
          container: "construction-buffer:site-a",
        },
      },
      {
        id: "wood-a",
        material: "wood",
        quantity: 2,
        location: { kind: "ground", ...cell() },
      },
    );
    state.materials.transfers.push(
      transfer("transfer-a", {
        request: {
          source: { kind: "eligible-ground", material: "wood" },
          quantityPolicy: "portion",
          quantity: 2,
        },
        phase: {
          kind: "reserved",
          sourceLot: "wood-a",
          quantity: 2,
          origin: { kind: "ground", cell: cell() },
        },
      }),
    );
    state.actors.rowan.task = {
      kind: "transfer",
      job: "job-build",
      target: "transfer-a",
      duration: 8,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-build",
      cost: 1,
    };
  },
  /invalid capacity: destination-full/,
);

rejects(
  "restore measures mixed shelf occupancy in bulk units",
  (state) => {
    state.sites.push(site("shelf-a", "shelf", { finishedAt: 1 }));
    state.materials.embedded.push({
      container: "construction-buffer:shelf-a",
      material: "wood",
      quantity: 1,
    });
    state.materials.lots.push(
      {
        id: "shelf-wood",
        material: "wood",
        quantity: 3,
        location: { kind: "container", container: "shelf:shelf-a" },
      },
      {
        id: "shelf-herb",
        material: "mugwort",
        quantity: 1,
        location: { kind: "container", container: "shelf:shelf-a" },
      },
    );
  },
  /invalid capacity: destination-full/,
);

rejects(
  "restore requires a matching actor task for reserved transfers",
  (state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "wood-a",
      material: "wood",
      quantity: 1,
      location: { kind: "ground", ...cell() },
    });
    state.materials.transfers.push(transfer("transfer-a"));
  },
  /reserved transfer transfer-a lacks matching actor task/,
);

rejects(
  "restore rejects carrying material that does not match source or destination",
  (state) => {
    state.sites.push(site("site-a"));
    state.jobs.push(job("job-build", "build", "site-a"));
    state.materials.lots.push({
      id: "hand-mugwort",
      material: "mugwort",
      quantity: 1,
      location: { kind: "hand", actor: "rowan" },
    });
    state.materials.transfers.push(
      transfer("transfer-a", {
        phase: { kind: "carrying", lot: "hand-mugwort" },
      }),
    );
  },
  /invalid transfer phase: source-ineligible/,
);

rejects(
  "restore rejects a finished site without its full construction embedding",
  (state) => {
    state.sites.push(site("site-a", "wall", { finishedAt: 1 }));
  },
  /finished site site-a lacks construction embedding/,
);

rejects(
  "restore rejects actor task, activity, assignment, and target disagreement",
  (state) => {
    state.jobs.push(job("job-chop", "chop", "oak-1"));
    state.actors.rowan.task = {
      kind: "build",
      job: "job-chop",
      target: "oak-1",
      duration: 1,
    };
    state.actors.rowan.assignment = {
      character: "rowan",
      task: "job-chop",
      cost: 1,
    };
  },
  /inconsistent task activity/,
);

rejects(
  "restore rejects invalid actor paths",
  (state) => {
    state.actors.rowan.path = [{ x: -1, z: 0, level: 0 }];
  },
  /invalid path/,
);

rejects(
  "restore rejects unsupported current topology",
  (state) => {
    state.sites.push(site("floor-a", "floor", { level: 1 }));
  },
  /unsupported floor/,
);

rejects(
  "restore rejects unsupported finished roofs",
  (state) => {
    state.sites.push(site("roof-a", "roof", { finishedAt: 1 }));
    state.materials.embedded.push({
      container: "construction-buffer:roof-a",
      material: "wood",
      quantity: 1,
    });
  },
  /unsupported roof/,
);

rejects(
  "restore rejects current material conservation breaks",
  (state) => {
    state.felled = 1;
  },
  /wood conservation is 10, expected 16/,
);

test("shipped v14 upgrades physical needs and finite provisions once without rewriting its old lots", () => {
  const historical = v14Envelope();
  const original = structuredClone(historical);
  const upgraded = restoreSnapshot(historical).state;
  assert.deepEqual(historical, original, "migration does not mutate the recovery record");
  for (const lot of original.savedState.materials.lots)
    assert.deepEqual(upgraded.materials.lots.find((entry) => entry.id === lot.id), lot);
  for (const actor of Object.values(upgraded.actors)) {
    assert.equal(actor.needs.rest, original.savedState.actors[actor.id].rest);
    assert.equal(actor.needs.advancedAt, upgraded.tick);
    assert.equal("rest" in actor, false);
  }
  assert.equal("rested" in upgraded, false);
  assert.equal(upgraded.materials.lots.filter((lot) => lot.material === "water").reduce((sum, lot) => sum + lot.quantity, 0), 16);
  assert.equal(upgraded.materials.lots.filter((lot) => lot.material === "ration").reduce((sum, lot) => sum + lot.quantity, 0), 6);
  const reloaded = restoreSnapshot(snapshotFor(upgraded)).state;
  assert.deepEqual(reloaded, upgraded, "current reload does not reintroduce provisions");
});

test("v14 rejects future stock and broken old ownership before adding care provisions", () => {
  const overfull = v14Envelope((state) => {
    state.materials.lots.find((lot) => lot.material === "water").quantity = 9;
  });
  assert.throws(() => restoreSnapshot(overfull), /finite contents|capacity|conservation/);
  const futureFood = v14Envelope((state) => {
    state.materials.lots.push({ id: "future-ration", material: "ration", quantity: 1, location: { kind: "ground", ...cell() } });
  });
  assert.throws(() => restoreSnapshot(futureFood));
  const orphan = v14Envelope((state) => {
    const lot = state.materials.lots.find((entry) => entry.material === "pail");
    lot.location = { kind: "hand", actor: "rowan" };
  });
  assert.throws(() => restoreSnapshot(orphan), /hand|custody/);
});

test("care uniqueness follows stable policy slots when automatic need retargets to rest", () => {
  const saved = envelope((state) => {
    state.jobs.push(
      { id: "care-auto", kind: "care", target: "rowan", need: "rest", policy: "automatic", reason: "Blocked care", routine: false },
      { id: "care-rest", kind: "care", target: "rowan", need: "rest", policy: "manual-rest", reason: "Pinned rest", routine: false },
    );
  });
  assert.doesNotThrow(() => restoreSnapshot(saved));
  for (const change of [
    (job) => { job.target = "missing-actor"; },
    (job) => { job.need = "hydration"; },
    (job) => { job.routine = true; },
  ]) {
    const bad = structuredClone(saved);
    change(bad.savedState.jobs.find((job) => job.id === "care-rest"));
    assert.throws(() => restoreSnapshot(bad), /care job/);
  }
});
