import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createClearing, step, advanceTicks } from "./clearing.ts";
import { admitCommand } from "./orders.ts";
import { commandSchema } from "./command-schema.ts";
import {
  serializeClearing,
  parseLiveClearing,
  parseSerializedClearing,
} from "./clearing-state.ts";
import {
  terrainCell,
  terrainFacts,
  terrainGeometry,
  terrainDigProblem,
  terrainColumn,
  terrainWater,
} from "./terrain.ts";
import { structureEnvironment } from "./structure-environment.ts";
import { movement } from "./movement.ts";
import { groundFooting, placementFooting } from "./game-space.ts";
import { STEP_SECONDS } from "./ticker.js";
import { loadOptimizer } from "./engine/colony/loader.ts";
import { createGoblinRegionProgram } from "./world-presets/goblin-region.ts";
import { openRegion } from "./engine/region/index.ts";
import { sqliteTestOwner } from "./engine/region/sqlite-test-owner.mjs";
const colony = await loadOptimizer(
  await WebAssembly.compile(
    await readFile(new URL("./engine/colony/colony.wasm", import.meta.url)),
  ),
);
const dig = (voxel) => ({
  kind: "dig",
  voxel,
  party: "home",
  actors: ["rowan"],
});
const first = [0, 14, 128];
const soil = (state) =>
  state.materials.lots
    .filter((l) => l.material === "soil")
    .reduce((n, l) => n + l.quantity, 0);
function begin() {
  const state = createClearing();
  state.paused = true;
  assert.equal(admitCommand(state, dig(first)).status, "applied");
  state.paused = false;
  return state;
}
function finish(state, limit = 100) {
  for (let i = 0; i < limit && state.jobs.some((j) => j.kind === "dig"); i++)
    step(state, colony);
  assert(!state.jobs.some((j) => j.kind === "dig"));
}

