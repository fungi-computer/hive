import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step } from "./clearing.js";
import { cellKey, blockedCells } from "./world.js";
import { DAY_TICKS } from "./jobs.js";
import { looseWood } from "./resources.js";
import { shelteredBeds } from "./construction.js";
import { createTicker, push } from "./ticker.js";

// Run the exact shipped JS and WASM, without a substitute assignment function.
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

function conserved(state) {
  assert.equal(
    looseWood(state) +
      state.pawn.carry +
      state.sites.reduce((n, s) => n + s.delivered, 0),
    state.felled * 6,
  );
}
function run(state, ticks, commands = new Map()) {
  for (let i = 0; i < ticks; i++) {
    step(state, colony, commands.get(state.tick + 1) || []);
    conserved(state);
    for (const cell of state.pawn.path)
      assert.equal(blockedCells(state).has(cellKey(cell)), false);
  }
  return state;
}
function until(state, predicate, limit = DAY_TICKS * 2) {
  for (let i = 0; i < limit && !predicate(state); i++) run(state, 1);
  assert.ok(
    predicate(state),
    JSON.stringify({ pawn: state.pawn, jobs: state.jobs }),
  );
}
const chop = (tree) => ({ kind: "chop", tree });
const build = (type, x, z, direction = 0) => ({
  kind: "build",
  type,
  x,
  z,
  direction,
});
function homeOrders() {
  const commands = [];
  for (let x = 6; x <= 9; x++)
    for (let z = 5; z <= 8; z++) {
      if (x !== 6 && x !== 9 && z !== 5 && z !== 8) continue;
      commands.push(
        build(
          x === 7 && z === 8 ? "door" : "wall",
          x,
          z,
          x === 6 || x === 9 ? 1 : 0,
        ),
      );
    }
  commands.push(build("bed", 7, 6));
  for (const x of [7, 8])
    for (const z of [6, 7]) commands.push(build("roof", x, z));
  return commands;
}
test("only authorized work runs; a waiting blueprint resumes through real colony hauling and building", () => {
  const state = run(createClearing(), 70);
  assert.equal(state.felled, 0);
  assert.equal(state.assignment, null);
  step(state, colony, [build("wall", 7, 5)]);
  run(state, 40);
  assert.match(state.jobs[0].reason, /wood/);
  assert.equal(state.sites[0].work, 0);
  step(state, colony, [chop("oak-1"), chop("oak-1")]);
  assert.equal(state.jobs.length, 2);
  assert.equal(state.assignment.character, "rowan");
  until(state, (s) => s.pawn.carry > 0);
  assert.equal(state.felled, 1);
  assert.equal(state.sites[0].delivered, 0);
  until(state, (s) => s.sites[0].finishedAt !== null);
  assert.equal(state.sites[0].delivered, 1);
  assert.equal(state.jobs.length, 0);
  run(state, 100);
  assert.equal(state.felled, 1);
  assert.equal(looseWood(state), 5);
});
test("canceling queued, working and carrying orders keeps every wood and permits a fresh order", () => {
  const state = createClearing();
  step(state, colony, [build("door", 7, 5)]);
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  assert.equal(state.sites.length, 0);
  step(state, colony, [chop("oak-1")]);
  until(state, (s) => s.pawn.mode === "chop" && s.trees[0].work > 15);
  const work = state.trees[0].work;
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  run(state, 100);
  assert.equal(state.trees[0].work, work);
  assert.equal(state.felled, 0);
  step(state, colony, [chop("oak-1"), build("door", 7, 5)]);
  until(state, (s) => s.pawn.carry === 2);
  const id = state.jobs[0].id;
  step(state, colony, [
    { kind: "cancel", job: id },
    { kind: "cancel", job: id },
  ]);
  run(state, 120);
  assert.equal(state.pawn.carry, 0);
  assert.equal(looseWood(state), 6);
  assert.equal(state.sites.length, 0);
  assert.equal(state.assignment, null);
  step(state, colony, [build("door", 7, 5)]);
  until(state, (s) => s.pawn.mode === "build" && s.sites[0].work > 8);
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  assert.equal(looseWood(state), 6);
  conserved(state);
  step(state, colony, [build("door", 7, 5)]);
  until(state, (s) => s.jobs.length === 0);
  assert.equal(state.sites[0].delivered, 2);
  assert.equal(looseWood(state), 4);
});
test("reserved walls block work routes; opening a canceled blueprint makes the order eligible again", () => {
  const state = createClearing();
  step(state, colony, [
    build("wall", 2, 4),
    build("wall", 4, 4),
    build("wall", 3, 3),
    build("wall", 3, 5),
    chop("oak-1"),
  ]);
  run(state, 100);
  assert.equal(state.felled, 0);
  assert.equal(state.assignment, null);
  assert.match(state.jobs.at(-1).reason, /route/);
  step(state, colony, [{ kind: "cancel", job: state.jobs[0].id }]);
  until(state, (s) => s.felled === 1);
  conserved(state);
});
test("a player-built room needs delivered wood, a doorway, covered bed cells and an actual sleep visit", () => {
  const state = createClearing();
  step(state, colony, [
    ...homeOrders(),
    chop("oak-1"),
    chop("oak-2"),
    chop("oak-3"),
    chop("oak-4"),
  ]);
  until(state, (s) => s.jobs.length === 0);
  assert.equal(state.sites.length, 17);
  assert.equal(shelteredBeds(state).length, 1);
  assert.equal(state.felled, 4);
  assert.equal(looseWood(state), 5);
  assert.equal(state.demand.kind, "approval");
  // The same covered room with a solid wall in place of its entrance is not a home.
  const sealed = structuredClone(state);
  sealed.sites.find((site) => site.type === "door").type = "wall";
  assert.equal(shelteredBeds(sealed).length, 0);
  step(state, colony, [{ kind: "rest" }, chop("oak-5")]);
  until(state, (s) => s.pawn.mode === "sleep");
  assert.deepEqual([state.pawn.x, state.pawn.z], [7, 6]);
  const rest = state.pawn.rest;
  run(state, 20);
  assert.ok(state.pawn.rest > rest);
  assert.equal(state.felled, 4);
  until(state, (s) => s.rested === 1);
  until(state, (s) => s.felled === 5);
  assert.equal(state.jobs.length, 0);
});
test("pause freezes active cargo and every subsystem; reset restores the seeded clearing", () => {
  const state = createClearing();
  step(state, colony, [build("bed", 7, 6), chop("oak-1")]);
  until(state, (s) => s.pawn.carry > 0);
  state.paused = true;
  const frozen = structuredClone(state);
  run(state, 100);
  assert.deepEqual(state, frozen);
  state.paused = false;
  until(state, (s) => s.jobs.length === 0);
  const reset = createClearing();
  assert.equal(looseWood(reset), 0);
  assert.equal(reset.jobs.length, 0);
  assert.equal(reset.sites.length, 0);
  assert.equal(reset.feed.sequence, 0);
  assert.equal(reset.routine, false);
});
test("fixed-tick command replay preserves resources, cancellation and order priority across render cadences", () => {
  const commands = new Map([
    [2, [build("wall", 7, 5), chop("oak-1"), chop("oak-2")]],
    [40, [{ kind: "next", job: "job-4" }]],
    [60, [{ kind: "cancel", job: "job-2" }]],
    [80, [build("door", 8, 5)]],
  ]);
  function withFrames(frames) {
    const state = createClearing(17),
      clock = createTicker();
    let frame = 0;
    while (state.tick < 1100)
      for (
        let i = 0, n = push(clock, frames[frame++ % frames.length]);
        i < n && state.tick < 1100;
        i++
      )
        run(state, 1, commands);
    return state;
  }
  const first = withFrames([10, 15, 25]);
  assert.deepEqual(first, withFrames([80, 20]));
  const recorded = new Map();
  for (const { tick, ...command } of first.commands) {
    if (!recorded.has(tick)) recorded.set(tick, []);
    recorded.get(tick).push(command);
  }
  assert.deepEqual(first, run(createClearing(17), 1100, recorded));
});

