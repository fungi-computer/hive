import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step } from "./clearing.ts";
import { snapshotFor, restoreSnapshot } from "./persistence.ts";
import { moveContainerPortions, containerQuantity } from "./materials.ts";
import { portableContainerInterior } from "./item-containers.ts";
import { sourceContainerSpec } from "./finite-sources.ts";
import { BUILDINGS, constructionBuffer, brewKettle } from "./construction.js";
import {
  resolveWaterSupply,
  waterSupplyOptions,
  waterSupplyProblem,
} from "./water-supply.ts";
const access = { sourceReachable: true, destinationReachableWithPayload: true };
const colony = await new Promise((resolve, reject) => {
  const context = {
    Module: {
      wasmBinary: readFileSync(
        new URL("../public/vendor/libcolony/colony.wasm", import.meta.url),
      ),
      onRuntimeInitialized() {
        resolve(context.Module);
      },
      onAbort: reject,
    },
    window: {},
    console,
    TextDecoder,
    TextEncoder,
    WebAssembly,
    setTimeout,
    clearTimeout,
  };
  vm.runInNewContext(
    readFileSync(
      new URL("../public/vendor/libcolony/colony.js", import.meta.url),
      "utf8",
    ),
    context,
  );
});
function fixture() {
  const state = createClearing(93);
  state.actors.sedge.drafted = true;
  const pail = state.materials.lots.find((lot) => lot.material === "pail");
  pail.location = { kind: "ground", x: 7, z: 10, level: 0 };
  const spring = state.sources.find((source) => source.kind === "spring");
  const source = sourceContainerSpec(spring);
  const original = state.materials.lots.find((lot) => lot.material === "water");
  const moved = moveContainerPortions(state.materials, {
    source,
    destination: portableContainerInterior(pail),
    material: "water",
    quantity: 2,
    portions: [{ lot: original.id, quantity: 2 }],
    access,
  });
  assert(moved.ok);
  const station = {
    id: "station-portions",
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
  assert.doesNotThrow(() => snapshotFor(state));
  return { state, pail: pail.id, A: moved.value[0].lot, source, station };
}
function tick(state, commands = []) {
  return step(
    state,
    colony,
    commands.map((command) => ({
      party: "home",
      actors: null,
      level: 0,
      ...command,
    })),
  );
}
function until(state, predicate, limit = 350) {
  for (let n = 0; n < limit && !predicate(); n++) tick(state);
  assert(predicate(), "bounded actual optimizer/work outcome");
}
function waterTotal(state) {
  return (
    state.materials.lots
      .filter((lot) => lot.material === "water")
      .reduce((n, l) => n + l.quantity, 0) +
    state.materials.sinks
      .filter((sink) => sink.material === "water")
      .reduce((n, s) => n + s.quantity, 0)
  );
}
test("actual WASM drink uses A2 contents, leaves A1, then kettle draws deficit B1 and pours both after paused reload", () => {
  let { state, pail, A, source, station } = fixture();
  state.actors.rowan.needs.hydration = 35;
  tick(state);
  assert.equal(state.operations[0].execution.phase, "acquire");
  assert.deepEqual(state.operations[0].supply, { kind: "contents" });
  state = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(state.paused, true);
  assert.equal(state.materials.lots.find((l) => l.id === A).quantity, 2);
  state.paused = false;
  until(state, () => state.careOutcomes.length === 1, 5);
  assert.equal(state.materials.lots.find((l) => l.id === A).quantity, 1);
  assert.equal(containerQuantity(state.materials, source.id, "water"), 14);
  assert.equal(waterTotal(state), 16);
  assert.doesNotThrow(() => snapshotFor(state));
  assert.equal(
    tick(state, [{ kind: "fill-kettle", station: station.id }])[0].status,
    "applied",
  );
  assert.equal(state.operations[0].execution.phase, "acquire");
  const pending = snapshotFor(state);
  for (const supply of [
    { kind: "contents" },
    { kind: "container", container: "forged" },
    {
      kind: "container",
      container: sourceContainerSpec(
        state.sources.find((s) => s.kind === "reclaimed-timber-cache"),
      ).id,
    },
  ]) {
    const bad = structuredClone(pending);
    bad.savedState.operations[0].supply = supply;
    assert.throws(() => restoreSnapshot(bad), /supply/);
  }
  until(state, () => state.operations[0]?.execution.phase === "deliver");
  const operation = state.operations[0];
  const promised = structuredClone(operation.execution.contents);
  assert.equal(promised.length, 2);
  assert(
    promised.some((portion) => portion.lot === A && portion.quantity === 1),
  );
  assert.equal(containerQuantity(state.materials, source.id, "water"), 13);
  const saved = snapshotFor(state);
  for (const mutate of [
    (op) => {
      op.execution.contents[1] = { ...op.execution.contents[0] };
    },
    (op) => {
      op.execution.contents[0].quantity = 2;
    },
    (op) => {
      op.execution.contents[0].lot = "missing-water";
    },
  ]) {
    const bad = structuredClone(saved);
    mutate(bad.savedState.operations[0]);
    assert.throws(() => restoreSnapshot(bad));
  }
  state = restoreSnapshot(saved).state;
  state.paused = false;
  until(state, () => !state.operations.length);
  assert.equal(
    containerQuantity(state.materials, brewKettle(station).id, "water"),
    2,
  );
  assert.equal(
    containerQuantity(state.materials, `vessel:${pail}`, "water"),
    0,
  );
  for (const portion of promised)
    assert.equal(
      state.materials.lots.find((l) => l.id === portion.lot).location.container,
      brewKettle(station).id,
    );
  assert.equal(waterTotal(state), 16);
  tick(state);
  assert.equal(containerQuantity(state.materials, source.id, "water"), 13);
  assert.doesNotThrow(() => snapshotFor(state));
});
test("contents-only supply needs no fictional source; shortfall reference validity does not depend on stock", () => {
  const { state, pail, source } = fixture();
  const contentsOnly = { ...state, sources: [] };
  assert.deepEqual(
    resolveWaterSupply(contentsOnly, pail, 1, { kind: "contents" }).supply,
    { kind: "contents" },
  );
  const dry = structuredClone(state);
  dry.materials.lots = dry.materials.lots.filter((l) => l.material !== "water");
  assert.equal(
    waterSupplyProblem(dry, pail, 2, {
      kind: "container",
      container: source.id,
    }),
    null,
  );
  assert.equal(waterSupplyOptions(dry, pail, 2).length, 0);
  assert.match(
    waterSupplyProblem(dry, pail, 2, { kind: "contents" }),
    /shortfall/,
  );
  assert.match(
    waterSupplyProblem(dry, pail, 2, {
      kind: "container",
      container: "missing",
    }),
    /endpoint/,
  );
  const cache = state.sources.find(
    (source) => source.kind === "reclaimed-timber-cache",
  );
  assert.match(
    waterSupplyProblem(dry, pail, 2, {
      kind: "container",
      container: sourceContainerSpec(cache).id,
    }),
    /endpoint/,
  );
});
test("actual WASM mugwort uses existing contents and permanent cancel preserves the same filled pail", () => {
  let { state, pail, source, station } = fixture();
  const herb = {
    id: "herb-portions",
    kind: "mugwort",
    x: 7,
    z: 7,
    level: 0,
    stage: "planted",
    work: 20,
    establishment: null,
    plantedAt: 0,
  };
  state.herbs.push(herb);
  assert.equal(
    tick(state, [{ kind: "water-mugwort", herb: herb.id }])[0].status,
    "applied",
  );
  assert.deepEqual(state.operations[0].supply, { kind: "contents" });
  until(state, () => state.herbs[0].establishment !== null);
  assert.equal(
    state.materials.sinks
      .filter((s) => s.material === "water")
      .reduce((n, s) => n + s.quantity, 0),
    2,
  );
  assert.equal(containerQuantity(state.materials, source.id, "water"), 14);
  assert.doesNotThrow(() => snapshotFor(state));
  // A fresh fill exercises cancel after physical draw, with no sink/refund.
  tick(state, [{ kind: "fill-kettle", station: station.id }]);
  until(state, () => state.operations[0]?.execution.phase === "deliver");
  const job = state.operations[0].job;
  const contents = structuredClone(state.operations[0].execution.contents);
  const budget = waterTotal(state);
  assert.equal(tick(state, [{ kind: "cancel", job }])[0].status, "applied");
  assert.equal(state.operations.length, 0);
  assert.equal(state.materials.bindings.length, 0);
  assert.equal(
    state.materials.lots.find((l) => l.id === pail).location.kind,
    "ground",
  );
  for (const portion of contents)
    assert.equal(
      state.materials.lots.find((l) => l.id === portion.lot).location.container,
      `vessel:${pail}`,
    );
  assert.equal(waterTotal(state), budget);
  assert.equal(
    containerQuantity(state.materials, brewKettle(station).id, "water"),
    0,
  );
  assert.doesNotThrow(() => snapshotFor(state));
});

test("current vessel format rejects schema 18 rather than migrating single-content work", () => {
  const saved = snapshotFor(createClearing());
  assert.equal(saved.schema, 20);
  saved.schema = 18;
  assert.throws(() => restoreSnapshot(saved), /20/);
});
