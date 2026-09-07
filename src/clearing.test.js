import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createClearing, step, blockedCells, CHOP_TICKS } from "./clearing.js";
import { cellKey } from "./movement.js";
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

function run(state, ticks, commands = new Map()) {
  for (let i = 0; i < ticks; i++)
    step(state, colony, commands.get(state.tick + 1) || []);
  return state;
}
const chop = (tree) => ({ kind: "chop", tree });

test("the outsider waits; explicit libcolony work changes one tree and earns wood once", () => {
  const state = run(createClearing(), 150);
  assert.equal(state.wood, 0);
  assert.deepEqual([state.pawn.x, state.pawn.z], [3, 4]);
  assert.equal(state.demand.kind, "demand");
  step(state, colony, [chop("oak-1")]);
  assert.equal(state.assignment.character, "rowan");
  assert.equal(state.assignment.task, "chop-oak-1");
  const blocked = blockedCells(state);
  for (const cell of state.pawn.path)
    assert.equal(blocked.has(cellKey(cell)), false);
  run(state, CHOP_TICKS + 100, new Map([[155, [chop("oak-2")]]]));
  assert.equal(state.wood, 6);
  assert.equal(state.felled, 1);
  assert.notEqual(state.trees[0].felledAt, null);
  assert.equal(state.trees[1].felledAt, null);
  run(state, 200, new Map([[state.tick + 1, [chop("oak-1")]]]));
  assert.equal(state.wood, 6);
});

test("pause freezes travel, work, resources and storyteller; reset starts with nothing", () => {
  const state = createClearing();
  step(state, colony, [chop("oak-3")]);
  run(state, 35);
  state.paused = true;
  const frozen = structuredClone(state);
  run(state, 200);
  assert.deepEqual(state, frozen);
  state.paused = false;
  run(state, 200);
  assert.equal(state.wood, 6);
  const reset = createClearing();
  assert.equal(reset.wood, 0);
  assert.equal(reset.felled, 0);
  assert.equal(reset.feed.sequence, 0);
  assert.equal(reset.demand, null);
  assert.equal(reset.pawn.mode, "idle");
  assert.equal(reset.commands.length, 0);
});

test("recorded commands reproduce outcomes under different render frame cadence", () => {
  const commands = new Map([
    [5, [chop("oak-1")]],
    [190, [chop("oak-2")]],
  ]);
  function withFrames(frames) {
    const state = createClearing(17),
      clock = createTicker();
    let frame = 0;
    while (state.tick < 400) {
      const count = push(clock, frames[frame++ % frames.length]);
      for (let i = 0; i < count && state.tick < 400; i++)
        step(state, colony, commands.get(state.tick + 1) || []);
    }
    return state;
  }
  const first = withFrames([10, 15, 25]),
    second = withFrames([80, 20]);
  assert.deepEqual(first, second);
  assert.equal(first.wood, 12);
  const recorded = new Map(
    first.commands.map(({ tick, ...command }) => [tick, [command]]),
  );
  assert.deepEqual(run(createClearing(17), 400, recorded), first);
});

test("shelter placement requires earned wood, clear ground and a reachable site", () => {
  const state = createClearing();
  step(state, colony, [{ kind: "build", x: 2, z: 2 }]);
  assert.equal(state.wood, 0);
  assert.equal(state.shelters.length, 0);
  assert.equal(state.assignment, null);
  step(state, colony, [chop("oak-1")]);
  run(state, 160);
  for (const at of [
    { x: 1, z: 1 },
    { x: 6, z: 4 },
    { x: 2.5, z: 2 },
    { x: state.pawn.x, z: state.pawn.z },
  ]) {
    step(state, colony, [{ kind: "build", ...at }]);
    assert.equal(state.wood, 6);
    assert.equal(state.shelters.length, 0);
  }
  step(state, colony, [{ kind: "build", x: 2, z: 3 }]);
  assert.equal(state.assignment.task, "build-shelter-1");
  assert.equal(state.wood, 0);
  assert.equal(state.shelters.length, 1);
  assert.equal(state.shelters[0].work, 0);
  assert.equal(state.completed, 0);
  const blocked = blockedCells(state);
  for (const cell of state.pawn.path)
    assert.equal(blocked.has(cellKey(cell)), false);
  run(state, 25);
  assert.equal(state.pawn.mode, "build");
  assert.ok(state.shelters[0].work > 0 && state.shelters[0].work < 100);
  assert.equal(state.shelters[0].finishedAt, null);
  state.paused = true;
  const frozen = structuredClone(state);
  run(state, 150);
  assert.deepEqual(state, frozen);
  state.paused = false;
  run(state, 160);
  assert.equal(state.completed, 1);
  assert.equal(state.shelters[0].work, 100);
  assert.notEqual(state.shelters[0].finishedAt, null);
  assert.equal(state.demand.kind, "approval");
  assert.equal(state.feed.sequence, 2);
  step(state, colony, [{ kind: "build", x: 4, z: 3 }]);
  assert.equal(state.wood, 0);
  assert.equal(state.shelters.length, 1);
});

test("two chop/build iterations conserve wood and replay every same-tick command", () => {
  const state = createClearing();
  for (const [tree, x, z] of [
    ["oak-1", 2, 3],
    ["oak-2", 4, 3],
  ]) {
    step(state, colony, [chop(tree)]);
    run(state, 160);
    assert.equal(state.wood, 6);
    step(state, colony, [
      { kind: "build", x, z },
      { kind: "build", x, z },
    ]);
    assert.equal(state.wood, 0);
    run(state, 180);
  }
  assert.equal(state.felled, 2);
  assert.equal(state.completed, 2);
  assert.equal(state.shelters.length, 2);
  assert.equal(state.trees[2].felledAt, null);
  assert.equal(state.feed.sequence, 2);
  const commands = new Map();
  for (const { tick, ...command } of state.commands) {
    if (!commands.has(tick)) commands.set(tick, []);
    commands.get(tick).push(command);
  }
  assert.deepEqual(run(createClearing(), state.tick, commands), state);
});