test("main wet: all225 world queries, exact standing datum, finite collar and real structure solidity", () => {
  const state = createClearing();
  let supported = 0;
  for (let x = 0; x < 15; x++)
    for (let z = 0; z < 15; z++)
      supported += Number(terrainCell(state.terrain, x, z).support);
  assert.equal(supported, 213);
  const routes = movement(state).forBody(state.actors.rowan);
  assert.equal(
    routes.standing(placementFooting({ x: 14, z: 0, level: 0 })),
    false,
  );
  assert.equal(
    routes.standing(groundFooting(state.terrain, { x: 14, z: 0 })),
    true,
  );
  assert.equal(
    routes.standing(groundFooting(state.terrain, { x: 7, z: 9 })),
    true,
  );
  assert.deepEqual(terrainCell(state.terrain, 7, 9).voxel, first);
  assert(terrainDigProblem(state.terrain, [-1, 14, 128]));
  assert.equal(terrainDigProblem(state.terrain, first), null);
  const geometry = terrainGeometry(state.terrain);
  const result = structureEnvironment(
    { terrain: geometry, sites: [] },
    { min: [0, 13, 128], max: [1, 17, 129] },
  );
  assert.deepEqual(result.solidCellIds, ["cell:0,13,128", "cell:0,14,128"]);
  assert.equal(result.provenance.frame.y, 15);
  assert.throws(() =>
    structureEnvironment(
      { terrain: geometry, sites: [] },
      { min: [-8, 14, 128], max: [-7, 16, 129] },
    ),
  );
});
test("main wet: paused exact intent changes no physical owner; removed backfill and old dig forms reject", () => {
  const state = createClearing();
  state.paused = true;
  const before = structuredClone(state);
  assert.equal(admitCommand(state, dig(first)).status, "applied");
  assert.deepEqual(state.terrain, before.terrain);
  assert.deepEqual(state.materials, before.materials);
  assert.equal(state.tick, 0);
  step(state, colony);
  assert.equal(state.tick, 0);
  assert.equal(state.terrain.soilState.timeS, 0);
  assert(
    !commandSchema.safeParse({
      kind: "backfill",
      x: 7,
      z: 9,
      level: 0,
      party: "home",
      actors: null,
    }).success,
  );
  assert(
    !commandSchema.safeParse({
      kind: "dig",
      x: 7,
      z: 9,
      level: 0,
      party: "home",
      actors: null,
    }).success,
  );
  assert.deepEqual(
    parseSerializedClearing(serializeClearing(state)).jobs,
    state.jobs,
  );
});
test("main wet: actual pawn work joins one finite soil export, clock and exact mid-work reconstruction", () => {
  const state = begin();
  for (let i = 0; i < 12; i++) step(state, colony);
  const resumed = parseLiveClearing(serializeClearing(state));
  assert.deepEqual(resumed.terrain, state.terrain);
  finish(state);
  finish(resumed);
  assert.deepEqual(serializeClearing(resumed), serializeClearing(state));
  assert.equal(soil(state), 1);
  assert.equal(state.terrain.exports.length, 1);
  assert.equal(state.terrain.world.revision, 1);
  assert(
    Math.abs(state.terrain.soilState.timeS - state.tick * STEP_SECONDS) < 1e-10,
  );
  const budget = terrainFacts(state.terrain).balance;
  assert(Math.abs(budget.residualKg) < 2e-9);
  assert(budget.exportWaterKg > 0);
  assert(budget.pitWaterKg > 0);
  const water = terrainWater(state.terrain);
  assert.equal(water.length, 1);
  assert.equal(water[0].massKg, budget.pitWaterKg);
  assert(Math.abs(water[0].height - (-0.54 + water[0].depthM)) < 1e-12);
  const corrupt = structuredClone(serializeClearing(state));
  corrupt.actors.rowan.x = 7;
  corrupt.actors.rowan.z = 9;
  assert.throws(
    () => parseLiveClearing(corrupt),
    /occupied excavation|standing terrain/,
  );
});
test("main wet: material allocator failure leaves browser tick, water, voxel, actor and job unchanged", () => {
  const state = begin();
  for (let i = 0; i < 90; i++) {
    const actor = state.actors.rowan;
    if (actor.task?.kind === "dig" && actor.work === 39) break;
    step(state, colony);
  }
  assert.equal(state.actors.rowan.work, 39);
  state.materials.nextLotId = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(state);
  assert.throws(() => step(state, colony), /soil admission failed/);
  assert.deepEqual(state, before);
});
test("main wet: actual Region receipt replays admitted intent; failed transaction commits no candidate", (t) => {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  let fail = false;
  const owner = sqliteTestOwner(db, (statement) => {
    if (fail && statement.startsWith("INSERT INTO hive_region_receipts"))
      throw Error("receipt-fault");
  });
  const open = () =>
    openRegion({
      owner,
      region: "main-wet-law",
      program: createGoblinRegionProgram(colony),
    });
  const region = open();
  const input = {
    id: "dig",
    expectedRevision: 0,
    command: { kind: "order", command: dig(first) },
  };
  const receipt = region.dispatch("goblin-player", input);
  assert.equal(receipt.status, "applied");
  assert.deepEqual(open().dispatch("goblin-player", input), receipt);
  region.dispatch("goblin-player", {
    id: "run",
    expectedRevision: 1,
    command: { kind: "set-paused", paused: false },
  });
  const before = region.readCommitted();
  fail = true;
  assert.throws(
    () =>
      region.dispatch("goblin-host", {
        id: "work",
        expectedRevision: 2,
        command: { kind: "advance", ticks: 60 },
      }),
    /receipt-fault/,
  );
  assert.deepEqual(open().readCommitted(), before);
  fail = false;
  const command = {
    id: "work",
    expectedRevision: 2,
    command: { kind: "advance", ticks: 60 },
  };
  const worked = region.dispatch("goblin-host", command);
  const after = region.readCommitted();
  assert.equal(soil(after.state.clearing), 1);
  assert.deepEqual(open().dispatch("goblin-host", command), worked);
  assert.deepEqual(open().readCommitted(), after);
});

test("main wet: bounded batch equals individual ticks and preserves paused intent", () => {
  const individual = begin(),
    batched = parseLiveClearing(serializeClearing(individual));
  for (let i = 0; i < 14; i++) step(individual, colony);
  advanceTicks(batched, colony, 14);
  assert.deepEqual(serializeClearing(batched), serializeClearing(individual));
  batched.paused = true;
  const frozen = serializeClearing(batched);
  advanceTicks(batched, colony, 120);
  assert.deepEqual(serializeClearing(batched), frozen);
  for (const invalid of [0, 121, -1, 1.5])
    assert.throws(
      () => advanceTicks(batched, colony, invalid),
      /invalid-tick-batch/,
    );
});
test("main wet: adjacent pawn cuts and deeper soil-to-stone keep exact finite water/spoil budget", () => {
  const state = begin();
  finish(state);
  for (const voxel of [
    [1, 14, 128],
    [0, 13, 128],
  ]) {
    assert.equal(admitCommand(state, dig(voxel)).status, "applied");
    finish(state);
  }
  assert.equal(soil(state), 3);
  assert.equal(state.terrain.exports.length, 3);
  assert.deepEqual(terrainCell(state.terrain, 7, 9).voxel, [0, 12, 128]);
  const before = serializeClearing(state);
  assert.equal(admitCommand(state, dig([0, 12, 128])).status, "rejected");
  assert.deepEqual(serializeClearing(state), before);
  const facts = terrainFacts(state.terrain);
  assert(Math.abs(facts.balance.residualKg) < 2e-9);
  assert.equal(terrainWater(state.terrain).length, 2);
  assert.deepEqual(serializeClearing(parseLiveClearing(before)), before);
});
