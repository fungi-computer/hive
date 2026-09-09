import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step } from "./clearing.ts";
import { snapshotFor, restoreSnapshot } from "./persistence.ts";
import { createGroundLot, containerQuantity } from "./materials.ts";
import { BUILDINGS, constructionBuffer, brewKettle } from "./construction.js";
import { excavateTerrain, terrainFacts } from "./terrain.ts";
import {
  fieldWaterSources,
  fieldWaterSupplyKey,
  FIELD_WATER,
} from "./field-water-source.ts";
import { fieldWaterBalance } from "./field-water.ts";
import { sourceAccessCells } from "./world.js";
import {
  waterSupplyOptions,
  waterSupplyProblem,
  resolveWaterSupply,
} from "./water-supply.ts";
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
const reference = {
  binding: FIELD_WATER.id,
  nodeId: "reservoir:column-p0-p128",
};
function pit(state) {
  return terrainFacts(state.terrain).soil.nodes.find(
    (node) => node.nodeId === reference.nodeId,
  );
}
function fixture() {
  const state = createClearing(93);
  // Retain all authored finite stock. Finished walls make the spring genuinely
  // unreachable, so the same route owner must choose naturally collected water.
  const spring = state.sources.find((source) => source.kind === "spring");
  const walls = sourceAccessCells(spring).map((at, index) => ({
    ...at,
    id: `wall-spring-${index}`,
    type: "wall",
    direction: 0,
    work: BUILDINGS.wall.ticks,
    finishedAt: 0,
  }));
  state.sites.push(...walls);
  for (const wall of walls)
    state.materials.embedded.push({
      container: constructionBuffer(wall).id,
      material: "wood",
      quantity: BUILDINGS.wall.wood,
    });
  state.terrain = excavateTerrain(state.terrain, [0, 14, 128]);
  assert(
    createGroundLot(state.materials, "soil", 1, { x: 6, z: 9, level: 0 }).ok,
  );
  const pail = state.materials.lots.find((lot) => lot.material === "pail");
  pail.location = { kind: "ground", x: 7, z: 10, level: 0 };
  state.actors.sedge.drafted = true;
  const station = {
    id: "station-field",
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
  const builtWood = 6 + walls.length * BUILDINGS.wall.wood;
  state.felled = Math.ceil(builtWood / 6);
  const remainder = state.felled * 6 - builtWood;
  if (remainder)
    assert(
      createGroundLot(state.materials, "wood", remainder, {
        x: 6,
        z: 10,
        level: 0,
      }).ok,
    );
  assert.equal(pit(state).massKg, 0);
  assert.doesNotThrow(() => snapshotFor(state));
  return { state, pail: pail.id, station };
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
function until(state, predicate, limit = 3000) {
  for (let n = 0; n < limit && !predicate(); n++) tick(state);
  assert(
    predicate(),
    `bounded actual field/work outcome at tick ${state.tick}, pit ${pit(state).massKg}kg`,
  );
}
function charge(state) {
  return terrainFacts(state.terrain).balance.exchangeWaterKg;
}
function balanced(state) {
  const balance = fieldWaterBalance(state);
  assert(Math.abs(balance.residualKg) <= balance.toleranceKg);
  assert.doesNotThrow(() => snapshotFor(state));
}
test("actual WASM waiting kettle wakes on field eligibility, cancels its full pail, drinks one and tops up only deficit before reload/delivery", () => {
  let { state, pail, station } = fixture();
  assert.equal(fieldWaterSupplyKey(state), "[]");
  assert(
    waterSupplyOptions(state, pail, 2).some(
      (option) => option.supply.kind === "container",
    ),
    "stock estimates retain the spring; actual route authority rejects its blocked access",
  );
  assert.equal(
    waterSupplyProblem(state, pail, 2, { kind: "field", ...reference }),
    null,
    "dry column reference stays valid",
  );
  assert.equal(
    tick(state, [{ kind: "fill-kettle", station: station.id }])[0].status,
    "applied",
  );
  assert.equal(state.operations.length, 0);
  assert.equal(
    state.workDirty,
    false,
    "unavailable job waits without spinning assignment",
  );
  until(state, () => state.operations.length > 0);
  assert.deepEqual(state.operations[0].supply, { kind: "field", ...reference });
  assert.equal(state.operations[0].execution.phase, "acquire");
  assert.equal(
    charge(state),
    0,
    "selection/acquisition does not reserve or charge field water",
  );
  until(state, () => state.operations[0]?.execution.phase === "deliver");
  const first = state.operations[0];
  const A = first.execution.contents[0].lot;
  assert.equal(charge(state), -2);
  assert.equal(state.materials.lots.find((lot) => lot.id === A).quantity, 2);
  assert.equal(
    tick(state, [{ kind: "cancel", job: first.job }])[0].status,
    "applied",
  );
  assert.equal(state.operations.length, 0);
  assert.equal(state.materials.bindings.length, 0);
  assert.equal(
    state.materials.lots.find((lot) => lot.id === pail).location.kind,
    "ground",
  );
  assert.equal(
    containerQuantity(state.materials, `vessel:${pail}`, "water"),
    2,
  );
  assert.equal(charge(state), -2);
  balanced(state);
  state.actors.rowan.needs.hydration = 35;
  until(state, () => state.careOutcomes.length === 1);
  assert.equal(state.materials.lots.find((lot) => lot.id === A).quantity, 1);
  assert.equal(charge(state), -2, "contents-only drink never redraws");
  assert.equal(
    tick(state, [{ kind: "fill-kettle", station: station.id }])[0].status,
    "applied",
  );
  until(state, () => state.operations[0]?.execution.phase === "deliver");
  assert.equal(charge(state), -3, "only one missing unit is drawn");
  const promises = structuredClone(state.operations[0].execution.contents);
  assert.equal(promises.length, 2);
  assert(promises.some((p) => p.lot === A && p.quantity === 1));
  state = restoreSnapshot(snapshotFor(state)).state;
  assert.equal(state.paused, true);
  tick(state);
  assert.equal(charge(state), -3);
  state.paused = false;
  until(state, () => state.operations.length === 0);
  assert.equal(
    containerQuantity(state.materials, brewKettle(station).id, "water"),
    2,
  );
  assert.equal(charge(state), -3);
  for (const promise of promises)
    assert.equal(
      state.materials.lots.find((lot) => lot.id === promise.lot).location
        .container,
      brewKettle(station).id,
    );
  balanced(state);
});

test("actual WASM hydration acquires and draws one field portion, retaining real fractional stock", () => {
  const { state, pail } = fixture();
  state.actors.rowan.needs.hydration = 35;
  until(state, () => state.operations.length > 0);
  assert.equal(state.operations[0].target.kind, "hydration");
  assert.equal(state.operations[0].supply.kind, "field");
  assert.equal(state.operations[0].execution.phase, "acquire");
  until(state, () => state.careOutcomes.length === 1);
  assert.equal(charge(state), -1);
  assert.equal(
    containerQuantity(state.materials, `vessel:${pail}`, "water"),
    0,
  );
  assert(
    pit(state).massKg > 0 && pit(state).massKg % 1 > 1e-8,
    "unrounded physical stock remains",
  );
  for (const source of fieldWaterSources(state))
    assert.equal(source.availableUnits, Math.floor(pit(state).massKg));
  balanced(state);
});

test("actual WASM garden consumes two field portions through the same saved operation and rejects forged field references", () => {
  let { state, pail } = fixture();
  state.herbs.push({
    id: "field-herb",
    kind: "mugwort",
    x: 7,
    z: 7,
    level: 0,
    stage: "planted",
    work: 20,
    establishment: null,
    plantedAt: 0,
  });
  assert.equal(
    tick(state, [{ kind: "water-mugwort", herb: "field-herb" }])[0].status,
    "applied",
  );
  until(state, () => state.operations.length > 0);
  assert.equal(state.operations[0].supply.kind, "field");
  const saved = snapshotFor(state);
  for (const patch of [{ binding: "forged" }, { nodeId: "missing" }]) {
    const bad = structuredClone(saved);
    Object.assign(bad.savedState.operations[0].supply, patch);
    assert.throws(() => restoreSnapshot(bad));
  }
  assert.equal(
    resolveWaterSupply(state, pail, 2, {
      kind: "field",
      ...reference,
      nodeId: "missing",
    }),
    null,
  );
  state = restoreSnapshot(saved).state;
  state.paused = false;
  until(
    state,
    () =>
      state.herbs.find((herb) => herb.id === "field-herb").establishment !==
      null,
  );
  assert.equal(charge(state), -2);
  assert.equal(
    state.materials.sinks
      .filter((s) => s.material === "water")
      .reduce((n, s) => n + s.quantity, 0),
    2,
  );
  assert.equal(state.operations.length, 0);
  assert.equal(state.materials.bindings.length, 0);
  balanced(state);
});
