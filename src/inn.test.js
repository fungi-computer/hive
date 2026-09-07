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
  const inn = run(createInn(), 150);
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
      [155, ["prepare"]],
      [240, ["prepare"]],
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

function until(inn, condition, limit = 800) {
  for (let i = 0; i < limit && !condition(inn); i++) step(inn, colony);
  assert.ok(condition(inn), "gameplay condition was not reached");
}

test("two fake guests receive their own bowl and leave satisfied; waiting never auto-serves", () => {
  const inn = createInn();
  for (let order = 1; order <= 2; order++) {
    until(inn, (s) => s.guest?.mode === "waiting");
    const id = inn.guest.id;
    const admitted = inn.feed.sequence;
    run(inn, 350);
    assert.equal(
      inn.feed.sequence,
      admitted,
      "occupied table must hold later arrivals",
    );
    assert.equal(
      inn.served,
      order - 1,
      "waiting must not prepare or deliver automatically",
    );
    step(inn, colony, ["deliver"]);
    assert.equal(inn.served, order - 1, "an empty hand cannot serve");
    step(inn, colony, ["prepare"]);
    until(inn, (s) => s.keeper.carrying);
    assert.equal(inn.guest.id, id);
    assert.equal(inn.guest.mode, "waiting");
    step(inn, colony, ["deliver", "deliver"]);
    until(inn, (s) => s.guest?.mode === "eating");
    assert.equal(inn.served, order);
    assert.equal(inn.keeper.carrying, false);
    assert.equal(inn.guest.carrying, true);
    inn.paused = true;
    const stopped = structuredClone(inn);
    run(inn, 100);
    assert.deepEqual(structuredClone(inn), stopped);
    inn.paused = false;
    until(inn, (s) => s.departed === order);
    assert.equal(inn.satisfied, order);
    assert.equal(inn.prepared, order);
  }
});

test("a recorded full service replays the same fake feed, movement and outcomes", () => {
  const first = createInn();
  until(first, (s) => s.guest?.mode === "waiting");
  step(first, colony, ["prepare"]);
  until(first, (s) => s.keeper.carrying);
  step(first, colony, ["deliver"]);
  until(first, (s) => s.departed === 1);
  const script = new Map(first.commands.map((c) => [c.tick, [c.kind]]));
  const second = run(createInn(), first.tick, script);
  assert.deepEqual(second, first);
  assert.deepEqual(createInn().feed, {
    seed: 42,
    sequence: 0,
    nextAt: 50,
    last: null,
  });
});

test("late-farewell preparation lets the guest wait for the shared corridor", () => {
  const inn = createInn();
  until(inn, (s) => s.guest?.mode === "waiting");
  step(inn, colony, ["prepare"]);
  until(inn, (s) => s.keeper.carrying);
  step(inn, colony, ["deliver"]);
  until(inn, (s) => s.guest?.mode === "eating");
  run(inn, 75);
  assert.equal(inn.guest.mode, "happy");
  step(inn, colony, ["prepare"]);
  assert.equal(
    inn.keeper.mode,
    "walk",
    "the explicit preparation command is respected",
  );
  for (let i = 0; i < 250; i++) {
    step(inn, colony);
    if (inn.guest) {
      const distance = Math.hypot(
        inn.keeper.x - inn.guest.x,
        inn.keeper.z - inn.guest.z,
      );
      assert.ok(
        distance >= 0.9,
        `bodies overlapped at tick ${inn.tick}: ${distance}`,
      );
      assert.ok(
        !(
          inn.keeper.mode === "walk" &&
          ["arriving", "leaving"].includes(inn.guest.mode)
        ),
        "only one body uses the corridor at once",
      );
    }
  }
  assert.equal(inn.departed, 1);
  assert.equal(inn.prepared, 2);
});
