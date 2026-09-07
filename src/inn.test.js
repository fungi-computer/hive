import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createInn, step, route, BLOCKED, HEARTH } from "./inn.js";
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

function run(inn, ticks, commands = new Map()) {
  for (let i = 0; i < ticks; i++)
    step(inn, colony, commands.get(inn.tick + 1) || []);
  return inn;
}

test("Pip waits for a command, then the real libcolony assignment reaches one bowl", () => {
  const inn = run(createInn(), 100);
  assert.deepEqual([inn.keeper.x, inn.keeper.z], [3, 4]);
  assert.equal(inn.prepared, 0);
  step(inn, colony, ["prepare"]);
  assert.equal(inn.assignment.character, "pip");
  assert.equal(inn.assignment.task, "prepare-soup");
  assert.equal(inn.prepared, 0);
  run(
    inn,
    120,
    new Map([
      [105, ["prepare"]],
      [190, ["prepare"]],
    ]),
  );
  assert.equal(inn.prepared, 1);
  assert.equal(inn.keeper.carrying, true);
  assert.deepEqual([inn.keeper.x, inn.keeper.z], [HEARTH.x, HEARTH.z]);
});

test("the route walks adjacent free cells around the dining table", () => {
  const start = { x: 4, z: 5 };
  const path = route(start, HEARTH);
  assert.ok(path.length > 0);
  let previous = start;
  for (const cell of path) {
    assert.equal(BLOCKED.has(`${cell.x},${cell.z}`), false);
    assert.equal(
      Math.abs(cell.x - previous.x) + Math.abs(cell.z - previous.z),
      1,
    );
    previous = cell;
  }
  assert.deepEqual(previous, HEARTH);
});

test("pausing freezes walking and work; reset starts empty", () => {
  const inn = createInn();
  step(inn, colony, ["prepare"]);
  run(inn, 5);
  inn.paused = true;
  const snapshot = structuredClone(inn);
  run(inn, 100);
  assert.deepEqual(structuredClone(inn), snapshot);
  inn.paused = false;
  run(inn, 150);
  assert.equal(inn.prepared, 1);
  assert.equal(createInn().prepared, 0);
  assert.deepEqual(createInn().commands, []);
});

test("recorded command ticks reproduce the same gameplay with different frame cadences", () => {
  const commands = new Map([[7, ["prepare"]]]);
  const first = run(createInn(), 200, commands);
  const second = createInn(),
    clock = createTicker();
  for (let frame = 0; second.tick < 200; frame++) {
    const n = push(clock, [17, 33, 82, 18][frame % 4]);
    for (let i = 0; i < n && second.tick < 200; i++)
      step(second, colony, commands.get(second.tick + 1) || []);
  }
  assert.deepEqual(second, first);
});