test("the night schedule obeys dawn and disabling it releases its work order", () => {
  const state = createClearing();
  step(state, colony, [
    ...homeOrders(),
    chop("oak-1"),
    chop("oak-2"),
    chop("oak-3"),
    chop("oak-4"),
  ]);
  until(state, (s) => s.jobs.length === 0);
  // Use real elapsed ticks to reach 05:59, not a fabricated sleep/task record.
  until(state, (s) => s.tick % DAY_TICKS === (DAY_TICKS * 22) / 24 - 1);
  step(state, colony, [{ kind: "routine", enabled: true }, chop("oak-5")]);
  assert.equal(
    state.jobs.some((j) => j.routine),
    false,
  );
  until(state, (s) => s.felled === 5);
  until(state, (s) => s.pawn.mode === "sleep");
  step(state, colony, [{ kind: "routine", enabled: false }, chop("oak-6")]);
  assert.equal(
    state.jobs.some((j) => j.routine),
    false,
  );
  assert.notEqual(state.pawn.mode, "sleep");
  until(state, (s) => s.felled === 6);
  step(state, colony, [{ kind: "routine", enabled: true }]);
  until(state, (s) => s.pawn.mode === "sleep");
  const bedtime = state.tick;
  until(state, (s) => s.tick > bedtime && !s.jobs.some((j) => j.routine));
  assert.ok(state.rested > 0);
  assert.notEqual(state.pawn.mode, "sleep");
  conserved(state);
});
